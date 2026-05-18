'use client';

import Link from 'next/link';
import { useRefresh } from '@/hooks/useRefresh';

interface NavBarProps {
  groupName?: string;
}

export default function NavBar({ groupName }: NavBarProps) {
  const { refresh, isRefreshing } = useRefresh();

  return (
    <nav className="bg-white/95 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-xl font-bold text-green-800 drop-shadow-sm">
              ⚽ WC2026
            </Link>
            {groupName && (
              <span className="text-sm text-gray-500">{groupName}</span>
            )}
            <div className="hidden md:flex items-center gap-4">
              <Link
                href="/dashboard"
                className="text-gray-600 hover:text-green-800 transition-colors text-sm"
              >
                Dashboard
              </Link>
              <Link
                href="/groups"
                className="text-gray-600 hover:text-green-800 transition-colors text-sm"
              >
                Groups
              </Link>
              <Link
                href="/tree"
                className="text-gray-600 hover:text-green-800 transition-colors text-sm"
              >
                Tree
              </Link>
              <Link
                href="/admin"
                className="text-gray-600 hover:text-green-800 transition-colors text-sm"
              >
                Admin
              </Link>
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={isRefreshing}
            className="bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all"
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
                Refreshing...
              </span>
            ) : (
              '🔄 Refresh Scores'
            )}
          </button>
        </div>
      </div>
    </nav>
  );
}
