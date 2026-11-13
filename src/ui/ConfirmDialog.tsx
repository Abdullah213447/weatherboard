import * as Dialog from '@radix-ui/react-dialog';
import { useRef } from 'react';
import { Button } from './Button';

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The question, naming the thing affected: "Remove Karachi from favourites?" */
  title: string;
  /** The consequence, and whether it can be undone. */
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Styles the confirm button as a destructive action. */
  destructive?: boolean;
  onConfirm: () => void;
  /** Overrides where focus goes after closing. By default it returns to what opened the dialog. */
  onCloseAutoFocus?: (event: Event) => void;
};

/**
 * A modal question with two answers. Focus starts on Cancel, so a stray
 * Enter never confirms; Escape and the backdrop both cancel; focus returns
 * to the control that opened it, unless the caller sends it elsewhere.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCloseAutoFocus,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  /** Whatever had focus when the dialog opened, so it can be given back. */
  const openerRef = useRef<HTMLElement | null>(null);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-scrim animate-fade-in fixed inset-0" />
        <Dialog.Content
          role="alertdialog"
          onOpenAutoFocus={(event) => {
            // Focus has not moved yet: this is still the control that opened the dialog.
            openerRef.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            event.preventDefault();
            cancelRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus?.(event);
            if (event.defaultPrevented) return;
            // The dialog is opened from state, not from a trigger element, so
            // returning focus is done here rather than left to the library.
            event.preventDefault();
            if (openerRef.current?.isConnected) openerRef.current.focus();
          }}
          className="border-line-strong bg-raised text-ink shadow-raised animate-fade-in fixed top-1/2 left-1/2 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border p-5"
        >
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="text-muted mt-1 text-sm">{description}</Dialog.Description>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button ref={cancelRef}>{cancelLabel}</Button>
            </Dialog.Close>
            <Button
              variant={destructive ? 'danger' : 'primary'}
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
