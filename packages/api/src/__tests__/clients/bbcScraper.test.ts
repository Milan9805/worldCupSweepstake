import * as fs from 'fs';
import * as path from 'path';
import { parseBbcHtml, buildBbcPatches, fetchBbcFixtures } from '../../clients/bbcScraper';
import { Match } from '@sweepstake/shared';

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/bbc-sample.html');
const html = fs.readFileSync(FIXTURE_PATH, 'utf8');

describe('parseBbcHtml (real BBC snapshot)', () => {
  const fixtures = parseBbcHtml(html);

  it('extracts every group-stage fixture in the snapshot', () => {
    // The June 2026 snapshot ships 78 events: 72 group-stage + 6 Last-32
    // placeholders (where both teams are "TBC"). We expect to keep only the
    // group-stage ones, since TBC placeholders are skipped.
    expect(fixtures.length).toBeGreaterThanOrEqual(60);
    expect(fixtures.length).toBeLessThanOrEqual(72);
  });

  it('maps team full names to TLAs', () => {
    const pairs = fixtures.map((f) => `${f.homeTeam}-${f.awayTeam}`);
    // Spot-check a known opener (Mexico v South Africa, Group A, 11 June).
    expect(pairs).toContain('MEX-RSA');
  });

  it('captures ISO startDateTime verbatim', () => {
    const opener = fixtures.find((f) => f.homeTeam === 'MEX' && f.awayTeam === 'RSA');
    expect(opener?.datetime).toBe('2026-06-11T19:00:00Z');
  });

  it('marks every pre-tournament event as SCHEDULED with null scores', () => {
    for (const f of fixtures) {
      expect(f.status).toBe('SCHEDULED');
      expect(f.homeScore).toBeNull();
      expect(f.awayScore).toBeNull();
    }
  });

  it('skips fixtures where either team is TBC', () => {
    // The snapshot includes "Last 32" rows whose teams are both "TBC".
    // None of those should appear.
    for (const f of fixtures) {
      expect(f.homeTeam).not.toBe('TBC');
      expect(f.awayTeam).not.toBe('TBC');
    }
  });

  it('every produced fixture has a valid TLA on both sides', () => {
    for (const f of fixtures) {
      expect(f.homeTeam).toMatch(/^[A-Z]{3}$/);
      expect(f.awayTeam).toMatch(/^[A-Z]{3}$/);
    }
  });
});

describe('parseBbcHtml (status mapping for not-yet-observed states)', () => {
  function makeHtmlWith(event: Record<string, unknown>): string {
    const data = {
      data: {
        'sport-data-scores-fixtures?x=1': {
          data: {
            eventGroups: [{ secondaryGroups: [{ events: [event] }] }],
          },
        },
      },
    };
    const inner = JSON.stringify(data);
    const outer = JSON.stringify(inner);
    return `<html><body><script>window.__INITIAL_DATA__=${outer};</script></body></html>`;
  }

  it('maps PostEvent → FINISHED with scores from home.score / away.score', () => {
    const html = makeHtmlWith({
      home: { fullName: 'England', score: 2 },
      away: { fullName: 'Brazil', score: 1 },
      startDateTime: '2026-06-15T19:00:00Z',
      status: 'PostEvent',
      statusComment: { value: 'Full Time' },
    });
    const [f] = parseBbcHtml(html);
    expect(f.homeTeam).toBe('ENG');
    expect(f.awayTeam).toBe('BRA');
    expect(f.homeScore).toBe(2);
    expect(f.awayScore).toBe(1);
    expect(f.status).toBe('FINISHED');
  });

  it('maps MidEvent (with a running clock) → LIVE', () => {
    // Confirmed against live World Cup data: BBC uses status "MidEvent" and a
    // minute clock in statusComment ("19'") while a match is in play.
    const html = makeHtmlWith({
      home: { fullName: 'Mexico', score: 1 },
      away: { fullName: 'South Africa', score: 0 },
      startDateTime: '2026-06-11T19:00:00Z',
      status: 'MidEvent',
      statusComment: { value: "19'" },
    });
    const [f] = parseBbcHtml(html);
    expect(f.homeScore).toBe(1);
    expect(f.awayScore).toBe(0);
    expect(f.status).toBe('LIVE');
  });

  it('maps half-time (MidEvent / "HT") → LIVE, not FINISHED', () => {
    const html = makeHtmlWith({
      home: { fullName: 'Mexico', score: 1 },
      away: { fullName: 'South Africa', score: 0 },
      startDateTime: '2026-06-11T19:00:00Z',
      status: 'MidEvent',
      statusComment: { value: 'HT' },
    });
    expect(parseBbcHtml(html)[0].status).toBe('LIVE');
  });

  it('maps PostEvent / "FT" → FINISHED (not LIVE despite the digit-free clock)', () => {
    const html = makeHtmlWith({
      home: { fullName: 'Mexico', score: 2 },
      away: { fullName: 'South Africa', score: 1 },
      startDateTime: '2026-06-11T19:00:00Z',
      status: 'PostEvent',
      statusComment: { value: 'FT' },
    });
    expect(parseBbcHtml(html)[0].status).toBe('FINISHED');
  });

  it('maps InProgress → LIVE', () => {
    const html = makeHtmlWith({
      home: { fullName: 'Germany', score: 0 },
      away: { fullName: 'Spain', score: 0 },
      startDateTime: '2026-06-15T19:00:00Z',
      status: 'InProgress',
      statusComment: { value: "32'" },
    });
    expect(parseBbcHtml(html)[0].status).toBe('LIVE');
  });

  it('falls back to statusComment when status field is unfamiliar', () => {
    const html = makeHtmlWith({
      home: { fullName: 'France', score: 3 },
      away: { fullName: 'Belgium', score: 2 },
      startDateTime: '2026-06-15T19:00:00Z',
      status: 'SomethingNew',
      statusComment: { value: 'Full-Time' },
    });
    expect(parseBbcHtml(html)[0].status).toBe('FINISHED');
  });

  it('reads scores from a top-level score object too', () => {
    const html = makeHtmlWith({
      home: { fullName: 'Argentina' },
      away: { fullName: 'Croatia' },
      startDateTime: '2026-06-20T20:00:00Z',
      status: 'PostEvent',
      score: { home: 4, away: 0 },
    });
    const [f] = parseBbcHtml(html);
    expect(f.homeScore).toBe(4);
    expect(f.awayScore).toBe(0);
  });

  it('defaults to SCHEDULED when neither status nor statusComment matches any known pattern', () => {
    const html = makeHtmlWith({
      home: { fullName: 'Portugal' },
      away: { fullName: 'Senegal' },
      startDateTime: '2026-06-25T19:00:00Z',
      status: 'WeirdNewStatus',
      statusComment: { value: 'unknown' },
    });
    expect(parseBbcHtml(html)[0].status).toBe('SCHEDULED');
  });
});

