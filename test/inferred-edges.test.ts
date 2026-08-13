import { describe, expect, it } from "vitest";
import { getVariants } from "../src/getVariants.js";
import { isVariant } from "../src/isVariant.js";
import { VARIANT_ADJACENCY } from "../src/generated/tables.js";

// 推論エッジ(inferred): 同一 MJ 字形の候補同士を結ぶだけで、その2字について
// どの機関も何も述べていない対。瓡(MJ017531)は告示582号で第1順位 執・
// 第2順位 狐 を持つが、告示に 執―狐 の対応は存在しない。
const INFERRED_ONLY_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["井", "牛"],
  ["匕", "化"],
  ["信", "個"],
  ["歳", "遂"],
  ["執", "狐"],
];

// 縮退元→縮退先を機関が記録している対。どの設定でも true でなければならない。
const DIRECT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["﨑", "崎"],
  ["髙", "高"],
];

// 推論エッジでしか繋がらないが、実務上は明らかな異体字の対。MJ は縮退が必要な
// 字にしか縮退関係を記録しないので、両方が既に JIS X 0213 にある新旧字体は
// この形にしかならない。`includeInferred: false` はこれらも道連れにする——
// それがこのオプションを既定にしない理由であり、ここで固定しておく。
const INFERRED_BUT_REAL_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["猫", "貓"],
  ["摂", "攝"],
  ["併", "倂"],
  ["靱", "靭"],
  ["桝", "枡"],
];

describe("推論エッジ(inferred)", () => {
  it("既定では推論エッジも異体字として数える", () => {
    for (const [a, b] of [...INFERRED_ONLY_PAIRS, ...INFERRED_BUT_REAL_PAIRS]) {
      expect(isVariant(a, b), `${a}-${b}`).toBe(true);
      expect(isVariant(b, a), `${b}-${a}`).toBe(true);
    }
  });

  it("includeInferred: false は推論エッジを落とす(精度側に振る)", () => {
    for (const [a, b] of INFERRED_ONLY_PAIRS) {
      expect(isVariant(a, b, { includeInferred: false }), `${a}-${b}`).toBe(false);
    }
  });

  it("includeInferred: false の代償——本物の異体字対も落ちる", () => {
    // この5対が false になることが、このオプションを既定にしない理由。
    // README にも同じ並びで載せてある。
    for (const [a, b] of INFERRED_BUT_REAL_PAIRS) {
      expect(isVariant(a, b, { includeInferred: false }), `${a}-${b}`).toBe(false);
    }
  });

  it("記録された関係は includeInferred に関わらず true のまま", () => {
    for (const [a, b] of DIRECT_PAIRS) {
      expect(isVariant(a, b), `${a}-${b} 既定`).toBe(true);
      expect(isVariant(a, b, { includeInferred: false }), `${a}-${b} strict`).toBe(true);
    }
  });

  it("getVariants は推論エッジを落とさず inferred で区別する", () => {
    const fox = getVariants("執").find((v) => v.char === "狐");
    expect(fox).toBeDefined();
    expect(fox!.inferred).toBe(true);
    // 貓 は 猫 の唯一の隣接字で、しかも推論エッジ。除外していたら空になる。
    expect(getVariants("猫")).toEqual([
      { char: "貓", basis: ["jis-inclusion-rule", "family-register-notice"], inferred: true },
    ]);
    const saki = getVariants("﨑").find((v) => v.char === "崎");
    expect(saki!.inferred).toBe(false);
  });

  it("getVariants と isVariant が同じグラフを見ている", () => {
    for (const c of ["崎", "執", "葛", "淵", "髙"]) {
      const variants = getVariants(c);
      expect(variants.length, `${c} の候補が空だとこのループは無条件に通る`).toBeGreaterThan(0);
      for (const v of variants) {
        expect(isVariant(c, v.char), `${c}-${v.char} 既定`).toBe(true);
        // inferred なものだけが strict で落ちる。
        expect(isVariant(c, v.char, { includeInferred: false }), `${c}-${v.char} strict`).toBe(!v.inferred);
      }
    }
  });

  it("推論エッジはグラフ全体で実在し、かつ一部にとどまる", () => {
    let total = 0;
    let inferred = 0;
    for (const neighbors of Object.values(VARIANT_ADJACENCY)) {
      for (const [, , direct] of neighbors) {
        total++;
        if (direct === 0) inferred++;
      }
    }
    // 有向カウント(各無向辺を2回数える)。
    expect(total / 2).toBe(30653);
    expect(inferred / 2).toBe(3000);
  });

  it("不正な options を黙って無視しない", () => {
    // @ts-expect-error 実行時ガードの検証
    expect(() => isVariant("崎", "高", "true")).toThrow(TypeError);
    // @ts-expect-error 実行時ガードの検証
    expect(() => isVariant("崎", "高", { includeinferred: false })).toThrow(TypeError);
    // @ts-expect-error 実行時ガードの検証
    expect(() => isVariant("崎", "高", { includeInferred: "no" })).toThrow(TypeError);
    expect(() => isVariant("崎", "高", null as never)).toThrow(TypeError);
    // 既定が true である以上、落とすつもりの呼び出しを綴り違いで書くと
    // 黙って包含側に倒れる。それが一番痛い失敗なので必ず投げる。
    expect(() => isVariant("井", "牛", { includeInferrred: false } as never)).toThrow(TypeError);
  });
});
