import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Team } from '@sweepstake/shared';
import TeamFilterDropdown from '../../components/TeamFilterDropdown';

const stats = {
  played: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  goalDifference: 0,
  points: 0,
  yellowCards: 0,
  redCards: 0,
  possession: null,
  xG: null,
};

const teams: Team[] = [
  { teamCode: 'ENG', name: 'England', flag: '🏴', fifaRanking: 4, groupLetter: 'A', stats, eliminated: false, eliminatedAt: null },
  { teamCode: 'BRA', name: 'Brazil', flag: '🇧🇷', fifaRanking: 1, groupLetter: 'B', stats, eliminated: false, eliminatedAt: null },
  { teamCode: 'FRA', name: 'France', flag: '🇫🇷', fifaRanking: 2, groupLetter: 'C', stats, eliminated: false, eliminatedAt: null },
];

const openPanel = () => fireEvent.click(screen.getByRole('button', { expanded: false }));

describe('TeamFilterDropdown', () => {
  it('shows "All teams" on the trigger when nothing is selected', () => {
    render(<TeamFilterDropdown teams={teams} selectedTeamCode={null} onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: /All teams/ })).toBeInTheDocument();
  });

  it('shows the selected team name on the trigger when a code is selected', () => {
    render(<TeamFilterDropdown teams={teams} selectedTeamCode="BRA" onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: /Brazil/ })).toBeInTheDocument();
  });

  it('opens the panel on trigger click', () => {
    render(<TeamFilterDropdown teams={teams} selectedTeamCode={null} onChange={jest.fn()} />);
    openPanel();
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('filters the listed teams as the user types, keeping the "All teams" row', () => {
    render(<TeamFilterDropdown teams={teams} selectedTeamCode={null} onChange={jest.fn()} />);
    openPanel();
    const menu = screen.getByRole('menu');

    fireEvent.change(screen.getByLabelText('Search teams'), { target: { value: 'eng' } });

    expect(within(menu).getByRole('menuitem', { name: /England/ })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /Brazil/ })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /France/ })).not.toBeInTheDocument();
    // The "All teams" reset is not subject to the search filter.
    expect(within(menu).getByRole('menuitem', { name: /All teams/ })).toBeInTheDocument();
  });

  it('calls onChange with the team code and closes when a team is selected', () => {
    const onChange = jest.fn();
    render(<TeamFilterDropdown teams={teams} selectedTeamCode={null} onChange={onChange} />);
    openPanel();
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /France/ }));
    expect(onChange).toHaveBeenCalledWith('FRA');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('calls onChange(null) when "All teams" is clicked', () => {
    const onChange = jest.fn();
    render(<TeamFilterDropdown teams={teams} selectedTeamCode="BRA" onChange={onChange} />);
    openPanel();
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /All teams/ }));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the panel on an outside click', () => {
    render(<TeamFilterDropdown teams={teams} selectedTeamCode={null} onChange={jest.fn()} />);
    openPanel();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows "No teams match" when the query matches nothing', () => {
    render(<TeamFilterDropdown teams={teams} selectedTeamCode={null} onChange={jest.fn()} />);
    openPanel();
    fireEvent.change(screen.getByLabelText('Search teams'), { target: { value: 'zzz' } });
    expect(screen.getByText('No teams match')).toBeInTheDocument();
    // The "All teams" row remains reachable above the empty state.
    expect(screen.getByRole('menuitem', { name: /All teams/ })).toBeInTheDocument();
  });
});
