import React from 'react';
import { renderHook } from '@testing-library/react';
import { GroupProvider, useGroup } from '../../hooks/GroupContext';
import { useGroupState } from '../../hooks/useGroup';

// The provider is a thin context shell around useGroupState (tested on its
// own). Mock the state hook so these tests pin down only the wiring: one
// instance in, the same instance out to every consumer.
jest.mock('../../hooks/useGroup');

const mockedUseGroupState = useGroupState as jest.MockedFunction<typeof useGroupState>;

const SENTINEL = {
  groupKey: 'g1',
  group: null,
  teams: [],
  matches: [],
} as unknown as ReturnType<typeof useGroupState>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseGroupState.mockReturnValue(SENTINEL);
});

describe('GroupProvider / useGroup', () => {
  it('hands consumers the single useGroupState instance', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GroupProvider>{children}</GroupProvider>
    );

    const { result } = renderHook(() => useGroup(), { wrapper });

    // Same object, not a copy — and the state hook ran exactly once (the
    // whole point of the provider: no duplicate state/poll loops).
    expect(result.current).toBe(SENTINEL);
    expect(mockedUseGroupState).toHaveBeenCalledTimes(1);
  });

  it('throws when used outside a GroupProvider', () => {
    // React logs the thrown render error; keep the test output clean.
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useGroup())).toThrow(
      'useGroup must be used within a GroupProvider'
    );

    consoleSpy.mockRestore();
  });
});
