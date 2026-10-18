# 3D キャラクターモデルビューア（Web ページ埋め込み看板娘）

[中文](README.md) ｜ [English](README.en.md) ｜ **日本語**

three.js キャラクタービューア：**設定可能**（モデル / 口元テクスチャ / 基準 JSON）、**組み込み可能**（自己完結型シングルファイル版）、**デプロイ可能**（純粋な静的サイト）。

シェーディングバックエンド（**「トゥーンマテリアル」でのみ利用可能**）：
**Cel バンディング**（BA モデル向けの簡易シェーダー）· **lilToon スタイル**（自前移植実装）· **three-liltoon**（上流による本家 lilToon ソースのトランスパイル成果物をそのまま利用、オンデマンド読み込み）· **注入なし（オリジナル）**。

- マテリアルモデルは 3 種類：オリジナル（PBR）/ **トゥーンマテリアル（Toon）** / アンリット（Unlit）。シェーディングバックエンドは**トゥーンマテリアル**に接続します（PBR / Unlit は three.js 標準マテリアルを使うため注入点がありません）。既定は **トゥーンマテリアル + Cel バンディング**。
- **three-liltoon は「lilToon スタイル」のバリアント**です：サーフェスマテリアルを上流の `LilToonMaterial` に差し替えるだけで、**アウトラインは自前実装のまま**です（0.1.9 以降、上流のアウトラインは `shaderVariant` で `Hidden/lilToonOutline` を明示選択する必要あり。実測：スキンメッシュは細い輪郭、静的プロップは塗り潰し）。
- lilToon はトゥーン（NPR）シェーダーファミリーです —— 「lilToon を PBR マテリアルに使う」という発想はありません。

【[本ツールのデプロイ](DEPLOY.md)】  【[モデル JSON 設定](CONFIG.md)】  【[サードパーティライセンス通知](THIRD-PARTY-NOTICES.md)】

## クイックスタート

このディレクトリがそのまま完全なサイトです：**`index.html` を開く**だけで動作します。任意の静的サーバー（Nginx / Apache / Netlify / Cloudflare Pages / OSS など）に置いても使えます。

| ページ | 入口 |
|---|---|
| 全画面ビューア（フローティングコンソール UI 付き） | `index.html` |
| **3D モデルの Web ページ埋め込み看板娘デモ** | `embed-demo.html` |

## ファイル

| ファイル | 役割 |
|---|---|
| [index.html](index.html) | 全画面ビューア（フローティングコンソール UI） |
| [embed-demo.html](embed-demo.html) | 3D モデルの Web ページ埋め込み看板娘デモ |
| [viewer.js](viewer.js) | ビューアコア（`createViewer` / `autoMount`） |
| [assets/sample.json](assets/sample.json) | **CH0155 設定**（モデル + 口元テクスチャ + 基準 + レンダリング/ライティング/背景） |
| [assets/sample.glb](assets/sample.glb) | モデル（= CH0155、24 段のアニメーション） |
| [assets/mouth/](assets/mouth/) | 口元の修正用アトラス（kivo：`Character_Mouth_2` / `_Black` / `_High`） |
| [dist/3d-viewer.js](dist/3d-viewer.js) | **自己完結型シングルファイル版**（1.94 MB、three をすべてインライン化、埋め込み用；裸の import なし） |
| [dist/3d-viewer.min.js](dist/3d-viewer.min.js) | 同上、圧縮版（944 KB、デプロイ用） |
| [liltoon-bridge.js](liltoon-bridge.js) | 第 4 シェーディングバックエンドの適応層（lilCfg / Unity マテリアルを three-liltoon に渡す） |
| [vendor/three/](vendor/three/) | ローカルの three.js r185.1 + addons（`effects/OutlineEffect.js` を含む） |
| [vendor/three-liltoon/](vendor/three-liltoon/) | three-liltoon ランタイム + コンパイル済み lilToon GLSL（2.2 MB、第 4 バックエンドはオンデマンド読み込み） |
| [CONFIG.md](CONFIG.md) | 設定フィールドの完全リファレンス |
| [README.en.md](README.en.md) · [README.ja.md](README.ja.md) | 本 README の英語版 / 日本語版（`CONFIG` / `DEPLOY` / `LILTOON` にも `.en` / `.ja` があります） |
| [DEPLOY.md](DEPLOY.md) | デプロイとパッケージングの手順 |
| [LICENSE](LICENSE) | プロジェクトライセンス（MIT） |
| [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) | サードパーティ通知（three.js / lilToon / three-liltoon） |

