import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HomePage from '../../app/page';

const mockAddGroup = jest.fn();
const mockPush = jest.fn();

// Mutable hook state so individual tests can simulate a logged-in session, an
// error, etc. (referenced inside the hoisted jest.mock factory, hence `mock*`).
const mockGroupState: {
  loading: boolean;
  error: string | null;
  activeGroupKey: string | null;
  knownGroups: Array<{ groupKey: string; groupName: string; person: string | null }>;
  claimedPerson: string | null;
} = {
  loading: false,
  error: null,
  activeGroupKey: null,
  knownGroups: [],
  claimedPerson: null,
};

jest.mock('../../hooks/useGroup', () => ({
  useGroup: () => ({
    addGroup: mockAddGroup,
    login: mockAddGroup,
    loading: mockGroupState.loading,
    error: mockGroupState.error,
    activeGroupKey: mockGroupState.activeGroupKey,
    knownGroups: mockGroupState.knownGroups,
    claimedPerson: mockGroupState.claimedPerson,
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

function fillForm(key: string, name: string) {
  fireEvent.change(screen.getByPlaceholderText(/Enter your group passphrase/), {
    target: { value: key },
  });
  fireEvent.change(screen.getByLabelText(/Your Name/i), { target: { value: name } });
}

describe('HomePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGroupState.loading = false;
    mockGroupState.error = null;
    mockGroupState.activeGroupKey = null;
    mockGroupState.knownGroups = [];
    mockGroupState.claimedPerson = null;
  });

  it('renders the title and subtitle', () => {
    render(<HomePage />);
    expect(screen.getByText(/FIFA/)).toBeInTheDocument();
    expect(screen.getByText(/World Cup/)).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Sweepstake Tracker/)).toBeInTheDocument();
  });

  it('renders the group key and name inputs', () => {
    render(<HomePage />);
    expect(screen.getByPlaceholderText(/Enter your group passphrase/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Your Name/i)).toBeInTheDocument();
  });

  it('button is disabled until BOTH key and name are filled', () => {
    render(<HomePage />);
    const button = screen.getByText('Enter');
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/Enter your group passphrase/), {
      target: { value: 'test-key' },
    });
    expect(button).toBeDisabled(); // name still required

    fireEvent.change(screen.getByLabelText(/Your Name/i), { target: { value: 'Dan' } });
    expect(button).not.toBeDisabled();
  });

  it('calls addGroup with key + personName and navigates on success', async () => {
    mockAddGroup.mockResolvedValue(undefined);
    render(<HomePage />);
    fillForm('test-key', 'Dan');
    fireEvent.submit(screen.getByText('Enter').closest('form')!);

    await waitFor(() => {
      expect(mockAddGroup).toHaveBeenCalledWith('test-key', { personName: 'Dan' });
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('trims + lowercases the key and trims the name (mobile auto-capitalisation)', async () => {
    mockAddGroup.mockResolvedValue(undefined);
    render(<HomePage />);
    fillForm('  Lads-ON-Tour  ', '  dan  ');
    fireEvent.submit(screen.getByText('Enter').closest('form')!);

    await waitFor(() => {
      expect(mockAddGroup).toHaveBeenCalledWith('lads-on-tour', { personName: 'dan' });
    });
  });

  it('disables auto-capitalisation on both inputs', () => {
    render(<HomePage />);
    const keyInput = screen.getByPlaceholderText(/Enter your group passphrase/);
    expect(keyInput).toHaveAttribute('autoCapitalize', 'none');
    const nameInput = screen.getByLabelText(/Your Name/i);
    expect(nameInput).toHaveAttribute('autoCapitalize', 'none');
    expect(nameInput).toHaveAttribute('autoCorrect', 'off');
  });

  it('does not navigate when login fails (bad key or name not in group)', async () => {
    mockAddGroup.mockRejectedValue(
      new Error("\"Zzz\" isn't a member of this group. Check the spelling of your name.")
    );
    render(<HomePage />);
    fillForm('test-key', 'Zzz');
    fireEvent.submit(screen.getByText('Enter').closest('form')!);

    await waitFor(() => {
      expect(mockAddGroup).toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  it('surfaces the hook error WITHOUT leaking the group members', () => {
    mockGroupState.error = "\"Zzz\" isn't a member of this group. Check the spelling of your name.";
    render(<HomePage />);
    expect(screen.getByText(/isn't a member of this group/i)).toBeInTheDocument();
    expect(screen.queryByText(/Members:/)).not.toBeInTheDocument();
  });

  it('pre-fills the name once but does NOT re-populate after it is cleared', () => {
    mockGroupState.activeGroupKey = 'lads-on-tour';
    mockGroupState.knownGroups = [
      { groupKey: 'lads-on-tour', groupName: 'Lads on Tour', person: 'Charlie' },
    ];
    mockGroupState.claimedPerson = 'Charlie';
    render(<HomePage />);

    const nameInput = screen.getByLabelText(/Your Name/i) as HTMLInputElement;
    expect(nameInput.value).toBe('Charlie'); // prefilled once on mount

    fireEvent.change(nameInput, { target: { value: '' } });
    expect(nameInput.value).toBe(''); // stays cleared — not auto-repopulated
  });

  it('does not submit if key or name is only whitespace', () => {
    render(<HomePage />);
    fillForm('   ', '   ');
    fireEvent.submit(screen.getByText('Enter').closest('form')!);
    expect(mockAddGroup).not.toHaveBeenCalled();
  });

  it('shows a "Continue to <group>" shortcut when a session exists and jumps to the dashboard', () => {
    mockGroupState.activeGroupKey = 'lads-on-tour';
    mockGroupState.knownGroups = [
      { groupKey: 'lads-on-tour', groupName: 'Lads on Tour', person: 'Dan' },
    ];
    mockGroupState.claimedPerson = 'Dan';
    render(<HomePage />);

    const cont = screen.getByRole('button', { name: /Continue to Lads on Tour as Dan/i });
    fireEvent.click(cont);
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('does not show the Continue shortcut when there is no session', () => {
    render(<HomePage />);
    expect(screen.queryByRole('button', { name: /Continue to/i })).not.toBeInTheDocument();
  });
});
