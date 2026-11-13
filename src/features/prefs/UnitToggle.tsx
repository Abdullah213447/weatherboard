import { TEMPERATURE_UNIT, type UnitSystem } from '@/domain/units';
import { setUnitSystem, useUnits } from './units';

const options: UnitSystem[] = ['metric', 'imperial'];

/** °C or °F as a native radio group. Wind speed follows the choice. */
export function UnitToggle() {
  const units = useUnits();

  return (
    <fieldset className="border-line bg-surface inline-flex rounded-md border p-0.5">
      <legend className="sr-only">Temperature unit</legend>
      {options.map((option) => (
        <label
          key={option}
          title={TEMPERATURE_UNIT[option].name}
          className="text-muted hover:text-ink has-checked:bg-hover has-checked:text-ink has-focus-visible:outline-accent compact:h-9 compact:min-w-9 inline-grid h-11 min-w-11 cursor-pointer place-items-center rounded-sm px-2 text-sm font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-1"
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
