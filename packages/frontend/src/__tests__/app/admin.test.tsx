import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminPage from '../../app/admin/page';
import * as api from '../../lib/api';

jest.mock('../../lib/api');
jest.mock('../../components/NavBar', () => {
  return function MockNavBar() {
    return <div data-testid="navbar">NavBar</div>;
  };
});
jest.mock('../../components/DragDropAssign', () => {
  return function MockDragDropAssign() {
    return <div data-testid="drag-drop-assign">DragDropAssign</div>;
  };
});

const mockedApi = api as jest.Mocked<typeof api>;

describe('AdminPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows login form initially', () => {
    render(<AdminPage />);
    expect(screen.getByText('Admin Login')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter admin secret...')).toBeInTheDocument();
  });

  it('logs in successfully', async () => {
    mockedApi.adminLogin.mockResolvedValue({ token: 'test-token' });

    render(<AdminPage />);
    const input = screen.getByPlaceholderText('Enter admin secret...');
    fireEvent.change(input, { target: { value: 'my-secret' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Admin Panel')).toBeInTheDocument();
    });
  });

  it('shows error on login failure', async () => {
    mockedApi.adminLogin.mockRejectedValue(new Error('Invalid secret'));

    render(<AdminPage />);
    const input = screen.getByPlaceholderText('Enter admin secret...');
    fireEvent.change(input, { target: { value: 'bad-secret' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Invalid secret')).toBeInTheDocument();
    });
  });

  it('shows member management tab after login', async () => {
    mockedApi.adminLogin.mockResolvedValue({ token: 'test-token' });

    render(<AdminPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter admin secret...'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByPlaceholderText('Enter admin secret...').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Manage Group Members')).toBeInTheDocument();
    });
  });

  it('can add members to the list', async () => {
    mockedApi.adminLogin.mockResolvedValue({ token: 'test-token' });

    render(<AdminPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter admin secret...'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByPlaceholderText('Enter admin secret...').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Manage Group Members')).toBeInTheDocument();
    });

    const memberInput = screen.getByPlaceholderText('Member name...');
    fireEvent.change(memberInput, { target: { value: 'Alice' } });
    fireEvent.click(screen.getByText('Add'));

    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('switches to assign tab', async () => {
    mockedApi.adminLogin.mockResolvedValue({ token: 'test-token' });

    render(<AdminPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter admin secret...'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByPlaceholderText('Enter admin secret...').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('assign')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('assign'));
    expect(screen.getByTestId('drag-drop-assign')).toBeInTheDocument();
  });

  it('saves members to API', async () => {
    mockedApi.adminLogin.mockResolvedValue({ token: 'test-token' });
    mockedApi.getGroup.mockResolvedValue({ groupKey: 'my-group', groupName: 'My Group', members: [] });
    mockedApi.adminUpdateMembers.mockResolvedValue(undefined);

    render(<AdminPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter admin secret...'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByPlaceholderText('Enter admin secret...').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Manage Group Members')).toBeInTheDocument();
    });

    // Set group key
    fireEvent.change(screen.getByPlaceholderText('Group key...'), { target: { value: 'my-group' } });
    // Add member
    fireEvent.change(screen.getByPlaceholderText('Member name...'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByText('Add'));
    // Save
    fireEvent.click(screen.getByText('Save Members'));

    await waitFor(() => {
      expect(mockedApi.adminUpdateMembers).toHaveBeenCalledWith(
        'test-token',
        'my-group',
        [{ name: 'Alice', imageUrl: null, teams: [] }]
      );
    });
  });

  it('preserves existing imageUrl and teams when saving members', async () => {
    mockedApi.adminLogin.mockResolvedValue({ token: 'test-token' });
    mockedApi.getGroup.mockResolvedValue({
      groupKey: 'my-group',
      groupName: 'My Group',
      members: [{ name: 'Alice', imageUrl: 'https://img.url/alice.png', teams: ['ENG'] }],
    });
    mockedApi.adminUpdateMembers.mockResolvedValue(undefined);

    render(<AdminPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter admin secret...'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByPlaceholderText('Enter admin secret...').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Manage Group Members')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Group key...'), { target: { value: 'my-group' } });
    fireEvent.change(screen.getByPlaceholderText('Member name...'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByText('Add'));
    fireEvent.click(screen.getByText('Save Members'));

    await waitFor(() => {
      expect(mockedApi.adminUpdateMembers).toHaveBeenCalledWith(
        'test-token',
        'my-group',
        [{ name: 'Alice', imageUrl: 'https://img.url/alice.png', teams: ['ENG'] }]
      );
    });
  });

  it('switches to avatars tab', async () => {
    mockedApi.adminLogin.mockResolvedValue({ token: 'test-token' });
    render(<AdminPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter admin secret...'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByPlaceholderText('Enter admin secret...').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('avatars')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('avatars'));
    expect(screen.getByText('Upload Avatar')).toBeInTheDocument();
  });

  it('can remove a member from the list', async () => {
    mockedApi.adminLogin.mockResolvedValue({ token: 'test-token' });
    render(<AdminPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter admin secret...'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByPlaceholderText('Enter admin secret...').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Manage Group Members')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Member name...'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getByText('Alice')).toBeInTheDocument();

    // Click remove button
    fireEvent.click(screen.getByText('×'));
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  it('handles clear button', async () => {
    mockedApi.adminLogin.mockResolvedValue({ token: 'test-token' });
    render(<AdminPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter admin secret...'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByPlaceholderText('Enter admin secret...').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Manage Group Members')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Group key...'), { target: { value: 'my-group' } });
    fireEvent.change(screen.getByPlaceholderText('Member name...'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByText('Add'));

    fireEvent.click(screen.getByText('Clear'));

    // Group key and members should be cleared
    expect(screen.getByPlaceholderText('Group key...')).toHaveValue('');
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  it('does not add duplicate members', async () => {
    mockedApi.adminLogin.mockResolvedValue({ token: 'test-token' });
    render(<AdminPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter admin secret...'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByPlaceholderText('Enter admin secret...').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Manage Group Members')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Member name...'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByText('Add'));
    fireEvent.change(screen.getByPlaceholderText('Member name...'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByText('Add'));

    // Only one Alice
    const alices = screen.getAllByText('Alice');
    expect(alices).toHaveLength(1);
  });

  it('handles save members error', async () => {
    mockedApi.adminLogin.mockResolvedValue({ token: 'test-token' });
    mockedApi.getGroup.mockResolvedValue({ groupKey: 'grp', groupName: 'Grp', members: [] });
    mockedApi.adminUpdateMembers.mockRejectedValue(new Error('Save failed'));

    render(<AdminPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter admin secret...'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByPlaceholderText('Enter admin secret...').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Manage Group Members')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Group key...'), { target: { value: 'grp' } });
    fireEvent.change(screen.getByPlaceholderText('Member name...'), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByText('Add'));
    fireEvent.click(screen.getByText('Save Members'));

    await waitFor(() => {
      expect(screen.getByText(/Error: Save failed/)).toBeInTheDocument();
    });
  });

  it('uploads avatar successfully', async () => {
    mockedApi.adminLogin.mockResolvedValue({ token: 'test-token' });
    mockedApi.adminGetUploadUrl.mockResolvedValue({ uploadUrl: 'https://upload.url', imageUrl: 'https://img.url' });
    mockedApi.getGroup.mockResolvedValue({
      groupKey: 'grp',
      groupName: 'Grp',
      members: [{ name: 'Alice', imageUrl: null, teams: ['ENG'] }],
    });
    mockedApi.adminUpdateMembers.mockResolvedValue(undefined);
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    render(<AdminPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter admin secret...'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByPlaceholderText('Enter admin secret...').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('avatars')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('avatars'));

    // Fill in avatar form
    const groupKeyInputs = screen.getAllByPlaceholderText('Group key...');
    fireEvent.change(groupKeyInputs[groupKeyInputs.length - 1], { target: { value: 'grp' } });
    fireEvent.change(screen.getByPlaceholderText('Person name...'), { target: { value: 'Alice' } });

    // Mock file input
    const file = new File(['image'], 'avatar.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [file] });
    fireEvent.change(fileInput);

    fireEvent.click(screen.getByText('Upload'));

    await waitFor(() => {
      expect(mockedApi.adminGetUploadUrl).toHaveBeenCalledWith('test-token', 'grp', 'Alice', 'image/png');
    });
    // The uploaded imageUrl is persisted onto the matching member
    await waitFor(() => {
      expect(mockedApi.adminUpdateMembers).toHaveBeenCalledWith(
        'test-token',
        'grp',
        [{ name: 'Alice', imageUrl: 'https://img.url', teams: ['ENG'] }]
      );
    });
    expect(screen.getByText(/Avatar uploaded and saved for Alice/)).toBeInTheDocument();
  });

  it('does not persist when the storage upload fails', async () => {
    mockedApi.adminLogin.mockResolvedValue({ token: 'test-token' });
    mockedApi.adminGetUploadUrl.mockResolvedValue({ uploadUrl: 'https://upload.url', imageUrl: 'https://img.url' });
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 });

    render(<AdminPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter admin secret...'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByPlaceholderText('Enter admin secret...').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('avatars')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('avatars'));

    const groupKeyInputs = screen.getAllByPlaceholderText('Group key...');
    fireEvent.change(groupKeyInputs[groupKeyInputs.length - 1], { target: { value: 'grp' } });
    fireEvent.change(screen.getByPlaceholderText('Person name...'), { target: { value: 'Alice' } });
    const file = new File(['image'], 'avatar.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [file] });
    fireEvent.change(fileInput);

    fireEvent.click(screen.getByText('Upload'));

    await waitFor(() => {
      expect(screen.getByText(/Error: Upload to storage failed \(403\)/)).toBeInTheDocument();
    });
    expect(mockedApi.adminUpdateMembers).not.toHaveBeenCalled();
  });

  it('warns when the avatar person is not a member', async () => {
    mockedApi.adminLogin.mockResolvedValue({ token: 'test-token' });
    mockedApi.adminGetUploadUrl.mockResolvedValue({ uploadUrl: 'https://upload.url', imageUrl: 'https://img.url' });
    mockedApi.getGroup.mockResolvedValue({ groupKey: 'grp', groupName: 'Grp', members: [] });
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    render(<AdminPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter admin secret...'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByPlaceholderText('Enter admin secret...').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('avatars')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('avatars'));

    const groupKeyInputs = screen.getAllByPlaceholderText('Group key...');
    fireEvent.change(groupKeyInputs[groupKeyInputs.length - 1], { target: { value: 'grp' } });
    fireEvent.change(screen.getByPlaceholderText('Person name...'), { target: { value: 'Ghost' } });
    const file = new File(['image'], 'avatar.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [file] });
    fireEvent.change(fileInput);

    fireEvent.click(screen.getByText('Upload'));

    await waitFor(() => {
      expect(screen.getByText(/no member named "Ghost"/)).toBeInTheDocument();
    });
    expect(mockedApi.adminUpdateMembers).not.toHaveBeenCalled();
  });

  it('creates a new group', async () => {
    mockedApi.adminLogin.mockResolvedValue({ token: 'test-token' });
    mockedApi.adminCreateGroup.mockResolvedValue({ groupKey: 'new-grp', groupName: 'New Group' } as never);

    render(<AdminPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter admin secret...'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByPlaceholderText('Enter admin secret...').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Create New Group')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/New group key/), { target: { value: 'new-grp' } });
    fireEvent.change(screen.getByPlaceholderText(/New group name/), { target: { value: 'New Group' } });
    fireEvent.click(screen.getByText('Create Group'));

    await waitFor(() => {
      expect(mockedApi.adminCreateGroup).toHaveBeenCalledWith('test-token', 'new-grp', 'New Group');
      expect(screen.getByText(/Group "New Group" created/)).toBeInTheDocument();
    });
  });

  it('handles create group error', async () => {
    mockedApi.adminLogin.mockResolvedValue({ token: 'test-token' });
    mockedApi.adminCreateGroup.mockRejectedValue(new Error('Already exists'));

    render(<AdminPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter admin secret...'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByPlaceholderText('Enter admin secret...').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Create New Group')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/New group key/), { target: { value: 'dup' } });
    fireEvent.change(screen.getByPlaceholderText(/New group name/), { target: { value: 'Dup' } });
    fireEvent.click(screen.getByText('Create Group'));

    await waitFor(() => {
      expect(screen.getByText(/Error: Already exists/)).toBeInTheDocument();
    });
  });

  it('handles avatar upload error', async () => {
    mockedApi.adminLogin.mockResolvedValue({ token: 'test-token' });
    mockedApi.adminGetUploadUrl.mockRejectedValue(new Error('Upload denied'));

    render(<AdminPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter admin secret...'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByPlaceholderText('Enter admin secret...').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('avatars')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('avatars'));

    const groupKeyInputs = screen.getAllByPlaceholderText('Group key...');
    fireEvent.change(groupKeyInputs[groupKeyInputs.length - 1], { target: { value: 'grp' } });
    fireEvent.change(screen.getByPlaceholderText('Person name...'), { target: { value: 'Alice' } });
    const file = new File(['image'], 'avatar.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [file] });
    fireEvent.change(fileInput);

    fireEvent.click(screen.getByText('Upload'));

    await waitFor(() => {
      expect(screen.getByText(/Error: Upload denied/)).toBeInTheDocument();
    });
  });

  it('clears avatar form', async () => {
    mockedApi.adminLogin.mockResolvedValue({ token: 'test-token' });

    render(<AdminPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter admin secret...'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByPlaceholderText('Enter admin secret...').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('avatars')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('avatars'));

    const groupKeyInputs = screen.getAllByPlaceholderText('Group key...');
    const avatarGroupKeyInput = groupKeyInputs[groupKeyInputs.length - 1];
    fireEvent.change(avatarGroupKeyInput, { target: { value: 'grp' } });
    fireEvent.change(screen.getByPlaceholderText('Person name...'), { target: { value: 'Alice' } });

    fireEvent.click(screen.getByText('Clear'));

    expect(avatarGroupKeyInput).toHaveValue('');
    expect(screen.getByPlaceholderText('Person name...')).toHaveValue('');
  });

  it('adds member via Enter key', async () => {
    mockedApi.adminLogin.mockResolvedValue({ token: 'test-token' });
    render(<AdminPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter admin secret...'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByPlaceholderText('Enter admin secret...').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Manage Group Members')).toBeInTheDocument();
    });

    const memberInput = screen.getByPlaceholderText('Member name...');
    fireEvent.change(memberInput, { target: { value: 'Charlie' } });
    fireEvent.keyDown(memberInput, { key: 'Enter' });
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });
});
