import type { ReactNode } from 'react';

type DashboardGridProps = {
  /** Current conditions and forecast, or a single element spanning both when there is no city. */
  primary: { current: ReactNode; forecast: ReactNode } | { empty: ReactNode };
  /** Favourites and reminders. */
  secondary: ReactNode;
};

/**
 * 375: one column, primary content first.
 * 768: two columns, primary on the left and secondary on the right.
 * 1280: a 12-column grid, current (5) + forecast (4) + secondary (3).
 */
export function DashboardGrid({ primary, secondary }: DashboardGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:gap-5 xl:grid-cols-12 xl:gap-6">
      {'empty' in primary ? (
        <div className="md:row-span-2 xl:col-span-9 xl:row-span-1">{primary.empty}</div>
      ) : (
        <>
          <div className="md:col-start-1 xl:col-span-5">{primary.current}</div>
          <div className="md:col-start-1 xl:col-span-4">{primary.forecast}</div>
        </>
      )}
      <aside
        aria-label="Favourites and reminders"
        className="flex flex-col gap-4 md:col-start-2 md:row-span-2 md:row-start-1 md:gap-5 xl:col-span-3 xl:row-span-1 xl:gap-6"
      >
        {secondary}
      </aside>
    </div>
  );
}
