import { describe, expect, it } from "vitest";
import { REDUCE_BY_IVS, REDUCE_BY_UCS } from "../src/generated/tables.js";
import { isCjkIdeograph } from "../src/cjk.js";
import { reduce } from "../src/reduce.js";
import { toMatchingKey } from "../src/toMatchingKey.js";

// Assumptions the runtime code relies on that are properties of the shipped
// data rather than of the code. Each was verified by hand against the current
// snapshot; pinning them here means a future data update that violates one
// fails loudly instead of silently changing behavior.
describe("生成データが満たすべき不変条件", () => {
  it("REDUCE_BY_UCS の全キーが CJK 漢字の範囲に入る", () => {
    // toMatchingKey は isCjkIdeograph() で unresolved の報告対象を絞っている。
    // MJ の縮退元がこの範囲から外れると、その文字は「縮退できなかった」ことを
    // 報告されないまま素通しされてしまう。
    const outside = Object.keys(REDUCE_BY_UCS).filter((hex) => !isCjkIdeograph(Number.parseInt(hex, 16)));
    expect(outside).toEqual([]);
  });

  it("どの縮退先も NFKC/NFC で複数コードポイントに展開されない", () => {
    // reduceToFixedPoint は各ホップの結果を正規化してから再び reduce() に渡す。
    // 縮退先が複数文字に展開されると reduce() の「1単位ちょうど」契約を破って
    // 例外になるため、この前提が崩れていないことを固定する。
    const targets = new Set<string>();
    for (const list of Object.values(REDUCE_BY_UCS)) for (const c of list) targets.add(c[0]);
    for (const list of Object.values(REDUCE_BY_IVS)) for (const c of list) targets.add(c[0]);

    const expanding: string[] = [];
    for (const hex of targets) {
      const ch = String.fromCodePoint(Number.parseInt(hex, 16));
      if ([...ch.normalize("NFKC")].length !== 1 || [...ch.normalize("NFC")].length !== 1) {
        expanding.push(hex);
      }
    }
    expect(expanding).toEqual([]);
  });

  it("変異シーケンスのキーがすべて整形式で、公開APIから到達できる", () => {
    // 一覧表の一部の行は1セルに複数のシーケンスを ";" で連結して持つ
    // (例: MJ059399 の "2B9E4_E0100;535A_E010A")。分割せずにキー化すると
    // セル全体が1つの不正なキーになり、実在する4件のシーケンスがどの入力
    // からも引けなくなっていた。
    const malformed = Object.keys(REDUCE_BY_IVS).filter((k) => !/^[0-9a-f]+_[0-9a-f]+$/.test(k));
    expect(malformed).toEqual([]);

    const unreachable: string[] = [];
    for (const key of Object.keys(REDUCE_BY_IVS)) {
      const [baseHex, vsHex] = key.split("_");
      const input =
        String.fromCodePoint(Number.parseInt(baseHex!, 16)) + String.fromCodePoint(Number.parseInt(vsHex!, 16));
      if (reduce(input).resolvedVia === "none") unreachable.push(key);
    }
    expect(unreachable).toEqual([]);
  });

  it("MJ データが使う SVS は実装が受理する範囲(U+FE00–FE0D)に収まる", () => {
    // 表示セレクタ U+FE0E/U+FE0F を範囲から外した根拠。データが実際に使うのは
    // U+FE00 と U+FE01 だけなので、絵文字を壊さないための除外で失うものは無い。
    const svsSelectors = new Set<number>();
    for (const key of Object.keys(REDUCE_BY_IVS)) {
      const cp = Number.parseInt(key.split("_")[1]!, 16);
      if (cp >= 0xfe00 && cp <= 0xfe0f) svsSelectors.add(cp);
    }
    expect(svsSelectors.size).toBeGreaterThan(0);
    for (const cp of svsSelectors) expect(cp).toBeLessThanOrEqual(0xfe0d);
  });
});

describe("U+FE0F は決して失われない", () => {
  it("BMP の漢字全域で、基底に続く U+FE0F がキーに残る", () => {
    // 修正前はこの掃引で 20,335 文字が U+FE0F を落としていた。
    const vs16 = String.fromCodePoint(0xfe0f);
    const dropped: string[] = [];
    for (let cp = 0x3400; cp <= 0xfaff; cp++) {
      const key = toMatchingKey(String.fromCodePoint(cp) + vs16).key;
      if (!key.endsWith(vs16)) dropped.push(cp.toString(16));
    }
    expect(dropped).toEqual([]);
  });
});
