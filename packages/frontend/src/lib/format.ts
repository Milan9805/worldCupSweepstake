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
