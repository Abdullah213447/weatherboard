import { useSyncExternalStore } from 'react';
import { connectivity } from './connectivity';

/** Whether the app can reach the network, from the single connectivity source. */
export function useOnline(): boolean {
  return useSyncExternalStore(connectivity.subscribe, connectivity.isOnline);
}
