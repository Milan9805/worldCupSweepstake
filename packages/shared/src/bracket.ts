import { Team, Match, ChannelBroadcast, MatchStatus, KnockoutFeeder } from './types';

/**
 * FIFA 2026 World Cup group-stage qualification.
 *
 * 48 teams in 12 groups (A–L) of 4.
 * Qualification: Top 2 per group (24) + 8 best 3rd-place teams = 32 knockout spots.
 *
 * The knockout matchups themselves are sourced from the real scraped fixtures
 * (see the frontend's match-driven tree), not generated here — so this module
 * only computes standings and which teams qualify / are eliminated.
 */

// ===== Types =====

export interface GroupStandingEntry {
  teamCode: string;
  points: number;
  goalDifference: number;
  goalsFor: number;
  groupLetter: string;
}

export interface QualifiedTeams {
  groupWinners: Map<string, string>; // groupLetter → teamCode
  groupRunners: Map<string, string>; // groupLetter → teamCode
  thirdPlace: string[]; // 8 best 3rd-place teamCodes, ordered by rank
  eliminated: string[]; // teams that didn't qualify
}

// ===== Constants =====

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

// Knockout rounds in order, biggest to smallest. The single source of truth for
// "which knockout round comes after which" (e.g. teamProgress ranks a team's
// furthest round by this order).
export const ROUNDS = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'] as const;

// Number of ties in each knockout round — the bracket halves each round. Used to
// render the full path to the final (later rounds show "to be confirmed" slots
// before they're decided) and to size the derived rounds in buildKnockoutTree.
export const ROUND_SIZES: Record<string, number> = {
  ROUND_OF_32: 16,
  ROUND_OF_16: 8,
  QUARTER_FINAL: 4,
  SEMI_FINAL: 2,
  FINAL: 1,
};

// Display labels for each round (plural where the bracket reads better that way).
export const ROUND_LABELS: Record<string, string> = {
  ROUND_OF_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINAL: 'Quarter Finals',
  SEMI_FINAL: 'Semi Finals',
  FINAL: 'Final',
};

// ===== Functions =====

/**
 * Compute group standings from team data.
 * Returns teams sorted within each group by: points → goal difference → goals for.
 */
export function computeGroupStandings(teams: Team[]): Map<string, GroupStandingEntry[]> {
  const groups = new Map<string, GroupStandingEntry[]>();

  for (const letter of GROUP_LETTERS) {
    const groupTeams = teams
      .filter((t) => t.groupLetter === letter)
      .map((t) => ({
        teamCode: t.teamCode,
        points: t.stats.points,
        goalDifference: t.stats.goalDifference,
        goalsFor: t.stats.goalsFor,
        groupLetter: t.groupLetter,
      }))
      .sort((a, b) =>
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor
      );
    groups.set(letter, groupTeams);
  }

  return groups;
}

/**
 * Determine which teams qualify for the knockout stage.
 */
export function determineQualifiedTeams(standings: Map<string, GroupStandingEntry[]>): QualifiedTeams {
  const groupWinners = new Map<string, string>();
  const groupRunners = new Map<string, string>();
  const allThirds: GroupStandingEntry[] = [];
  const eliminated: string[] = [];

  for (const [letter, group] of standings) {
    if (group.length < 3) continue;

    groupWinners.set(letter, group[0].teamCode);
    groupRunners.set(letter, group[1].teamCode);
    allThirds.push(group[2]);

    // 4th place teams are eliminated
    if (group.length >= 4) {
      eliminated.push(group[3].teamCode);
    }
  }

  // Rank 3rd-place teams: same criteria (pts → GD → GF)
  allThirds.sort((a, b) =>
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor
  );

  // Top 8 3rd-place teams qualify
  const thirdPlace = allThirds.slice(0, 8).map((t) => t.teamCode);
  const eliminatedThirds = allThirds.slice(8).map((t) => t.teamCode);

  return {
    groupWinners,
    groupRunners,
    thirdPlace,
    eliminated: [...eliminated, ...eliminatedThirds],
  };
}

/**
 * Check if all groups have completed their matches
 * (all teams have played 3 group stage matches).
 */
