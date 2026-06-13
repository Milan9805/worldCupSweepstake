import { formatMatchDate, formatMatchTime, formatTimeUntil, relativeTime } from '../../lib/format';

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
