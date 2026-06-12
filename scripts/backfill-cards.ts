/**
 * One-off backfill: capture yellow/red cards for FINISHED group-stage matches
 * whose BBC per-match page was never scraped while they were live — e.g. games
 * played before the per-match card scraper was deployed. The scores-fixtures
 * feed only carries goals + red cards; the full booking list (yellows included)
 * lives on each match's page, so we read it here and merge it into
 * `Match.actions`. Writes are silent (no feed events — these bookings are old).
 *
 * After running, POST /api/refresh once so team stats recompute from the
 * updated matches (deriveCardCounts picks the yellows up).
 *
 * Usage (prod): IS_LOCAL=  TABLE_PREFIX=sweepstake-dev- AWS_REGION=eu-west-2 \
 *   npx ts-node --transpile-only --project scripts/tsconfig.json scripts/backfill-cards.ts
 * Preview first with DRY_RUN=1 (no writes).
 */
import { getAllMatches, putMatch } from '../packages/api/src/db/dynamodb';
import { fetchBbcFixtures } from '../packages/api/src/clients/bbcScraper';
import { fetchMatchCards } from '../packages/api/src/clients/bbcMatchPage';
import { Match, MatchAction } from '@sweepstake/shared';

const DRY_RUN = process.env.DRY_RUN === '1';
const sameDay = (a: string, b: string) => a.slice(0, 10) === b.slice(0, 10);

// Match-page is authoritative for cards: keep the fixtures-feed goals, take all
// cards from the page, de-dupe on team|type|player|minute (so a red reported by
// both sources never doubles).
function mergeCardActions(existing: MatchAction[], pageCards: MatchAction[]): MatchAction[] {
  const seen = new Set<string>();
  const out: MatchAction[] = [];
  for (const a of [...existing.filter((x) => x.type === 'GOAL'), ...pageCards]) {
    const k = `${a.team}|${a.type}|${a.player}|${a.minute}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

async function main() {
  const matches = (await getAllMatches()) as unknown as Match[];
  const targets = matches.filter(
    (m) =>
      m.status === 'FINISHED' &&
      m.stage === 'GROUP_STAGE' &&
      !(m.actions ?? []).some((a) => a.type === 'YELLOW_CARD'),
  );
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Finished group matches with no yellow card on record: ${targets.length}`);
  if (targets.length === 0) return;

  // The fixtures feed is a rolling current-day view, so matches played on
  // earlier days aren't in it. Known per-match topic ids (captured by hand for
  // already-played games) take precedence; otherwise correlate against today's
  // fixtures by team + date.
  const KNOWN_TOPICS: Record<string, string> = {
    'MEX-RSA': 'c0myn4dwvzkt',
    'KOR-CZE': 'ckg0vvrg70vt',
  };
  const fixtures = await fetchBbcFixtures().catch(() => []);
  for (const m of targets) {
    const key = `${m.homeTeam}-${m.awayTeam}`;
    const topicId =
      KNOWN_TOPICS[key] ??
      fixtures.find(
        (f) => f.homeTeam === m.homeTeam && f.awayTeam === m.awayTeam && sameDay(f.datetime, m.datetime),
      )?.tipoTopicId;
    if (!topicId) {
      console.log(`  ${key}: no per-match topic id available — skipped`);
      continue;
    }
    let cards: MatchAction[];
    try {
      cards = await fetchMatchCards(topicId);
    } catch (error) {
      console.log(`  ${m.homeTeam}-${m.awayTeam}: match-page fetch failed — ${(error as Error).message}`);
      continue;
    }
    const yellows = cards.filter((c) => c.type === 'YELLOW_CARD').length;
    const reds = cards.filter((c) => c.type === 'RED_CARD').length;
    const merged = mergeCardActions(m.actions ?? [], cards);
    console.log(
      `  ${m.homeTeam}-${m.awayTeam}: page has ${yellows} yellow(s) + ${reds} red(s); actions ${(m.actions ?? []).length} -> ${merged.length}`,
    );
    if (!DRY_RUN) {
      await putMatch({ ...m, actions: merged } as unknown as Record<string, unknown>);
    }
  }
  console.log(
    DRY_RUN ? '[DRY RUN] no writes performed.' : 'Done. Now POST /api/refresh so team stats recompute.',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
