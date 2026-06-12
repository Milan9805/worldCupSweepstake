import { Match, Team, TeamStats } from '@sweepstake/shared';

/**
 * The league-table half of a team's stats. Discipline (cards) and the optional
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

/**
 * Compute the group-stage league table from the match results we store — the
 * same BBC-driven scores shown in the feed and fixtures. Deriving the table from
 * matches (rather than a separate standings feed) guarantees it can never
 * contradict the displayed scoreline: previously the table came from
 * football-data standings, which lagged/disagreed (e.g. showing a 2-1 win as a
 * 1-1 draw). Only FINISHED group-stage matches with both scores count; a team
 * with no completed group games is absent (callers leave its stats as-is).
 */
export function computeLeagueStats(matches: Match[]): Map<string, LeagueStats> {
  const table = new Map<string, LeagueStats>();
  const row = (code: string): LeagueStats => {
    let s = table.get(code);
    if (!s) {
      s = { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 };
      table.set(code, s);
    }
    return s;
  };

  for (const m of matches) {
    if (m.stage !== 'GROUP_STAGE' || m.status !== 'FINISHED') continue;
    if (m.homeScore == null || m.awayScore == null) continue;

    const home = row(m.homeTeam);
    const away = row(m.awayTeam);
    home.played += 1;
    away.played += 1;
    home.goalsFor += m.homeScore;
    home.goalsAgainst += m.awayScore;
    away.goalsFor += m.awayScore;
    away.goalsAgainst += m.homeScore;

    if (m.homeScore > m.awayScore) {
      home.wins += 1;
      home.points += 3;
      away.losses += 1;
    } else if (m.homeScore < m.awayScore) {
      away.wins += 1;
      away.points += 3;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  for (const s of table.values()) {
    s.goalDifference = s.goalsFor - s.goalsAgainst;
  }
  return table;
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
