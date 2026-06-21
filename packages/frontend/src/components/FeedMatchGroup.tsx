'use client';

import { useState } from 'react';
import { Team } from '@sweepstake/shared';
import { MatchEventGroup, displayTs, isGroupExpandedByDefault, isGroupMine } from '@/lib/feedGroups';
import { relativeTimeLines } from '@/lib/format';
import StageLink from '@/components/StageLink';
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
  const latestWhen = latest ? displayTs(latest) : undefined;

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
        {/* Left gutter mirrors the right column's width to keep the matchup
            centred. For match groups it also shows the stage label (Group E,
            Round of 16, …) as a link, matching the Fixtures page layout. */}
        <div className="w-16 shrink-0 text-center text-xs leading-tight text-white/50">
          {group.match && (
            <StageLink
              match={group.match}
              className="text-[10px] text-white/40 hover:text-white/60"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {group.match ? (
            <MatchScoreline match={group.match} teamOwners={ownersByTeam} teamFlags={teamFlags} />
          ) : (
            <span className="text-sm font-medium">Tournament</span>
          )}
        </div>

        {/* Status + chevron on top, the event time beneath — right-aligned in a
            fixed-width column that mirrors the left gutter to keep it centred. */}
        <div className="w-16 shrink-0 flex flex-col items-center gap-1 text-xs">
          <div className="flex items-center gap-1">
            {group.status === 'LIVE' && <LiveBadge minute={group.match?.minute} layout="stacked" />}
            {group.status === 'FINISHED' && (
              <span className="bg-gray-600 text-white px-2 py-0.5 rounded">FT</span>
            )}
            <svg
              className={`w-5 h-5 shrink-0 text-white/60 transition-transform ${expanded ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {latest && latestWhen && (
            <time
              dateTime={latestWhen}
              data-testid="feed-group-time"
              className="text-white/70 tabular-nums text-center leading-tight"
            >
              {relativeTimeLines(latestWhen, now).map((line) => (
                <span key={line} className="block whitespace-nowrap">
                  {line}
                </span>
              ))}
            </time>
          )}
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
