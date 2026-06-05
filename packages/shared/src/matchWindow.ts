import { Match } from './types';

// How early (before kickoff) and how long (after kickoff) a match counts as
// "active" for the purposes of ingesting fresh scores and fast client polling.
// RECENT_MS is generous to cover stoppage time, extra time, penalties, and any
// lag in the upstream status feed flipping SCHEDULED → LIVE → FINISHED.
export const IMMINENT_MS = 15 * 60 * 1000; // 15 minutes before kickoff
export const RECENT_MS = 3 * 60 * 60 * 1000; // 3 hours after kickoff

/**
 * Whether a single match is in play or about to be. A `LIVE` match is always
 * active; a `FINISHED` one never is; otherwise it's active when kickoff falls
 * inside the [now - RECENT_MS, now + IMMINENT_MS] window.
 */
export function isMatchActive(match: Match, now: number): boolean {
  if (match.status === 'LIVE') return true;
  if (match.status === 'FINISHED') return false;

  const kickoff = new Date(match.datetime).getTime();
  if (Number.isNaN(kickoff)) return false;

  return kickoff <= now + IMMINENT_MS && kickoff >= now - RECENT_MS;
}

/**
 * Whether any match is live or about to start. Used to gate the scheduled
 * server-side refresh (don't hit external APIs when nothing's on) and to drive
 * fast client polling only when it's worth it.
 */
export function hasActiveMatchWindow(matches: Match[], now: number): boolean {
  return matches.some((m) => isMatchActive(m, now));
}
