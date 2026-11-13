import { Icon, type IconName } from '@/ui/Icon';
import { useTheme, type ThemePreference } from './theme';

const options: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'monitor' },
];

/**
 * Light / dark / system as a native radio group, so arrow keys, focus and
 * screen-reader semantics come from the browser. 44px per option,
 * 36px only on wide screens with a precise pointer.
 */
export function ThemeControl() {
  const { preference, setPreference } = useTheme();

  return (
    <fieldset className="border-line bg-surface inline-flex rounded-md border p-0.5">
      <legend className="sr-only">Theme</legend>
      {options.map((option) => (
        <label
          key={option.value}
          title={option.label}
          className="text-muted hover:text-ink has-checked:bg-hover has-checked:text-ink has-focus-visible:outline-accent inline-grid size-11 compact:size-9 cursor-pointer place-items-center rounded-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-1"
        >
          <input
            type="radio"
            name="theme"
            value={option.value}
            checked={preference === option.value}
            onChange={() => {
              setPreference(option.value);
            }}
            className="sr-only"
          />
          <Icon name={option.icon} size={18} />
          <span className="sr-only">{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
