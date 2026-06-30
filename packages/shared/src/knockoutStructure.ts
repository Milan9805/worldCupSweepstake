import { KnockoutFeeder } from './types';

/**
 * The fixed 2026 FIFA World Cup knockout bracket structure.
 *
 * Snapshotted once from the official bracket (Wikipedia, "2026 FIFA World Cup
 * knockout stage") — the authoritative source for the *shape* of the tree, which
 * the live feed can't give us reliably (it has no per-tie match number, and
 * kick-off order is NOT bracket order). The matchups themselves still come from
 * the live scrape; this only fixes each tie's *position*, so the bracket reads
 * top-to-bottom as a proper tree and never re-orders as results come in.
 *
 * Only the Round of 32 order is stored — every later round folds out of it:
 * R16 slot i is contested by the winners of R32 slots 2i and 2i+1, QF slot i by
 * R16 slots 2i and 2i+1, and so on to the Final. This is a property of every
 * single-elimination bracket, so 16 entries pin the whole 31-tie tree.
 *
 * `match` is the official fixture number, used only to label an unresolved
 * feeder ("Winner Match 77"). The four ties already decided when this was taken
 * (the earliest kick-offs, matches 73–75 plus Brazil's) carry `null`: their R16
 * slots are resolved by team, so no "Winner Match N" label is ever needed there.
 */
export interface R32Tie {
  home: string;
  away: string;
  match: number | null;
}

export const R32_BRACKET_ORDER: R32Tie[] = [
  { home: 'GER', away: 'PAR', match: null }, // 0
  { home: 'FRA', away: 'SWE', match: 77 }, //   1
  { home: 'RSA', away: 'CAN', match: null }, // 2
  { home: 'NED', away: 'MAR', match: null }, // 3
  { home: 'POR', away: 'CRO', match: 83 }, //   4
  { home: 'ESP', away: 'AUT', match: 84 }, //   5
  { home: 'USA', away: 'BIH', match: 81 }, //   6
  { home: 'BEL', away: 'SEN', match: 82 }, //   7
  { home: 'BRA', away: 'JPN', match: 76 }, //   8
  { home: 'CIV', away: 'NOR', match: 78 }, //   9
  { home: 'MEX', away: 'ECU', match: 79 }, //   10
  { home: 'ENG', away: 'COD', match: 80 }, //   11
  { home: 'ARG', away: 'CPV', match: 86 }, //   12
  { home: 'AUS', away: 'EGY', match: 88 }, //   13
  { home: 'SUI', away: 'ALG', match: 85 }, //   14
  { home: 'COL', away: 'GHA', match: 87 }, //   15
];

/**
 * The official fixture number of each Round-of-16 tie, in bracket-slot order
 * (R16 slot i = winners of R32 2i / 2i+1). Used to label the feeders of the
 * quarter-finals ("Winner Match 89"). Note the numbers aren't sequential by
 * position — the bracket interleaves them — which is exactly why they're stored.
 */
export const R16_MATCH_NUMBERS: number[] = [89, 90, 93, 94, 91, 92, 95, 96];

const winnerMatch = (n: number | null): KnockoutFeeder | null =>
  n == null ? null : { outcome: 'WINNER', feederRound: 'MATCH', feederNumber: n };

/**
 * The feeder that fills a given slot's side, derived from the bracket structure:
 * the tie one round down whose winner advances into it. Returns null for a Round
 * of 32 side (no feeder — those come from the group stage) or when the feeding
 * tie's number isn't tracked (an already-decided early R32 tie).
 *
 * @param roundIndex index into ROUNDS of the slot being filled
 * @param childSlotIndex the feeding slot's index in the round below
 */
function feederFor(roundIndex: number, childSlotIndex: number): KnockoutFeeder | null {
  const childRoundIndex = roundIndex - 1; // the round feeding this slot
  switch (childRoundIndex) {
    case 0: // fed by a Round-of-32 tie → "Winner Match {R32 number}"
      return winnerMatch(R32_BRACKET_ORDER[childSlotIndex]?.match ?? null);
    case 1: // fed by a Round-of-16 tie → "Winner Match {R16 number}"
      return winnerMatch(R16_MATCH_NUMBERS[childSlotIndex] ?? null);
    case 2: // fed by a quarter-final → "Winner Quarter-final {1-indexed}"
      return { outcome: 'WINNER', feederRound: 'QUARTER_FINAL', feederNumber: childSlotIndex + 1 };
    case 3: // fed by a semi-final → "Winner Semi-final {1-indexed}"
      return { outcome: 'WINNER', feederRound: 'SEMI_FINAL', feederNumber: childSlotIndex + 1 };
    default:
      return null;
  }
}

/**
 * The two feeders for a bracket slot (the ties feeding its home and away sides),
 * derived structurally from the fixed bracket. A slot in round R is fed by slots
 * 2i and 2i+1 of round R-1. Round of 32 slots have no feeders.
 */
export function feedersForSlot(
  roundIndex: number,
  slotIndex: number,
): { home: KnockoutFeeder | null; away: KnockoutFeeder | null } {
  if (roundIndex <= 0) return { home: null, away: null };
  return {
    home: feederFor(roundIndex, slotIndex * 2),
    away: feederFor(roundIndex, slotIndex * 2 + 1),
  };
}

/**
 * Map of team code → its fixed Round-of-32 slot index. A team stays anchored to
 * this leaf as it advances, so any later-round tie it appears in can be placed at
 * its correct bracket slot (slot = R32 index >> roundIndex). Built once from the
 * bracket order.
 */
export const TEAM_R32_SLOT: Record<string, number> = R32_BRACKET_ORDER.reduce(
  (acc, tie, index) => {
    acc[tie.home] = index;
    acc[tie.away] = index;
    return acc;
  },
  {} as Record<string, number>,
);
