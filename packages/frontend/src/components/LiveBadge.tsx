'use client';

import { Match } from '@sweepstake/shared';

interface LiveBadgeProps {
  // The live clock label from the score source ("19'", "45'+1", "HT").
  // Only rendered when present; pass match.minute straight through.
  minute?: Match['minute'];
  // 'stacked' puts the minute under the pill (the fixtures column);
  // 'inline' puts it to the right (compact rows like the dashboard cards).
  layout?: 'stacked' | 'inline';
}

/**
 * The red pulsing "LIVE" pill plus the live match minute. Shared by every
 * surface that flags an in-play match — the fixtures list and the dashboard
 * team cards — so the live indicator (and any future change to it) stays
 * identical everywhere instead of being re-implemented per component.
 */
export default function LiveBadge({ minute, layout = 'inline' }: LiveBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 ${
        layout === 'stacked' ? 'flex-col items-end gap-0.5' : 'flex-row items-center gap-1'
      }`}
    >
      <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded animate-pulse shrink-0">
        LIVE
      </span>
      {minute && (
        <span className="text-red-400 text-[11px] font-semibold tabular-nums">{minute}</span>
      )}
    </span>
  );
}
