// Known-groups registry for the multi-sweepstake model. A device can belong to
// several groups; we remember each group's name and the member the device's
// owner has claimed, plus which group is currently active. Persisted in
// localStorage under `sweepstake_groups`.
//
// The active group's key is also mirrored to the legacy `sweepstake_group_key`
// so pages that still read that key directly (groups/tree/bracket) keep working
// without modification. That legacy key also seeds a one-time migration for
// users who logged in before the registry existed.

export const REGISTRY_KEY = 'sweepstake_groups';
export const ACTIVE_GROUP_KEY = 'sweepstake_group_key'; // legacy single-key (mirrored)

export interface GroupEntry {
  groupName: string;
  person: string | null;
}

export interface GroupRegistry {
  active: string | null;
  groups: Record<string, GroupEntry>;
}

const EMPTY: GroupRegistry = { active: null, groups: {} };

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

// Defensive parse: tolerate any malformed/partial shape that may already be in
// a user's localStorage and normalise it to a valid GroupRegistry.
function parse(raw: string | null): GroupRegistry {
  if (!raw) return { active: null, groups: {} };
  try {
    const data = JSON.parse(raw) as Partial<GroupRegistry>;
    const groups: Record<string, GroupEntry> = {};
    if (data && typeof data.groups === 'object' && data.groups) {
      for (const [key, value] of Object.entries(data.groups)) {
        if (value && typeof value.groupName === 'string') {
          groups[key] = {
            groupName: value.groupName,
            person: typeof value.person === 'string' ? value.person : null,
          };
        }
      }
    }
    const active =
      typeof data?.active === 'string' && groups[data.active] ? data.active : null;
    return { active, groups };
  } catch {
    return { active: null, groups: {} };
  }
}

// Read the registry, performing a one-time migration of a legacy single-key
// user into the registry on first load.
export function readRegistry(): GroupRegistry {
  if (!isBrowser()) return { ...EMPTY };
  const registry = parse(localStorage.getItem(REGISTRY_KEY));

  // Migrate a pre-registry user: they have `sweepstake_group_key` but no entry
  // for it yet. Adopt it as a known + active group (name defaults to the key
  // and is refreshed once the group loads from the API).
  const legacy = localStorage.getItem(ACTIVE_GROUP_KEY);
  if (legacy && !registry.groups[legacy]) {
    const migrated = setActiveGroup(addGroupToRegistry(registry, legacy, legacy), legacy);
    writeRegistry(migrated);
    return migrated;
  }

  // Keep the mirror in sync (e.g. registry written by another tab).
  if (registry.active) {
    localStorage.setItem(ACTIVE_GROUP_KEY, registry.active);
  }
  return registry;
}

export function writeRegistry(registry: GroupRegistry): void {
  if (!isBrowser()) return;
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  if (registry.active) {
    localStorage.setItem(ACTIVE_GROUP_KEY, registry.active);
  } else {
    localStorage.removeItem(ACTIVE_GROUP_KEY);
  }
}

// Add (or update the name of) a group without changing which one is active or
// the already-claimed person. Returns a new registry.
export function addGroupToRegistry(
  registry: GroupRegistry,
  groupKey: string,
  groupName: string
): GroupRegistry {
  const existing = registry.groups[groupKey];
  return {
    ...registry,
    groups: {
      ...registry.groups,
      [groupKey]: { groupName, person: existing?.person ?? null },
    },
  };
}

export function setActiveGroup(registry: GroupRegistry, groupKey: string): GroupRegistry {
  if (!registry.groups[groupKey]) return registry;
  return { ...registry, active: groupKey };
}

export function setClaimedPerson(
  registry: GroupRegistry,
  groupKey: string,
  person: string
): GroupRegistry {
  const existing = registry.groups[groupKey];
  if (!existing) return registry;
  return {
    ...registry,
    groups: {
      ...registry.groups,
      [groupKey]: { ...existing, person },
    },
  };
}

// Forget a group; if it was active, fall back to another remembered group.
export function removeGroupFromRegistry(
  registry: GroupRegistry,
  groupKey: string
): GroupRegistry {
  const groups = { ...registry.groups };
  delete groups[groupKey];
  const active =
    registry.active === groupKey ? (Object.keys(groups)[0] ?? null) : registry.active;
  return { active, groups };
}
