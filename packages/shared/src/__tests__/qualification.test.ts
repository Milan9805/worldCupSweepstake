import { clinchedTopTwo, groupZones } from '../qualification';
import { Team, TeamStats } from '../types';

const makeTeam = (teamCode: string, stats: Partial<TeamStats> = {}): Team => ({
  teamCode,
  name: teamCode,
  flag: '',
  fifaRanking: 10,
  groupLetter: 'A',
  eliminated: false,
  eliminatedAt: null,
  stats: {
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    yellowCards: 0,
    redCards: 0,
    possession: null,
    xG: null,
    ...stats,
  },
});

describe('clinchedTopTwo', () => {
  it('clinches nobody before any matches are played', () => {
    const teams = ['A', 'B', 'C', 'D'].map((c) => makeTeam(c, { played: 0 }));
    expect(clinchedTopTwo(teams).size).toBe(0);
  });

  it('clinches the top two when the group is decided with clear separation', () => {
    const teams = [
      makeTeam('A', { played: 3, points: 9, goalDifference: 6, goalsFor: 8 }),
      makeTeam('B', { played: 3, points: 6, goalDifference: 2, goalsFor: 5 }),
      makeTeam('C', { played: 3, points: 3, goalDifference: -2, goalsFor: 3 }),
      makeTeam('D', { played: 3, points: 0, goalDifference: -6, goalsFor: 1 }),
    ];
    const clinched = clinchedTopTwo(teams);
    expect([...clinched].sort()).toEqual(['A', 'B']);
  });

  it('does not clinch a leader while two chasers can still both overtake', () => {
    // Two rounds played, one game left each. A leads on 6 but B and C can each
    // reach 6, so A is not yet guaranteed top two.
    const teams = [
      makeTeam('A', { played: 2, points: 6 }),
      makeTeam('B', { played: 2, points: 3 }),
      makeTeam('C', { played: 2, points: 3 }),
      makeTeam('D', { played: 2, points: 0 }),
    ];
    expect(clinchedTopTwo(teams).size).toBe(0);
  });

  it('settles a points tie on goal difference once the group is finished', () => {
    const teams = [
      makeTeam('A', { played: 3, points: 9, goalDifference: 5, goalsFor: 7 }),
      makeTeam('B', { played: 3, points: 4, goalDifference: 2, goalsFor: 5 }),
      makeTeam('C', { played: 3, points: 4, goalDifference: 0, goalsFor: 4 }),
      makeTeam('D', { played: 3, points: 1, goalDifference: -7, goalsFor: 2 }),
    ];
    const clinched = clinchedTopTwo(teams);
    // B edges C on goal difference, so B is through and C is not.
    expect([...clinched].sort()).toEqual(['A', 'B']);
  });

  it('settles a points + goal-difference tie on goals scored once finished', () => {
    const teams = [
      makeTeam('A', { played: 3, points: 9, goalDifference: 5, goalsFor: 9 }),
      makeTeam('B', { played: 3, points: 4, goalDifference: 1, goalsFor: 6 }),
      makeTeam('C', { played: 3, points: 4, goalDifference: 1, goalsFor: 4 }),
      makeTeam('D', { played: 3, points: 1, goalDifference: -7, goalsFor: 2 }),
    ];
    const clinched = clinchedTopTwo(teams);
    // B beats C on goals scored after level points and goal difference.
    expect([...clinched].sort()).toEqual(['A', 'B']);
  });

  it('treats two completely level teams as unresolved (neither clinched)', () => {
    const teams = [
      makeTeam('A', { played: 3, points: 9, goalDifference: 5, goalsFor: 7 }),
      makeTeam('B', { played: 3, points: 3, goalDifference: 0, goalsFor: 3 }),
      makeTeam('C', { played: 3, points: 3, goalDifference: 0, goalsFor: 3 }),
      makeTeam('D', { played: 3, points: 0, goalDifference: -5, goalsFor: 1 }),
    ];
    const clinched = clinchedTopTwo(teams);
    // A is clear; B and C are dead level so neither is guaranteed second.
    expect([...clinched].sort()).toEqual(['A']);
  });
});

describe('groupZones', () => {
  it('marks confirmed, third-place and outside zones for a finished group', () => {
    const teams = [
      makeTeam('A', { played: 3, points: 9, goalDifference: 6, goalsFor: 8 }),
      makeTeam('B', { played: 3, points: 6, goalDifference: 2, goalsFor: 5 }),
      makeTeam('C', { played: 3, points: 3, goalDifference: -2, goalsFor: 3 }),
      makeTeam('D', { played: 3, points: 0, goalDifference: -6, goalsFor: 1 }),
    ];
    const zones = groupZones(teams);
    expect(zones.get('A')).toBe('QUALIFIED');
    expect(zones.get('B')).toBe('QUALIFIED');
    expect(zones.get('C')).toBe('THIRD');
    expect(zones.get('D')).toBe('NONE');
  });

  it('marks the top two as TOP_TWO when their place is not yet confirmed', () => {
    const teams = [
      makeTeam('A', { played: 2, points: 6, goalDifference: 3 }),
      makeTeam('B', { played: 2, points: 3, goalDifference: 1 }),
      makeTeam('C', { played: 2, points: 3, goalDifference: 0 }),
      makeTeam('D', { played: 2, points: 0, goalDifference: -4 }),
    ];
    const zones = groupZones(teams);
    expect(zones.get('A')).toBe('TOP_TWO');
    expect(zones.get('B')).toBe('TOP_TWO');
    expect(zones.get('C')).toBe('THIRD');
    expect(zones.get('D')).toBe('NONE');
  });
});
