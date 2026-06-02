'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGroup } from '@/hooks/useGroup';

export default function HomePage() {
  const [key, setKey] = useState('');
  const { login, loading, error } = useGroup();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    try {
      await login(key.trim().toLowerCase());
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

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !key.trim()}
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
