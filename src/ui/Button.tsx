import type { ComponentProps } from 'react';
import { cx } from './cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

type ButtonProps = Omit<ComponentProps<'button'>, 'type'> & {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner, sets aria-busy and blocks further presses. */
  loading?: boolean;
  type?: 'button' | 'submit';
};

const base =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-hover',
  ghost: 'text-ink hover:bg-hover',
  danger: 'bg-danger-solid text-on-danger hover:bg-danger-solid-hover',
};

// `sm` is compact for a mouse and grows to a 44px target on touch screens.
const sizes: Record<Size, string> = {
  md: 'h-11 px-4',
  sm: 'h-9 px-3 pointer-coarse:h-11',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  type = 'button',
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={cx(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      )}
      {children}
    </button>
  );
}
