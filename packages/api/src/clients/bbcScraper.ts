import {
  KnockoutFeeder,
  Match,
  MatchAction,
  MatchActionType,
  MatchStatus,
  teamNameToTla,
} from '@sweepstake/shared';

const BBC_URLS = [
  'https://www.bbc.co.uk/sport/football/world-cup/scores-fixtures/2026-06',
  'https://www.bbc.co.uk/sport/football/world-cup/scores-fixtures/2026-07',
];

const USER_AGENT = 'sweepstake-app/1.0 (+https://github.com/mmakwana/sweepstake)';

export interface ScrapedFixture {
  homeTeam: string; // TLA
  awayTeam: string; // TLA
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  datetime: string; // ISO 8601 UTC
  minute: string | null; // live clock label ("19'", "45+2'", "HT"); null unless LIVE
  // Goals + bookings, both sides flattened (home actions first, then away).
  // Always present; empty array when the event carries none.
  actions: MatchAction[];
  // BBC per-match page id (from the fixture's onward-journey link), used to
  // fetch the match page for the full card list. Absent on older snapshots.
  tipoTopicId?: string;
}

// A single inner action on a player entry: a goal, or a card of some colour.
interface BbcInnerAction {
  type?: string; // "Goal", "Red Card", "Yellow Card", "Yellow-Red Card", ...
  timeLabel?: { value?: string }; // clock label, e.g. "49'"
}

// One player's actions in an event: BBC groups by player, with an outer
// actionType ("goal" / "card" / "substitution" / ...) and an inner list.
interface BbcPlayerActions {
  playerUrn?: string;
  playerName?: string;
  actionType?: string;
  actions?: BbcInnerAction[];
}

// BBC's per-period score breakdown for a side. Each value is the CUMULATIVE
// score reached by that period (e.g. fulltime is the 90-min score, extratime
// the score after ET), and penaltyShootout is the shootout tally — a distinct
// field, so a 1-1 won 3-4 on pens reads as extratime "1" + penaltyShootout "4".
interface BbcRunningScores {
  halftime?: string | number | null;
  fulltime?: string | number | null;
  extratime?: string | number | null;
  penaltyShootout?: string | number | null;
}

interface BbcSide {
  fullName?: string;
  score?: number | string | null;
  actions?: BbcPlayerActions[];
  runningScores?: BbcRunningScores;
}

interface BbcEvent {
  home?: BbcSide;
  away?: BbcSide;
  startDateTime?: string;
  status?: string;
  statusComment?: { value?: string };
  periodLabel?: { value?: string };
  // Some BBC payloads put scores at the top level instead of inside home/away.
  homeScore?: number | string | null;
  awayScore?: number | string | null;
  score?: { home?: number | string | null; away?: number | string | null };
  // The round, e.g. "World - FIFA World Cup - Last 16" — present on knockout
  // events; we read its suffix to derive the stage.
  eventGroupingLabel?: string;
  // Link to the per-match page, e.g. "/sport/football/live/c0myn4dwvzkt"; the
  // trailing id (also exposed as tipoTopicId) keys the match-page scrape.
  onwardJourneyLink?: string;
  tipoTopicId?: string;
}

interface BbcSecondaryGroup {
  events?: BbcEvent[];
}

interface BbcEventGroup {
  secondaryGroups?: BbcSecondaryGroup[];
}

interface BbcInitialData {
  data?: Record<string, { data?: { eventGroups?: BbcEventGroup[] } }>;
}

/**
 * Fetch both BBC scores-fixtures pages in parallel, returning the HTML of those
 * that loaded. Throws only when BOTH pages fail; warns on a partial failure so a
 * single bad page still yields data.
 */
