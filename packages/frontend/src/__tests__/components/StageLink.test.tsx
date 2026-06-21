import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Match } from '@sweepstake/shared';
import StageLink from '../../components/StageLink';

jest.mock('next/link', () => {
  return ({ href, children, onClick, className }: { href: string; children: React.ReactNode; onClick?: React.MouseEventHandler<HTMLAnchorElement>; className?: string }) => (
    <a href={href} onClick={onClick} className={className}>{children}</a>
  );
});

const makeMatch = (stage: string, group: string | null = null): Match => ({
  matchId: 'm1', homeTeam: 'ENG', awayTeam: 'FRA',
  homeScore: null, awayScore: null, status: 'SCHEDULED',
  stage, group, datetime: '2026-06-14T18:00:00Z', venue: 'Wembley',
});

describe('StageLink — match mode', () => {
  it('renders the formatted stage label', () => {
    render(<StageLink match={makeMatch('GROUP_STAGE', 'E')} />);
    expect(screen.getByText('Group E')).toBeInTheDocument();
  });

  it('links a group-stage match to /groups?group=E', () => {
    render(<StageLink match={makeMatch('GROUP_STAGE', 'E')} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/groups?group=E');
  });

  it('links a knockout match to /tree', () => {
    render(<StageLink match={makeMatch('QUARTER_FINAL')} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/tree');
    expect(screen.getByRole('link')).toHaveTextContent('Quarter Final');
  });

  it('always applies underline classes for consistent styling', () => {
    render(<StageLink match={makeMatch('GROUP_STAGE', 'A')} />);
    const link = screen.getByRole('link');
    expect(link).toHaveClass('underline', 'underline-offset-1', 'transition-colors');
  });

  it('merges additional className from the caller', () => {
    render(<StageLink match={makeMatch('GROUP_STAGE', 'A')} className="text-red-200 text-[11px]" />);
    const link = screen.getByRole('link');
    expect(link).toHaveClass('underline', 'text-red-200', 'text-[11px]');
  });

  it('forwards onClick so callers can stop event propagation', () => {
    const onClick = jest.fn();
    render(<StageLink match={makeMatch('GROUP_STAGE', 'A')} onClick={onClick} />);
    fireEvent.click(screen.getByRole('link'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('StageLink — explicit href/children mode', () => {
  it('renders the provided children as the link label', () => {
    render(<StageLink href="/groups?group=H" className="text-white/70">Group H</StageLink>);
    expect(screen.getByRole('link', { name: 'Group H' })).toBeInTheDocument();
  });

  it('uses the provided href', () => {
    render(<StageLink href="/groups?group=H" className="text-white/70">Group H</StageLink>);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/groups?group=H');
  });

  it('still applies underline classes', () => {
    render(<StageLink href="/groups?group=H" className="text-white/70">Group H</StageLink>);
    expect(screen.getByRole('link')).toHaveClass('underline', 'underline-offset-1');
  });

  it('applies the caller className on top of the base classes', () => {
    render(<StageLink href="/groups?group=H" className="text-white/70">Group H</StageLink>);
    expect(screen.getByRole('link')).toHaveClass('text-white/70');
  });
});
