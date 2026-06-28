import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import ChannelPills from '../../components/ChannelPills';

describe('ChannelPills', () => {
  it('renders a pill per channel', () => {
    render(
      <ChannelPills
        channels={[
          { name: 'ITV1', bg: '#127b60', fg: '#ffffff' },
          { name: 'BBC One', bg: '#1d4ed8', fg: '#ffffff' },
        ]}
      />
    );
    expect(screen.getByText('ITV1')).toBeInTheDocument();
    expect(screen.getByText('BBC One')).toBeInTheDocument();
  });

  it('hides the Scotland-only STV / STV Player feeds', () => {
    render(
      <ChannelPills
        channels={[
          { name: 'ITV1', bg: '#127b60', fg: '#ffffff' },
          { name: 'STV', bg: '#032baa', fg: '#fafafa' },
          { name: 'ITVX', bg: '#102c3e', fg: '#deeb52' },
          { name: 'STV Player', bg: '#032baa', fg: '#fafafa' },
        ]}
      />
    );
    expect(screen.getByText('ITV1')).toBeInTheDocument();
    expect(screen.getByText('ITVX')).toBeInTheDocument();
    expect(screen.queryByText('STV')).not.toBeInTheDocument();
    expect(screen.queryByText('STV Player')).not.toBeInTheDocument();
  });

  it('renders nothing when only hidden channels are present', () => {
    const { container } = render(
      <ChannelPills channels={[{ name: 'STV', bg: '', fg: '' }, { name: 'STV Player', bg: '', fg: '' }]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('applies the channel brand colours', () => {
    render(<ChannelPills channels={[{ name: 'ITV1', bg: '#127b60', fg: '#ffffff' }]} />);
    expect(screen.getByText('ITV1')).toHaveStyle({ backgroundColor: '#127b60', color: '#ffffff' });
  });

  it('falls back to default colours when a channel omits them', () => {
    render(<ChannelPills channels={[{ name: 'Sky', bg: '', fg: '' }]} />);
    expect(screen.getByText('Sky')).toHaveStyle({ backgroundColor: '#374151', color: '#ffffff' });
  });

  it('renders nothing when the channel list is empty', () => {
    const { container } = render(<ChannelPills channels={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when channels is undefined', () => {
    const { container } = render(<ChannelPills channels={undefined} />);
    expect(container.firstChild).toBeNull();
  });
});
