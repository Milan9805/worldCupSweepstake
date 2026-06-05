import {
  readRegistry,
  writeRegistry,
  addGroupToRegistry,
  setActiveGroup,
  setClaimedPerson,
  removeGroupFromRegistry,
  REGISTRY_KEY,
  ACTIVE_GROUP_KEY,
} from '../../lib/groupRegistry';

// Real (in-memory) localStorage so we can assert the persisted shape.
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: jest.fn((k: string) => store[k] ?? null),
  setItem: jest.fn((k: string, v: string) => { store[k] = v; }),
  removeItem: jest.fn((k: string) => { delete store[k]; }),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  jest.clearAllMocks();
});

describe('groupRegistry pure helpers', () => {
  it('adds a group without changing active or claimed person', () => {
    const r = addGroupToRegistry({ active: null, groups: {} }, 'a', 'Group A');
    expect(r.groups.a).toEqual({ groupName: 'Group A', person: null });
    expect(r.active).toBeNull();
  });

  it('preserves a claimed person when re-adding (e.g. name refresh)', () => {
    let r = addGroupToRegistry({ active: null, groups: {} }, 'a', 'Old');
    r = setClaimedPerson(r, 'a', 'Milan');
    r = addGroupToRegistry(r, 'a', 'New Name');
    expect(r.groups.a).toEqual({ groupName: 'New Name', person: 'Milan' });
  });

  it('setActiveGroup is a no-op for unknown keys', () => {
    const base = { active: null, groups: {} };
    expect(setActiveGroup(base, 'nope')).toBe(base);
  });

  it('removing the active group falls back to another remembered group', () => {
    let r = addGroupToRegistry({ active: null, groups: {} }, 'a', 'A');
    r = addGroupToRegistry(r, 'b', 'B');
    r = setActiveGroup(r, 'a');
    const next = removeGroupFromRegistry(r, 'a');
    expect(next.groups.a).toBeUndefined();
    expect(next.active).toBe('b');
  });

  it('removing the last group clears active', () => {
    let r = addGroupToRegistry({ active: null, groups: {} }, 'a', 'A');
    r = setActiveGroup(r, 'a');
    expect(removeGroupFromRegistry(r, 'a').active).toBeNull();
  });
});

describe('persistence + mirroring', () => {
  it('writeRegistry mirrors the active key to the legacy single key', () => {
    let r = addGroupToRegistry({ active: null, groups: {} }, 'a', 'A');
    r = setActiveGroup(r, 'a');
    writeRegistry(r);
    expect(JSON.parse(store[REGISTRY_KEY]).active).toBe('a');
    expect(store[ACTIVE_GROUP_KEY]).toBe('a');
  });

  it('writeRegistry removes the legacy key when nothing is active', () => {
    store[ACTIVE_GROUP_KEY] = 'a';
    writeRegistry({ active: null, groups: {} });
    expect(store[ACTIVE_GROUP_KEY]).toBeUndefined();
  });
});

describe('legacy single-key migration', () => {
  it('migrates a pre-registry user into the registry on first read', () => {
    store[ACTIVE_GROUP_KEY] = 'office-sweepstake';
    const r = readRegistry();
    expect(r.active).toBe('office-sweepstake');
    expect(r.groups['office-sweepstake']).toEqual({
      groupName: 'office-sweepstake',
      person: null,
    });
    // Persisted, so the migration only happens once.
    expect(JSON.parse(store[REGISTRY_KEY]).active).toBe('office-sweepstake');
  });

  it('does not clobber an existing registry entry on migration', () => {
    writeRegistry({
      active: 'lads-on-tour',
      groups: {
        'lads-on-tour': { groupName: 'Lads on Tour', person: 'Milan' },
      },
    });
    store[ACTIVE_GROUP_KEY] = 'lads-on-tour'; // mirror already present
    const r = readRegistry();
    expect(r.groups['lads-on-tour'].person).toBe('Milan');
    expect(r.active).toBe('lads-on-tour');
  });

  it('tolerates malformed registry JSON', () => {
    store[REGISTRY_KEY] = '{ not json';
    const r = readRegistry();
    expect(r).toEqual({ active: null, groups: {} });
  });

  it('drops an active pointer that references an unknown group', () => {
    store[REGISTRY_KEY] = JSON.stringify({ active: 'ghost', groups: {} });
    const r = readRegistry();
    expect(r.active).toBeNull();
  });
});
