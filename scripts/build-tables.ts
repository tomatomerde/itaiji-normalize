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

/**
 * The UCS values this MJ entry's 民一2842号通達別表 誤字俗字・正字一覧表 marks
 * 付記 = 別字 — "a different character".
 *
 * That annotation is the notice saying the two are NOT the same character, so
 * the target must not become a shrink candidate — but only within the three
 * lists IPA's own reference program actually filters it out of. In
 * mandel59/mj2jisx0213, MJ2JISX0213.es (see /workspace/mandel59/mj2jisx0213/
 * MJ2JISX0213.es):
 *
 *   - Step "1. JIS包摂・UCS統合規則" (lines 191-203) returns immediately when
 *     `JIS包摂規準・UCS統合規則` is present, using its first entry outright.
 *     Step "2.1 別字とされるものの除外" (line 209 onward, inside the
 *     `法務省戸籍法関連通達・通知` branch) is never even reached in that case,
 *     so a 付記=別字 UCS never gets the chance to knock out a JIS包摂 candidate.
 *   - When step 2.1 does run, it `us.reject`s the 別字 UCS from exactly three
 *     lists (lines 222-227): `法務省戸籍法関連通達・通知` (the list the 付記
 *     itself came from), `法務省告示582号別表第四`, and `辞書類等による関連字`.
 *     `JIS包摂規準・UCS統合規則` and `読み・字形による類推` are not touched —
 *     the loop simply never mentions them.
 *
 * This follows that exactly: excluding from only those three categories. 㐲's
 * entry lists 伏 under both the family-register notice and elsewhere, so
 * filtering only the notice's own list would leave the pair intact through
 * the other; excluding from all three still catches it. Skipping this filter
 * entirely folded 96 characters onto the very character the notice
 * distinguishes them from (㐲→伏, 㕍→雁, 㬌→景, 䇦→英) — but excluding it from
 * JIS包摂規準・UCS統合規則 too (as an earlier version of this script did) went
 * too far the other way: it stripped 宮 (U+5BAE) as a candidate for 宫
 * (U+5BAB), which JIS包摂規準・UCS統合規則 records as the same character, and
 * left 宫 folding onto the unrelated 共 (MOJ Notice 582's rank-2 pick) instead.
 */
const CATEGORIES_SUBJECT_TO_DIFFERENT_CHARACTER_EXCLUSION = new Set<(typeof CATEGORIES)[number]>([
  "法務省戸籍法関連通達・通知",
  "法務省告示582号別表第四",
  "辞書類等による関連字",
]);

function differentCharacterTargets(entry: Record<string, unknown>): Set<number> {
  const out = new Set<number>();
  const items = entry["法務省戸籍法関連通達・通知"] as Array<Record<string, string>> | undefined;
  if (!items) return out;
  for (const item of items) {
    if (item["付記"] === "別字" && item["UCS"]) out.add(parseUcs(item["UCS"]));
  }
  return out;
}

let differentCharacterCandidatesDropped = 0;
for (const entry of shrinkMap.content) {
  const name = entry["MJ文字図形名"];
  const excluded = differentCharacterTargets(entry);
  let targets: Map<number, CandidateDetail> | undefined;
  for (const cat of CATEGORIES) {
    const items = entry[cat] as Array<Record<string, string>> | undefined;
    if (!items) continue;
    const bit = CATEGORY_BIT[cat];
    const catSubjectToExclusion = CATEGORIES_SUBJECT_TO_DIFFERENT_CHARACTER_EXCLUSION.has(cat);
    for (const item of items) {
      const ucsStr = item["UCS"];
      if (!ucsStr) continue;
      const targetCp = parseUcs(ucsStr);
      if (catSubjectToExclusion && excluded.has(targetCp)) {
        differentCharacterCandidatesDropped++;
        continue;
      }
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
//
// Those two kinds of edge do NOT carry the same weight of evidence, and
// conflating them misrepresents the data. A source->target edge is something
// an authority actually recorded about that pair. A co-candidate edge is our
// inference: MOJ Notice 582 says 齍 may be written 斉 (rank 1) or 資 (rank 2),
// which relates 斉 and 資 only through 齍 — the notice never says 斉 and 資 are
// interchangeable. Reporting basis "moj-notice-582-appendix-4" on the 斉~資
// edge, as this table used to, puts words in the notice's mouth. The `direct`
// flag distinguishes them so getVariants() can say which is which; an edge
// that is inferred in one MJ entry and direct in another counts as direct.

interface Edge {
  bitmask: number;
  direct: boolean;
}

const adjacency = new Map<number, Map<number, Edge>>(); // char -> (otherChar -> edge)

function addEdge(a: number, b: number, bitmask: number, direct: boolean) {
  if (a === b) return;
  // Every edge must name at least one evidence category. An edge with an
  // empty bitmask would still be reported by getVariants(), with `basis: []`
  // and no indication that anything is missing — a relation asserted on no
  // recorded grounds at all, which is the one thing this package exists not
  // to do. No such edge exists in the current data; this keeps it that way
  // loudly rather than shipping one silently.
  if (bitmask === 0) {
    throw new Error(
      `refusing to emit an evidence-less variant edge U+${a.toString(16).toUpperCase()}–U+${b.toString(16).toUpperCase()}`,
    );
  }
  for (const [from, to] of [
    [a, b],
    [b, a],
  ] as const) {
    let bucket = adjacency.get(from);
    if (!bucket) adjacency.set(from, (bucket = new Map()));
    const existing = bucket.get(to);
    bucket.set(to, {
      bitmask: (existing?.bitmask ?? 0) | bitmask,
      direct: (existing?.direct ?? false) || direct,
    });
  }
}

for (const [mjName, candidates] of mjCandidates) {
  const identity = mjIdentity.get(mjName);
  const sourceCp = identity?.ucs ?? null;
  const entries = [...candidates.entries()];
  if (sourceCp !== null) {
    for (const [tgt, detail] of entries) addEdge(sourceCp, tgt, detail.bitmask, true);
  }
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [tA, dA] = entries[i]!;
      const [tB, dB] = entries[j]!;
      addEdge(tA, tB, dA.bitmask | dB.bitmask, false);
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

function serializeAdjacency(adj: Map<number, Map<number, Edge>>): Record<string, [string, number, number][]> {
  const out: Record<string, [string, number, number][]> = {};
  for (const [cp, others] of adj) {
    out[hex(cp)] = [...others.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([o, e]) => [hex(o), e.bitmask, e.direct ? 1 : 0]);
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

// char code point (hex) -> [otherCharHex, basisBitmask, direct][], undirected.
// direct is 1 when an authority recorded this pair itself, 0 when the edge is
// inferred from both characters being candidates of one MJ glyph.
export const VARIANT_ADJACENCY: Record<string, [string, number, number][]> = /* @__PURE__ */ JSON.parse(${toSingleQuotedJsLiteral(adjacencyJson)});
`;

writeFileSync(OUT_PATH, out);

const rawBytes = Buffer.byteLength(out, "utf8");
console.log(`Wrote ${OUT_PATH} (${(rawBytes / 1024).toFixed(0)}KB raw)`);
console.log(`REDUCE_BY_UCS keys: ${Object.keys(serializedReduceByUcs).length}`);
console.log(`REDUCE_BY_IVS keys (IVS + SVS): ${Object.keys(serializedReduceByIvs).length}`);
console.log(`VARIANT_ADJACENCY keys: ${Object.keys(serializedAdjacency).length}`);
console.log(`candidates dropped as 付記=別字 (a different character): ${differentCharacterCandidatesDropped}`);
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
