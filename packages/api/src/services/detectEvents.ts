import { FeedEvent, Match, Team } from '@sweepstake/shared';

/**
 * Compute the feed events implied by a single match transitioning from
 * `existing` (previous stored state) to `merged` (the state about to be
 * written). Pure and side-effect-free: the caller persists the returned events
 * after the new match state is written so re-runs don't refire.
 *
 * `teamsById` is the current team state keyed by `teamCode`, used to attach
 * elimination info (a knockout loser is flagged `eliminated` elsewhere in the
 * refresh; we surface it here when its match reaches FULL_TIME).
 *
 * Every event carries a DETERMINISTIC `eventId` so a duplicate detection
 * overwrites the same row instead of creating a second. Returns `[]` when
 * nothing event-worthy changed (e.g. only fixture metadata moved, or
 * `existing === merged`).
 */
export function detectEvents(
  existing: Match | undefined,
  merged: Match,
  teamsById: Map<string, Team>
): FeedEvent[] {
  if (existing === merged) return [];

  const events: FeedEvent[] = [];
  const ts = new Date().toISOString();
  const matchId = merged.matchId;

  const prevHome = existing?.homeScore ?? 0;
  const prevAway = existing?.awayScore ?? 0;
  const nextHome = merged.homeScore ?? 0;
  const nextAway = merged.awayScore ?? 0;

  // ===== GOAL — one event per side whose score increased =====
  if (nextHome > prevHome) {
    events.push({
      eventId: `${matchId}#GOAL#${nextHome}-${nextAway}`,
      ts,
      type: 'GOAL',
      teamCode: merged.homeTeam,
      matchId,
      payload: {
        homeTeam: merged.homeTeam,
        awayTeam: merged.awayTeam,
        homeScore: nextHome,
        awayScore: nextAway,
        scoringTeam: merged.homeTeam,
        side: 'home',
        stage: merged.stage,
      },
    });
  }
  if (nextAway > prevAway) {
    events.push({
      eventId: `${matchId}#GOAL#${nextHome}-${nextAway}`,
      ts,
      type: 'GOAL',
      teamCode: merged.awayTeam,
      matchId,
      payload: {
        homeTeam: merged.homeTeam,
        awayTeam: merged.awayTeam,
        homeScore: nextHome,
        awayScore: nextAway,
        scoringTeam: merged.awayTeam,
        side: 'away',
        stage: merged.stage,
      },
    });
  }

  // ===== KICKOFF — SCHEDULED -> LIVE =====
  if (existing?.status === 'SCHEDULED' && merged.status === 'LIVE') {
    events.push({
      eventId: `${matchId}#KICKOFF`,
      ts,
      type: 'KICKOFF',
      matchId,
      payload: {
        homeTeam: merged.homeTeam,
        awayTeam: merged.awayTeam,
        stage: merged.stage,
      },
    });
  }

  // ===== HALF_TIME — clock entered the interval =====
  // BBC keeps a match's status at LIVE through the break and flips its clock
  // label to "HT" (carried on `minute`), so half-time is a minute transition,
  // not a status one. Fire once on the way in; the deterministic eventId plus
  // the read-time dedupe collapse the repeated polls across the ~15-min break.
  if (merged.status === 'LIVE' && isHalfTime(merged.minute) && !isHalfTime(existing?.minute)) {
    events.push({
      eventId: `${matchId}#HALF_TIME`,
      ts,
      type: 'HALF_TIME',
      matchId,
      payload: {
        homeTeam: merged.homeTeam,
        awayTeam: merged.awayTeam,
        homeScore: nextHome,
        awayScore: nextAway,
        stage: merged.stage,
      },
    });
  }

  // ===== FULL_TIME — status transitioned -> FINISHED =====
  const becameFinished =
    existing?.status !== 'FINISHED' && merged.status === 'FINISHED';
  if (becameFinished) {
    const outcome =
      nextHome > nextAway
        ? 'home'
        : nextAway > nextHome
          ? 'away'
          : 'draw';
    events.push({
      eventId: `${matchId}#FULL_TIME`,
      ts,
      type: 'FULL_TIME',
      matchId,
      payload: {
        homeTeam: merged.homeTeam,
        awayTeam: merged.awayTeam,
        homeScore: nextHome,
        awayScore: nextAway,
        outcome, // 'home' win | 'away' win | 'draw'
        stage: merged.stage,
      },
    });

    // ===== ELIMINATION — an involved team is now eliminated =====
    // A knockout loser is flagged `eliminated` elsewhere in the refresh; surface
    // it here, gated on the FULL_TIME transition so it fires exactly once.
    for (const code of [merged.homeTeam, merged.awayTeam]) {
      const team = teamsById.get(code);
      if (team?.eliminated) {
        events.push({
          eventId: `${code}#ELIMINATED`,
          ts,
          type: 'ELIMINATION',
          teamCode: code,
          matchId,
          payload: {
            teamCode: code,
            teamName: team.name,
            eliminatedAt: team.eliminatedAt,
            stage: merged.stage,
          },
        });
      }
    }
  }

  return events;
}

/**
 * Whether a clock label denotes the half-time interval. BBC writes "HT"; we
 * stay tolerant of "Half Time" / "Half-time" in case the upstream label drifts.
 */
function isHalfTime(minute: string | null | undefined): boolean {
  return /^ht$|half[\s-]?time/i.test((minute ?? '').trim());
}
