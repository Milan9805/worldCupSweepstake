import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import TeamCard from '../../components/TeamCard';
import { Team } from '@sweepstake/shared';

describe('TeamCard', () => {
  const makeTeam = (overrides: Partial<Team> = {}): Team => ({
    teamCode: 'ENG',
    name: 'England',
    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    fifaRanking: 4,
    groupLetter: 'A',
    stats: {
      played: 3,
      wins: 2,
      draws: 1,
      losses: 0,
      goalsFor: 5,
      goalsAgainst: 1,
      goalDifference: 4,
      points: 7,
      yellowCards: 2,
      redCards: 0,
      possession: 62,
      xG: 4.5,
    },
    eliminated: false,
    eliminatedAt: null,
    ...overrides,
  });

  it('renders team name and flag', () => {
    render(<TeamCard team={makeTeam()} />);
    expect(screen.getByText('England')).toBeInTheDocument();
    expect(screen.getByText('🏴󠁧󠁢󠁥󠁮󠁧󠁿')).toBeInTheDocument();
  });

  it('shows group letter and ranking', () => {
    render(<TeamCard team={makeTeam()} />);
    expect(screen.getByText(/Group A/)).toBeInTheDocument();
    expect(screen.getByText(/#4/)).toBeInTheDocument();
  });

  it('shows stats: points, W/D/L, GD', () => {
    render(<TeamCard team={makeTeam()} />);
    expect(screen.getByText('7')).toBeInTheDocument(); // points
    expect(screen.getByText('2/1/0')).toBeInTheDocument(); // W/D/L
    expect(screen.getByText('+4')).toBeInTheDocument(); // GD
  });

  it('shows eliminated badge when eliminated', () => {
    const team = makeTeam({ eliminated: true, eliminatedAt: 'ROUND_OF_16' });
    render(<TeamCard team={team} />);
    expect(screen.getByText(/Eliminated/)).toBeInTheDocument();
    expect(screen.getByText(/ROUND OF 16/)).toBeInTheDocument();
  });

  it('shows owner name initial when provided', () => {
    render(<TeamCard team={makeTeam()} ownerName="Alice" />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('shows owner image when provided', () => {
    render(
      <TeamCard team={makeTeam()} ownerName="Alice" ownerImage="http://example.com/alice.png" />
    );
    const img = screen.getByAltText('Alice');
    expect(img).toHaveAttribute('src', 'http://example.com/alice.png');
  });

  it('shows negative goal difference without plus sign', () => {
    const team = makeTeam({
      stats: {
        played: 3, wins: 0, draws: 0, losses: 3,
        goalsFor: 1, goalsAgainst: 5, goalDifference: -4,
        points: 0, yellowCards: 3, redCards: 0,
        possession: 35, xG: 1.2,
      },
    });
    render(<TeamCard team={team} />);
    expect(screen.getByText('-4')).toBeInTheDocument();
  });

  it('shows group position when provided', () => {
    render(<TeamCard team={makeTeam()} groupPosition={1} totalInGroup={4} />);
    expect(screen.getByText(/1st in group/)).toBeInTheDocument();
  });
});
