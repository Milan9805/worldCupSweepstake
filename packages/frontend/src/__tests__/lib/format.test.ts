import { Match } from '@sweepstake/shared';
import {
  formatMatchDate,
  formatMatchTime,
  formatStage,
  formatTimeUntil,
  relativeTime,
  relativeTimeLines,
  stageHref,
} from '../../lib/format';

describe('formatMatchDate', () => {
  it('formats an ISO datetime as a short UK date', () => {
    // 14 Jun 2026 is a Sunday. Separator after the weekday is locale/ICU
    // dependent, so match loosely rather than pinning the comma.
    expect(formatMatchDate('2026-06-14T18:00:00Z')).toMatch(/Sun.*14 Jun/);
  });

  it('uses Europe/London time, rolling into the next day late at night (BST)', () => {
    // 23:30 UTC on 14 Jun is 00:30 on 15 Jun in British Summer Time.
    expect(formatMatchDate('2026-06-14T23:30:00Z')).toMatch(/Mon.*15 Jun/);
  });
});

describe('formatMatchTime', () => {
  it('formats an ISO datetime as 24h UK time (BST = UTC+1 in June)', () => {
    expect(formatMatchTime('2026-06-14T18:00:00Z')).toBe('19:00');
  });
});

describe('formatTimeUntil', () => {
  const now = Date.parse('2026-06-12T10:00:00Z');
  const H = 3_600_000;
  const M = 60_000;
  const S = 1_000;
  const inMs = (ms: number) => new Date(now + ms).toISOString();

  it('shows hours and minutes when more than an hour away', () => {
    expect(formatTimeUntil(inMs(2 * H + 15 * M), now)).toBe('in 2h 15m');
  });

  it('shows whole hours with zero minutes', () => {
    expect(formatTimeUntil(inMs(H), now)).toBe('in 1h 0m');
  });

  it('shows minutes only when under an hour away', () => {
    expect(formatTimeUntil(inMs(45 * M), now)).toBe('in 45m');
  });

  it('shows seconds only when under a minute away', () => {
    expect(formatTimeUntil(inMs(30 * S), now)).toBe('in 30s');
  });

  it('says "Kicking off…" at kick-off', () => {
    expect(formatTimeUntil(inMs(0), now)).toBe('Kicking off…');
  });

  it('says "Kicking off…" once kick-off has passed', () => {
    expect(formatTimeUntil(inMs(-5 * M), now)).toBe('Kicking off…');
  });

  it('says "Kicking off…" for an unparseable datetime', () => {
    expect(formatTimeUntil('not-a-date', now)).toBe('Kicking off…');
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-06-12T10:00:00Z');
  const H = 3_600_000;
  const M = 60_000;
  const agoMs = (ms: number) => new Date(now - ms).toISOString();

  it('says "just now" under a minute ago', () => {
    expect(relativeTime(agoMs(30 * 1_000), now)).toBe('just now');
  });

  it('shows whole minutes under an hour ago', () => {
    expect(relativeTime(agoMs(5 * M), now)).toBe('5m ago');
  });

  it('shows whole hours under a day ago', () => {
    expect(relativeTime(agoMs(2 * H), now)).toBe('2h ago');
    // 90 minutes rounds down to the hour.
    expect(relativeTime(agoMs(90 * M), now)).toBe('1h ago');
  });

  it('falls back to a UK clock date for events older than a day', () => {
    const label = relativeTime(agoMs(26 * H), now);
    expect(label).not.toMatch(/ago/);
    expect(label).toMatch(/11 Jun/);
  });

  it('returns an empty string for an unparseable timestamp', () => {
    expect(relativeTime('not-a-date', now)).toBe('');
  });
});

describe('relativeTimeLines', () => {
  const now = Date.parse('2026-06-12T10:00:00Z');
  const H = 3_600_000;
  const agoMs = (ms: number) => new Date(now - ms).toISOString();

  it('keeps a recent relative label on a single line', () => {
    expect(relativeTimeLines(agoMs(5 * 60_000), now)).toEqual(['5m ago']);
    expect(relativeTimeLines(agoMs(2 * H), now)).toEqual(['2h ago']);
  });

  it('renders the older clock fallback as a weekday date over the time, like the fixtures list', () => {
    const lines = relativeTimeLines(agoMs(26 * H), now);
    expect(lines).toHaveLength(2);
    // Weekday + day + month on the first line (11 Jun 2026 is a Thursday).
    expect(lines[0]).toMatch(/^Thu 11 Jun$/);
    expect(lines[1]).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('stageHref', () => {
  const match = (stage: string, group: string | null = null): Match => ({
    matchId: 'm1',
    homeTeam: 'ENG',
    awayTeam: 'FRA',
    homeScore: null,
    awayScore: null,
    status: 'SCHEDULED',
    stage,
    group,
    datetime: '2026-06-14T18:00:00Z',
    venue: 'Wembley',
  });

  it('links a group-stage match to the specific group on /groups', () => {
    expect(stageHref(match('GROUP_STAGE', 'E'))).toBe('/groups?group=E');
  });

  it('falls back to /groups when the group letter is missing', () => {
    expect(stageHref(match('GROUP_STAGE', null))).toBe('/groups');
  });

  it('links every knockout stage to /tree', () => {
    expect(stageHref(match('ROUND_OF_16'))).toBe('/tree');
    expect(stageHref(match('QUARTER_FINAL'))).toBe('/tree');
    expect(stageHref(match('SEMI_FINAL'))).toBe('/tree');
    expect(stageHref(match('FINAL'))).toBe('/tree');
  });
});

describe('formatStage', () => {
  // Minimal Match: only `stage` and `group` drive formatStage, so the rest are
  // dummy values just to satisfy the type.
  const match = (stage: string, group: string | null = null): Match => ({
    matchId: 'm1',
    homeTeam: 'ENG',
    awayTeam: 'FRA',
    homeScore: null,
    awayScore: null,
    status: 'SCHEDULED',
    stage,
    group,
    datetime: '2026-06-14T18:00:00Z',
    venue: 'Wembley',
  });

  it('shows the group letter for a group-stage match', () => {
    expect(formatStage(match('GROUP_STAGE', 'A'))).toBe('Group A');
  });

  it('falls back to a bare "Group" when the group letter is missing', () => {
    expect(formatStage(match('GROUP_STAGE', null))).toBe('Group');
  });

  it('uses the singular knockout-round labels', () => {
    expect(formatStage(match('ROUND_OF_32'))).toBe('Round of 32');
    expect(formatStage(match('ROUND_OF_16'))).toBe('Round of 16');
    expect(formatStage(match('QUARTER_FINAL'))).toBe('Quarter Final');
    expect(formatStage(match('SEMI_FINAL'))).toBe('Semi Final');
    expect(formatStage(match('FINAL'))).toBe('Final');
  });

  it('title-cases an unknown stage as a fallback', () => {
    expect(formatStage(match('THIRD_PLACE'))).toBe('Third Place');
  });

  it('does not throw on an empty stage string', () => {
    expect(formatStage(match(''))).toBe('');
  });
});
