'use client';

import { FeedFilter } from '@/lib/feedGroups';
import FilterTabs from './FilterTabs';

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
  return <FilterTabs tabs={TABS} value={value} onChange={onChange} ariaLabel="Filter the feed" />;
}
