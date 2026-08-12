# リリース

`itaiji-normalize` を npm に出す方法。パイプラインは
[`.github/workflows/release.yml`](../.github/workflows/release.yml)。このページで説明するのは、
読み手がリバースエンジニアリングしないとわからない部分と、間違えやすい2つの判断である。

## Trusted publishing（ワークフローの認証方式）

**ワークフローは npm トークンを持たない。** npm の *trusted publishing* で公開する: GitHub
Actions が短命の OIDC トークンを発行し、npm がパッケージに登録された trusted publisher と
照合し、長寿命のシークレットなしで公開が認可される。この経路では provenance アテステーションが
自動生成されるため、`--provenance` フラグは存在しない。

npmjs.com の *Settings → Trusted Publisher* に登録済み（2026-08-10）:

| 項目 | 値 |
| --- | --- |
| Publisher | GitHub Actions |
| Organization or user | `tomatomerde` |
| Repository | `itaiji-normalize` |
| Workflow filename | `release.yml` |
| Environment name | **空** — ジョブは GitHub Environment を宣言しておらず、ここが食い違うと公開が拒否される |
| Allowed actions | `npm publish` と `npm stage publish` |

認証を壊さないためにワークフローが守り続けるべきことは3つ:

- `permissions` の **`id-token: write`**。これがないと、交換する OIDC トークンがそもそもない。
- **npm >= 11.5.1。** ランナー同梱の npm はこれを満たさないため、
  `Ensure npm supports trusted publishing` ステップが npm をアップグレードしてバージョンを
  検証する。パイプライン全体を走らせた後に認証エラーとして失敗する代わりに、早い段階で
  わかりやすく失敗する。
- **ワークフローのファイル名は `release.yml` のまま保つこと。** trusted publisher はこの名前
  そのものに対して登録されており、ファイルをリネームすると気づかないうちに無効になる。

### npm のバージョンは実行中に動く

このガードステップは、OIDC 経路のうち dry run が到達できる唯一の部分である。2026-08-10 の
dry run（run `31403006092`、これを導入したマージコミット上）での計測:

| 実行中の時点 | npm |
| --- | --- |
| 最初の `setup-node` の後（Node 22 同梱の npm） | **10.9.8** — 要件未満 |
| ガードの `npm install -g npm@latest` の後 | 12.0.2 |
| Node 18 スモークテスト中 | 10.8.2 |
| publish ステップ時点、`setup-node` が Node 22 に戻った後 | **12.0.2** |

この表から覚えておくべきことは2つ。同梱の npm は本当に古すぎる — ガードがなければこの
パイプラインは `npm publish` まで到達し、バージョンについて何も語らない認証エラーで失敗して
いた。そして**バージョンは一度下がってから戻る**: Node 18 の区間のために `setup-node` を
再実行するとツールチェーン全体が入れ替わり、アップグレードが生き残るのは、最後の `setup-node`
がガードのその場アップグレードを受けたのと同じ Node 22 をツールキャッシュから選ぶからに
すぎない。最後の `setup-node` を別のバージョンに向ければ、npm は黙って同梱版に戻る。publish
区間の Node バージョンをいつか変えるなら、ガードがまだ効いていると仮定せず、その時点の
バージョンを読み直すこと。

### 検証済み: `0.1.1` は OIDC 経由で出た

`0.1.0` は 2026-08-10 にトークンで公開され、この切り替えはその後だったため、トークン交換の
最初の実地検証は次のバージョンアップを待つしかなかった — dry run は `npm publish` に決して
到達せず、`v0.1.0` を再 push しても registry に既にあるとしてスキップされていたからだ。

そのバージョンアップが **2026-08-12 公開の `v0.1.1`**（run `31558135329`）で、ジョブ内に npm
の資格情報が一切ない状態で OIDC 経路を通った:

```text
npm notice publish Signed provenance statement with source and build information from GitHub Actions
npm notice publish Provenance statement published to transparency log: https://search.sigstore.dev/?logIndex=2430002951
```

