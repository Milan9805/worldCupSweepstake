import { Match, hasActiveMatchWindow } from '@sweepstake/shared';

// Adaptive polling cadence. Fast while a match is actually in play, slower when
// one is merely imminent/recent, and off entirely when nothing's on — so we
// only make requests (and only spend money) when scores can actually change.
export const LIVE_POLL_MS = 30_000; // 30s while a match is LIVE
export const SOON_POLL_MS = 5 * 60_000; // 5min when a match is imminent but not live

/**
 * How often the browser should re-fetch scores given the current fixtures, or
 * `null` to not poll at all.
 */
export function pollIntervalFor(matches: Match[], now: number): number | null {
  if (matches.some((m) => m.status === 'LIVE')) return LIVE_POLL_MS;
  if (hasActiveMatchWindow(matches, now)) return SOON_POLL_MS;
  return null;
}
