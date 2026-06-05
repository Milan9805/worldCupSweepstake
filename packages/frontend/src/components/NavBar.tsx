'use client';

import { useState } from 'react';
import Link from 'next/link';
import { RefreshResponse } from '@sweepstake/shared';
import { useRefresh } from '@/hooks/useRefresh';
import GroupSwitcher from '@/components/GroupSwitcher';
import { useIdentity } from '@/hooks/useIdentity';

interface NavBarProps {
  groupName?: string;
  onRefreshed?: (result: RefreshResponse) => void;
}

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/feed', label: 'Feed' },
  { href: '/groups', label: 'Groups' },
  { href: '/tree', label: 'Tree' },
  { href: '/honours', label: 'Honours' },
  { href: '/admin', label: 'Admin' },
];

export default function NavBar({ groupName, onRefreshed }: NavBarProps) {
  const { refresh, isRefreshing, source } = useRefresh(onRefreshed);
  const { groups, activeGroupKey } = useIdentity();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="bg-white/95 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            {/* When a group is active, the logo is a shortcut back into the app
                rather than a trip through the login screen. */}
            <Link
              href={activeGroupKey ? '/dashboard' : '/'}
              className="text-xl font-bold text-green-800 drop-shadow-sm"
            >
              ⚽ WC2026
            </Link>
            {/* Multi-group switcher once a group is registered on the device;
                falls back to a static label otherwise (e.g. first paint). */}
            {groups.length > 0 ? (
              <GroupSwitcher />
            ) : (
              groupName && <span className="text-sm text-gray-500">{groupName}</span>
            )}
            <div className="hidden md:flex items-center gap-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-gray-600 hover:text-green-800 transition-colors text-sm"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {source === 'bbc' && (
              <span
                title="Football-data.org was unavailable; scores were pulled from BBC instead."
                className="hidden sm:inline-block text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200"
              >
                via BBC
              </span>
            )}
          <button
            onClick={refresh}
            disabled={isRefreshing}
            className="bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white px-3 py-2 sm:px-4 rounded-lg text-sm font-medium transition-all whitespace-nowrap shrink-0"
          >
            {isRefreshing ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                <span className="hidden sm:inline">Refreshing...</span>
              </span>
            ) : (
              <>🔄 Refresh<span className="hidden sm:inline"> Scores</span></>
            )}
          </button>
          <button
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="md:hidden p-2 rounded-lg text-gray-700 hover:bg-gray-100"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
          </div>
        </div>
        {menuOpen && (
          <div className="md:hidden pb-3 flex flex-col gap-1 border-t border-gray-200 pt-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 hover:text-green-800 transition-colors text-sm"
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