同じ run で、上の表が提起する疑問にも決着がついた。publish ステップの時点でも `npm 12.0.2`
のままだった — 最後の `setup-node` は予測どおりツールキャッシュから Node 22.23.1 を見つけ、
その場アップグレードは生き残った。**したがって、同梱 npm への逆戻りは実際の run ではいまだ
一度も観測されていない**。`assert-npm-version.sh` はまだ発火したことのないハザードをガード
している。それこそが存在意義だが、ハザードが実在する証拠ではない。

**`NPM_TOKEN` はもうロールバック経路ではない** — トークンなしでリリースが実際に出たからだ。
リポジトリの secrets と npmjs.com からの削除は `NOTES.md` で追跡している。

## npm トークン（廃止済み — 記録された失敗モードのために残す）

以下は、このワークフローがもう使わず、もう必要としないトークン経路の記述である。残してあるのは、
苦労して得た失敗モードが、アカウントとして手で publish する場合には今も当てはまるからだ。
これは**生きた**ロールバックではない: トークンの再導入は、trusted publishing が不要にした
長寿命の publish 資格情報の再導入を意味する。

**`NPM_TOKEN`** は Actions のシークレットだった。`release.yml` はもうどこからも参照して
いないので、削除してもリリースは壊れない。削除が閉ざすのは、ワークフローを編集せずにトークン
認証へフォールバックする道であり、それは意図的なものだ。

```sh
# Historical — this is how it used to be set:
gh secret set NPM_TOKEN --repo tomatomerde/itaiji-normalize
```

トークンは <https://www.npmjs.com/settings/~/tokens> で作る。npm は classic と granular の
トークン作成を単一のフォームに統合した。重要な項目:

| 項目 | 値 | 理由 |
| --- | --- | --- |
| **Bypass two-factor authentication (2FA)** | **チェックを入れる** | これがないと npm は publish 時にワンタイムパスワードを要求し、CI はそれを供給できない |
| Packages and scopes → Permissions | **Read and write** | デフォルトは read-only |
| Select packages | **All packages** | 未公開の名前はパッケージ別の選択肢に現れないため、新しい名前の初回 publish にはアカウント全体のスコープが要る。公開後に絞ること |
| IP ranges | **空のまま** | GitHub ホストのランナーには固定の egress IP がない |
| Organizations → Permissions | No access | 不要 |

**噛みつくのはこの 2FA チェックボックスで、しかも publish 本番まで見えない。** これなしで
作ったトークンは、CI から次のエラーで拒否される:

```text
npm error code EOTP
npm error This operation requires a one-time password from your authenticator.
```

これは姉妹プロジェクトの `v0.1.0-rc.1`（2026-08-10）で2回起きた — どちらの回も何も公開され
なかったが、毎回まずパイプライン1周分のコストがかかった。**既存トークンを再生成してもこの
設定は変わらない**。チェックを入れた新しいトークンを作り直す必要がある。
`scripts/npm-publish.sh` は `EOTP` を認識してこのチェックボックスの名前を出す。

dry run ではトークンを検証できない。dry run は `npm publish` に決して到達しないからで、
これが下のリリース候補（release candidate）手順の最も強い論拠になる。

他に設定するものはない。ワークフロー自身の `permissions:` ブロックが、GitHub Release 用の
`contents: write` と provenance 用の `id-token: write` を与える。

## Provenance

すべての publish は npm の provenance アテステーションを伴う。trusted publishing の下では
npm が自動で発行するため、publish コマンドに `--provenance` フラグはない — このフラグは
トークン経路のものであり、もう存在しない。

**`--access public` は残す。** もはや provenance のためではないが、外すと、このリポジトリが
一度代償を払った失敗が戻ってくる。registry がまだ知らない名前に対して、npm は access を明示
しない限りアテステーションの発行を拒む:

```text
npm error code EUSAGE
npm error Can't generate provenance for new or private package, you must set `access` to public.
```

