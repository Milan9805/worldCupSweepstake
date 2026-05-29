import { Match, ChannelBroadcast, teamNameToTla } from '@sweepstake/shared';

const TV_URL = 'https://www.live-footballontv.com/live-world-cup-football-on-tv.html';

const USER_AGENT = 'sweepstake-app/1.0 (+https://github.com/mmakwana/sweepstake)';

export interface ScrapedTvListing {
  homeTeam: string; // TLA
  awayTeam: string; // TLA
  date: string; // yyyy-mm-dd (UK local day from the date header)
  channels: ChannelBroadcast[];
}

/**
 * Fetches the live-footballontv.com World Cup page and returns parsed listings.
 * Throws on a non-OK response or when zero listings parse (so the caller can
 * treat it as a failed scrape and carry on).
 */
export async function fetchTvListings(): Promise<ScrapedTvListing[]> {
  const response = await fetch(TV_URL, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-GB,en;q=0.9',
    },
  });

  if (!response.ok) {
    throw new Error(`Football-on-TV fetch failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const listings = parseTvHtml(html);
  if (listings.length === 0) {
    throw new Error('Football-on-TV scraper parsed 0 listings');
  }
  return listings;
}

/**
 * Parses a live-footballontv.com page. The site server-renders fixtures as a
 * flat list of sibling `<div>`s: a `fixture-date` header sets the current day,
 * then each `fixture` block carries the time, teams, competition, and a set of
 * `channel-pill` spans.
 *
 * We scan tokens in document order so each fixture inherits the most recent
 * date header. Rows whose competition isn't a World Cup, or whose teams don't
 * map to a known TLA (including "TBC" placeholders), are skipped.
 */
export function parseTvHtml(html: string): ScrapedTvListing[] {
  // Alternation: either a date header, or a fixture (anchored on fixture__time
  // so we don't depend on the outer `fixture` container's closing tags).
  const tokenRe =
    /<div class="fixture-date">(.*?)<\/div>|<div class="fixture__time">(.*?)<\/div><div class="fixture__teams">(.*?)<\/div><div class="fixture__competition">(.*?)<\/div><div class="fixture__channel">(.*?)<\/div><\/div>/gs;

  const listings: ScrapedTvListing[] = [];
  let currentDate: string | null = null;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(html)) !== null) {
    const [, dateHeader, , teamsRaw, competitionRaw, channelBlock] = match;

    if (dateHeader !== undefined) {
      currentDate = parseDateHeader(dateHeader);
      continue;
    }

    if (!currentDate) continue;

    const competition = decodeEntities(competitionRaw);
    if (!/world cup/i.test(competition)) continue;

    const teams = splitTeams(teamsRaw);
    if (!teams) continue;

    const homeTla = teamNameToTla(teams.home);
    const awayTla = teamNameToTla(teams.away);
    if (!homeTla || !awayTla) continue;

    listings.push({
      homeTeam: homeTla,
      awayTeam: awayTla,
      date: currentDate,
      channels: extractChannels(channelBlock),
    });
  }

  return listings;
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** "Thursday 11th June 2026" -> "2026-06-11". Returns null if unparseable. */
function parseDateHeader(raw: string): string | null {
  const text = decodeEntities(raw);
  const m = text.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;

  const day = parseInt(m[1], 10);
  const monthIndex = MONTHS.indexOf(m[2].toLowerCase());
  const year = parseInt(m[3], 10);
  if (monthIndex < 0) return null;

  const mm = String(monthIndex + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** "Mexico v South Africa" -> { home, away }. Returns null if not two teams. */
function splitTeams(raw: string): { home: string; away: string } | null {
  const text = decodeEntities(raw).trim();
  const parts = text.split(/\s+v\s+/);
  if (parts.length !== 2) return null;

  const home = parts[0].trim();
  const away = parts[1].trim();
  if (!home || !away || home === 'TBC' || away === 'TBC') return null;
  return { home, away };
}

function extractChannels(block: string): ChannelBroadcast[] {
  // Capture the span's attributes (for the inline style) and its text. The
  // source styles each pill with the broadcaster's brand colours, which we
  // store verbatim so the UI doesn't need a hardcoded colour map.
  const pillRe = /<span class="channel-pill"([^>]*)>(.*?)<\/span>/gs;
  const channels: ChannelBroadcast[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;

  while ((m = pillRe.exec(block)) !== null) {
    const name = decodeEntities(m[2]).trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      const { bg, fg } = parseChannelColours(m[1]);
      channels.push({ name, bg, fg });
    }
  }

  return channels;
}

function parseChannelColours(attributes: string): { bg: string; fg: string } {
  const bg = attributes.match(/background-color:\s*([^;"]+)/i);
  // `color:` not preceded by a hyphen, so we don't match `background-color`.
  const fg = attributes.match(/(?<!-)color:\s*([^;"]+)/i);
  return {
    bg: bg ? bg[1].trim() : '',
    fg: fg ? fg[1].trim() : '',
  };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

/**
 * Convert scraped listings into `Partial<Match>` patches that set the `channels`
 * field on existing matches. Matching is by the unordered team pair (robust to
 * home/away ordering differing between sources, and unique per tournament); the
 * scraped date breaks ties if a pair somehow matches more than one row.
 *
 * Listings with no matching existing row are dropped (the scraper never creates
 * rows, mirroring the BBC fallback's lifecycle constraint).
 */
export function buildChannelPatches(
  scraped: ScrapedTvListing[],
  existing: Match[],
): Partial<Match>[] {
  const patches: Partial<Match>[] = [];

  for (const listing of scraped) {
    const candidates = existing.filter((m) => samePair(m, listing));
    if (candidates.length === 0) continue;

    const target =
      candidates.length === 1
        ? candidates[0]
        : (candidates.find((m) => m.datetime.slice(0, 10) === listing.date) ?? candidates[0]);

    patches.push({ matchId: target.matchId, channels: listing.channels });
  }

  return patches;
}

function samePair(match: Match, listing: ScrapedTvListing): boolean {
  const a = [match.homeTeam, match.awayTeam].sort();
  const b = [listing.homeTeam, listing.awayTeam].sort();
  return a[0] === b[0] && a[1] === b[1];
}
