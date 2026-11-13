/**
 * App-wide announcements for screen readers: the result of an action that is
 * otherwise only visible, such as "Lahore saved. 3 of 5 favourites."
 * <Announcer /> is rendered once; announce() can be called from anywhere.
 */

const NO_BREAK_SPACE = String.fromCharCode(160);

let message = '';
const listeners = new Set<() => void>();

export function announce(next: string): void {
  // Saying the same thing twice must still be announced, so vary it invisibly.
  message = next === message ? `${next}${NO_BREAK_SPACE}` : next;
  for (const listener of listeners) listener();
}

export function subscribeToAnnouncements(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function currentAnnouncement(): string {
  return message;
}

/** For tests: start each one with nothing announced. */
export function resetAnnouncerForTests(): void {
  message = '';
}