## 設定（JSON）

`createViewer` は `config`（オブジェクト）または `configUrl`（JSON のアドレス）を受け取ります。すべてのフィールドは任意です：

```jsonc
{
  "model": {
    "url": "./assets/sample.glb",                             // モデルファイル
    "mouthAtlas": "./assets/mouth/Character_Mouth_2.png"      // 口元の修正テクスチャ（kivo アトラス）
  },
  "pivot": { "x": 0.25, "z": 0.30 },                          // 回転基準位置（ピボット）の調整
  "renderer": {
    "render": "toon",                                         // マテリアルモデル："pbr" | "toon" | "unlit"
    "shader": "cel",                                          // シェーディングバックエンド（render:"toon" のときのみ有効）：
                                                              //   "none" | "cel" | "lilToon" | "liltoon-src"
    "outline": true, "outlineThickness": 0.002,
    "outlineColor": [0.10, 0.07, 0.11], "outlineAlpha": 1.0,
    "targetHeight": 2.0, "fov": 30, "shadows": true
  },
  "lighting": { "preset": "day", "exposure": 1.0 },           // "day" | "golden" | "night"
  "background": { "transparent": true, "color": null },       // 既定は透明
  "animation": { "name": "CH0155_Normal_Idle" }
}
```

> 旧キー `"shading"`（`"pbr"` / `"cel"` / `"unlit"`）も引き続き使用できます。`render` + `shader` のショートカット指定に相当します。
>
> **相対パスは設定ファイルのあるディレクトリを基準に解決されます**。したがって設定をサイトのルートディレクトリに置けば、
> その `"./assets/sample.glb"` は常に正しく解決されます —— 別のサイトに埋め込まれた場合でもモデルを特定できます。
>
> すぐ使える CH0155 の設定は [assets/sample.json](assets/sample.json) にあります（基準 X = +0.25、Z = +0.30）。
> ほかに [assets/fallback.json](assets/fallback.json) があり、「1 つコピーして 3 か所を変える」テンプレートとして使えます。

完全なフィールド（`data-*` 属性、イベント、グローバルフックを含む）は [CONFIG.md](CONFIG.md) を参照してください。

## 3 つの使い方

### 1. index を直接開く（URL パラメータで渡せる）

```
index.html?config=./assets/sample.json
index.html?model=./assets/sample.glb&mouth=./assets/mouth/Character_Mouth_2.png&config=./assets/sample.json
```

### 2. サードパーティサイトへの埋め込み（推奨：自己完結型シングルファイル版、**importmap 不要**）

```html
<!-- 1. コンテナを 1 つ置き、data-ba3d-* で設定を宣言する -->
<div data-ba3d data-ba3d-config="./assets/sample.json"
     style="width:480px;height:640px"></div>

<!-- 2. 自己完結型シングルファイル版を読み込み、自動マウントする -->
<script type="module">
  import { autoMount } from 'https://your-domain/ba3d/dist/3d-viewer.min.js';
  autoMount();
</script>
```

コンテナで使用できる属性：

| 属性 | 説明 |
|---|---|
| `data-ba3d` | このコンテナにビューアをマウントすることを示す（値は空でよい） |
| `data-ba3d-model` | モデルファイルの URL（`.glb`） |
| `data-ba3d-mouth` | 口元の修正テクスチャの URL（kivo アトラス `.png`） |
| `data-ba3d-config` | 設定 JSON の URL（基準 + レンダリング + ライティング + 背景） |
| `data-ba3d-auto-rotate` | `true` のとき自動回転 |

### 3. JS で生成（等価）

```js
import { createViewer } from './dist/3d-viewer.min.js';

const viewer = createViewer(document.getElementById('stage'), {
  modelUrl: 'https://your-domain/ba3d/assets/sample.glb',
  mouthAtlasUrl: 'https://your-domain/ba3d/assets/mouth/Character_Mouth_2.png',
  configUrl: 'https://your-domain/ba3d/assets/sample.json',   // オブジェクトを直接渡すことも可能：config: {...}
  backgroundTransparent: true,
});
await viewer.load();
```

> シングルファイル版ではなく `vendor/three/` + `viewer.js` を使う場合、ホストページで importmap を提供する必要があります：
> ```html
> <script type="importmap">
> { "imports": { "three": "https://your-domain/ba3d/vendor/three/three.module.js",
>                "three/addons/": "https://your-domain/ba3d/vendor/three/" } }
> </script>
> ```

