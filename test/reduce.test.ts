import { describe, expect, it } from "vitest";
import { reduce } from "../src/reduce.js";

describe("reduce", () => {
  it("﨑(U+FA11) を 崎 に一意に縮退する", () => {
    const result = reduce("﨑");
    expect(result.unique).toBe("崎");
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.some((c) => c.char === "崎")).toBe(true);
  });

  it("髙(はしごだか, U+9AD9) を 高 に一意に縮退する", () => {
    const result = reduce("髙");
    expect(result.unique).toBe("高");
  });

  it("既に JIS 代表字である文字は自分自身を候補に含む", () => {
    const result = reduce("崎");
    expect(result.candidates.some((c) => c.char === "崎")).toBe(true);
  });

  it("自己候補は順位もホップ数も持たないので一意選択で勝たない", () => {
    // JIS包摂規準・UCS統合規則 の候補はたいてい「その文字自身」で、MJ の
    // 「既に表現可能」という表明にあたる。この候補は順位もホップ数も持たない
    // ため最下位ティアに落ち、戸籍通達のホップ数を持つ候補に必ず負ける。
    // 結果 unique は「この字形の JIS X 0213 表現」ではなく畳んだ先になる。
    // 名寄せとしては望ましい挙動だが README に書くまで説明が無かった。
    const ki = reduce("㐂");
    expect(ki.candidates.map((c) => c.char).sort()).toEqual(["㐂", "喜"]);
    expect(ki.unique).toBe("喜");
    expect(reduce("㠀").unique).toBe("島");
  });

  it("unique は CJK 互換漢字になりうる(NFKC で安定しない)", () => {
    // reduce() は正規化しない。toMatchingKey() はホップ毎に正規化するので
    // キーは安定するが、unique を直接キーに使う利用者は自分で正規化する
    // 必要がある。README の該当記述はこの実例に基づく。
    // 見た目が区別できないのでコードポイントで書く。
    const COMPAT_UME = "\uFA44"; // 互換漢字の 梅
    const UNIFIED_UME = "\u6885"; // 統合漢字の 梅
    const ume = reduce("\u6973").unique; // 楳
    expect(ume).toBe(COMPAT_UME);
    expect(ume!.normalize("NFKC")).toBe(UNIFIED_UME);
    expect(COMPAT_UME).not.toBe(UNIFIED_UME);
  });

  it("邉 は複数候補(辺・邊)が拮抗し、勝手に一意化せず unique=null を返す", () => {
    // 邊/邉/辺 クラスタのうち、邉 は根拠が拮抗する実例。「曖昧さを隠さない」
    // 設計の直接的な検証。邊・辺 はそれぞれ辺・邊自身に一意に解決するが、
    // 邉 は 辺・邊 の両方が同格の根拠(family-register-notice)を持つため
    // 一意選択が恣意的になり null を返す。conditional にせず必ず要求する。
    const bian = reduce("邉");
    expect(bian.candidates.length).toBeGreaterThanOrEqual(2);
    expect(bian.unique).toBeNull();
  });

  it("候補ゼロの文字は空配列と unique=null を返す(存在しない文字を捏造しない)", () => {
    const result = reduce("A");
    expect(result.candidates).toEqual([]);
    expect(result.unique).toBeNull();
  });

  it("basis は既知の文字列のみで構成される", () => {
    const result = reduce("﨑");
    expect(result.candidates.length).toBeGreaterThan(0);
    const validBases = new Set([
      "jis-inclusion-rule",
      "moj-notice-582-appendix-4",
      "dictionary",
      "family-register-notice",
      "reading-shape-analogy",
    ]);
    for (const candidate of result.candidates) {
      for (const b of candidate.basis) {
        expect(validBases.has(b)).toBe(true);
      }
      expect(candidate.basis.length).toBeGreaterThan(0);
    }
  });

  it("複数文字を渡すと例外を投げる(黙って先頭文字だけ処理しない)", () => {
    expect(() => reduce("崎田")).toThrow(TypeError);
  });

  it("空文字列を渡すと例外を投げる(1文字ちょうどを要求する契約と一貫させる)", () => {
    expect(() => reduce("")).toThrow(TypeError);
  });

  it("IVS(異体字セレクタ)付き入力を1単位として受理する", () => {
    // 辻 U+8FBB + IVS U+E0100 (辻の異体字セレクタ付き表現)
    const withIvs = "辻\u{E0100}";
    expect(() => reduce(withIvs)).not.toThrow();
    const result = reduce(withIvs);
    expect(result.input).toBe(withIvs);
  });

  it("IVS 付き入力で候補が見つからない場合、基底文字にフォールバックし、resolvedVia='base' を返す", () => {
    const base = reduce("辻");
    const withUnknownIvs = `辻${String.fromCodePoint(0xe01ef)}`; // このIVSは生成テーブルに存在しない
    const withFallback = reduce(withUnknownIvs);
    // フォールバックにより基底文字と同じ候補集合になる
    expect(withFallback.candidates.map((c) => c.char).sort()).toEqual(base.candidates.map((c) => c.char).sort());
    expect(withFallback.resolvedVia).toBe("base");
  });

  it("実在する IVS キーで解決した場合、resolvedVia='ivs' を返し、基底文字と異なる候補集合になり得る", () => {
    // U+35F4(基底) の候補は自分自身のみだが、IVS U+E0102 付きだと U+9F57 も
    // 候補に加わる実例(生成テーブルで確認済み)。IVS を無視して基底文字に
    // フォールバックしていたら、この違いは失われてしまう。
    const base = String.fromCodePoint(0x35f4);
    const withRealIvs = base + String.fromCodePoint(0xe0102);
    const baseResult = reduce(base);
    const ivsResult = reduce(withRealIvs);
    expect(ivsResult.resolvedVia).toBe("ivs");
    expect(baseResult.resolvedVia).toBe("base");
    expect(ivsResult.candidates.some((c) => c.char === String.fromCodePoint(0x9f57))).toBe(true);
    expect(baseResult.candidates.some((c) => c.char === String.fromCodePoint(0x9f57))).toBe(false);
  });

  it("MJ に存在しない文字は resolvedVia='none' を返す", () => {
    expect(reduce("A").resolvedVia).toBe("none");
  });
});
