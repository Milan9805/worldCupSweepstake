import { generateBracketSlots, getNextSlot, isGroupStageComplete, computeGroupStandings } from '@sweepstake/shared';
import { Team, TreeSlot } from '@sweepstake/shared';
import { getAllTeams, getTree, putTreeSlot, putTeam, batchPutTeams, getConfig, putConfig, putEvent } from '../db/dynamodb';

const TREE_GENERATED_KEY = 'treeGenerated';

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
 * Generate the knockout bracket from group standings.
 * Only runs if the group stage is complete and the tree hasn't been generated yet.
 * Returns true if the tree was generated, false if skipped.
 */
export async function generateTreeIfReady(): Promise<boolean> {
  // Check if already generated
  const treeGenerated = await getConfig(TREE_GENERATED_KEY);
  if (treeGenerated && treeGenerated.value === 'true') {
    return false;
  }

  const teams = await getAllTeams() as unknown as Team[];

  // Check if group stage is complete
  if (!isGroupStageComplete(teams)) {
    return false;
  }

  // Generate bracket slots
  const { slots, eliminated } = generateBracketSlots(teams);

  // Write all tree slots to DynamoDB
  for (const slot of slots) {
    await putTreeSlot(slot as unknown as Record<string, unknown>);
  }

  // Mark eliminated teams
  for (const team of teams) {
    if (eliminated.includes(team.teamCode)) {
      team.eliminated = true;
      team.eliminatedAt = 'Group Stage';
      await putTeam(team as unknown as Record<string, unknown>);
    }
  }

  // Mark tree as generated
  await putConfig(TREE_GENERATED_KEY, 'true');

  // Emit a single feed event for the bracket being drawn. This block runs only
  // once — the early `treeGenerated === 'true'` guard above prevents re-entry —
  // and the deterministic eventId means a re-detection would overwrite in place.
  await putEvent({
    eventId: 'BRACKET_DRAWN',
    ts: new Date().toISOString(),
    type: 'BRACKET_DRAWN',
    payload: {
      eliminated,
      slots: slots.length,
    },
  });

  return true;
}

/**
 * Progress a knockout match winner to the next round.
 * Call this when a knockout stage match finishes.
 */
export async function progressKnockoutWinner(
  round: string,
  position: number,
  winner: string,
  score1: number,
  score2: number,
  loser: string
): Promise<void> {
  // Update the current slot with the result
  const currentSlot: TreeSlot = {
    round,
    position,
    team1: null, // preserved from existing
    team2: null, // preserved from existing
    score1,
    score2,
    winner,
    datetime: null,
  };

  // Get existing slot to preserve team info
  const existingSlots = await getTree() as unknown as TreeSlot[];
  const existing = existingSlots.find(
    (s) => s.round === round && s.position === position
  );

  if (existing) {
    currentSlot.team1 = existing.team1;
    currentSlot.team2 = existing.team2;
    currentSlot.datetime = existing.datetime;
  }

  await putTreeSlot(currentSlot as unknown as Record<string, unknown>);

  // Progress winner to next round
  const next = getNextSlot(round, position);
  if (next) {
    // Find or create the next slot
    const nextExisting = existingSlots.find(
      (s) => s.round === next.round && s.position === next.position
    );

    const nextSlot: TreeSlot = nextExisting || {
      round: next.round,
      position: next.position,
      team1: null,
      team2: null,
      score1: null,
      score2: null,
      winner: null,
      datetime: null,
    };

    if (next.isTeam1) {
      nextSlot.team1 = winner;
    } else {
      nextSlot.team2 = winner;
    }

    await putTreeSlot(nextSlot as unknown as Record<string, unknown>);
  }

  // Mark loser as eliminated
  const teams = await getAllTeams() as unknown as Team[];
  const loserTeam = teams.find((t) => t.teamCode === loser);
  if (loserTeam && !loserTeam.eliminated) {
    loserTeam.eliminated = true;
    loserTeam.eliminatedAt = formatRoundName(round);
    await putTeam(loserTeam as unknown as Record<string, unknown>);
  }
}

/**
 * Process all knockout matches and progress winners where applicable.
 * Call this during refresh to catch up on any finished knockout matches.
 */
export async function processKnockoutResults(matches: { matchId: string; stage: string; homeTeam: string; awayTeam: string; homeScore: number | null; awayScore: number | null; status: string }[]): Promise<void> {
  const knockoutMatches = matches.filter(
    (m) => m.stage !== 'GROUP_STAGE' && m.status === 'FINISHED' && m.homeScore !== null && m.awayScore !== null
  );

  const existingSlots = await getTree() as unknown as TreeSlot[];

  for (const match of knockoutMatches) {
    // Find the corresponding tree slot
    const slot = existingSlots.find(
      (s) =>
        s.round === match.stage &&
        ((s.team1 === match.homeTeam && s.team2 === match.awayTeam) ||
         (s.team1 === match.awayTeam && s.team2 === match.homeTeam))
    );

    if (slot && !slot.winner) {
      const winner = match.homeScore! > match.awayScore! ? match.homeTeam : match.awayTeam;
      const loser = winner === match.homeTeam ? match.awayTeam : match.homeTeam;

      await progressKnockoutWinner(
        slot.round,
        slot.position,
        winner,
        match.homeScore!,
        match.awayScore!,
        loser
      );
    }
  }
}

function formatRoundName(round: string): string {
  const names: Record<string, string> = {
    'ROUND_OF_32': 'Round of 32',
    'ROUND_OF_16': 'Round of 16',
    'QUARTER_FINAL': 'Quarter Final',
    'SEMI_FINAL': 'Semi Final',
    'FINAL': 'Final',
  };
  return names[round] || round;
}
