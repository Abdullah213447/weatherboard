import { useId, useState, type ReactNode } from 'react';
import type { City } from '@/domain/weather';
import { announce } from '@/ui/announce';
import { IconButton } from '@/ui/IconButton';
import {
  favouritesStore,
  MAX_FAVOURITES,
  useFavourites,
  type FavouritesStore,
} from './favouritesStore';
import { RemoveFavouriteDialog } from './RemoveFavouriteDialog';

export const LIMIT_MESSAGE = `You’ve saved ${String(MAX_FAVOURITES)} of ${String(MAX_FAVOURITES)} cities. Remove one to add another.`;

type FavouriteControl = {
  /** The star button, with its confirmation dialog. */
  action: ReactNode;
  /** The reason the star cannot be used, when there is one. */
  notice: ReactNode;
};

/**
 * The star on the conditions card. A toggle button: pressed when the city is
 * saved. Saving is immediate; un-saving asks first, like any removal. At the
 * limit it stays focusable and says why it will not work, rather than doing
 * nothing silently.
 */
export function useFavouriteControl(
  city: City,
  store: FavouritesStore = favouritesStore,
): FavouriteControl {
  const { cities } = useFavourites(store);
  const [confirming, setConfirming] = useState(false);
  const noticeId = useId();

  const saved = cities.some((entry) => entry.id === city.id);
  const atLimit = !saved && cities.length >= MAX_FAVOURITES;

  const onClick = () => {
    if (saved) {
      setConfirming(true);
      return;
    }
    const result = store.add(city);
    announce(
      result.ok
        ? `${city.name} saved. ${String(result.count)} of ${String(MAX_FAVOURITES)} favourites.`
        : LIMIT_MESSAGE,
    );
  };

  return {
    action: (
      <>
        <IconButton
          label={`Save ${city.name} as a favourite`}
          icon={saved ? 'star-filled' : 'star'}
          variant="secondary"
          aria-pressed={saved}
          aria-disabled={atLimit || undefined}
          aria-describedby={atLimit ? noticeId : undefined}
          onClick={onClick}
          className="bg-transparent"
        />
        <RemoveFavouriteDialog
          city={confirming ? city : null}
          store={store}
          onClose={() => {
            setConfirming(false);
          }}
        />
      </>
    ),
    notice: atLimit ? (
      <p id={noticeId} className="text-muted mt-2 text-sm">
        {LIMIT_MESSAGE}
      </p>
    ) : null,
  };
}
