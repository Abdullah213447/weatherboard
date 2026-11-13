import { useMemo, useRef } from 'react';
import { AppShell } from '@/app/AppShell';
import { DashboardGrid } from '@/app/DashboardGrid';
import { Panel } from '@/app/Panel';
import { useRecentCities } from '@/features/city/recentCities';
import { FavouritesPanel } from '@/features/favourites/FavouritesPanel';
import { useFavourites } from '@/features/favourites/favouritesStore';
import { selectCity, useSelectedCity } from '@/features/city/selectedCity';
import { ThemeMenu } from '@/features/prefs/ThemeMenu';
import { CitySearch, type CitySearchHandle, type KnownCity } from '@/features/search/CitySearch';
import { FirstRunEmptyState } from '@/features/weather/FirstRunEmptyState';
import { useWeatherView } from '@/features/weather/useWeatherView';
import { safeStorage } from '@/lib/safeStorage';
import { InlineAlert } from '@/ui/InlineAlert';
import { Announcer } from '@/ui/Announcer';
import { LiveRegion } from '@/ui/LiveRegion';

export function App() {
  const city = useSelectedCity();
  const weather = useWeatherView(city);
  const searchRef = useRef<CitySearchHandle>(null);
  const recent = useRecentCities();
  const favourites = useFavourites();
  // Offered by search before any request returns: favourites first, then other recent cities.
  const known = useMemo<KnownCity[]>(() => {
    const saved = new Set(favourites.cities.map((entry) => entry.id));
    return [
      ...favourites.cities.map((entry): KnownCity => ({ city: entry, label: 'Favourite' })),
      ...recent
        .filter((entry) => !saved.has(entry.id))
        .map((entry): KnownCity => ({ city: entry, label: 'Recent' })),
    ];
  }, [favourites.cities, recent]);

  return (
    <AppShell
      search={<CitySearch ref={searchRef} onSelect={selectCity} known={known} />}
      status={weather.status}
      settings={<ThemeMenu />}
      banner={
        // Storage is blocked altogether, or the last attempt to save favourites failed.
        (!safeStorage.isPersistent || !favourites.saved) && (
          <InlineAlert tone="info" title="Your choices will not be saved in this browser">
            This browser is not letting the app save, often because of private browsing, a privacy
            setting or full storage. Everything works, but your favourites and settings reset when
            you close this tab.
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
        quick={<FavouritesPanel currentCityId={city?.id ?? null} onSelect={selectCity} />}
        secondary={
          <>
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
      <Announcer />
    </AppShell>
  );
}
