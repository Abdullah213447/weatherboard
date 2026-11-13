const SUGGESTED_CITIES = ['Karachi', 'Lahore', 'London', 'New York', 'Tokyo'] as const;

type FirstRunEmptyStateProps = {
  /** Called with a city name. Until search exists the chips are disabled. */
  onSelect?: (cityName: string) => void;
};

/** What a new visitor sees: one sentence and a few ways to start. */
export function FirstRunEmptyState({ onSelect }: FirstRunEmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-5 py-6 md:py-10">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Find a city to see its weather.</h2>
        <p className="text-muted text-sm">Search above, or start with one of these.</p>
      </div>
      <ul aria-label="Suggested cities" className="flex flex-wrap gap-2">
        {SUGGESTED_CITIES.map((city) => (
          <li key={city}>
            <button
              type="button"
              disabled={!onSelect}
              onClick={() => onSelect?.(city)}
              className="border-line-strong bg-surface text-ink hover:bg-hover inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 pointer-coarse:h-11"
            >
              {city}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
