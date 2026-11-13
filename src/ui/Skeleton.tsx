import { cx } from './cx';

type SkeletonProps = {
  /** Size and shape come from utilities, for example "h-4 w-32". */
  className?: string;
};

/**
 * A placeholder block for content that is loading. It is hidden from
 * assistive technology: the region that contains it should set aria-busy and
 * announce "Loading" once, rather than each block announcing itself.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx('bg-hover animate-pulse-soft block rounded-sm', className)}
    />
  );
}
