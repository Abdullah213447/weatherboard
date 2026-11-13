import * as Popover from '@radix-ui/react-popover';
import { IconButton } from '@/ui/IconButton';
import type { IconName } from '@/ui/Icon';
import { useTheme, type ThemePreference } from './theme';
import { ThemeControl } from './ThemeControl';

const ICON: Record<ThemePreference, IconName> = { light: 'sun', dark: 'moon', system: 'monitor' };

/**
 * The theme choice behind one header button, whose icon shows the current
 * setting. Three options do not fit beside the wordmark at 375px. Radix
 * handles focus, Escape, and closing on an outside press.
 */
export function ThemeMenu() {
  const { preference } = useTheme();
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <IconButton label="Theme" icon={ICON[preference]} variant="secondary" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={16}
          aria-label="Theme"
          className="border-line-strong bg-raised text-ink shadow-raised animate-fade-in z-30 rounded-lg border p-2"
        >
          <ThemeControl />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
