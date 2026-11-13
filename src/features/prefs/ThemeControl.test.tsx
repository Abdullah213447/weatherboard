import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeControl } from './ThemeControl';
import { setThemePreference, THEME_STORAGE_KEY } from './theme';

describe('ThemeControl', () => {
  afterEach(() => {
    setThemePreference('system');
  });

  it('offers light, dark and system as a labelled radio group', () => {
    render(<ThemeControl />);

    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Light' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
  });

  it('applies the choice to the document and remembers it', async () => {
    const user = userEvent.setup();
    render(<ThemeControl />);

    await user.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('can be changed from the keyboard', async () => {
    const user = userEvent.setup();
    render(<ThemeControl />);

    await user.tab();
    expect(screen.getByRole('radio', { name: 'System' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');

    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });
});
