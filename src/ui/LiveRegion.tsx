import type { ReactNode } from 'react';

/** Content for screen readers only. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

type LiveRegionProps = {
  /** Text to announce. Changing it triggers a new announcement. */
  message: string;
  /** "assertive" interrupts; keep it for errors the user must act on. */
  politeness?: 'polite' | 'assertive';
};

/**
 * Announces a change that is only visible on screen, such as "5 suggestions"
 * or "Karachi added to favourites". The region must stay mounted: screen
 * readers ignore text inside a region that appears at the same moment.
 */
export function LiveRegion({ message, politeness = 'polite' }: LiveRegionProps) {
  return (
    <div
      className="sr-only"
      role={politeness === 'assertive' ? 'alert' : 'status'}
      aria-live={politeness}
      aria-atomic="true"
    >
      {message}
    </div>
  );
}
