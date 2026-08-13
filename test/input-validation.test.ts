import { describe, expect, it } from "vitest";
import { getVariants, isVariant, reduce, toMatchingKey } from "../src/index.js";

// The package is typed, but it is also consumed from plain JavaScript where
// the type signature enforces nothing. The failure that motivated this file:
// reduce(["崎"]) did not throw — it echoed the array back as `input` and
// returned a real candidate, so a caller who passed a whole column of values
// instead of a single value got plausible-looking wrong output.
describe("非文字列入力の拒否", () => {
  const badInputs: Array<[string, unknown]> = [
    ["配列", ["崎"]],
    ["null", null],
    ["undefined", undefined],
    ["数値", 123],
    ["オブジェクト", {}],
  ];

  for (const [label, value] of badInputs) {
    it(`reduce() は ${label} を TypeError で拒否する`, () => {
      expect(() => reduce(value as string)).toThrow(TypeError);
      expect(() => reduce(value as string)).toThrow(/^reduce\(\) expects/);
    });
  }

  it("getVariants() は非文字列を拒否する", () => {
    expect(() => getVariants(["崎"] as unknown as string)).toThrow(/^getVariants\(\) expects .* an array$/);
  });

  it("isVariant() はどちらの引数の非文字列も拒否し、どちらが悪いかを示す", () => {
    expect(() => isVariant(123 as unknown as string, "崎")).toThrow(/the first argument/);
    expect(() => isVariant("崎", 123 as unknown as string)).toThrow(/the second argument/);
  });

  it("エラーメッセージは受け取った型を伝える", () => {
    expect(() => reduce(null as unknown as string)).toThrow(/received null$/);
    expect(() => reduce(undefined as unknown as string)).toThrow(/received undefined$/);
    expect(() => reduce(123 as unknown as string)).toThrow(/received a number$/);
    expect(() => reduce({} as unknown as string)).toThrow(/received an object$/);
  });
});

describe("toMatchingKey の options 検証", () => {
  it("NFD / NFKD は拒否する(既定のキーと決して一致しないキーを作ってしまうため)", () => {
    // normalize() 自体は NFD/NFKD を受理するので、素通しすると
    // 「例外にならないのに絶対マッチしないキー」という最悪の失敗になる。
    for (const mode of ["NFD", "NFKD"]) {
      expect(() => toMatchingKey("崎", { unicodeNormalize: mode as "NFC" })).toThrow(
        /options\.unicodeNormalize/,
      );
    }
  });

  it("不正な正規化形式は、関数名と受け取った値を含む TypeError にする", () => {
    expect(() => toMatchingKey("崎", { unicodeNormalize: "garbage" as "NFC" })).toThrow(TypeError);
    expect(() => toMatchingKey("崎", { unicodeNormalize: "garbage" as "NFC" })).toThrow(/"garbage"/);
    expect(() => toMatchingKey("崎", { unicodeNormalize: true as unknown as "NFC" })).toThrow(TypeError);
  });

  it("options がオブジェクトでない場合は黙って既定にせず拒否する", () => {
    // 以前は toMatchingKey("崎", "NFC") が黙って NFKC にフォールバックしていた。
    expect(() => toMatchingKey("崎", "NFC" as unknown as object)).toThrow(/options object/);
    expect(() => toMatchingKey("崎", null as unknown as object)).toThrow(/received null/);
  });

  it("正当な3値と省略はそのまま通す", () => {
    expect(() => toMatchingKey("崎")).not.toThrow();
    expect(() => toMatchingKey("崎", {})).not.toThrow();
    for (const mode of ["NFC", "NFKC", false] as const) {
      expect(() => toMatchingKey("崎", { unicodeNormalize: mode })).not.toThrow();
    }
  });

  it("未知のオプションキーは黙って無視せず拒否する(isVariant と同じ扱い)", () => {
    // { normalize: "NFC" } のようなキーの打ち間違いは、値の検証だけでは
    // 捕まらずに既定(NFKC)へ黙ってフォールバックする——呼び出し側は
    // オプトアウトしたつもりのまま別のキーを受け取る。isVariant は
    // 未知キーを拒否しており、toMatchingKey だけが素通しだった。
    expect(() => toMatchingKey("崎", { normalize: "NFC" } as unknown as object)).toThrow(TypeError);
    expect(() => toMatchingKey("崎", { normalize: "NFC" } as unknown as object)).toThrow(/unknown option "normalize"/);
    expect(() => toMatchingKey("崎", { unicodeNormalise: false } as unknown as object)).toThrow(/unknown option/);
  });
});

describe("変異セレクタの個数", () => {
  it("reduce() はセレクタ2つ以上を拒否する(黙って1つ目だけ使わない)", () => {
    const multi = `辻${String.fromCodePoint(0xe0100)}${String.fromCodePoint(0xe0101)}`;
    expect(() => reduce(multi)).toThrow(/at most one variation selector/);
  });

  it("reduce() はセレクタ1つなら従来どおり受理する", () => {
    expect(() => reduce(`辻${String.fromCodePoint(0xe0100)}`)).not.toThrow();
  });

  it("toMatchingKey() はセレクタ2つ以上でも例外にせず素通しする", () => {
    const multi = `辻${String.fromCodePoint(0xe0100)}${String.fromCodePoint(0xe0101)}`;
    expect(() => toMatchingKey(multi)).not.toThrow();
    expect(toMatchingKey(multi).key).toBe(multi);
  });
});
