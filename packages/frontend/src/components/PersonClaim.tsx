'use client';

import { Person } from '@sweepstake/shared';
import Avatar from '@/components/Avatar';

interface PersonClaimProps {
  /** Members of the active group (the claimable people). */
  members: Person[];
  /** The currently claimed/selected person's name for this group, if any. */
  claimedPerson: string | null;
  /** Persist the claimed person for the active group, then select them. */
  onClaim: (name: string) => void;
  /**
   * When true, always show the member buttons so the user can switch who they
   * are viewing as (dashboard person selector). When false (default), only the
   * "Who are you?" prompt is shown until someone is claimed.
   */
  allowSwitch?: boolean;
}

/**
 * Per-group identity selector. When the active group has no claimed person it
 * prompts "Who are you?" with the group's member buttons; tapping one persists
 * the claim (per group) via `onClaim`. Reused by the dashboard and the feed so
 * the "I'm <name>" choice is shared and survives reloads.
 */
export default function PersonClaim({
  members,
  claimedPerson,
  onClaim,
  allowSwitch = false,
}: PersonClaimProps) {
  if (!members.length) return null;

  // Once claimed, only keep the selector around when the caller wants to allow
  // switching (e.g. the dashboard). Otherwise the prompt collapses away.
  const showPrompt = !claimedPerson;
  if (!showPrompt && !allowSwitch) return null;

  return (
    <div className="mb-6">
      {showPrompt && (
        <p className="text-sm text-green-100 mb-3">Who are you?</p>
      )}
      <div className="flex items-center gap-3 overflow-x-auto pb-2">
        {members.map((member) => (
          <button
            key={member.name}
            onClick={() => onClaim(member.name)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              claimedPerson === member.name
                ? 'bg-accent text-white'
                : 'bg-black/30 text-white hover:bg-black/40'
            }`}
          >
            <Avatar name={member.name} imageUrl={member.imageUrl} size="md" />
            {member.name}
          </button>
        ))}
      </div>
    </div>
  );
}
