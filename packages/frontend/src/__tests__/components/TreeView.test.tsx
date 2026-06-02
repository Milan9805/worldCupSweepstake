import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import TreeView from '../../components/TreeView';
import { TreeSlot } from '@sweepstake/shared';

describe('TreeView', () => {
  const makeSlot = (overrides: Partial<TreeSlot> = {}): TreeSlot => ({
    round: 'ROUND_OF_16',
    position: 1,
    team1: 'ENG',
    team2: 'BRA',
    score1: null,
    score2: null,
    winner: null,
    datetime: '2026-07-01T18:00:00Z',
    ...overrides,
  });

  it('renders round labels', () => {
    const slots = [makeSlot({ round: 'ROUND_OF_16' })];
    render(<TreeView slots={slots} />);
    expect(screen.getByText('Round of 16')).toBeInTheDocument();
  });

  it('renders all round columns', () => {
    render(<TreeView slots={[]} />);
    expect(screen.getByText('Round of 32')).toBeInTheDocument();
    expect(screen.getByText('Round of 16')).toBeInTheDocument();
    expect(screen.getByText('Quarter Finals')).toBeInTheDocument();
    expect(screen.getByText('Semi Finals')).toBeInTheDocument();
    expect(screen.getByText('Final')).toBeInTheDocument();
  });

  it('renders team codes in slots', () => {
    const slots = [makeSlot({ team1: 'ENG', team2: 'BRA' })];
    render(<TreeView slots={slots} />);
    expect(screen.getByText('ENG')).toBeInTheDocument();
    expect(screen.getByText('BRA')).toBeInTheDocument();
  });

  it('renders empty slots with TBD', () => {
    const slots = [makeSlot({ team1: null, team2: null })];
    render(<TreeView slots={slots} />);
    const tbds = screen.getAllByText('TBD');
    expect(tbds.length).toBeGreaterThanOrEqual(2);
  });

  it('renders with team owners', () => {
    const slots = [makeSlot({ team1: 'ENG', team2: 'BRA' })];
    const teamOwners = {
      ENG: { name: 'Alice', imageUrl: null },
      BRA: { name: 'Bob', imageUrl: null },
    };
    render(<TreeView slots={slots} teamOwners={teamOwners} />);
    expect(screen.getByText('(Alice)')).toBeInTheDocument();
    expect(screen.getByText('(Bob)')).toBeInTheDocument();
  });

  it('sorts slots by position within a round', () => {
    const slots = [
      makeSlot({ round: 'QUARTER_FINAL', position: 2, team1: 'GER', team2: 'FRA' }),
      makeSlot({ round: 'QUARTER_FINAL', position: 1, team1: 'ENG', team2: 'BRA' }),
    ];
    render(<TreeView slots={slots} />);
    const teams = screen.getAllByText(/ENG|GER/);
    expect(teams[0].textContent).toBe('ENG');
  });

  it('shows scores when available', () => {
    const slots = [makeSlot({ team1: 'ENG', team2: 'BRA', score1: 2, score2: 1, winner: 'ENG' })];
    render(<TreeView slots={slots} />);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
