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
  status: string;
}

/**
 * Mark the loser of every decided knockout match as eliminated, derived
 * directly from the finished fixtures (no bracket needed). A match level on
 * score went to penalties — which our score data can't resolve — so we skip it
 * rather than eliminate the wrong side. Idempotent: only teams whose
 * elimination flag actually changes are written.
 */
export async function markKnockoutLosersEliminated(matches: KnockoutMatchInput[]): Promise<void> {
  const decided = matches.filter(
    (m) =>
      m.stage !== 'GROUP_STAGE' &&
      m.status === 'FINISHED' &&
      m.homeScore !== null &&
      m.awayScore !== null &&
      m.homeScore !== m.awayScore,
  );
  if (decided.length === 0) return;

  const teams = await getAllTeams() as unknown as Team[];
  const byCode = new Map(teams.map((t) => [t.teamCode, t]));
  const changed: Team[] = [];

  for (const m of decided) {
    const loser = m.homeScore! > m.awayScore! ? m.awayTeam : m.homeTeam;
    const team = byCode.get(loser);
    if (team && !team.eliminated) {
      team.eliminated = true;
      team.eliminatedAt = formatRoundName(m.stage);
      changed.push(team);
    }
  }

  if (changed.length > 0) {
    await batchPutTeams(changed as unknown as Record<string, unknown>[]);
  }
}
