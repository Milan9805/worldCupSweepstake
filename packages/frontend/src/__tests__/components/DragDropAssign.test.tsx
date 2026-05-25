import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DragDropAssign from '../../components/DragDropAssign';
import * as api from '../../lib/api';

jest.mock('../../lib/api');

const mockedApi = api as jest.Mocked<typeof api>;

describe('DragDropAssign', () => {
  const mockOnStatus = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders load form initially', () => {
    render(<DragDropAssign token="test-token" onStatus={mockOnStatus} />);
    expect(screen.getByText('Assign Teams')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Group key...')).toBeInTheDocument();
    expect(screen.getByText('Load Group')).toBeInTheDocument();
  });

  it('disables load button when group key is empty', () => {
    render(<DragDropAssign token="test-token" onStatus={mockOnStatus} />);
    const button = screen.getByText('Load Group');
    expect(button).toBeDisabled();
  });

  it('enables load button when group key is entered', () => {
    render(<DragDropAssign token="test-token" onStatus={mockOnStatus} />);
    const input = screen.getByPlaceholderText('Group key...');
    fireEvent.change(input, { target: { value: 'my-group' } });
    expect(screen.getByText('Load Group')).not.toBeDisabled();
  });

  it('loads group data on button click', async () => {
    const groupData = {
      groupKey: 'g1',
      groupName: 'Test',
      members: [{ name: 'Alice', imageUrl: null, teams: ['ENG'] }],
    };
    const teamsData = [
      { teamCode: 'ENG', name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', fifaRanking: 4, groupLetter: 'A', stats: { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, yellowCards: 0, redCards: 0, possession: null, xG: null }, eliminated: false, eliminatedAt: null },
      { teamCode: 'BRA', name: 'Brazil', flag: '🇧🇷', fifaRanking: 1, groupLetter: 'B', stats: { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, yellowCards: 0, redCards: 0, possession: null, xG: null }, eliminated: false, eliminatedAt: null },
    ];
    mockedApi.getGroup.mockResolvedValue(groupData);
    mockedApi.getTeams.mockResolvedValue(teamsData);

    render(<DragDropAssign token="test-token" onStatus={mockOnStatus} />);
    const input = screen.getByPlaceholderText('Group key...');
    fireEvent.change(input, { target: { value: 'g1' } });
    fireEvent.click(screen.getByText('Load Group'));

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
    expect(mockOnStatus).toHaveBeenCalledWith(expect.stringContaining('Drag teams'));
  });

  it('shows error on load failure', async () => {
    mockedApi.getGroup.mockRejectedValue(new Error('Not found'));

    render(<DragDropAssign token="test-token" onStatus={mockOnStatus} />);
    const input = screen.getByPlaceholderText('Group key...');
    fireEvent.change(input, { target: { value: 'bad' } });
    fireEvent.click(screen.getByText('Load Group'));

    await waitFor(() => {
      expect(mockOnStatus).toHaveBeenCalledWith('Error: Not found');
    });
  });

  it('saves assignments', async () => {
    const groupData = {
      groupKey: 'g1',
      groupName: 'Test',
      members: [{ name: 'Alice', imageUrl: null, teams: ['ENG'] }],
    };
    const teamsData = [
      { teamCode: 'ENG', name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', fifaRanking: 4, groupLetter: 'A', stats: { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, yellowCards: 0, redCards: 0, possession: null, xG: null }, eliminated: false, eliminatedAt: null },
    ];
    mockedApi.getGroup.mockResolvedValue(groupData);
    mockedApi.getTeams.mockResolvedValue(teamsData);
    mockedApi.adminAssignTeams.mockResolvedValue(undefined);

    render(<DragDropAssign token="test-token" onStatus={mockOnStatus} />);
    fireEvent.change(screen.getByPlaceholderText('Group key...'), { target: { value: 'g1' } });
    fireEvent.click(screen.getByText('Load Group'));

    await waitFor(() => {
      expect(screen.getByText('Save All')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save All'));

    await waitFor(() => {
      expect(mockedApi.adminAssignTeams).toHaveBeenCalledWith(
        'test-token',
        'g1',
        [{ personName: 'Alice', teams: ['ENG'] }]
      );
      expect(mockOnStatus).toHaveBeenCalledWith('Teams assigned successfully!');
    });
  });

  it('handles save error', async () => {
    const groupData = {
      groupKey: 'g1',
      groupName: 'Test',
      members: [{ name: 'Alice', imageUrl: null, teams: ['ENG'] }],
    };
    const teamsData = [
      { teamCode: 'ENG', name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', fifaRanking: 4, groupLetter: 'A', stats: { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, yellowCards: 0, redCards: 0, possession: null, xG: null }, eliminated: false, eliminatedAt: null },
    ];
    mockedApi.getGroup.mockResolvedValue(groupData);
    mockedApi.getTeams.mockResolvedValue(teamsData);
    mockedApi.adminAssignTeams.mockRejectedValue(new Error('Save failed'));

    render(<DragDropAssign token="test-token" onStatus={mockOnStatus} />);
    fireEvent.change(screen.getByPlaceholderText('Group key...'), { target: { value: 'g1' } });
    fireEvent.click(screen.getByText('Load Group'));

    await waitFor(() => {
      expect(screen.getByText('Save All')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save All'));

    await waitFor(() => {
      expect(mockOnStatus).toHaveBeenCalledWith('Error: Save failed');
    });
  });

  it('handles clear button', async () => {
    const groupData = {
      groupKey: 'g1',
      groupName: 'Test',
      members: [{ name: 'Alice', imageUrl: null, teams: [] }],
    };
    const teamsData = [
      { teamCode: 'ENG', name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', fifaRanking: 4, groupLetter: 'A', stats: { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, yellowCards: 0, redCards: 0, possession: null, xG: null }, eliminated: false, eliminatedAt: null },
    ];
    mockedApi.getGroup.mockResolvedValue(groupData);
    mockedApi.getTeams.mockResolvedValue(teamsData);

    render(<DragDropAssign token="test-token" onStatus={mockOnStatus} />);
    fireEvent.change(screen.getByPlaceholderText('Group key...'), { target: { value: 'g1' } });
    fireEvent.click(screen.getByText('Load Group'));

    await waitFor(() => {
      expect(screen.getByText('Clear')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Clear'));

    // Should go back to load form
    expect(screen.getByText('Load Group')).toBeInTheDocument();
    expect(mockOnStatus).toHaveBeenCalledWith('');
  });

  it('shows unassigned teams in pool', async () => {
    const groupData = {
      groupKey: 'g1',
      groupName: 'Test',
      members: [{ name: 'Alice', imageUrl: null, teams: ['ENG'] }],
    };
    const teamsData = [
      { teamCode: 'ENG', name: 'England', flag: '🏴', fifaRanking: 4, groupLetter: 'A', stats: { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, yellowCards: 0, redCards: 0, possession: null, xG: null }, eliminated: false, eliminatedAt: null },
      { teamCode: 'BRA', name: 'Brazil', flag: '🇧🇷', fifaRanking: 1, groupLetter: 'B', stats: { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, yellowCards: 0, redCards: 0, possession: null, xG: null }, eliminated: false, eliminatedAt: null },
    ];
    mockedApi.getGroup.mockResolvedValue(groupData);
    mockedApi.getTeams.mockResolvedValue(teamsData);

    render(<DragDropAssign token="test-token" onStatus={mockOnStatus} />);
    fireEvent.change(screen.getByPlaceholderText('Group key...'), { target: { value: 'g1' } });
    fireEvent.click(screen.getByText('Load Group'));

    await waitFor(() => {
      // BRA should be unassigned
      expect(screen.getByText('BRA')).toBeInTheDocument();
      expect(screen.getByText(/Unassigned Teams \(1\)/)).toBeInTheDocument();
    });
  });

  it('loads via Enter key', async () => {
    const groupData = {
      groupKey: 'g1',
      groupName: 'Test',
      members: [{ name: 'Alice', imageUrl: null, teams: [] }],
    };
    mockedApi.getGroup.mockResolvedValue(groupData);
    mockedApi.getTeams.mockResolvedValue([]);

    render(<DragDropAssign token="test-token" onStatus={mockOnStatus} />);
    const input = screen.getByPlaceholderText('Group key...');
    fireEvent.change(input, { target: { value: 'g1' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
  });

  it('handles drag from member back to unassigned pool', async () => {
    const groupData = {
      groupKey: 'g1',
      groupName: 'Test',
      members: [{ name: 'Alice', imageUrl: null, teams: ['ENG'] }],
    };
    const teamsData = [
      { teamCode: 'ENG', name: 'England', flag: '🏴', fifaRanking: 4, groupLetter: 'A', stats: { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, yellowCards: 0, redCards: 0, possession: null, xG: null }, eliminated: false, eliminatedAt: null },
    ];
    mockedApi.getGroup.mockResolvedValue(groupData);
    mockedApi.getTeams.mockResolvedValue(teamsData);

    render(<DragDropAssign token="test-token" onStatus={mockOnStatus} />);
    fireEvent.change(screen.getByPlaceholderText('Group key...'), { target: { value: 'g1' } });
    fireEvent.click(screen.getByText('Load Group'));

    await waitFor(() => {
      expect(screen.getByText('(1 teams)')).toBeInTheDocument();
    });

    const pool = screen.getByText(/Unassigned Teams/).closest('div')!;

    fireEvent.dragOver(pool, { dataTransfer: { dropEffect: '' }, preventDefault: jest.fn() });
    fireEvent.drop(pool, {
      dataTransfer: { getData: () => 'ENG' },
      preventDefault: jest.fn(),
    });

    await waitFor(() => {
      expect(screen.getByText('(0 teams)')).toBeInTheDocument();
      expect(screen.getByText(/Unassigned Teams \(1\)/)).toBeInTheDocument();
    });
  });

  it('ignores drop on pool with no team code', async () => {
    const groupData = {
      groupKey: 'g1',
      groupName: 'Test',
      members: [{ name: 'Alice', imageUrl: null, teams: ['ENG'] }],
    };
    const teamsData = [
      { teamCode: 'ENG', name: 'England', flag: '🏴', fifaRanking: 4, groupLetter: 'A', stats: { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, yellowCards: 0, redCards: 0, possession: null, xG: null }, eliminated: false, eliminatedAt: null },
    ];
    mockedApi.getGroup.mockResolvedValue(groupData);
    mockedApi.getTeams.mockResolvedValue(teamsData);

    render(<DragDropAssign token="test-token" onStatus={mockOnStatus} />);
    fireEvent.change(screen.getByPlaceholderText('Group key...'), { target: { value: 'g1' } });
    fireEvent.click(screen.getByText('Load Group'));

    await waitFor(() => {
      expect(screen.getByText('(1 teams)')).toBeInTheDocument();
    });

    const pool = screen.getByText(/Unassigned Teams/).closest('div')!;
    fireEvent.drop(pool, {
      dataTransfer: { getData: () => '' },
      preventDefault: jest.fn(),
    });

    // No change
    expect(screen.getByText('(1 teams)')).toBeInTheDocument();
  });

  it('ignores drop on member with no team code', async () => {
    const groupData = {
      groupKey: 'g1',
      groupName: 'Test',
      members: [{ name: 'Alice', imageUrl: null, teams: [] }],
    };
    mockedApi.getGroup.mockResolvedValue(groupData);
    mockedApi.getTeams.mockResolvedValue([]);

    render(<DragDropAssign token="test-token" onStatus={mockOnStatus} />);
    fireEvent.change(screen.getByPlaceholderText('Group key...'), { target: { value: 'g1' } });
    fireEvent.click(screen.getByText('Load Group'));

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    const dropZone = screen.getByText('Alice').closest('[class*="border-dashed"]')!;
    fireEvent.drop(dropZone, {
      dataTransfer: { getData: () => '' },
      preventDefault: jest.fn(),
    });

    expect(screen.getByText('(0 teams)')).toBeInTheDocument();
  });

  it('handles drag and drop to member', async () => {
    const groupData = {
      groupKey: 'g1',
      groupName: 'Test',
      members: [{ name: 'Alice', imageUrl: null, teams: [] }],
    };
    const teamsData = [
      { teamCode: 'BRA', name: 'Brazil', flag: '🇧🇷', fifaRanking: 1, groupLetter: 'B', stats: { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, yellowCards: 0, redCards: 0, possession: null, xG: null }, eliminated: false, eliminatedAt: null },
    ];
    mockedApi.getGroup.mockResolvedValue(groupData);
    mockedApi.getTeams.mockResolvedValue(teamsData);

    render(<DragDropAssign token="test-token" onStatus={mockOnStatus} />);
    fireEvent.change(screen.getByPlaceholderText('Group key...'), { target: { value: 'g1' } });
    fireEvent.click(screen.getByText('Load Group'));

    await waitFor(() => {
      expect(screen.getByText('BRA')).toBeInTheDocument();
    });

    // Simulate drag and drop
    const teamElement = screen.getByText('BRA').closest('[draggable]')!;
    const dropZone = screen.getByText('Alice').closest('[class*="border-dashed"]')!;

    fireEvent.dragStart(teamElement, { dataTransfer: { setData: jest.fn(), effectAllowed: '' } });
    fireEvent.dragOver(dropZone, { dataTransfer: { dropEffect: '' }, preventDefault: jest.fn() });
    fireEvent.drop(dropZone, {
      dataTransfer: { getData: () => 'BRA' },
      preventDefault: jest.fn(),
    });
    fireEvent.dragEnd(teamElement);

    // BRA should now be under Alice
    await waitFor(() => {
      expect(screen.getByText('(1 teams)')).toBeInTheDocument();
    });
  });
});
