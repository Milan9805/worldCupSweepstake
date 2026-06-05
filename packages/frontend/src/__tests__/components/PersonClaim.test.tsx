import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PersonClaim from '../../components/PersonClaim';

const members = [
  { name: 'Alice', imageUrl: null, teams: ['ENG'] },
  { name: 'Bob', imageUrl: null, teams: ['GER'] },
];

describe('PersonClaim', () => {
  it('renders nothing when there are no members', () => {
    const { container } = render(
      <PersonClaim members={[]} claimedPerson={null} onClaim={jest.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('prompts "Who are you?" with member buttons when unclaimed', () => {
    render(<PersonClaim members={members} claimedPerson={null} onClaim={jest.fn()} />);
    expect(screen.getByText('Who are you?')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('calls onClaim with the chosen member name', () => {
    const onClaim = jest.fn();
    render(<PersonClaim members={members} claimedPerson={null} onClaim={onClaim} />);
    fireEvent.click(screen.getByText('Bob'));
    expect(onClaim).toHaveBeenCalledWith('Bob');
  });

  it('collapses once claimed when switching is not allowed (feed mode)', () => {
    const { container } = render(
      <PersonClaim members={members} claimedPerson="Alice" onClaim={jest.fn()} />,
    );
    expect(container.innerHTML).toBe('');
    expect(screen.queryByText('Who are you?')).not.toBeInTheDocument();
  });

  it('keeps the selector after claiming when allowSwitch is set (dashboard mode)', () => {
    render(
      <PersonClaim members={members} claimedPerson="Alice" onClaim={jest.fn()} allowSwitch />,
    );
    expect(screen.queryByText('Who are you?')).not.toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });
});
