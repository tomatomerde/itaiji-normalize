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

  it("邉 は 辺・邊 が同格の根拠で拮抗するが、辺 が常用漢字であるため一意に決まる", () => {
    // 邊/邉/辺 クラスタのうち、邉 は rank/hop の根拠だけでは決まらない実例
    // (辺・邊 の両方が同格の family-register-notice を持つ)。常用漢字/
    // 人名用漢字によるタイブレークを追加する前は、ここで unique=null を
    // 返していた。辺 が常用漢字で邊 がそうではないため、いまは一意に決まる。
    const bian = reduce("邉");
    expect(bian.candidates.length).toBeGreaterThanOrEqual(2);
    expect(bian.unique).toBe("辺");
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

// rank/hop tier では決まらない拮抗に対する追加のタイブレーク。IPA 自身の
// リファレンス実装(mandel59/mj2jisx0213)と同じ規則: 常用漢字が1つだけなら
// それを選ぶ、2つ以上あれば決めない、常用漢字が無く人名用漢字が1つだけなら
// それを選ぶ、2つ以上あればJIS水準最小のもの(複数あれば決めない)。
// すべて data/snapshot/mji.00602.xlsx の「漢字施策」列を実測して確認した例。
describe("常用漢字/人名用漢字によるタイブレーク", () => {
  it("常用漢字がちょうど1つなら、それを選ぶ(正の例)", () => {
    // 丗(U+4E17): 候補は 世(常用漢字)・丗(自己候補)・卅(施策なし)。
    expect(reduce("丗").unique).toBe("世");
    // 蝅(U+87C5): 候補は 蚕(常用漢字)・蠶(施策なし)。
    expect(reduce("蝅").unique).toBe("蚕");
    // 邉(U+9089): 候補は 辺(常用漢字)・邉(自己候補)・邊(施策なし)。
    expect(reduce("邉").unique).toBe("辺");
  });

  it("常用漢字が2つ以上なら決めない(負の例)", () => {
    // 朢(U+6722): 候補の 望・聖 はどちらも常用漢字。リファレンス実装も
    // ここでは決めない — 独自規則を足すと根拠を失う。
    const nozomi = reduce("朢");
    expect(nozomi.candidates.map((c) => c.char).sort()).toEqual(["望", "聖"]);
    expect(nozomi.unique).toBeNull();

    // 功(U+529F): 候補の 切・功 もどちらも常用漢字。
    const kou = reduce("功");
    expect(kou.candidates.map((c) => c.char).sort()).toEqual(["切", "功"]);
    expect(kou.unique).toBeNull();
  });

  it("常用漢字が無く人名用漢字がちょうど1つなら、それを選ぶ", () => {
    // 剠(U+5260): 候補は 掠(人名用漢字)・黥(施策なし)。
    const ryaku = reduce("剠");
    expect(ryaku.candidates.map((c) => c.char).sort()).toEqual(["掠", "黥"]);
    expect(ryaku.unique).toBe("掠");
  });

  it("人名用漢字が2つ以上で JIS水準が異なれば、最小の水準を選ぶ", () => {
    // 𨖈(U+28588): 候補は 遙(人名用漢字・水準2)・遥(人名用漢字・水準1)。
    const you = reduce(String.fromCodePoint(0x28588));
    expect(you.candidates.map((c) => c.char).sort()).toEqual(["遙", "遥"].sort());
    expect(you.unique).toBe("遥");
  });

  it("人名用漢字が2つ以上で JIS水準も同じなら決めない", () => {
    // 𣘰(U+23630): 候補は 亘・亙、どちらも人名用漢字・水準1。
    const kou2 = reduce(String.fromCodePoint(0x23630));
    expect(kou2.candidates.map((c) => c.char).sort()).toEqual(["亙", "亘"].sort());
    expect(kou2.unique).toBeNull();
  });
});
