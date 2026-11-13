import type { ComponentProps } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';

type IconButtonProps = Omit<ComponentProps<'button'>, 'type' | 'children' | 'aria-label'> & {
  /** Required: an icon alone has no accessible name. Also shown as the tooltip. */
  label: string;
  icon: IconName;
  variant?: 'ghost' | 'secondary';
};

const variants = {
  ghost: 'text-muted hover:bg-hover hover:text-ink',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-hover',
} as const;

/** Always 44x44, so it is a safe touch target wherever it is placed. */
export function IconButton({
  label,
  icon,
  variant = 'ghost',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-grid size-11 shrink-0 place-items-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className,
      )}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}
