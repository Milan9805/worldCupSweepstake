import * as fs from 'fs';
import * as path from 'path';
import {
  parseBbcHtml,
  buildBbcPatches,
  fetchBbcFixtures,
  extractInitialData,
  parseBbcKnockoutTies,
  buildBbcKnockoutPatches,
  ScrapedKnockoutTie,
} from '../../clients/bbcScraper';
import { Match, MatchAction } from '@sweepstake/shared';

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

  it('marks every pre-tournament event as SCHEDULED with null scores and no minute', () => {
    for (const f of fixtures) {
      expect(f.status).toBe('SCHEDULED');
      expect(f.homeScore).toBeNull();
      expect(f.awayScore).toBeNull();
      expect(f.minute).toBeNull();
    }
  });

  it('carries an empty actions array for every pre-tournament event (no goals/cards yet)', () => {
    for (const f of fixtures) {
      expect(f.actions).toEqual([]);
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

  it('leaves tipoTopicId undefined for the pre-tournament snapshot (no match links yet)', () => {
    for (const f of fixtures) {
      expect(f.tipoTopicId).toBeUndefined();
    }
  });
});

describe('parseBbcHtml (per-match topic id)', () => {
  function makeHtmlWith(event: Record<string, unknown>): string {
    const data = {
      data: { 'sport-data-scores-fixtures?x=1': { data: { eventGroups: [{ secondaryGroups: [{ events: [event] }] }] } } },
    };
    return `<html><body><script>window.__INITIAL_DATA__=${JSON.stringify(JSON.stringify(data))};</script></body></html>`;
  }
  const base = {
    home: { fullName: 'Mexico' },
    away: { fullName: 'South Africa' },
    startDateTime: '2026-06-11T19:00:00Z',
    status: 'MidEvent',
    statusComment: { value: "19'" },
  };

  it('prefers the explicit tipoTopicId field', () => {
    const [f] = parseBbcHtml(makeHtmlWith({ ...base, tipoTopicId: 'c0myn4dwvzkt' }));
    expect(f.tipoTopicId).toBe('c0myn4dwvzkt');
  });

  it('falls back to the trailing id of the onward-journey link', () => {
    const [f] = parseBbcHtml(makeHtmlWith({ ...base, onwardJourneyLink: '/sport/football/live/abc123xyz' }));
    expect(f.tipoTopicId).toBe('abc123xyz');
  });

  it('is undefined when neither field is present', () => {
    const [f] = parseBbcHtml(makeHtmlWith(base));
    expect(f.tipoTopicId).toBeUndefined();
  });
});

describe('extractInitialData', () => {
  it('decodes the double-encoded hydration blob', () => {
    const payload = { data: { foo: { data: { bar: 1 } } } };
    const html = `<html><script>window.__INITIAL_DATA__=${JSON.stringify(JSON.stringify(payload))};</script></html>`;
    expect(extractInitialData(html)).toEqual(payload);
  });

  it('returns null when the marker is absent', () => {
    expect(extractInitialData('<html><body>nope</body></html>')).toBeNull();
  });

  it('returns null when the blob is malformed', () => {
    expect(extractInitialData('<html><script>window.__INITIAL_DATA__="not-json";</script></html>')).toBeNull();
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
    // The running clock is surfaced verbatim for live matches.
    expect(f.minute).toBe("19'");
  });

  it('maps half-time (MidEvent / "HT") → LIVE with minute "HT"', () => {
    const html = makeHtmlWith({
      home: { fullName: 'Mexico', score: 1 },
      away: { fullName: 'South Africa', score: 0 },
      startDateTime: '2026-06-11T19:00:00Z',
      status: 'MidEvent',
      statusComment: { value: 'HT' },
    });
    const [f] = parseBbcHtml(html);
    expect(f.status).toBe('LIVE');
    expect(f.minute).toBe('HT');
  });

  it('maps PostEvent / "FT" → FINISHED with a null minute (no stale clock)', () => {
    const html = makeHtmlWith({
      home: { fullName: 'Mexico', score: 2 },
      away: { fullName: 'South Africa', score: 1 },
      startDateTime: '2026-06-11T19:00:00Z',
      status: 'PostEvent',
      statusComment: { value: 'FT' },
    });
    const [f] = parseBbcHtml(html);
    expect(f.status).toBe('FINISHED');
    expect(f.minute).toBeNull();
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

describe('parseBbcHtml (goal + booking actions)', () => {
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

  // Shape verified against live data (Mexico v South Africa, 2026-06-11): each
  // side's `actions` is a per-player list, each carrying an inner action list.
  function player(
    playerName: string,
    actionType: string,
    inners: { type: string; value?: string }[],
  ): Record<string, unknown> {
    return {
      playerUrn: `urn:bbc:sportsdata:football:player:s-${playerName}`,
      playerName,
      actionType,
      actions: inners.map((i) => ({
        type: i.type,
        typeLabel: { value: i.type, accessible: i.type },
        timeLabel: { value: i.value ?? '', accessible: i.value ?? '' },
      })),
    };
  }

  it('flattens a home-side goal into a GOAL action with the home TLA', () => {
    const html = makeHtmlWith({
      home: { fullName: 'Mexico', score: 1, actions: [player('J. Quiñones', 'goal', [{ type: 'Goal', value: "9'" }])] },
      away: { fullName: 'South Africa', score: 0 },
      startDateTime: '2026-06-11T19:00:00Z',
      status: 'MidEvent',
      statusComment: { value: "19'" },
    });
    const [f] = parseBbcHtml(html);
    expect(f.actions).toContainEqual({
      team: 'MEX',
      player: 'J. Quiñones',
      type: 'GOAL',
      minute: "9'",
    });
  });

  it('classifies an away-side "Red Card" as RED_CARD with the away TLA', () => {
    const html = makeHtmlWith({
      home: { fullName: 'Mexico', score: 1 },
      away: { fullName: 'South Africa', score: 0, actions: [player('Y. Sithole', 'card', [{ type: 'Red Card', value: "49'" }])] },
      startDateTime: '2026-06-11T19:00:00Z',
      status: 'MidEvent',
      statusComment: { value: "49'" },
    });
    const [f] = parseBbcHtml(html);
    expect(f.actions).toContainEqual({
      team: 'RSA',
      player: 'Y. Sithole',
      type: 'RED_CARD',
      minute: "49'",
    });
  });

  it('classifies a "Yellow Card" as YELLOW_CARD', () => {
    const html = makeHtmlWith({
      home: { fullName: 'Mexico', score: 0, actions: [player('E. Álvarez', 'card', [{ type: 'Yellow Card', value: "23'" }])] },
      away: { fullName: 'South Africa', score: 0 },
      startDateTime: '2026-06-11T19:00:00Z',
      status: 'MidEvent',
      statusComment: { value: "30'" },
    });
    const [f] = parseBbcHtml(html);
    expect(f.actions).toContainEqual({
      team: 'MEX',
      player: 'E. Álvarez',
      type: 'YELLOW_CARD',
      minute: "23'",
    });
  });

  it('classifies a "Yellow-Red Card" (second yellow) as RED_CARD', () => {
    const html = makeHtmlWith({
      home: { fullName: 'Mexico', score: 0 },
      away: { fullName: 'South Africa', score: 0, actions: [player('Y. Sithole', 'card', [{ type: 'Yellow-Red Card', value: "71'" }])] },
      startDateTime: '2026-06-11T19:00:00Z',
      status: 'MidEvent',
      statusComment: { value: "71'" },
    });
    const [f] = parseBbcHtml(html);
    expect(f.actions).toContainEqual({
      team: 'RSA',
      player: 'Y. Sithole',
      type: 'RED_CARD',
      minute: "71'",
    });
  });

  it('ignores actions whose actionType is unrecognised (e.g. substitution)', () => {
    const html = makeHtmlWith({
      home: { fullName: 'Mexico', score: 0, actions: [player('H. Lozano', 'substitution', [{ type: 'Substitution', value: "60'" }])] },
      away: { fullName: 'South Africa', score: 0 },
      startDateTime: '2026-06-11T19:00:00Z',
      status: 'MidEvent',
      statusComment: { value: "60'" },
    });
    const [f] = parseBbcHtml(html);
    expect(f.actions).toEqual([]);
  });

  it('surfaces every inner action when a player has more than one (goal then card)', () => {
    const html = makeHtmlWith({
      home: {
        fullName: 'Mexico',
        score: 1,
        // BBC groups a player's events; a scorer who is later booked carries both.
        actions: [
          {
            playerUrn: 'urn:bbc:sportsdata:football:player:s-raul',
            playerName: 'R. Jiménez',
            actionType: 'goal',
            actions: [
              { type: 'Goal', timeLabel: { value: "12'" } },
              { type: 'Yellow Card', timeLabel: { value: "55'" } },
            ],
          },
        ],
      },
      away: { fullName: 'South Africa', score: 0 },
      startDateTime: '2026-06-11T19:00:00Z',
      status: 'MidEvent',
      statusComment: { value: "60'" },
    });
    const [f] = parseBbcHtml(html);
    // Note: the outer actionType ("goal") drives classification, so the inner
    // "Yellow Card" here surfaces as GOAL — both inner actions still appear.
    expect(f.actions).toHaveLength(2);
    expect(f.actions[0]).toMatchObject({ team: 'MEX', player: 'R. Jiménez', minute: "12'" });
    expect(f.actions[1]).toMatchObject({ team: 'MEX', player: 'R. Jiménez', minute: "55'" });
  });

  it('orders home-side actions before away-side actions', () => {
    const html = makeHtmlWith({
      home: { fullName: 'Mexico', score: 1, actions: [player('H. Goal', 'goal', [{ type: 'Goal', value: "5'" }])] },
      away: { fullName: 'South Africa', score: 1, actions: [player('A. Goal', 'goal', [{ type: 'Goal', value: "80'" }])] },
      startDateTime: '2026-06-11T19:00:00Z',
      status: 'MidEvent',
      statusComment: { value: "85'" },
    });
    const [f] = parseBbcHtml(html);
    expect(f.actions.map((a: MatchAction) => a.team)).toEqual(['MEX', 'RSA']);
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

  it('produces a patch for an existing match (carrying the live minute)', () => {
    const patches = buildBbcPatches(
      [
        {
          homeTeam: 'MEX',
          awayTeam: 'RSA',
          homeScore: 2,
          awayScore: 1,
          status: 'FINISHED',
          datetime: '2026-06-11T19:00:00Z',
          minute: null,
          actions: [],
        },
      ],
      existing,
    );
    expect(patches).toEqual([
      {
        matchId: 'm-mex-rsa',
        homeScore: 2,
        awayScore: 1,
        status: 'FINISHED',
        minute: null,
        actions: [],
      },
    ]);
  });

  it('carries the live minute through for an in-play match', () => {
    const patches = buildBbcPatches(
      [
        {
          homeTeam: 'MEX',
          awayTeam: 'RSA',
          homeScore: 1,
          awayScore: 0,
          status: 'LIVE',
          datetime: '2026-06-11T19:00:00Z',
          minute: "19'",
          actions: [],
        },
      ],
      existing,
    );
    expect(patches).toEqual([
      {
        matchId: 'm-mex-rsa',
        homeScore: 1,
        awayScore: 0,
        status: 'LIVE',
        minute: "19'",
        actions: [],
      },
    ]);
  });

  it('carries non-empty actions through into the patch', () => {
    const actions: MatchAction[] = [
      { team: 'MEX', player: 'J. Quiñones', type: 'GOAL', minute: "9'" },
      { team: 'RSA', player: 'Y. Sithole', type: 'RED_CARD', minute: "49'" },
    ];
    const patches = buildBbcPatches(
      [
        {
          homeTeam: 'MEX',
          awayTeam: 'RSA',
          homeScore: 1,
          awayScore: 0,
          status: 'LIVE',
          datetime: '2026-06-11T19:00:00Z',
          minute: "49'",
          actions,
        },
      ],
      existing,
    );
    expect(patches).toHaveLength(1);
    expect(patches[0].actions).toEqual(actions);
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
          minute: "1'",
          actions: [],
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
          minute: null,
          actions: [],
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
          minute: null,
          actions: [],
        },
      ],
      existing,
    );
    expect(patches).toEqual([]);
  });

  // A knockout tie can go to extra time / penalties, which BBC's scoreline can't
  // resolve — football-data owns the final result, so BBC must not finalize it.
  const liveKnockout: Match[] = [
    {
      matchId: 'm-ger-par',
      homeTeam: 'GER',
      awayTeam: 'PAR',
      homeScore: 1,
      awayScore: 1,
      status: 'LIVE',
      stage: 'ROUND_OF_32',
      group: null,
      datetime: '2026-06-29T20:00:00Z',
      venue: 'TBC',
    },
  ];

  it('clamps a knockout BBC reports as FINISHED back to LIVE (lets football-data finalize)', () => {
    const patches = buildBbcPatches(
      [
        {
          homeTeam: 'GER',
          awayTeam: 'PAR',
          homeScore: 1,
          awayScore: 1,
          status: 'FINISHED',
          datetime: '2026-06-29T20:00:00Z',
          minute: null,
          actions: [],
        },
      ],
      liveKnockout,
    );
    expect(patches).toHaveLength(1);
    expect(patches[0].status).toBe('LIVE');
  });

  it('skips a knockout already finished by football-data (never clobbers its result)', () => {
    const finishedKnockout: Match[] = [{ ...liveKnockout[0], status: 'FINISHED' }];
    const patches = buildBbcPatches(
      [
        {
          homeTeam: 'GER',
          awayTeam: 'PAR',
          homeScore: 4,
          awayScore: 5,
          status: 'FINISHED',
          datetime: '2026-06-29T20:00:00Z',
          minute: null,
          actions: [],
        },
      ],
      finishedKnockout,
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

describe('parseBbcKnockoutTies', () => {
  // Build a scores-fixtures page from raw events, mirroring BBC's
  // double-JSON-encoded window.__INITIAL_DATA__ blob.
  function makeHtml(events: Record<string, unknown>[]): string {
    const data = {
      data: {
        'sport-data-scores-fixtures?x=1': {
          data: { eventGroups: [{ secondaryGroups: [{ events }] }] },
        },
      },
    };
    const outer = JSON.stringify(JSON.stringify(data));
    return `<html><body><script>window.__INITIAL_DATA__=${outer};</script></body></html>`;
  }

  // A FINISHED Round-of-32 tie decided on penalties (real shape, NED 1-1 MAR,
  // Morocco win the shootout 3-2). The on-pitch score and shootout sit in
  // separate runningScores fields.
  const shootoutEvent = {
    home: {
      fullName: 'Netherlands',
      score: '1',
      runningScores: { halftime: '0', fulltime: '1', extratime: '1', penaltyShootout: '2' },
    },
    away: {
      fullName: 'Morocco',
      score: '1',
      runningScores: { halftime: '0', fulltime: '1', extratime: '1', penaltyShootout: '3' },
    },
    startDateTime: '2026-06-30T01:00:00Z',
    eventGroupingLabel: 'World - FIFA World Cup - Last 32',
    status: 'PostEvent',
    statusComment: { value: 'PENS' },
    periodLabel: { value: 'PENS' },
    tipoTopicId: 'c8023x0d3g9t',
  };

  it('parses a finished shootout tie: stage, on-pitch score, and shootout tally', () => {
    const [tie] = parseBbcKnockoutTies(makeHtml([shootoutEvent]));
    expect(tie).toMatchObject({
      stage: 'ROUND_OF_32',
      datetime: '2026-06-30T01:00:00Z',
      homeTeam: 'NED',
      awayTeam: 'MAR',
      homeFeeder: null,
      awayFeeder: null,
      homeScore: 1, // on-pitch (extratime), NOT folding the shootout in
      awayScore: 1,
      penaltyHome: 2,
      penaltyAway: 3,
      status: 'FINISHED',
      tipoTopicId: 'c8023x0d3g9t',
    });
  });

  it('parses a resolved upcoming tie with both teams and no shootout', () => {
    const event = {
      home: { fullName: 'Canada' },
      away: { fullName: 'Morocco' },
      startDateTime: '2026-07-04T17:00:00Z',
      eventGroupingLabel: 'World - FIFA World Cup - Last 16',
      status: 'PreEvent',
      statusComment: { value: 'Scheduled' },
    };
    const [tie] = parseBbcKnockoutTies(makeHtml([event]));
    expect(tie).toMatchObject({
      stage: 'ROUND_OF_16',
      homeTeam: 'CAN',
      awayTeam: 'MAR',
      homeFeeder: null,
      awayFeeder: null,
      homeScore: null,
      awayScore: null,
      penaltyHome: null,
      penaltyAway: null,
      status: 'SCHEDULED',
    });
  });

  it('parses a half-resolved tie: a known team versus a "Winner Match N" feeder', () => {
    const event = {
      home: { fullName: 'Paraguay' },
      away: { fullName: 'Winner Match 77' },
      startDateTime: '2026-07-04T21:00:00Z',
      eventGroupingLabel: 'World - FIFA World Cup - Last 16',
      status: 'PreEvent',
    };
    const [tie] = parseBbcKnockoutTies(makeHtml([event]));
    expect(tie.homeTeam).toBe('PAR');
    expect(tie.awayTeam).toBeNull();
    expect(tie.awayFeeder).toEqual({ outcome: 'WINNER', feederRound: 'MATCH', feederNumber: 77 });
  });

  it('parses quarter-final and semi-final feeder references', () => {
    const semi = {
      home: { fullName: 'Winner Quarter-final 1' },
      away: { fullName: 'Winner Quarter-final 2' },
      startDateTime: '2026-07-14T19:00:00Z',
      eventGroupingLabel: 'World - FIFA World Cup - Semi-finals',
      status: 'PreEvent',
    };
    const third = {
      home: { fullName: 'Loser Semi-final 1' },
      away: { fullName: 'Loser Semi-final 2' },
      startDateTime: '2026-07-18T21:00:00Z',
      eventGroupingLabel: 'World - FIFA World Cup - 3rd Place Final',
      status: 'PreEvent',
    };
    const ties = parseBbcKnockoutTies(makeHtml([semi, third]));
    expect(ties[0]).toMatchObject({
      stage: 'SEMI_FINAL',
      homeFeeder: { outcome: 'WINNER', feederRound: 'QUARTER_FINAL', feederNumber: 1 },
      awayFeeder: { outcome: 'WINNER', feederRound: 'QUARTER_FINAL', feederNumber: 2 },
    });
    expect(ties[1]).toMatchObject({
      stage: 'THIRD_PLACE',
      homeFeeder: { outcome: 'LOSER', feederRound: 'SEMI_FINAL', feederNumber: 1 },
      awayFeeder: { outcome: 'LOSER', feederRound: 'SEMI_FINAL', feederNumber: 2 },
    });
  });

  it('maps every BBC round label to a stage and skips group-stage events', () => {
    const round = (label: string) => ({
      home: { fullName: 'Winner Match 1' },
      away: { fullName: 'Winner Match 2' },
      startDateTime: '2026-07-10T19:00:00Z',
      eventGroupingLabel: `World - FIFA World Cup - ${label}`,
      status: 'PreEvent',
    });
    const ties = parseBbcKnockoutTies(
      makeHtml([
        round('Last 32'),
        round('Last 16'),
        round('Quarter-finals'),
        round('Semi-finals'),
        round('3rd Place Final'),
        round('Final'),
        // Group-stage events carry a group label, not a knockout round — skipped.
        { ...round('Group A'), home: { fullName: 'Mexico' }, away: { fullName: 'South Africa' } },
      ]),
    );
    expect(ties.map((t) => t.stage)).toEqual([
      'ROUND_OF_32',
      'ROUND_OF_16',
      'QUARTER_FINAL',
      'SEMI_FINAL',
      'THIRD_PLACE',
      'FINAL',
    ]);
  });

  it('falls back to the flat score when a tie carries no runningScores', () => {
    const event = {
      home: { fullName: 'Brazil', score: '2' },
      away: { fullName: 'Japan', score: '1' },
      startDateTime: '2026-06-29T17:00:00Z',
      eventGroupingLabel: 'World - FIFA World Cup - Last 32',
      status: 'PostEvent',
      statusComment: { value: 'FT' },
    };
    const [tie] = parseBbcKnockoutTies(makeHtml([event]));
    expect(tie).toMatchObject({ homeScore: 2, awayScore: 1, penaltyHome: null, penaltyAway: null });
  });

  it('returns [] for a page with no fixtures data', () => {
    expect(parseBbcKnockoutTies('<html><body>no data</body></html>')).toEqual([]);
  });
});

describe('buildBbcKnockoutPatches', () => {
  const koMatch = (over: Partial<Match> = {}): Match => ({
    matchId: 'm-ger-par',
    homeTeam: 'GER',
    awayTeam: 'PAR',
    homeScore: null,
    awayScore: null,
    status: 'LIVE',
    stage: 'ROUND_OF_32',
    group: null,
    datetime: '2026-06-29T20:30:00Z',
    venue: 'TBC',
    ...over,
  });

  const koTie = (over: Partial<ScrapedKnockoutTie> = {}): ScrapedKnockoutTie => ({
    stage: 'ROUND_OF_32',
    datetime: '2026-06-29T20:30:00Z',
    homeTeam: 'GER',
    awayTeam: 'PAR',
    homeFeeder: null,
    awayFeeder: null,
    homeScore: 1,
    awayScore: 1,
    penaltyHome: 3,
    penaltyAway: 4,
    status: 'FINISHED',
    minute: null,
    ...over,
  });

  it('finalises a shootout tie with the on-pitch score and the shootout tally', () => {
    const [patch] = buildBbcKnockoutPatches([koTie()], [koMatch()]);
    expect(patch).toMatchObject({
      matchId: 'm-ger-par',
      status: 'FINISHED',
      homeScore: 1,
      awayScore: 1,
      penaltyHome: 3,
      penaltyAway: 4,
    });
  });

  it('finalises a knockout decisive on the pitch (no shootout)', () => {
    const tie = koTie({ homeScore: 2, awayScore: 0, penaltyHome: null, penaltyAway: null });
    const [patch] = buildBbcKnockoutPatches([tie], [koMatch()]);
    expect(patch).toMatchObject({ status: 'FINISHED', homeScore: 2, awayScore: 0 });
    expect(patch.penaltyHome).toBeNull();
  });

  it('does NOT finalise a tie still level with no shootout (holds it open)', () => {
    const tie = koTie({ homeScore: 1, awayScore: 1, penaltyHome: null, penaltyAway: null });
    const [patch] = buildBbcKnockoutPatches([tie], [koMatch()]);
    // Feeders are still patched, but the result is left unfinished.
    expect(patch.status).toBeUndefined();
    expect(patch.homeScore).toBeUndefined();
  });

  it('labels an unresolved opponent from the feeder, correlating by the known team', () => {
    const tie = koTie({
      stage: 'ROUND_OF_16',
      datetime: '2026-07-04T21:00:00Z',
      homeTeam: 'PAR',
      awayTeam: null,
      awayFeeder: { outcome: 'WINNER', feederRound: 'MATCH', feederNumber: 77 },
      homeScore: null,
      awayScore: null,
      penaltyHome: null,
      penaltyAway: null,
      status: 'SCHEDULED',
    });
    const match = koMatch({
      matchId: 'm-par-r16',
      homeTeam: 'PAR',
      awayTeam: '',
      stage: 'ROUND_OF_16',
      datetime: '2026-07-04T21:00:00Z',
      status: 'SCHEDULED',
    });
    const [patch] = buildBbcKnockoutPatches([tie], [match]);
    expect(patch).toMatchObject({
      matchId: 'm-par-r16',
      homeFeeder: null,
      awayFeeder: { outcome: 'WINNER', feederRound: 'MATCH', feederNumber: 77 },
    });
    expect(patch.status).toBeUndefined(); // not played yet
  });

  it('correlates an all-placeholder future tie by round + kickoff', () => {
    const tie = koTie({
      stage: 'SEMI_FINAL',
      datetime: '2026-07-14T19:00:00Z',
      homeTeam: null,
      awayTeam: null,
      homeFeeder: { outcome: 'WINNER', feederRound: 'QUARTER_FINAL', feederNumber: 1 },
      awayFeeder: { outcome: 'WINNER', feederRound: 'QUARTER_FINAL', feederNumber: 2 },
      homeScore: null,
      awayScore: null,
      penaltyHome: null,
      penaltyAway: null,
      status: 'SCHEDULED',
    });
    const match = koMatch({
      matchId: 'm-sf1',
      homeTeam: '',
      awayTeam: '',
      stage: 'SEMI_FINAL',
      datetime: '2026-07-14T19:00:00Z',
      status: 'SCHEDULED',
    });
    const [patch] = buildBbcKnockoutPatches([tie], [match]);
    expect(patch.matchId).toBe('m-sf1');
    expect(patch.homeFeeder).toEqual({ outcome: 'WINNER', feederRound: 'QUARTER_FINAL', feederNumber: 1 });
  });

  it('skips a tie that matches no stored row', () => {
    const tie = koTie({ homeTeam: 'ESP', awayTeam: 'ITA' });
    expect(buildBbcKnockoutPatches([tie], [koMatch()])).toEqual([]);
  });
});
