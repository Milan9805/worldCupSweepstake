'use client';

import { useEffect, useRef, useState } from 'react';
import { Match } from '@sweepstake/shared';
import { pollIntervalFor } from '@/lib/polling';

/**
 * Auto-refreshes scores in the background, BBC/Sky-style, without a manual
 * reload. The cadence adapts to the fixtures (fast while a match is live, slow
 * when one is imminent, off when nothing's on) and polling pauses while the tab
 * is hidden — refetching once on the way back so a returning user sees current
 * scores immediately.
 *
 * @param matches  current fixtures, used only to decide the cadence
 * @param refetch  re-fetches the latest scores and updates the caller's state;
 *                 its identity may change between renders (kept in a ref).
 */
export function usePollScores(matches: Match[], refetch: () => void): void {
  // Hold the latest refetch in a ref so callers can pass an inline closure
  // without churning the effects below on every render.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  const [isVisible, setIsVisible] = useState(
    typeof document === 'undefined' ? true : !document.hidden,
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibilityChange = () => {
      const visible = !document.hidden;
      setIsVisible(visible);
      if (visible) refetchRef.current();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // Depending on `matches` means each successful poll (which replaces the array)
  // tears down and restarts the interval. That's intentional: it re-derives the
  // cadence as fixtures go live/finish. The practical effect is the timer counts
  // from each fetch rather than firing on a fixed wall clock — fine at this scale.
  useEffect(() => {
    if (!isVisible) return;
    const interval = pollIntervalFor(matches, Date.now());
    if (interval === null) return;
    const id = setInterval(() => refetchRef.current(), interval);
    return () => clearInterval(id);
  }, [isVisible, matches]);
}
