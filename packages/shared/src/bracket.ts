import { Team } from './types';

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
