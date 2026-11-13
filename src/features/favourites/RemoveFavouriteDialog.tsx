import type { City } from '@/domain/weather';
import { announce } from '@/ui/announce';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { MAX_FAVOURITES, type FavouritesStore } from './favouritesStore';

type RemoveFavouriteDialogProps = {
  /** The city being removed. Null keeps the dialog closed. */
  city: City | null;
  store: FavouritesStore;
  onClose: () => void;
  /** Runs after the city has been removed. */
  onRemoved?: (city: City) => void;
  /** Lets the caller decide where focus goes once the dialog has closed. */
  onCloseAutoFocus?: (event: Event) => void;
};

/**
 * Every removal goes through this, from the star and from the list alike:
 * it names the city, starts on the safe answer, and announces the result.
 */
export function RemoveFavouriteDialog({
  city,
  store,
  onClose,
  onRemoved,
  onCloseAutoFocus,
}: RemoveFavouriteDialogProps) {
  return (
    <ConfirmDialog
      open={city !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={city ? `Remove ${city.name} from favourites?` : ''}
      description="It leaves your quick-access list. You can save it again at any time."
      confirmLabel="Remove"
      cancelLabel="Keep"
      destructive
      onConfirm={() => {
        if (!city) return;
        store.remove(city.id);
        announce(
          `${city.name} removed. ${String(store.getState().cities.length)} of ${String(MAX_FAVOURITES)} favourites.`,
        );
        onRemoved?.(city);
      }}
      {...(onCloseAutoFocus && { onCloseAutoFocus })}
    />
  );
}
