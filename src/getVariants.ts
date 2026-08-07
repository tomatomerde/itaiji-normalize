import { VARIANT_ADJACENCY } from "./generated/tables.js";
import { basisMaskToList } from "./basis.js";
import { requireSingleUnitBase } from "./unit.js";
import type { Variant } from "./types.js";

/**
 * Lists the characters directly related to `char` in the MJ variant graph
 * (see isVariant.ts for what "directly related" means), with evidence.
 * Order carries no meaning. Returns an empty array for a character with no
 * recorded relations — that is not the same as the character being unknown
 * to MJ entirely; both cases simply produce no variants to list.
 *
 * Check `inferred` before quoting `basis` as an authority's word on the
 * pair: roughly a tenth of the graph's edges exist only because both
 * characters are candidates of one shared MJ glyph, and on those edges
 * `basis` describes that shared relationship rather than a statement about
 * these two characters. See Variant.inferred.
 */
export function getVariants(char: string): Variant[] {
  const baseHex = requireSingleUnitBase(char, "getVariants", "its argument");
  const neighbors = VARIANT_ADJACENCY[baseHex];
  if (!neighbors) return [];
  return neighbors.map(([hex, bitmask, direct]) => ({
    char: String.fromCodePoint(Number.parseInt(hex, 16)),
    basis: basisMaskToList(bitmask),
    inferred: direct === 0,
  }));
}