スコープなしパッケージはデフォルトで public なのでフラグは冗長に見えるが、それでも npm は
拒否する: 「デフォルト」は「明示的に public」ではない。**これは 2026-08-10 の最初の実際の
`v0.1.0` tag push を失敗させた** — 姉妹プロジェクトが無事だったのは、その `package.json` 群が
たまたま `publishConfig.access` を持っていたからにすぎない。ここでは今、両方を設定してある:
`scripts/npm-publish.sh` のフラグと、手動 publish でも同じ挙動になるようにするための
`package.json` の `publishConfig.access`。

アテステーションにより、npm 上の tarball は、それを生成したコミットとワークフロー run まで
遡れる。これは2つの前提に依存し、どちらも気づかずに壊しやすい:

- **`package.json` の `repository.url` はこのリポジトリを指していなければならない。** npm は
  ワークフローが走っているリポジトリと突き合わせ、食い違えば **publish を失敗させる** —
  アテステーションなしの公開へ黙ってフォールバックしたりはしない。
- **リポジトリは public のまま保つこと。** npm provenance は public なソースリポジトリを要求する。

## タグの形式と dist-tag

パッケージは1つ、タグの形も1つ: **`v<version>`**、例 `v0.1.0`。それ以外は、推測せず即座に
run を失敗させる。

**`-` を含むバージョンは `next` dist-tag へ、それ以外はすべて `latest` へ公開される。**
ワークフローはこれをバージョンのみから導出する — そのための入力は存在しない。

これは体裁の問題ではない。`--tag` なしの `npm publish` は、**semver プレリリースであっても**
`latest` を動かす — npm はプレリリースを特別扱いしない。`0.1.0-rc.1` を `--tag next` なしで
公開すれば、`npm install itaiji-normalize` は全ユーザーにリリース候補を渡すことになり、修復
手段はその上に本物のバージョンを公開することだけ。その間、この過ちは公開されたままで、見た目
は成功したリリースと全く同じである。`Release plan` ステップサマリーが dist-tag を印字するのは
そのためだ。

**CHANGELOG の見出しはバージョンを1つのフィールド全体として照合する**ため、`## 0.1.0-rc.1`
と `## 0.1.0` は別のセクションで、各リリースは自分のセクションだけを得る。前方一致だと
`## 0.1.0` が `## 0.1.0-rc.1 — …` にもマッチし、両方の見出しがマッチするせいで「次の見出しで
止まる」ルールが決して発火せず、抽出されたノートはファイル末尾まで走ってしまう。

## リリース候補と、それが守るもの・守らないもの

`npm publish` は、このパイプラインで dry run が実行できない唯一のステップであり、取り消せない:
npm は公開されたバージョンを永久に保持し、unpublish は最初の 72 時間以内かつ依存ゼロの場合に
限られる。provenance アテステーションと GitHub Release も tag push でしか起きない。これが、
まず候補でリハーサルする理由である。

**しかし新品の名前に対しては、候補は見かけほどの働きをしない。** 姉妹プロジェクトは
2026-08-10 に `jp-address-romaji@0.1.0-rc.1` を `--tag next` で公開し、次を確認した:

- **ある名前に最初に公開されたバージョンは、`--tag` に関係なく `latest` になる。** registry は
  `latest` をどこかへ向けなければならず、新規パッケージには他に向ける先がない。`latest` は
  削除できないため、唯一の修復は本物のバージョンを公開すること。したがって候補は、初回リリース
  で `npm install <pkg>` をきれいに保って**くれない** — 買えるのは publish 経路のリハーサル
  だけだ。
- **プレリリースはキャレット範囲を満たさない。** `^x.y.z` と書かれた依存や peer の範囲は
  `x.y.z-rc.N` を拒否するため、候補がインストール不能になりうる。プレリリースを受け入れる
  必要のある範囲は `^x.y.z-0` と書かなければならない。

