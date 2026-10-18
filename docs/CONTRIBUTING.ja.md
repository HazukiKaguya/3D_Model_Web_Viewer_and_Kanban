# コントリビューションガイド

不具合の報告、最小再現、レンダリングの改善を歓迎します。着手前に [lilToon 移植ベースライン](LILTOON2.x.md)、[設定と実装の詳細](CONFIG.md)、[デプロイ手順](DEPLOY.md) を一読してください。

## ソースからのビルド

Node.js 20 以上が必要です。

```bash
npm install                       # 初回のみ
node scripts/serve.mjs            # UI 調整用の静的サーバー
node scripts/build.mjs            # dist/3d-viewer.js（非圧縮）
node scripts/build.mjs --minify   # dist/3d-viewer.min.js（デプロイ用）
```

製品コードは `viewer.js`、`index.html`、`unity-anim.js`、`unity-scene.js`、`liltoon-bridge.js` です。上流ランタイムは `vendor/three-liltoon` にありパッケージに同梱されます。そのソースはバージョン比較用に研究ディレクトリへ保管しており、更新時は `scripts/make-deploy.mjs` のマニフェストも合わせて更新してください。

提出前に 3 つのチェッカーを必ず実行します。

```bash
node scripts/check-deploy.mjs            # デプロイ先が読み込める：失敗リクエストなし、ページエラーなし、パネルと書き出し領域が揃っている
node scripts/check-release-safety.mjs    # 同梱ドキュメントに内部パス・リンク切れがない／同梱モデルは assets/sample.glb のみ
node scripts/check-lilsrc.mjs            # 第 4 バックエンドのデプロイ検査：アウトライン、残留マテリアル、画素残留
```

専用チェッカー（`check-docs`、`check-glsl`、`check-panel`、`check-assets`、`check-scope`）は変更範囲に応じて使い分けます。リリース手順は `scripts/make-devpack.mjs` 冒頭の「リリースチェックリスト」に記載しています（ドキュメント → 3 つのパッケージ → 3 つのチェッカー）。

## ソースマップ

| 場所 | 役割 |
| --- | --- |
| `viewer.js`、`index.html` | ビューア本体、UI、lilToon パラメータパネル |
| `unity-anim.js`、`unity-scene.js` | Unity アニメーションとシーンの読み込み |
| `liltoon-bridge.js` | 私たちの設定と上流ランタイムの間のアダプタ |
| `vendor/three-liltoon` | 上流ランタイム（0.1.9、パッケージに同梱） |
| `assets`、`vendor/three` | 同梱リソースと three の依存 |
| `docs` | メイン README と第三者表記を除くすべてのドキュメント（3 言語） |
| `scripts` | ビルドと検査のスクリプト |
| 研究ディレクトリ | 上流ソース、実験、内部ドキュメント、アーカイブ（同梱しない） |
| `models` | テストモデルとテクスチャのフィクスチャ。**変更しないでください** |

## レンダリング不具合の報告

モデルとテクスチャの出所、ブラウザと GPU、シェーディングモード、該当する lilToon パラメータとテクスチャ、コンソール警告、再現手順を添えてください。最小のプロシージャルシーンか再配布可能なモデルがあると調査が容易になります。

Unity との差異については、lilToon のバージョンと、揃えたカメラ・ライティング・カラースペース設定も記載してください（本プロジェクトの参照環境は Built-in パイプライン、Linear カラースペース、ポストプロセスなし）。

数値の主張にはフィクスチャ、計測の定義、判定基準を明記してください。WebGL のスクリーンショット 1 枚だけでは Unity との一致の根拠になりません。同一シーン・同一パラメータでの比較が必要です。

## 提出の取り決め

- `README.md` と `THIRD-PARTY-NOTICES.md` を除くすべてのドキュメントは `docs` ディレクトリに置きます。デプロイパッケージも同じ配置です
- 3 言語（`X.md`、`X.en.md`、`X.ja.md`）は同じ変更の中でまとめて更新してください
- 同梱ドキュメントにリポジトリ内部のパスを書かないでください（`check-release-safety` が拒否します）
- パッケージに追加するファイル名は ASCII にしてください。同梱のパッカーは非 ASCII のファイル名に対応しておらず、黙って取りこぼします
- 再配布の許諾がない第三者素材は提出しないでください
