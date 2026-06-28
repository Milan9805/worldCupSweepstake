import { Team } from './types';

// FIFA World Cup group stage: 4 teams, single round-robin → 3 games each.
const GROUP_GAMES_PER_TEAM = 3;

const remainingGames = (team: Team): number =>
  Math.max(0, GROUP_GAMES_PER_TEAM - team.stats.played);

/**
 * Could `contender` still finish above `target` in the final group table, given
 * the most favourable remaining results for `contender` and the worst for
 * `target`? Compared by the standard ranking order: points, then goal
 * difference, then goals for. Goal-based tiebreaks only decide the order once
 * neither side has games left to change them; while games remain, an
 * equal-points finish is treated as beatable on goal difference.
 */
function couldFinishAbove(contender: Team, target: Team): boolean {
  const contenderMaxPts = contender.stats.points + 3 * remainingGames(contender);
  const targetMinPts = target.stats.points;

  if (contenderMaxPts !== targetMinPts) return contenderMaxPts > targetMinPts;

  // Level on points. If either side can still move its goal difference, the
  // contender could win the tiebreak.
  if (remainingGames(contender) > 0 || remainingGames(target) > 0) return true;

  // Both finished — settle on the fixed goal-difference / goals-for figures.
  if (contender.stats.goalDifference !== target.stats.goalDifference) {
    return contender.stats.goalDifference > target.stats.goalDifference;
  }
  if (contender.stats.goalsFor !== target.stats.goalsFor) {
    return contender.stats.goalsFor > target.stats.goalsFor;
  }
  // Completely level — order is unresolved, so treat as a threat.
  return true;
}

/**
 * Team codes that have mathematically clinched a top-two finish in their group
 * (guaranteed to qualify directly, regardless of remaining results).
 *
 * A team is clinched when at most one other team can still finish above it.
 * Conservative by construction: every team that could overtake in any scenario
 * is counted as a threat, so it never reports a team as qualified unless it is
 * genuinely guaranteed. It may stay silent in rare cases where the teams that
 * could overtake cannot all do so at once.
 */
export function clinchedTopTwo(groupTeams: Team[]): Set<string> {
  const clinched = new Set<string>();
  for (const team of groupTeams) {
    const threats = groupTeams.filter(
      (other) => other.teamCode !== team.teamCode && couldFinishAbove(other, team),
    ).length;
    if (threats <= 1) clinched.add(team.teamCode);
  }
  return clinched;
}

/**
 * Qualification zone for a row in a group-standings table.
 * - `QUALIFIED`  — mathematically through to the knockouts (top two clinched).
 * - `TOP_TWO`    — currently in a direct-qualification spot, not yet confirmed.
 * - `THIRD`      — third place; in the running for a best-third-placed spot.
 * - `NONE`       — currently outside the qualification picture.
 */
export type GroupZone = 'QUALIFIED' | 'TOP_TWO' | 'THIRD' | 'NONE';

/**
 * Map each team to its qualification zone. Expects `groupTeams` already in
 * standings order (best first); positions drive the live `TOP_TWO` / `THIRD`
 * zones while {@link clinchedTopTwo} drives the confirmed `QUALIFIED` zone.
 *
 * `qualifiedThirds` (optional) is the set of third-placed team codes that have
 * secured one of the best-third-placed knockout spots — known only once the
 * group stage is complete and computed across all groups. When a group's
 * third-placed team is in that set its zone is promoted from the live `THIRD`
 * (still in the running) to the confirmed `QUALIFIED`.
 */
export function groupZones(
  groupTeams: Team[],
  qualifiedThirds?: Set<string>,
): Map<string, GroupZone> {
  const clinched = clinchedTopTwo(groupTeams);
  const zones = new Map<string, GroupZone>();
  groupTeams.forEach((team, idx) => {
    let zone: GroupZone;
    if (clinched.has(team.teamCode)) {
      zone = 'QUALIFIED';
    } else if (idx < 2) {
      zone = 'TOP_TWO';
    } else if (idx === 2) {
      zone = qualifiedThirds?.has(team.teamCode) ? 'QUALIFIED' : 'THIRD';
    } else {
      zone = 'NONE';
    }
    zones.set(team.teamCode, zone);
  });
  return zones;
}
