# 3D キャラクターモデルを Web ページに埋め込む看板娘 デプロイ手順

[中文](DEPLOY.md) ｜ [English](DEPLOY.en.md) ｜ **日本語**

純粋な静的サイトで、**ビルド手順なし・CDN 依存なし・Node 不要**、すべて相対パスを使用しています（ルートパスでもサブパスでもデプロイ時に設定を変更する必要はありません）。
`dist/` はあらかじめパッケージング済みなので、このディレクトリ内の**すべてのファイルをそのままサイトのルートディレクトリ**（または任意のサブディレクトリ）にアップロードするだけで、静的ホスティングで動作します（Nginx / Apache / Netlify / Cloudflare Pages / OSS / COS のいずれでも可）。

> まずローカルで確認したい場合：**開発リポジトリ**で `node scripts/serve.mjs 5199` を実行し、<http://127.0.0.1:5199/> を開きます。
> （純粋な静的サイトで Node は不要です —— ブラウザで直接開くか、任意の静的サーバーに置いてください。）

| プラットフォーム | 対応 |
|---|---|
| Netlify / Cloudflare Pages | `_headers`（デプロイパッケージのルートディレクトリに同梱済み） |
| Apache | `.htaccess`（デプロイパッケージのルートディレクトリに同梱済み） |
| GitHub Pages | `.nojekyll` を同梱済み |
| Nginx | `mime.types` に `model/gltf-binary glb;` を追加するのが望ましい |

## 一、必ずアップロードするファイル

| パス | 説明 |
|---|---|
| `index.html` | 3D モデルビューア（全画面、コンソール UI） |
| `viewer.js` | ビューアの中核（`createViewer` / `autoMount`、ES module、index.html から直接参照される） |
| `unity-anim.js` | **Unity `.anim` の変換**（AnimationClip → three AnimationClip）：表情（blendShape）/ 着せ替えの表示切替（`m_IsActive`）/ 汎用トランスフォームカーブ |
| `vendor/three/three.module.js` | three.js r185.1 本体（importmap の `"three"` がこれを指す） |
| `vendor/three/three.core.js` | ↑ r185 から分離されたコア。`three.module.js` が相対 import で参照するため、**欠かせない** |
| `vendor/three/controls/OrbitControls.js` | カメラ操作（回転 / ズーム） |
| `vendor/three/loaders/GLTFLoader.js` | モデル読み込み（`.glb` / `.gltf`）|
| `vendor/three/loaders/FBXLoader.js` | モデル読み込み（`.fbx`）|
| `vendor/three/libs/fflate.module.js` | ↑ FBXLoader の推移的依存（バイナリ FBX の解凍）、**欠かせない** |
| `vendor/three/curves/NURBSCurve.js` | ↑ FBXLoader の推移的依存、**欠かせない** |
| `vendor/three/curves/NURBSUtils.js` | ↑ NURBSCurve の推移的依存、**欠かせない** |
| `vendor/three/environments/RoomEnvironment.js` | PBR 環境のベイク済みテクスチャ |
| `vendor/three/effects/OutlineEffect.js` | アウトライン |
| `vendor/three/utils/BufferGeometryUtils.js` | ↑ GLTFLoader の推移的依存、**欠かせない** |
| `vendor/three/utils/SkeletonUtils.js` | ↑ 同上（依存チェーンの一环）|
| `liltoon-bridge.js` | **第 4 シェーディングバックエンド**のアダプタ層（私たちの lilCfg / Unity マテリアルを three-liltoon に渡す） |
| `vendor/three-liltoon/index.js` | ↑ three-liltoon ランタイム（MIT） |
| `vendor/three-liltoon/chunk-KNGRDLOZ.js` | ↑ コンパイル済みの lilToon GLSL（1.9 MB、**省略不可**） |
| `vendor/three-liltoon/chunk-WFYRXLGW.js` | ↑ ランタイムの小さな chunk |
| `vendor/three-liltoon/gltf.js` · `vrm.js` | ↑ 任意の拡張（glTF の `MOCHIYA_materials_liltoon` / VRM） |
| `vendor/three-liltoon/schema/*.json` | ↑ マテリアル拡張の JSON schema |
| `vendor/three-liltoon/THIRD_PARTY_NOTICES.md` | ↑ サードパーティ通知（MIT がパッケージへの同梱を要求） |
| `assets/sample.glb` | モデルファイル（デモ用。自分のモデルに差し替える場合はそのまま置き換えるだけ） |
| `assets/sample.json` | このモデルの設定：モデル / 口元テクスチャ / スケール / フレーミング / レンダリング / ライティング / 背景 |
| `assets/fallback.json` | 同上。同じモデルを指す。"1 つコピーして 3 か所を変更する" ためのテンプレートとして残してある |
| `assets/mouth/*.png` | 口元テクスチャアトラスの画像（`sample.json` が使っているのは `Character_Mouth_High.png`） |
| `.htaccess` | Apache 用：`.glb` の MIME + キャッシュポリシー |
| `_headers` | Netlify / Cloudflare Pages 用：同上 |
| `.nojekyll` | GitHub Pages 用：0 バイトのマーカーファイル。Jekyll の処理を阻止する（**空のままで正しい**） |
| `nginx-3d-viewer.conf` | nginx 用：設定テンプレート。`server { }` にそのままコピーする（第三節を参照） |
| `DEPLOY.md` | 本ファイル |

