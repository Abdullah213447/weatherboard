import * as Popover from '@radix-ui/react-popover';
import { IconButton } from '@/ui/IconButton';
import { ThemeControl } from './ThemeControl';
import { UnitToggle } from './UnitToggle';

/**
 * The app's few preferences behind one button, so the header stays calm and
 * fits at 375px. Radix handles focus, Escape, and closing on an outside press.
 */
export function SettingsMenu() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <IconButton label="Settings" icon="settings" variant="secondary" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={16}
          aria-label="Settings"
          className="border-line-strong bg-raised text-ink shadow-raised animate-fade-in z-30 flex flex-col gap-4 rounded-lg border p-4"
        >
          <div className="flex items-center justify-between gap-6">
            <span className="text-muted text-sm">Units</span>
            <UnitToggle />
          </div>
          <div className="flex items-center justify-between gap-6">
            <span className="text-muted text-sm">Theme</span>
            <ThemeControl />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
