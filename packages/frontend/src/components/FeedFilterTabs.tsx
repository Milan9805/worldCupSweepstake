'use client';

import { FeedFilter } from '@/lib/feedGroups';

const TABS: { value: FeedFilter; label: string }[] = [
  { value: 'all', label: 'All games' },
  { value: 'mine', label: 'My games' },
  { value: 'live', label: 'Live games' },
];

interface FeedFilterTabsProps {
  value: FeedFilter;
  onChange: (value: FeedFilter) => void;
}

/**
 * Segmented control for the live feed's three views (All / My / Live). Mirrors
 * the app's existing button-group pattern (PersonClaim/groups page) so it reads
 * and taps the same: ~44px touch targets and the accent active state. The three
 * short labels sit in a row on a phone, wrapping only as a safety net.
 */
export default function FeedFilterTabs({ value, onChange }: FeedFilterTabsProps) {
  return (
    <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="Filter the feed">
      {TABS.map((tab) => {
        const active = value === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(tab.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              active
                ? 'bg-accent text-white'
                : 'bg-black/30 text-white hover:bg-black/40'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