> `viewer.js` が依存するのは上表の 5 つの vendor ファイルだけです。`vendor/three/` ディレクトリ全体で合計 1.4 MB です。
>
> **第 4 シェーディングバックエンドは必ずパッケージに同梱して配布する必要があります**（`liltoon-bridge.js` + `vendor/three-liltoon/`、元のサイズは 2.2 MB、
> 圧縮後は約 0.35 MB）—— これらを漏らすと、「lilToon 源码」に切り替えたときに 404 になります。
>
> ⚠️ 次の 2 つは区別してください：
> - **パッケージング**：これらのファイルは**必ずデプロイパッケージに入れる**（任意ではない）。
> - **ランタイム**：ブラウザは**オンデマンド読み込み** —— viewer.js は `new URL(...)` で動的 import するため、
>   ユーザーがそのモードに切り替えなければ 1 バイトもリクエストされません。これが**ビルド成果物からは見えない**理由でもあります
>   （そうでなければ esbuild が 1.9 MB の GLSL chunk を dist の単一ファイルに埋め込んでしまいます）。
>
> ⚠️ **シングルファイル埋め込み版（`dist/3d-viewer.min.js`）ではこのバックエンドは使えません**（実測）：
> これらの `index.js` は `three` に対して**裸のモジュール参照**（`import ... from "three"`）を行いますが、
> シングルファイル版は three をパッケージに埋め込んでおり importmap がない ⇒
> `Failed to resolve module specifier "three"` が発生します。
> ブリッジ層と `vendor/three-liltoon/` を dist と同じディレクトリに置いても効果はありません（実測済み）。
> 失敗は**优雅的**です：コンソールにエラーが 1 行記録され、自動的に `lilToon 风格` モードに戻るだけで、他の機能はまったく影響を受けません。
> ⇒ このバックエンドを使うには、**標準デプロイ**（`index.html` + `vendor/three/` + importmap）でなければなりません。
>
> 検証：`node scripts/check-lilsrc.mjs`（実際にそのモードへ切り替え、ライブラリファイルがすべて 200 であること、
> マテリアルの残留がないこと、メッシュ / 三角形数の復元をアサートする）。

