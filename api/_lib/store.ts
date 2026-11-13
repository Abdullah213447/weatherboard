import type { Redis } from '@upstash/redis';
import { reminderRecord, type ReminderRecord } from './schemas.js';

/** Subscriptions are forgotten after this long unless the app renews them by being opened. */
export const RECORD_TTL_SECONDS = 90 * 24 * 60 * 60;
/** A ceiling on stored subscriptions, so the free tier cannot be filled by abuse. */
export const MAX_SUBSCRIPTIONS = 500;

/**
 * Where reminders live. Two things per subscription: its record (with an
 * expiry), and an entry in one sorted set whose score is the instant, in UTC
 * milliseconds, at which it next fires. "What is due?" is then a range query.
 */
export type ReminderStore = {
  /** Creates or replaces a record and schedules it. `full` when the cap is reached. */
  put(record: ReminderRecord, nextAt: number): Promise<'created' | 'updated' | 'full'>;
  get(id: string): Promise<ReminderRecord | null>;
  /** Removes the record and its schedule entry. */
  remove(id: string): Promise<void>;
  /** Scheduled ids with a fire time at or before `now`, oldest first. */
  due(now: number, limit: number): Promise<{ id: string; scheduledFor: number }[]>;
  /**
   * Moves an id to its next fire time, only if that is later than where it is
   * now. Returns true for the caller that made the move. Two runs that both
   * saw the same id due will both try; exactly one gets true, so exactly one sends.
   */
  claim(id: string, nextAt: number): Promise<boolean>;
  /** True while the caller is within `limit` requests per `windowSeconds`. */
  allow(key: string, limit: number, windowSeconds: number): Promise<boolean>;
};

const SCHEDULE = 'wb:reminders:schedule';
const recordKey = (id: string) => `wb:reminders:sub:${id}`;

export function createRedisStore(redis: Redis): ReminderStore {
  return {
    async put(record, nextAt) {
      const exists = (await redis.exists(recordKey(record.id))) === 1;
      if (!exists && (await redis.zcard(SCHEDULE)) >= MAX_SUBSCRIPTIONS) return 'full';
      await redis.set(recordKey(record.id), JSON.stringify(record), { ex: RECORD_TTL_SECONDS });
      await redis.zadd(SCHEDULE, { score: nextAt, member: record.id });
      return exists ? 'updated' : 'created';
    },

    async get(id) {
      // The client parses JSON values on the way out; accept either form.
      const raw = await redis.get<unknown>(recordKey(id));
      if (raw === null) return null;
      const parsed = reminderRecord.safeParse(typeof raw === 'string' ? JSON.parse(raw) : raw);
      return parsed.success ? parsed.data : null;
    },

    async remove(id) {
      await redis.del(recordKey(id));
      await redis.zrem(SCHEDULE, id);
    },

    async due(now, limit) {
      const flat = await redis.zrange<(string | number)[]>(SCHEDULE, 0, now, {
        byScore: true,
        withScores: true,
        offset: 0,
        count: limit,
      });
      const result: { id: string; scheduledFor: number }[] = [];
      for (let index = 0; index + 1 < flat.length; index += 2) {
        result.push({ id: String(flat[index]), scheduledFor: Number(flat[index + 1]) });
      }
      return result;
    },

    async claim(id, nextAt) {
      // XX: only if still scheduled. GT: only forwards. CH: report whether it changed.
      const changed = await redis.zadd(
        SCHEDULE,
        { xx: true, gt: true, ch: true },
        { score: nextAt, member: id },
      );
      return changed === 1;
    },

    async allow(key, limit, windowSeconds) {
      const name = `wb:reminders:rate:${key}`;
      const count = await redis.incr(name);
      if (count === 1) await redis.expire(name, windowSeconds);
      return count <= limit;
    },
  };
}
