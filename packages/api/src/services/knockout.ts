import { Team, isGroupStageComplete, computeGroupStandings, determineQualifiedTeams } from '@sweepstake/shared';
import { getAllTeams, putTeam, batchPutTeams, getConfig, putConfig, putEvent } from '../db/dynamodb';

// Set once the whole group stage has been finalised. Kept as the original
// 'treeGenerated' key so an already-finalised tournament isn't re-processed.
const GROUP_STAGE_FINALIZED_KEY = 'treeGenerated';

/**
 * For each group whose games are all complete, immediately mark the 4th-place
 * team as eliminated without waiting for all 12 groups to finish.
 * Idempotent — skips teams already marked eliminated.
 */
export async function markCompletedGroupEliminations(): Promise<void> {
  const teams = await getAllTeams() as unknown as Team[];
  const standings = computeGroupStandings(teams);
  const toEliminate: Team[] = [];

  for (const [, groupEntries] of standings) {
    const groupLetter = groupEntries[0]?.groupLetter;
    if (!groupLetter) continue;
    const groupTeams = teams.filter((t) => t.groupLetter === groupLetter);
    if (!groupTeams.every((t) => t.stats.played >= 3)) continue;

    const fourth = groupEntries[3];
    if (!fourth) continue;
    const team = teams.find((t) => t.teamCode === fourth.teamCode);
    if (team && !team.eliminated) {
      team.eliminated = true;
      team.eliminatedAt = 'Group Stage';
      toEliminate.push(team);
    }
  }

  if (toEliminate.length > 0) {
    await batchPutTeams(toEliminate as unknown as Record<string, unknown>[]);
  }
}

/**
 * Once the whole group stage is complete, finalise it: mark every team that
 * didn't qualify (the 4th-placed teams plus the four worst third-placed teams)
 * as eliminated, and emit a one-off BRACKET_DRAWN feed event. Guarded so it runs
 * exactly once. The knockout matchups themselves come from the real scraped
 * fixtures, so there is no bracket to generate here.
 * Returns true if it finalised on this call, false if skipped.
 */
export async function finalizeGroupStageIfReady(): Promise<boolean> {
  const done = await getConfig(GROUP_STAGE_FINALIZED_KEY);
  if (done && done.value === 'true') {
    return false;
  }

  const teams = await getAllTeams() as unknown as Team[];
  if (!isGroupStageComplete(teams)) {
    return false;
  }

  const { eliminated } = determineQualifiedTeams(computeGroupStandings(teams));

  for (const team of teams) {
    if (eliminated.includes(team.teamCode) && !team.eliminated) {
      team.eliminated = true;
      team.eliminatedAt = 'Group Stage';
      await putTeam(team as unknown as Record<string, unknown>);
    }
  }

  await putConfig(GROUP_STAGE_FINALIZED_KEY, 'true');

  // One-off "the knockout line-up is set" feed event. The deterministic eventId
  // plus the guard above keep it to a single emission (a re-detection overwrites
  // the same row rather than duplicating it).
  await putEvent({
    eventId: 'BRACKET_DRAWN',
    ts: new Date().toISOString(),
    type: 'BRACKET_DRAWN',
    payload: { eliminated },
  });

  return true;
}

const ROUND_NAMES: Record<string, string> = {
  ROUND_OF_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINAL: 'Quarter Final',
  SEMI_FINAL: 'Semi Final',
  FINAL: 'Final',
};

function formatRoundName(round: string): string {
  return ROUND_NAMES[round] || round;
}

interface KnockoutMatchInput {
  matchId: string;
  stage: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  penaltyHome?: number | null;
  penaltyAway?: number | null;
  status: string;
}

/**
 * The loser's teamCode for a decided knockout tie, or null when it isn't decided
 * (not finished, missing score, or level with no penalty result to break it).
 * A tie level on the pitch is resolved by the penalty shootout tally.
 */
function knockoutLoser(m: KnockoutMatchInput): string | null {
  // The third-place playoff eliminates nobody new — both sides already went out
  // in the semis — so skip it (and keep each team a loser of at most one tie).
  if (m.stage === 'GROUP_STAGE' || m.stage === 'THIRD_PLACE' || m.status !== 'FINISHED') return null;
  if (m.homeScore == null || m.awayScore == null) return null;
  if (m.homeScore > m.awayScore) return m.awayTeam;
  if (m.awayScore > m.homeScore) return m.homeTeam;
  // Level — decided on penalties when we have the shootout tally.
  if (m.penaltyHome != null && m.penaltyAway != null) {
    if (m.penaltyHome > m.penaltyAway) return m.awayTeam;
    if (m.penaltyAway > m.penaltyHome) return m.homeTeam;
  }
  return null;
}

// The display names of the knockout rounds. Used to tell a knockout elimination
// (which this function owns and may revise) apart from a group-stage one (set by
// the group logic and never touched here).
const KNOCKOUT_ROUND_NAMES = new Set(Object.values(ROUND_NAMES));

/**
 * Reconcile every team's knockout elimination against the decided fixtures
 * (no bracket needed). The losers of the finished ties ARE the complete set of
 * knockout-stage eliminations, so this works both ways:
 *  - a team that lost a decided tie is marked out at that round, and
 *  - a team flagged out at a knockout round that is no longer the loser of any
 *    decided tie is un-eliminated — it actually advanced.
 * That self-heal matters because the shootout tally can land after a tie first
 * shows as finished: a tie level on the pitch but momentarily finished with the
 * eventual penalty winner behind would otherwise strand that winner as "Out"
 * forever (the flag was previously write-once). A level tie with no shootout
 * tally yet stays undecided rather than eliminating the wrong side. Group-stage
 * exits are never touched — their round name isn't a knockout round.
 * Idempotent: only teams whose elimination actually changes are written.
 */
export async function markKnockoutLosersEliminated(matches: KnockoutMatchInput[]): Promise<void> {
  // Nothing to set or clear until a knockout tie has finished — skip the team
  // scan during the group stage.
  if (!matches.some((m) => m.stage !== 'GROUP_STAGE' && m.status === 'FINISHED')) return;

  // The round each team lost at, keyed by team code. A team can only lose one
  // tie (the third-place playoff is excluded), so there is no ambiguity here.
  const lostRoundByCode = new Map<string, string>();
  for (const m of matches) {
    const loser = knockoutLoser(m);
    if (loser) lostRoundByCode.set(loser, formatRoundName(m.stage));
  }

  const teams = await getAllTeams() as unknown as Team[];
  const changed: Team[] = [];

  for (const team of teams) {
    const lostRound = lostRoundByCode.get(team.teamCode);
    if (lostRound) {
      // Lost a decided tie — eliminate. Preserve an earlier round if already out
      // so we never push a team's exit to a later round than it really happened.
      if (!team.eliminated) {
        team.eliminated = true;
        team.eliminatedAt = lostRound;
        changed.push(team);
      }
    } else if (team.eliminated && team.eliminatedAt && KNOCKOUT_ROUND_NAMES.has(team.eliminatedAt)) {
      // Flagged out at a knockout round but not the loser of any decided tie —
      // they advanced (e.g. the shootout result corrected a transient finish).
      team.eliminated = false;
      team.eliminatedAt = null;
      changed.push(team);
    }
  }

  if (changed.length > 0) {
    await batchPutTeams(changed as unknown as Record<string, unknown>[]);
  }
}
