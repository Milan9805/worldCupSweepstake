import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import Avatar from '../../components/Avatar';

describe('Avatar', () => {
  it('renders an image with the correct src and alt when imageUrl is provided', () => {
    render(<Avatar name="Kathryn" imageUrl="https://example.com/k.png" />);
    const img = screen.getByAltText('Kathryn');
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', 'https://example.com/k.png');
  });

  it('renders the first-letter fallback when no imageUrl is provided', () => {
    render(<Avatar name="Kathryn" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  it('renders the first-letter fallback when imageUrl is null', () => {
    render(<Avatar name="Milan" imageUrl={null} />);
    expect(screen.getByText('M')).toBeInTheDocument();
  });

  // Regression guard: the avatar must never be allowed to shrink/deform in a
  // flex row (the bug this component was extracted to fix).
  it('always applies shrink-0 to the image variant', () => {
    render(<Avatar name="Kathryn" imageUrl="https://example.com/k.png" />);
    expect(screen.getByAltText('Kathryn')).toHaveClass('shrink-0');
  });

  it('always applies shrink-0 to the fallback variant', () => {
    render(<Avatar name="Kathryn" />);
    expect(screen.getByText('K')).toHaveClass('shrink-0');
  });

  it('defaults to the md size box', () => {
    render(<Avatar name="Kathryn" />);
    const fallback = screen.getByText('K');
    expect(fallback).toHaveClass('w-6', 'h-6');
  });

  it('applies the requested size box', () => {
    render(<Avatar name="Kathryn" size="lg" />);
    const fallback = screen.getByText('K');
    expect(fallback).toHaveClass('w-8', 'h-8');
  });

  it('applies the size box to the image variant too', () => {
    render(<Avatar name="Kathryn" imageUrl="https://example.com/k.png" size="xs" />);
    expect(screen.getByAltText('Kathryn')).toHaveClass('w-4', 'h-4');
  });

  it('merges an extra className', () => {
    render(<Avatar name="Kathryn" className="bg-accent/50" />);
    expect(screen.getByText('K')).toHaveClass('bg-accent/50');
  });
});
