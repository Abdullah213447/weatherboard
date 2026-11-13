import type { ReactNode } from 'react';

type DashboardGridProps = {
  /** Current conditions and forecast, or a single element spanning both when there is no city. */
  primary: { current: ReactNode; forecast: ReactNode } | { empty: ReactNode };
  /** Quick access: the favourites panel. First on a phone, top of the side column otherwise. */
  quick: ReactNode;
  /** Everything else for the side column, such as reminders. */
  secondary: ReactNode;
};

/**
 * 375: one column: quick access, then current conditions, forecast, secondary.
 * 768: two columns: primary on the left; quick access and secondary on the right.
 * 1280: twelve columns: current (5), forecast (4), then a side column (3).
 *
 * Every cell has min-w-0: a grid cell otherwise refuses to be narrower than
 * its longest unbreakable content, and one long city name widens the page.
 */
export function DashboardGrid({ primary, quick, secondary }: DashboardGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:gap-5 xl:grid-cols-12 xl:gap-6">
      <div className="min-w-0 md:col-start-2 md:row-start-1 xl:col-span-3 xl:col-start-10">
        {quick}
      </div>
      {'empty' in primary ? (
        <div className="min-w-0 md:col-start-1 md:row-span-2 md:row-start-1 xl:col-span-9">
          {primary.empty}
        </div>
      ) : (
        <>
          <div className="min-w-0 md:col-start-1 md:row-start-1 xl:col-span-5 xl:row-span-2">
            {primary.current}
          </div>
          <div className="min-w-0 md:col-start-1 md:row-start-2 xl:col-span-4 xl:col-start-6 xl:row-span-2 xl:row-start-1">
            {primary.forecast}
          </div>
        </>
      )}
      <aside
        aria-label="Reminders"
        className="flex min-w-0 flex-col gap-4 md:col-start-2 md:row-start-2 md:gap-5 xl:col-span-3 xl:col-start-10 xl:gap-6"
      >
        {secondary}
      </aside>
    </div>
  );
}
