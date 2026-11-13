import { skyTintKey, type Condition } from '@/domain/weather';

/**
 * CSS value for the sky tint behind the current-conditions card.
 * The colours live in tokens.css, one per condition and time of day.
 */
export function skyTintVar(condition: Condition): string {
  return `var(--wb-sky-${skyTintKey(condition)})`;
}
