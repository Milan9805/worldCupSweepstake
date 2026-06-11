import { detectEvents } from '../../services/detectEvents';
import { Match, Team } from '@sweepstake/shared';

// ===== Helpers =====

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    matchId: 'm1',
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
  };
}

function makeTeam(teamCode: string, overrides: Partial<Team> = {}): Team {
  return {
    teamCode,
    name: teamCode,
    flag: '🏁',
    fifaRanking: 10,
    groupLetter: 'A',
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
  };
}

function teamsMap(...teams: Team[]): Map<string, Team> {
  return new Map(teams.map((t) => [t.teamCode, t]));
}

const NO_TEAMS = teamsMap();

describe('detectEvents', () => {
  describe('GOAL', () => {
    it('emits a GOAL when the home score increases', () => {
      const existing = makeMatch({ homeScore: 0, awayScore: 0, status: 'LIVE' });
      const merged = makeMatch({ homeScore: 1, awayScore: 0, status: 'LIVE' });

      const events = detectEvents(existing, merged, NO_TEAMS);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventId: 'm1#GOAL#1-0',
        type: 'GOAL',
        teamCode: 'ENG',
        matchId: 'm1',
        payload: { scoringTeam: 'ENG', side: 'home', homeScore: 1, awayScore: 0 },
      });
    });

    it('emits a GOAL when the away score increases', () => {
      const existing = makeMatch({ homeScore: 1, awayScore: 0, status: 'LIVE' });
      const merged = makeMatch({ homeScore: 1, awayScore: 1, status: 'LIVE' });

      const events = detectEvents(existing, merged, NO_TEAMS);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventId: 'm1#GOAL#1-1',
        type: 'GOAL',
        teamCode: 'BRA',
        payload: { scoringTeam: 'BRA', side: 'away', homeScore: 1, awayScore: 1 },
      });
    });

    it('treats a null->value first goal as a GOAL', () => {
      const existing = makeMatch({ homeScore: null, awayScore: null, status: 'LIVE' });
      const merged = makeMatch({ homeScore: 1, awayScore: 0, status: 'LIVE' });

      const events = detectEvents(existing, merged, NO_TEAMS);

      expect(events.map((e) => e.type)).toEqual(['GOAL']);
      expect(events[0].eventId).toBe('m1#GOAL#1-0');
    });

    it('emits two GOAL events when both sides scored in one refresh', () => {
      const existing = makeMatch({ homeScore: 1, awayScore: 1, status: 'LIVE' });
      const merged = makeMatch({ homeScore: 2, awayScore: 2, status: 'LIVE' });

      const events = detectEvents(existing, merged, NO_TEAMS);

      const goals = events.filter((e) => e.type === 'GOAL');
      expect(goals).toHaveLength(2);
      expect(goals.map((e) => e.teamCode).sort()).toEqual(['BRA', 'ENG']);
      // Both share the deterministic final scoreline in their key.
      expect(goals.every((e) => e.eventId === 'm1#GOAL#2-2')).toBe(true);
    });
  });

  describe('KICKOFF', () => {
    it('emits KICKOFF on SCHEDULED -> LIVE', () => {
      const existing = makeMatch({ status: 'SCHEDULED' });
      const merged = makeMatch({ status: 'LIVE' });

      const events = detectEvents(existing, merged, NO_TEAMS);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventId: 'm1#KICKOFF',
        type: 'KICKOFF',
        matchId: 'm1',
        payload: { homeTeam: 'ENG', awayTeam: 'BRA' },
      });
    });
  });

  describe('HALF_TIME', () => {
    it('emits HALF_TIME when the clock enters the interval', () => {
      const existing = makeMatch({ status: 'LIVE', homeScore: 1, awayScore: 0, minute: "45'+1" });
      const merged = makeMatch({ status: 'LIVE', homeScore: 1, awayScore: 0, minute: 'HT' });

      const events = detectEvents(existing, merged, NO_TEAMS);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventId: 'm1#HALF_TIME',
        type: 'HALF_TIME',
        matchId: 'm1',
        payload: { homeTeam: 'ENG', awayTeam: 'BRA', homeScore: 1, awayScore: 0 },
      });
    });

    it('does not re-emit HALF_TIME while still at the interval', () => {
      const existing = makeMatch({ status: 'LIVE', homeScore: 1, awayScore: 0, minute: 'HT' });
      const merged = makeMatch({ status: 'LIVE', homeScore: 1, awayScore: 0, minute: 'HT' });

      expect(detectEvents(existing, merged, NO_TEAMS)).toEqual([]);
    });

    it('does not emit HALF_TIME when the second half kicks off', () => {
      const existing = makeMatch({ status: 'LIVE', homeScore: 1, awayScore: 0, minute: 'HT' });
      const merged = makeMatch({ status: 'LIVE', homeScore: 1, awayScore: 0, minute: "46'" });

      expect(detectEvents(existing, merged, NO_TEAMS).some((e) => e.type === 'HALF_TIME')).toBe(false);
    });

    it('tolerates a "Half Time" label variant', () => {
      const existing = makeMatch({ status: 'LIVE', homeScore: 0, awayScore: 0, minute: "44'" });
      const merged = makeMatch({ status: 'LIVE', homeScore: 0, awayScore: 0, minute: 'Half Time' });

      expect(detectEvents(existing, merged, NO_TEAMS).some((e) => e.type === 'HALF_TIME')).toBe(true);
    });
  });

  describe('FULL_TIME', () => {
    it('emits FULL_TIME with a home-win outcome', () => {
      const existing = makeMatch({ homeScore: 2, awayScore: 1, status: 'LIVE' });
      const merged = makeMatch({ homeScore: 2, awayScore: 1, status: 'FINISHED' });

      const events = detectEvents(existing, merged, NO_TEAMS);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventId: 'm1#FULL_TIME',
        type: 'FULL_TIME',
        payload: { homeScore: 2, awayScore: 1, outcome: 'home' },
      });
    });

    it('emits FULL_TIME with an away-win outcome', () => {
      const existing = makeMatch({ homeScore: 0, awayScore: 3, status: 'LIVE' });
      const merged = makeMatch({ homeScore: 0, awayScore: 3, status: 'FINISHED' });

      const events = detectEvents(existing, merged, NO_TEAMS);

      const ft = events.find((e) => e.type === 'FULL_TIME');
      expect(ft?.payload.outcome).toBe('away');
    });

    it('emits FULL_TIME with a draw outcome', () => {
      const existing = makeMatch({ homeScore: 1, awayScore: 1, status: 'LIVE' });
      const merged = makeMatch({ homeScore: 1, awayScore: 1, status: 'FINISHED' });

      const events = detectEvents(existing, merged, NO_TEAMS);

      const ft = events.find((e) => e.type === 'FULL_TIME');
      expect(ft?.payload.outcome).toBe('draw');
    });
  });

  describe('ELIMINATION', () => {
    it('emits ELIMINATION for an involved team eliminated this full time', () => {
      const existing = makeMatch({
        stage: 'ROUND_OF_16',
        homeScore: 0,
        awayScore: 1,
        status: 'LIVE',
      });
      const merged = makeMatch({
        stage: 'ROUND_OF_16',
        homeScore: 0,
        awayScore: 1,
        status: 'FINISHED',
      });
      const teams = teamsMap(
        makeTeam('ENG', { eliminated: true, eliminatedAt: 'Round of 16' }),
        makeTeam('BRA', { eliminated: false })
      );

      const events = detectEvents(existing, merged, teams);

      const elim = events.filter((e) => e.type === 'ELIMINATION');
      expect(elim).toHaveLength(1);
      expect(elim[0]).toMatchObject({
        eventId: 'ENG#ELIMINATED',
        type: 'ELIMINATION',
        teamCode: 'ENG',
        payload: { teamCode: 'ENG', eliminatedAt: 'Round of 16' },
      });
      // The full-time event is still present alongside it.
      expect(events.some((e) => e.type === 'FULL_TIME')).toBe(true);
    });

    it('does not emit ELIMINATION while the match is still live', () => {
      const existing = makeMatch({ stage: 'ROUND_OF_16', homeScore: 0, awayScore: 0, status: 'SCHEDULED' });
      const merged = makeMatch({ stage: 'ROUND_OF_16', homeScore: 0, awayScore: 0, status: 'LIVE' });
      const teams = teamsMap(makeTeam('ENG', { eliminated: true }));

      const events = detectEvents(existing, merged, teams);

      expect(events.some((e) => e.type === 'ELIMINATION')).toBe(false);
    });
  });

  describe('no change', () => {
    it('returns [] when existing and merged are the same reference', () => {
      const m = makeMatch({ homeScore: 1, awayScore: 0, status: 'LIVE' });
      expect(detectEvents(m, m, NO_TEAMS)).toEqual([]);
    });

    it('returns [] when only a non-event field changed', () => {
      const existing = makeMatch({ status: 'LIVE', homeScore: 1, awayScore: 0, venue: 'Old Stadium' });
      const merged = makeMatch({ status: 'LIVE', homeScore: 1, awayScore: 0, venue: 'New Stadium' });

      expect(detectEvents(existing, merged, NO_TEAMS)).toEqual([]);
    });
  });
});
