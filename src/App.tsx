import { useRef } from 'react';
import { AppShell } from '@/app/AppShell';
import { DashboardGrid } from '@/app/DashboardGrid';
import { Panel } from '@/app/Panel';
import { selectCity, useSelectedCity } from '@/features/city/selectedCity';
import { ThemeControl } from '@/features/prefs/ThemeControl';
import { CitySearch, type CitySearchHandle } from '@/features/search/CitySearch';
import { FirstRunEmptyState } from '@/features/weather/FirstRunEmptyState';
import { cityContext } from '@/domain/cities';
import { safeStorage } from '@/lib/safeStorage';
import { InlineAlert } from '@/ui/InlineAlert';

export function App() {
  const city = useSelectedCity();
  const searchRef = useRef<CitySearchHandle>(null);

  return (
    <AppShell
      search={<CitySearch ref={searchRef} onSelect={selectCity} />}
      themeControl={<ThemeControl />}
      banner={
        !safeStorage.isPersistent && (
          <InlineAlert tone="info" title="Your choices will not be saved in this browser">
            Storage is blocked, often by private browsing or a privacy setting. Everything works,
            but your theme and favourites reset when you close this tab.
          </InlineAlert>
        )
      }
    >
      <DashboardGrid
        primary={{
          empty: (
            <Panel className="h-full">
              {city ? (
                // Stands in for the conditions card and forecast, which are the next step.
                <div className="flex flex-col gap-1 py-6 md:py-10">
                  <h2 className="text-xl font-semibold">{city.name}</h2>
                  <p className="text-muted text-sm">{cityContext(city)}</p>
                </div>
              ) : (
                <FirstRunEmptyState onSelect={(name) => searchRef.current?.searchFor(name)} />
              )}
            </Panel>
          ),
        }}
        secondary={
          <>
            <Panel title="Favourites">
              <p className="text-sm">No favourites yet.</p>
              <p className="text-muted text-sm">Star a city to keep it one tap away.</p>
            </Panel>
            <Panel title="Daily reminder">
              <p className="text-sm">Not set up yet.</p>
              <p className="text-muted text-sm">
                A morning notification at a time you choose, even with the app closed.
              </p>
            </Panel>
          </>
        }
      />
    </AppShell>
  );
}