## 一・五、このデプロイディレクトリはどうやって生成されるのか（メンテナ向け）

  ⚠️ `_deploy/3D_Model_Web_Viewer/` は**手作業で組み上げたものではなく**、スクリプトが**明示的なマニフェスト**に従って生成します：

      node scripts/make-deploy.mjs            # 重建（会先清空目标目录）
      node scripts/make-deploy.mjs --check    # 只比对 · 不一致 exit=1（CI 用）
      node scripts/check-release-safety.mjs   # リリース物のアサーション：モデルは sample.glb のみ・内部文書/パスなし・リンク切れなし

  ⇒ マニフェストの**各項目**は、リポジトリ内にソースが見つからなければなりません（下表を参照）
  ⇒ デプロイパッケージに何かを追加したい場合は、**スクリプト内の `MANIFEST` を必ず変更**し、本ドキュメントの 2 つの表も同期させてください。

  ### なぜこの制約が必要なのか

  以前は手作業で組み上げていたため、2 回ほど逸脱が発生しました：

      · 留了一份**旧的 + 编码损坏**的 `check-glsl.mjs`（6.6 KB、无人引用）
      · 又把整个 `scripts/` 拷了进去 ⇒ 部署包里多了 5 个**开发工具**
        （デプロイディレクトリにはサイトの実行に必要なものだけを置き、開発ツールを一緒にコピーしないこと）

  ### `develop_res/deploy-src/` とは

  いくつかのファイルは**デプロイパッケージにのみ属し**、リポジトリのルートディレクトリに対応するソースがありません：

      develop_res/deploy-src/.htaccess              → .htaccess
      develop_res/deploy-src/_headers               → _headers
      develop_res/deploy-src/.nojekyll              → .nojekyll            （0 字节）
      develop_res/deploy-src/nginx-3d-viewer.conf   → nginx-3d-viewer.conf
      develop_res/deploy-src/_lilpresets.json       → _lilpresets.json     （面板的 lilToon 预设数据）

  ⇒ `develop_res/deploy-src/` に一括して置くことで、デプロイディレクトリ全体が**完全に再現可能**になります。

  ### 現在は **61 ファイル（約 15.2 MB）**

      必須  index.html · viewer.js · liltoon-bridge.js · vendor/three/ の 12 ファイル ·
            assets（sample.glb / JSON 2 つ / 口元テクスチャ 3 枚）·
            .htaccess / _headers / .nojekyll / nginx-3d-viewer.conf
      任意  dist の 2 つ · デモページ 2 つ · vendor/three-liltoon/ の 7 ファイル · _lilpresets.json ·
            口元インデックス画像 2 枚 · テスト用テクスチャ ·
            README / CONFIG / DEPLOY / LILTOON1.x / LILTOON2.x（各 `.en` / `.ja` 付き）·
            LICENSE · THIRD-PARTY-NOTICES.md

> ℹ️ 開発期のチェッカー（`scripts/check-*.mjs` · `make-deploy.mjs`）はビルドと検証の工程専用で、
> 静的サイトの運用には不要です。`check-layout.mjs` はヘッドレスブラウザでフローティングウィンドウ
> レイアウト（ドラッグ / リサイズ / 永続化）を検証するため、デプロイに Node もブラウザ自動化も
> 必要ありません。

> ⚠️ **`index.html` は現在フローティングウィンドウレイアウト**（Unity 風）です。シーン / ツールバー / ステータス /
> パラメータパネルはすべてドラッグ・リサイズ可能な独立したウィンドウで、位置とサイズはブラウザの localStorage に保存されます。
> ⇒ デプロイとは無関係（純粋なフロントエンド）です。詳しくは `CONFIG.md` の「★ 浮窗布局」の節を参照してください。

## 二、任意ファイル（動作に影響せず、削除しても動く）

