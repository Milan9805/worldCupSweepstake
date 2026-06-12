import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import OwnerTag from '../../components/OwnerTag';

describe('OwnerTag', () => {
  it('renders the owner name', () => {
    render(<OwnerTag owner={{ name: 'Dave', imageUrl: null }} />);
    expect(screen.getByText('Dave')).toBeInTheDocument();
  });

  it('renders the avatar initial when there is no image', () => {
    render(<OwnerTag owner={{ name: 'Dave', imageUrl: null }} />);
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('renders the avatar image when one is provided', () => {
    render(<OwnerTag owner={{ name: 'Dave', imageUrl: 'http://example.com/dave.png' }} />);
    expect(screen.getByAltText('Dave')).toHaveAttribute('src', 'http://example.com/dave.png');
  });

  it('renders nothing when there is no owner', () => {
    const { container } = render(<OwnerTag owner={null} />);
    expect(container.firstChild).toBeNull();
  });
});
