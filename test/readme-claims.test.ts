import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getVariants, isVariant, reduce, toMatchingKey } from "../src/index.js";

// README (both languages) makes concrete claims about specific characters:
// "reduce("邉").unique is still null", "getVariants("崎") returns 5 entries",
// and so on. The statistics in "文書が主張する統計値" (data-invariants.test.ts)
// do not cover these — and 0.1.3 shipped with exactly that gap: the 常用漢字
// tiebreak changed reduce("邉").unique from null to 辺 for 504 characters,
// every pinned statistic was updated, and the sentence in both READMEs saying
// 邉 stays null went out contradicting the code it documents.
//
// So each per-character claim gets an assertion here, and the two files are
// grepped for the character so a claim cannot quietly move or vanish without
// this failing too. Add a row here whenever the README gains a claim of the
// form "reduce(X) gives Y".
const README_EN = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const README_JA = readFileSync(new URL("../README.ja.md", import.meta.url), "utf8");

describe("README が名指ししている文字の挙動", () => {
  const UNIQUE_CLAIMS: ReadonlyArray<readonly [string, string | null, string]> = [
    ["﨑", "崎", "冒頭の例"],
    ["㐂", "喜", "自己候補が畳まれる例"],
    ["㠀", "島", "同上"],
    ["楳", "梅", "unique が CJK互換漢字になる例(U+FA44)"],
    [String.fromCodePoint(0x21968), null, "reduce は拮抗を解決しない例(𡥨: 㬜/晉)"],
  ];

  for (const [char, expected, label] of UNIQUE_CLAIMS) {
    it(`reduce(${char}).unique は ${expected === null ? "null" : expected}(${label})`, () => {
      expect(reduce(char).unique).toBe(expected);
      expect(README_EN, "英語 README がこの文字に言及している").toContain(char);
      expect(README_JA, "日本語 README がこの文字に言及している").toContain(char);
    });
  }

  it("𡥨 は reduce では拮抗するが toMatchingKey は 晋 に解決する(役割分担の実例)", () => {
    const c = String.fromCodePoint(0x21968);
    expect(reduce(c).candidates.map((x) => x.char).sort()).toEqual(["晉", "㬜"].sort());
    expect(toMatchingKey(c).key).toBe("晋");
    // 分岐が同じ不動点に至ることが「証明」の中身。両方を個別に確かめる。
    expect(toMatchingKey("㬜").key).toBe("晋");
    expect(toMatchingKey("晉").key).toBe("晋");
  });

  it("渡邉・渡邊・渡辺 が同じキーになる", () => {
    expect(toMatchingKey("渡邉").key).toBe(toMatchingKey("渡辺").key);
    expect(toMatchingKey("渡邊").key).toBe(toMatchingKey("渡辺").key);
  });

  it("getVariants(崎) は5件で、㟢 嵜 陭 﨑 𡼋", () => {
    expect(getVariants("崎").map((v) => v.char).sort()).toEqual(["㟢", "嵜", "陭", "﨑", "𡼋"].sort());
  });

  it("isVariant が true でも toMatchingKey のキーは揃わないことがある(猫/貓)", () => {
    expect(isVariant("猫", "貓")).toBe(true);
    expect(toMatchingKey("猫").key).not.toBe(toMatchingKey("貓").key);
  });

  it("README の絞り込み例は 井→牛 を落とし、本物の対は落とさない", () => {
    const drop = (char: string) =>
      getVariants(char).filter(
        (v) => !(v.inferred && v.basis.length === 1 && v.basis[0] === "moj-notice-582-appendix-4"),
      );
    expect(drop("井").map((v) => v.char)).not.toContain("牛");
    for (const [a, b] of [
      ["猫", "貓"],
      ["摂", "攝"],
      ["併", "倂"],
      ["靱", "靭"],
      ["桝", "枡"],
    ] as const) {
      expect(drop(a).map((v) => v.char), `${a}/${b} は残る`).toContain(b);
    }
  });

  it("NFKC が畳む例(㈱ № ①②③ ㌢ ﬁ Ⅻ)が README のとおり", () => {
    const CASES: ReadonlyArray<readonly [string, string]> = [
      ["㈱", "(株)"],
      ["№", "No"],
      ["①②③", "123"],
      ["㌢", "センチ"],
      ["ﬁ", "fi"],
      ["Ⅻ", "XII"],
    ];
    for (const [input, expected] of CASES) expect(toMatchingKey(input).normalized).toBe(expected);
  });

  it("㍿㖒 の index 例が README のとおり", () => {
    const r = toMatchingKey("㍿㖒");
    expect(r.normalized).toBe("株式会社㖒");
    expect(r.unresolved[0]!.index).toBe(4);
    expect(r.normalized.slice(4)).toBe("㖒");
  });
});
