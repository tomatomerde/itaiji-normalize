import { describe, expect, it } from "vitest";
import { REDUCE_BY_IVS, REDUCE_BY_UCS } from "../src/generated/tables.js";
import { toMatchingKey } from "../src/toMatchingKey.js";

// This file exists because of a real regression found by review, twice:
// first a data-pipeline bug made some characters reduce to each other in a
// non-convergent loop, then a fix for a different bug (normalizing IVS
// lookup keys) surfaced MJ entries whose stable form is a CJK Compatibility
// Ideograph that toMatchingKey wasn't re-normalizing, producing a different
// non-fixed-point failure for a different set of characters. A couple of
// hand-picked examples were not enough to catch either class in advance —
// this sweeps every character the shipped table actually knows about.
describe("toMatchingKey convergence (full sweep)", () => {
  it("every REDUCE_BY_UCS character's key is a fixed point of toMatchingKey", () => {
    const failures: string[] = [];
    for (const hex of Object.keys(REDUCE_BY_UCS)) {
      const char = String.fromCodePoint(Number.parseInt(hex, 16));
      const once = toMatchingKey(char).key;
      const twice = toMatchingKey(once).key;
      if (once !== twice) failures.push(`U+${hex} -> ${once} -> ${twice}`);
    }
    expect(failures).toEqual([]);
  });

  it("every REDUCE_BY_IVS character+selector's key is a fixed point of toMatchingKey", () => {
    const failures: string[] = [];
    for (const key of Object.keys(REDUCE_BY_IVS)) {
      const [baseHex, vsHex] = key.split("_");
      const char = String.fromCodePoint(Number.parseInt(baseHex!, 16)) + String.fromCodePoint(Number.parseInt(vsHex!, 16));
      const once = toMatchingKey(char).key;
      const twice = toMatchingKey(once).key;
      if (once !== twice) failures.push(`${key} -> ${once} -> ${twice}`);
    }
    expect(failures).toEqual([]);
  });
});
