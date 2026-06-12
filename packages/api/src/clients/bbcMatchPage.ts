import { MatchAction, MatchActionType, teamNameToTla } from '@sweepstake/shared';
import { extractInitialData } from './bbcScraper';

const USER_AGENT = 'sweepstake-app/1.0 (+https://github.com/mmakwana/sweepstake)';
const MATCH_PAGE_BASE = 'https://www.bbc.co.uk/sport/football/live/';

// One booking on a player entry. A second yellow appears as its own entry with
// type "Yellow-Red Card"; reds are "Red Card".
interface BbcCard {
  type?: string; // "Yellow Card" | "Red Card" | "Yellow-Red Card"
  timeLabel?: { value?: string }; // clock label, e.g. "23'"
}

// A player in a lineup. `name.short` is the display form we emit ("C. Montes").
interface BbcPlayer {
  name?: { short?: string };
  cards?: BbcCard[];
}

// One side's lineup. `code` is BBC's own team code ("SA" for South Africa) —
// deliberately NOT used; we resolve the TLA from `fullName` instead.
interface TeamLineup {
  fullName?: string;
  players?: { starters?: BbcPlayer[]; substitutes?: BbcPlayer[] };
}

// The per-match page hydration blob. Same envelope as the scores-fixtures page,
// but the keyed container of interest starts with "match-lineups".
interface MatchPageData {
  data?: Record<string, { data?: { homeTeam?: TeamLineup; awayTeam?: TeamLineup } }>;
}

/**
 * Parses a BBC per-match page into card MatchActions. Pure and total — never
 * throws, returns [] for any missing/malformed input.
 *
 * BBC's scores-fixtures feed (scraped in bbcScraper.ts) only carries goals and
 * RED cards. The per-match page carries the full booking list (yellows too), in
 * a `match-lineups*` container under the same `window.__INITIAL_DATA__` blob.
 * We walk each side's starters + substitutes and emit one MatchAction per card.
 *
 * Team trap: the page's `team.code` is "SA" for South Africa, but the app uses
 * the TLA "RSA". We always resolve via `teamNameToTla(fullName)` and skip a side
 * whose name doesn't resolve, rather than emit cards for an unknown team.
 */
export function parseMatchPageCards(html: string): MatchAction[] {
  const blob = extractInitialData<MatchPageData>(html);
  if (!blob || !blob.data) return [];

  // The lineups live under a key like "match-lineups?...".
  const lineupsEntry = Object.entries(blob.data).find(([key]) =>
    key.startsWith('match-lineups'),
  );
  if (!lineupsEntry) return [];

  const lineups = lineupsEntry[1]?.data;
  if (!lineups) return [];

  // Home side first, then away, to match the fixtures scraper's ordering.
  return [
    ...extractTeamCards(lineups.homeTeam),
    ...extractTeamCards(lineups.awayTeam),
  ];
}

/**
 * Flattens one side's bookings into MatchAction[]. Resolves the side's TLA from
 * its full name (never its BBC `code`); a side that doesn't resolve is skipped.
 * Walks starters then substitutes; a card with no player name is skipped.
 */
function extractTeamCards(team: TeamLineup | undefined): MatchAction[] {
  if (!team) return [];

  const tla = teamNameToTla(team.fullName ?? '');
  if (!tla) return [];

  const players = [
    ...(team.players?.starters ?? []),
    ...(team.players?.substitutes ?? []),
  ];

  const result: MatchAction[] = [];
  for (const player of players) {
    const name = player.name?.short ?? '';
    if (!name) continue;

    for (const card of player.cards ?? []) {
      result.push({
        team: tla,
        player: name,
        type: classifyCard(card.type ?? ''),
        minute: card.timeLabel?.value ?? '',
      });
    }
  }
  return result;
}

/**
 * Maps a BBC card type to a MatchActionType. Anything mentioning "red" is a
 * RED_CARD — this covers both "Red Card" and the "Yellow-Red Card" second
 * yellow that ends in a sending-off; everything else is a YELLOW_CARD.
 */
function classifyCard(type: string): MatchActionType {
  return /red/i.test(type) ? 'RED_CARD' : 'YELLOW_CARD';
}

/**
 * Fetches a single BBC per-match page and parses its card list. Throws on a
 * non-OK response; otherwise returns the parsed cards. Resilience (retries,
 * swallowing failures) is the caller's job — this stays deliberately simple.
 */
export async function fetchMatchCards(topicId: string): Promise<MatchAction[]> {
  const response = await fetch(`${MATCH_PAGE_BASE}${topicId}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-GB,en;q=0.9',
    },
  });

  if (!response.ok) {
    throw new Error(`BBC match page fetch failed: ${response.status} ${response.statusText}`);
  }

  return parseMatchPageCards(await response.text());
}
