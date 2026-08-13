import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

// なぜこの設定ファイルが要るか:
// test/ 配下の98件は全て `../src/*.js` を import しており、常に src/ に対して
// 走る。利用者が実際に受け取るのは tsup がビルドした dist/index.js (ESM) /
// dist/index.cjs (CJS) で、そこに当たっているのは ci.yml の smoke-node18 ジョブに
// ある数行の手書きアサーションだけだった。tree-shaking で必要なテーブルが落ちる、
// `/* @__PURE__ */` 注釈の付け方を間違えて副作用が消される、といったバンドラ由来の
// 壊れ方はその数行をすり抜ける。既存の98件をそのまま dist/ に対して走らせれば、
// 同じ壊れ方をずっと広い網で検出できる。
//
// alias で置き換えるのは「テストが公開 API を import している箇所」だけに絞る:
//   ../src/index.js / reduce.js / isVariant.js / getVariants.js / toMatchingKey.js
//     -> dist/index.js (ESM) または dist/index.cjs (CJS)
// tsup は単一エントリ(src/index.ts)を1ファイルにバンドルするため、dist 側には
// reduce.js のような分割ファイルは存在しない。dist/index.{js,cjs} が reduce 等を
// named export として持つので、この1ファイルへまとめて向ければ済む。
//
// 意図的に alias しないもの:
//   ../src/cjk.js, ../src/generated/tables.js
// これらはテストが期待値を組み立てるための内部ヘルパーで、公開 API ではなく dist/
// にも含まれていない。src のままにするのは「期待値を検証対象そのものから作らない」
// というこのプロジェクトの規約とも整合する(CONTRIBUTING.md 参照)。
//
// ESM/CJS の切り替えは環境変数 ITAIJI_DIST_FORMAT で行う(既定は esm)。
// 前提: あらかじめ `npm run build` 済みであること(このファイル自身はビルドしない)。
const here = path.dirname(fileURLToPath(import.meta.url));
const format = process.env.ITAIJI_DIST_FORMAT === "cjs" ? "cjs" : "esm";
const distEntry = path.resolve(here, `dist/index.${format === "cjs" ? "cjs" : "js"}`);

const publicApiSpecifiers = [
  "../src/index.js",
  "../src/reduce.js",
  "../src/isVariant.js",
  "../src/getVariants.js",
  "../src/toMatchingKey.js",
];

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
  resolve: {
    alias: publicApiSpecifiers.map((find) => ({ find, replacement: distEntry })),
  },
});
