import { Match } from '@sweepstake/shared';
import { getSecret } from '../lib/secrets';

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';

function getApiKey(): Promise<string> {
  return getSecret('FOOTBALL_DATA_API_KEY', 'FOOTBALL_DATA_API_KEY_SSM_NAME');
}

// football-data.org uses a persistent ID per competition; the current season
// under 2000 is the 2026 FIFA World Cup (verified 2026-05-22).
const COMPETITION_ID = 2000;

// football-data.org tags a few nations with the ISO-3166 alpha-3 code where our
// data (and FIFA/BBC, via teamNames.ts) use the traditional football code.
// Uruguay is the one that bites at this tournament: the API says "URY", but our
// teams and fixtures key on "URU", so its fixtures rendered under a non-existent
// team and its standings row never joined to the team (all-zero stats).
// Translate the API's TLA to ours at ingestion so every downstream join
// (fixture → team, standing → team) lines up on our canonical code.
const TLA_OVERRIDES: Record<string, string> = {
  URY: 'URU',
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

interface FootballDataMatch {
  id: number;
  utcDate: string;
  status: string;
  stage: string;
  group: string | null;
  homeTeam: { tla: string; name: string };
  awayTeam: { tla: string; name: string };
  score: {
    fullTime: { home: number | null; away: number | null };
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

  return matches.map((m) => ({
    matchId: String(m.id),
    homeTeam: normaliseTla(m.homeTeam.tla),
    awayTeam: normaliseTla(m.awayTeam.tla),
    homeScore: m.score.fullTime.home,
    awayScore: m.score.fullTime.away,
    status: mapStatus(m.status),
    stage: mapStage(m.stage),
    group: m.group ? m.group.replace('GROUP_', '') : null,
    datetime: m.utcDate,
    venue: m.venue || 'TBC',
  }));
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
