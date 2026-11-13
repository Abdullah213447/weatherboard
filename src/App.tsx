import { useMemo, useRef } from 'react';
import { AppShell } from '@/app/AppShell';
import { DashboardGrid } from '@/app/DashboardGrid';
import { Panel } from '@/app/Panel';
import { useRecentCities } from '@/features/city/recentCities';
import { selectCity, useSelectedCity } from '@/features/city/selectedCity';
import { SettingsMenu } from '@/features/prefs/SettingsMenu';
import { CitySearch, type CitySearchHandle, type KnownCity } from '@/features/search/CitySearch';
import { FirstRunEmptyState } from '@/features/weather/FirstRunEmptyState';
import { useWeatherView } from '@/features/weather/useWeatherView';
import { safeStorage } from '@/lib/safeStorage';
import { InlineAlert } from '@/ui/InlineAlert';
import { LiveRegion } from '@/ui/LiveRegion';

export function App() {
  const city = useSelectedCity();
  const weather = useWeatherView(city);
  const searchRef = useRef<CitySearchHandle>(null);
  const recent = useRecentCities();
  // Favourites join this list when that feature lands.
  const known = useMemo<KnownCity[]>(
    () => recent.map((entry) => ({ city: entry, label: 'Recent' })),
    [recent],
  );

  return (
    <AppShell
      search={<CitySearch ref={searchRef} onSelect={selectCity} known={known} />}
      status={weather.status}
      settings={<SettingsMenu />}
      banner={
        !safeStorage.isPersistent && (
          <InlineAlert tone="info" title="Your choices will not be saved in this browser">
            Storage is blocked, often by private browsing or a privacy setting. Everything works,
            but your settings and favourites reset when you close this tab.
          </InlineAlert>
        )
      }
    >
      <DashboardGrid
        primary={
          weather.primary ?? {
            empty: (
              <Panel className="h-full">
                <FirstRunEmptyState onSelect={(name) => searchRef.current?.searchFor(name)} />
              </Panel>
            ),
          }
        }
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
      <LiveRegion message={weather.announcement} />
    </AppShell>
  );
}
