import { skyTintKey, type Condition } from '@/domain/weather';

export type SkyScope = {
  /**
   * Set on the card as `data-theme`. Night conditions force the dark scope, so
   * the card is a deep-toned island with light text even on a light page.
   * Undefined means "inherit the page theme".
   */
  theme: 'dark' | undefined;
  /** CSS value for the card background. The colours live in tokens.css. */
  background: string;
};

export function skyScope(condition: Condition): SkyScope {
  return {
    theme: condition.isDay ? undefined : 'dark',
    background: `var(--wb-sky-${skyTintKey(condition)})`,
  };
}
