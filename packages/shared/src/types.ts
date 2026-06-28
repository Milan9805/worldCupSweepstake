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

/**
 * A broadcast channel for a match, with the brand colours scraped verbatim from
 * the source listings so the UI stays correct as broadcasters/colours change.
 * `bg` / `fg` are raw CSS colour strings (e.g. "#127b60", "rgba(255,255,255,1)")
 * and may be empty when the source omits them.
 */
export interface ChannelBroadcast {
  name: string;
  bg: string;
  fg: string;
}

/**
 * A discrete in-match event for a single player — a goal or a booking — scraped
 * verbatim from the BBC match data. Goal scorers and cards are surfaced this way
 * (the running score itself lives on {@link Match}). `minute` is the clock label
 * as BBC presents it ("9'", "45+2'"); `player` is BBC's (often abbreviated) name
 * e.g. "J. Quiñones". A second yellow (a sending-off) is reported as RED_CARD.
 */
export type MatchActionType = 'GOAL' | 'YELLOW_CARD' | 'RED_CARD';

export interface MatchAction {
  team: string; // teamCode of the player's side, e.g. "RSA"
  player: string; // player name, verbatim from BBC
  type: MatchActionType;
  minute: string; // clock label, verbatim ("9'", "49'")
}

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
  channels?: ChannelBroadcast[]; // UK broadcast channels with brand colours
  // Live clock label from the score source while a match is in play, verbatim
  // from the upstream ("19'", "45+2'", "HT"). Only meaningful when status is
  // LIVE; may be stale on a SCHEDULED/FINISHED row, so consumers gate on status.
  minute?: string | null;
  // Goals + bookings scraped per-player from BBC, cumulative for the match (BBC
  // carries the full list each poll). Drives the scorer/card feed events and the
  // per-team card totals. Absent on rows scraped before this was added.
  actions?: MatchAction[];
}

// ===== Feed Events =====
export type FeedEventType =
  | 'GOAL'
  | 'YELLOW_CARD'
  | 'RED_CARD'
  | 'KICKOFF'
  | 'HALF_TIME'
  | 'FULL_TIME'
  | 'ELIMINATION'
  | 'BRACKET_DRAWN';

/**
 * A single thing that happened in the tournament, persisted so the live feed
 * (and, later, push) can replay it. Events are tournament-wide / group-agnostic:
 * ownership is resolved per-viewer from the loaded group. `eventId` is
 * deterministic per logical event (e.g. `${matchId}#FULL_TIME`) so a duplicate
 * detection overwrites the same row rather than creating a second.
 */
export interface FeedEvent {
  eventId: string;
  ts: string; // ISO 8601 — when the event was detected
  type: FeedEventType;
  teamCode?: string;
  matchId?: string;
  payload: Record<string, unknown>; // display data (teams, scoreline, outcome, stage…)
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

export type RefreshSource = 'api' | 'bbc' | 'cache';

export interface RefreshResponse {
  matches: Match[];
  teams: Team[];
  source: RefreshSource;
  refreshedAt: string; // ISO 8601 — when the underlying data was last fetched
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
