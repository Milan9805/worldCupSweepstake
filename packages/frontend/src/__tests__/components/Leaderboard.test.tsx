import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import Leaderboard from '../../components/Leaderboard';
import { LeaderboardEntry } from '@sweepstake/shared';

describe('Leaderboard', () => {
  const makeEntry = (overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
    name: 'Alice',
    imageUrl: null,
    teamsAlive: 2,
    totalTeams: 3,
    bestStage: 'Still Active',
    winProbability: 0.45,
    ...overrides,
  });

  it('renders the leaderboard title', () => {
    render(<Leaderboard entries={[]} />);
    expect(screen.getByText(/Leaderboard/)).toBeInTheDocument();
  });

  it('renders entries with rankings', () => {
    const entries = [
      makeEntry({ name: 'Alice', winProbability: 0.6 }),
      makeEntry({ name: 'Bob', winProbability: 0.4 }),
    ];
    render(<Leaderboard entries={entries} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('60.0%')).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument();
  });

  it('shows teams alive and best stage', () => {
    const entries = [makeEntry({ teamsAlive: 2, totalTeams: 3, bestStage: 'Still Active' })];
    render(<Leaderboard entries={entries} />);
    expect(screen.getByText(/2\/3 remaining/)).toBeInTheDocument();
    expect(screen.getByText(/Still Active/)).toBeInTheDocument();
  });

  it('renders avatar image when imageUrl is provided', () => {
    const entries = [makeEntry({ name: 'Alice', imageUrl: 'http://example.com/avatar.png' })];
    render(<Leaderboard entries={entries} />);
    const img = screen.getByAltText('Alice');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'http://example.com/avatar.png');
  });

  it('renders initial letter when no imageUrl', () => {
    const entries = [makeEntry({ name: 'Bob', imageUrl: null })];
    render(<Leaderboard entries={entries} />);
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('renders empty state without crashing', () => {
    render(<Leaderboard entries={[]} />);
    expect(screen.getByText(/Leaderboard/)).toBeInTheDocument();
  });

  it('displays ranking numbers', () => {
    const entries = [
      makeEntry({ name: 'Alice' }),
      makeEntry({ name: 'Bob' }),
      makeEntry({ name: 'Charlie' }),
    ];
    render(<Leaderboard entries={entries} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
