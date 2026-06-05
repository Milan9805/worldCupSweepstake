'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGroup } from '@/hooks/useGroup';

export default function HomePage() {
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const { addGroup, loading, error, activeGroupKey, knownGroups, claimedPerson } = useGroup();
  const router = useRouter();

  // The active group to offer a one-tap "Continue" shortcut for, if any.
  const activeGroup = knownGroups.find((g) => g.groupKey === activeGroupKey) ?? null;

  // Pre-fill the name ONCE with the identity remembered on this device, so a
  // returning user doesn't retype it. Never re-populate after the field has been
  // touched/cleared — they may be logging in as someone else.
  const prefilledRef = useRef(false);
  const nameTouchedRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current || nameTouchedRef.current) return;
    const remembered = claimedPerson ?? knownGroups.find((g) => g.person)?.person ?? '';
    if (remembered) {
      setName(remembered);
      prefilledRef.current = true;
    }
  }, [claimedPerson, knownGroups]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || !name.trim()) return;
    try {
      // Validates the key, checks the name against the group's members
      // (case-insensitive), claims the canonical name, and registers/activates
      // the group — all atomically. A bad key or non-member name throws and is
      // surfaced via the hook's `error`, leaving the form populated to retry.
      await addGroup(key.trim().toLowerCase(), { personName: name.trim() });
      router.push('/dashboard');
    } catch {
      // Error is handled by useGroup hook
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">
            <span className="text-usred">FIFA</span>{' '}
            <span className="text-white">World Cup</span>{' '}
            <span className="text-usblue">2026</span>{' '}
            <span className="text-gold">⚽</span>
          </h1>
          <h2 className="text-xl text-green-100">Sweepstake Tracker</h2>
          <p className="text-green-200 mt-4 text-sm">
            Enter your group passphrase to view your teams and track the tournament.
          </p>
          <p className="text-2xl mt-2">🇺🇸🇲🇽🇨🇦</p>
        </div>

        {activeGroup && (
          <div className="mb-6">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="w-full py-3 px-4 bg-green-700 hover:bg-green-800 text-white rounded-lg font-medium transition-all"
            >
              Continue to {activeGroup.groupName}
              {claimedPerson ? ` as ${claimedPerson}` : ''} →
            </button>
            <div className="mt-6 text-center text-xs uppercase tracking-wide text-green-200/60">
              or join another group
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="groupKey" className="block text-sm font-medium text-green-100 mb-2">
              Group Key
            </label>
            <input
              id="groupKey"
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter your group passphrase..."
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="personName" className="block text-sm font-medium text-green-100 mb-2">
              Your Name
            </label>
            <input
              id="personName"
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              value={name}
              onChange={(e) => {
                nameTouchedRef.current = true;
                setName(e.target.value);
              }}
              placeholder="e.g. Dan (as it appears in your group)"
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              disabled={loading}
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !key.trim() || !name.trim()}
            className="w-full py-3 px-4 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white rounded-lg font-medium transition-all"
          >
            {loading ? 'Verifying...' : 'Enter'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <a
            href="/admin"
            className="text-sm text-green-200/70 hover:text-white transition-colors"
          >
            Admin access →
          </a>
        </div>
      </div>
    </main>
  );
}
