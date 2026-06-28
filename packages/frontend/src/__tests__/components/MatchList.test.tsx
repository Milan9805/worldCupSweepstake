import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import MatchList from '../../components/MatchList';
import { Match } from '@sweepstake/shared';

describe('MatchList', () => {
  const makeMatch = (overrides: Partial<Match> = {}): Match => ({
    matchId: '1',
    homeTeam: 'ENG',
    awayTeam: 'BRA',
    homeScore: null,
    awayScore: null,
    status: 'SCHEDULED',
    stage: 'GROUP_STAGE',
    group: 'A',
    datetime: '2026-06-14T18:00:00Z',
    venue: 'MetLife Stadium',
    ...overrides,
  });

  it('renders match teams', () => {
    const matches = [makeMatch()];
    render(<MatchList matches={matches} />);
    expect(screen.getByText('ENG')).toBeInTheDocument();
    expect(screen.getByText('BRA')).toBeInTheDocument();
  });

  it('shows "vs" for scheduled matches', () => {
    const matches = [makeMatch({ status: 'SCHEDULED' })];
    render(<MatchList matches={matches} />);
    expect(screen.getByText('vs')).toBeInTheDocument();
  });

  it('shows score for finished matches', () => {
    const matches = [makeMatch({ status: 'FINISHED', homeScore: 2, awayScore: 1 })];
    render(<MatchList matches={matches} />);
    expect(screen.getByText('2 - 1')).toBeInTheDocument();
  });

  it('shows LIVE badge for live matches', () => {
    const matches = [makeMatch({ status: 'LIVE', homeScore: 1, awayScore: 0 })];
    render(<MatchList matches={matches} />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  it('shows the live minute alongside the LIVE badge', () => {
    const matches = [makeMatch({ status: 'LIVE', homeScore: 1, awayScore: 0, minute: "19'" })];
    render(<MatchList matches={matches} />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText("19'")).toBeInTheDocument();
  });

  it('does not show a stale minute on a finished match', () => {
    const matches = [makeMatch({ status: 'FINISHED', homeScore: 2, awayScore: 1, minute: "90'" })];
    render(<MatchList matches={matches} />);
    expect(screen.queryByText("90'")).not.toBeInTheDocument();
  });

  it('shows FT badge for finished matches', () => {
    const matches = [makeMatch({ status: 'FINISHED', homeScore: 3, awayScore: 2 })];
    render(<MatchList matches={matches} />);
    expect(screen.getByText('FT')).toBeInTheDocument();
  });

  it('renders multiple matches', () => {
    const matches = [
      makeMatch({ matchId: '1', homeTeam: 'ENG', awayTeam: 'BRA' }),
      makeMatch({ matchId: '2', homeTeam: 'GER', awayTeam: 'FRA' }),
    ];
    render(<MatchList matches={matches} />);
    expect(screen.getByText('ENG')).toBeInTheDocument();
    expect(screen.getByText('GER')).toBeInTheDocument();
  });

  it('renders empty list without crashing', () => {
    const { container } = render(<MatchList matches={[]} />);
    expect(container).toBeInTheDocument();
  });

  it('shows the group-stage label under the date when showStage is set', () => {
    const matches = [makeMatch({ stage: 'GROUP_STAGE', group: 'A' })];
    render(<MatchList matches={matches} showStage />);
    expect(screen.getByText('Group A')).toBeInTheDocument();
  });

  it('shows a knockout-round label under the date when showStage is set', () => {
    const matches = [makeMatch({ stage: 'ROUND_OF_16', group: null })];
    render(<MatchList matches={matches} showStage />);
    expect(screen.getByText('Round of 16')).toBeInTheDocument();
  });

  it('does not show the stage by default (other lists are already stage-scoped)', () => {
    const matches = [makeMatch({ stage: 'GROUP_STAGE', group: 'A' })];
    render(<MatchList matches={matches} />);
    expect(screen.queryByText('Group A')).not.toBeInTheDocument();
  });

  it('shows the team owner name in brackets when teamOwners provided', () => {
    const matches = [makeMatch({ homeTeam: 'ENG' })];
    const teamOwners = { ENG: { name: 'Alice', imageUrl: null } };
    render(<MatchList matches={matches} teamOwners={teamOwners} />);
    expect(screen.getByText('(Alice)')).toBeInTheDocument();
  });

  it('shows team flags when teamFlags provided', () => {
    const matches = [makeMatch({ homeTeam: 'ENG', awayTeam: 'BRA' })];
    const teamFlags = { ENG: '🏴', BRA: '🇧🇷' };
    render(<MatchList matches={matches} teamFlags={teamFlags} />);
    expect(screen.getByText('🏴')).toBeInTheDocument();
    expect(screen.getByText('🇧🇷')).toBeInTheDocument();
  });

  it('shows both team owners under their team codes', () => {
    const matches = [makeMatch({ homeTeam: 'ENG', awayTeam: 'BRA' })];
    const teamOwners = {
      ENG: { name: 'Alice', imageUrl: null },
      BRA: { name: 'Bob', imageUrl: null },
    };
    render(<MatchList matches={matches} teamOwners={teamOwners} />);
    expect(screen.getByText('(Alice)')).toBeInTheDocument();
    expect(screen.getByText('(Bob)')).toBeInTheDocument();
  });

  it('renders broadcast channel pills when channels are present (hiding STV)', () => {
    const matches = [
      makeMatch({
        channels: [
          { name: 'ITV1', bg: '#127b60', fg: 'rgba(255, 255, 255, 1.0)' },
          { name: 'STV', bg: '#032baa', fg: '#fafafa' },
          { name: 'ITVX', bg: '#102c3e', fg: '#deeb52' },
        ],
      }),
    ];
    render(<MatchList matches={matches} />);
    expect(screen.getByText('ITV1')).toBeInTheDocument();
    expect(screen.getByText('ITVX')).toBeInTheDocument();
    // STV is a Scotland-only feed and is hidden everywhere.
    expect(screen.queryByText('STV')).not.toBeInTheDocument();
  });

  it('applies each channel’s scraped brand colours', () => {
    const matches = [
      makeMatch({
        channels: [
          { name: 'ITV1', bg: '#127b60', fg: 'rgba(255, 255, 255, 1.0)' },
          { name: 'ITVX', bg: '#102c3e', fg: '#deeb52' },
        ],
      }),
    ];
    render(<MatchList matches={matches} />);
    expect(screen.getByText('ITV1')).toHaveStyle({
      backgroundColor: '#127b60',
      color: 'rgba(255, 255, 255, 1.0)',
    });
    expect(screen.getByText('ITVX')).toHaveStyle({ backgroundColor: '#102c3e', color: '#deeb52' });
  });

  it('falls back to default colours when a channel has none', () => {
    const matches = [makeMatch({ channels: [{ name: 'Mystery TV', bg: '', fg: '' }] })];
    render(<MatchList matches={matches} />);
    expect(screen.getByText('Mystery TV')).toHaveStyle({
      backgroundColor: '#374151',
      color: '#ffffff',
    });
  });

  it('renders no channel pills when channels are absent or empty', () => {
    const { rerender } = render(<MatchList matches={[makeMatch()]} />);
    expect(screen.queryByText('ITV1')).not.toBeInTheDocument();
    rerender(<MatchList matches={[makeMatch({ channels: [] })]} />);
    expect(screen.queryByText('ITV1')).not.toBeInTheDocument();
  });

  describe('"my fixtures" highlight', () => {
    const teamOwners = {
      ENG: { name: 'Alice', imageUrl: null },
      BRA: { name: 'Bob', imageUrl: null },
    };

    it('highlights a match when the claimed person owns the home team', () => {
      const matches = [makeMatch({ homeTeam: 'ENG', awayTeam: 'BRA' })];
      const { container } = render(
        <MatchList matches={matches} teamOwners={teamOwners} claimedPerson="Alice" />,
      );
      const card = container.querySelector('[data-involves-claimed]');
      expect(card).toHaveAttribute('data-involves-claimed', 'true');
      expect(card).toHaveClass('bg-sky-400/10');
    });

    it('highlights a match when the claimed person owns the away team', () => {
      const matches = [makeMatch({ homeTeam: 'ENG', awayTeam: 'BRA' })];
      const { container } = render(
        <MatchList matches={matches} teamOwners={teamOwners} claimedPerson="Bob" />,
      );
      const card = container.querySelector('[data-involves-claimed]');
      expect(card).toHaveAttribute('data-involves-claimed', 'true');
      expect(card).toHaveClass('bg-sky-400/10');
    });

    it('does not highlight a match the claimed person owns no team in', () => {
      const matches = [makeMatch({ homeTeam: 'ENG', awayTeam: 'BRA' })];
      const { container } = render(
        <MatchList matches={matches} teamOwners={teamOwners} claimedPerson="Carol" />,
      );
      const card = container.querySelector('[data-involves-claimed]');
      expect(card).toHaveAttribute('data-involves-claimed', 'false');
      expect(card).not.toHaveClass('bg-sky-400/10');
    });

    it('highlights only the claimed person’s matches in a mixed list', () => {
      const matches = [
        makeMatch({ matchId: '1', homeTeam: 'ENG', awayTeam: 'BRA' }),
        makeMatch({ matchId: '2', homeTeam: 'GER', awayTeam: 'FRA' }),
      ];
      const { container } = render(
        <MatchList matches={matches} teamOwners={teamOwners} claimedPerson="Alice" />,
      );
      const cards = container.querySelectorAll('[data-involves-claimed]');
      expect(cards[0]).toHaveAttribute('data-involves-claimed', 'true');
      expect(cards[1]).toHaveAttribute('data-involves-claimed', 'false');
    });

    it('highlights nothing when claimedPerson is not provided', () => {
      const matches = [makeMatch({ homeTeam: 'ENG', awayTeam: 'BRA' })];
      const { container } = render(<MatchList matches={matches} teamOwners={teamOwners} />);
      const card = container.querySelector('[data-involves-claimed]');
      expect(card).toHaveAttribute('data-involves-claimed', 'false');
    });
  });

  describe('"Today" divider', () => {
    const matches = [
      makeMatch({ matchId: '1', homeTeam: 'ENG', awayTeam: 'BRA' }),
      makeMatch({ matchId: '2', homeTeam: 'GER', awayTeam: 'FRA' }),
      makeMatch({ matchId: '3', homeTeam: 'ESP', awayTeam: 'ITA' }),
    ];

    it('renders no divider by default', () => {
      render(<MatchList matches={matches} />);
      expect(screen.queryByTestId('today-divider')).not.toBeInTheDocument();
    });

    it('renders no divider when the index is null', () => {
      render(<MatchList matches={matches} todayDividerIndex={null} />);
      expect(screen.queryByTestId('today-divider')).not.toBeInTheDocument();
    });

    it('renders a single divider labelled "Today" at the given index', () => {
      render(<MatchList matches={matches} todayDividerIndex={1} />);
      const dividers = screen.getAllByTestId('today-divider');
      expect(dividers).toHaveLength(1);
      expect(dividers[0]).toHaveTextContent('Today');
    });

    it('gives the divider the id "today-divider" so the fixtures page can scroll to it', () => {
      render(<MatchList matches={matches} todayDividerIndex={1} />);
      expect(document.getElementById('today-divider')).toBeInTheDocument();
    });

    it('places the divider immediately before the match at that index', () => {
      const { container } = render(<MatchList matches={matches} todayDividerIndex={1} />);
      // Walk the list children in DOM order: card 1, divider, card 2, card 3.
      const list = container.firstElementChild as HTMLElement;
      const order = Array.from(list.children).map((el) =>
        el.getAttribute('data-testid') === 'today-divider' ? 'divider' : 'card',
      );
      expect(order).toEqual(['card', 'divider', 'card', 'card']);
    });
  });

  describe('live-feed link', () => {
    it('links a live match to the live feed when liveFeedHref is set', () => {
      const matches = [makeMatch({ status: 'LIVE', homeScore: 1, awayScore: 0 })];
      render(<MatchList matches={matches} liveFeedHref="/feed" />);
      const link = screen.getByRole('link', { name: /watch this live match/i });
      expect(link).toHaveAttribute('href', '/feed');
      expect(link).toHaveTextContent('Watch live');
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });

    it('does not link a live match when liveFeedHref is unset', () => {
      const matches = [makeMatch({ status: 'LIVE', homeScore: 1, awayScore: 0 })];
      render(<MatchList matches={matches} />);
      expect(
        screen.queryByRole('link', { name: /watch this live match/i }),
      ).not.toBeInTheDocument();
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });

    it('shows no watch-live link for a scheduled match even with liveFeedHref', () => {
      render(<MatchList matches={[makeMatch({ status: 'SCHEDULED' })]} liveFeedHref="/feed" />);
      expect(screen.queryByText(/watch live/i)).not.toBeInTheDocument();
    });
  });

  describe('plain stage label', () => {
    it('renders the stage as plain text (not a link) when stagePlain is set', () => {
      render(
        <MatchList matches={[makeMatch({ stage: 'ROUND_OF_32', group: null })]} showStage stagePlain />,
      );
      expect(screen.getByText('Round of 32')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Round of 32' })).not.toBeInTheDocument();
    });

    it('renders the stage as a link by default when showStage is set', () => {
      render(<MatchList matches={[makeMatch({ stage: 'ROUND_OF_32', group: null })]} showStage />);
      expect(screen.getByRole('link', { name: 'Round of 32' })).toBeInTheDocument();
    });
  });
});
