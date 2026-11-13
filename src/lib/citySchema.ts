import { z } from 'zod';
import type { City } from '@/domain/weather';

const schema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  region: z.string().optional(),
  country: z.string(),
  countryCode: z.string(),
  coords: z.object({ lat: z.number(), lon: z.number() }),
});

/** A city read back from storage, or null if it is not one. Stored data is never trusted. */
export function parseCity(value: unknown): City | null {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return null;
  const { id, name, region, country, countryCode, coords } = parsed.data;
  // Rebuilt in one fixed order, so reading and writing back produces identical text.
  return { id, name, ...(region !== undefined && { region }), country, countryCode, coords };
}
