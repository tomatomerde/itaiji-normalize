/**
 * Regenerates src/generated/tables.ts from the committed data snapshots.
 *
 * Inputs (never fetched over the network — see data/snapshot/PROVENANCE.md):
 *   - data/snapshot/MJShrinkMap.1.2.0.json   (MJ Shrink Map, source of truth
 *     for character relations, keyed by MJ glyph name)
 *   - data/generated/mji-list.tsv            (MJ glyph name -> UCS/IVS,
 *     extracted from data/snapshot/mji.00602.xlsx by scripts/extract-mji.py;
 *     re-run that script first if the xlsx snapshot changes)
 *
 * Run: npm run build:tables
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const SHRINK_MAP_PATH = path.join(root, "data/snapshot/MJShrinkMap.1.2.0.json");
const MJI_LIST_PATH = path.join(root, "data/generated/mji-list.tsv");
const OUT_PATH = path.join(root, "src/generated/tables.ts");

// Category order MUST match BASIS_ORDER in src/basis.ts (bit i <-> BASIS_ORDER[i]).
const CATEGORIES = [
  "JIS包摂規準・UCS統合規則",
  "法務省告示582号別表第四",
  "辞書類等による関連字",
  "法務省戸籍法関連通達・通知",
  "読み・字形による類推",
] as const;
const BIT = {
  jisInclusion: 1 << 0,
  mojNotice: 1 << 1,
  dictionary: 1 << 2,
  familyRegister: 1 << 3,
  readingShape: 1 << 4,
};
const CATEGORY_BIT: Record<(typeof CATEGORIES)[number], number> = {
  "JIS包摂規準・UCS統合規則": BIT.jisInclusion,
  "法務省告示582号別表第四": BIT.mojNotice,
  "辞書類等による関連字": BIT.dictionary,
  "法務省戸籍法関連通達・通知": BIT.familyRegister,
  "読み・字形による類推": BIT.readingShape,
};

function parseUcs(s: string): number {
  // "U+3005" -> 0x3005
  return Number.parseInt(s.slice(2), 16);
}

function parseRank(s: string): number | null {
  // "第1順位" -> 1
  const m = /第(\d+)順位/.exec(s);
  return m ? Number.parseInt(m[1]!, 10) : null;
}

// --- 1. Load MJ glyph name -> UCS / IVS / SVS from the extracted list ------
//
// IMPORTANT: keyed identity must come from 実装したUCS ("implemented UCS" —
// the code point this specific MJ glyph is actually realized as), NOT from
// 対応するUCS ("corresponding UCS" — a looser reference used when the glyph
// has no code point of its own, e.g. only reachable via an IVS). Using
// 対応するUCS as the plain-character key merges a glyph's shrink candidates
// into an unrelated character's bucket whenever the two diverge — found via
// MJ059281 (対応するUCS=U+6B6F "歯", 実装したUCS empty, only reachable via
// IVS 6B6F_E0102): keying on 対応するUCS made plain 歯 inherit candidates
// that belong only to that IVS variant, producing a non-convergent pair
// (reduce("歯").unique === "齒" and reduce("齒").unique === "歯"). All hex
// keys are lowercased here so they match the lowercase output of
// `.toString(16)` used throughout src/ (ivsKey() in particular).
interface MjIdentity {
  ucs: number | null;
  /**
   * Every variation sequence this glyph is reachable through, as lowercase
   * "baseHex_vsHex" keys. Both the IVS and SVS columns feed this, and a
   * single cell can hold more than one sequence.
   */
  variationKeys: string[];
}

/**
 * A few rows carry several variation sequences in one cell, joined with ";"
 * (e.g. MJ059399's IVS cell is "2B9E4_E0100;535A_E010A"). Splitting is not
 * cosmetic: without it the whole cell became one key, so those sequences
 * were unreachable through the public API — 4 real variation sequences on
 * MJ059399/MJ059400 resolved to nothing.
 */
function parseVariationCell(cell: string): string[] {
  if (!cell) return [];
  return cell
    .split(";")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
}

const mjiLines = readFileSync(MJI_LIST_PATH, "utf8").split("\n");
const header = mjiLines.shift()!.split("\t");
const col = Object.fromEntries(header.map((h, i) => [h, i]));
const mjIdentity = new Map<string, MjIdentity>();
let danglingNoUcsNoVariant = 0;
for (const line of mjiLines) {
  if (!line) continue;
  const cells = line.split("\t");
  const name = cells[col["MJ文字図形名"]!]!;
  const ucsCell = cells[col["実装したUCS"]!] ?? "";
  const variationKeys = [
    ...parseVariationCell(cells[col["実装したMoji_JohoコレクションIVS"]!] ?? ""),
    ...parseVariationCell(cells[col["実装したSVS"]!] ?? ""),
  ];
  if (!ucsCell && variationKeys.length === 0) danglingNoUcsNoVariant++;
  mjIdentity.set(name, {
    ucs: ucsCell ? parseUcs(ucsCell) : null,
    variationKeys,
  });
}

