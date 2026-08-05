import { describe, expect, it } from "vitest";
import { getVariants } from "../src/getVariants.js";
import { isVariant } from "../src/isVariant.js";

describe("getVariants", () => {
  it("崎 の異体字候補に 﨑 を含む", () => {
    const variants = getVariants("崎");
    expect(variants.some((v) => v.char === "﨑")).toBe(true);
  });

  it("返す候補すべてが isVariant() と整合する", () => {
    const variants = getVariants("崎");
    // 崎 は実データで複数候補を持つことを既に確認済み(他のテスト参照)。
    // このループが空配列で無条件に通ってしまわないことを保証する。
    expect(variants.length).toBeGreaterThan(0);
    for (const v of variants) {
      expect(isVariant("崎", v.char)).toBe(true);
    }
  });

  it("自分自身を候補として含まない", () => {
    const variants = getVariants("崎");
    expect(variants.some((v) => v.char === "崎")).toBe(false);
  });

  it("MJ に存在しない文字は空配列を返す", () => {
    expect(getVariants("A")).toEqual([]);
  });

  it("各候補の basis は空でない", () => {
    const variants = getVariants("崎");
    expect(variants.length).toBeGreaterThan(0);
    for (const v of variants) {
      expect(v.basis.length).toBeGreaterThan(0);
    }
  });

  it("複数文字を渡すと例外を投げる", () => {
    expect(() => getVariants("崎田")).toThrow(TypeError);
  });
});
