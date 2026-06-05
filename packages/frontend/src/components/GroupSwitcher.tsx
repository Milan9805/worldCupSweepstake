'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useIdentity } from '@/hooks/useIdentity';

/**
 * Nav dropdown listing the device's known sweepstake groups. Picking one makes
 * it active and reloads the page so every view (including the pages that only
 * read the active group key on mount) lands on the newly-selected group — no
 * re-login. A "Join another" entry routes to the landing login to add a new
 * group to the registry.
 */
export default function GroupSwitcher() {
  const { groups, activeGroupKey, switchGroup } = useIdentity();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close the dropdown on an outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Nothing to switch between until at least one group is known.
  if (groups.length === 0) return null;

  const activeName =
    groups.find((g) => g.groupKey === activeGroupKey)?.groupName ?? activeGroupKey ?? 'Group';

  const handleSwitch = (key: string) => {
    setOpen(false);
    if (key === activeGroupKey) return;
    // switchGroup persists the new active group to localStorage synchronously,
    // so a full reload reliably re-renders every page against the new group.
    switchGroup(key);
    window.location.reload();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-sm text-gray-600 hover:text-green-800 transition-colors max-w-[10rem]"
      >
        <span className="truncate">{activeName}</span>
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 mt-2 w-56 rounded-lg border border-gray-200 bg-white shadow-lg py-1 z-50"
        >
          {groups.map((g) => (
            <button
              key={g.groupKey}
              type="button"
              role="menuitem"
              onClick={() => handleSwitch(g.groupKey)}
              className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-gray-100 ${
                g.groupKey === activeGroupKey ? 'font-semibold text-green-800' : 'text-gray-700'
              }`}
            >
              <span className="block truncate">{g.groupName}</span>
              {g.person && <span className="block text-xs text-gray-400">{g.person}</span>}
            </button>
          ))}
          <div className="border-t border-gray-100 my-1" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              router.push('/');
            }}
            className="w-full text-left px-4 py-2 text-sm text-green-700 hover:bg-gray-100 transition-colors"
          >
            + Join another
          </button>
        </div>
      )}
    </div>
  );
}
