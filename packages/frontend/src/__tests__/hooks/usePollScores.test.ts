import { renderHook, act } from '@testing-library/react';
import { usePollScores } from '../../hooks/usePollScores';
import { Match } from '@sweepstake/shared';
import { LIVE_POLL_MS } from '../../lib/polling';

const liveMatch: Match = {
  matchId: '1',
  homeTeam: 'ENG',
  awayTeam: 'BRA',
  homeScore: 0,
  awayScore: 0,
  status: 'LIVE',
  stage: 'GROUP_STAGE',
  group: 'A',
  datetime: '2026-06-14T18:00:00Z',
  venue: 'Stadium',
};
const finishedMatch: Match = { ...liveMatch, status: 'FINISHED' };

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('usePollScores', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('polls on an interval while a match is live', () => {
    const refetch = jest.fn();
    renderHook(() => usePollScores([liveMatch], refetch));

    expect(refetch).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(LIVE_POLL_MS); });
    expect(refetch).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(LIVE_POLL_MS); });
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it('does not poll when no match is active', () => {
    const refetch = jest.fn();
    renderHook(() => usePollScores([finishedMatch], refetch));

    act(() => { jest.advanceTimersByTime(10 * 60_000); });
    expect(refetch).not.toHaveBeenCalled();
  });

  it('pauses while the tab is hidden and refetches when it becomes visible again', () => {
    const refetch = jest.fn();
    renderHook(() => usePollScores([liveMatch], refetch));

    act(() => { setHidden(true); });
    refetch.mockClear();
    act(() => { jest.advanceTimersByTime(2 * LIVE_POLL_MS); });
    expect(refetch).not.toHaveBeenCalled(); // paused while hidden

    act(() => { setHidden(false); });
    expect(refetch).toHaveBeenCalledTimes(1); // immediate catch-up refetch
    act(() => { jest.advanceTimersByTime(LIVE_POLL_MS); });
    expect(refetch).toHaveBeenCalledTimes(2); // interval resumed
  });

  it('does not poll when mounted while the tab is already hidden', () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    const refetch = jest.fn();
    renderHook(() => usePollScores([liveMatch], refetch));

    act(() => { jest.advanceTimersByTime(3 * LIVE_POLL_MS); });
    expect(refetch).not.toHaveBeenCalled();
  });

  it('clears the interval on unmount', () => {
    const refetch = jest.fn();
    const { unmount } = renderHook(() => usePollScores([liveMatch], refetch));

    unmount();
    act(() => { jest.advanceTimersByTime(3 * LIVE_POLL_MS); });
    expect(refetch).not.toHaveBeenCalled();
  });
});
