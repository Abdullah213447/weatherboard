import { Icon } from '@/ui/Icon';

/**
 * Holds the search slot in the header until the autocomplete lands.
 * Disabled rather than fake: nothing here pretends to work.
 */
export function SearchPlaceholder() {
  return (
    <label className="relative block">
      <span className="sr-only">Search for a city (not available yet)</span>
      <Icon
        name="search"
        size={18}
        className="text-subtle pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
      />
      <input
        type="search"
        disabled
        placeholder="Search for a city"
        className="border-control bg-surface placeholder:text-subtle h-11 w-full rounded-md border pr-3 pl-10 text-base disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}
