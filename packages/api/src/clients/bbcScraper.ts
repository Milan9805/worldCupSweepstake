import { Match, MatchAction, MatchActionType, MatchStatus, teamNameToTla } from '@sweepstake/shared';

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

interface BbcEvent {
  home?: { fullName?: string; score?: number | string | null; actions?: BbcPlayerActions[] };
  away?: { fullName?: string; score?: number | string | null; actions?: BbcPlayerActions[] };
  startDateTime?: string;
  status?: string;
  statusComment?: { value?: string };
  periodLabel?: { value?: string };
  // Some BBC payloads put scores at the top level instead of inside home/away.
  homeScore?: number | string | null;
  awayScore?: number | string | null;
  score?: { home?: number | string | null; away?: number | string | null };
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
 * Fetches both BBC fixture pages in parallel and returns parsed fixtures.
 * Throws if both pages fail or return zero parseable events.
 */
export async function fetchBbcFixtures(): Promise<ScrapedFixture[]> {
  const results = await Promise.allSettled(BBC_URLS.map(fetchAndParse));

  const fixtures: ScrapedFixture[] = [];
  const errors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      fixtures.push(...result.value);
    } else {
      const reason = result.reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      errors.push(`${BBC_URLS[i]}: ${msg}`);
    }
  }

  if (fixtures.length === 0) {
    const detail = errors.length > 0 ? errors.join('; ') : 'parsed 0 events from both pages';
    throw new Error(`BBC scraper failed: ${detail}`);
  }
  if (errors.length > 0) {
    console.warn('BBC scraper partial failure:', errors.join('; '));
  }

  // De-dupe across pages by (home, away, yyyy-mm-dd) — fixtures near month
  // boundaries can appear in both views.
  return dedupe(fixtures);
}

async function fetchAndParse(url: string): Promise<ScrapedFixture[]> {
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

  const html = await response.text();
  return parseBbcHtml(html);
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

function extractInitialData(html: string): BbcInitialData | null {
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
    return JSON.parse(inner) as BbcInitialData;
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
  };
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

    patches.push({
      matchId: match.matchId,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
      status: fixture.status,
      minute: fixture.minute,
      actions: fixture.actions,
    });
  }

  return patches;
}

function sameDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}
