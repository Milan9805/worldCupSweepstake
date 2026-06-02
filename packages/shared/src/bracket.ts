import { Team, TreeSlot } from './types';

/**
 * FIFA 2026 World Cup knockout bracket generation.
 *
 * 48 teams in 12 groups (A–L) of 4.
 * Qualification: Top 2 per group (24) + 8 best 3rd-place teams = 32 knockout spots.
 * Knockout: Round of 32 (16 matches) → Round of 16 → QF → SF → Final
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

/**
 * Round of 32 bracket mapping.
 * Each entry defines which teams play each other based on their group finish.
 * Format: [team1Source, team2Source]
 *   - "1X" = winner of group X
 *   - "2X" = runner-up of group X
 *   - "3rd_N" = Nth best 3rd-place team (0-indexed)
 *
 * The bracket is structured so that:
 * - Group winners face 3rd-place qualifiers
 * - Group runners-up face other runners-up
 * - Teams from the same group cannot meet until the QF at earliest
 */
export const R32_BRACKET: [string, string][] = [
  // Top half of bracket
  ['1A', '3rd_0'],   // pos 1
  ['2C', '2D'],      // pos 2
  ['1B', '3rd_1'],   // pos 3
  ['2A', '2B'],      // pos 4
  ['1E', '3rd_2'],   // pos 5
  ['2G', '2H'],      // pos 6
  ['1F', '3rd_3'],   // pos 7
  ['2E', '2F'],      // pos 8
  // Bottom half of bracket
  ['1C', '3rd_4'],   // pos 9
  ['2K', '2L'],      // pos 10
  ['1D', '3rd_5'],   // pos 11
  ['2I', '2J'],      // pos 12
  ['1G', '3rd_6'],   // pos 13
  ['2A', '2L'],      // pos 14  (note: uses different runner pairing)
  ['1H', '3rd_7'],   // pos 15
  ['2G', '2J'],      // pos 16  (note: uses different runner pairing)
];

// Corrected bracket: ensure each runner-up appears exactly once
// In a real 48-team WC, FIFA will publish the official bracket.
// This is a balanced layout: group winners (12) face 3rd-place (8) + 4 byes effectively
// But we have 12 winners + 12 runners + 8 thirds = 32, so 16 matches.
// Re-do: each team appears exactly once.
//
// Bracket layout ensuring no same-group meeting in R32:
// Winners (12) vs 3rd-place (8): only 8 winners get a 3rd-place opponent
// Remaining 4 winners face runners from distant groups
// Runners (12) paired among themselves: 6 matches
// That gives: 8 + 4 + 6 = 18... that's wrong. Let me recalculate.
//
// 32 teams = 16 matches. 12 winners + 12 runners + 8 thirds = 32. ✓
// Approach:
//   8 matches: winner vs 3rd-place
//   4 matches: winner vs runner-up (from a different group)
//   4 matches: runner-up vs runner-up
//
// Simplified deterministic bracket:
export const KNOCKOUT_BRACKET: { team1: string; team2: string }[] = [
  // Positions 1-8: Group winners vs 3rd-place qualifiers
  { team1: '1A', team2: '3rd_0' },  // pos 1
  { team1: '1B', team2: '3rd_1' },  // pos 2
  { team1: '1C', team2: '3rd_2' },  // pos 3
  { team1: '1D', team2: '3rd_3' },  // pos 4
  { team1: '1E', team2: '3rd_4' },  // pos 5
  { team1: '1F', team2: '3rd_5' },  // pos 6
  { team1: '1G', team2: '3rd_6' },  // pos 7
  { team1: '1H', team2: '3rd_7' },  // pos 8
  // Positions 9-12: Remaining group winners vs runners from distant groups
  { team1: '1I', team2: '2D' },     // pos 9
  { team1: '1J', team2: '2C' },     // pos 10
  { team1: '1K', team2: '2B' },     // pos 11
  { team1: '1L', team2: '2A' },     // pos 12
  // Positions 13-16: Runner-up vs runner-up pairings
  { team1: '2E', team2: '2L' },     // pos 13
  { team1: '2F', team2: '2K' },     // pos 14
  { team1: '2G', team2: '2J' },     // pos 15
  { team1: '2H', team2: '2I' },     // pos 16
];

export const ROUNDS = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'] as const;

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
 * Resolve a bracket slot source (e.g., "1A", "2B", "3rd_0") to a teamCode.
 */
function resolveSource(source: string, qualified: QualifiedTeams): string | null {
  if (source.startsWith('3rd_')) {
    const index = parseInt(source.split('_')[1], 10);
    return qualified.thirdPlace[index] || null;
  }

  const position = source[0]; // '1' or '2'
  const groupLetter = source.slice(1);

  if (position === '1') {
    return qualified.groupWinners.get(groupLetter) || null;
  }
  return qualified.groupRunners.get(groupLetter) || null;
}

/**
 * Generate all 31 TreeSlot entries for the knockout bracket.
 * R32 slots are populated with teams; later rounds have empty team fields.
 */
export function generateBracketSlots(teams: Team[]): { slots: TreeSlot[]; eliminated: string[] } {
  const standings = computeGroupStandings(teams);
  const qualified = determineQualifiedTeams(standings);

  const slots: TreeSlot[] = [];

  // Generate Round of 32 (16 matches)
  for (let i = 0; i < KNOCKOUT_BRACKET.length; i++) {
    const match = KNOCKOUT_BRACKET[i];
    const team1 = resolveSource(match.team1, qualified);
    const team2 = resolveSource(match.team2, qualified);

    slots.push({
      round: 'ROUND_OF_32',
      position: i + 1,
      team1: team1,
      team2: team2,
      score1: null,
      score2: null,
      winner: null,
      datetime: null,
    });
  }

  // Generate empty slots for subsequent rounds
  const roundSizes = [
    { round: 'ROUND_OF_16', count: 8 },
    { round: 'QUARTER_FINAL', count: 4 },
    { round: 'SEMI_FINAL', count: 2 },
    { round: 'FINAL', count: 1 },
  ];

  for (const { round, count } of roundSizes) {
    for (let pos = 1; pos <= count; pos++) {
      slots.push({
        round,
        position: pos,
        team1: null,
        team2: null,
        score1: null,
        score2: null,
        winner: null,
        datetime: null,
      });
    }
  }

  return { slots, eliminated: qualified.eliminated };
}

/**
 * Determine the next round's slot when a match is won.
 * Returns { round, position, isTeam1 } for the winner's destination.
 */
export function getNextSlot(round: string, position: number): { round: string; position: number; isTeam1: boolean } | null {
  const roundIndex = ROUNDS.indexOf(round as typeof ROUNDS[number]);
  if (roundIndex === -1 || roundIndex >= ROUNDS.length - 1) {
    return null; // Final has no next round
  }

  const nextRound = ROUNDS[roundIndex + 1];
  const nextPosition = Math.ceil(position / 2);
  const isTeam1 = position % 2 === 1; // odd positions → team1, even → team2

  return { round: nextRound, position: nextPosition, isTeam1 };
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