async function fetchBbcPages(): Promise<string[]> {
  const results = await Promise.allSettled(BBC_URLS.map(fetchPage));

  const htmls: string[] = [];
  const errors: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      htmls.push(result.value);
    } else {
      const reason = result.reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      errors.push(`${BBC_URLS[i]}: ${msg}`);
    }
  }

  if (htmls.length === 0) {
    throw new Error(`BBC scraper failed: ${errors.join('; ') || 'no pages fetched'}`);
  }
  if (errors.length > 0) {
    console.warn('BBC scraper partial failure:', errors.join('; '));
  }
  return htmls;
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-GB,en;q=0.9',
    },
  });

  if (!response.ok) {
    throw new Error(`BBC fetch failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

/**
 * Fetches both BBC fixture pages and returns parsed fixtures. Throws if both
 * pages fail or return zero parseable events. De-dupes across pages by (home,
 * away, yyyy-mm-dd) — fixtures near month boundaries appear in both views.
 */
export async function fetchBbcFixtures(): Promise<ScrapedFixture[]> {
  const fixtures = dedupe((await fetchBbcPages()).flatMap(parseBbcHtml));
  if (fixtures.length === 0) {
    throw new Error('BBC scraper failed: parsed 0 events from both pages');
  }
  return fixtures;
}

/**
 * Parses a BBC scores-fixtures HTML page. BBC ships the page as a SPA shell
 * but server-renders the fixture data into `window.__INITIAL_DATA__` for
 * client-side hydration. We extract that blob and walk its event tree.
 *
 * The data key follows the pattern `sport-data-scores-fixtures?...` and lives
 * under the top-level `data` map. Within it, `data.eventGroups[].secondaryGroups[].events[]`
 * lists every fixture.
 *
 * Unrecognised teams (e.g. "TBC" placeholders for unresolved knockouts) are
 * skipped rather than corrupting downstream data.
 */
export function parseBbcHtml(html: string): ScrapedFixture[] {
  const blob = extractInitialData(html);
  if (!blob || !blob.data) return [];

  const fixturesEntry = Object.entries(blob.data).find(([key]) =>
    key.startsWith('sport-data-scores-fixtures'),
  );
  if (!fixturesEntry) return [];

  const eventGroups = fixturesEntry[1]?.data?.eventGroups ?? [];
  const fixtures: ScrapedFixture[] = [];

  for (const group of eventGroups) {
    for (const sg of group.secondaryGroups ?? []) {
      for (const event of sg.events ?? []) {
        const fixture = eventToFixture(event);
        if (fixture) fixtures.push(fixture);
      }
    }
  }

  return fixtures;
}

/**
 * Decodes the `window.__INITIAL_DATA__` hydration blob BBC server-renders into
 * its sport pages. Both the scores-fixtures page and the per-match page use it
 * (with different inner shapes), so the type is a caller-supplied generic —
 * `extractInitialData<MatchPageData>(html)` from the match-page scraper, or the
 * default `BbcInitialData` here. Returns null when the blob is absent/malformed.
 */
export function extractInitialData<T = BbcInitialData>(html: string): T | null {
  const marker = 'window.__INITIAL_DATA__="';
  const start = html.indexOf(marker);
  if (start < 0) return null;

  // The value is a JSON-string-encoded JSON object. Walk forward until the
  // first unescaped closing quote.
  const valStart = start + marker.length;
  let i = valStart;
  while (i < html.length) {
    const ch = html[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '"') break;
    i++;
  }
  if (i >= html.length) return null;

  const raw = html.slice(valStart, i);
  try {
    const inner = JSON.parse(`"${raw}"`);
    return JSON.parse(inner) as T;
  } catch {
    return null;
  }
}

function eventToFixture(event: BbcEvent): ScrapedFixture | null {
  const homeName = event.home?.fullName;
  const awayName = event.away?.fullName;
  const datetime = event.startDateTime;
  if (!homeName || !awayName || !datetime) return null;

  // Skip placeholder slots (BBC uses "TBC" before knockout teams are known).
  if (homeName === 'TBC' || awayName === 'TBC') return null;

  const homeTla = teamNameToTla(homeName);
  const awayTla = teamNameToTla(awayName);
  if (!homeTla || !awayTla) return null;

  const status = mapStatus(event);

  return {
    homeTeam: homeTla,
    awayTeam: awayTla,
    homeScore: extractScore(event, 'home'),
    awayScore: extractScore(event, 'away'),
    status,
    datetime,
    // The clock is only meaningful in play; carry it solely for LIVE so a
    // SCHEDULED/FINISHED row never surfaces a stale "90+5'".
    minute: status === 'LIVE' ? extractMinute(event) : null,
    // Goals + bookings for the whole match — home side first, then away.
    actions: [
      ...extractActions(event.home?.actions, homeTla),
      ...extractActions(event.away?.actions, awayTla),
    ],
    tipoTopicId: extractTopicId(event),
  };
}

/**
 * The per-match page id, used to fetch the match page for the full card list.
 * Prefers the explicit `tipoTopicId`; falls back to the trailing id of the
 * onward-journey link (`/sport/football/live/c0myn4dwvzkt` → `c0myn4dwvzkt`).
 * Returns undefined when neither is present (e.g. the pre-tournament snapshot).
 */
function extractTopicId(event: BbcEvent): string | undefined {
  if (event.tipoTopicId) return event.tipoTopicId;
  const match = /\/live\/([a-z0-9]+)/i.exec(event.onwardJourneyLink ?? '');
  return match ? match[1] : undefined;
}

/**
 * Flattens one side's per-player action list into MatchAction[]. BBC nests
 * actions as `[{ playerName, actionType, actions: [{ type, timeLabel }] }]`,
 * grouping multiple events for the same player; we emit one MatchAction per
 * inner action. `team` is the resolved TLA for whichever side these came from.
 *
 * Classification:
 *   actionType "card" → RED_CARD if the inner type mentions "red" (covers the
 *     "Yellow-Red Card" second-yellow sending-off), otherwise YELLOW_CARD.
 *   actionType "goal" → GOAL.
 *   anything else (substitution, ...) is skipped.
 *
 * Entries with no player name, or where the side TLA is unknown, are skipped.
 */
function extractActions(players: BbcPlayerActions[] | undefined, team: string): MatchAction[] {
  if (!players || !team) return [];

  const result: MatchAction[] = [];
  for (const player of players) {
    const name = player.playerName?.trim();
    if (!name) continue;

    for (const inner of player.actions ?? []) {
      const type = classifyAction(player.actionType, inner.type);
      if (!type) continue;
      result.push({ team, player: name, type, minute: inner.timeLabel?.value ?? '' });
    }
  }
  return result;
}

function classifyAction(
  actionType: string | undefined,
  innerType: string | undefined,
): MatchActionType | null {
  if (actionType === 'card') {
    return /red/i.test(innerType ?? '') ? 'RED_CARD' : 'YELLOW_CARD';
  }
  if (actionType === 'goal') return 'GOAL';
  return null;
}

/**
 * The live clock label as BBC presents it — "19'", "45+2'", "HT" — taken from
 * statusComment (where the running time lives) and falling back to periodLabel.
 * Returned verbatim so the UI can show exactly what a viewer expects.
 */
function extractMinute(event: BbcEvent): string | null {
  const label = (event.statusComment?.value ?? event.periodLabel?.value ?? '').trim();
  return label.length > 0 ? label : null;
}

function extractScore(event: BbcEvent, side: 'home' | 'away'): number | null {
  const sources: unknown[] = [
    event[side]?.score,
    event.score?.[side],
    side === 'home' ? event.homeScore : event.awayScore,
  ];
  for (const candidate of sources) {
    const parsed = toNumberOrNull(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapStatus(event: BbcEvent): MatchStatus {
  const raw = (event.status ?? '').toLowerCase();
  const comment = (event.statusComment?.value ?? '').toLowerCase();

  // BBC's status lifecycle (confirmed against live data 2026-06-11): a match
  // moves PreEvent → MidEvent (in play, *including* half-time) → PostEvent.
  // The running clock lives in statusComment: "19'", "45+2'", "HT" at the
  // break, "FT" at the end. We key off `status` first and fall back to the
  // comment so an unfamiliar status value still resolves correctly.
  //
  // Order matters: test FINISHED before LIVE so "FT" wins over a stray digit.
  if (raw === 'postevent' || /full[- ]?time|finished|final|\bft\b/.test(comment)) {
    return 'FINISHED';
  }
  if (
    raw === 'midevent' ||
    raw === 'inprogress' ||
    raw === 'live' ||
    /\bht\b|half[- ]?time|in[- ]?play|\blive\b|\d+\s*'/.test(comment)
  ) {
    return 'LIVE';
  }
  if (raw === 'preevent' || comment === 'scheduled') return 'SCHEDULED';
  return 'SCHEDULED';
}

function dedupe(fixtures: ScrapedFixture[]): ScrapedFixture[] {
  const seen = new Map<string, ScrapedFixture>();
  for (const f of fixtures) {
    const key = `${f.homeTeam}-${f.awayTeam}-${f.datetime.slice(0, 10)}`;
    // If a fixture appears in both pages, prefer the one with more info
    // (non-null score over null score).
    const existing = seen.get(key);
    if (!existing || (f.homeScore !== null && existing.homeScore === null)) {
      seen.set(key, f);
    }
  }
  return Array.from(seen.values());
}

/**
 * Convert scraped fixtures into `Partial<Match>` patches that only touch
 * volatile fields (score, status, live minute). Stage, group, datetime, venue
 * are preserved from whatever the API previously wrote.
 *
 * Fixtures with no matching existing row are dropped (per the API-first
 * lifecycle: BBC never creates rows).
 */
export function buildBbcPatches(
  scraped: ScrapedFixture[],
  existing: Match[],
): Partial<Match>[] {
  const patches: Partial<Match>[] = [];

  for (const fixture of scraped) {
    const match = existing.find(
      (m) =>
        m.homeTeam === fixture.homeTeam &&
        m.awayTeam === fixture.awayTeam &&
        sameDay(m.datetime, fixture.datetime),
    );
    if (!match) continue;

    const isKnockout = match.stage !== 'GROUP_STAGE';

    // Leave an already-finished knockout alone: its result (on-pitch score +
    // shootout tally) was settled by buildBbcKnockoutPatches or football-data,
    // and this flat-scoreline path can't tell a 1-1 draw from a 1-1 won on pens.
    if (isKnockout && match.status === 'FINISHED') continue;

    // This flat-fixture path can't see the shootout tally, so it must not finish
    // a knockout: BBC can show FINISHED at the end of normal time, before extra
    // time / penalties, and applyUpdate's no-regression guard would LOCK that in.
    // Hold a knockout LIVE here; buildBbcKnockoutPatches (which reads the split
    // runningScores) is what finalises it once it's truly decided. Group-stage
    // matches (no ET/pens) keep BBC's status as-is.
    const status =
      isKnockout && fixture.status === 'FINISHED' ? 'LIVE' : fixture.status;

    patches.push({
      matchId: match.matchId,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
      status,
      minute: fixture.minute,
      actions: fixture.actions,
    });
  }

  return patches;
}

function sameDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}

// ===== Knockout bracket =====
//
// BBC's scores-fixtures feed carries the full knockout bracket, which we read as
// the authoritative structure (football-data's free tier lags and the old
// position-by-kickoff guess paired the wrong teams). Each knockout event gives:
//   - the round, via `eventGroupingLabel` ("... - Last 16");
//   - both sides, either a resolved team or an unresolved feeder placeholder
//     ("Winner Match 77", "Loser Semi-final 2") that names the tie it comes from;
//   - the on-pitch score and the penalty shootout tally, split cleanly in
//     `runningScores` (so BBC — not just football-data — can settle a shootout).

// One knockout tie as BBC presents it. A side is a resolved team TLA, or null
// with a feeder set when it's still a "Winner Match N" placeholder (or null on
// both when BBC shows a bare "TBC").
export interface ScrapedKnockoutTie {
  stage: string; // ROUND_OF_32 | ROUND_OF_16 | QUARTER_FINAL | SEMI_FINAL | THIRD_PLACE | FINAL
  datetime: string;
  homeTeam: string | null;
  awayTeam: string | null;
  homeFeeder: KnockoutFeeder | null;
  awayFeeder: KnockoutFeeder | null;
  homeScore: number | null; // on-pitch: regulation + extra time, excluding pens
  awayScore: number | null;
  penaltyHome: number | null;
  penaltyAway: number | null;
  status: MatchStatus;
  minute: string | null;
  tipoTopicId?: string;
}

// BBC round label (the suffix of eventGroupingLabel) → our stage code.
const BBC_ROUND_TO_STAGE: Record<string, string> = {
  'Last 32': 'ROUND_OF_32',
  'Last 16': 'ROUND_OF_16',
  'Quarter-finals': 'QUARTER_FINAL',
  'Semi-finals': 'SEMI_FINAL',
  '3rd Place Final': 'THIRD_PLACE',
  Final: 'FINAL',
};

function stageFromGroupingLabel(label: string | undefined): string | null {
  if (!label) return null;
  const suffix = label.split(' - ').pop()?.trim() ?? '';
  return BBC_ROUND_TO_STAGE[suffix] ?? null;
}

const FEEDER_ROUND: Record<string, KnockoutFeeder['feederRound']> = {
  match: 'MATCH',
  'quarter-final': 'QUARTER_FINAL',
  'semi-final': 'SEMI_FINAL',
};

// Parse a feeder placeholder name ("Winner Match 77", "Loser Semi-final 2") into
// a structured reference, or null when the name isn't a placeholder.
function parseFeeder(name: string): KnockoutFeeder | null {
  const m = /^(winner|loser)\s+(match|quarter-final|semi-final)\s+(\d+)$/i.exec(name.trim());
  if (!m) return null;
  return {
    outcome: m[1].toLowerCase() === 'winner' ? 'WINNER' : 'LOSER',
    feederRound: FEEDER_ROUND[m[2].toLowerCase()],
    feederNumber: Number(m[3]),
  };
}

// Resolve one side of a tie: a real team (TLA) when the name maps to one,
// otherwise a feeder placeholder, otherwise neither (a bare "TBC").
function resolveKnockoutSide(name: string | undefined): {
  team: string | null;
  feeder: KnockoutFeeder | null;
} {
  if (!name) return { team: null, feeder: null };
  const tla = teamNameToTla(name);
  if (tla) return { team: tla, feeder: null };
  return { team: null, feeder: parseFeeder(name) };
}

// On-pitch score for a side: the score after extra time, else full time, taken
// from runningScores (which splits the shootout out into its own field), falling
// back to the flat score for a plain fixture without a runningScores breakdown.
function onPitchScore(side: BbcSide | undefined): number | null {
  const rs = side?.runningScores;
  if (rs) {
    const onPitch = toNumberOrNull(rs.extratime ?? rs.fulltime);
    if (onPitch !== null) return onPitch;
  }
  return toNumberOrNull(side?.score);
}

function penaltyTally(side: BbcSide | undefined): number | null {
  return toNumberOrNull(side?.runningScores?.penaltyShootout);
}

function eventToKnockoutTie(event: BbcEvent): ScrapedKnockoutTie | null {
  const stage = stageFromGroupingLabel(event.eventGroupingLabel);
  if (!stage) return null; // group-stage (or unrecognised) event — not a tie here
  const datetime = event.startDateTime;
  if (!datetime) return null;

  const home = resolveKnockoutSide(event.home?.fullName);
  const away = resolveKnockoutSide(event.away?.fullName);
  const status = mapStatus(event);

  return {
    stage,
    datetime,
    homeTeam: home.team,
    awayTeam: away.team,
    homeFeeder: home.feeder,
    awayFeeder: away.feeder,
    homeScore: onPitchScore(event.home),
    awayScore: onPitchScore(event.away),
    penaltyHome: penaltyTally(event.home),
    penaltyAway: penaltyTally(event.away),
    status,
    minute: status === 'LIVE' ? extractMinute(event) : null,
    tipoTopicId: extractTopicId(event),
  };
}

/**
 * Parse the knockout ties from a BBC scores-fixtures page. Walks the same
 * `window.__INITIAL_DATA__` event tree as `parseBbcHtml`, but keeps only events
 * whose round resolves to a knockout stage and returns the richer tie shape
 * (feeders + shootout tally). Pure and total — returns [] for missing/malformed
 * input. Group-stage events are skipped (no eventGroupingLabel round match).
 */
export function parseBbcKnockoutTies(html: string): ScrapedKnockoutTie[] {
  const blob = extractInitialData(html);
  if (!blob || !blob.data) return [];

  const fixturesEntry = Object.entries(blob.data).find(([key]) =>
    key.startsWith('sport-data-scores-fixtures'),
  );
  if (!fixturesEntry) return [];

  const eventGroups = fixturesEntry[1]?.data?.eventGroups ?? [];
  const ties: ScrapedKnockoutTie[] = [];

  for (const group of eventGroups) {
    for (const sg of group.secondaryGroups ?? []) {
      for (const event of sg.events ?? []) {
        const tie = eventToKnockoutTie(event);
        if (tie) ties.push(tie);
      }
    }
  }

  return ties;
}

// De-dupe knockout ties across the two month pages (a tie near a month boundary
// can appear in both). Keyed by the per-match topic id, falling back to round +
// kickoff; prefers the more-resolved / scored copy.
function dedupeKnockout(ties: ScrapedKnockoutTie[]): ScrapedKnockoutTie[] {
  const seen = new Map<string, ScrapedKnockoutTie>();
  for (const tie of ties) {
    const key = tie.tipoTopicId ?? `${tie.stage}-${tie.datetime}`;
    const existing = seen.get(key);
    const moreResolved = !!existing && !existing.homeTeam && !!tie.homeTeam;
    const moreScored = !!existing && existing.homeScore === null && tie.homeScore !== null;
    if (!existing || moreResolved || moreScored) seen.set(key, tie);
  }
  return Array.from(seen.values());
}

// Correlate a BBC knockout tie to a stored Match row. Prefers a resolved team
// (unique within a round), falling back to round + kickoff time for an
// all-placeholder future tie. Returns null when no row matches.
function findMatchForTie(tie: ScrapedKnockoutTie, existing: Match[]): Match | null {
  // A tie that names a team correlates on that team alone (unique within a
  // round); if no row carries it, it's a tie we don't track — don't fall back to
  // the kickoff slot, or we'd patch the wrong row that merely shares a kickoff.
  const knownTeam = tie.homeTeam ?? tie.awayTeam;
  if (knownTeam) {
    return (
      existing.find(
        (m) => m.stage === tie.stage && (m.homeTeam === knownTeam || m.awayTeam === knownTeam),
      ) ?? null
    );
  }
  // An all-placeholder future tie has no team to anchor on, so correlate by
  // round + kickoff time (a fixture's stage+kickoff is unique).
  const tieTime = new Date(tie.datetime).getTime();
  return (
    existing.find((m) => m.stage === tie.stage && new Date(m.datetime).getTime() === tieTime) ??
    null
  );
}

/**
 * Build Match patches from BBC's knockout ties: the feeder labels for an
 * unresolved opponent, plus — the moment BBC reports a decided result — the
 * finished status, on-pitch score and shootout tally, so the bracket advances
 * without waiting on football-data. "Decided" means FINISHED with either a
 * winner on the pitch or a shootout tally; a tie still level with no shootout is
 * left unfinalised (we never end a draw), preserving the guard that a knockout
 * only finishes once it's truly settled. Patches existing rows only.
 */
export function buildBbcKnockoutPatches(
  ties: ScrapedKnockoutTie[],
  existing: Match[],
): Partial<Match>[] {
  const patches: Partial<Match>[] = [];

  for (const tie of ties) {
    const match = findMatchForTie(tie, existing);
    if (!match) continue;

    const patch: Partial<Match> = {
      matchId: match.matchId,
      homeFeeder: tie.homeFeeder,
      awayFeeder: tie.awayFeeder,
    };

    const hasShootout = tie.penaltyHome != null && tie.penaltyAway != null;
    const decisiveOnPitch =
      tie.homeScore != null && tie.awayScore != null && tie.homeScore !== tie.awayScore;

    if (tie.status === 'FINISHED' && (decisiveOnPitch || hasShootout)) {
      patch.status = 'FINISHED';
      patch.homeScore = tie.homeScore;
      patch.awayScore = tie.awayScore;
      patch.penaltyHome = tie.penaltyHome;
      patch.penaltyAway = tie.penaltyAway;
    }

    patches.push(patch);
  }

  return patches;
}

export interface BbcScrapeResult {
  fixtures: ScrapedFixture[];
  knockout: ScrapedKnockoutTie[];
}

/**
 * Fetch both BBC pages ONCE and parse both views: the score fixtures (for live
 * group/knockout overlays) and the richer knockout ties (matchups, feeders,
 * shootout tally), so a refresh hits BBC a single time. Throws if both pages
 * fail; an empty fixtures parse is not fatal here (the knockout view may still
 * carry data, and the caller treats missing data as "no change").
 */
export async function fetchBbcData(): Promise<BbcScrapeResult> {
  const htmls = await fetchBbcPages();
  return {
    fixtures: dedupe(htmls.flatMap(parseBbcHtml)),
    knockout: dedupeKnockout(htmls.flatMap(parseBbcKnockoutTies)),
  };
}
