/**
 * A basis is the type of evidence the MJ Shrink Map records for a
 * character-to-character relation. Multiple bases can apply to the same
 * pair (e.g. both a family register notice and a dictionary entry).
 */
export type Basis =
  | "jis-inclusion-rule"
  | "moj-notice-582-appendix-4"
  | "dictionary"
  | "family-register-notice"
  | "reading-shape-analogy";

/**
 * Order matches the bit position used in the generated tables
 * (bit 0 = jis-inclusion-rule, ... bit 4 = reading-shape-analogy).
 * Keep this in sync with scripts/build-tables.ts.
 */
export const BASIS_ORDER: readonly Basis[] = [
  "jis-inclusion-rule",
  "moj-notice-582-appendix-4",
  "dictionary",
  "family-register-notice",
  "reading-shape-analogy",
];

export function basisMaskToList(mask: number): Basis[] {
  const out: Basis[] = [];
  for (let i = 0; i < BASIS_ORDER.length; i++) {
    if (mask & (1 << i)) out.push(BASIS_ORDER[i] as Basis);
  }
  return out;
}
