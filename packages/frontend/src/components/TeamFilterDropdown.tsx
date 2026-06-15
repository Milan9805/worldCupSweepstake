'use client';

import { useState, useRef, useEffect } from 'react';
import { Team, normaliseTeamName } from '@sweepstake/shared';

interface TeamFilterDropdownProps {
  teams: Team[]; // already filtered/sorted by the caller
  selectedTeamCode: string | null; // null = "All teams"
  onChange: (teamCode: string | null) => void;
}

/**
 * Full-width, searchable team picker for the dark page body. Mirrors
 * GroupSwitcher's outside-click + aria menu pattern, but uses the dark palette
 * (panels on near-black, white text, accent highlight) and is built mobile-first:
 * the search input is pinned (`sticky top-0`) at the top of the scrollable panel
 * so the phone keyboard can never hide it, every row is a ≥44px touch target, and
 * the "All teams" reset stays reachable above the filtered list.
 */
export default function TeamFilterDropdown({
  teams,
  selectedTeamCode,
  onChange,
}: TeamFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on an outside click (mousedown), mirroring GroupSwitcher.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Focus the search box as soon as the panel opens so the user can type straight
  // away (the mobile keyboard pops without an extra tap).
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const selectTeam = (teamCode: string | null) => {
    onChange(teamCode);
    close();
  };

  const selected = selectedTeamCode
    ? teams.find((t) => t.teamCode === selectedTeamCode) ?? null
    : null;

  const triggerLabel = selected ? `${selected.flag} ${selected.name}` : 'All teams';

  // Normalise both sides so diacritics, case, and punctuation don't cause
  // misses — e.g. typing "curacao" still matches "Curaçao".
  const q = normaliseTeamName(query);
  const filtered = q
    ? teams.filter((t) => normaliseTeamName(t.name).includes(q))
    : teams;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/40 px-4 py-2 text-left text-sm text-white transition-colors hover:bg-black/60"
      >
        <span className="truncate">{triggerLabel}</span>
        <svg
          className="h-4 w-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              close();
              triggerRef.current?.focus();
            }
          }}
          className="absolute left-0 z-50 mt-2 max-h-[60vh] w-full overflow-y-auto rounded-lg border border-white/10 bg-zinc-900 py-1 shadow-lg"
        >
          <div className="sticky top-0 bg-zinc-900 px-2 pb-1 pt-1">
            <input
              ref={searchRef}
              type="text"
              inputMode="search"
              aria-label="Search teams"
              placeholder="Search teams…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-accent focus:outline-none"
            />
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => selectTeam(null)}
            className={`flex min-h-[44px] w-full items-center px-4 py-2 text-left text-sm transition-colors hover:bg-black/40 ${
              selectedTeamCode === null ? 'bg-accent text-white' : 'text-white'
            }`}
          >
            All teams
          </button>

          {filtered.length === 0 ? (
            <div className="px-4 py-2 text-sm text-white/40">No teams match</div>
          ) : (
            filtered.map((team) => (
              <button
                key={team.teamCode}
                type="button"
                role="menuitem"
                onClick={() => selectTeam(team.teamCode)}
                className={`flex min-h-[44px] w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-black/40 ${
                  team.teamCode === selectedTeamCode ? 'bg-accent text-white' : 'text-white'
                }`}
              >
                <span className="shrink-0">{team.flag}</span>
                <span className="truncate">{team.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
