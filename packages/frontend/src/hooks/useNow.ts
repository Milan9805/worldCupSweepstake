'use client';

import { useEffect, useState } from 'react';

/**
 * Returns the current timestamp, re-rendering on a fixed interval so callers can
 * show a live-ticking value (e.g. a kick-off countdown). Independent of the
 * score-polling cadence — this only drives the clock, not data fetches.
 *
 * @param intervalMs how often to tick (default 1s)
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
