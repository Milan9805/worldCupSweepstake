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
      if (!m) return [];
      const count = (side === 'home' ? m.homeScore : m.awayScore) ?? 0;
      const sideGoalActions = (m.actions ?? []).filter(
        (a) => a.type === 'GOAL' && a.team === teamCode
      );
      const out: FeedEvent[] = [];
      for (let i = 0; i < count; i++) {
        const action = sideGoalActions[i];
        // The running scoreline AT this goal, not the match's current total — so a
        // batch of goals caught in one poll each reads its own scoreline instead
        // of the final one. Backstops to the current total when this goal's minute
        // isn't known yet (the just-scored live goal), which is exactly right then.
        const line = goalLine(m, side, i);
        const payload: Record<string, unknown> = {
          homeTeam: merged.homeTeam,
          awayTeam: merged.awayTeam,
          homeScore: line.home,
          awayScore: line.away,
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
        // Real match-clock time for ordering + the "ago" label, kept SEPARATE from
        // `ts` (detection time). `ts` must stay recent so the scorer-enriched
        // re-emit wins the newest-wins read dedupe; this field just drives display.
        // Prefer the scorer's exact minute; fall back to the live clock when the
        // action hasn't landed (a fair estimate, and the only signal for own goals).
        const occurredAt = actionTimestamp(m.datetime, action?.minute ?? m.minute);
        if (occurredAt) payload.occurredAt = occurredAt;
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

    // Emit each desired goal that's new (index not previously present), or whose
    // scorer just changed, or whose running scoreline changed AND this goal's own
    // minute is now known. The minute gate matters: when a goal's minute is
    // unknown, `goalLine` backstops to the live total, which drifts every time the
    // OTHER side scores — re-emitting on that drift would restamp an older goal
    // with a later total (the very bug we're fixing). Once its minute is known the
    // scoreline is real, so a change then (e.g. an opposing goal's minute landing)
    // is a genuine correction worth re-emitting under the same eventId.
    for (let i = 0; i < desiredFromMerged.length; i++) {
      const prevGoal = desiredFromExisting[i];
      const cur = desiredFromMerged[i];
      const scoreChanged =
        prevGoal &&
        (prevGoal.payload.homeScore !== cur.payload.homeScore ||
          prevGoal.payload.awayScore !== cur.payload.awayScore);
      if (
        !prevGoal ||
        prevGoal.payload.scorer !== cur.payload.scorer ||
        (scoreChanged && cur.payload.scorerMinute !== undefined)
      ) {
        events.push(cur);
      }
    }
  }

  // ===== CARDS — one event per new booking action =====
  // Bookings are surfaced from the per-player action list, not the score; a
  // card already present in `existing` (same key) must not re-emit.
  //
  // A card's `ts` is anchored to WHEN IT HAPPENED in the match (kickoff +
  // clock minute), NOT the detection time `ts`. Cards were added to the scrape
  // late and backfilled in a single poll, so detection-time stamping made every
  // historical booking read "just now"; the clock minute is the real time. This
  // is safe here (and not for goals) because a card emits exactly once — it
  // never re-fires with a later scorer the way a goal does, so pushing its `ts`
  // into the past can't trip the read-time newest-wins dedupe.
  for (const a of next) {
    if (a.type !== 'YELLOW_CARD' && a.type !== 'RED_CARD') continue;
    if (prevKeys.has(key(a))) continue;
    events.push({
      eventId: `${matchId}#${a.type}#${a.team}#${a.player}#${a.minute}`,
      ts: actionTimestamp(merged.datetime, a.minute) ?? ts,
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
    const payload: Record<string, unknown> = {
      homeTeam: merged.homeTeam,
      awayTeam: merged.awayTeam,
      stage: merged.stage,
    };
    // Anchor the displayed time to the actual kickoff (the match datetime) rather
    // than when we detected the SCHEDULED->LIVE flip, so "X ago" tracks the match
    // clock — a match scraped a couple of minutes late shouldn't read as if it had
    // only just kicked off. Kept in occurredAt (not ts) for the same reason as
    // goals: ts stays detection time for the read dedupe.
    const kickoffAt = isoOrNull(merged.datetime);
    if (kickoffAt) payload.occurredAt = kickoffAt;
    events.push({
      eventId: `${matchId}#KICKOFF`,
      ts,
      type: 'KICKOFF',
      matchId,
      payload,
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
    // A knockout tie level on the pitch is decided on penalties, so the outcome
    // (and the team that advances) comes from the shootout tally, not the 1-1.
    const pensHome = merged.penaltyHome ?? null;
    const pensAway = merged.penaltyAway ?? null;
    const hasPens = pensHome != null && pensAway != null;
    const outcome =
      nextHome > nextAway
        ? 'home'
        : nextAway > nextHome
          ? 'away'
          : hasPens
            ? pensHome > pensAway
              ? 'home'
              : 'away'
            : 'draw';
    const payload: Record<string, unknown> = {
      homeTeam: merged.homeTeam,
      awayTeam: merged.awayTeam,
      homeScore: nextHome,
      awayScore: nextAway,
      outcome, // 'home' win | 'away' win | 'draw'
      stage: merged.stage,
    };
    // Surface the shootout result so the feed's Full Time row can state it
    // ("MAR win 3–2 on pens") instead of reading as a plain draw.
    if (hasPens) {
      payload.penaltyHome = pensHome;
      payload.penaltyAway = pensAway;
      payload.shootoutWinner = outcome === 'home' ? merged.homeTeam : merged.awayTeam;
    }
    events.push({
      eventId: `${matchId}#FULL_TIME`,
      ts,
      type: 'FULL_TIME',
      matchId,
      payload,
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

/**
 * The input as an ISO string if it's a parseable date, else null. Used to anchor
 * an event's display time to a real moment (e.g. KICKOFF to the match datetime)
 * without risking a NaN timestamp when the value is missing/garbage.
 */
export function isoOrNull(value: string | null | undefined): string | null {
  const ms = new Date(value ?? '').getTime();
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * A sortable position for a clock label so goals on the two sides can be
 * interleaved in time order: base minute dominant, stoppage as a tiebreak
 * ("45'+2" sorts after "45'"). Blank / non-numeric labels (the goal ACTION
 * hasn't arrived yet) sort LAST, so a not-yet-known goal is treated as the most
 * recent — which makes `goalLine`'s opposing count fall back to the live total.
 */
function goalMinuteOrder(label: string | null | undefined): number {
  const l = (label ?? '').trim();
  const base = l.match(/\d+/);
  if (!base) return Number.POSITIVE_INFINITY;
  const stoppage = l.match(/\+\s*'?\s*(\d+)/);
  return parseInt(base[0], 10) * 1000 + (stoppage ? parseInt(stoppage[1], 10) : 0);
}

/**
 * The scoreline immediately AFTER the goal recorded at `index` in `side`'s GOAL
 * action list, derived from the goals' CLOCK MINUTES — not the action's array
 * position. BBC lists a side's goals out of chronological order, so the i-th
 * action isn't the i-th goal in time; deriving the tally from minutes keeps each
 * row's scoreline consistent with the minute shown on it.
 *
 * Same-side tally counts that side's goals up to and including this minute;
 * opposing tally counts the other side's goals strictly before it. When this
 * goal's own minute isn't known yet (`Infinity` — the action lands a poll after
 * the score moves), we can't place it, so we fall back to the live total: exactly
 * right for the just-scored goal and identical to the pre-fix behaviour.
 */
export function goalLine(
  m: Match,
  side: 'home' | 'away',
  index: number
): { home: number; away: number } {
  const ordersFor = (code: string): number[] =>
    (m.actions ?? [])
      .filter((a) => a.type === 'GOAL' && a.team === code)
      .map((a) => goalMinuteOrder(a.minute));

  const homeCount = m.homeScore ?? 0;
  const awayCount = m.awayScore ?? 0;
  const scoringCode = side === 'home' ? m.homeTeam : m.awayTeam;
  const opposingCode = side === 'home' ? m.awayTeam : m.homeTeam;

  const thisOrder = ordersFor(scoringCode)[index] ?? Number.POSITIVE_INFINITY;
  if (thisOrder === Number.POSITIVE_INFINITY) {
    return { home: homeCount, away: awayCount };
  }

  const sameRunning = ordersFor(scoringCode).filter((o) => o <= thisOrder).length;
  const oppRunning = ordersFor(opposingCode).filter((o) => o < thisOrder).length;
  return side === 'home'
    ? { home: sameRunning, away: oppRunning }
    : { home: oppRunning, away: sameRunning };
}

/**
 * Approximate the real-world wall-clock time of an in-match action from the
 * match kickoff and the BBC clock label, so the feed can show how long ago a
 * booking actually happened rather than when our scraper first saw it. Returns
 * an ISO string, or null when there's no usable kickoff/label (caller falls
 * back to detection time).
 *
 * The model maps the clock onto elapsed real minutes: first-half minutes map
 * straight through, second-half minutes (base >= 46) add a ~15-min half-time
 * break, and stoppage ("45+2", "90'+3") is added on. Deliberately approximate —
 * it ignores the exact break length and any extra-time interval — but far
 * closer than stamping every card with the moment it was scraped.
 */
export function actionTimestamp(
  kickoff: string | null | undefined,
  minuteLabel: string | null | undefined
): string | null {
  const kickoffMs = new Date(kickoff ?? '').getTime();
  if (Number.isNaN(kickoffMs)) return null;

  const label = (minuteLabel ?? '').trim();
  const base = label.match(/\d+/);
  if (!base) return null; // "HT" and other non-numeric labels: use detection time
  const baseMin = parseInt(base[0], 10);

  // Stoppage is the number following a "+", tolerant of an apostrophe between
  // them ("45'+1", "45+2'", "90'+3").
  const stoppage = label.match(/\+\s*'?\s*(\d+)/);
  const stoppageMin = stoppage ? parseInt(stoppage[1], 10) : 0;

  const breakMin = baseMin >= 46 ? 15 : 0;
  const elapsedMs = (baseMin + stoppageMin + breakMin) * 60_000;
  return new Date(kickoffMs + elapsedMs).toISOString();
}
