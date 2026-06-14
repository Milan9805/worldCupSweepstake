'use client';

/**
 * Generic segmented control: a row of mutually-exclusive tabs sharing the app's
 * button-group pattern (~44px touch targets, accent active state). Tabs sit in a
 * row on a phone, wrapping only as a safety net. Reused by feature-specific
 * controls (e.g. FeedFilterTabs) so they all read and tap the same.
 */
interface FilterTabsProps<T extends string> {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

export default function FilterTabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
}: FilterTabsProps<T>) {
  return (
    <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label={ariaLabel}>
      {tabs.map((tab) => {
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
