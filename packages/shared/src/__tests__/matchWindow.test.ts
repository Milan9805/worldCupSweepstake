import { isMatchActive, hasActiveMatchWindow, IMMINENT_MS, RECENT_MS } from '../matchWindow';
import { Match } from '../types';

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

describe('isMatchActive', () => {
  it('treats a LIVE match as active regardless of kickoff time', () => {
    const longAgo = new Date(NOW - 10 * 60 * 60 * 1000).toISOString();
    expect(isMatchActive(makeMatch({ status: 'LIVE', datetime: longAgo }), NOW)).toBe(true);
  });

  it('treats a FINISHED match as inactive even if it kicked off recently', () => {
    expect(isMatchActive(makeMatch({ status: 'FINISHED' }), NOW)).toBe(false);
  });

  it('is active when kickoff is imminent (within IMMINENT_MS)', () => {
    const kickoff = new Date(NOW + IMMINENT_MS - 60_000).toISOString();
    expect(isMatchActive(makeMatch({ datetime: kickoff }), NOW)).toBe(true);
  });

  it('is inactive when kickoff is further out than IMMINENT_MS', () => {
    const kickoff = new Date(NOW + IMMINENT_MS + 60_000).toISOString();
    expect(isMatchActive(makeMatch({ datetime: kickoff }), NOW)).toBe(false);
  });

  it('stays active for a scheduled match that kicked off within RECENT_MS (feed lag)', () => {
    const kickoff = new Date(NOW - RECENT_MS + 60_000).toISOString();
    expect(isMatchActive(makeMatch({ datetime: kickoff }), NOW)).toBe(true);
  });

  it('is inactive once kickoff is older than RECENT_MS', () => {
    const kickoff = new Date(NOW - RECENT_MS - 60_000).toISOString();
    expect(isMatchActive(makeMatch({ datetime: kickoff }), NOW)).toBe(false);
  });

  it('is inactive when the datetime is unparseable', () => {
    expect(isMatchActive(makeMatch({ datetime: 'not-a-date' }), NOW)).toBe(false);
  });
});

describe('hasActiveMatchWindow', () => {
  it('returns false for an empty fixture list', () => {
    expect(hasActiveMatchWindow([], NOW)).toBe(false);
  });

  it('returns false when every match is finished or far away', () => {
    const matches = [
      makeMatch({ status: 'FINISHED' }),
      makeMatch({ datetime: new Date(NOW + 24 * 60 * 60 * 1000).toISOString() }),
    ];
    expect(hasActiveMatchWindow(matches, NOW)).toBe(false);
  });

  it('returns true when at least one match is active', () => {
    const matches = [
      makeMatch({ status: 'FINISHED' }),
      makeMatch({ status: 'LIVE' }),
    ];
    expect(hasActiveMatchWindow(matches, NOW)).toBe(true);
  });
});