export function isGroupStageComplete(teams: Team[]): boolean {
  const groupTeams = teams.filter((t) => GROUP_LETTERS.includes(t.groupLetter));
  if (groupTeams.length === 0) return false;
  return groupTeams.every((t) => t.stats.played >= 3);
}

// ===== Knockout tree (winner advancement) =====

/**
 * One tie in the bracket, taken straight from a knockout fixture. A side is
 * `null` when the draw hasn't placed a team there yet; `homeFeeder`/`awayFeeder`
 * then name the tie it comes from ("Winner of Match 77") so the UI can label it
 * instead of a bare "TBD".
 */
export interface BracketSlot {
  slotId: string; // stable React key: the feed matchId, else `${round}-${index}` for a padding slot
  homeTeam: string | null;
  awayTeam: string | null;
  homeFeeder?: KnockoutFeeder | null;
  awayFeeder?: KnockoutFeeder | null;
  homeScore: number | null;
  awayScore: number | null;
  // Penalty shootout tally for a tie decided on pens (null otherwise); drives the
  // winner highlight and the "pens H–A" line in the bracket.
  penaltyHome?: number | null;
  penaltyAway?: number | null;
  status: MatchStatus;
  datetime: string | null;
  channels?: ChannelBroadcast[];
  minute?: string | null;
}

export interface TreeRound {
  round: string;
  label: string;
  slots: BracketSlot[];
}

function matchToSlot(m: Match): BracketSlot {
  return {
    slotId: m.matchId,
    homeTeam: m.homeTeam || null,
    awayTeam: m.awayTeam || null,
    homeFeeder: m.homeFeeder ?? null,
    awayFeeder: m.awayFeeder ?? null,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    penaltyHome: m.penaltyHome ?? null,
    penaltyAway: m.penaltyAway ?? null,
    status: m.status,
    datetime: m.datetime,
    channels: m.channels,
    minute: m.minute,
  };
}

function emptySlot(round: string, index: number): BracketSlot {
  return {
    slotId: `${round}-${index}`,
    homeTeam: null,
    awayTeam: null,
    homeFeeder: null,
    awayFeeder: null,
    homeScore: null,
    awayScore: null,
    penaltyHome: null,
    penaltyAway: null,
    status: 'SCHEDULED',
    datetime: null,
    minute: null,
  };
}

/**
 * Build the knockout bracket straight from the fixtures feed — one column per
 * round, each round's real fixtures in kick-off order. The fixtures are the
 * source of truth for the matchups: the scraper resolves each tie's teams (and
 * an unresolved side's feeder, e.g. "Winner of Match 77") as the draw fills in,
 * so we never *guess* who plays whom. A round with fewer fixtures than its size
 * is padded with placeholder slots so the full path to the final always renders.
 *
 * (The pairing is deliberately NOT computed by position: the real bracket order
 * isn't recoverable from kick-off time — adjacent-by-time ties are not
 * adjacent-in-bracket — so anything other than the feed's own matchups is wrong.)
 */
export function buildKnockoutTree(matches: Match[]): TreeRound[] {
  return ROUNDS.map((round) => {
    const slots = matches
      .filter((m) => m.stage === round)
      .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
      .map(matchToSlot);

    for (let k = slots.length; k < ROUND_SIZES[round]; k++) {
      slots.push(emptySlot(round, k));
    }

    return { round, label: ROUND_LABELS[round], slots };
  });
}

/**
 * The team that advances from a finished tie, or null when it isn't decided
 * (unfinished, missing score, or level with no shootout tally). A tie level on
 * the pitch is resolved by the penalty shootout. Used to wire the bracket's
 * connector lines by tracing a placed team back to the tie it won.
 */
export function tieWinner(slot: BracketSlot): string | null {
  if (slot.status !== 'FINISHED' || slot.homeScore == null || slot.awayScore == null) return null;
  if (slot.homeScore > slot.awayScore) return slot.homeTeam;
  if (slot.awayScore > slot.homeScore) return slot.awayTeam;
  if (slot.penaltyHome != null && slot.penaltyAway != null) {
    if (slot.penaltyHome > slot.penaltyAway) return slot.homeTeam;
    if (slot.penaltyAway > slot.penaltyHome) return slot.awayTeam;
  }
  return null;
}
