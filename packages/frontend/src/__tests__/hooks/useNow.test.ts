import { renderHook, act } from '@testing-library/react';
import { useNow } from '../../hooks/useNow';

describe('useNow', () => {
  const START = Date.parse('2026-06-12T10:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(START);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the current timestamp on mount', () => {
    const { result } = renderHook(() => useNow());
    expect(result.current).toBe(START);
  });

  it('advances on each interval tick', () => {
    const { result } = renderHook(() => useNow(1000));
    expect(result.current).toBe(START);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(START + 1000);
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(START + 3000);
  });

  it('respects a custom interval', () => {
    const { result } = renderHook(() => useNow(5000));
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(result.current).toBe(START); // not ticked yet
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(START + 5000);
  });

  it('stops ticking after unmount', () => {
    const { result, unmount } = renderHook(() => useNow(1000));
    unmount();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(START);
  });
});
