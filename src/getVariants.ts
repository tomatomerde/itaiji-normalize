import { VARIANT_ADJACENCY } from "./generated/tables.js";
import { basisMaskToList } from "./basis.js";
import { readFirstUnit } from "./ivs.js";
import { requireString } from "./validate.js";
import type { Candidate } from "./types.js";

/**
 * Lists the characters directly related to `char` in the MJ variant graph
 * (see isVariant.ts for what "directly related" means), with evidence.
 * Order carries no meaning. Returns an empty array for a character with no
 * recorded relations — that is not the same as the character being unknown
 * to MJ entirely; both cases simply produce no variants to list.
 */
export function getVariants(char: string): Candidate[] {
  requireString(char, "getVariants", "its argument");
  const unit = readFirstUnit(char);
  if (!unit || unit.text.length !== char.length) {
    throw new TypeError(
      `getVariants() expects a single character optionally followed by one variation selector, got: ${JSON.stringify(char)}`,
    );
  }
  const baseHex = unit.base.codePointAt(0)!.toString(16);
  const neighbors = VARIANT_ADJACENCY[baseHex];
  if (!neighbors) return [];
  return neighbors.map(([hex, bitmask]) => ({
    char: String.fromCodePoint(Number.parseInt(hex, 16)),
    basis: basisMaskToList(bitmask),
  }));
}
