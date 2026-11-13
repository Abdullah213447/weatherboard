import type { ReactNode } from 'react';
import { Button } from './Button';
import { cx } from './cx';
import { Icon } from './Icon';

type Tone = 'info' | 'success' | 'warning' | 'danger';

type InlineAlertProps = {
  tone?: Tone;
  /** What happened, in a few words. */
  title: string;
  /** What it means and what the user can do about it. */
  children: ReactNode;
  action?: { label: string; onClick: () => void };
  className?: string;
};

const tones: Record<Tone, { box: string; icon: string }> = {
  info: { box: 'border-info-line bg-info-soft', icon: 'text-info' },
  success: { box: 'border-success-line bg-success-soft', icon: 'text-success' },
  warning: { box: 'border-warning-line bg-warning-soft', icon: 'text-warning' },
  danger: { box: 'border-danger-line bg-danger-soft', icon: 'text-danger' },
};

/**
 * An in-flow message. Problems interrupt the screen reader (role="alert");
 * neutral and positive messages wait their turn (role="status"). Tone is
 * carried by the icon shape and the wording as well as by colour.
 */
export function InlineAlert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: InlineAlertProps) {
  const urgent = tone === 'danger' || tone === 'warning';
  return (
    <div
      role={urgent ? 'alert' : 'status'}
      className={cx('flex gap-3 rounded-md border p-3', tones[tone].box, className)}
    >
      <Icon name={tone} className={cx('mt-0.5 shrink-0', tones[tone].icon)} />
      <div className="min-w-0 flex-1">
        <p className="text-ink text-sm font-medium">{title}</p>
        <div className="text-muted text-sm">{children}</div>
        {action && (
          <Button size="sm" className="mt-3" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
