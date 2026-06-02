import { Team, LeaderboardEntry, Person } from './types';

/**
 * Calculate win probability for a person based on their teams' status.
 * Uses a weighted formula combining FIFA ranking, tournament performance, and elimination stage.
 */

const STAGE_WEIGHTS: Record<string, number> = {
  GROUP_STAGE: 1,
  ROUND_OF_32: 2,
  ROUND_OF_16: 3,
  QUARTER_FINAL: 5,
  SEMI_FINAL: 8,
  FINAL: 15,
};

const MAX_FIFA_RANKING = 211;

/**
 * Calculate a raw strength score for a single team.
 * Higher is better.
 */
export function teamStrength(team: Team): number {
  if (team.eliminated) return 0;

  // Ranking component: higher ranked teams (lower number) get more points
  const rankingScore = (MAX_FIFA_RANKING - team.fifaRanking) / MAX_FIFA_RANKING;

  // Performance component: based on group stage stats
  const performanceScore =
    (team.stats.points * 3 + team.stats.goalDifference + team.stats.goalsFor * 0.5) / 30;

  // Combine with weights
  return rankingScore * 0.6 + Math.max(0, performanceScore) * 0.4;
}

/**
 * Calculate win probability for each person in a group.
 * Returns normalized probabilities that sum to 1.0 across all people.
 */
export function calculateLeaderboard(
  members: Person[],
  teams: Team[]
): LeaderboardEntry[] {
  const teamMap = new Map(teams.map((t) => [t.teamCode, t]));

  const entries: LeaderboardEntry[] = members.map((person) => {
    const personTeams = person.teams
      .map((code) => teamMap.get(code))
      .filter((t): t is Team => t !== undefined);

    const aliveTeams = personTeams.filter((t) => !t.eliminated);
    const bestStage = getBestStage(personTeams);
    const rawStrength = personTeams.reduce((sum, t) => sum + teamStrength(t), 0);

    return {
      name: person.name,
      imageUrl: person.imageUrl,
      teamsAlive: aliveTeams.length,
      totalTeams: personTeams.length,
      bestStage,
      winProbability: rawStrength,
    };
  });

  // Normalize probabilities to sum to 1
  const totalStrength = entries.reduce((sum, e) => sum + e.winProbability, 0);
  if (totalStrength > 0) {
    entries.forEach((e) => {
      e.winProbability = Math.round((e.winProbability / totalStrength) * 1000) / 1000;
    });
  }

  // Sort by teams alive desc, then win probability desc
  entries.sort((a, b) => {
    if (b.teamsAlive !== a.teamsAlive) return b.teamsAlive - a.teamsAlive;
    return b.winProbability - a.winProbability;
  });

  return entries;
}

function getBestStage(teams: Team[]): string {
  const stageOrder = [
    'FINAL',
    'SEMI_FINAL',
    'QUARTER_FINAL',
    'ROUND_OF_16',
    'ROUND_OF_32',
    'GROUP_STAGE',
  ];

  for (const stage of stageOrder) {
    // A team that's alive is still in the tournament
    if (teams.some((t) => !t.eliminated)) {
      // Find the furthest stage any alive team could be in
      return 'Still Active';
    }
    if (teams.some((t) => t.eliminatedAt === stage)) {
      return stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  return 'Group Stage';
}

export { STAGE_WEIGHTS };
