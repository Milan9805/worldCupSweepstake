import { Match } from '@sweepstake/shared';

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';
const API_KEY = process.env.FOOTBALL_DATA_API_KEY || '';

// football-data.org uses a persistent ID per competition; the current season
// under 2000 is the 2026 FIFA World Cup (verified 2026-05-22).
const COMPETITION_ID = 2000;

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

interface FootballDataStanding {
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

  const response = await fetch(`${FOOTBALL_DATA_BASE}${path}`, {
    headers: {
      'X-Auth-Token': API_KEY,
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
    homeTeam: m.homeTeam.tla,
    awayTeam: m.awayTeam.tla,
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
  return data.standings || [];
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
