/**
 * Code point ranges for the ideographs (and ideographic marks) the MJ
 * character set can plausibly cover.
 *
 * This exists so toMatchingKey can tell "this character should have been
 * reducible but wasn't" from "this character was never in scope". Without
 * that distinction every kana, latin letter, digit, space and punctuation
 * mark in a realistic string lands in `unresolved` — measured at 33 of 34
 * characters for a routine address line — which makes the obvious caller
 * check `if (result.unresolved.length) ...` fire on essentially every input
 * and carry no information.
 *
 * The ranges are validated against the shipped data by a test asserting that
 * every REDUCE_BY_UCS key satisfies isCjkIdeograph(), so a future data update
 * that introduces an out-of-range source character fails loudly instead of
 * silently going unreported.
 */
const RANGES: ReadonlyArray<readonly [number, number]> = [
  // Most input lands here, so keep it first.
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0x3400, 0x4dbf], // Extension A
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  // Ideographic marks that MJ carries as ordinary entries (々 〆 〇 〳).
  [0x3005, 0x3007],
  [0x303b, 0x303b],
  // Radical forms. Not MJ sources, but they look like the kanji they stand
  // for and turn up in pasted data, so a caller wants to hear about them.
  // Kangxi radicals fold into unified ideographs under NFKC, but not under
  // NFC or with normalization off; CJK Radicals Supplement has no NFKC
  // mapping at all, so ⺅ (U+2E85) would otherwise pass silently in every
  // mode.
  [0x2e80, 0x2eff], // CJK Radicals Supplement
  [0x2f00, 0x2fdf], // Kangxi Radicals
  [0x20000, 0x2a6df], // Extension B
  [0x2a700, 0x2ebef], // Extensions C through F
  [0x2ebf0, 0x2ee5f], // Extension I
  [0x2f800, 0x2fa1f], // CJK Compatibility Ideographs Supplement
  [0x30000, 0x3134f], // Extension G
  [0x31350, 0x3347f], // Extensions H and J
];

// Deliberately excluded, despite living in the same neighbourhood:
// U+2FF0-U+2FFF (Ideographic Description Characters, e.g. ⿰) and
// U+31C0-U+31EF (CJK Strokes, e.g. ㇀). Those are structural notation and
// stroke components, not characters anyone expects to normalize into a
// kanji, so reporting them would be the same kind of noise this filter
// exists to remove.

/** Whether `codePoint` is an ideograph MJ could plausibly have an entry for. */
export function isCjkIdeograph(codePoint: number): boolean {
  for (const [lo, hi] of RANGES) {
    if (codePoint >= lo && codePoint <= hi) return true;
  }
  return false;
}
