import { Team, Match, ChannelBroadcast, MatchStatus, KnockoutFeeder } from './types';
import { feedersForSlot, TEAM_R32_SLOT } from './knockoutStructure';

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

// A placeholder slot at a fixed bracket position, carrying the feeder labels the
// structure dictates ("Winner Match 77") so an undecided tie still shows where it
// comes from instead of a bare "TBD".
function skeletonSlot(round: string, roundIndex: number, slotIndex: number): BracketSlot {
  const feeders = feedersForSlot(roundIndex, slotIndex);
  const slot = emptySlot(round, slotIndex);
  slot.homeFeeder = feeders.home;
  slot.awayFeeder = feeders.away;
  return slot;
}

// A real fixture placed at its fixed bracket slot. Falls back to the structural
// feeder for a side the fixture left blank (e.g. a scheduled tie BBC gave no
// placeholder for), so the slot always reads sensibly.
function placedSlot(match: Match, roundIndex: number, slotIndex: number): BracketSlot {
  const slot = matchToSlot(match);
  const feeders = feedersForSlot(roundIndex, slotIndex);
  if (!slot.homeTeam && !slot.homeFeeder) slot.homeFeeder = feeders.home;
  if (!slot.awayTeam && !slot.awayFeeder) slot.awayFeeder = feeders.away;
  return slot;
}

/**
 * Build the knockout bracket on the fixed 2026 skeleton (see knockoutStructure):
 * one column per round, every tie at its true bracket position so the tree never
 * re-orders as results come in. Each fixture is placed by the team in it — a team
 * is anchored to its Round-of-32 slot, and any later-round tie it reaches sits at
 * (that slot >> round), the bracket's fold. Slots with no fixture yet render as
 * structural placeholders labelled with the feeding tie ("Winner Match 77").
 *
 * The matchups are never invented: who plays whom always comes from the live feed
 * (a fixture is only *placed*, never paired here). The structure supplies position
 * and feeder labels only. A fixture whose team isn't in the bracket map (shouldn't
 * happen for real data) falls back into the next free slot rather than vanishing.
 */
export function buildKnockoutTree(matches: Match[]): TreeRound[] {
  return ROUNDS.map((round, roundIndex) => {
    const size = ROUND_SIZES[round];
    const placed: (BracketSlot | null)[] = new Array(size).fill(null);
    const overflow: Match[] = [];

    const roundMatches = matches
      .filter((m) => m.stage === round)
      .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

    for (const match of roundMatches) {
      // Anchor on whichever side is a real team we know the bracket position of;
      // an all-placeholder future tie isn't placed (the skeleton already shows it).
      const anchor =
        match.homeTeam && match.homeTeam in TEAM_R32_SLOT
          ? match.homeTeam
          : match.awayTeam && match.awayTeam in TEAM_R32_SLOT
            ? match.awayTeam
            : null;
      if (anchor === null) {
        if (match.homeTeam || match.awayTeam) overflow.push(match); // resolved but off-bracket
        continue;
      }
      const slotIndex = TEAM_R32_SLOT[anchor] >> roundIndex;
      if (slotIndex < size && placed[slotIndex] === null) {
        placed[slotIndex] = placedSlot(match, roundIndex, slotIndex);
      } else {
        overflow.push(match);
      }
    }

    // Fill the column: a placed fixture, else an unplaceable fixture (kept rather
    // than lost), else the structural placeholder for that position.
    let next = 0;
    const slots: BracketSlot[] = [];
    for (let i = 0; i < size; i++) {
      if (placed[i]) {
        slots.push(placed[i]!);
      } else if (next < overflow.length) {
        slots.push(placedSlot(overflow[next++], roundIndex, i));
      } else {
        slots.push(skeletonSlot(round, roundIndex, i));
      }
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
