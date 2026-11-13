import { useSyncExternalStore } from 'react';
import { currentAnnouncement, subscribeToAnnouncements } from './announce';
import { LiveRegion } from './LiveRegion';

/** The live region behind announce(). Render it once, near the root. */
export function Announcer() {
  return (
    <LiveRegion message={useSyncExternalStore(subscribeToAnnouncements, currentAnnouncement)} />
  );
}
