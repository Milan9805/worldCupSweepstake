import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import LiveBadge from '../../components/LiveBadge';

describe('LiveBadge', () => {
  it('renders the LIVE pill', () => {
    render(<LiveBadge />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  it('shows the minute when provided', () => {
    render(<LiveBadge minute="45'+1" />);
    expect(screen.getByText("45'+1")).toBeInTheDocument();
  });

  it('omits the minute when absent (null/undefined)', () => {
    const { rerender } = render(<LiveBadge minute={null} />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    rerender(<LiveBadge />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });
});