`itaiji-normalize` はそれゆえ `0.1.0` に直行した: トークン経路は姉妹プロジェクトで既に実地で
証明済みで、候補を切ってもどのみち `latest` が動くうえ、バージョン番号を1つ消費するだけ
だったからだ。

候補を切るのは、*変更された*リリース経路をリハーサルしたいとき — 初回リリースを守るためでは
ない。それはできないからだ。

## リリースの切り方

1. `package.json` の `version` を上げる。
2. `CHANGELOG.md` のそのバージョンの `## <version> — unreleased` 見出しを実際の日付に置き換える。
   例: `## 0.1.0 — 2026-08-12`。`unreleased` のままだとワークフローは公開を拒み、GitHub Release
   の本文はこのセクションから来る。両方の変更をコミットする。
3. `git tag v<version> && git push origin v<version>`。
4. run を見届ける。ステップサマリーにはリリースプラン（trigger, dry_run, version, dist-tag）と
   tarball の全ファイル一覧が載る。green でも読むこと。

ワークフロー実行時にそのバージョンが既に registry にある場合 — 例えば部分的な失敗の後にタグを
再 push した場合 — publish ステップは `npm view` でそれを検知し、エラーにせずスキップするので、
再実行は安全である。

## Dry run

Actions タブ → **Release** → **Run workflow**、`dry_run` は `true` のまま。`npm publish` 以外の
すべてが、そのときディスク上にあるバージョンに対して同一に実行される。タグがないため、
バージョンと CHANGELOG のガードは適用されない — だからこそバージョンと dist-tag がサマリーに
印字される。間違っていれば、実害が出る前に見えるように。

**実リリースの前に必ず1回走らせ、読むこと。** 過去の green run はこのコミットについての証拠に
ならない: 姉妹プロジェクトのリリースワークフローは何か月も構造上 green のままで、初めて実際に
実行されたときに失敗した。

## publish 前にワークフローが確認すること

順に、すべて `npm publish` より前:

- `npm run typecheck`、`npm test`、`npm run build`
- **データスナップショットの検証** — `scripts/verify-snapshots.sh`、続いて二段階の生成
  チェーン（`mji.00602.xlsx` → `mji-list.tsv` → `src/generated/tables.ts`）。同梱データこそが
  このパッケージの存在意義なので、これを飛ばしたリリースは、誰も出典と突き合わせていない
  テーブルを出荷することになる
- `npm pack`、続いて tarball の全ファイル一覧をステップサマリーへ
- **tarball のアサーション** — 4つのエントリポイントすべて（`dist/index.js`、`dist/index.cjs`、
  `dist/index.d.ts`、`dist/index.d.cts`）、両方のライセンスファイル、`PROVENANCE.md`、そして
  バンドルのサイズ下限。サイズチェックがあるのは、MJ テーブルがデータファイルとしてではなく
  バンドルに*コンパイルされて*入るため、存在確認だけでは本物のビルドとスタブを区別できない
  からだ。2026-08-10 の実測は 2,512,700 バイトで、下限は 2,000,000
- pack した tarball への `@arethetypeswrong/cli`、full strict プロファイル — このパッケージは
  ESM と CJS を別々の型宣言付きで出荷しており、4つの解決モードすべてが約束である
- **pack した tarball への Node 18 スモークテスト**、`require()` と `import` の両方経由。
  テストスイートは Node 18 では動かせない（開発ツールチェーンは 20.12+ を要求する）ため、
  これがないと `engines: ">=18"` の主張は未検証のまま出荷される

ブラウザと Cloudflare Workers のサポートは、ここで重複させるのではなく、`ci.yml` が `main`
への push ごとに、同じコミットの同じビルド済みバンドルに対して確認する。CI が red のコミット
からリリースしないこと。

## カバーされないもの

- `npm publish` 自体、provenance アテステーション、GitHub Release は実際の tag push でしか
  起きない — 上のリリース候補はそのためにある。
- ここにあるものは何一つ、*公開された*パッケージが動くことを確認しない。rc 手順のステップ3が
  手作業でそれを行う。
