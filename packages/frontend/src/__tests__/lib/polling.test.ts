import { pollIntervalFor, LIVE_POLL_MS, SOON_POLL_MS } from '../../lib/polling';
import { Match } from '@sweepstake/shared';

const NOW = new Date('2026-06-14T18:00:00Z').getTime();

const makeMatch = (overrides: Partial<Match> = {}): Match => ({
  matchId: 'm',
  homeTeam: 'ENG',
  awayTeam: 'BRA',
  homeScore: null,
  awayScore: null,
  status: 'SCHEDULED',
  stage: 'GROUP_STAGE',
  group: 'A',
  datetime: new Date(NOW).toISOString(),
  venue: 'Stadium',
  ...overrides,
});

describe('pollIntervalFor', () => {
  it('polls fast when any match is live', () => {
    const matches = [makeMatch({ status: 'FINISHED' }), makeMatch({ status: 'LIVE' })];
    expect(pollIntervalFor(matches, NOW)).toBe(LIVE_POLL_MS);
  });

  it('polls slowly when a match is imminent but none are live', () => {
    const kickoff = new Date(NOW + 10 * 60_000).toISOString(); // 10 min away
    expect(pollIntervalFor([makeMatch({ datetime: kickoff })], NOW)).toBe(SOON_POLL_MS);
  });

  it('does not poll when nothing is on', () => {
    const matches = [
      makeMatch({ status: 'FINISHED' }),
      makeMatch({ datetime: new Date(NOW + 24 * 60 * 60_000).toISOString() }),
    ];
    expect(pollIntervalFor(matches, NOW)).toBeNull();
  });

  it('does not poll for an empty fixture list', () => {
    expect(pollIntervalFor([], NOW)).toBeNull();
  });
});
