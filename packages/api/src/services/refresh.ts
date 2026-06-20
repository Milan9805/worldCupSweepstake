import { fetchMatches } from '../clients/footballData';
import { fetchBbcFixtures, buildBbcPatches, ScrapedFixture } from '../clients/bbcScraper';
import { fetchMatchCards } from '../clients/bbcMatchPage';
import { fetchTvListings, buildChannelPatches } from '../clients/footballTvScraper';
import { getAllMatches, getAllTeams, batchPutMatches, batchPutTeams, getConfig, putConfig, putEvent } from '../db/dynamodb';
import {
  Match,
  MatchAction,
  MatchStatus,
  Team,
  RefreshSource,
  RefreshResponse,
  ChannelBroadcast,
  FeedEvent,
  hasActiveMatchWindow,
} from '@sweepstake/shared';
import { generateTreeIfReady, processKnockoutResults, markCompletedGroupEliminations } from './generateTree';
import { detectEvents } from './detectEvents';
import {
  deriveCardCounts,
  computeLeagueStats,
  computeTeamStatUpdates,
} from './teamStats';

const REFRESH_COOLDOWN_MS = 20_000;

// Upper bound on per-match page fetches in one refresh. The group stage peaks at
// ~4 simultaneous kickoffs; this is defensive headroom so a malformed feed can't
// spawn dozens of requests.
const MATCH_PAGE_FETCH_CAP = 8;

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

  // Snapshot each match's status as it stood at the start of this poll, before
  // any merge below can flip it. The card overlay uses this to spot a match that
  // transitions LIVE → FINISHED *this* cycle and give it one final card sweep
  // (a booking shown only at the whistle would otherwise be missed, since the
  // overlay normally fetches pages for LIVE matches only).
  const prevStatusById = new Map(matches.map((m) => [m.matchId, m.status] as const));

  // Current team state, indexed by code, so event detection can attach
  // elimination info to a match that has just reached full time.
  const teamsById = indexTeamsByCode((await getAllTeams()) as unknown as Team[]);

  try {
    const freshMatches = await fetchMatches();
    matches = await mergeAndWrite(matches, freshMatches, (m) => m.matchId, teamsById);
    source = 'api';
    refreshedAt = now;
    await putConfig('lastRefreshTime', String(now));

    // football-data.org's free tier serves pre-match and post-match data but
    // never flips a fixture to live or carries an in-running score — during a
    // match it keeps returning the SCHEDULED/null row. So whenever a match is
    // in its active window, overlay BBC's live scores/status on top of the API
    // result (patching existing rows only). This is the path that actually
    // produces live scores and the KICKOFF/GOAL/FULL_TIME feed events; the
    // catch below remains the API-is-down fallback. Best-effort: a BBC failure
    // here is logged and must not undo the good API sync.
    if (hasActiveMatchWindow(matches, now)) {
      try {
        const scraped = await fetchBbcFixtures();
        const livePatches = buildBbcPatches(scraped, matches);
        matches = await mergeAndWrite(matches, livePatches, (p) => p.matchId, teamsById, {
          onlyExisting: true,
        });
        if (livePatches.length > 0) source = 'bbc';
        // The fixtures feed carries goals + red cards but NOT yellows; the per-
        // match page has the full card list. Overlay it for in-play matches.
        matches = await overlayMatchPageCards(matches, scraped, teamsById, prevStatusById);
      } catch (liveError) {
        console.warn('BBC live overlay failed (keeping API data):', liveError);
      }
    }
  } catch (apiError) {
    console.warn('Football Data API refresh failed, falling back to BBC scraper:', apiError);
    try {
      const scraped = await fetchBbcFixtures();
      const patches = buildBbcPatches(scraped, matches);
      matches = await mergeAndWrite(matches, patches, (p) => p.matchId, teamsById, { onlyExisting: true });
      matches = await overlayMatchPageCards(matches, scraped, teamsById, prevStatusById);
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

  // Refresh team stats: the league table derived from our stored (BBC-driven)
  // match results, plus card counts from the per-player match actions. Deriving
  // the table from matches — rather than a separate football-data standings
  // feed — keeps it consistent with the scores shown everywhere else (that feed
  // lagged and could show a 2-1 win as a 1-1 draw). A full, idempotent recompute
  // written for only the teams that changed. Best-effort and independent — a
  // failure here is logged, never blocks the refresh, and never undoes the
  // score/event work above. Teams are re-read fresh so we overlay onto (not
  // clobber) any elimination flags just written.
  try {
    const cardCounts = deriveCardCounts(matches);
    const standings = computeLeagueStats(matches);
    const freshTeams = (await getAllTeams()) as unknown as Team[];
    const changedTeams = computeTeamStatUpdates(freshTeams, standings, cardCounts);
    if (changedTeams.length > 0) {
      await batchPutTeams(changedTeams as unknown as Record<string, unknown>[]);
    }
  } catch (statsError) {
    console.warn('Team stats refresh failed:', statsError);
  }

  // Mark 4th-place teams eliminated in any groups that are now complete.
  await markCompletedGroupEliminations();

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
    const merged = applyUpdate(existing, update, id);
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

/**
 * Overlay BBC per-match page cards onto matches. The scores-fixtures feed
 * carries goals + red cards but NEVER yellows; the per-match page has the full
 * card list. For each target match we pair it with the topic id from its
 * scraped fixture, fetch its page, and merge the cards into `Match.actions` —
 * which lights up the YELLOW_CARD/RED_CARD feed events (via detectEvents) and
 * the per-team card counts (via teamStats) automatically. Best-effort and
 * bounded: a per-match fetch failure is isolated and never blocks the refresh.
 *
 * Targets are LIVE matches (swept every poll while in play) *plus* any match
 * that flipped LIVE → FINISHED on this very poll — `prevStatusById` tells us
 * which. That end-of-match sweep is the one chance to capture a card shown only
 * at the final whistle: once a match is FINISHED it's no longer LIVE, so without
 * this it would never be fetched again. The just-finished poll still runs inside
 * the active window (the match was LIVE when the window was checked), so this
 * needs no change to the window logic. `mergeCardActions` is idempotent, so the
 * extra sweep can only add the missing card, never duplicate an existing one.
 */
async function overlayMatchPageCards(
  matches: Match[],
  scraped: ScrapedFixture[],
  teamsById: Map<string, Team>,
  prevStatusById: Map<string, MatchStatus>,
): Promise<Match[]> {
  // Pair each target match with the topic id from its scraped fixture (same
  // home+away+day correlation buildBbcPatches uses). Cards only happen in play,
  // so we sweep LIVE matches — plus one final sweep for a match that just
  // reached full time this poll (LIVE last poll, FINISHED now).
  const targets: { matchId: string; topicId: string }[] = [];
  for (const fixture of scraped) {
    if (!fixture.tipoTopicId) continue;
    const match = matches.find(
      (m) =>
        (m.status === 'LIVE' ||
          (m.status === 'FINISHED' && prevStatusById.get(m.matchId) !== 'FINISHED')) &&
        m.homeTeam === fixture.homeTeam &&
        m.awayTeam === fixture.awayTeam &&
        sameDay(m.datetime, fixture.datetime),
    );
    if (match) targets.push({ matchId: match.matchId, topicId: fixture.tipoTopicId });
  }
  if (targets.length === 0) return matches;

  const capped = targets.slice(0, MATCH_PAGE_FETCH_CAP);
  const results = await Promise.allSettled(capped.map((t) => fetchMatchCards(t.topicId)));

  const byId = indexById(matches);
  const patches: Partial<Match>[] = [];
  for (let i = 0; i < capped.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      console.warn(`BBC match-page fetch failed for ${capped[i].matchId}:`, result.reason);
      continue;
    }
    // An empty result means the page isn't showing cards yet (or shape drift);
    // skip rather than wipe the cards we already have.
    if (result.value.length === 0) continue;
    const existing = byId.get(capped[i].matchId);
    if (!existing) continue;
    patches.push({
      matchId: capped[i].matchId,
      actions: mergeCardActions(existing.actions ?? [], result.value),
    });
  }
  if (patches.length === 0) return matches;
  return mergeAndWrite(matches, patches, (p) => p.matchId, teamsById, { onlyExisting: true });
}

/**
 * Combine fixtures-feed actions with the per-match page's cards. The match page
 * is authoritative for cards (full yellow + red list), so we keep only the
 * fixtures-feed GOAL actions and take every card from the page — which also
 * means a red present in both sources can never double up. De-duped by the
 * shared team|type|player|minute key.
 */
function mergeCardActions(existing: MatchAction[], pageCards: MatchAction[]): MatchAction[] {
  const seen = new Set<string>();
  const merged: MatchAction[] = [];
  for (const a of [...existing.filter((x) => x.type === 'GOAL'), ...pageCards]) {
    const k = `${a.team}|${a.type}|${a.player}|${a.minute}`;
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(a);
  }
  return merged;
}

function sameDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}

