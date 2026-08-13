import { describe, expect, it } from "vitest";
import { REDUCE_BY_IVS, REDUCE_BY_UCS, VARIANT_ADJACENCY } from "../src/generated/tables.js";
import { isCjkIdeograph } from "../src/cjk.js";
import { isVariant } from "../src/isVariant.js";
import { reduce } from "../src/reduce.js";
import { toMatchingKey } from "../src/toMatchingKey.js";

// Assumptions the runtime code relies on that are properties of the shipped
// data rather than of the code. Each was verified by hand against the current
// snapshot; pinning them here means a future data update that violates one
// fails loudly instead of silently changing behavior.
describe("生成データが満たすべき不変条件", () => {
  it("根拠ビットが1つも立っていない異体字エッジが存在しない", () => {
    // 根拠ゼロのエッジは getVariants() から basis: [] で出ていき、何が欠けて
    // いるかも分からないまま「根拠のある対応」として扱われてしまう。
    // 生成側(build-tables.ts の addEdge)は mask 0 を投げて拒否するので、
    // ここはその表明の裏取り。
    const zero: string[] = [];
    for (const [hex, neighbors] of Object.entries(VARIANT_ADJACENCY)) {
      for (const [other, mask] of neighbors) if (mask === 0) zero.push(`${hex}-${other}`);
    }
    expect(zero).toEqual([]);
  });

  it("隣接字が推論エッジだけの文字は 34 文字", () => {
    // `includeInferred: false` にすると異体字が1つも無くなる文字。
    // README がこの数を挙げている。生成テーブルを触ったときに、この
    // オプションがどれだけの文字を沈黙させるかを見落とさないための固定。
    const silenced = Object.entries(VARIANT_ADJACENCY).filter(([, neighbors]) =>
      neighbors.every(([, , direct]) => direct === 0),
    );
    expect(silenced.length).toBe(34);
    for (const [hex, neighbors] of silenced) {
      const char = String.fromCodePoint(Number.parseInt(hex, 16));
      for (const [otherHex] of neighbors) {
        const other = String.fromCodePoint(Number.parseInt(otherHex, 16));
        expect(isVariant(char, other), `${char}-${other} 既定`).toBe(true);
        expect(isVariant(char, other, { includeInferred: false }), `${char}-${other} strict`).toBe(false);
      }
    }
  });

  it("民一2842号通達が「別字」と明記した字へは縮退しない", () => {
    // 付記=別字 は通達が「これは別の文字だ」と言っている印。IPA 自身の
    // リファレンス実装(MJ2JISX0213.es の 2.1)は、その UCS をそのMJ字形の
    // **全カテゴリ**から除外する。この除外を入れる前は、113字中96字が
    // まさに「別字」とされた相手に畳まれていた(㐲→伏、㕍→雁、㬌→景)。
    const CASES: ReadonlyArray<readonly [string, string]> = [
      ["㐲", "伏"],
      ["㕍", "雁"],
      ["㡄", "恂"],
      ["㬌", "景"],
      ["㲹", "汎"],
      ["䇦", "英"],
      ["䝷", "智"],
      ["䢖", "建"],
    ];
    for (const [src, different] of CASES) {
      expect(reduce(src).candidates.map((c) => c.char), `${src} の候補`).not.toContain(different);
      expect(reduce(src).unique, `${src} の unique`).not.toBe(different);
      expect(toMatchingKey(src).key, `${src} のキー`).not.toBe(different);
    }
  });

  it("別字の除外は JIS包摂規準・UCS統合規則の候補には及ばない", () => {
    // mandel59/mj2jisx0213 の MJ2JISX0213.es は、JIS包摂規準・UCS統合規則が
    // あればそれで確定して return する(191-203行目)。付記=別字 を全カテゴリ
    // から除外する処理(2.1, 209-228行目)はその戸籍法関連通達の分岐の中に
    // あり、JIS包摂規準・UCS統合規則が存在する時点でそこには到達しない。
    // つまり JIS包摂規準・UCS統合規則の候補は、その MJ 字形が別字リストに
    // 何を挙げていようと一切対象外——この5件は、かつて(0.1.0-0.1.2)全カテ
    // ゴリから除外していたせいで消えていた候補。
    const REVIVED: ReadonlyArray<{ label: string; input: string; expected: string }> = [
      { label: "MJ006478 亮+IVS(E0102)", input: `亮${String.fromCodePoint(0xe0102)}`, expected: "亮" },
      { label: "MJ010148 宫(U+5BAB)", input: "宫", expected: "宮" },
      { label: "MJ019956 紀+IVS(E0102)", input: `紀${String.fromCodePoint(0xe0102)}`, expected: "紀" },
      { label: "MJ024358 記+IVS(E0102)", input: `記${String.fromCodePoint(0xe0102)}`, expected: "記" },
      { label: "MJ058447 𮎰(U+2E3B0)", input: String.fromCodePoint(0x2e3b0), expected: "荒" },
      {
        label: "MJ058447 𮎰+IVS(E0100)",
        input: String.fromCodePoint(0x2e3b0) + String.fromCodePoint(0xe0100),
        expected: "荒",
      },
    ];
    for (const { label, input, expected } of REVIVED) {
      const r = reduce(input);
      const hit = r.candidates.find((c) => c.char === expected);
      expect(hit, `${label}: ${expected} が候補に含まれる`).toBeTruthy();
      expect(hit!.basis, `${label}: ${expected} の根拠に jis-inclusion-rule が含まれる`).toContain(
        "jis-inclusion-rule",
      );
    }

    // このうち4件は JIS包摂規準・UCS統合規則が唯一の候補になるので、
    // unique/toMatchingKey もその値まで解決する。
    for (const { label, input, expected } of REVIVED) {
      if (label === "MJ010148 宫(U+5BAB)") continue; // 下の別テストで扱う
      expect(reduce(input).unique, `${label} の unique`).toBe(expected);
      expect(toMatchingKey(input).key, `${label} のキー`).toBe(expected);
    }
  });

  it("宫(U+5BAB) は 宮(U+5BAE) を候補として取り戻すが、unique は共(U+5171)のまま残る", () => {
    // 宫 だけは 法務省告示582号別表第四 に第2順位(共)も記録されているため、
    // 「候補が復活する」ことと「unique がそれに変わる」ことは別問題になる。
    // 宮(順位1位)は別字除外で告示582側の順位情報を失って jis-inclusion-rule
    // だけの tier2 候補になり、tier0(順位あり)の共に pickBest で負ける
    // (src/reduce.ts の tier 規則: JIS包摂規準は順位もホップ数も持たない
    // ので必ず最後の tier)。すなわち、この修正が直すのは「候補一覧から
    // 宮が消えていた」ことであり、「unique が無関係な共に畳まれる」こと
    // そのものではない――同じ根の問題ではあるが、pickBest の tier 設計
    // (1,246 件の自己候補と共通のルール)まで変えないと解消しない、別の
    // 論点として残っている。
    const r = reduce("宫");
    expect(r.candidates.map((c) => c.char).sort()).toEqual(["共", "宮"]);
    expect(r.candidates.find((c) => c.char === "宮")!.basis).toEqual(["jis-inclusion-rule"]);
    expect(r.unique).toBe("共");
    expect(toMatchingKey("宫").key).toBe("共");
  });

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

// README(英日)と src/reduce.ts / src/toMatchingKey.ts の JSDoc が挙げている
// 統計値。0.1.0/0.1.1 の README は、ラウンド6の別字修正**前**のテーブルで実測
// した値(40,368キー、拮抗898字、1,277字、54字、251字)を、修正後のテーブルと
// 一緒に出荷していた——数値を固定するテストが無く、データが変わっても文書が
// 落ちなかったため。ここで固定しておけば、次のデータ更新でこのテストが落ち、
// 文書の数値を実測し直すことを強制できる。期待値はテーブルとは独立に、この
// テスト内の素朴な再実装で数える(実装の出力を期待値にしない)。
describe("文書が主張する統計値", () => {
  const BIT_MOJ_NOTICE = 1 << 1;
  const BIT_FAMILY_REGISTER = 1 << 3;

  // pickBest と同じ tier 規則の独立な再実装(src/reduce.ts は import しない)
  function tiersOf(list: ReadonlyArray<readonly [string, number, number | null, number | null]>) {
    return list
      .map((c) => {
        const [, mask, rank, hop] = c;
        let tier: number, secondary: number;
        if (mask & BIT_MOJ_NOTICE && rank !== null) {
          tier = 0;
          secondary = rank;
        } else if (mask & BIT_FAMILY_REGISTER && hop !== null) {
          tier = 1;
          secondary = hop;
        } else {
          tier = 2;
          secondary = 0;
        }
        return { hex: c[0], tier, secondary };
      })
      .sort((a, b) => a.tier - b.tier || a.secondary - b.secondary);
  }
  function bestTie(list: ReadonlyArray<readonly [string, number, number | null, number | null]>) {
    if (list.length < 2) return null;
    const s = tiersOf(list);
    const best = s[0]!;
    const tied = s.filter((x) => x.tier === best.tier && x.secondary === best.secondary);
    return tied.length > 1 ? { tier: best.tier, hexes: tied.map((x) => x.hex) } : null;
  }

  it("テーブルキーは 30,345(文字)+ 9,950(変異シーケンス)= 40,295", () => {
    expect(Object.keys(REDUCE_BY_UCS).length).toBe(30_345);
    expect(Object.keys(REDUCE_BY_IVS).length).toBe(9_950);
  });

  it("異体字グラフは 30,653 エッジ、うち推論エッジ 3,000", () => {
    const seen = new Map<string, number>();
    for (const [src, neighbors] of Object.entries(VARIANT_ADJACENCY)) {
      for (const [dst, , direct] of neighbors) {
        const key = src < dst ? `${src}|${dst}` : `${dst}|${src}`;
        const prev = seen.get(key);
        if (prev !== undefined) expect(prev, `${key} の direct が非対称`).toBe(direct);
        else seen.set(key, direct);
      }
    }
    expect(seen.size).toBe(30_653);
    expect([...seen.values()].filter((d) => d === 0).length).toBe(3_000);
  });

  it("順位(告示582)は決してタイを作らない。タイはホップ tier に 234、無順位 tier に 572", () => {
    let rankTies = 0,
      hopTies = 0,
      unrankedTies = 0;
    for (const list of [...Object.values(REDUCE_BY_UCS), ...Object.values(REDUCE_BY_IVS)]) {
      const tie = bestTie(list);
      if (tie === null) continue;
      if (tie.tier === 0) rankTies++;
      else if (tie.tier === 1) hopTies++;
      else unrankedTies++;
    }
    expect(rankTies).toBe(0);
    expect(hopTies).toBe(234);
    expect(unrankedTies).toBe(572);
  });

  it("拮抗する 806 キーのうち、toMatchingKey(既定 NFKC)は 343 を解決し 463 が ambiguous のまま", () => {
    let resolved = 0,
      ambiguous = 0;
    const others: string[] = [];
    for (const [hex, list] of Object.entries(REDUCE_BY_UCS)) {
      if (bestTie(list) === null) continue;
      const r = toMatchingKey(String.fromCodePoint(Number.parseInt(hex, 16)));
      if (r.unresolved.length === 0) resolved++;
      else if (r.unresolved[0]!.reason === "ambiguous") ambiguous++;
      else others.push(hex);
    }
    for (const [key, list] of Object.entries(REDUCE_BY_IVS)) {
      if (bestTie(list) === null) continue;
      const [baseHex, vsHex] = key.split("_");
      const input =
        String.fromCodePoint(Number.parseInt(baseHex!, 16)) + String.fromCodePoint(Number.parseInt(vsHex!, 16));
      const r = toMatchingKey(input);
      if (r.unresolved.length === 0) resolved++;
      else if (r.unresolved[0]!.reason === "ambiguous") ambiguous++;
      else others.push(key);
    }
    // 拮抗キーの未解決理由は必ず "ambiguous"(cycle 等に化けない)
    expect(others).toEqual([]);
    expect(resolved + ambiguous).toBe(806);
    expect(resolved).toBe(343);
    expect(ambiguous).toBe(463);
  });

  it("自己候補(JIS包摂の「既に表現可能」)を持つ 1,246 キーが別字に畳まれ、47 キーが拮抗で null", () => {
    let folds = 0,
      ties = 0;
    for (const [key, list] of Object.entries(REDUCE_BY_UCS)) {
      if (!list.some(([hex]) => hex === key) || list.length < 2) continue;
      const tie = bestTie(list);
      if (tie !== null) ties++;
      else if (tiersOf(list)[0]!.hex !== key) folds++;
    }
    expect(folds).toBe(1_246);
    expect(ties).toBe(47);
  });

  it("順位優先とホップ優先は 248 キーで別の勝者を選ぶ(例: 㓮 は 順位→雕 / ホップ→彫)", () => {
    // hop tier を先に置いた対抗案との差分。tier 順が結果を変えるキーの数を
    // 固定し、ヒューリスティックの選択が中立でないことを文書と一致させる。
    function winnerWith(
      list: ReadonlyArray<readonly [string, number, number | null, number | null]>,
      hopFirst: boolean,
    ): string | null {
      if (list.length === 0) return null;
      if (list.length === 1) return list[0]![0];
      const s = list
        .map((c) => {
          const [, mask, rank, hop] = c;
          const hasRank = !!(mask & BIT_MOJ_NOTICE) && rank !== null;
          const hasHop = !!(mask & BIT_FAMILY_REGISTER) && hop !== null;
          let tier: number, secondary: number;
          if (hopFirst ? hasHop : hasRank) {
            tier = 0;
            secondary = hopFirst ? hop! : rank!;
          } else if (hopFirst ? hasRank : hasHop) {
            tier = 1;
            secondary = hopFirst ? rank! : hop!;
          } else {
            tier = 2;
            secondary = 0;
          }
          return { hex: c[0], tier, secondary };
        })
        .sort((a, b) => a.tier - b.tier || a.secondary - b.secondary);
      const best = s[0]!;
      const tied = s.filter((x) => x.tier === best.tier && x.secondary === best.secondary);
      return tied.length > 1 ? null : best.hex;
    }
    let differ = 0;
    for (const list of Object.values(REDUCE_BY_UCS)) {
      const a = winnerWith(list, false);
      const b = winnerWith(list, true);
      if (a !== null && b !== null && a !== b) differ++;
    }
    expect(differ).toBe(248);
    // 文書の実例: 㓮(U+34EE)は順位側が 雕(U+96D5)、ホップ側が 彫(U+5F6B)
    const example = REDUCE_BY_UCS[(0x34ee).toString(16)]!;
    expect(winnerWith(example, false)).toBe((0x96d5).toString(16));
    expect(winnerWith(example, true)).toBe((0x5f6b).toString(16));
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