| パス | 説明 |
|---|---|
| `embed-demo.html` | 3D モデルを Web ページに埋め込む看板娘のデモページ（オーバーレイ + モーション選択メニュー + パーセント指定のスケーリング） |
| `dist/3d-viewer.js` | **自己完結型シングルファイル版**（約 1.94 MB）。他のページで `<script type="module">` として読み込んで使う。**importmap 不要、vendor/ 不要** |
| `dist/3d-viewer.min.js` | 上記の圧縮版（minify 版）（約 0.92 MB）。`embed-demo.html` が使っているのはこれ |
| `CONFIG.md` | 設定フィールドの完全リファレンス（`data-*` 属性、イベント、グローバルフックを含む） |
| `CONFIG.en.md` · `CONFIG.ja.md` | 設定リファレンスの英語版 / 日本語版 |
| `README.md` | プロジェクトの説明 |
| `docs/README.en.md` · `docs/README.ja.md` | プロジェクト説明の英語版 / 日本語版 |
| `DEPLOY.en.md` · `DEPLOY.ja.md` | 本ファイルの英語版 / 日本語版 |
| `LICENSE` | プロジェクトのライセンス（MIT © 2026 Hazuki Kaguya）——**再配布時は必ず保持** |
| `THIRD-PARTY-NOTICES.md` | サードパーティ通知（three.js / lilToon / three-liltoon の MIT 全文）——**再配布時は必ず保持** |
| `LILTOON1.x.md` · `LILTOON2.x.md` | lilToon ベースライン対照（1.3.7 はアーカイブ / 2.3.4 が現行）。`.en.md` · `.ja.md` 版あり |
| `assets/mouth/_cells-preview-*.png` | 口元テクスチャアトラスの 8×8 インデックス画像。`mouthCell` を選ぶときに見ながら使う |

メインページを動かすために本当に必須なのは：**`index.html` + `viewer.js` + `vendor/three/` の 12 ファイル + `assets/` 内のモデルと設定**だけです。
表の残りの項目はプラットフォーム / 用途に応じて任意です（`.htaccess` / `_headers` / `.nojekyll` / `nginx-3d-viewer.conf` / `DEPLOY.md`）。

## 三、サブディレクトリへのデプロイ（例：nginx の `api.sample.site/3d-viewer/`）

**ファイルは 1 つも変更する必要がありません** —— ページ内のすべての参照は相対パス（`./viewer.js`、`./vendor/three/...`、`./assets/...`）で、
importmap 内も `./vendor/three/` なので、ディレクトリごと任意のサブディレクトリに置けばそのまま動きます。

注意すべき点は 2 つだけです：

### 1. 必ず末尾スラッシュ付きでアクセスする

```
✅  https://api.sample.site/3d-viewer/
❌  https://api.sample.site/3d-viewer
```

末尾スラッシュがないと、ブラウザは `3d-viewer` を**ファイル**とみなし、相対パス `./vendor/three/...`
がサイトのルートディレクトリ `/vendor/three/...` に解決されます → すべて 404、白画面になります。nginx で強制リダイレクトすれば解決します：

```nginx
location = /3d-viewer {
    return 301 /3d-viewer/;
}
```

### 2. nginx 設定

`.htaccess` は Apache のもの、`_headers` は Netlify / Cloudflare Pages のもので、**nginx はどちらも読みません**。
MIME とキャッシュを手動で設定する必要があります。そのままコピーできる完全な設定は同ディレクトリの **`nginx-3d-viewer.conf`** にあり、要点は次のとおりです：

```nginx
location /3d-viewer/ {
    index index.html;
    try_files $uri $uri/ =404;

    location ~* \.(glb|png|js|mjs)$ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
    location ~* \.json$ {
        add_header Cache-Control "no-cache";     # 配置改完上传即生效
    }
}
```

`.glb` の MIME はグローバルの `/etc/nginx/mime.types` に直接追加するのがおすすめです（1 行）：

```
model/gltf-binary  glb;
```

> ⚠️ location 内に裸の `types { model/gltf-binary glb; }` を書かないでください —— nginx の `types` ブロックは
> 継承した型テーブルを**丸ごと上書き**し、`html` / `css` / `png` がすべて
> `application/octet-stream` になります（ブラウザがページを表示せずダウンロードします）。
> どうしても server ブロック内で補う場合は、先に `include mime.types;` が必要です。

### ディレクトリ構造は変更しない

