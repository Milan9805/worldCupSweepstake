import { Match, Team } from './types';
import { ROUNDS } from './bracket';

/**
 * Visual tone for a team's dashboard status pill.
 * - `QUALIFY`  — group stage, currently top two.
 * - `THIRD`    — group stage, third place (best-third race).
 * - `BOTTOM`   — group stage, currently bottom of the group.
 * - `ADVANCED` — alive in the knockouts.
 * - `CHAMPION` — won the final.
 * - `OUT`      — eliminated.
 */
export type ProgressTone = 'QUALIFY' | 'THIRD' | 'BOTTOM' | 'ADVANCED' | 'CHAMPION' | 'OUT';

export interface TeamProgress {
  label: string;
  tone: ProgressTone;
}

const ROUND_LABELS: Record<string, string> = {
  ROUND_OF_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINAL: 'Quarter Final',
  SEMI_FINAL: 'Semi Final',
  FINAL: 'Final',
};

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Furthest knockout round the team appears in (by ROUNDS order), or null if it
// has no knockout fixtures yet. Group-stage matches sort to -1 and are ignored.
function furthestKnockoutRound(teamCode: string, matches: Match[]): string | null {
  let bestIdx = -1;
  for (const m of matches) {
    if (m.homeTeam !== teamCode && m.awayTeam !== teamCode) continue;
    const idx = ROUNDS.indexOf(m.stage as (typeof ROUNDS)[number]);
    if (idx > bestIdx) bestIdx = idx;
  }
  return bestIdx >= 0 ? ROUNDS[bestIdx] : null;
}

function wonFinal(teamCode: string, matches: Match[]): boolean {
  const final = matches.find(
    (m) =>
      m.stage === 'FINAL' &&
      m.status === 'FINISHED' &&
      m.homeScore !== null &&
      m.awayScore !== null &&
      (m.homeTeam === teamCode || m.awayTeam === teamCode),
  );
  if (!final) return false;
  const isHome = final.homeTeam === teamCode;
  const teamScore = (isHome ? final.homeScore : final.awayScore) as number;
  const oppScore = (isHome ? final.awayScore : final.homeScore) as number;
  return teamScore > oppScore;
}

/**
 * The status to show on a team's dashboard pill, reflecting where the team is in
 * the tournament right now:
 * - group stage → "Nth in group" (tone keyed off the live group position)
 * - knockouts   → the current round it has reached ("Round of 16", …), or
 *   "Winners 🏆" once it has won the final
 * - eliminated  → "Out · {round it went out}"
 *
 * `groupPosition` is the team's 1-based live standing within its group.
 */
export function teamProgress(team: Team, groupPosition: number, matches: Match[]): TeamProgress {
  if (team.eliminated) {
    const at = team.eliminatedAt?.replace(/_/g, ' ');
    return { label: at ? `Out · ${at}` : 'Out', tone: 'OUT' };
  }

  const round = furthestKnockoutRound(team.teamCode, matches);
  if (round) {
    if (round === 'FINAL' && wonFinal(team.teamCode, matches)) {
      return { label: 'Winners 🏆', tone: 'CHAMPION' };
    }
    return { label: ROUND_LABELS[round], tone: 'ADVANCED' };
  }

  const tone: ProgressTone =
    groupPosition <= 2 ? 'QUALIFY' : groupPosition === 3 ? 'THIRD' : 'BOTTOM';
  return { label: `${ordinal(groupPosition)} in group`, tone };
}