// --- 2. Load the shrink map and collect, per MJ entry, candidate targets ---

interface ShrinkEntry {
  MJ文字図形名: string;
  [key: string]: unknown;
}

const shrinkMap = JSON.parse(readFileSync(SHRINK_MAP_PATH, "utf8")) as {
  content: ShrinkEntry[];
};

interface CandidateDetail {
  bitmask: number;
  bestRank: number | null; // best (lowest) 順位 across 法務省告示582号別表第四 entries for this pair
  bestHop: number | null; // best (lowest) ホップ数 across 法務省戸籍法関連通達 entries for this pair
}

function mergeDetail(a: CandidateDetail, b: CandidateDetail): CandidateDetail {
  return {
    bitmask: a.bitmask | b.bitmask,
    bestRank: a.bestRank === null ? b.bestRank : b.bestRank === null ? a.bestRank : Math.min(a.bestRank, b.bestRank),
    bestHop: a.bestHop === null ? b.bestHop : b.bestHop === null ? a.bestHop : Math.min(a.bestHop, b.bestHop),
  };
}

// mjName -> (targetCp -> detail)
const mjCandidates = new Map<string, Map<number, CandidateDetail>>();

for (const entry of shrinkMap.content) {
  const name = entry["MJ文字図形名"];
  let targets: Map<number, CandidateDetail> | undefined;
  for (const cat of CATEGORIES) {
    const items = entry[cat] as Array<Record<string, string>> | undefined;
    if (!items) continue;
    const bit = CATEGORY_BIT[cat];
    for (const item of items) {
      const ucsStr = item["UCS"];
      if (!ucsStr) continue;
      const targetCp = parseUcs(ucsStr);
      const detail: CandidateDetail = {
        bitmask: bit,
        bestRank: cat === "法務省告示582号別表第四" ? parseRank(item["順位"] ?? "") : null,
        bestHop: cat === "法務省戸籍法関連通達・通知" && item["ホップ数"] ? Number.parseInt(item["ホップ数"]!, 10) : null,
      };
      if (!targets) targets = new Map();
      const existing = targets.get(targetCp);
      targets.set(targetCp, existing ? mergeDetail(existing, detail) : detail);
    }
  }
  if (targets) mjCandidates.set(name, targets);
}

// --- 3. Build UCS-keyed and variation-sequence-keyed reduce tables ---------
// (merge across MJ names sharing an identity). REDUCE_BY_IVS covers both
// IVS and SVS keys — they're both "baseHex_vsHex" strings and consumed
// identically by ivsKey()/readFirstUnit() in src/ivs.ts, which don't
// distinguish the two variation-selector ranges either.

type ReduceTable = Map<number | string, Map<number, CandidateDetail>>;

const reduceByUcs: ReduceTable = new Map();
const reduceByIvs: ReduceTable = new Map();

function mergeIntoBucket(table: ReduceTable, key: number | string, candidates: Map<number, CandidateDetail>) {
  let bucket = table.get(key);
  if (!bucket) table.set(key, (bucket = new Map()));
  for (const [tgt, detail] of candidates) {
    const existing = bucket.get(tgt);
    bucket.set(tgt, existing ? mergeDetail(existing, detail) : detail);
  }
}

let unreachableWithCandidates = 0;
for (const [mjName, candidates] of mjCandidates) {
  const identity = mjIdentity.get(mjName);
  if (!identity) continue;
  if (identity.ucs !== null) mergeIntoBucket(reduceByUcs, identity.ucs, candidates);
  for (const key of identity.variationKeys) mergeIntoBucket(reduceByIvs, key, candidates);
  if (identity.ucs === null && identity.variationKeys.length === 0) unreachableWithCandidates++;
}

// --- 4. Build the undirected variant adjacency graph -----------------------
// Edge (source, target) for every resolved reduction pair, plus edges between
// every pair of co-candidates of the same MJ entry (they are, by construction,
// alternate JIS-representable forms of that one MJ glyph — see docs/phase0-report.md #6).

const adjacency = new Map<number, Map<number, number>>(); // char -> (otherChar -> bitmask)

function addEdge(a: number, b: number, bitmask: number) {
  if (a === b) return;
  let bucketA = adjacency.get(a);
  if (!bucketA) adjacency.set(a, (bucketA = new Map()));
  bucketA.set(b, (bucketA.get(b) ?? 0) | bitmask);
  let bucketB = adjacency.get(b);
  if (!bucketB) adjacency.set(b, (bucketB = new Map()));
  bucketB.set(a, (bucketB.get(a) ?? 0) | bitmask);
}

for (const [mjName, candidates] of mjCandidates) {
  const identity = mjIdentity.get(mjName);
  const sourceCp = identity?.ucs ?? null;
  const entries = [...candidates.entries()];
  if (sourceCp !== null) {
    for (const [tgt, detail] of entries) addEdge(sourceCp, tgt, detail.bitmask);
  }
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [tA, dA] = entries[i]!;
      const [tB, dB] = entries[j]!;
      addEdge(tA, tB, dA.bitmask | dB.bitmask);
    }
  }
}

