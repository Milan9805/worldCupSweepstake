import { getAllMatches } from '../db/dynamodb';
import { Match, hasActiveMatchWindow } from '@sweepstake/shared';
import { refreshData } from '../services/refresh';

export interface ScheduledRefreshResult {
  refreshed: boolean;
  source?: string;
}

/**
 * EventBridge-invoked entrypoint. Runs on a fixed schedule but only hits the
 * external score sources when a match is live or imminent — so we never burn
 * the football-data.org rate limit (or make pointless requests) when nothing's
 * on. This is the "ingestion on a clock" half of the auto-update design; the
 * browser separately polls the cheap read endpoints.
 */
export async function handler(): Promise<ScheduledRefreshResult> {
  const now = Date.now();
  const matches = (await getAllMatches()) as unknown as Match[];

  if (!hasActiveMatchWindow(matches, now)) {
    console.log('Scheduled refresh: no active match window, skipping external fetch.');
    return { refreshed: false };
  }

  // Reuse the matches we already scanned — refreshData would otherwise re-scan.
  const result = await refreshData(matches);
  console.log(`Scheduled refresh: ran (source=${result.source}).`);
  return { refreshed: true, source: result.source };
}
