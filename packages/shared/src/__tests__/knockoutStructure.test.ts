import {
  R32_BRACKET_ORDER,
  R16_MATCH_NUMBERS,
  TEAM_R32_SLOT,
  feedersForSlot,
} from '../knockoutStructure';

describe('R32_BRACKET_ORDER (the static 2026 bracket snapshot)', () => {
  it('has 16 ties covering 32 distinct teams', () => {
    expect(R32_BRACKET_ORDER).toHaveLength(16);
    const teams = R32_BRACKET_ORDER.flatMap((t) => [t.home, t.away]);
    expect(teams).toHaveLength(32);
    expect(new Set(teams).size).toBe(32); // no duplicates
  });

  it('uses each tracked match number once, all within the R32 range (73-88)', () => {
    const numbers = R32_BRACKET_ORDER.map((t) => t.match).filter((m): m is number => m != null);
    expect(new Set(numbers).size).toBe(numbers.length); // unique
    expect(numbers.every((n) => n >= 73 && n <= 88)).toBe(true);
    // The four earliest, already-decided ties carry no number (they resolve by team).
    expect(R32_BRACKET_ORDER.filter((t) => t.match == null)).toHaveLength(3);
  });

  it('numbers the eight Round-of-16 ties uniquely within 89-96', () => {
    expect(R16_MATCH_NUMBERS).toHaveLength(8);
    expect(new Set(R16_MATCH_NUMBERS).size).toBe(8);
    expect(R16_MATCH_NUMBERS.every((n) => n >= 89 && n <= 96)).toBe(true);
  });
});

describe('TEAM_R32_SLOT', () => {
  it('maps every team to its Round-of-32 slot index', () => {
    expect(Object.keys(TEAM_R32_SLOT)).toHaveLength(32);
    R32_BRACKET_ORDER.forEach((tie, index) => {
      expect(TEAM_R32_SLOT[tie.home]).toBe(index);
      expect(TEAM_R32_SLOT[tie.away]).toBe(index);
    });
  });
});

describe('feedersForSlot', () => {
  it('gives a Round-of-32 slot no feeders (its teams come from the groups)', () => {
    expect(feedersForSlot(0, 0)).toEqual({ home: null, away: null });
  });

  it('feeds a Round-of-16 slot from its two R32 ties, labelled by match number', () => {
    // R16 slot 5 is fed by R32 slots 10 and 11 (matches 79 and 80).
    expect(feedersForSlot(1, 5)).toEqual({
      home: { outcome: 'WINNER', feederRound: 'MATCH', feederNumber: 79 },
      away: { outcome: 'WINNER', feederRound: 'MATCH', feederNumber: 80 },
    });
  });

  it('leaves a feeder null when the feeding R32 tie carries no number', () => {
    // R16 slot 1 is fed by R32 slots 2 and 3 (RSA/CAN, NED/MAR) — both unnumbered.
    expect(feedersForSlot(1, 1)).toEqual({ home: null, away: null });
  });

  it('feeds a quarter-final from its two R16 ties, by their match numbers', () => {
    // QF slot 0 is fed by R16 slots 0 and 1 (matches 89 and 90).
    expect(feedersForSlot(2, 0)).toEqual({
      home: { outcome: 'WINNER', feederRound: 'MATCH', feederNumber: 89 },
      away: { outcome: 'WINNER', feederRound: 'MATCH', feederNumber: 90 },
    });
  });

  it('feeds a semi-final from quarter-finals by 1-indexed position', () => {
    expect(feedersForSlot(3, 1)).toEqual({
      home: { outcome: 'WINNER', feederRound: 'QUARTER_FINAL', feederNumber: 3 },
      away: { outcome: 'WINNER', feederRound: 'QUARTER_FINAL', feederNumber: 4 },
    });
  });

  it('feeds the final from the two semi-finals', () => {
    expect(feedersForSlot(4, 0)).toEqual({
      home: { outcome: 'WINNER', feederRound: 'SEMI_FINAL', feederNumber: 1 },
      away: { outcome: 'WINNER', feederRound: 'SEMI_FINAL', feederNumber: 2 },
    });
  });

  it('returns no feeders for a round beyond the final (defensive guard)', () => {
    expect(feedersForSlot(5, 0)).toEqual({ home: null, away: null });
  });
});
