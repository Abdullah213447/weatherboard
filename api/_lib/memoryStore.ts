import type { ReminderRecord } from './schemas.js';
import { MAX_SUBSCRIPTIONS, type ReminderStore } from './store.js';

/**
 * A stand-in for Redis with the same semantics, for tests: records that can
 * be made to expire, a schedule ordered by score, and a claim that only moves
 * forwards.
 */
export function createMemoryStore(max = MAX_SUBSCRIPTIONS) {
  const records = new Map<string, ReminderRecord>();
  const schedule = new Map<string, number>();
  const rates = new Map<string, number>();

  const store: ReminderStore = {
    put(record, nextAt) {
      const exists = records.has(record.id);
      if (!exists && schedule.size >= max) return Promise.resolve('full');
      records.set(record.id, record);
      schedule.set(record.id, nextAt);
      return Promise.resolve(exists ? 'updated' : 'created');
    },
    get: (id) => Promise.resolve(records.get(id) ?? null),
    remove(id) {
      records.delete(id);
      schedule.delete(id);
      return Promise.resolve();
    },
    due(now, limit) {
      const due = [...schedule.entries()]
        .filter(([, score]) => score <= now)
        .sort((a, b) => a[1] - b[1])
        .slice(0, limit)
        .map(([id, scheduledFor]) => ({ id, scheduledFor }));
      return Promise.resolve(due);
    },
    claim(id, nextAt) {
      const current = schedule.get(id);
      if (current === undefined || nextAt <= current) return Promise.resolve(false);
      schedule.set(id, nextAt);
      return Promise.resolve(true);
    },
    allow(key, limit) {
      const count = (rates.get(key) ?? 0) + 1;
      rates.set(key, count);
      return Promise.resolve(count <= limit);
    },
  };

  return {
    store,
    /** What the schedule holds, for assertions. */
    scheduledFor: (id: string) => schedule.get(id),
    has: (id: string) => records.has(id),
    scheduled: () => [...schedule.keys()],
    /** Simulates the record's 90-day expiry: the record goes, its schedule entry stays. */
    expireRecord: (id: string) => {
      records.delete(id);
    },
  };
}
