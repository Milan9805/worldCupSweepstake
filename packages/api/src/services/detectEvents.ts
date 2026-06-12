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

  // ===== GOAL — per-side, per-index events recomputed each poll =====
  // The score increment and the goal ACTION (which names the scorer) typically
  // land in DIFFERENT polls, so we can't rely on the scorer being present the
  // moment the score moves. Instead we derive one DETERMINISTIC event per goal
  // a side has scored (`#GOAL#<side>#<goalIndex>`), recomputed every poll. The
  // i-th goal's scorer is the i-th GOAL action for that side (BBC carries the
  // full cumulative list each poll, in order). When the action hasn't arrived
  // yet the event is emitted scorer-less; once it lands a later poll re-emits
  // the SAME eventId WITH the scorer, and read-time dedupe (newest wins) makes
  // the scorer appear in the feed without a second row.
  for (const side of ['home', 'away'] as const) {
    const teamCode = side === 'home' ? merged.homeTeam : merged.awayTeam;

    // Desired GOAL events for a match state: one per goal that side has scored,
    // each carrying the scorer of the same-index GOAL action when known.
    // Own goals: BBC tags a GOAL action with the SCORER's own team (the
    // conceding side), so it won't match the scoring `teamCode` and that index
    // stays scorer-less — we never attribute a goal to the wrong team.
    const desiredGoals = (m: Match | undefined): FeedEvent[] => {
      const count = (side === 'home' ? m?.homeScore : m?.awayScore) ?? 0;
      const sideGoalActions = (m?.actions ?? []).filter(
        (a) => a.type === 'GOAL' && a.team === teamCode
      );
      const out: FeedEvent[] = [];
      for (let i = 0; i < count; i++) {
        const action = sideGoalActions[i];
        const payload: Record<string, unknown> = {
          homeTeam: merged.homeTeam,
          awayTeam: merged.awayTeam,
          homeScore: nextHome,
          awayScore: nextAway,
          scoringTeam: teamCode,
          side,
          stage: merged.stage,
          goalIndex: i,
        };
        // Omit scorer keys entirely when the action is absent, so a later poll
        // that adds them is a real change the emit rule below can detect.
        if (action) {
          payload.scorer = action.player;
          payload.scorerMinute = action.minute;
        }
        out.push({
          eventId: `${matchId}#GOAL#${side}#${i}`,
          ts,
          type: 'GOAL',
          teamCode,
          matchId,
          payload,
        });
      }
      return out;
    };

    const desiredFromMerged = desiredGoals(merged);
    const desiredFromExisting = desiredGoals(existing);

    // Emit each desired goal that's new (index not previously present) or whose
    // scorer just became known/changed since `existing`.
    for (let i = 0; i < desiredFromMerged.length; i++) {
      const prevGoal = desiredFromExisting[i];
      if (!prevGoal || prevGoal.payload.scorer !== desiredFromMerged[i].payload.scorer) {
        events.push(desiredFromMerged[i]);
      }
    }
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
 * Whether a clock label denotes the half-time interval. BBC writes "HT"; we
 * stay tolerant of "Half Time" / "Half-time" in case the upstream label drifts.
 */
function isHalfTime(minute: string | null | undefined): boolean {
  return /^ht$|half[\s-]?time/i.test((minute ?? '').trim());
}
