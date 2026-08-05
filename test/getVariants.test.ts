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

  it("根拠を借用した推論エッジを inferred で区別する", () => {
    // 法務省告示582号別表第四は「齍 は 斉(第1順位)または 資(第2順位)と
    // 書ける」と言っているだけで、斉 と 資 が相互に置換可能とは言っていない。
    // 以前は 斉~資 のエッジに basis: moj-notice-582-appendix-4 が付いており、
    // 告示が言っていないことを言ったことにしてしまっていた。
    const variants = getVariants("斉");
    const shi = variants.find((v) => v.char === "資");
    const sai = variants.find((v) => v.char === "齍");
    expect(shi?.inferred).toBe(true); // 齍 を介した推論であって告示の記載ではない
    expect(sai?.inferred).toBe(false); // 告示が実際に 齍→斉 を記載している
  });

  it("直接エッジと推論エッジの両方が実データに存在する", () => {
    // どちらか一方しか無ければ inferred フラグは意味を持たない。
    const variants = getVariants("斉");
    expect(variants.some((v) => v.inferred)).toBe(true);
    expect(variants.some((v) => !v.inferred)).toBe(true);
  });
});
