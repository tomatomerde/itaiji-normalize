import { describe, expect, it } from "vitest";
import { getVariants } from "../src/getVariants.js";
import { isVariant } from "../src/isVariant.js";
import { reduce } from "../src/reduce.js";

// 変異セレクタ2個。reduce() は以前からこれを拒否していたが、
// isVariant/getVariants は「optionally followed by one variation selector」と
// 名乗りながら黙って受理し、セレクタを無視して基底文字の答えを返していた。
const TWO_SELECTORS = "辻\u{E0101}\u{E0102}";
const ONE_SELECTOR = "辻\u{E0101}";

describe("変異セレクタの個数の扱いが4関数で揃っている", () => {
  it("セレクタ1個は受理する", () => {
    expect(() => reduce(ONE_SELECTOR)).not.toThrow();
    expect(() => getVariants(ONE_SELECTOR)).not.toThrow();
    expect(() => isVariant(ONE_SELECTOR, "辻")).not.toThrow();
  });

  it("セレクタ2個は reduce と同様に isVariant/getVariants も拒否する", () => {
    expect(() => reduce(TWO_SELECTORS)).toThrow(TypeError);
    expect(() => getVariants(TWO_SELECTORS)).toThrow(TypeError);
    expect(() => isVariant(TWO_SELECTORS, "辻")).toThrow(TypeError);
    expect(() => isVariant("辻", TWO_SELECTORS)).toThrow(TypeError);
  });

  it("例外メッセージが関数名と個数を含む", () => {
    expect(() => getVariants(TWO_SELECTORS)).toThrow(/getVariants\(\).*at most one variation selector.*got 2/s);
    expect(() => isVariant("辻", TWO_SELECTORS)).toThrow(/isVariant\(\).*the second argument.*got 2/s);
  });
});
