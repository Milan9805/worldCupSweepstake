import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import Spinner from '../../components/Spinner';

describe('Spinner', () => {
  it('exposes a status role with the given label', () => {
    render(<Spinner label="Loading…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });

  it('falls back to a visually-hidden "Loading" label', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });
});
