import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FeedFilterTabs from '../../components/FeedFilterTabs';

describe('FeedFilterTabs', () => {
  it('renders the three views', () => {
    render(<FeedFilterTabs value="all" onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'All games' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'My games' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Live games' })).toBeInTheDocument();
  });

  it('marks the active view with aria-pressed', () => {
    render(<FeedFilterTabs value="live" onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Live games' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All games' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the chosen filter', () => {
    const onChange = jest.fn();
    render(<FeedFilterTabs value="all" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'My games' }));
    expect(onChange).toHaveBeenCalledWith('mine');
  });
});
