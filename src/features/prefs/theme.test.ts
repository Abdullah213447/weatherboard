import indexHtml from '../../../index.html?raw';
import { resolveTheme, THEME_COLOR, THEME_STORAGE_KEY } from './theme';

describe('resolveTheme', () => {
  it('follows the system when the preference is "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('lets an explicit choice override the system', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('inline theme script in index.html', () => {
  it('uses the same storage key and canvas colours as the theme module', () => {
    expect(indexHtml).toContain(`'${THEME_STORAGE_KEY}'`);
    expect(indexHtml).toContain(THEME_COLOR.light);
    expect(indexHtml).toContain(THEME_COLOR.dark);
  });
});
