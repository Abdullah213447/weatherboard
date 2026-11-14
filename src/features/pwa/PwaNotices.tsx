import { useEffect, useSyncExternalStore } from 'react';
import { Icon } from '@/ui/Icon';
import { InlineAlert } from '@/ui/InlineAlert';
import { pwa } from './pwaStore';

const OFFLINE_READY_VISIBLE_MS = 8000;

/**
 * A new version is waiting. It never takes over by itself: switching code
 * mid-session could mix old and new. The user chooses Reload or Later.
 * Rendered in the page's banner row.
 */
export function UpdateNotice() {
  const { updateReady } = useSyncExternalStore(pwa.subscribe, pwa.getState);
  if (!updateReady) return null;
  return (
    <InlineAlert
      tone="info"
      title="A new version of WeatherBoard is ready"
      action={{ label: 'Reload', onClick: pwa.applyUpdate }}
      secondaryAction={{ label: 'Later', onClick: pwa.dismissUpdate }}
    >
      Reload to switch to it. Nothing you have saved is affected.
    </InlineAlert>
  );
}

/**
 * Said once, when the shell has been cached for the first time. A toast that
 * floats over the page and leaves by itself: it must not move the weather
 * while it is on screen, so it is rendered outside the page flow.
 */
export function OfflineReadyToast() {
  const { offlineReady } = useSyncExternalStore(pwa.subscribe, pwa.getState);

  useEffect(() => {
    if (!offlineReady) return;
    const timer = setTimeout(pwa.dismissOfflineReady, OFFLINE_READY_VISIBLE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [offlineReady]);

  if (!offlineReady) return null;
  return (
    <div
      role="status"
      data-testid="offline-ready"
      className="border-line-strong bg-raised text-ink shadow-raised animate-fade-in fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-30 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 text-sm"
    >
      <Icon name="success" size={16} className="text-success shrink-0" />
      Ready to use offline
    </div>
  );
}
