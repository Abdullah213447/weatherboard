import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setThemePreference } from './theme';
import { ThemeMenu } from './ThemeMenu';
import { UnitToggle } from './UnitToggle';
import { resetUnitsForTests, UNITS_STORAGE_KEY } from './units';

beforeEach(() => {
  window.localStorage.clear();
  resetUnitsForTests();
});
afterEach(() => {
  setThemePreference('system');
});

describe('ThemeMenu', () => {
  it('opens from a labelled button and offers light, dark and system', async () => {
    const user = userEvent.setup();
    render(<ThemeMenu />);

    await user.click(screen.getByRole('button', { name: 'Theme' }));

    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual([
      'light',
      'dark',
      'system',
    ]);
  });

  it('closes with Escape and returns focus to the button', async () => {
    const user = userEvent.setup();
    render(<ThemeMenu />);
    const button = screen.getByRole('button', { name: 'Theme' });
    await user.click(button);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('group', { name: 'Theme' })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });
});

describe('UnitToggle', () => {
  it('is a labelled radio group, on Celsius for a metric locale', () => {
    render(<UnitToggle />);

    expect(screen.getByRole('group', { name: 'Temperature unit' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Celsius' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Fahrenheit' })).not.toBeChecked();
  });

  it('remembers the chosen unit', async () => {
    const user = userEvent.setup();
    render(<UnitToggle />);

    await user.click(screen.getByRole('radio', { name: 'Fahrenheit' }));

    expect(screen.getByRole('radio', { name: 'Fahrenheit' })).toBeChecked();
    expect(window.localStorage.getItem(UNITS_STORAGE_KEY)).toBe('imperial');
  });

  it('can be changed from the keyboard', async () => {
    const user = userEvent.setup();
    render(<UnitToggle />);

    await user.tab();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('radio', { name: 'Fahrenheit' })).toBeChecked();
  });
});
