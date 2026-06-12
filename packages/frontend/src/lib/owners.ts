import { Person, Team } from '@sweepstake/shared';

// The owner shape consumed by the banner, team cards and standings: just enough
// to render an Avatar + name next to a team.
export interface TeamOwner {
  name: string;
  imageUrl: string | null;
}

// Team code -> Team, for resolving flags/names from a TLA.
export function buildTeamsByCode(teams: Team[]): Record<string, Team> {
  return Object.fromEntries(teams.map((t) => [t.teamCode, t]));
}

// Team code -> the group member who owns it. A team belongs to at most one
// member. Previously hand-rolled on the dashboard, tree, bracket and groups
// pages — keep this the single implementation.
export function buildOwnersByTeam(members: Person[]): Record<string, TeamOwner> {
  return Object.fromEntries(
    members.flatMap((m) =>
      m.teams.map((code) => [code, { name: m.name, imageUrl: m.imageUrl }])
    )
  );
}
