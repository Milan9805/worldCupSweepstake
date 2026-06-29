import { Team, Person } from './types';

/**
 * Honours Board — secondary "fun" prizes derived purely from team stats
 * aggregated per owner (via {@link Person.teams}). No events, no extra fetching:
 * everything here is a deterministic function of the already-loaded teams +
 * group members, so it can be computed client-side.
 *
 * Each prize is a ranked table: an ordered array of {@link HonourRow} with the
 * winner first. The "best" direction differs per prize (most goals vs fewest
 * conceded), but every table is always returned winner-first.
 */

// ===== Card weighting =====
//
// Discipline prizes (Cleanest / Dirtiest) need a single comparable number per
// owner. We weight a red card more heavily than a yellow because a sending-off
// is the more serious offence. Documented + exported so the UI can show the
// rule and tests can assert against it.
//   yellow = 1 point, red = 3 points.
export const YELLOW_CARD_WEIGHT = 1;
export const RED_CARD_WEIGHT = 3;

export function cardScore(stats: { yellowCards: number; redCards: number }): number {
  return stats.yellowCards * YELLOW_CARD_WEIGHT + stats.redCards * RED_CARD_WEIGHT;
}

// ===== Stage ranking (Deepest Run) =====
//
// Maps a team's furthest reached stage to a comparable rank (higher = deeper).
// A team that is still alive (not eliminated) ranks above every eliminated team.
// A team that won the final is a Champion and ranks highest of all.
//
// `Team.eliminatedAt` is a stage NAME. Across the codebase it appears in two
// forms — the friendly form written by generateTree ("Round of 16", "Quarter
// Final", …) and the raw enum form used elsewhere ("ROUND_OF_16"). We normalise
// both so the prize is robust regardless of which the backend persisted.
export const STAGE_RANK = {
  GROUP_STAGE: 0,
  ROUND_OF_32: 1,
  ROUND_OF_16: 2,
  QUARTER_FINAL: 3,
  SEMI_FINAL: 4,
  FINAL: 5,
  ALIVE: 6, // still in the tournament (not eliminated)
  CHAMPION: 7, // won the final
} as const;

const STAGE_LABEL: Record<keyof typeof STAGE_RANK, string> = {
  GROUP_STAGE: 'Group Stage',
  ROUND_OF_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINAL: 'Quarter Final',
  SEMI_FINAL: 'Semi Final',
  FINAL: 'Final',
  ALIVE: 'Still in',
  CHAMPION: 'Champion 🏆',
};

// Normalise any stage-name spelling to a STAGE_RANK key. Unknown values fall
// back to the group stage (the shallowest run) so a stray label never wins.
function normaliseStage(name: string): keyof typeof STAGE_RANK {
  const key = name.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (key in STAGE_RANK) return key as keyof typeof STAGE_RANK;
  return 'GROUP_STAGE';
}

// The deepest stage a single team reached, as a STAGE_RANK key.
function teamStageKey(team: Team): keyof typeof STAGE_RANK {
  if (!team.eliminated) return 'ALIVE';
  if (!team.eliminatedAt) return 'GROUP_STAGE';
  return normaliseStage(team.eliminatedAt);
}

// ===== Types =====

/**
 * One owner's row in a prize table. `value` is the prize's headline metric;
 * `breakdown` carries the secondary numbers the UI shows under it (and that the
 * documented tiebreaks use). `teams` is the count of the owner's teams that
 * contributed (0 when they own no loaded teams); `teamsAlive` is how many of
 * those are still in the tournament (not eliminated).
 */
export interface HonourRow {
  person: string;
  value: number;
  teams: number;
  teamsAlive: number;
  breakdown: {
    goalsFor: number;
    goalsAgainst: number;
    points: number;
    cardScore: number;
    yellowCards: number;
    redCards: number;
    bestStageRank: number;
    bestStageLabel: string;
  };
}

export type HonourPrizeId =
  | 'mostGoals'
  | 'bestDefence'
  | 'cleanest'
  | 'dirtiest'
  | 'bestGroupRecord'
  | 'deepestRun';

export interface HonourPrize {
  id: HonourPrizeId;
  title: string;
  description: string;
  /** Suffix shown after the headline `value` (e.g. "goals", "pts"). */
  unit: string;
  /** Ranked rows, winner first. */
  rows: HonourRow[];
}

export interface HonoursResult {
  prizes: HonourPrize[];
}

// ===== Aggregation =====

// Per-owner totals aggregated over the teams they own that are present in the
// loaded teams list. Owners with no loaded teams default every value to 0.
function aggregate(members: Person[], teams: Team[]): HonourRow[] {
  const teamMap = new Map(teams.map((t) => [t.teamCode, t]));

  return members.map((person) => {
    const owned = person.teams
      .map((code) => teamMap.get(code))
      .filter((t): t is Team => t !== undefined);

    let goalsFor = 0;
    let goalsAgainst = 0;
    let points = 0;
    let yellowCards = 0;
    let redCards = 0;
    let bestStageRank: number = STAGE_RANK.GROUP_STAGE;
    let bestStageKey: keyof typeof STAGE_RANK = 'GROUP_STAGE';

    for (const team of owned) {
      goalsFor += team.stats.goalsFor;
      goalsAgainst += team.stats.goalsAgainst;
      points += team.stats.points;
      yellowCards += team.stats.yellowCards;
      redCards += team.stats.redCards;
      const key = teamStageKey(team);
      if (STAGE_RANK[key] > bestStageRank) {
        bestStageRank = STAGE_RANK[key];
        bestStageKey = key;
      }
    }

    const cards = yellowCards * YELLOW_CARD_WEIGHT + redCards * RED_CARD_WEIGHT;
    const teamsAlive = owned.filter((t) => !t.eliminated).length;

    return {
      person: person.name,
      value: 0, // set per-prize below
      teams: owned.length,
      teamsAlive,
      breakdown: {
        goalsFor,
        goalsAgainst,
        points,
        cardScore: cards,
        yellowCards,
        redCards,
        bestStageRank,
        bestStageLabel: STAGE_LABEL[bestStageKey],
      },
    };
  });
}

