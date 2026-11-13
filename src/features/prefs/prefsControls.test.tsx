import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsMenu } from './SettingsMenu';
import { resetUnitsForTests, UNITS_STORAGE_KEY } from './units';

beforeEach(() => {
  window.localStorage.clear();
  resetUnitsForTests();
});

describe('SettingsMenu', () => {
  it('opens from a labelled button and offers units and theme', async () => {
    const user = userEvent.setup();
    render(<SettingsMenu />);

    await user.click(screen.getByRole('button', { name: 'Settings' }));

    expect(screen.getByRole('group', { name: 'Temperature unit' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Celsius' })).toBeChecked();
  });

  it('remembers the chosen unit', async () => {
    const user = userEvent.setup();
    render(<SettingsMenu />);
    await user.click(screen.getByRole('button', { name: 'Settings' }));

    await user.click(screen.getByRole('radio', { name: 'Fahrenheit' }));

    expect(screen.getByRole('radio', { name: 'Fahrenheit' })).toBeChecked();
    expect(window.localStorage.getItem(UNITS_STORAGE_KEY)).toBe('imperial');
  });

  it('closes with Escape and returns focus to the button', async () => {
    const user = userEvent.setup();
    render(<SettingsMenu />);
    const button = screen.getByRole('button', { name: 'Settings' });
    await user.click(button);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('group', { name: 'Theme' })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });
});
