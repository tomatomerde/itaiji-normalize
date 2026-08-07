import { describe, expect, it } from "vitest";
import { toMatchingKey } from "../src/toMatchingKey.js";

describe("unresolved[].index と normalized", () => {
  // 㖒 は候補が複数ありタイになるため unique が決まらず unresolved に載る。
  const UNRESOLVED = "㖒";

  it("正規化で入力が伸びても index は normalized 上で正しい位置を指す", () => {
    // NFKC("㍿") = "株式会社"。入力は2文字だが正規化後は5文字。
    const input = "㍿" + UNRESOLVED;
    const result = toMatchingKey(input);

    expect(result.normalized).toBe("株式会社" + UNRESOLVED);
    expect(result.unresolved).toHaveLength(1);
    const { index, char } = result.unresolved[0]!;

    // これが本題: index は入力ではなく normalized のオフセット。
    expect(index).toBe(4);
    expect(index).toBeGreaterThan(input.length);
    expect(result.normalized.slice(index, index + char.length)).toBe(char);
  });

  it("正規化が長さを変えなければ index は入力にもそのまま使える", () => {
    const input = "崎" + UNRESOLVED;
    const result = toMatchingKey(input);
    const { index, char } = result.unresolved[0]!;
    expect(result.normalized).toBe(input);
    expect(input.slice(index, index + char.length)).toBe(char);
  });

  it("unicodeNormalize: false のとき normalized は入力そのもの", () => {
    const input = "㍿" + UNRESOLVED;
    const result = toMatchingKey(input, { unicodeNormalize: false });
    expect(result.normalized).toBe(input);
    const { index, char } = result.unresolved[0]!;
    expect(input.slice(index, index + char.length)).toBe(char);
  });

  it("報告されたすべての index が normalized 上で char と一致する", () => {
    const input = `㍿${UNRESOLVED}アイウ﨑${UNRESOLVED}ｶﾅ㍿${UNRESOLVED}`;
    const result = toMatchingKey(input);
    expect(result.unresolved.length).toBeGreaterThan(1);
    for (const { index, char } of result.unresolved) {
      expect(result.normalized.slice(index, index + char.length)).toBe(char);
    }
  });
});
