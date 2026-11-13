import { render } from '@testing-library/react';
import { CONDITION_KINDS } from '@/domain/weather';
import { WeatherIcon } from './WeatherIcon';

const draw = (kind: (typeof CONDITION_KINDS)[number], isDay: boolean) => {
  const { container } = render(<WeatherIcon condition={{ kind, isDay }} />);
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('No svg rendered.');
  return svg;
};

/** The drawing itself, with generated ids removed so only real differences count. */
const shape = (svg: SVGElement) => svg.innerHTML.replace(/(id="|url\(#)[^")]+/g, '$1');

describe('WeatherIcon', () => {
  it.each(CONDITION_KINDS)('%s: draws something, hidden from assistive technology', (kind) => {
    const svg = draw(kind, true);

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg.querySelectorAll('path, circle').length).toBeGreaterThan(0);
  });

  it.each(CONDITION_KINDS.filter((kind) => kind !== 'unknown'))(
    '%s: has different day and night drawings',
    (kind) => {
      expect(shape(draw(kind, true))).not.toBe(shape(draw(kind, false)));
    },
  );

  it('draws every condition differently from every other', () => {
    for (const isDay of [true, false]) {
      const drawings = CONDITION_KINDS.map((kind) => shape(draw(kind, isDay)));
      expect(new Set(drawings).size).toBe(CONDITION_KINDS.length);
    }
  });

  it('animates only when motion is allowed', () => {
    const animated = [...draw('rain', true).querySelectorAll('[class*="animate-"]')];

    expect(animated.length).toBeGreaterThan(0);
    for (const element of animated) {
      expect(element.getAttribute('class')).toMatch(/motion-safe:animate-/);
      expect(element.getAttribute('class')).not.toMatch(/(^|\s)animate-/);
    }
  });
});
