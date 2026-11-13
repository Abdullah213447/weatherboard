import { AppShell } from '@/app/AppShell';
import { DashboardGrid } from '@/app/DashboardGrid';
import { Panel } from '@/app/Panel';
import { ThemeControl } from '@/features/prefs/ThemeControl';
import { SearchPlaceholder } from '@/features/search/SearchPlaceholder';
import { FirstRunEmptyState } from '@/features/weather/FirstRunEmptyState';
import { safeStorage } from '@/lib/safeStorage';
import { InlineAlert } from '@/ui/InlineAlert';

export function App() {
  return (
    <AppShell
      search={<SearchPlaceholder />}
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
              <FirstRunEmptyState />
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
