'use client';

interface SpinnerProps {
  // Optional text shown next to the spinner (e.g. "Loading…").
  label?: string;
  className?: string;
}

/**
 * The app's loading spinner — the same animated ring as the NavBar refresh,
 * extracted so loading states share one indicator. `role="status"` announces the
 * busy state to assistive tech.
 */
export default function Spinner({ label, className = '' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 text-green-200 ${className}`}
    >
      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
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
      {label && <span>{label}</span>}
      {!label && <span className="sr-only">Loading</span>}
    </span>
  );
}
