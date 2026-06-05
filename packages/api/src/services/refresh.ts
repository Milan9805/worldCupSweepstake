import { fetchMatches } from '../clients/footballData';
import { fetchBbcFixtures, buildBbcPatches } from '../clients/bbcScraper';
import { fetchTvListings, buildChannelPatches } from '../clients/footballTvScraper';
import { getAllMatches, getAllTeams, batchPutMatches, getConfig, putConfig, putEvent } from '../db/dynamodb';
import { Match, Team, RefreshSource, RefreshResponse, ChannelBroadcast, FeedEvent } from '@sweepstake/shared';
import { generateTreeIfReady, processKnockoutResults } from './generateTree';
import { detectEvents } from './detectEvents';

const REFRESH_COOLDOWN_MS = 20_000;

/**
 * @param preloadedMatches the current matches, if the caller already scanned
 *   them (e.g. the scheduled handler checking the active-match window). Lets us
 *   avoid a second full table scan; omitted by the HTTP handler.
 */
export async function refreshData(preloadedMatches?: Match[]): Promise<RefreshResponse> {
  const lastRefresh = await getConfig('lastRefreshTime');
  const now = Date.now();

  if (lastRefresh && now - parseInt(lastRefresh.value) < REFRESH_COOLDOWN_MS) {
    // Reuse the caller's scan on a cooldown hit too (e.g. a scheduled tick that
    // lands within 20s of a manual refresh) so we don't scan needlessly.
    return buildResponse('cache', parseInt(lastRefresh.value), preloadedMatches);
  }

  let source: RefreshSource = 'cache';
  let refreshedAt = lastRefresh ? parseInt(lastRefresh.value) : 0;

  // Load the current match state once, then thread it (updated in memory)
  // through every step below so we never re-scan the table.
  let matches = preloadedMatches ?? ((await getAllMatches()) as unknown as Match[]);

  // Current team state, indexed by code, so event detection can attach
  // elimination info to a match that has just reached full time.
  const teamsById = indexTeamsByCode((await getAllTeams()) as unknown as Team[]);

  try {
    const freshMatches = await fetchMatches();
    matches = await mergeAndWrite(matches, freshMatches, (m) => m.matchId, teamsById);
    source = 'api';
    refreshedAt = now;
    await putConfig('lastRefreshTime', String(now));
  } catch (apiError) {
    console.warn('Football Data API refresh failed, falling back to BBC scraper:', apiError);
    try {
      const scraped = await fetchBbcFixtures();
      const patches = buildBbcPatches(scraped, matches);
      matches = await mergeAndWrite(matches, patches, (p) => p.matchId, teamsById, { onlyExisting: true });
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
    const patches = buildChannelPatches(listings, matches);
    const byId = indexById(matches);
    const changed: Match[] = [];
    for (const patch of patches) {
      if (!patch.matchId) continue;
      const target = byId.get(patch.matchId);
      if (!target) continue;
      if (sameChannels(target.channels, patch.channels)) continue;
      const merged = { ...target, ...patch };
      byId.set(merged.matchId, merged);
      changed.push(merged);
    }
    if (changed.length > 0) {
      matches = Array.from(byId.values());
      await batchPutMatches(changed as unknown as Record<string, unknown>[]);
    }
  } catch (tvError) {
    console.warn('Football-on-TV channel scrape failed:', tvError);
  }

  // Recompute bracket and progress knockouts off the latest in-memory state.
  await generateTreeIfReady();
  await processKnockoutResults(matches);

  return buildResponse(source, refreshedAt, matches);
}

/**
 * Apply a set of updates (full fresh matches from the API, or partial patches
 * from BBC) onto the in-memory match list, write only the rows that actually
 * changed, and return the new list. Spreading existing-over-update preserves
 * fields the source doesn't carry (e.g. scraped TV `channels`).
 */
async function mergeAndWrite<U extends { matchId?: string }>(
  matches: Match[],
  updates: U[],
  getId: (u: U) => string | undefined,
  teamsById: Map<string, Team>,
  opts: { onlyExisting?: boolean } = {},
): Promise<Match[]> {
  const byId = indexById(matches);
  const changed: Match[] = [];
  const events: FeedEvent[] = [];

  for (const update of updates) {
    const id = getId(update);
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing && opts.onlyExisting) continue;
    const merged = { ...(existing ?? {}), ...update, matchId: id } as Match;
    if (matchChanged(existing, merged)) {
      byId.set(id, merged);
      changed.push(merged);
      // Collect the feed events implied by this transition; persisted only
      // after the new match state is written (below) so re-runs don't refire.
      events.push(...detectEvents(existing, merged, teamsById));
    }
  }

  if (changed.length === 0) return matches;
  await batchPutMatches(changed as unknown as Record<string, unknown>[]);
  // Persist events AFTER the match state, so a failure mid-write can't leave an
  // event whose triggering state was never stored. Deterministic eventIds mean
  // a re-detected event overwrites its row rather than duplicating it.
  await Promise.all(events.map((e) => putEvent(e)));
  return Array.from(byId.values());
}

function indexTeamsByCode(teams: Team[]): Map<string, Team> {
  return new Map(teams.map((t) => [t.teamCode, t]));
}

function indexById(matches: Match[]): Map<string, Match> {
  return new Map(matches.map((m) => [m.matchId, m]));
}

/** True when any score/status/fixture field differs (or the row is brand new). */
function matchChanged(existing: Match | undefined, next: Match): boolean {
  if (!existing) return true;
  return (
    existing.homeTeam !== next.homeTeam ||
    existing.awayTeam !== next.awayTeam ||
    existing.homeScore !== next.homeScore ||
    existing.awayScore !== next.awayScore ||
    existing.status !== next.status ||
    existing.stage !== next.stage ||
    existing.group !== next.group ||
    existing.datetime !== next.datetime ||
    existing.venue !== next.venue
  );
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