// --- 5. Serialize --------------------------------------------------------

function hex(n: number): string {
  return n.toString(16);
}

// [targetHex, bitmask, bestRank, bestHop]
type SerializedCandidate = [string, number, number | null, number | null];

function serializeReduceTable(table: ReduceTable): Record<string, SerializedCandidate[]> {
  const out: Record<string, SerializedCandidate[]> = {};
  for (const [key, candidates] of table) {
    const keyStr = typeof key === "number" ? hex(key) : key;
    out[keyStr] = [...candidates.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([tgt, d]) => [hex(tgt), d.bitmask, d.bestRank, d.bestHop] as SerializedCandidate);
  }
  return out;
}

function serializeAdjacency(adj: Map<number, Map<number, number>>): Record<string, [string, number][]> {
  const out: Record<string, [string, number][]> = {};
  for (const [cp, others] of adj) {
    out[hex(cp)] = [...others.entries()].sort((a, b) => a[0] - b[0]).map(([o, b]) => [hex(o), b]);
  }
  return out;
}

const serializedReduceByUcs = serializeReduceTable(reduceByUcs);
const serializedReduceByIvs = serializeReduceTable(reduceByIvs);
const serializedAdjacency = serializeAdjacency(adjacency);

// JSON's only characters that are special inside a single-quoted JS string
// literal are backslash and single-quote; neither appears in our alphabet
// (hex digits, digits, ",", ":", "[", "]", "{", "}", "u", "l", "n"). Escaping
// them anyway keeps this correct if that ever changes, while avoiding the
// blanket double-quote escaping that JSON.stringify(jsonString) would add
// (which roughly doubles the embedded payload size for no reason).
function toSingleQuotedJsLiteral(json: string): string {
  return `'${json.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

const reduceByUcsJson = JSON.stringify(serializedReduceByUcs);
const reduceByIvsJson = JSON.stringify(serializedReduceByIvs);
const adjacencyJson = JSON.stringify(serializedAdjacency);

const banner = `/**
 * GENERATED FILE. Do not edit by hand.
 * Regenerate with: npm run build:tables
 * Source: data/snapshot/MJShrinkMap.1.2.0.json + data/generated/mji-list.tsv
 * See data/snapshot/PROVENANCE.md for data provenance and licensing (CC BY-SA 2.1 JP).
 */
`;

// The /* @__PURE__ */ annotations are load-bearing, not decoration. Bundlers
// cannot prove JSON.parse is side-effect-free on their own, so without them
// every table is retained even when nothing references it, and package.json's
// "sideEffects": false buys nothing. Measured with esbuild on a consumer that
// imports only isVariant (which needs VARIANT_ADJACENCY alone): 550KB gzip
// without the annotations, 280KB with them.
const out = `${banner}
// Each candidate tuple is [targetCodePointHex, basisBitmask, bestRank, bestHop].
// basisBitmask bit i corresponds to BASIS_ORDER[i] in src/basis.ts.
export type SerializedCandidate = [string, number, number | null, number | null];

// source UCS code point (hex, no "U+" prefix) -> candidates
export const REDUCE_BY_UCS: Record<string, SerializedCandidate[]> = /* @__PURE__ */ JSON.parse(${toSingleQuotedJsLiteral(reduceByUcsJson)});

// "baseHex_vsHex" IVS key -> candidates
export const REDUCE_BY_IVS: Record<string, SerializedCandidate[]> = /* @__PURE__ */ JSON.parse(${toSingleQuotedJsLiteral(reduceByIvsJson)});

// char code point (hex) -> [otherCharHex, basisBitmask][], undirected
export const VARIANT_ADJACENCY: Record<string, [string, number][]> = /* @__PURE__ */ JSON.parse(${toSingleQuotedJsLiteral(adjacencyJson)});
`;

writeFileSync(OUT_PATH, out);

const rawBytes = Buffer.byteLength(out, "utf8");
console.log(`Wrote ${OUT_PATH} (${(rawBytes / 1024).toFixed(0)}KB raw)`);
console.log(`REDUCE_BY_UCS keys: ${Object.keys(serializedReduceByUcs).length}`);
console.log(`REDUCE_BY_IVS keys (IVS + SVS): ${Object.keys(serializedReduceByIvs).length}`);
console.log(`VARIANT_ADJACENCY keys: ${Object.keys(serializedAdjacency).length}`);
const malformedKeys = Object.keys(serializedReduceByIvs).filter((k) => !/^[0-9a-f]+_[0-9a-f]+$/.test(k));
if (malformedKeys.length > 0) {
  throw new Error(
    `Refusing to emit malformed variation-sequence keys (expected "baseHex_vsHex"): ${JSON.stringify(malformedKeys.slice(0, 10))}`,
  );
}

console.log(
  `MJ list rows with no identity at all (no 実装したUCS/IVS/SVS): ${danglingNoUcsNoVariant}`,
);
console.log(
  `MJ entries with shrink candidates but unreachable by any character input (no 実装したUCS/IVS/SVS): ${unreachableWithCandidates}`,
);
