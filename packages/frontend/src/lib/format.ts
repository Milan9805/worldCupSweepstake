import { Match } from '@sweepstake/shared';

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
// ("5m ago") stays a single line; the older clock fallback is re-rendered like the
// groups-page fixtures' date column — the weekday date ("Thu 11 Jun") over the
// time ("22:04") — so the feed header reads the same and stays narrow on mobile.
export function relativeTimeLines(ts: string, now: number = Date.now()): string[] {
  const label = relativeTime(ts, now);
  // Recent labels have no comma; only the clock fallback ("11 Jun, 22:04") does.
  if (!label.includes(', ')) return [label];
  return [formatMatchDate(ts).replace(',', ''), formatMatchTime(ts)];
}

// The muted "pens H–A" line shown under a scoreline for a tie decided on
// penalties (home–away orientation, matching the score above it). Returns null
// when the match wasn't a shootout, so callers render nothing.
export function formatPens(
  penaltyHome: number | null | undefined,
  penaltyAway: number | null | undefined,
): string | null {
  if (penaltyHome == null || penaltyAway == null) return null;
  return `pens ${penaltyHome}–${penaltyAway}`;
}

// Human-friendly label for a match's stage. Group-stage matches show their group
// letter ("Group A"); knockout rounds use the singular labels below. Any unknown
// stage falls back to a title-cased version of the raw enum ("THIRD_PLACE" →
// "Third Place") so a new round still renders sensibly before we map it here.
const STAGE_LABELS: Record<string, string> = {
  ROUND_OF_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINAL: 'Quarter Final',
  SEMI_FINAL: 'Semi Final',
  FINAL: 'Final',
};

// Navigation target for a stage label: group-stage links to the specific group
// on /groups (e.g. /groups?group=E); knockout rounds link to the bracket /tree.
export function stageHref(match: Match): string {
  if (match.stage === 'GROUP_STAGE') {
    return match.group ? `/groups?group=${match.group}` : '/groups';
  }
  return '/tree';
}

export function formatStage(match: Match): string {
  if (match.stage === 'GROUP_STAGE') return match.group ? `Group ${match.group}` : 'Group';
  return STAGE_LABELS[match.stage]
    // charAt(0) (not [0]) so an empty/odd stage string title-cases to '' rather than throwing.
    ?? match.stage.toLowerCase().split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
