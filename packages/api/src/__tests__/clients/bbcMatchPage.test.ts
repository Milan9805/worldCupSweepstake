import { parseMatchPageCards, fetchMatchCards } from '../../clients/bbcMatchPage';

// Build the per-match-page hydration HTML the way BBC ships it: a
// double-encoded JSON blob assigned to `window.__INITIAL_DATA__`, with the
// lineups under a "match-lineups*" key.
function makeMatchHtml(lineups: unknown): string {
  const data = { data: { 'match-lineups?x=1': { data: lineups } } };
  return `<html><body><script>window.__INITIAL_DATA__=${JSON.stringify(
    JSON.stringify(data),
  )};</script></body></html>`;
}

// Convenience builders matching the confirmed player/card shape.
function card(type: string, value: string) {
  return { type, timeLabel: { value, accessible: value } };
}

function player(short: string, cards: { type: string; timeLabel?: { value?: string } }[]) {
  return { urn: `urn:s-${short}`, name: { short }, position: 'Midfielder', cards };
}

describe('parseMatchPageCards', () => {
  it('emits a YELLOW_CARD for a home starter with the home TLA', () => {
    const html = makeMatchHtml({
      homeTeam: {
        fullName: 'Mexico',
        code: 'MEX',
        players: { starters: [player('E. Álvarez', [card('Yellow Card', "23'")])], substitutes: [] },
      },
      awayTeam: { fullName: 'South Africa', code: 'SA', players: { starters: [], substitutes: [] } },
    });
    expect(parseMatchPageCards(html)).toEqual([
      { team: 'MEX', player: 'E. Álvarez', type: 'YELLOW_CARD', minute: "23'" },
    ]);
  });

  it('parses substitutes too — a red card on an away substitute', () => {
    const html = makeMatchHtml({
      homeTeam: { fullName: 'Mexico', code: 'MEX', players: { starters: [], substitutes: [] } },
      awayTeam: {
        fullName: 'South Africa',
        code: 'SA',
        players: { starters: [], substitutes: [player('Y. Sithole', [card('Red Card', "82'")])] },
      },
    });
    expect(parseMatchPageCards(html)).toEqual([
      { team: 'RSA', player: 'Y. Sithole', type: 'RED_CARD', minute: "82'" },
    ]);
  });

  it('classifies a "Yellow-Red Card" (second yellow) as RED_CARD', () => {
    const html = makeMatchHtml({
      homeTeam: {
        fullName: 'Mexico',
        code: 'MEX',
        players: { starters: [player('C. Montes', [card('Yellow-Red Card', "71'")])], substitutes: [] },
      },
      awayTeam: { fullName: 'South Africa', code: 'SA', players: { starters: [], substitutes: [] } },
    });
    expect(parseMatchPageCards(html)).toEqual([
      { team: 'MEX', player: 'C. Montes', type: 'RED_CARD', minute: "71'" },
    ]);
  });

  it('resolves South Africa to "RSA" via fullName, ignoring the page code "SA"', () => {
    const html = makeMatchHtml({
      homeTeam: { fullName: 'Mexico', code: 'MEX', players: { starters: [], substitutes: [] } },
      awayTeam: {
        fullName: 'South Africa',
        code: 'SA', // the trap: page code is "SA", app TLA is "RSA"
        players: { starters: [player('T. Mokoena', [card('Yellow Card', "15'")])], substitutes: [] },
      },
    });
    const cards = parseMatchPageCards(html);
    expect(cards).toHaveLength(1);
    expect(cards[0].team).toBe('RSA');
    expect(cards[0].team).not.toBe('SA');
  });

  it('uses name.short as the player and timeLabel.value as the minute', () => {
    const html = makeMatchHtml({
      homeTeam: {
        fullName: 'Mexico',
        code: 'MEX',
        players: {
          starters: [
            { urn: 'urn:s-1', name: { short: 'J. Quiñones', first: 'Jorge', last: 'Quiñones' }, cards: [card('Yellow Card', "44'")] },
          ],
          substitutes: [],
        },
      },
      awayTeam: { fullName: 'South Africa', code: 'SA', players: { starters: [], substitutes: [] } },
    });
    const [c] = parseMatchPageCards(html);
    expect(c.player).toBe('J. Quiñones');
    expect(c.minute).toBe("44'");
  });

  it('surfaces both cards for a player who is booked twice', () => {
    const html = makeMatchHtml({
      homeTeam: {
        fullName: 'Mexico',
        code: 'MEX',
        players: {
          starters: [player('C. Montes', [card('Yellow Card', "23'"), card('Yellow-Red Card', "71'")])],
          substitutes: [],
        },
      },
      awayTeam: { fullName: 'South Africa', code: 'SA', players: { starters: [], substitutes: [] } },
    });
    expect(parseMatchPageCards(html)).toEqual([
      { team: 'MEX', player: 'C. Montes', type: 'YELLOW_CARD', minute: "23'" },
      { team: 'MEX', player: 'C. Montes', type: 'RED_CARD', minute: "71'" },
    ]);
  });

  it('orders home-side cards before away-side cards', () => {
    const html = makeMatchHtml({
      homeTeam: {
        fullName: 'Mexico',
        code: 'MEX',
        players: { starters: [player('H. Booked', [card('Yellow Card', "10'")])], substitutes: [] },
      },
      awayTeam: {
        fullName: 'South Africa',
        code: 'SA',
        players: { starters: [player('A. Booked', [card('Yellow Card', "80'")])], substitutes: [] },
      },
    });
    expect(parseMatchPageCards(html).map((c) => c.team)).toEqual(['MEX', 'RSA']);
  });

  it('skips a side whose fullName does not resolve to a TLA', () => {
    const html = makeMatchHtml({
      homeTeam: {
        fullName: 'Narnia', // not a real team — no TLA
        code: 'NAR',
        players: { starters: [player('Mr. Tumnus', [card('Red Card', "5'")])], substitutes: [] },
      },
      awayTeam: {
        fullName: 'Mexico',
        code: 'MEX',
        players: { starters: [player('E. Álvarez', [card('Yellow Card', "23'")])], substitutes: [] },
      },
    });
    // Narnia's card is dropped; only Mexico's survives.
    expect(parseMatchPageCards(html)).toEqual([
      { team: 'MEX', player: 'E. Álvarez', type: 'YELLOW_CARD', minute: "23'" },
    ]);
  });

  it('skips a card whose player has an empty or missing name', () => {
    const html = makeMatchHtml({
      homeTeam: {
        fullName: 'Mexico',
        code: 'MEX',
        players: {
          starters: [
            { urn: 'urn:s-blank', name: { short: '' }, cards: [card('Yellow Card', "12'")] },
            { urn: 'urn:s-none', cards: [card('Red Card', "30'")] }, // no name object at all
            player('E. Álvarez', [card('Yellow Card', "40'")]),
          ],
          substitutes: [],
        },
      },
      awayTeam: { fullName: 'South Africa', code: 'SA', players: { starters: [], substitutes: [] } },
    });
    expect(parseMatchPageCards(html)).toEqual([
      { team: 'MEX', player: 'E. Álvarez', type: 'YELLOW_CARD', minute: "40'" },
    ]);
  });

  it('returns [] when there is no match-lineups container', () => {
    const data = { data: { 'some-other-key?x=1': { data: {} } } };
    const html = `<html><body><script>window.__INITIAL_DATA__=${JSON.stringify(
      JSON.stringify(data),
    )};</script></body></html>`;
    expect(parseMatchPageCards(html)).toEqual([]);
  });

  it('returns [] when the __INITIAL_DATA__ blob is absent', () => {
    expect(parseMatchPageCards('<html><body><p>no data</p></body></html>')).toEqual([]);
  });

  it('returns [] when the blob is malformed', () => {
    const html = `<html><body><script>window.__INITIAL_DATA__="not-json";</script></body></html>`;
    expect(parseMatchPageCards(html)).toEqual([]);
  });

  it('returns [] when the lineups container has no data', () => {
    const data = { data: { 'match-lineups?x=1': {} } };
    const html = `<html><body><script>window.__INITIAL_DATA__=${JSON.stringify(
      JSON.stringify(data),
    )};</script></body></html>`;
    expect(parseMatchPageCards(html)).toEqual([]);
  });

  it('tolerates a missing away side and a side with no players object', () => {
    // homeTeam resolves but has no `players`; awayTeam is absent entirely.
    const html = makeMatchHtml({ homeTeam: { fullName: 'Mexico', code: 'MEX' } });
    expect(parseMatchPageCards(html)).toEqual([]);
  });

  it('defaults a typeless card to YELLOW_CARD with an empty minute, and skips a player with no cards', () => {
    const html = makeMatchHtml({
      homeTeam: {
        fullName: 'Mexico',
        code: 'MEX',
        players: {
          starters: [
            { urn: 'a', name: { short: 'No Cards' } }, // cards undefined → skipped
            { urn: 'b', name: { short: 'Mystery Booking' }, cards: [{}] }, // no type / no timeLabel
          ],
          substitutes: [],
        },
      },
      awayTeam: { fullName: 'South Africa', code: 'SA', players: { starters: [], substitutes: [] } },
    });
    expect(parseMatchPageCards(html)).toEqual([
      { team: 'MEX', player: 'Mystery Booking', type: 'YELLOW_CARD', minute: '' },
    ]);
  });
});

describe('fetchMatchCards', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('throws a descriptive error on a non-OK response', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });
    global.fetch = fetchMock as never;

    await expect(fetchMatchCards('c0myn4dwvzkt')).rejects.toThrow(
      'BBC match page fetch failed: 404 Not Found',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.bbc.co.uk/sport/football/live/c0myn4dwvzkt',
      expect.objectContaining({ headers: expect.objectContaining({ 'User-Agent': expect.any(String) }) }),
    );
  });

  it('returns parsed cards on an OK response', async () => {
    const html = makeMatchHtml({
      homeTeam: {
        fullName: 'Mexico',
        code: 'MEX',
        players: { starters: [player('E. Álvarez', [card('Yellow Card', "23'")])], substitutes: [] },
      },
      awayTeam: { fullName: 'South Africa', code: 'SA', players: { starters: [], substitutes: [] } },
    });
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => html });
    global.fetch = fetchMock as never;

    await expect(fetchMatchCards('c0myn4dwvzkt')).resolves.toEqual([
      { team: 'MEX', player: 'E. Álvarez', type: 'YELLOW_CARD', minute: "23'" },
    ]);
  });
});