// Stable name comparator — final tiebreak everywhere so ordering is fully
// deterministic regardless of input order.
function byName(a: HonourRow, b: HonourRow): number {
  return a.person.localeCompare(b.person);
}

// Rank rows with the supplied comparator, stamping each row's headline `value`.
// The comparator returns the "better first" ordering for that prize.
function rank(
  rows: HonourRow[],
  value: (r: HonourRow) => number,
  cmp: (a: HonourRow, b: HonourRow) => number,
): HonourRow[] {
  return rows
    .map((r) => ({ ...r, value: value(r) }))
    .sort(cmp);
}

/**
 * Compute every Honours Board prize for a group.
 *
 * For each member we aggregate over the teams they own ({@link Person.teams} of
 * teamCodes → {@link Team.stats}). Owners whose teams have played zero matches
 * (or who own no loaded teams) aggregate to 0 across the board and are still
 * ranked — they typically surface at the wrong end of each table.
 *
 * TIEBREAKS (documented, deterministic — applied in order, name last):
 *  - Most Goals      : goalsFor desc → goalsAgainst asc → name.
 *  - Best Defence    : goalsAgainst asc → goalsFor desc → name.
 *  - Cleanest        : cardScore asc → redCards asc → name.
 *  - Dirtiest        : cardScore desc → redCards desc → name.
 *  - Best Group Rec. : points desc → goalsFor desc → goalsAgainst asc → name.
 *  - Deepest Run     : bestStageRank desc → points desc → name.
 */
export function computeHonours(teams: Team[], members: Person[]): HonoursResult {
  const base = aggregate(members, teams);

  const mostGoals = rank(
    base,
    (r) => r.breakdown.goalsFor,
    (a, b) =>
      b.breakdown.goalsFor - a.breakdown.goalsFor ||
      a.breakdown.goalsAgainst - b.breakdown.goalsAgainst ||
      byName(a, b),
  );

  const bestDefence = rank(
    base,
    (r) => r.breakdown.goalsAgainst,
    (a, b) =>
      a.breakdown.goalsAgainst - b.breakdown.goalsAgainst ||
      b.breakdown.goalsFor - a.breakdown.goalsFor ||
      byName(a, b),
  );

  const cleanest = rank(
    base,
    (r) => r.breakdown.cardScore,
    (a, b) =>
      a.breakdown.cardScore - b.breakdown.cardScore ||
      a.breakdown.redCards - b.breakdown.redCards ||
      byName(a, b),
  );

  const dirtiest = rank(
    base,
    (r) => r.breakdown.cardScore,
    (a, b) =>
      b.breakdown.cardScore - a.breakdown.cardScore ||
      b.breakdown.redCards - a.breakdown.redCards ||
      byName(a, b),
  );

  const bestGroupRecord = rank(
    base,
    (r) => r.breakdown.points,
    (a, b) =>
      b.breakdown.points - a.breakdown.points ||
      b.breakdown.goalsFor - a.breakdown.goalsFor ||
      a.breakdown.goalsAgainst - b.breakdown.goalsAgainst ||
      byName(a, b),
  );

  const deepestRun = rank(
    base,
    (r) => r.breakdown.bestStageRank,
    (a, b) =>
      b.breakdown.bestStageRank - a.breakdown.bestStageRank ||
      b.breakdown.points - a.breakdown.points ||
      byName(a, b),
  );

  return {
    prizes: [
      {
        id: 'mostGoals',
        title: 'Most Goals',
        description: 'Most goals scored across all your teams.',
        unit: 'goals',
        rows: mostGoals,
      },
      {
        id: 'bestDefence',
        title: 'Best Defence',
        description: 'Fewest goals conceded across all your teams.',
        unit: 'conceded',
        rows: bestDefence,
      },
      {
        id: 'cleanest',
        title: 'Cleanest',
        description: `Fewest cards (yellow = ${YELLOW_CARD_WEIGHT}, red = ${RED_CARD_WEIGHT}).`,
        unit: 'card pts',
        rows: cleanest,
      },
      {
        id: 'dirtiest',
        title: 'Dirtiest',
        description: `Most cards (yellow = ${YELLOW_CARD_WEIGHT}, red = ${RED_CARD_WEIGHT}).`,
        unit: 'card pts',
        rows: dirtiest,
      },
      {
        id: 'bestGroupRecord',
        title: 'Best Group-Stage Record',
        description: 'Most league points across all your teams.',
        unit: 'pts',
        rows: bestGroupRecord,
      },
      {
        id: 'deepestRun',
        title: 'Deepest Run',
        description: 'The furthest tournament stage any of your teams reached.',
        unit: '',
        rows: deepestRun,
      },
    ],
  };
}
