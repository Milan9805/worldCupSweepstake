import * as fs from 'fs';
import * as path from 'path';
import {
  parseTvHtml,
  buildChannelPatches,
  fetchTvListings,
  ScrapedTvListing,
} from '../../clients/footballTvScraper';
import { Match } from '@sweepstake/shared';

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/footballontv-sample.html');
const html = fs.readFileSync(FIXTURE_PATH, 'utf8');

/** Wraps fixture fragments in the page's date-header + fixture markup. */
function makeHtml(dateHeader: string, fixtures: string): string {
  return `<div class="fixture-date">${dateHeader}</div>${fixtures}`;
}

function makeFixture(opts: {
  time?: string;
  teams: string;
  competition?: string;
  channels?: string[];
}): string {
  const channels = (opts.channels ?? [])
    .map(
      (c) =>
        `<span class="channel-pill" style="background-color: #000;border: 0;color: rgba(255, 255, 255, 1.0);">${c}</span>`,
    )
    .join('');
  return (
    `<div class="fixture__time">${opts.time ?? '20:00'}</div>` +
    `<div class="fixture__teams">${opts.teams}</div>` +
    `<div class="fixture__competition">${opts.competition ?? 'FIFA World Cup 2026&nbsp;Group A'}</div>` +
    `<div class="fixture__channel"><div class="span3 channels">${channels}</div></div>`
  );
}

describe('parseTvHtml (real snapshot)', () => {
  const listings = parseTvHtml(html);

  it('parses the group-stage listings and resolves both teams to TLAs', () => {
    // The snapshot ships 104 fixtures; group-stage rows resolve, knockout "TBC"
    // placeholders are skipped.
    expect(listings.length).toBeGreaterThanOrEqual(70);
    expect(listings.length).toBeLessThanOrEqual(104);
    for (const l of listings) {
      expect(l.homeTeam).toMatch(/^[A-Z]{3}$/);
      expect(l.awayTeam).toMatch(/^[A-Z]{3}$/);
      expect(l.channels.length).toBeGreaterThan(0);
      expect(l.channels.every((c) => typeof c.name === 'string' && c.name.length > 0)).toBe(true);
    }
  });

  it('spot-checks the opener fixture and its channels with scraped colours', () => {
    const opener = listings.find((l) => l.homeTeam === 'MEX' && l.awayTeam === 'RSA');
    expect(opener).toBeDefined();
    expect(opener?.date).toBe('2026-06-11');
    expect(opener?.channels.map((c) => c.name)).toEqual(['ITV1', 'STV', 'ITVX', 'STV Player']);
    // Brand colours captured verbatim from the source markup.
    expect(opener?.channels[0]).toEqual({
      name: 'ITV1',
      bg: '#127b60',
      fg: 'rgba(255, 255, 255, 1.0)',
    });
    expect(opener?.channels[2]).toEqual({
      name: 'ITVX',
      bg: '#102c3e',
      fg: 'rgba(222, 235, 82, 1.0)',
    });
  });

  it('skips knockout placeholders (TBC teams)', () => {
    for (const l of listings) {
      expect(l.homeTeam).not.toBe('TBC');
      expect(l.awayTeam).not.toBe('TBC');
    }
  });
});

describe('parseTvHtml date parsing', () => {
  it.each([
    ['Sunday 1st June 2026', '2026-06-01'],
    ['Tuesday 2nd June 2026', '2026-06-02'],
    ['Wednesday 3rd June 2026', '2026-06-03'],
    ['Thursday 11th June 2026', '2026-06-11'],
    ['Saturday 4th July 2026', '2026-07-04'],
  ])('parses "%s" → %s', (header, expected) => {
    const out = parseTvHtml(makeHtml(header, makeFixture({ teams: 'Mexico v South Africa' })));
    expect(out[0].date).toBe(expected);
  });

  it('ignores fixtures before any date header is seen', () => {
    const out = parseTvHtml(makeFixture({ teams: 'Mexico v South Africa' }));
    expect(out).toEqual([]);
  });

  it('skips a fixture whose date header is unparseable', () => {
    const out = parseTvHtml(makeHtml('Date TBC', makeFixture({ teams: 'Mexico v South Africa' })));
    expect(out).toEqual([]);
  });

  it('skips a date header with an unknown month name', () => {
    const out = parseTvHtml(
      makeHtml('Monday 1st Smarch 2026', makeFixture({ teams: 'Mexico v South Africa' })),
    );
    expect(out).toEqual([]);
  });
});

