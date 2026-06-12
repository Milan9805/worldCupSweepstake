import { renderHook, act } from '@testing-library/react';
import { useIdentity, useGroups } from '../../hooks/useIdentity';
import { useGroup } from '../../hooks/GroupContext';

// useIdentity is a thin, identity-focused projection over the shared useGroup
// context. Mock the context hook so these tests pin down exactly which
// fields/actions are re-exposed, independent of the provider's own
// (separately tested) behaviour.
jest.mock('../../hooks/GroupContext');

const mockedUseGroup = useGroup as jest.MockedFunction<typeof useGroup>;

const switchGroup = jest.fn();
const addGroup = jest.fn();
const claimPerson = jest.fn();

const KNOWN_GROUPS = [
  { groupKey: 'g1', groupName: 'Group One', person: 'Alice' },
  { groupKey: 'g2', groupName: 'Group Two', person: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseGroup.mockReturnValue({
    knownGroups: KNOWN_GROUPS,
    activeGroupKey: 'g1',
    claimedPerson: 'Alice',
    active: { groupKey: 'g1', personName: 'Alice' },
    switchGroup,
    addGroup,
    claimPerson,
  } as unknown as ReturnType<typeof useGroup>);
});

describe('useIdentity', () => {
  it('projects the registry-centric identity surface from useGroup', () => {
    const { result } = renderHook(() => useIdentity());

    expect(result.current.groups).toBe(KNOWN_GROUPS);
    expect(result.current.activeGroupKey).toBe('g1');
    expect(result.current.active).toEqual({ groupKey: 'g1', personName: 'Alice' });
    expect(result.current.claimedPerson).toBe('Alice');
  });

  it('forwards switchGroup, addGroup and claimPerson to useGroup', () => {
    const { result } = renderHook(() => useIdentity());

    act(() => result.current.switchGroup('g2'));
    act(() => result.current.addGroup('new-key'));
    act(() => result.current.claimPerson('Bob'));

    expect(switchGroup).toHaveBeenCalledWith('g2');
    expect(addGroup).toHaveBeenCalledWith('new-key');
    expect(claimPerson).toHaveBeenCalledWith('Bob');
  });

  it('useGroups is an alias of useIdentity', () => {
    expect(useGroups).toBe(useIdentity);
  });
});
