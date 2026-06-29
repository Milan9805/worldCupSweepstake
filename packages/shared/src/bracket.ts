import { Team, Match, ChannelBroadcast, MatchStatus } from './types';

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

// Number of ties in each knockout round — the bracket halves each round. Used to
// render the full path to the final (later rounds show "to be confirmed" slots
// before they're decided) and to size the derived rounds in buildKnockoutTree.
export const ROUND_SIZES: Record<string, number> = {
  ROUND_OF_32: 16,
  ROUND_OF_16: 8,
  QUARTER_FINAL: 4,
  SEMI_FINAL: 2,
  FINAL: 1,
};

// Display labels for each round (plural where the bracket reads better that way).
export const ROUND_LABELS: Record<string, string> = {
  ROUND_OF_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINAL: 'Quarter Finals',
  SEMI_FINAL: 'Semi Finals',
  FINAL: 'Final',
};

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

// ===== Knockout tree (winner advancement) =====

/**
 * One tie in the bracket. Like a Match but the two sides may be undecided
 * (`null` = "to be confirmed") because later rounds are calculated from the
 * winners of earlier ones rather than coming from the fixtures feed.
 */
export interface BracketSlot {
  slotId: string; // stable React key: the feed matchId when attached, else `${round}-${index}`
  homeTeam: string | null;
  awayTeam: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  datetime: string | null;
  channels?: ChannelBroadcast[];
  minute?: string | null;
}

export interface TreeRound {
  round: string;
  label: string;
  slots: BracketSlot[];
}

function matchToSlot(m: Match): BracketSlot {
  return {
    slotId: m.matchId,
    homeTeam: m.homeTeam || null,
    awayTeam: m.awayTeam || null,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    status: m.status,
    datetime: m.datetime,
    channels: m.channels,
    minute: m.minute,
  };
}

// The team that advances from a tie, or null when it isn't decided yet (not
// finished, or a level score that went to penalties our data can't resolve).
function winnerOf(slot: BracketSlot | undefined): string | null {
  if (!slot || slot.status !== 'FINISHED') return null;
  if (slot.homeScore == null || slot.awayScore == null) return null;
  if (slot.homeScore > slot.awayScore) return slot.homeTeam;
  if (slot.awayScore > slot.homeScore) return slot.awayTeam;
  return null;
}

// The feed fixture for a fully-decided matchup, in either orientation.
function findFeedMatch(matches: Match[], home: string | null, away: string | null): Match | null {
  if (!home || !away) return null;
  return (
    matches.find(
      (m) =>
        (m.homeTeam === home && m.awayTeam === away) ||
        (m.homeTeam === away && m.awayTeam === home),
    ) ?? null
  );
}

// A feed fixture that mentions either known team — used only to borrow the
// kickoff time / channels for a half-resolved tie the feed hasn't fully drawn
// yet (e.g. its "CAN vs <null>" record lends CAN's R16 slot a date).
function findPartialFeedMatch(matches: Match[], home: string | null, away: string | null): Match | null {
  return (
    matches.find(
      (m) =>
        (!!home && (m.homeTeam === home || m.awayTeam === home)) ||
        (!!away && (m.homeTeam === away || m.awayTeam === away)),
    ) ?? null
  );
}

/**
 * Build the full knockout bracket from the fixtures feed.
 *
 * The Round of 32 is the bracket's leaves, taken straight from the scraped
 * fixtures (`stage === 'ROUND_OF_32'`, in kick-off order). Every later round is
 * *calculated from who wins*: tie `k` of a round is fed by ties `2k` and `2k+1`
 * of the previous round, so a winner advances automatically the moment its match
 * is FINISHED — no waiting for the feed to resolve the next round's teams. Where
 * a calculated matchup has a real fixture in the feed, its score/status/kick-off
 * are attached so live and full-time results show through. This is pure and
 * deterministic, so the tree is correct from match data alone.
 */
export function buildKnockoutTree(matches: Match[]): TreeRound[] {
  const r32 = matches
    .filter((m) => m.stage === 'ROUND_OF_32')
    .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
    .map(matchToSlot);

  // Index later-round fixtures by stage for attaching real results to the
  // calculated ties.
  const feedByStage = new Map<string, Match[]>();
  for (const m of matches) {
    if (m.stage === 'GROUP_STAGE' || m.stage === 'ROUND_OF_32') continue;
    const list = feedByStage.get(m.stage) ?? [];
    list.push(m);
    feedByStage.set(m.stage, list);
  }

  const rounds: TreeRound[] = [
    { round: 'ROUND_OF_32', label: ROUND_LABELS.ROUND_OF_32, slots: r32 },
  ];

  let prev = r32;
  for (let i = 1; i < ROUNDS.length; i++) {
    const round = ROUNDS[i];
    const feed = feedByStage.get(round) ?? [];
    const slots: BracketSlot[] = [];

    for (let k = 0; k < ROUND_SIZES[round]; k++) {
      const home = winnerOf(prev[2 * k]);
      const away = winnerOf(prev[2 * k + 1]);

      // Prefer the real fixture for a fully-decided matchup so its score and
      // status show; otherwise present the calculated tie, borrowing a kick-off
      // from a half-drawn fixture when one exists.
      const attached = findFeedMatch(feed, home, away);
      if (attached) {
        slots.push(matchToSlot(attached));
        continue;
      }

      const partial = home || away ? findPartialFeedMatch(feed, home, away) : null;
      slots.push({
        slotId: `${round}-${k}`,
        homeTeam: home,
        awayTeam: away,
        homeScore: null,
        awayScore: null,
        status: 'SCHEDULED',
        datetime: partial?.datetime ?? null,
        channels: partial?.channels,
        minute: null,
      });
    }

    rounds.push({ round, label: ROUND_LABELS[round], slots });
    prev = slots;
  }

  return rounds;
}
