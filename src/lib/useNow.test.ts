import { act, renderHook } from '@testing-library/react';
import { useNow } from './useNow';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-11-14T01:38:20Z') });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useNow', () => {
  it('starts at the current time', () => {
    const { result } = renderHook(() => useNow(15_000));

    expect(result.current).toBe(Date.parse('2026-11-14T01:38:20Z'));
  });

  it('moves forward on every tick', () => {
    const { result } = renderHook(() => useNow(15_000));

    act(() => {
      vi.advanceTimersByTime(14_999);
    });
    expect(result.current).toBe(Date.parse('2026-11-14T01:38:20Z'));

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(Date.parse('2026-11-14T01:38:35Z'));

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current).toBe(Date.parse('2026-11-14T01:39:05Z'));
  });

  it('stops ticking when the component goes away', () => {
    const { unmount } = renderHook(() => useNow(15_000));

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