describe('parseBbcHtml edge cases', () => {
  it('returns [] when the hydration blob is absent', () => {
    expect(parseBbcHtml('<html><body><p>no data</p></body></html>')).toEqual([]);
  });

  it('returns [] when the JSON blob has no fixtures key', () => {
    const inner = JSON.stringify({ data: { 'unrelated-key': { foo: 'bar' } } });
    const outer = JSON.stringify(inner);
    const html = `<html><body><script>window.__INITIAL_DATA__=${outer};</script></body></html>`;
    expect(parseBbcHtml(html)).toEqual([]);
  });

  it('returns [] when the blob is malformed', () => {
    const html = `<html><body><script>window.__INITIAL_DATA__="not-json";</script></body></html>`;
    expect(parseBbcHtml(html)).toEqual([]);
  });
});

describe('buildBbcPatches', () => {
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

  it('produces a patch for an existing match', () => {
    const patches = buildBbcPatches(
      [
        {
          homeTeam: 'MEX',
          awayTeam: 'RSA',
          homeScore: 2,
          awayScore: 1,
          status: 'FINISHED',
          datetime: '2026-06-11T19:00:00Z',
        },
      ],
      existing,
    );
    expect(patches).toEqual([
      { matchId: 'm-mex-rsa', homeScore: 2, awayScore: 1, status: 'FINISHED' },
    ]);
  });

  it('tolerates kickoff time drift within the same day', () => {
    const patches = buildBbcPatches(
      [
        {
          homeTeam: 'MEX',
          awayTeam: 'RSA',
          homeScore: 0,
          awayScore: 0,
          status: 'LIVE',
          datetime: '2026-06-11T19:05:00Z',
        },
      ],
      existing,
    );
    expect(patches).toHaveLength(1);
    expect(patches[0].matchId).toBe('m-mex-rsa');
  });

  it('skips scraped fixtures with no matching existing row', () => {
    const patches = buildBbcPatches(
      [
        {
          homeTeam: 'FRA',
          awayTeam: 'BRA',
          homeScore: 1,
          awayScore: 1,
          status: 'FINISHED',
          datetime: '2026-06-11T19:00:00Z',
        },
      ],
      existing,
    );
    expect(patches).toEqual([]);
  });

  it('does not match if the date differs', () => {
    const patches = buildBbcPatches(
      [
        {
          homeTeam: 'MEX',
          awayTeam: 'RSA',
          homeScore: 2,
          awayScore: 1,
          status: 'FINISHED',
          datetime: '2026-06-12T19:00:00Z',
        },
      ],
      existing,
    );
    expect(patches).toEqual([]);
  });
});

describe('fetchBbcFixtures', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('fetches both BBC URLs and merges/dedupes fixtures', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => html,
    });
    global.fetch = fetchMock as never;

    const fixtures = await fetchBbcFixtures();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Same payload from both URLs — dedupe should leave the same count as parsing once.
    const oncePass = parseBbcHtml(html).length;
    expect(fixtures).toHaveLength(oncePass);
  });

  it('returns fixtures from the page that succeeded when one fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, text: async () => html })
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error' });
    global.fetch = fetchMock as never;

    const fixtures = await fetchBbcFixtures();
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it('throws when both pages fail', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });
    global.fetch = fetchMock as never;

    await expect(fetchBbcFixtures()).rejects.toThrow(/BBC scraper failed/);
  });

  it('throws with a descriptive message when both pages parse to zero fixtures', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html><body>no data here</body></html>',
    });
    global.fetch = fetchMock as never;

    await expect(fetchBbcFixtures()).rejects.toThrow(/parsed 0 events/);
  });
});