## 機能

- **マテリアルモデル**：オリジナル（PBR）/ **トゥーンマテリアル（Toon）** / アンリット（無照明）（Unlit）
- **シェーディングバックエンド**（ツールバー「シェーディング」ドロップダウン、4 項目、**トゥーンマテリアルのときのみ使用可能**）：
  - `注入なし（オリジナル）` / **`Cel バンディング`（既定）** / `lilToon スタイル`（自作の移植実装）
  - **`lilToon ソース`** —— 表面シェーディングは [three-liltoon](https://www.npmjs.com/package/@mochiya/three-liltoon) を直接再利用します。
    **本家 lilToon ソース**をトランスパイルした成果物です（Unity との比較（突き合わせ）：単純なパス 2.22%、影＋リムライト 5.37%、輝度比 1.000）。
    ⚠️ このバックエンドは**オンデマンド読み込み**です（2.2 MB、切り替えない限りダウンロードされません）。**アウトラインは引き続き自前の実装**を使います
    （上流のリリース版のアウトラインは実測で使用不可）。
    ⚠️ **シングルファイル版ではこのバックエンドは使えません**（`dist/` の内部は裸の `three` 指定子）—— 使う場合は `vendor/` + `viewer.js` の構成でデプロイしてください。
- **アウトライン**：反転ハル法（three の `OutlineEffect`、スキニング対応）。太さと色を調整可能；lilToon モードでは `setLilOutline` が担当します
- **lilToon パラメータパネル**：JSON を編集せずに直接パラメータを調整でき、Unity 側で書き出した `.lilToon.json` / `.mat` / `.asset` をインポートできます
- **設定のエクスポート / インポート**：ツールバーの「JSON をエクスポート」は既定値と異なる項目だけを書き出します。インポート後は UI が自動的に同期します
- **パーツパネル**：任意パーツと小道具の非表示 / 表示
- **ライティングプリセット**：昼 / 朝・夕方 / 夜
- **背景**：既定は**透明**（Web ページの内容が透ける）。ほかに 4 つのプリセット色 + カラーピッカー
- **アニメーション**：24 段のアニメーション切り替え。既定では idle のみ再生。Unity の `.anim` も直接再生できます（blendShape の表情 / 着せ替えの表示切替 / 汎用トランスフォームカーブ。詳細は [CONFIG.ja.md](CONFIG.ja.md)）。着せ替えクリップ（`m_IsActive` の種類）はツールバーに**ボタン**として出ます：一度押すと装着、もう一度押すと脱着（着せ替え前の状態へ復元、繰り返し可）。カスタムモデルでは `.anim`、lilToon の `.mat` / `.asset`（材質名ごとに対応）、Unity の `.prefab`（**既定で非表示のパーツ**を再現。この状態は prefab にしかなく、FBX にも .anim にもありません）を**まとめて複数選択**できます。**Unity プロジェクトのフォルダごとドロップ**も可能で、モデル / prefab / `.anim` / `.mat` / テクスチャ、さらに Humanoid マッスル換算表（`humanoid-muscles.json`）まで自動認識して読み込みます
- **視点**：軸ビュー（前 / 後 / 左 / 右）；**720° 無段階回転**；回転基準位置（ピボット）は X/Z を設定可能（スライダー + 数値入力）
- **フローティングウィンドウレイアウト**：位置とサイズを自動記憶。コンソールで `ba3dResetLayout()` を実行すると既定に戻ります
- **モバイル**：タッチ操作対応
- **ハロー（後光）** は頭部ボーン `Bip001_Head` にバインド
- **口元**：kivo 方式で UV アイランドを分割 + 口元アトラス。`bone_mouth` が開閉を駆動し、マテリアルはレンダリングモードに追従

## デプロイ

純粋な静的サイトで、**ビルド手順も CDN 依存もありません**。すべて相対パスを使用します（ルートパス/サブパスへのデプロイで設定を変える必要はありません）。
`dist/` はバンドル済みなのでそのままアップロードできます。完全な一覧は [DEPLOY.md](DEPLOY.md) を参照してください。

`.glb` の MIME は `model/gltf-binary` である必要があります（`_headers` / `.htaccess` / `.nojekyll` は同梱済み。下表参照）：

| プラットフォーム | 対応 |
|---|---|
| Netlify / Cloudflare Pages | `_headers`（デプロイパッケージに同梱済み） |
| Apache | `.htaccess`（デプロイパッケージに同梱済み） |
| GitHub Pages | `.nojekyll`（デプロイパッケージに同梱済み） |
| Nginx | `mime.types` に `model/gltf-binary glb;` を追加、または `nginx-3d-viewer.conf` をそのまま使用 |

## 技術的なポイント

### シーンパラメータ（ベースラインを踏襲）

- 正規化：`targetHeight = 2.0`（最長軸でスケーリング）、足を y=0 に合わせ、水平方向は中央揃え
- カメラ：`PerspectiveCamera(fov=30, near=0.05, far=200)`
- ライト：半球光 + メイン方向光（影付き）+ リムライト + 補助光；`RoomEnvironment` PMREM
- コントローラ：`OrbitControls`（damping、可動範囲制限）；影は PCFSoft + `ShadowMaterial` の地面

ベースラインとの意図的な差異：CDN の代わりにローカルの `vendor/three`；使わない DRACO/KTX2/Meshopt ローダーを削除；
既定では idle のみ再生（ベースラインの元ファイルがすべてのアニメーションを同時に play していたのはバグ）；レンダリングモード/アウトライン/ライティングプリセット/背景/基準位置/口元の修正を追加。

### トゥーンシェーディング

`MeshToonMaterial` は `envMap` に対応していないため、トゥーンモードではライティングを自動補正します（半球光 ×1.25、メインライト ×0.8、露出 ×0.9）。
切り替えは完全に可逆です：元のマテリアルは `userData.__src` に保持されます。

### アウトライン

反転ハル法：モデルをもう一度描画し、頂点を**法線**方向に外側へ広げ、**裏面**だけをレンダリングしてアウトライン色で塗ります。
**透明マテリアルにはアウトラインを付けません** —— 反転ハルは「中身の詰まった裏面の殻」であり、薄い板（盾）では不透明な色が上からかぶさって半透明を覆い隠してしまうためです。

### 口元の修正（kivo.wiki を踏襲）

`CH0155_Body_4`（EyeMouth）の中で「口」= **z が最小**の UV アイランド（38 三角形）で、
その UV 矩形はテクスチャの**真っ黒なプレースホルダー領域**に落ちています → だから元は黒い口でした。修正方法：UV アイランド単位でメッシュを分割し、
口の三角形を独立した `SkinnedMesh` にして口元アトラスを使い、`repeat/offset` で UV 矩形をアトラスのいずれかのセルにマッピングします。

### 偽 BLEND の修正

GLB 内の `CH0155_Weapon`（銃）/ `CH0155_Milk`（牛乳パック）は `BLEND` と指定されていますが、テクスチャは実際には
「不透明 + くり抜き/余白」型です。判定基準は**中間値 alpha の割合**（`0 < a < 250`）：
割合がごく小さい → 不透明としてレンダリング；割合が大きい（例：盾の alpha≈128）→ 透明のまま保持。

## ライセンス

本プロジェクトは **MIT ライセンス**を採用しています（© 2026 Hazuki Kaguya）—— [LICENSE](LICENSE) を参照。

パッケージに同梱して配布するサードパーティコンポーネントも同様に MIT です。著作権とライセンス全文は [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) を参照：

| コンポーネント | ライセンス | 使用箇所 |
|---|---|---|
| three.js 0.185.1 | MIT © 2010-2026 three.js authors | `vendor/three/`、および `dist/` にインライン化 |
| lilToon 2.3.4 | MIT © 2020-present lilxyzw | そのコンパイル済み成果物のみ：`assets/lilshaders.inline.js`、`vendor/three-liltoon/chunk-*.js` |
| @mochiya/three-liltoon 0.1.9 | MIT © 2026 Mochiya | `vendor/three-liltoon/`（第 4 バックエンドをオンデマンド読み込み） |

> **埋め込み / 配布の際は `LICENSE` と `THIRD-PARTY-NOTICES.md` も必ず一緒に保持してください** —— MIT は著作権表示とライセンス表示の保持を要求します。
> この 2 つのファイルは本ディレクトリに含まれています。
>
> リポジトリ内の**サンプルモデルとテクスチャ素材は上記のライセンス範囲には含まれません**（`assets/sample.glb`、`assets/mouth/*.png`、
> `assets/test/*.png`）。再配布の前にご自身でその許諾条件を確認してください。
