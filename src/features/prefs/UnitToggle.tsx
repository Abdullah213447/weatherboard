import { TEMPERATURE_UNIT, type UnitSystem } from '@/domain/units';
import { cx } from '@/ui/cx';
import { setUnitSystem, useUnits } from './units';

const options: UnitSystem[] = ['metric', 'imperial'];

type UnitToggleProps = {
  /** Stacked takes one control's width, for use beside the temperature. */
  orientation?: 'horizontal' | 'vertical';
};

/**
 * °C or °F as a native radio group. It sits next to the temperature, so the
 * unit of the number on screen is always in view. Wind speed follows the choice.
 */
export function UnitToggle({ orientation = 'horizontal' }: UnitToggleProps) {
  const units = useUnits();

  return (
    <fieldset
      className={cx(
        'border-line inline-flex shrink-0 rounded-md border p-0.5',
        orientation === 'vertical' && 'flex-col',
      )}
    >
      <legend className="sr-only">Temperature unit</legend>
      {options.map((option) => (
        <label
          key={option}
          title={TEMPERATURE_UNIT[option].name}
          className="text-muted hover:text-ink has-checked:bg-hover has-checked:text-ink has-focus-visible:outline-accent compact:size-9 inline-grid size-11 cursor-pointer place-items-center rounded-sm text-sm font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-1"
        >
          <input
            type="radio"
            name="units"
            value={option}
            checked={units === option}
            onChange={() => {
              setUnitSystem(option);
            }}
            className="sr-only"
          />
          <span aria-hidden="true">{TEMPERATURE_UNIT[option].symbol}</span>
          <span className="sr-only">{TEMPERATURE_UNIT[option].name}</span>
        </label>
      ))}
    </fieldset>
  );
}
