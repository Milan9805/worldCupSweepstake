'use client';

import { useState } from 'react';
import { Team } from '@sweepstake/shared';
import { MatchEventGroup, isGroupExpandedByDefault, isGroupMine } from '@/lib/feedGroups';
import { relativeTime } from '@/lib/format';
import { TeamOwner } from '@/lib/owners';
import LiveBadge from '@/components/LiveBadge';
import MatchScoreline from '@/components/MatchScoreline';
import { FeedRow } from '@/components/FeedRow';

interface FeedMatchGroupProps {
  group: MatchEventGroup;
  teamsByCode: Record<string, Team>;
  teamFlags: Record<string, string>;
  ownersByTeam: Record<string, TeamOwner>;
  claimedPerson: string | null;
  now: number;
}

/**
 * One match's events as a collapsible card. The header is a full-width button (a
 * comfortable phone tap target) showing the matchup via the shared MatchScoreline
 * plus a live/FT badge and a chevron; the body lists the match's events
 * newest-first. Live matches start expanded, finished ones collapsed
 * (see isGroupExpandedByDefault). The synthetic "other" group has no match, so it
 * renders a neutral "Tournament" header with no scoreline or badge.
 */
export default function FeedMatchGroup({
  group,
  teamsByCode,
  teamFlags,
  ownersByTeam,
  claimedPerson,
  now,
}: FeedMatchGroupProps) {
  const [expanded, setExpanded] = useState(() => isGroupExpandedByDefault(group));

  // Highlight the whole card when the claimed person owns a team in this match —
  // matching the per-event highlight so "my games" stand out at a glance.
  const mine = isGroupMine(group, ownersByTeam, claimedPerson);

  // The most recent event (events are newest-first) — its relative time is shown
  // in the header as "how long ago the last thing happened" (e.g. since full time).
  const latest = group.events[0];

  return (
    <div
      data-testid="feed-group"
      data-involves-claimed={mine ? 'true' : 'false'}
      className={`rounded-lg border ${
        mine ? 'border-sky-400/60 bg-sky-400/10' : 'border-white/10 bg-white/5'
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        data-testid="feed-group-header"
        className="w-full flex items-center gap-2 p-3 text-left rounded-lg hover:bg-white/5 transition-colors"
      >
        <div className="flex-1 min-w-0">
          {group.match ? (
            <MatchScoreline match={group.match} teamOwners={ownersByTeam} teamFlags={teamFlags} />
          ) : (
            <span className="text-sm font-medium">Tournament</span>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2 text-xs">
          {group.status === 'LIVE' && <LiveBadge minute={group.match?.minute} layout="inline" />}
          {group.status === 'FINISHED' && (
            <span className="bg-gray-600 text-white px-2 py-0.5 rounded">FT</span>
          )}
          {latest && (
            <time
              dateTime={latest.ts}
              data-testid="feed-group-time"
              className="text-white/50 tabular-nums whitespace-nowrap"
            >
              {relativeTime(latest.ts, now)}
            </time>
          )}
          <svg
            className={`w-5 h-5 text-white/60 transition-transform ${expanded ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <ol data-testid="feed-group-body" className="space-y-2 border-t border-white/10 px-3 pb-3 pt-2">
          {group.events.map((event) => (
            <FeedRow
              key={event.eventId}
              event={event}
              teamsByCode={teamsByCode}
              ownersByTeam={ownersByTeam}
              claimedPerson={claimedPerson}
              now={now}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
