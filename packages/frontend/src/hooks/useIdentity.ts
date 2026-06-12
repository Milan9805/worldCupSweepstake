'use client';

import { useGroup } from '@/hooks/GroupContext';

/**
 * Multi-sweepstake identity hook. A thin, identity-focused view over the
 * known-groups registry managed by {@link useGroup}: which groups the device
 * belongs to, which one is active, and who the device's owner has claimed to be
 * in the active group.
 *
 * Switching the active group changes `activeGroupKey` (and the legacy mirrored
 * key) so consumers keyed on it refetch that group's data — no re-login needed,
 * because every group key is remembered.
 */
export function useIdentity() {
  const {
    knownGroups,
    activeGroupKey,
    claimedPerson,
    active,
    switchGroup,
    addGroup,
    claimPerson,
  } = useGroup();

  return {
    // Known groups: [{ groupKey, groupName, person }]
    groups: knownGroups,
    activeGroupKey,
    // Resolved active identity: { groupKey, personName }
    active,
    claimedPerson,
    switchGroup,
    addGroup,
    claimPerson,
  };
}

// `useGroups` is the registry-centric alias of the same hook (the plan names
// both); they expose the identical surface.
export const useGroups = useIdentity;