const STATUS_RANK: Record<MatchStatus, number> = { SCHEDULED: 0, LIVE: 1, FINISHED: 2 };

/**
 * Merge a single update onto the existing row, guarding against a *stale*
 * source regressing live state. football-data.org's free tier keeps returning
 * pre-match data (SCHEDULED, null scores) even after a match has kicked off, so
 * a naive spread would wipe the live score/status that BBC just supplied — and
 * then re-detect a phantom kickoff on the next poll. We therefore never let a
 * known score fall back to "no data", nor a status move backwards (a match
 * can't un-kickoff or un-finish). A genuine downward score correction (VAR) is
 * still allowed: that's number → smaller number, not number → null.
 */
function applyUpdate<U extends { matchId?: string }>(
  existing: Match | undefined,
  update: U,
  id: string,
): Match {
  const merged = { ...(existing ?? {}), ...update, matchId: id } as Match;
  if (!existing) return merged;

  if (merged.homeScore == null && existing.homeScore != null) merged.homeScore = existing.homeScore;
  if (merged.awayScore == null && existing.awayScore != null) merged.awayScore = existing.awayScore;
  if (STATUS_RANK[merged.status] < STATUS_RANK[existing.status]) merged.status = existing.status;

  // Player actions (goals/cards) are cumulative within a match, so they never
  // shrink mid-play. Don't let a source that omits them (football-data) or a
  // transient empty BBC poll wipe the goals/cards we already have.
  if (
    (!merged.actions || merged.actions.length === 0) &&
    existing.actions &&
    existing.actions.length > 0
  ) {
    merged.actions = existing.actions;
  }

  return merged;
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
    existing.venue !== next.venue ||
    // The live clock advances every poll while a match is in play; treat it as
    // a change so the ticking minute is actually persisted (it carries no event).
    (existing.minute ?? null) !== (next.minute ?? null) ||
    // A new goal/card with no score change (e.g. a booking) must still persist
    // and run through detectEvents, so compare the action lists too.
    !sameActions(existing.actions, next.actions)
  );
}

/** Structural equality for two action lists (order-sensitive; BBC appends). */
function sameActions(a: MatchAction[] | undefined, b: MatchAction[] | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  if (x.length !== y.length) return false;
  return x.every(
    (action, i) =>
      action.team === y[i].team &&
      action.player === y[i].player &&
      action.type === y[i].type &&
      action.minute === y[i].minute,
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
