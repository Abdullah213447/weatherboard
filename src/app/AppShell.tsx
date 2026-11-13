import type { ReactNode } from 'react';

type AppShellProps = {
  /** The city search field. */
  search: ReactNode;
  /** Small indicators such as data freshness or connection state. */
  status?: ReactNode;
  /** The settings button. */
  settings: ReactNode;
  /** Page-level notices: offline mode, storage unavailable. */
  banner?: ReactNode;
  children: ReactNode;
};

const container = 'mx-auto w-full max-w-[80rem] px-4 md:px-6';

const linkClass =
  'text-muted hover:text-ink underline underline-offset-2 inline-flex min-h-11 items-center compact:inline compact:min-h-0';

/** Page frame: header with slots, a banner row, the main area and the attribution footer. */
export function AppShell({ search, status, settings, banner, children }: AppShellProps) {
  return (
    <div className="bg-canvas text-ink flex min-h-dvh flex-col">
      <a
        href="#main"
        className="bg-accent text-on-accent sr-only rounded-md text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-10 focus:px-4 focus:py-3"
      >
        Skip to content
      </a>

      <header className="border-line bg-surface border-b">
        <div
          className={`${container} grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 py-3 md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:gap-x-6`}
        >
          <h1 className="col-start-1 row-start-1 flex items-center gap-2 text-base font-semibold tracking-tight">
            <span aria-hidden="true" className="bg-ink size-2.5 rounded-full" />
            WeatherBoard
          </h1>
          <div className="col-span-2 row-start-2 md:col-span-1 md:col-start-2 md:row-start-1 md:max-w-md">
            {search}
          </div>
          {/* Its own row on a phone, where the header has no room beside the wordmark. */}
          {status !== undefined && status !== null && status !== false && (
            <div className="col-span-2 row-start-3 min-w-0 md:col-span-1 md:col-start-3 md:row-start-1">
              {status}
            </div>
          )}
          <div className="col-start-2 row-start-1 justify-self-end md:col-start-4">{settings}</div>
        </div>
      </header>

      {banner !== undefined && banner !== null && banner !== false && (
        <div className={`${container} flex flex-col gap-2 pt-4`}>{banner}</div>
      )}

      <main id="main" tabIndex={-1} className={`${container} flex-1 py-4 outline-none md:py-6`}>
        {children}
      </main>

      <footer className="border-line border-t">
        <p className={`${container} text-subtle py-4 text-xs`}>
          Weather data by{' '}
          <a className={linkClass} href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Open-Meteo
          </a>{' '}
          (CC BY 4.0) and{' '}
          <a
            className={linkClass}
            href="https://openweathermap.org/"
            target="_blank"
            rel="noreferrer"
          >
            OpenWeatherMap
          </a>
          . City search by{' '}
          <a
            className={linkClass}
            href="https://rapidapi.com/wirefreethought/api/geodb-cities"
            target="_blank"
            rel="noreferrer"
          >
            GeoDB Cities
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
