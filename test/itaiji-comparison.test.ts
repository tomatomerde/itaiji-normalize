import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { isVariant, reduce } from "../src/index.js";
import { REDUCE_BY_UCS } from "../src/generated/tables.js";

// 両 README は npm の `itaiji` との比較を断定形で載せている——「約19倍の対応数」
// 「1,404組のうち約86%」。出どころは `docs/phase0-report.md`(2026-08-04 の
// 実装前調査)で、**再現手段がリポジトリに無かった**。
//
// 比較の両側とも固定データセット(同梱の MJ縮退マップと、devDependency に
// 厳密指定で入れた itaiji 1.2.0)なので、この比較は決定的に測り直せる。
// 機械にも時刻にも依存しないから、CI で判定してよい種類の数値——スループットと
// 違ってフレークにならない。
//
// ここで測った値が README の唯一の出どころ。数値を pin するだけでなく、
// **README の本文もその数値を含んでいるか grep する**。片側だけ更新して
// 文書と実装がすれ違う、というのが 0.1.3 で実際に起きたことなので。
const require = createRequire(import.meta.url);
const ITAIJI_DICT = require("itaiji/dist/dict/seijitai.json") as Record<string, string>;
const ITAIJI_VERSION = (require("itaiji/package.json") as { version: string }).version;

const README_EN = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const README_JA = readFileSync(new URL("../README.ja.md", import.meta.url), "utf8");

const PAIRS = Object.entries(ITAIJI_DICT);

/** MJ 由来の非自明な対応(源字 ≠ 縮退先)を `源字+縮退先` の集合として取り出す。 */
function mjNonTrivialPairs(): ReadonlySet<string> {
  const pairs = new Set<string>();
  for (const [srcHex, candidates] of Object.entries(REDUCE_BY_UCS)) {
    const src = String.fromCodePoint(Number.parseInt(srcHex, 16));
    for (const candidate of candidates) {
      const target = String.fromCodePoint(Number.parseInt(candidate[0], 16));
      // 自分自身への縮退(= すでに JIS X 0213 内)は「対応」に数えない。
      if (target !== src) pairs.add(src + target);
    }
  }
  return pairs;
}

describe(`npm itaiji ${ITAIJI_VERSION} との比較(README の数値の出どころ)`, () => {
  it("itaiji の辞書は 1,404 組の 1:1 対応", () => {
    expect(PAIRS.length).toBe(1_404);
    // 「組」を文字対として数えてよい前提そのものを確かめる。多対多が混じると
    // 以下のカバー率の分母の意味が変わる。
    for (const [oldForm, newForm] of PAIRS) {
      expect([...oldForm].length, `${oldForm} は1文字`).toBe(1);
      expect([...newForm].length, `${newForm} は1文字`).toBe(1);
    }
    expect(README_EN).toContain("1,404");
    expect(README_JA).toContain("1,404");
  });

  it("直接縮退で再現できるのは 993 組(70.7%)", () => {
    const direct = PAIRS.filter(([oldForm, newForm]) =>
      reduce(oldForm).candidates.some((c) => c.char === newForm),
    );
    expect(direct.length).toBe(993);
  });

  it("等価クラス判定でカバーできるのは 1,197 組(85.3%)", () => {
    const covered = PAIRS.filter(([oldForm, newForm]) => isVariant(oldForm, newForm));
    expect(covered.length).toBe(1_197);
    // 端数の丸めで README と食い違わないよう、README が書く「約85%」まで含めて確かめる。
    expect(Math.round((covered.length / PAIRS.length) * 1000) / 10).toBe(85.3);
    expect(README_EN, "英語 README が 85% と書いている").toMatch(/\b85%/);
    expect(README_JA, "日本語 README が 85% と書いている").toMatch(/85%/);
  });

  it("カバーできない 207 組は、大半が MJ グラフに源字が無いもの", () => {
    const uncovered = PAIRS.filter(([oldForm, newForm]) => !isVariant(oldForm, newForm));
    expect(uncovered.length).toBe(207);
    // 内訳の主因は「源字が MJ に無い」(簡体字など、日本の行政文字集合を根拠とする
    // MJ の対象外)。これはデータの信頼性の差であって欠陥ではない、という
    // README の位置づけが今も成り立つかを確かめる。
    const absent = uncovered.filter(([oldForm]) => reduce(oldForm).candidates.length === 0);
    expect(absent.length).toBeGreaterThan(uncovered.length / 2);
  });

  it("MJ 独自の対応は 26,668 組 = itaiji の約 19 倍", () => {
    const mjPairs = mjNonTrivialPairs();
    expect(mjPairs.size).toBe(27_661);

    const alsoInItaiji = PAIRS.filter(([oldForm, newForm]) => mjPairs.has(oldForm + newForm));
    expect(alsoInItaiji.length).toBe(993);

    const unique = mjPairs.size - alsoInItaiji.length;
    expect(unique).toBe(26_668);

    const ratio = unique / PAIRS.length;
    // README は「約19倍」と書いている。18.5〜19.5 に収まるかぎりその表現は正しい。
    expect(ratio).toBeGreaterThan(18.5);
    expect(ratio).toBeLessThan(19.5);
    expect(README_EN).toMatch(/19x/);
    expect(README_JA).toMatch(/19倍/);
  });

  it("両字ともすでに JIS 内の新旧字体ペアは縮退では変換されない(README の但し書き)", () => {
    // README が名指しする例。「itaiji の完全上位互換ではない」という位置づけが
    // 実装と合っているかを、例そのもので確かめる。
    for (const [oldForm, newForm] of [
      ["啞", "唖"],
      ["鷗", "鴎"],
    ] as const) {
      expect(ITAIJI_DICT[oldForm], `itaiji は ${oldForm}→${newForm} を持つ`).toBe(newForm);
      expect(
        reduce(oldForm).candidates.map((c) => c.char),
        `${oldForm} の縮退候補に ${newForm} は入らない`,
      ).not.toContain(newForm);
      expect(README_EN).toContain(oldForm);
      expect(README_JA).toContain(oldForm);
    }
  });
});
