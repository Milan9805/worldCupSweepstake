import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import NavBar from '../../components/NavBar';

// Mock the useRefresh hook
jest.mock('../../hooks/useRefresh', () => ({
  useRefresh: () => ({
    refresh: mockRefresh,
    isRefreshing: mockIsRefreshing,
    source: mockSource,
  }),
}));

// Mock next/link
jest.mock('next/link', () => {
  return ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  );
});

let mockRefresh: jest.Mock;
let mockIsRefreshing: boolean;
let mockSource: string | null;

describe('NavBar', () => {
  beforeEach(() => {
    mockRefresh = jest.fn();
    mockIsRefreshing = false;
    mockSource = null;
  });

  it('renders the brand name', () => {
    render(<NavBar />);
    expect(screen.getByText(/WC2026/)).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    render(<NavBar />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Groups')).toBeInTheDocument();
    expect(screen.getByText('Tree')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('shows group name when provided', () => {
    render(<NavBar groupName="Test Group" />);
    expect(screen.getByText('Test Group')).toBeInTheDocument();
  });

  it('renders refresh button', () => {
    render(<NavBar />);
    expect(screen.getByText(/Refresh Scores/)).toBeInTheDocument();
  });

  it('calls refresh when button clicked', () => {
    render(<NavBar />);
    const button = screen.getByText(/Refresh Scores/);
    fireEvent.click(button);
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows refreshing state', () => {
    mockIsRefreshing = true;
    render(<NavBar />);
    expect(screen.getByText('Refreshing...')).toBeInTheDocument();
  });

  it('links point to correct routes', () => {
    render(<NavBar />);
    const dashboardLink = screen.getByText('Dashboard').closest('a');
    expect(dashboardLink).toHaveAttribute('href', '/dashboard');
    const groupsLink = screen.getByText('Groups').closest('a');
    expect(groupsLink).toHaveAttribute('href', '/groups');
  });

  it('shows "via BBC" badge when source is bbc', () => {
    mockSource = 'bbc';
    render(<NavBar />);
    expect(screen.getByText('via BBC')).toBeInTheDocument();
  });

  it('toggles mobile menu open and closed', () => {
    render(<NavBar />);
    const toggle = screen.getByLabelText('Toggle navigation menu');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // Mobile menu duplicates the nav links
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(1);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes mobile menu when a link is clicked', () => {
    render(<NavBar />);
    const toggle = screen.getByLabelText('Toggle navigation menu');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // Click a link inside the mobile menu (second occurrence)
    const dashboardLinks = screen.getAllByText('Dashboard');
    fireEvent.click(dashboardLinks[dashboardLinks.length - 1]);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
