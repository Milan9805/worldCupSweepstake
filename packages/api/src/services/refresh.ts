import { fetchMatches } from '../clients/footballData';
import { fetchBbcFixtures, buildBbcPatches } from '../clients/bbcScraper';
import { fetchTvListings, buildChannelPatches } from '../clients/footballTvScraper';
import { getAllMatches, getAllTeams, putMatch, getConfig, putConfig } from '../db/dynamodb';
import { Match, Team, RefreshSource, RefreshResponse, ChannelBroadcast } from '@sweepstake/shared';
import { generateTreeIfReady, processKnockoutResults } from './generateTree';

const REFRESH_COOLDOWN_MS = 20_000;

export async function refreshData(): Promise<RefreshResponse> {
  const lastRefresh = await getConfig('lastRefreshTime');
  const now = Date.now();

  if (lastRefresh && now - parseInt(lastRefresh.value) < REFRESH_COOLDOWN_MS) {
    return buildResponse('cache', parseInt(lastRefresh.value));
  }

  let source: RefreshSource = 'cache';
  let refreshedAt = lastRefresh ? parseInt(lastRefresh.value) : 0;

  try {
    const freshMatches = await fetchMatches();
    for (const match of freshMatches) {
      if (match.matchId) {
        await putMatch(match);
      }
    }
    source = 'api';
    refreshedAt = now;
    await putConfig('lastRefreshTime', String(now));
  } catch (apiError) {
    console.warn('Football Data API refresh failed, falling back to BBC scraper:', apiError);
    try {
      const scraped = await fetchBbcFixtures();
      const existing = (await getAllMatches()) as unknown as Match[];
      const patches = buildBbcPatches(scraped, existing);
      for (const patch of patches) {
        const target = existing.find((m) => m.matchId === patch.matchId);
        if (!target) continue;
        await putMatch({ ...target, ...patch });
      }
      source = 'bbc';
      refreshedAt = now;
      await putConfig('lastRefreshTime', String(now));
    } catch (bbcError) {
      console.error('BBC scraper fallback also failed:', bbcError);
      // Leave source as 'cache' and return whatever's in DynamoDB.
    }
  }

  // Enrich matches with TV broadcast channels. Independent best-effort step:
  // the channel source is unrelated to scores, so a failure here is logged and
  // never blocks the refresh. Only patches existing rows (never creates them).
  try {
    const listings = await fetchTvListings();
    const existing = (await getAllMatches()) as unknown as Match[];
    const patches = buildChannelPatches(listings, existing);
    for (const patch of patches) {
      const target = existing.find((m) => m.matchId === patch.matchId);
      if (!target) continue;
      if (sameChannels(target.channels, patch.channels)) continue;
      await putMatch({ ...target, ...patch });
    }
  } catch (tvError) {
    console.warn('Football-on-TV channel scrape failed:', tvError);
  }

  // Recompute bracket and progress knockouts off the latest written state.
  await generateTreeIfReady();
  const matches = (await getAllMatches()) as unknown as Match[];
  await processKnockoutResults(matches);

  return buildResponse(source, refreshedAt, matches);
}

function sameChannels(
  a: ChannelBroadcast[] | undefined,
  b: ChannelBroadcast[] | undefined,
): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return (
    x.length === y.length &&
    x.every((c, i) => c.name === y[i].name && c.bg === y[i].bg && c.fg === y[i].fg)
  );
}

async function buildResponse(
  source: RefreshSource,
  refreshedAtMs: number,
  matchesOverride?: Match[],
): Promise<RefreshResponse> {
  const matches = matchesOverride ?? ((await getAllMatches()) as unknown as Match[]);
  const teams = (await getAllTeams()) as unknown as Team[];
  return {
    matches,
    teams,
    source,
    refreshedAt: refreshedAtMs > 0 ? new Date(refreshedAtMs).toISOString() : new Date(0).toISOString(),
  };
}
