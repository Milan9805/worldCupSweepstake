import { Match, Team, TeamStats } from '@sweepstake/shared';
import { FootballDataStanding } from '../clients/footballData';

/**
 * The league-table half of a team's stats — everything the football-data
 * standings endpoint supplies. Discipline (cards) and the optional
 * possession/xG live elsewhere on {@link TeamStats} and are preserved.
 */
export interface LeagueStats {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface CardCounts {
  yellowCards: number;
  redCards: number;
}

/**
 * Tally yellow/red cards per team from the per-player match actions BBC
 * supplies. A full recompute across every match (BBC carries each match's
 * actions cumulatively), so the result is idempotent — re-running converges on
 * the same totals rather than double-counting. Teams with no cards are absent
 * from the map (callers default them to zero).
 */
export function deriveCardCounts(matches: Match[]): Map<string, CardCounts> {
  const counts = new Map<string, CardCounts>();
  for (const match of matches) {
    for (const action of match.actions ?? []) {
      if (action.type !== 'YELLOW_CARD' && action.type !== 'RED_CARD') continue;
      const current = counts.get(action.team) ?? { yellowCards: 0, redCards: 0 };
      if (action.type === 'YELLOW_CARD') current.yellowCards += 1;
      else current.redCards += 1;
      counts.set(action.team, current);
    }
  }
  return counts;
}

/** Index football-data standings rows by team TLA → league stats. */
export function indexStandings(
  standings: FootballDataStanding[] | undefined,
): Map<string, LeagueStats> {
  const map = new Map<string, LeagueStats>();
  for (const standing of standings ?? []) {
    for (const row of standing.table ?? []) {
      const tla = row.team?.tla;
      if (!tla) continue;
      map.set(tla, {
        played: row.playedGames,
        wins: row.won,
        draws: row.draw,
        losses: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDifference: row.goalDifference,
        points: row.points,
      });
    }
  }
  return map;
}

/**
 * Overlay fresh league stats (from standings) and card counts (from match
 * actions) onto the current teams, returning ONLY the teams whose stats
 * actually changed (so the caller writes the minimum). A team absent from the
 * standings map keeps its existing league record (knockout teams have no
 * standings row); card counts always reflect the latest derivation. Other stat
 * fields (possession, xG) and non-stat fields are preserved untouched.
 */
export function computeTeamStatUpdates(
  teams: Team[],
  standings: Map<string, LeagueStats>,
  cards: Map<string, CardCounts>,
): Team[] {
  const changed: Team[] = [];
  for (const team of teams) {
    if (!team.stats) continue; // defensive: ignore malformed rows
    const league = standings.get(team.teamCode);
    const card = cards.get(team.teamCode) ?? { yellowCards: 0, redCards: 0 };
    const nextStats: TeamStats = {
      ...team.stats,
      ...(league ?? {}),
      yellowCards: card.yellowCards,
      redCards: card.redCards,
    };
    if (!statsEqual(team.stats, nextStats)) {
      changed.push({ ...team, stats: nextStats });
    }
  }
  return changed;
}

function statsEqual(a: TeamStats, b: TeamStats): boolean {
  return (
    a.played === b.played &&
    a.wins === b.wins &&
    a.draws === b.draws &&
    a.losses === b.losses &&
    a.goalsFor === b.goalsFor &&
    a.goalsAgainst === b.goalsAgainst &&
    a.goalDifference === b.goalDifference &&
    a.points === b.points &&
    a.yellowCards === b.yellowCards &&
    a.redCards === b.redCards
  );
}
