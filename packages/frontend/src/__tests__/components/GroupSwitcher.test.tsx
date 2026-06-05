import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GroupSwitcher from '../../components/GroupSwitcher';

const mockSwitchGroup = jest.fn();
const mockPush = jest.fn();

let mockGroups: { groupKey: string; groupName: string; person: string | null }[] = [];
let mockActiveGroupKey: string | null = null;

jest.mock('../../hooks/useIdentity', () => ({
  useIdentity: () => ({
    groups: mockGroups,
    activeGroupKey: mockActiveGroupKey,
    switchGroup: mockSwitchGroup,
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe('GroupSwitcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGroups = [
      { groupKey: 'office', groupName: 'Office Sweepstake', person: 'Milan' },
      { groupKey: 'lads', groupName: 'Lads on Tour', person: null },
    ];
    mockActiveGroupKey = 'office';
  });

  it('renders nothing when no groups are known', () => {
    mockGroups = [];
    mockActiveGroupKey = null;
    const { container } = render(<GroupSwitcher />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the active group name on the trigger', () => {
    render(<GroupSwitcher />);
    expect(screen.getByText('Office Sweepstake')).toBeInTheDocument();
  });

  it('opens the dropdown listing all known groups', () => {
    render(<GroupSwitcher />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Lads on Tour')).toBeInTheDocument();
    expect(screen.getByText('+ Join another')).toBeInTheDocument();
  });

  it('switches to a different group on selection', () => {
    render(<GroupSwitcher />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByText('Lads on Tour'));
    expect(mockSwitchGroup).toHaveBeenCalledWith('lads');
  });

  it('does not re-switch when selecting the already-active group', () => {
    render(<GroupSwitcher />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    // The active group appears in both the trigger and the menu; pick the menuitem.
    const activeItem = screen.getByRole('menuitem', { name: /Office Sweepstake/ });
    fireEvent.click(activeItem);
    expect(mockSwitchGroup).not.toHaveBeenCalled();
  });

  it('routes to the landing login from "Join another"', () => {
    render(<GroupSwitcher />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByText('+ Join another'));
    expect(mockPush).toHaveBeenCalledWith('/');
  });
});
