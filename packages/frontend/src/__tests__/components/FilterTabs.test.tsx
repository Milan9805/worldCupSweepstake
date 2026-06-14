import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterTabs from '../../components/FilterTabs';

const TABS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo' },
  { value: 'c', label: 'Charlie' },
];

describe('FilterTabs', () => {
  it('renders all provided tab labels', () => {
    render(<FilterTabs tabs={TABS} value="a" onChange={jest.fn()} ariaLabel="Pick one" />);
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bravo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Charlie' })).toBeInTheDocument();
  });

  it('marks the active value with aria-pressed', () => {
    render(<FilterTabs tabs={TABS} value="b" onChange={jest.fn()} ariaLabel="Pick one" />);
    expect(screen.getByRole('button', { name: 'Bravo' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Charlie' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the chosen tab value', () => {
    const onChange = jest.fn();
    render(<FilterTabs tabs={TABS} value="a" onChange={onChange} ariaLabel="Pick one" />);
    fireEvent.click(screen.getByRole('button', { name: 'Charlie' }));
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('labels the group with the passed ariaLabel', () => {
    render(<FilterTabs tabs={TABS} value="a" onChange={jest.fn()} ariaLabel="Pick one" />);
    expect(screen.getByRole('group', { name: 'Pick one' })).toBeInTheDocument();
  });
});
