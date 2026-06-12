import { buildTeamsByCode, buildOwnersByTeam } from '../../lib/owners';
import { Person, Team } from '@sweepstake/shared';

const makeTeam = (overrides: Partial<Team> = {}): Team => ({
  teamCode: 'GER',
  name: 'Germany',
  flag: '🇩🇪',
  fifaRanking: 10,
  groupLetter: 'E',
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
  },
  eliminated: false,
  eliminatedAt: null,
  ...overrides,
});

const makePerson = (overrides: Partial<Person> = {}): Person => ({
  name: 'Milan',
  imageUrl: null,
  teams: ['GER'],
  ...overrides,
});

describe('buildTeamsByCode', () => {
  it('keys each team by its teamCode', () => {
    const ger = makeTeam({ teamCode: 'GER', name: 'Germany' });
    const fra = makeTeam({ teamCode: 'FRA', name: 'France', flag: '🇫🇷' });

    expect(buildTeamsByCode([ger, fra])).toEqual({ GER: ger, FRA: fra });
  });

  it('returns an empty map for no teams', () => {
    expect(buildTeamsByCode([])).toEqual({});
  });
});

describe('buildOwnersByTeam', () => {
  it("maps each of a member's teams to that member", () => {
    const members = [
      makePerson({ name: 'Milan', imageUrl: '/milan.png', teams: ['GER', 'BRA'] }),
      makePerson({ name: 'Dad', imageUrl: null, teams: ['FRA'] }),
    ];

    expect(buildOwnersByTeam(members)).toEqual({
      GER: { name: 'Milan', imageUrl: '/milan.png' },
      BRA: { name: 'Milan', imageUrl: '/milan.png' },
      FRA: { name: 'Dad', imageUrl: null },
    });
  });

  it('skips members with no teams', () => {
    const members = [
      makePerson({ name: 'Milan', teams: ['GER'] }),
      makePerson({ name: 'Latecomer', teams: [] }),
    ];

    expect(buildOwnersByTeam(members)).toEqual({
      GER: { name: 'Milan', imageUrl: null },
    });
  });

  it('returns an empty map for no members', () => {
    expect(buildOwnersByTeam([])).toEqual({});
  });
});
