import { z } from 'zod';
import { isValidTimeZone, parseTime } from '../../src/domain/reminderTime.js';
import { isAllowedPushEndpoint } from './allowlist.js';

/** URL-safe base64, as browsers produce for push keys. */
const base64url = z.string().regex(/^[A-Za-z0-9_-]+$/);

export const NOT_ALLOWED = 'endpoint_not_allowed';

const endpoint = z.string().max(2048).refine(isAllowedPushEndpoint, { message: NOT_ALLOWED });

const subscription = z.object({
  endpoint,
  keys: z.object({ p256dh: base64url.min(40).max(200), auth: base64url.min(8).max(100) }),
});

export const subscribeBody = z.object({
  subscription,
  /** Local time of day, HH:mm. */
  time: z
    .string()
    .refine((value) => parseTime(value) !== null, { message: 'Use HH:mm, 00:00 to 23:59.' }),
  /** IANA name, for example Asia/Karachi. */
  timeZone: z.string().max(64).refine(isValidTimeZone, { message: 'Not a known time zone.' }),
  city: z.object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(80),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  }),
  unit: z.enum(['metric', 'imperial']),
  /** The endpoint this subscription replaces, when the browser has rotated it. */
  replaces: endpoint.optional(),
});

/** Unsubscribe and test-send identify the subscription by its endpoint alone. */
export const endpointBody = z.object({ endpoint });

export type SubscribeBody = z.infer<typeof subscribeBody>;

/** A reminder as stored. The id is a hash of the endpoint, never the endpoint itself. */
export const reminderRecord = subscribeBody.omit({ replaces: true }).extend({ id: z.string() });
export type ReminderRecord = z.infer<typeof reminderRecord>;
