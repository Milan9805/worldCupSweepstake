import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import BracketView from '../../components/BracketView';
import { TreeSlot } from '@sweepstake/shared';

describe('BracketView', () => {
  const makeSlot = (overrides: Partial<TreeSlot> = {}): TreeSlot => ({
    round: 'SEMI_FINAL',
    position: 1,
    team1: 'ENG',
    team2: 'GER',
    score1: null,
    score2: null,
    winner: null,
    datetime: '2026-07-10T20:00:00Z',
    ...overrides,
  });

  it('renders without crashing', () => {
    render(<BracketView slots={[]} />);
    expect(screen.getByText('Final')).toBeInTheDocument();
  });

  it('renders round labels', () => {
    render(<BracketView slots={[makeSlot()]} />);
    expect(screen.getByText('Semi Finals')).toBeInTheDocument();
  });

  it('renders team codes', () => {
    render(<BracketView slots={[makeSlot({ team1: 'ENG', team2: 'GER' })]} />);
    expect(screen.getByText('ENG')).toBeInTheDocument();
    expect(screen.getByText('GER')).toBeInTheDocument();
  });

  it('shows TBD for null teams', () => {
    render(<BracketView slots={[makeSlot({ team1: null, team2: null })]} />);
    const tbds = screen.getAllByText('TBD');
    expect(tbds.length).toBeGreaterThanOrEqual(2);
  });

  it('shows full owner name next to team code', () => {
    const slots = [makeSlot({ team1: 'ENG', team2: 'GER' })];
    const teamOwners = {
      ENG: { name: 'Alice', imageUrl: null },
      GER: { name: 'Bob', imageUrl: null },
    };
    render(<BracketView slots={slots} teamOwners={teamOwners} />);
    expect(screen.getByText('(Alice)')).toBeInTheDocument();
    expect(screen.getByText('(Bob)')).toBeInTheDocument();
  });
});
