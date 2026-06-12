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
          { name: 'STV', bg: '#1d4ed8', fg: '#ffffff' },
        ]}
      />
    );
    expect(screen.getByText('ITV1')).toBeInTheDocument();
    expect(screen.getByText('STV')).toBeInTheDocument();
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
