import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HomePage from '../../app/page';

const mockLogin = jest.fn();
const mockPush = jest.fn();

jest.mock('../../hooks/useGroup', () => ({
  useGroup: () => ({
    login: mockLogin,
    loading: false,
    error: null,
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('HomePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the title and subtitle', () => {
    render(<HomePage />);
    expect(screen.getByText(/FIFA/)).toBeInTheDocument();
    expect(screen.getByText(/World Cup/)).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Sweepstake Tracker/)).toBeInTheDocument();
  });

  it('renders the group key input', () => {
    render(<HomePage />);
    const input = screen.getByPlaceholderText(/Enter your group passphrase/);
    expect(input).toBeInTheDocument();
  });

  it('renders the submit button', () => {
    render(<HomePage />);
    expect(screen.getByText('Enter')).toBeInTheDocument();
  });

  it('button is disabled when input is empty', () => {
    render(<HomePage />);
    const button = screen.getByText('Enter');
    expect(button).toBeDisabled();
  });

  it('button is enabled when input has value', () => {
    render(<HomePage />);
    const input = screen.getByPlaceholderText(/Enter your group passphrase/);
    fireEvent.change(input, { target: { value: 'test-key' } });
    const button = screen.getByText('Enter');
    expect(button).not.toBeDisabled();
  });

  it('calls login and navigates on successful submit', async () => {
    mockLogin.mockResolvedValue(undefined);
    render(<HomePage />);

    const input = screen.getByPlaceholderText(/Enter your group passphrase/);
    fireEvent.change(input, { target: { value: 'test-key' } });

    const form = screen.getByText('Enter').closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test-key');
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('does not navigate on login failure', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid key'));
    render(<HomePage />);

    const input = screen.getByPlaceholderText(/Enter your group passphrase/);
    fireEvent.change(input, { target: { value: 'bad-key' } });

    const form = screen.getByText('Enter').closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('bad-key');
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  it('does not submit if key is only whitespace', () => {
    render(<HomePage />);

    const input = screen.getByPlaceholderText(/Enter your group passphrase/);
    fireEvent.change(input, { target: { value: '   ' } });

    const form = screen.getByText('Enter').closest('form')!;
    fireEvent.submit(form);

    expect(mockLogin).not.toHaveBeenCalled();
  });
});