describe('parseTvHtml filtering and decoding', () => {
  it('keeps only World Cup competition rows', () => {
    const out = parseTvHtml(
      makeHtml(
        'Thursday 11th June 2026',
        makeFixture({ teams: 'Brazil v Spain', competition: 'Premier League' }) +
          makeFixture({ teams: 'Mexico v South Africa' }),
      ),
    );
    expect(out).toHaveLength(1);
    expect(out[0].homeTeam).toBe('MEX');
  });

  it('skips fixtures where a team does not map to a TLA', () => {
    const out = parseTvHtml(
      makeHtml('Thursday 11th June 2026', makeFixture({ teams: 'Atlantis v Mexico' })),
    );
    expect(out).toEqual([]);
  });

  it('skips TBC placeholder fixtures', () => {
    const out = parseTvHtml(
      makeHtml('Thursday 11th June 2026', makeFixture({ teams: 'TBC v TBC' })),
    );
    expect(out).toEqual([]);
  });

  it('skips a fixture whose teams string is not a pair', () => {
    const out = parseTvHtml(
      makeHtml('Thursday 11th June 2026', makeFixture({ teams: 'Mexico' })),
    );
    expect(out).toEqual([]);
  });

  it('decodes entities in team names and resolves aliases', () => {
    const out = parseTvHtml(
      makeHtml('Thursday 11th June 2026', makeFixture({ teams: 'Bosnia &amp; Herzegovina v Canada' })),
    );
    expect(out).toHaveLength(1);
    expect(out[0].homeTeam).toBe('BIH');
    expect(out[0].awayTeam).toBe('CAN');
  });

  it('dedupes repeated channels within a fixture', () => {
    const out = parseTvHtml(
      makeHtml(
        'Thursday 11th June 2026',
        makeFixture({ teams: 'Mexico v South Africa', channels: ['ITV1', 'ITV1', 'STV'] }),
      ),
    );
    expect(out[0].channels.map((c) => c.name)).toEqual(['ITV1', 'STV']);
  });

  it('returns an empty channel list when a fixture has no pills', () => {
    const out = parseTvHtml(
      makeHtml('Thursday 11th June 2026', makeFixture({ teams: 'Mexico v South Africa', channels: [] })),
    );
    expect(out[0].channels).toEqual([]);
  });

  it('captures each pill’s brand colours and ignores background-color when reading the text colour', () => {
    const fixture =
      `<div class="fixture__time">20:00</div>` +
      `<div class="fixture__teams">Mexico v South Africa</div>` +
      `<div class="fixture__competition">FIFA World Cup 2026 Group A</div>` +
      `<div class="fixture__channel"><div class="span3 channels">` +
      `<span class="channel-pill" style="background-color: #127b60;border: 0;color: rgba(255, 255, 255, 1.0);">ITV1</span>` +
      `<span class="channel-pill">No Style</span>` +
      `</div></div>`;
    const out = parseTvHtml(makeHtml('Thursday 11th June 2026', fixture));
    expect(out[0].channels).toEqual([
      { name: 'ITV1', bg: '#127b60', fg: 'rgba(255, 255, 255, 1.0)' },
      { name: 'No Style', bg: '', fg: '' },
    ]);
  });
});

describe('parseTvHtml edge cases', () => {
  it('returns [] for HTML with no fixtures', () => {
    expect(parseTvHtml('<html><body><p>nothing here</p></body></html>')).toEqual([]);
  });

  it('returns [] for empty input', () => {
    expect(parseTvHtml('')).toEqual([]);
  });
});

describe('buildChannelPatches', () => {
  const existing: Match[] = [
    {
      matchId: 'm-mex-rsa',
      homeTeam: 'MEX',
      awayTeam: 'RSA',
      homeScore: null,
      awayScore: null,
      status: 'SCHEDULED',
      stage: 'GROUP_STAGE',
      group: 'A',
      datetime: '2026-06-11T19:00:00Z',
      venue: 'Estadio Azteca',
    },
  ];

  const ITV1 = { name: 'ITV1', bg: '#127b60', fg: 'rgba(255, 255, 255, 1.0)' };

  const listing = (over: Partial<ScrapedTvListing>): ScrapedTvListing => ({
    homeTeam: 'MEX',
    awayTeam: 'RSA',
    date: '2026-06-11',
    channels: [ITV1],
    ...over,
  });

  it('produces a channels patch for a matching row', () => {
    const patches = buildChannelPatches([listing({})], existing);
    expect(patches).toEqual([{ matchId: 'm-mex-rsa', channels: [ITV1] }]);
  });

  it('matches regardless of home/away ordering', () => {
    const patches = buildChannelPatches([listing({ homeTeam: 'RSA', awayTeam: 'MEX' })], existing);
    expect(patches).toEqual([{ matchId: 'm-mex-rsa', channels: [ITV1] }]);
  });

  it('drops listings with no matching row', () => {
    const patches = buildChannelPatches([listing({ homeTeam: 'FRA', awayTeam: 'BRA' })], existing);
    expect(patches).toEqual([]);
  });

  it('breaks ties between same-pair rows using the scraped date', () => {
    const twoLegs: Match[] = [
      { ...existing[0], matchId: 'm-day1', datetime: '2026-06-11T19:00:00Z' },
      { ...existing[0], matchId: 'm-day2', datetime: '2026-06-18T19:00:00Z' },
    ];
    const patches = buildChannelPatches([listing({ date: '2026-06-18' })], twoLegs);
    expect(patches).toEqual([{ matchId: 'm-day2', channels: [ITV1] }]);
  });

  it('falls back to the first candidate when no same-pair row matches the date', () => {
    const twoLegs: Match[] = [
      { ...existing[0], matchId: 'm-day1', datetime: '2026-06-11T19:00:00Z' },
      { ...existing[0], matchId: 'm-day2', datetime: '2026-06-18T19:00:00Z' },
    ];
    const patches = buildChannelPatches([listing({ date: '2026-07-01' })], twoLegs);
    expect(patches).toEqual([{ matchId: 'm-day1', channels: [ITV1] }]);
  });
});

describe('fetchTvListings', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('fetches and parses the page', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => html });
    global.fetch = fetchMock as never;

    const listings = await fetchTvListings();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(listings.length).toBe(parseTvHtml(html).length);
  });

  it('throws on a non-OK response', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });
    global.fetch = fetchMock as never;

    await expect(fetchTvListings()).rejects.toThrow(/Football-on-TV fetch failed/);
  });

  it('throws when the page parses to zero listings', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: async () => '<html><body>no data</body></html>' });
    global.fetch = fetchMock as never;

    await expect(fetchTvListings()).rejects.toThrow(/parsed 0 listings/);
  });
});
