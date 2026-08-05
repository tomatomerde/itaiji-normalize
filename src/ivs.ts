/**
 * Ideographic Variation Sequence (IVS) support.
 *
 * A "unit" here means one base character optionally followed by variation
 * selectors: either an Ideographic Variation Selector (IVS,
 * U+E0100-U+E01EF, "Moji_Joho" collection) or a Standard Variation Selector
 * (SVS, U+FE00-U+FE0D). See docs/phase0-report.md #1 for why IVS coverage
 * matters and how common it is in the source data.
 */

const IVS_MIN = 0xe0100;
const IVS_MAX = 0xe01ef;
const SVS_MIN = 0xfe00;
/**
 * VS15 (U+FE0E, text presentation) and VS16 (U+FE0F, emoji presentation) are
 * deliberately excluded from the SVS range.
 *
 * Unicode reserves those two for presentation, not for ideographic variation,
 * and U+FE0F in particular appears in ordinary text all the time as part of
 * emoji. Treating it as a variation selector made this library eat and then
 * discard it: `toMatchingKey("㊗️")` returned "祝" with the U+FE0F gone, and a
 * sweep of BMP bases found 20,335 characters that dropped it against 30,609
 * that kept it — so from a caller's side whether their emoji survived looked
 * arbitrary.
 *
 * The upper bound is data-checked rather than guessed: the only SVS selectors
 * the MJ data actually uses are U+FE00 (86 keys) and U+FE01 (3 keys), so
 * narrowing to U+FE00-U+FE0D loses nothing.
 */
const SVS_MAX = 0xfe0d;

export function isVariationSelector(codePoint: number): boolean {
  return (codePoint >= IVS_MIN && codePoint <= IVS_MAX) || (codePoint >= SVS_MIN && codePoint <= SVS_MAX);
}

/** Which variation-selector range `codePoint` falls in, or null if neither. */
export function variationSelectorKind(codePoint: number): "ivs" | "svs" | null {
  if (codePoint >= IVS_MIN && codePoint <= IVS_MAX) return "ivs";
  if (codePoint >= SVS_MIN && codePoint <= SVS_MAX) return "svs";
  return null;
}

export interface ParsedUnit {
  /** The full slice consumed: the base character plus any variation selectors. */
  text: string;
  /** The base character alone. */
  base: string;
  /** The first variation selector, or null if the unit had none. Used for lookup. */
  vs: string | null;
  /**
   * How many variation selectors followed the base. Normally 0 or 1; a value
   * above 1 means a malformed sequence that callers must pass through
   * untouched rather than reduce (see below).
   */
  selectorCount: number;
}

/**
 * Reads one unit from the start of `text`. Returns null for empty input.
 * Code-point aware (astral base characters and astral variation selectors
 * are both handled), so this is safe to use on strings containing
 * supplementary-plane kanji.
 *
 * All consecutive variation selectors are consumed into the same unit. That
 * matters for correctness, not just tidiness: when only one was consumed, a
 * trailing selector was left to re-attach to whatever the previous unit
 * reduced to, so "辻"+VS17+VS18 came out as "辻"+VS18 — a variation sequence
 * that was not in the input at all, and one that then vanished on a second
 * pass, breaking idempotence.
 */
export function readFirstUnit(text: string): ParsedUnit | null {
  if (text.length === 0) return null;
  const base = String.fromCodePoint(text.codePointAt(0)!);
  let i = base.length;
  let vs: string | null = null;
  let selectorCount = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i)!;
    if (!isVariationSelector(cp)) break;
    const selector = String.fromCodePoint(cp);
    if (selectorCount === 0) vs = selector;
    selectorCount++;
    i += selector.length;
  }
  return { text: text.slice(0, i), base, vs, selectorCount };
}

/**
 * Splits `text` into an ordered array of units (see readFirstUnit).
 *
 * Implemented as a single linear scan with an advancing index rather than by
 * repeatedly calling readFirstUnit() on a shrinking `text.slice(...)`
 * remainder: the latter looks equivalent but is O(n^2), because
 * readFirstUnit's original implementation walked the entire remaining string
 * on every call. Measured on that version: ~50ms at 2,500 characters, ~2s at
 * 20,000, ~11s at 40,000. This version is linear in the length of `text`.
 */
export function splitUnits(text: string): ParsedUnit[] {
  const units: ParsedUnit[] = [];
  const len = text.length;
  let i = 0;
  while (i < len) {
    const start = i;
    const base = String.fromCodePoint(text.codePointAt(i)!);
    i += base.length;
    let vs: string | null = null;
    let selectorCount = 0;
    while (i < len) {
      const cp = text.codePointAt(i)!;
      if (!isVariationSelector(cp)) break;
      const selector = String.fromCodePoint(cp);
      if (selectorCount === 0) vs = selector;
      selectorCount++;
      i += selector.length;
    }
    units.push({ text: text.slice(start, i), base, vs, selectorCount });
  }
  return units;
}

/** Builds the lookup key used by REDUCE_BY_IVS: "baseHex_vsHex". */
export function ivsKey(base: string, vs: string): string {
  return `${base.codePointAt(0)!.toString(16)}_${vs.codePointAt(0)!.toString(16)}`;
}
