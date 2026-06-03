import { teamProgress } from '../teamProgress';
import { Match, Team } from '../types';

const makeTeam = (overrides: Partial<Team> = {}): Team => ({
  teamCode: 'ENG',
  name: 'England',
  flag: '',
  fifaRanking: 4,
  groupLetter: 'A',
  eliminated: false,
  eliminatedAt: null,
  stats: {
    played: 3,
    wins: 2,
    draws: 1,
    losses: 0,
    goalsFor: 5,
    goalsAgainst: 1,
    goalDifference: 4,
    points: 7,
    yellowCards: 0,
    redCards: 0,
    possession: null,
    xG: null,
  },
  ...overrides,
});

const makeMatch = (overrides: Partial<Match> = {}): Match => ({
  matchId: 'm',
  homeTeam: 'ENG',
  awayTeam: 'BRA',
  homeScore: null,
  awayScore: null,
  status: 'SCHEDULED',
  stage: 'GROUP_STAGE',
  group: 'A',
  datetime: '2026-06-14T18:00:00Z',
  venue: 'Stadium',
  ...overrides,
});

describe('teamProgress', () => {
  describe('group stage', () => {
    it('labels a top-two team by ordinal with the QUALIFY tone', () => {
      expect(teamProgress(makeTeam(), 1, [])).toEqual({ label: '1st in group', tone: 'QUALIFY' });
      expect(teamProgress(makeTeam(), 2, [])).toEqual({ label: '2nd in group', tone: 'QUALIFY' });
    });

    it('labels third place with the THIRD tone', () => {
      expect(teamProgress(makeTeam(), 3, [])).toEqual({ label: '3rd in group', tone: 'THIRD' });
    });

    it('labels bottom of the group with the BOTTOM tone', () => {
      expect(teamProgress(makeTeam(), 4, [])).toEqual({ label: '4th in group', tone: 'BOTTOM' });
    });

    it('ignores group-stage matches when picking a knockout round', () => {
      const matches = [makeMatch({ stage: 'GROUP_STAGE' })];
      expect(teamProgress(makeTeam(), 1, matches)).toEqual({ label: '1st in group', tone: 'QUALIFY' });
    });
  });

  describe('knockouts', () => {
    it('shows the current knockout round for an alive team', () => {
      const matches = [makeMatch({ stage: 'ROUND_OF_16', awayTeam: 'GER' })];
      expect(teamProgress(makeTeam(), 1, matches)).toEqual({ label: 'Round of 16', tone: 'ADVANCED' });
    });

    it('uses the furthest round the team has reached', () => {
      const matches = [
        makeMatch({ matchId: 'r32', stage: 'ROUND_OF_32', awayTeam: 'GHA', status: 'FINISHED', homeScore: 2, awayScore: 0 }),
        makeMatch({ matchId: 'r16', stage: 'ROUND_OF_16', awayTeam: 'GER' }),
      ];
      expect(teamProgress(makeTeam(), 1, matches)).toEqual({ label: 'Round of 16', tone: 'ADVANCED' });
    });

    it('ignores knockout matches that do not involve the team', () => {
      const matches = [
        makeMatch({ matchId: 'other', stage: 'SEMI_FINAL', homeTeam: 'FRA', awayTeam: 'GER' }),
        makeMatch({ matchId: 'r16', stage: 'ROUND_OF_16', homeTeam: 'ENG', awayTeam: 'BRA' }),
      ];
      expect(teamProgress(makeTeam(), 1, matches)).toEqual({ label: 'Round of 16', tone: 'ADVANCED' });
    });

    it('stays on the final round when the final is still to be played', () => {
      const matches = [makeMatch({ stage: 'FINAL', awayTeam: 'FRA' })];
      expect(teamProgress(makeTeam(), 1, matches)).toEqual({ label: 'Final', tone: 'ADVANCED' });
    });

    it('crowns the home winner of the final', () => {
      const matches = [
        makeMatch({ stage: 'FINAL', homeTeam: 'ENG', awayTeam: 'FRA', status: 'FINISHED', homeScore: 2, awayScore: 1 }),
      ];
      expect(teamProgress(makeTeam(), 1, matches)).toEqual({ label: 'Winners 🏆', tone: 'CHAMPION' });
    });

    it('crowns the away winner of the final', () => {
      const matches = [
        makeMatch({ stage: 'FINAL', homeTeam: 'FRA', awayTeam: 'ENG', status: 'FINISHED', homeScore: 1, awayScore: 3 }),
      ];
      expect(teamProgress(makeTeam(), 1, matches)).toEqual({ label: 'Winners 🏆', tone: 'CHAMPION' });
    });

    it('does not crown an alive team that lost the final', () => {
      const matches = [
        makeMatch({ stage: 'FINAL', homeTeam: 'ENG', awayTeam: 'FRA', status: 'FINISHED', homeScore: 0, awayScore: 1 }),
      ];
      expect(teamProgress(makeTeam(), 1, matches)).toEqual({ label: 'Final', tone: 'ADVANCED' });
    });
  });

  describe('eliminated', () => {
    it('shows where a team went out, formatting the round name', () => {
      const team = makeTeam({ eliminated: true, eliminatedAt: 'ROUND_OF_16' });
      expect(teamProgress(team, 1, [])).toEqual({ label: 'Out · ROUND OF 16', tone: 'OUT' });
    });

    it('keeps an already-friendly round name as-is', () => {
      const team = makeTeam({ eliminated: true, eliminatedAt: 'Quarter Final' });
      expect(teamProgress(team, 2, [])).toEqual({ label: 'Out · Quarter Final', tone: 'OUT' });
    });

    it('falls back to "Out" when no round is recorded', () => {
      const team = makeTeam({ eliminated: true, eliminatedAt: null });
      expect(teamProgress(team, 4, [])).toEqual({ label: 'Out', tone: 'OUT' });
    });
  });
});
