import { describe, expect, it } from "vitest";
import { isVariant } from "../src/isVariant.js";

describe("isVariant", () => {
  it("﨑 と 崎 は異体字関係", () => {
    expect(isVariant("﨑", "崎")).toBe(true);
  });

  it("髙 と 高 は異体字関係", () => {
    expect(isVariant("髙", "高")).toBe(true);
  });

  it("対称である(a,b の順序を入れ替えても同じ結果)", () => {
    expect(isVariant("崎", "﨑")).toBe(isVariant("﨑", "崎"));
  });

  it("同じ文字同士は異体字ではない(自分自身は自分の異体字ではない)", () => {
    expect(isVariant("崎", "崎")).toBe(false);
  });

  it("無関係な文字同士は false", () => {
    expect(isVariant("崎", "高")).toBe(false);
  });

  it("MJ に存在しない文字を渡すと false を返す(例外にしない)", () => {
    expect(isVariant("A", "B")).toBe(false);
    expect(isVariant("崎", "A")).toBe(false);
  });

  it("複数文字を渡すと例外を投げる", () => {
    expect(() => isVariant("崎田", "高")).toThrow(TypeError);
    expect(() => isVariant("崎", "高橋")).toThrow(TypeError);
  });
});
