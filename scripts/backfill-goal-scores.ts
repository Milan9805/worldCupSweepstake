/**
 * One-off backfill: repair stored GOAL feed events that were stamped with the
 * match's FINAL score (and detection-time ordering) instead of the running
 * scoreline + real match-clock time. This happened whenever several goals were
 * caught in a single poll — a scraper gap, or the first time an in-progress /
 * finished match was seen — so every goal in that batch read the final score and
 * collapsed to one timestamp (e.g. SWE 5–1 TUN's late goals all reading "5–1"
 * and sitting below FULL TIME). Finished matches drop out of the scrape ~3h after
 * kickoff and never recompute, so they need this manual pass.
 *
 * Recomputes each goal's running scoreline (`goalLine`) and its match-clock
 * `occurredAt` (`actionTimestamp` from the stored scorerMinute), then rewrites the
 * row IN PLACE — reusing the event's existing `ts` rebuilds the same sort key, so
 * no duplicate row and the feed order is preserved. No `/api/refresh` needed:
 * team stats derive from Match.actions/standings, not feed payloads.
 *
 * Also back-fills KICKOFF events with `occurredAt` = the match datetime, so their
 * "X ago" tracks the match clock instead of when we detected the SCHEDULED->LIVE
 * flip (a kickoff scraped late shouldn't read as if it just happened).
 *
 *   npx ts-node --transpile-only --project scripts/tsconfig.json scripts/backfill-goal-scores.ts
 * Preview first with DRY_RUN=1 (no writes).
 */
import { getAllMatches, getRecentEvents, putEvent } from '../packages/api/src/db/dynamodb';
import { goalLine, actionTimestamp, isoOrNull } from '../packages/api/src/services/detectEvents';
import { FeedEvent, Match } from '@sweepstake/shared';

const DRY_RUN = process.env.DRY_RUN === '1';

async function main() {
  const matches = (await getAllMatches()) as unknown as Match[];
  const byId = new Map(matches.map((m) => [m.matchId, m]));

  // The events table is a few hundred rows all tournament; 600 covers it whole.
  const events = await getRecentEvents(600);
  const goals = events.filter((e) => e.type === 'GOAL');
  const kickoffs = events.filter((e) => e.type === 'KICKOFF');
  console.log(
    `${DRY_RUN ? '[DRY RUN] ' : ''}On record: ${goals.length} goal(s), ${kickoffs.length} kickoff(s)`,
  );

  let changed = 0;

  for (const ev of goals) {
    const match = ev.matchId ? byId.get(ev.matchId) : undefined;
    const side = ev.payload.side;
    const index = ev.payload.goalIndex;
    if (!match || (side !== 'home' && side !== 'away') || typeof index !== 'number') {
      console.log(`  ${ev.eventId}: missing match/side/goalIndex — skipped`);
      continue;
    }

    const line = goalLine(match, side, index);
    const scorerMinute = ev.payload.scorerMinute as string | undefined;
    const occurredAt = actionTimestamp(match.datetime, scorerMinute) ?? undefined;

    const scoreChanged = ev.payload.homeScore !== line.home || ev.payload.awayScore !== line.away;
    const occurredChanged = occurredAt !== undefined && occurredAt !== ev.payload.occurredAt;
    if (!scoreChanged && !occurredChanged) continue;

    const payload: Record<string, unknown> = {
      ...ev.payload,
      homeScore: line.home,
      awayScore: line.away,
    };
    if (occurredAt !== undefined) payload.occurredAt = occurredAt;

    console.log(
      `  ${ev.matchId} ${ev.eventId}: ${ev.payload.homeScore}-${ev.payload.awayScore} -> ${line.home}-${line.away}` +
        (occurredChanged ? ` | occurredAt ${ev.payload.occurredAt ?? '—'} -> ${occurredAt}` : ''),
    );
    changed++;
    if (!DRY_RUN) await putEvent({ ...ev, payload } as FeedEvent);
  }

  // KICKOFF: anchor occurredAt to the match datetime so "X ago" tracks the clock.
  for (const ev of kickoffs) {
    const match = ev.matchId ? byId.get(ev.matchId) : undefined;
    if (!match) {
      console.log(`  ${ev.eventId}: no match on record — skipped`);
      continue;
    }
    const occurredAt = isoOrNull(match.datetime);
    if (!occurredAt || occurredAt === ev.payload.occurredAt) continue;

    console.log(
      `  ${ev.matchId} ${ev.eventId}: occurredAt ${ev.payload.occurredAt ?? '—'} -> ${occurredAt}`,
    );
    changed++;
    if (!DRY_RUN) {
      await putEvent({ ...ev, payload: { ...ev.payload, occurredAt } } as FeedEvent);
    }
  }

  console.log(
    DRY_RUN
      ? `[DRY RUN] ${changed} event(s) would change; no writes performed.`
      : `Done. ${changed} event(s) updated.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
