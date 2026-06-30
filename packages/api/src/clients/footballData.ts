import { Match } from '@sweepstake/shared';
import { getSecret } from '../lib/secrets';

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';

function getApiKey(): Promise<string> {
  return getSecret('FOOTBALL_DATA_API_KEY', 'FOOTBALL_DATA_API_KEY_SSM_NAME');
}

// football-data.org uses a persistent ID per competition; the current season
// under 2000 is the 2026 FIFA World Cup (verified 2026-05-22).
const COMPETITION_ID = 2000;

// football-data.org tags a few nations with a TLA that differs from the
// traditional football code our data (and FIFA/BBC, via teamNames.ts) uses, so
// without translation their fixtures render under a non-existent team (raw code,
// no flag, shown unassigned) and their standings row never joins to the team
// (all-zero stats). Uruguay (API "URY" → our "URU") and Curaçao (API "CUR" → our
// "CUW") both bite at this tournament. Translate the API's TLA to ours at
// ingestion so every downstream join (fixture → team, standing → team) lines up
// on our canonical code.
const TLA_OVERRIDES: Record<string, string> = {
  URY: 'URU',
  CUR: 'CUW',
};

function normaliseTla(tla: string): string {
  return TLA_OVERRIDES[tla] ?? tla;
}

// Rate limiting: football-data.org free tier allows 10 requests/minute
const MAX_REQUESTS_PER_MINUTE = 10;
const RATE_WINDOW_MS = 60_000;
const requestTimestamps: number[] = [];

function checkRateLimit(): void {
  const now = Date.now();
  // Remove timestamps older than the window
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_WINDOW_MS) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    throw new Error('Football Data API rate limit reached. Try again later.');
  }
  requestTimestamps.push(now);
}

interface ScorePair {
  home: number | null;
  away: number | null;
}

interface FootballDataMatch {
  id: number;
  utcDate: string;
  status: string;
  stage: string;
  group: string | null;
  homeTeam: { tla: string; name: string };
  awayTeam: { tla: string; name: string };
  score: {
    // For a knockout decided beyond 90 mins, `fullTime` FOLDS the shootout in
    // (regulation + extra time + penalties), so we never read it directly for a
    // shootout — we use regularTime+extraTime for the on-pitch score and
    // penalties for the shootout tally. Only fullTime/halfTime exist on a
    // REGULAR match; the rest are present only when duration is non-REGULAR.
    winner?: string | null; // "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null
    duration?: string; // "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT"
    fullTime: ScorePair;
    regularTime?: ScorePair;
    extraTime?: ScorePair;
    penalties?: ScorePair;
  };
  venue: string | null;
}

export interface FootballDataStanding {
  group: string;
  table: {
    position: number;
    team: { tla: string; name: string };
    playedGames: number;
    won: number;
    draw: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    points: number;
  }[];
}

async function fetchFromApi<T = Record<string, unknown>>(path: string): Promise<T> {
  checkRateLimit();

  const apiKey = await getApiKey();
  const response = await fetch(`${FOOTBALL_DATA_BASE}${path}`, {
    headers: {
      'X-Auth-Token': apiKey,
    },
  });

  if (response.status === 429) {
    throw new Error('Football Data API rate limit exceeded (429). Try again later.');
  }

  if (!response.ok) {
    throw new Error(`Football Data API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function fetchMatches(): Promise<Partial<Match>[]> {
  const data = await fetchFromApi<{ matches: FootballDataMatch[] }>(`/competitions/${COMPETITION_ID}/matches`);
  const matches: FootballDataMatch[] = data.matches || [];

  return matches.map((m) => {
    const onPitch = onPitchScore(m.score);
    const pens = m.score.penalties;
    return {
      matchId: String(m.id),
      homeTeam: normaliseTla(m.homeTeam.tla),
      awayTeam: normaliseTla(m.awayTeam.tla),
      homeScore: onPitch.home,
      awayScore: onPitch.away,
      penaltyHome: pens?.home ?? null,
      penaltyAway: pens?.away ?? null,
      status: mapStatus(m.status),
      stage: mapStage(m.stage),
      group: m.group ? m.group.replace('GROUP_', '') : null,
      datetime: m.utcDate,
      venue: m.venue || 'TBC',
    };
  });
}

/**
 * The on-pitch score (regulation + extra time), EXCLUDING any penalty shootout.
 * For a match decided on penalties, `score.fullTime` folds the shootout in (e.g.
 * a 1-1 won 4-3 on pens reports fullTime 4-5), so we sum regularTime+extraTime
 * to recover the true scoreline. A REGULAR match carries only fullTime, which
 * is already the on-pitch score, so we use it directly. Nulls (pre-match) pass
 * through unchanged.
 */
function onPitchScore(score: FootballDataMatch['score']): ScorePair {
  const { duration, regularTime, extraTime, fullTime } = score;
  if (duration && duration !== 'REGULAR' && regularTime) {
    return {
      home: sumOrNull(regularTime.home, extraTime?.home),
      away: sumOrNull(regularTime.away, extraTime?.away),
    };
  }
  return fullTime;
}

// Sum a regulation score with an optional extra-time score, preserving null
// when the regulation value is missing (a fixture with no result yet).
function sumOrNull(base: number | null, extra: number | null | undefined): number | null {
  if (base == null) return null;
  return base + (extra ?? 0);
}

export async function fetchStandings(): Promise<FootballDataStanding[]> {
  const data = await fetchFromApi<{ standings: FootballDataStanding[] }>(`/competitions/${COMPETITION_ID}/standings`);
  // Normalise each row's TLA to our canonical code so indexStandings keys the
  // table by the same code the team records use (see TLA_OVERRIDES).
  return (data.standings || []).map((standing) => ({
    ...standing,
    table: (standing.table ?? []).map((row) => ({
      ...row,
      team: { ...row.team, tla: normaliseTla(row.team.tla) },
    })),
  }));
}

function mapStatus(status: string): 'SCHEDULED' | 'LIVE' | 'FINISHED' {
  switch (status) {
    case 'FINISHED':
      return 'FINISHED';
    case 'IN_PLAY':
    case 'PAUSED':
    case 'HALFTIME':
      return 'LIVE';
    default:
      return 'SCHEDULED';
  }
}

function mapStage(stage: string): string {
  const stageMap: Record<string, string> = {
    GROUP_STAGE: 'GROUP_STAGE',
    LAST_32: 'ROUND_OF_32',
    LAST_16: 'ROUND_OF_16',
    QUARTER_FINALS: 'QUARTER_FINAL',
    SEMI_FINALS: 'SEMI_FINAL',
    FINAL: 'FINAL',
    THIRD_PLACE: 'THIRD_PLACE',
  };
  return stageMap[stage] || stage;
}
