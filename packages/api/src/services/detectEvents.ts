import { FeedEvent, Match, MatchAction, Team } from '@sweepstake/shared';

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

  // Per-player goal/booking actions. BBC carries the full cumulative list each
  // poll, so a new item is one whose stable key isn't already in `existing`.
  // `actions` is absent on old rows / in tests that don't set it; default to
  // [] so every action-derived addition below is a no-op when it's missing.
  const key = (a: MatchAction): string =>
    `${a.team}|${a.type}|${a.player}|${a.minute}`;
  const prev = existing?.actions ?? [];
  const next = merged.actions ?? [];
  const prevKeys = new Set(prev.map(key));

  // ===== GOAL — one event per side whose score increased =====
  if (nextHome > prevHome) {
    const goal: FeedEvent = {
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
    };
    enrichScorer(goal, next, prevKeys, merged.homeTeam, key);
    events.push(goal);
  }
  if (nextAway > prevAway) {
    const goal: FeedEvent = {
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
    };
    enrichScorer(goal, next, prevKeys, merged.awayTeam, key);
    events.push(goal);
  }

  // ===== CARDS — one event per new booking action =====
  // Bookings are surfaced from the per-player action list, not the score; a
  // card already present in `existing` (same key) must not re-emit.
  for (const a of next) {
    if (a.type !== 'YELLOW_CARD' && a.type !== 'RED_CARD') continue;
    if (prevKeys.has(key(a))) continue;
    events.push({
      eventId: `${matchId}#${a.type}#${a.team}#${a.player}#${a.minute}`,
      ts,
      type: a.type,
      teamCode: a.team,
      matchId,
      payload: {
        teamCode: a.team,
        player: a.player,
        minute: a.minute,
        homeTeam: merged.homeTeam,
        awayTeam: merged.awayTeam,
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
 * Attach `scorer`/`scorerMinute` to a GOAL event from the per-player action
 * list. The score delta tells us a side scored; the actions tell us who. We
 * only enrich when EXACTLY ONE new GOAL action exists for that side this
 * transition — zero (actions absent/lagging) or many (ambiguous which goal the
 * delta is) leaves the goal scorer-less rather than guessing.
 */
function enrichScorer(
  goal: FeedEvent,
  next: MatchAction[],
  prevKeys: Set<string>,
  teamCode: string,
  key: (a: MatchAction) => string
): void {
  const newGoals = next.filter(
    (a) => a.type === 'GOAL' && a.team === teamCode && !prevKeys.has(key(a))
  );
  if (newGoals.length === 1) {
    goal.payload.scorer = newGoals[0].player;
    goal.payload.scorerMinute = newGoals[0].minute;
  }
}

/**
 * Whether a clock label denotes the half-time interval. BBC writes "HT"; we
 * stay tolerant of "Half Time" / "Half-time" in case the upstream label drifts.
 */
function isHalfTime(minute: string | null | undefined): boolean {
  return /^ht$|half[\s-]?time/i.test((minute ?? '').trim());
}
