import { describe, expect, it } from "vitest";
import { reduce } from "../src/reduce.js";
import { toMatchingKey } from "../src/toMatchingKey.js";

describe("toMatchingKey", () => {
  it("﨑田 と 崎田 が同じキーになる(表記揺れの同一視)", () => {
    expect(toMatchingKey("﨑田").key).toBe(toMatchingKey("崎田").key);
  });

  it("1回の reduce() では止まらず、安定するまで縮退を繰り返す(多段階の収束)", () => {
    // 㕐 -> 冩 -> 写 という2段階の縮退連鎖の実例(実データで確認済み)。
    // reduce("㕐").unique は "冩" であって "写" ではない — toMatchingKey が
    // 1回の reduce() 呼び出しで止まっていたら、㕐 は "冩" のままになり、
    // 冩自身(1段階で"写"に届く)と表記揺れとして一致しなくなってしまう。
    // これが直っていることを保証する回帰テスト。
    expect(toMatchingKey("㕐").key).toBe("写");
    expect(toMatchingKey("冩").key).toBe("写");
    expect(toMatchingKey("写").key).toBe("写");
    expect(toMatchingKey("㕐").key).toBe(toMatchingKey("冩").key);
  });

  it("縮退先が CJK互換漢字であっても、キー自体が正規化され不動点になる", () => {
    // 㙇(U+3647)は縮退先が U+FA4A(CJK互換漢字)で、reduce(U+FA4A).unique も
    // 自分自身(=不動点)。しかし U+FA4A は NFKC で U+7422(琢)に分解される
    // ため、reduce() の結果を正規化せずにそのままキーへ採用すると、㙇 と
    // 素の 琢 が別々のキーになってしまう回帰があった。中間・最終ホップの
    // 結果を都度正規化することで、両者が同じキーに収束することを保証する。
    const gyoku1 = String.fromCodePoint(0x3647); // 㙇
    const gyoku2 = String.fromCodePoint(0x7422); // 琢(統合漢字)
    const gyoku3 = String.fromCodePoint(0xfa4a); // 琢(CJK互換漢字)
    const k1 = toMatchingKey(gyoku1).key;
    const k2 = toMatchingKey(gyoku2).key;
    const k3 = toMatchingKey(gyoku3).key;
    expect(k1).toBe(gyoku2);
    expect(k1).toBe(k2);
    expect(k1).toBe(k3);
  });

  it("循環(cycle)は、根拠が拮抗する曖昧さ(ambiguous)とは別の reason で報告される", () => {
    // 址/阯 は互いに縮退し合う実在する2サイクルの例(実データで確認済み)。
    // 各ホップ単体は候補1つの一意な選択で「曖昧」ではないため、拮抗による
    // ambiguous(邉の例)とは区別して cycle として報告する。
    const result = toMatchingKey("址");
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0]!.reason).toBe("cycle");
    expect(result.key).toBe("址");
  });

  it("髙橋 と 高橋 が同じキーになる", () => {
    expect(toMatchingKey("髙橋").key).toBe(toMatchingKey("高橋").key);
  });

  it("全解決できた文字列は unresolved が空", () => {
    const result = toMatchingKey("﨑田髙橋");
    expect(result.unresolved).toEqual([]);
  });

  it("MJ に存在しない漢字は no-candidate として unresolved に載り、原文のまま残す", () => {
    // 龟(U+9F9F)は簡体字で MJ の対象外。漢字なので「縮退できるはずが
    // できなかった」対象として報告される。
    const result = toMatchingKey("崎龟さん");
    const missing = result.unresolved.find((u) => u.char === "龟");
    expect(missing?.reason).toBe("no-candidate");
    expect(result.key).toContain("龟");
  });

  it("かな・英数字・記号は unresolved に載せない(漢字だけを報告する)", () => {
    // 以前は MJ にエントリの無い文字をすべて no-candidate として報告していたため、
    // 住所1行で34文字中33文字が unresolved に載り、`if (unresolved.length)` という
    // 自然な呼び出し側チェックが常に発火してフィールドの情報量がゼロだった。
    const result = toMatchingKey("㈱ｶﾌﾞｼｷ 〒100-0001 TEL:03-1234-5678");
    expect(result.unresolved).toEqual([]);
    const name = toMatchingKey("﨑山　さゆり");
    expect(name.key).toBe("崎山 さゆり");
    expect(name.unresolved).toEqual([]);
  });

  it("拮抗した候補が別々の終着点に至る場合は ambiguous として載る", () => {
    // 朢(U+6722)の候補 望 と 聖 は互いに縮退せず、それぞれ別の不動点に至る。
    // どちらも常用漢字なので常用漢字/人名用漢字タイブレークも決めない
    // (2つ以上あれば決めないのがそのタイブレーク自身の規則)。
    // どちらを選ぶかは根拠のない当て推量になるので解決しない。
    const result = toMatchingKey("朢");
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0]!.reason).toBe("ambiguous");
    // 未解決時は原文の文字がそのままキーに残る(黙って何かに変換しない)
    expect(result.key).toBe("朢");
  });

  it("渡辺・渡邊・渡邉 はすべて同じキーに一致する", () => {
    // 邉 の候補 辺 と 邊 は rank/hop の根拠では同点だが、辺 が常用漢字で
    // 邊 がそうではないため、常用漢字/人名用漢字タイブレークで reduce()
    // 自体が直接 辺 に決める(以前はここが null で、下の
    // 「拮抗しても全分岐が同じ不動点に収束するなら解決する」の仕組みに
    // 頼っていた — そちらは今も別の文字で機能する。次のテスト参照)。
    // 修正前は 渡邊 だけが 渡辺 と一致し 渡邉 は一致しないという、
    // どちらか一方に倒すより悪い状態だった。
    expect(reduce("邉").unique).toBe("辺");
    expect(toMatchingKey("邉").key).toBe("辺");
    expect(toMatchingKey("邉").unresolved).toEqual([]);
    const keys = ["渡辺", "渡邊", "渡邉"].map((n) => toMatchingKey(n).key);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("渡辺");
  });

  it("拮抗しても全分岐が同じ不動点に収束するなら解決する", () => {
    // 覛(U+899B)の候補 覓 と 覔 は常用漢字/人名用漢字タイブレークでも
    // 決まらない(どちらも施策の対象外)ため reduce() は null を返すが、
    // 覔 自身も 覓 に縮退するため、どちらの枝をたどっても行き着く先は
    // 覓 で変わらない。これは当て推量ではなく「選択が結果を変えないことの
    // 証明」なので toMatchingKey は解決してよい。
    expect(reduce("覛").unique).toBeNull(); // reduce() 自体は1段階なので依然 null
    expect(toMatchingKey("覛").key).toBe("覓");
    expect(toMatchingKey("覛").unresolved).toEqual([]);
  });

  it("既定(NFKC)は CJK互換漢字を統合漢字に正規化する", () => {
    // U+FA19(CJK互換漢字)は NFKC で統合漢字 U+795E(神)に分解される。
    // U+FA19 自体もたまたま MJ に直接のエントリを持つため(下のテスト参照)、
    // ここでは MJ に一切エントリのない互換漢字 U+F900 で NFKC 単体の効果を見る。
    const compat = String.fromCodePoint(0xf900);
    const unified = compat.normalize("NFKC");
    expect(unified).not.toBe(compat);
    expect(toMatchingKey(compat).key).toBe(toMatchingKey(unified).key);
    expect(toMatchingKey(compat).unresolved).toEqual([]);
  });

  it("unicodeNormalize: false で正規化を無効化すると、MJに対応エントリのない互換漢字は no-candidate のまま残る", () => {
    // U+F900 は MJ にエントリを持たない(生成テーブルで確認済み)ため、
    // 正規化を無効化すると縮退できず原文のまま残る。
    const compat = String.fromCodePoint(0xf900);
    const result = toMatchingKey(compat, { unicodeNormalize: false });
    expect(result.key.codePointAt(0)).toBe(compat.codePointAt(0));
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0]!.reason).toBe("no-candidate");
  });

  it("U+FA19 は MJ自身が直接のエントリを持つため、正規化を無効化しても神に縮退できる", () => {
    // これは「NFKCがないと互換漢字は必ず no-candidate になる」という誤った
    // 前提を検証中に発見した実データの事実: U+FA19 は MJ 上でも
    // family-register-notice の根拠を持つ独立したエントリであり、NFKC に
    // 頼らず MJ データ単独でも 神(U+795E)に縮退できる。
    const compat = String.fromCodePoint(0xfa19);
    const unified = String.fromCodePoint(0x795e);
    const result = toMatchingKey(compat, { unicodeNormalize: false });
    expect(result.key).toBe(unified);
    expect(result.unresolved).toEqual([]);
  });

  it("unicodeNormalize: 'NFC' は CJK互換漢字以外の異体字(髙など)には影響しない", () => {
    const withNfc = toMatchingKey("髙橋", { unicodeNormalize: "NFC" });
    expect(withNfc.key).toBe("高橋");
  });

  it("index は(正規化後の)文字列中の位置を指す", () => {
    const result = toMatchingKey("a龟b", { unicodeNormalize: false });
    const missing = result.unresolved.find((u) => u.char === "龟");
    expect(missing?.index).toBe(1);
  });

  it("IVS付き入力を含む文字列も1単位として処理する", () => {
    const withIvs = `辻${String.fromCodePoint(0xe0100)}田中`;
    expect(() => toMatchingKey(withIvs)).not.toThrow();
  });

  it("未解決の場合、変異セレクタを含む単位全体を原文のままキーに残す", () => {
    // 基底文字自体が MJ に無い漢字(龟)に、生成テーブルに存在しない IVS を付ける。
    // 基底へフォールバックしても候補ゼロなので未解決になり、そのとき単位全体
    // (基底+VS)がキーに残ることを確認する。
    const withUnknownIvs = `龟${String.fromCodePoint(0xe01ef)}`;
    const result = toMatchingKey(withUnknownIvs, { unicodeNormalize: false });
    expect(result.key).toBe(withUnknownIvs);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0]!.char).toBe(withUnknownIvs);
  });

  it("部首形(康熙部首・CJK部首補助)も未解決なら報告する", () => {
    // 見た目は漢字なので、縮退されずに素通しされたことを呼び出し側が知りたい対象。
    // ⺅(U+2E85, CJK部首補助)は NFKC でも統合漢字に畳まれないため、
    // どの正規化モードでも黙って通り抜けてしまうと気づけない。
    const radicalSupplement = String.fromCodePoint(0x2e85);
    const result = toMatchingKey(radicalSupplement);
    expect(result.key).toBe(radicalSupplement);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0]!.reason).toBe("no-candidate");

    // 康熙部首 ⽊(U+2F4A)は NFKC では 木 に畳まれて解決するが、
    // 正規化を切ると解決できないので報告対象になる。
    const kangxi = String.fromCodePoint(0x2f4a);
    expect(toMatchingKey(kangxi).key).toBe("木");
    expect(toMatchingKey(kangxi, { unicodeNormalize: false }).unresolved).toHaveLength(1);
  });

  it("U+FE0F(絵文字表示セレクタ)を異体字セレクタとして食べて捨てない", () => {
    // 以前は SVS 範囲を U+FE00–FE0F としていたため、縮退できる基底文字に
    // U+FE0F が続くと丸ごと消えていた(BMP掃引で20,335文字が脱落)。
    // MJ データが実際に使う SVS は U+FE00 と U+FE01 のみなので、
    // 表示セレクタ(FE0E/FE0F)を範囲から外すことで解消している。
    const vs16 = String.fromCodePoint(0xfe0f);
    for (const base of ["㊗", "髙", "崎"]) {
      const key = toMatchingKey(base + vs16).key;
      expect(key.endsWith(vs16)).toBe(true);
    }
  });

  it("変異セレクタが複数付いた単位は縮退せず原文のまま返し、冪等性を保つ", () => {
    // 以前は1つ目のセレクタだけ消費していたため、辻+VS17 が素の辻へ縮退した後に
    // 孤立した VS18 が後続し、入力に無かった異体字シーケンス(辻+VS18)を捏造していた。
    // さらに再適用すると消えるため冪等性も壊れていた。
    const multi = `辻${String.fromCodePoint(0xe0100)}${String.fromCodePoint(0xe0101)}`;
    const result = toMatchingKey(multi);
    expect(result.key).toBe(multi);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0]!.reason).toBe("unsupported-sequence");
    expect(toMatchingKey(result.key).key).toBe(result.key);
  });

  it("非文字列を渡すと関数名と受け取った型を含む TypeError を投げる", () => {
    // JS からの呼び出しで配列を渡したとき、以前は例外にならず
    // もっともらしい誤答が返っていた。
    expect(() => toMatchingKey(["崎"] as unknown as string)).toThrow(/toMatchingKey\(\).*an array/);
    expect(() => toMatchingKey(null as unknown as string)).toThrow(/null/);
  });

  it("空文字列は空キーを返す", () => {
    expect(toMatchingKey("")).toEqual({ key: "", normalized: "", unresolved: [] });
  });
});
