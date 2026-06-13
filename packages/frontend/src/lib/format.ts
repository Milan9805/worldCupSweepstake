// Shared date/time formatters for fixtures. UK locale + timezone so the
// whole app shows kick-off times the way the sweepstake group expects.

export function formatMatchDate(datetime: string): string {
  return new Date(datetime).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/London',
  });
}

export function formatMatchTime(datetime: string): string {
  return new Date(datetime).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });
}

// Human-friendly countdown to a kick-off, e.g. "in 2h 15m", "in 45m", "in 30s".
// Once the clock reaches (or passes) kick-off we show "Kicking off…" to cover
// the gap before the upstream feed flips the status to LIVE.
export function formatTimeUntil(datetime: string, now: number): string {
  const diff = new Date(datetime).getTime() - now;
  if (Number.isNaN(diff) || diff <= 0) return 'Kicking off…';

  const totalMinutes = Math.floor(diff / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `in ${hours}h ${minutes}m`;
  if (minutes > 0) return `in ${minutes}m`;
  return `in ${Math.ceil(diff / 1000)}s`;
}

// Compact relative timestamp ("just now", "5m ago", "2h ago"), falling back to a
// clock time for events older than a day. UK locale to match the rest of the app.
// `now` is passed in (and typically ticks every minute) so labels keep advancing
// while the page is open.
export function relativeTime(ts: string, now: number = Date.now()): string {
  const then = new Date(ts).getTime();
  if (Number.isNaN(then)) return '';
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });
}

// {@link relativeTime} split into lines for a narrow column. A recent label
// ("5m ago") stays a single line; the older clock fallback ("11 Jun, 22:04") — the
// only form with a comma — splits into [date, time] so it can stack over two
// lines instead of one wide row that crowds the team names on mobile.
export function relativeTimeLines(ts: string, now: number = Date.now()): string[] {
  const label = relativeTime(ts, now);
  const comma = label.indexOf(', ');
  if (comma === -1) return [label];
  return [label.slice(0, comma), label.slice(comma + 2)];
}
