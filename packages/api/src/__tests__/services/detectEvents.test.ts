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
    it('emits a per-index GOAL when the home score increases (no actions yet)', () => {
      const existing = makeMatch({ homeScore: 0, awayScore: 0, status: 'LIVE' });
      const merged = makeMatch({ homeScore: 1, awayScore: 0, status: 'LIVE' });

      const events = detectEvents(existing, merged, NO_TEAMS);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventId: 'm1#GOAL#home#0',
        type: 'GOAL',
        teamCode: 'ENG',
        matchId: 'm1',
        payload: {
          scoringTeam: 'ENG',
          side: 'home',
          homeScore: 1,
          awayScore: 0,
          goalIndex: 0,
        },
      });
      // No action present yet -> scorer omitted entirely.
      expect(events[0].payload).not.toHaveProperty('scorer');
      expect(events[0].payload).not.toHaveProperty('scorerMinute');
    });

    it('emits a per-index GOAL when the away score increases', () => {
      const existing = makeMatch({ homeScore: 1, awayScore: 0, status: 'LIVE' });
      const merged = makeMatch({ homeScore: 1, awayScore: 1, status: 'LIVE' });

      const events = detectEvents(existing, merged, NO_TEAMS);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventId: 'm1#GOAL#away#0',
        type: 'GOAL',
        teamCode: 'BRA',
        payload: { scoringTeam: 'BRA', side: 'away', homeScore: 1, awayScore: 1, goalIndex: 0 },
      });
    });

    it('treats a null->value first goal as a GOAL', () => {
      const existing = makeMatch({ homeScore: null, awayScore: null, status: 'LIVE' });
      const merged = makeMatch({ homeScore: 1, awayScore: 0, status: 'LIVE' });

      const events = detectEvents(existing, merged, NO_TEAMS);

      expect(events.map((e) => e.type)).toEqual(['GOAL']);
      expect(events[0].eventId).toBe('m1#GOAL#home#0');
    });

    it('emits all merged indices when existing is undefined (first detect)', () => {
      const merged = makeMatch({ homeScore: 2, awayScore: 1, status: 'LIVE' });

      const events = detectEvents(undefined, merged, NO_TEAMS);

      const goals = events.filter((e) => e.type === 'GOAL');
      expect(goals.map((e) => e.eventId).sort()).toEqual([
        'm1#GOAL#away#0',
        'm1#GOAL#home#0',
        'm1#GOAL#home#1',
      ]);
    });

    it('emits one event per side when both sides score in one poll', () => {
      const existing = makeMatch({ homeScore: 0, awayScore: 0, status: 'LIVE' });
      const merged = makeMatch({ homeScore: 1, awayScore: 1, status: 'LIVE' });

      const events = detectEvents(existing, merged, NO_TEAMS);

      const goals = events.filter((e) => e.type === 'GOAL');
      expect(goals).toHaveLength(2);
      expect(goals.map((e) => e.eventId).sort()).toEqual([
        'm1#GOAL#away#0',
        'm1#GOAL#home#0',
      ]);
      expect(goals.map((e) => e.teamCode).sort()).toEqual(['BRA', 'ENG']);
    });

    it('emits #0 and #1 when one side scores twice in a single poll', () => {
      const existing = makeMatch({ homeScore: 0, awayScore: 0, status: 'LIVE' });
      const merged = makeMatch({ homeScore: 2, awayScore: 0, status: 'LIVE' });

      const events = detectEvents(existing, merged, NO_TEAMS);

      const goals = events.filter((e) => e.type === 'GOAL');
      expect(goals.map((e) => e.eventId).sort()).toEqual([
        'm1#GOAL#home#0',
        'm1#GOAL#home#1',
      ]);
      expect(goals.every((e) => e.teamCode === 'ENG')).toBe(true);
    });

    it('does not re-emit a GOAL when score and scorer are unchanged', () => {
      const goalAction = { team: 'ENG', player: 'Kane', type: 'GOAL' as const, minute: "23'" };
      const existing = makeMatch({ homeScore: 1, awayScore: 0, status: 'LIVE', actions: [goalAction] });
      const merged = makeMatch({ homeScore: 1, awayScore: 0, status: 'LIVE', actions: [goalAction] });

      const events = detectEvents(existing, merged, NO_TEAMS);

      expect(events.some((e) => e.type === 'GOAL')).toBe(false);
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

  describe('cards', () => {
    it('emits a YELLOW_CARD for a new booking action', () => {
      const existing = makeMatch({ status: 'LIVE', homeScore: 0, awayScore: 0 });
      const merged = makeMatch({
        status: 'LIVE',
        homeScore: 0,
        awayScore: 0,
        actions: [{ team: 'ENG', player: 'Stones', type: 'YELLOW_CARD', minute: "34'" }],
      });

      const events = detectEvents(existing, merged, NO_TEAMS);

      const cards = events.filter((e) => e.type === 'YELLOW_CARD');
      expect(cards).toHaveLength(1);
      expect(cards[0]).toMatchObject({
        eventId: "m1#YELLOW_CARD#ENG#Stones#34'",
        type: 'YELLOW_CARD',
        teamCode: 'ENG',
        matchId: 'm1',
        payload: {
          teamCode: 'ENG',
          player: 'Stones',
          minute: "34'",
          homeTeam: 'ENG',
          awayTeam: 'BRA',
        },
      });
    });

    it('emits a RED_CARD for a new sending-off action', () => {
      const existing = makeMatch({ status: 'LIVE', homeScore: 0, awayScore: 0 });
      const merged = makeMatch({
        status: 'LIVE',
        homeScore: 0,
        awayScore: 0,
        actions: [{ team: 'BRA', player: 'Casemiro', type: 'RED_CARD', minute: "61'" }],
      });

      const events = detectEvents(existing, merged, NO_TEAMS);

      const cards = events.filter((e) => e.type === 'RED_CARD');
      expect(cards).toHaveLength(1);
      expect(cards[0]).toMatchObject({
        eventId: "m1#RED_CARD#BRA#Casemiro#61'",
        type: 'RED_CARD',
        teamCode: 'BRA',
        payload: { teamCode: 'BRA', player: 'Casemiro', minute: "61'" },
      });
    });

    it('does not re-emit a card already present in existing.actions', () => {
      const card = { team: 'ENG', player: 'Stones', type: 'YELLOW_CARD' as const, minute: "34'" };
      const existing = makeMatch({ status: 'LIVE', homeScore: 0, awayScore: 0, actions: [card] });
      const merged = makeMatch({ status: 'LIVE', homeScore: 0, awayScore: 0, actions: [card] });

      const events = detectEvents(existing, merged, NO_TEAMS);

      expect(events.some((e) => e.type === 'YELLOW_CARD' || e.type === 'RED_CARD')).toBe(false);
    });

    it('emits both cards when two different bookings appear in one transition', () => {
      const existing = makeMatch({ status: 'LIVE', homeScore: 0, awayScore: 0, actions: [] });
      const merged = makeMatch({
        status: 'LIVE',
        homeScore: 0,
        awayScore: 0,
        actions: [
          { team: 'ENG', player: 'Stones', type: 'YELLOW_CARD', minute: "34'" },
          { team: 'BRA', player: 'Casemiro', type: 'RED_CARD', minute: "61'" },
        ],
      });

      const events = detectEvents(existing, merged, NO_TEAMS);

      expect(events.filter((e) => e.type === 'YELLOW_CARD')).toHaveLength(1);
      expect(events.filter((e) => e.type === 'RED_CARD')).toHaveLength(1);
      const ids = events
        .filter((e) => e.type === 'YELLOW_CARD' || e.type === 'RED_CARD')
        .map((e) => e.eventId)
        .sort();
      expect(ids).toEqual(["m1#RED_CARD#BRA#Casemiro#61'", "m1#YELLOW_CARD#ENG#Stones#34'"]);
    });

    it('anchors a card ts to kickoff + clock minute, not detection time', () => {
      // Kickoff 18:00; a 34' booking happened ~34 real minutes in, so the feed
      // should read "34 minutes after kickoff", not "just now" when scraped late.
      const existing = makeMatch({ status: 'LIVE', homeScore: 0, awayScore: 0 });
      const merged = makeMatch({
        status: 'LIVE',
        homeScore: 0,
        awayScore: 0,
        actions: [{ team: 'ENG', player: 'Stones', type: 'YELLOW_CARD', minute: "34'" }],
      });

      const card = detectEvents(existing, merged, NO_TEAMS).find((e) => e.type === 'YELLOW_CARD');
      expect(card?.ts).toBe('2026-06-14T18:34:00.000Z');
    });

    it('adds the half-time break for second-half minutes', () => {
      // 61' is in the second half: 61 clock mins + ~15 min interval = 76 real
      // minutes after an 18:00 kickoff -> 19:16.
      const existing = makeMatch({ status: 'LIVE', homeScore: 0, awayScore: 0 });
      const merged = makeMatch({
        status: 'LIVE',
        homeScore: 0,
        awayScore: 0,
        actions: [{ team: 'BRA', player: 'Casemiro', type: 'RED_CARD', minute: "61'" }],
      });

      const card = detectEvents(existing, merged, NO_TEAMS).find((e) => e.type === 'RED_CARD');
      expect(card?.ts).toBe('2026-06-14T19:16:00.000Z');
    });

    it('adds first-half stoppage without the half-time break', () => {
      // "45'+1" is added time in the FIRST half: 46 real minutes in, no interval.
      const existing = makeMatch({ status: 'LIVE', homeScore: 0, awayScore: 0 });
      const merged = makeMatch({
        status: 'LIVE',
        homeScore: 0,
        awayScore: 0,
        actions: [{ team: 'ENG', player: 'Rice', type: 'YELLOW_CARD', minute: "45'+1" }],
      });

      const card = detectEvents(existing, merged, NO_TEAMS).find((e) => e.type === 'YELLOW_CARD');
      expect(card?.ts).toBe('2026-06-14T18:46:00.000Z');
    });
  });

  describe('GOAL scorer enrichment', () => {
    it('adds scorer/scorerMinute for a single new home goal action', () => {
      const existing = makeMatch({ status: 'LIVE', homeScore: 0, awayScore: 0, actions: [] });
      const merged = makeMatch({
        status: 'LIVE',
        homeScore: 1,
        awayScore: 0,
        actions: [{ team: 'ENG', player: 'Kane', type: 'GOAL', minute: "23'" }],
      });

      const events = detectEvents(existing, merged, NO_TEAMS);

      const goal = events.find((e) => e.type === 'GOAL');
      expect(goal).toBeDefined();
      expect(goal?.eventId).toBe('m1#GOAL#home#0');
      expect(goal?.payload).toMatchObject({
        scoringTeam: 'ENG',
        side: 'home',
        scorer: 'Kane',
        scorerMinute: "23'",
      });
    });

    it('adds scorer/scorerMinute for a single new away goal action', () => {
      const existing = makeMatch({ status: 'LIVE', homeScore: 1, awayScore: 0, actions: [] });
      const merged = makeMatch({
        status: 'LIVE',
        homeScore: 1,
        awayScore: 1,
        actions: [{ team: 'BRA', player: 'Vinicius', type: 'GOAL', minute: "70'" }],
      });

      const events = detectEvents(existing, merged, NO_TEAMS);

      const goal = events.find((e) => e.type === 'GOAL');
      expect(goal?.eventId).toBe('m1#GOAL#away#0');
      expect(goal?.payload).toMatchObject({
        scoringTeam: 'BRA',
        side: 'away',
        scorer: 'Vinicius',
        scorerMinute: "70'",
      });
    });

    it('re-emits the same GOAL eventId with the scorer when the action lands in a later poll', () => {
      // Poll 1 already produced m1#GOAL#home#0 scorer-less; the score is
      // unchanged this poll but the goal ACTION has now arrived.
      const existing = makeMatch({ status: 'LIVE', homeScore: 1, awayScore: 0, actions: [] });
      const merged = makeMatch({
        status: 'LIVE',
        homeScore: 1,
        awayScore: 0,
        actions: [{ team: 'ENG', player: 'Kane', type: 'GOAL', minute: "23'" }],
      });

      const events = detectEvents(existing, merged, NO_TEAMS);

      const goal = events.find((e) => e.type === 'GOAL');
      expect(goal).toBeDefined();
      // SAME deterministic eventId as poll 1 -> newest wins at read time.
      expect(goal?.eventId).toBe('m1#GOAL#home#0');
      expect(goal?.payload).toMatchObject({
        scoringTeam: 'ENG',
        side: 'home',
        scorer: 'Kane',
        scorerMinute: "23'",
      });
    });

    it('attaches the matching scorer to each index when two home goals arrive with both actions', () => {
      const existing = makeMatch({ status: 'LIVE', homeScore: 0, awayScore: 0, actions: [] });
      const merged = makeMatch({
        status: 'LIVE',
        homeScore: 2,
        awayScore: 0,
        actions: [
          { team: 'ENG', player: 'Kane', type: 'GOAL', minute: "23'" },
          { team: 'ENG', player: 'Bellingham', type: 'GOAL', minute: "24'" },
        ],
      });

      const events = detectEvents(existing, merged, NO_TEAMS);

      const goals = events.filter((e) => e.type === 'GOAL');
      const byId = new Map(goals.map((g) => [g.eventId, g]));
      expect(byId.get('m1#GOAL#home#0')?.payload).toMatchObject({
        goalIndex: 0,
        scorer: 'Kane',
        scorerMinute: "23'",
      });
      expect(byId.get('m1#GOAL#home#1')?.payload).toMatchObject({
        goalIndex: 1,
        scorer: 'Bellingham',
        scorerMinute: "24'",
      });
    });

    it('emits two scorer-less goals, then re-emits both with scorers once the actions arrive', () => {
      // Poll A: score jumps 0->2 with no actions yet.
      const existing = makeMatch({ status: 'LIVE', homeScore: 0, awayScore: 0, actions: [] });
      const afterScore = makeMatch({ status: 'LIVE', homeScore: 2, awayScore: 0, actions: [] });

      const firstEvents = detectEvents(existing, afterScore, NO_TEAMS);
      const firstGoals = firstEvents.filter((e) => e.type === 'GOAL');
      expect(firstGoals.map((e) => e.eventId).sort()).toEqual([
        'm1#GOAL#home#0',
        'm1#GOAL#home#1',
      ]);
      expect(firstGoals.every((g) => !('scorer' in g.payload))).toBe(true);

      // Poll B: same score, both goal actions have now landed.
      const withActions = makeMatch({
        status: 'LIVE',
        homeScore: 2,
        awayScore: 0,
        actions: [
          { team: 'ENG', player: 'Kane', type: 'GOAL', minute: "23'" },
          { team: 'ENG', player: 'Bellingham', type: 'GOAL', minute: "24'" },
        ],
      });

      const secondEvents = detectEvents(afterScore, withActions, NO_TEAMS);
      const secondGoals = secondEvents.filter((e) => e.type === 'GOAL');
      const byId = new Map(secondGoals.map((g) => [g.eventId, g]));
      // Same eventIds re-emitted, now carrying their scorers.
      expect([...byId.keys()].sort()).toEqual(['m1#GOAL#home#0', 'm1#GOAL#home#1']);
      expect(byId.get('m1#GOAL#home#0')?.payload).toMatchObject({ scorer: 'Kane', scorerMinute: "23'" });
      expect(byId.get('m1#GOAL#home#1')?.payload).toMatchObject({ scorer: 'Bellingham', scorerMinute: "24'" });
    });

    it('leaves an own goal scorer-less (action tagged with the conceding side)', () => {
      // Home score goes 0->1, but the only GOAL action belongs to the AWAY team
      // (an own goal is credited to the scorer's own side). It must not be
      // attributed to the away player on the home goal.
      const existing = makeMatch({ status: 'LIVE', homeScore: 0, awayScore: 0, actions: [] });
      const merged = makeMatch({
        status: 'LIVE',
        homeScore: 1,
        awayScore: 0,
        actions: [{ team: 'BRA', player: 'Marquinhos', type: 'GOAL', minute: "12'" }],
      });

      const events = detectEvents(existing, merged, NO_TEAMS);

      const goal = events.find((e) => e.type === 'GOAL' && e.eventId === 'm1#GOAL#home#0');
      expect(goal).toBeDefined();
      expect(goal?.payload).not.toHaveProperty('scorer');
      expect(goal?.payload).not.toHaveProperty('scorerMinute');
    });

    it('still emits the GOAL with no scorer when merged.actions is undefined', () => {
      const existing = makeMatch({ homeScore: 0, awayScore: 0, status: 'LIVE' });
      const merged = makeMatch({ homeScore: 1, awayScore: 0, status: 'LIVE' });

      const events = detectEvents(existing, merged, NO_TEAMS);

      const goal = events.find((e) => e.type === 'GOAL');
      expect(goal?.eventId).toBe('m1#GOAL#home#0');
      expect(goal?.payload).not.toHaveProperty('scorer');
      expect(goal?.payload).not.toHaveProperty('scorerMinute');
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