```
3d-viewer/
├── index.html
├── viewer.js
├── .htaccess           ← Apache 用
├── _headers            ← Netlify / Cloudflare Pages 用
├── .nojekyll           ← GitHub Pages 用（0 字节）
├── nginx-3d-viewer.conf← nginx 用
├── vendor/three/…      ← 必须和 index.html 同级（importmap 指向 ./vendor/three/）
│   ├── three.module.js
│   ├── three.core.js
│   ├── controls/OrbitControls.js
│   ├── loaders/GLTFLoader.js
│   ├── environments/RoomEnvironment.js
│   ├── effects/OutlineEffect.js
│   └── utils/BufferGeometryUtils.js   ← GLTFLoader 的传递依赖，不能漏
├── assets/
│   ├── sample.glb      ← 模型
│   ├── sample.json     ← 配置
│   ├── fallback.json
│   └── mouth/*.png     ← 嘴部图集
├── dist/…              ← 可选：给别人嵌入用的自包含单文件版
└── *.html / *.md       ← 可选：演示页和文档
```

### 簡単な確認

```bash
curl -I https://api.sample.site/3d-viewer          # 期望 301 → …/3d-viewer/
curl -I https://api.sample.site/3d-viewer/         # 期望 200
curl -I https://api.sample.site/3d-viewer/vendor/three/three.module.js   # 期望 200
curl -I https://api.sample.site/3d-viewer/assets/sample.glb             # 期望 200
```

---

## 四、サーバー要件

1. **`.glb` は正しい MIME を返す必要がある**
   なくてもブラウザは読み込めます（GLTFLoader は MIME を見ません）が、一部の CDN / 中間層がブロックします。`.htaccess` または `_headers` で設定しておけば問題ありません。

2. **`assets/*.json` は長いキャッシュを付けない**
   設定ファイルは実行時に読み込まれるため、変更が即座に反映される必要があります。2 つの設定ファイルにはどちらも `no-cache` を設定済みです。
   ホスティングプラットフォームがこの 2 つのファイルを認識しない場合（**nginx はどちらも読みません**。第三節を参照）、手動で追加してください：
   ```nginx
   location ~* \.json$ { add_header Cache-Control "no-cache"; }
   location ~* \.glb$  { default_type model/gltf-binary; }
   ```

3. **ES module + importmap のサポートが必須**
   現代のブラウザはすべてサポートしています。`index.html` で使っているのは：
   ```html
   <script type="importmap">
   { "imports": { "three": "./vendor/three/three.module.js", "three/addons/": "./vendor/three/" } }
   </script>
   ```
   **アップロード時にディレクトリ構造は変更しないでください**。`vendor/three/` は `index.html` と同じ階層でなければなりません。

4. **すべてのパスが相対パス**なので、ドメインのルートディレクトリでもサブディレクトリ（例：`/ba3d/`）でもよく、ファイルを一切変更する必要はありません。

## 五、アップロード後に開けるアドレス

| アドレス | 内容 |
|---|---|
| `/` | 全画面ビューア（"自定义模型" のアップロードパネルを含む） |
| `/?config=./assets/sample.json` | デモモデル |
| `/embed-demo.html` | Web ページに埋め込む看板娘のデモ |

## 六、モデルを 1 つだけデプロイしたい場合

その `.glb` 1 つ + 対応する `.json` + 使用する `assets/mouth/*.png` だけをアップロードすれば済みます。
現在のデプロイパッケージはまさにこの形態です：`sample.glb` が 1 つだけで、`sample.json`（および同じモデルを指す `fallback.json`）が対応しています。
`fallback.json` はテンプレートとして残してあるだけで、削除しても動作に影響しません。

## 七、モデルの差し替え / 追加

1. `.glb` を `assets/` に入れる
2. 既存の `.json` をコピーする（`assets/fallback.json` がテンプレートです）。3 か所を変更します：
   - `model.url` → 新しい `.glb` を指す（json 自身のあるディレクトリからの相対パス）
   - `model.mouthAtlas` → 口元テクスチャアトラス
   - `animation.name` → 希望する開始モーション（`"Cafe_Idle"` のような省略形でも可）
3. `/?config=./assets/你的.json` にアクセスして検証する

フィールドの意味は `CONFIG.md` を参照してください。
