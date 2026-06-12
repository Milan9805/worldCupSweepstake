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
