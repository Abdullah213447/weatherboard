import { z } from 'zod';
import { AppError, type AppErrorSource } from '@/domain/errors';

/**
 * Only the fields the app reads are described. Providers add fields freely;
 * they may not remove or retype the ones below without this failing loudly.
 */

const owmCondition = z.object({ id: z.number(), icon: z.string() });

export const owmCurrentSchema = z.object({
  weather: z.array(owmCondition).min(1),
  main: z.object({ temp: z.number(), feels_like: z.number(), humidity: z.number() }),
  wind: z.object({ speed: z.number(), deg: z.number().optional() }),
  /** Observation time, epoch seconds. */
  dt: z.number(),
  /** Offset from UTC in seconds. */
  timezone: z.number(),
});

export const owmForecastSchema = z.object({
  list: z
    .array(
      z.object({
        dt: z.number(),
        main: z.object({ temp: z.number() }),
        weather: z.array(owmCondition).min(1),
        /** Probability of precipitation, 0 to 1. */
        pop: z.number().optional(),
        sys: z.object({ pod: z.enum(['d', 'n']) }),
      }),
    )
    .min(1),
  city: z.object({ timezone: z.number() }),
});

export const openMeteoSchema = z.object({
  utc_offset_seconds: z.number(),
  current: z.object({
    time: z.number(),
    temperature_2m: z.number(),
    apparent_temperature: z.number(),
    relative_humidity_2m: z.number(),
    weather_code: z.number(),
    wind_speed_10m: z.number(),
    wind_direction_10m: z.number().optional(),
    is_day: z.number(),
  }),
  daily: z.object({
    time: z.array(z.number()),
    weather_code: z.array(z.number()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    precipitation_probability_max: z.array(z.number().nullable()).optional(),
  }),
});

export type OwmCurrent = z.infer<typeof owmCurrentSchema>;
export type OwmForecast = z.infer<typeof owmForecastSchema>;
export type OpenMeteoForecast = z.infer<typeof openMeteoSchema>;

/** Validates a provider body. A mismatch is a `bad-response` from that provider. */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown, source: AppErrorSource): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const detail = result.error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  throw new AppError('bad-response', source, { detail, cause: result.error });
}
