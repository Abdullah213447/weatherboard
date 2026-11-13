import { useSyncExternalStore } from 'react';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { AddToHomeScreenSteps } from './AddToHomeScreenSteps';
import { install } from './installStore';

/**
 * A quiet way in to installing the app: a small card in the bottom corner.
 *
 * It overlays rather than sitting in the page, because the browser only says
 * the app is installable a moment after load, and anything inserted into the
 * layout then would push content around. Not a dialog: it takes no focus and
 * blocks nothing. It appears only where installing is possible, can be
 * dismissed for good, and is absent once the app is installed.
 */
export function InstallPrompt() {
  const state = useSyncExternalStore(install.subscribe, install.getState);
  if (state.kind === 'hidden') return null;

  return (
    <aside
      aria-label="Install WeatherBoard"
      data-testid="install-prompt"
      className="border-line-strong bg-raised text-ink shadow-raised animate-fade-in fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-30 rounded-lg border p-4 sm:left-auto sm:w-80"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-medium">Install WeatherBoard</h2>
        <IconButton
          label="Dismiss"
          icon="close"
          onClick={install.dismiss}
          className="-mt-2.5 -mr-2.5"
        />
      </div>
      {state.kind === 'prompt' ? (
        <>
          <p className="text-muted text-sm">
            Open it from your home screen or dock, and see the last city you viewed with no
            connection.
          </p>
          <Button
            variant="primary"
            size="sm"
            className="mt-3"
            onClick={() => {
              void install.promptInstall();
            }}
          >
            Install app
          </Button>
        </>
      ) : (
        <AddToHomeScreenSteps />
      )}
    </aside>
  );
}
