import { useId, type ReactNode } from 'react';
import { cx } from '@/ui/cx';

type PanelProps = {
  /** Shown as a quiet heading and used as the region's accessible name. */
  title?: string;
  children: ReactNode;
  className?: string;
};

/** The dashboard's card: one elevation step above the canvas, drawn with a 1px line. */
export function Panel({ title, children, className }: PanelProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className={cx('border-line bg-surface rounded-lg border p-4 md:p-5', className)}
    >
      {title && (
        <h2 id={headingId} className="text-muted mb-3 text-sm font-medium">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
