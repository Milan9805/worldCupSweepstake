// ===== Team =====
export interface TeamStats {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  yellowCards: number;
  redCards: number;
  possession: number | null; // percentage, may not be available
  xG: number | null; // expected goals, may not be available
}

export interface Team {
  teamCode: string; // e.g. "ENG", "BRA"
  name: string;
  flag: string; // URL or emoji
  fifaRanking: number;
  groupLetter: string; // A-L
  stats: TeamStats;
  eliminated: boolean;
  eliminatedAt: string | null; // stage name e.g. "Round of 32"
}

// ===== Person / Group =====
export interface Person {
  name: string;
  imageUrl: string | null;
  teams: string[]; // array of teamCodes
}

export interface Group {
  groupKey: string;
  groupName: string;
  members: Person[];
}

// ===== Match =====
export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED';

export interface Match {
  matchId: string;
  homeTeam: string; // teamCode
  awayTeam: string; // teamCode
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  stage: string; // "GROUP_STAGE", "ROUND_OF_32", "ROUND_OF_16", "QUARTER_FINAL", "SEMI_FINAL", "FINAL"
  group: string | null; // group letter for group stage matches
  datetime: string; // ISO 8601
  venue: string;
}

// ===== Tournament Tree =====
export interface TreeSlot {
  round: string; // "ROUND_OF_32", "ROUND_OF_16", "QUARTER_FINAL", "SEMI_FINAL", "FINAL"
  position: number;
  team1: string | null; // teamCode
  team2: string | null; // teamCode
  score1: number | null;
  score2: number | null;
  winner: string | null; // teamCode
  datetime: string | null;
}

// ===== Config =====
export interface AppConfig {
  configKey: string;
  value: string;
}

// ===== API Responses =====
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface DashboardData {
  group: Group;
  teams: Team[];
  leaderboard: LeaderboardEntry[];
}

export interface LeaderboardEntry {
  name: string;
  imageUrl: string | null;
  teamsAlive: number;
  totalTeams: number;
  bestStage: string;
  winProbability: number;
}

export interface GroupStageData {
  groups: GroupStanding[];
  matches: Match[];
}

export interface GroupStanding {
  groupLetter: string;
  standings: TeamStanding[];
}

export interface TeamStanding {
  position: number;
  teamCode: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

// ===== Admin =====
export interface AdminLoginRequest {
  secret: string;
}

export interface AdminLoginResponse {
  token: string;
}

export interface AssignTeamsRequest {
  groupKey: string;
  assignments: { personName: string; teams: string[] }[];
}

export interface UpdateMemberRequest {
  groupKey: string;
  members: Person[];
}

export interface UploadAvatarRequest {
  groupKey: string;
  personName: string;
  contentType: string;
}

export interface UploadAvatarResponse {
  uploadUrl: string;
  imageUrl: string;
}
