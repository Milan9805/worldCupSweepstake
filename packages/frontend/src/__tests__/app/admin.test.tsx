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
