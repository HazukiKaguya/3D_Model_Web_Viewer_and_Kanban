# 3D 角色模型網頁內嵌看板娘 部署說明

[简体中文](DEPLOY.md) ｜ **繁體中文** ｜ [English](DEPLOY.en.md) ｜ [日本語](DEPLOY.ja.md) ｜ [한국어](DEPLOY.ko.md)

纯靜態站點，**無構建步驟、無 CDN 依賴、無需 Node**，全部使用相對路徑（根路徑/子路徑部署都不用改設定）。
`dist/` 已預打包好，直接把本目錄裡的**全部檔案按原樣上傳到網站根目錄**（或任意子目錄）即可，靜態托管即可運行（Nginx / Apache / Netlify / Cloudflare Pages / OSS / COS 都行）。

> 想本地先看一眼：在**開發倉庫**裡執行 `node scripts/serve.mjs 5199`，然後打開 <http://127.0.0.1:5199/>。
> （纯靜態站點，無需 Node —— 直接用瀏覽器打開，或放到任意靜態服務器上即可。）

| 平台 | 處理 |
|---|---|
| Netlify / Cloudflare Pages | `_headers`（部署包根目錄已含） |
| Apache | `.htaccess`（部署包根目錄已含） |
| GitHub Pages | 已附 `.nojekyll` |
| Nginx | `mime.types` 最好加上 `model/gltf-binary glb;` |

## 一、必須上傳的檔案

| 路徑 | 說明 |
|---|---|
| `index.html` | 3D 模型查看器（全屏、控制台 UI） |
| `viewer.js` | 查看器核心（`createViewer` / `autoMount`，ES module，被 index.html 直接引用） |
| `unity-anim.js` | **Unity `.anim` 轉換**（AnimationClip → three AnimationClip）：錶情（blendShape）/ 換裝顯隱（`m_IsActive`）/ 通用變換曲線 |
| `vendor/three/three.module.js` | three.js r185.1 本體（importmap 裡 `"three"` 指向它） |
| `vendor/three/three.core.js` | ↑ r185 起拆出的核心，`three.module.js` 用相對 import 引用它，**不能漏** |
| `vendor/three/controls/OrbitControls.js` | 相機交互（旋轉 / 縮放） |
| `vendor/three/loaders/GLTFLoader.js` | 模型加載（`.glb` / `.gltf`）|
| `vendor/three/loaders/FBXLoader.js` | 模型加載（`.fbx`）|
| `vendor/three/libs/fflate.module.js` | ↑ FBXLoader 的傳遞依賴（二進制 FBX 解壓），**不能漏** |
| `vendor/three/curves/NURBSCurve.js` | ↑ FBXLoader 的傳遞依賴，**不能漏** |
| `vendor/three/curves/NURBSUtils.js` | ↑ NURBSCurve 的傳遞依賴，**不能漏** |
| `vendor/three/environments/RoomEnvironment.js` | PBR 環境的烘焙貼圖 |
| `vendor/three/effects/OutlineEffect.js` | 描邊 |
| `vendor/three/utils/BufferGeometryUtils.js` | ↑ GLTFLoader 的傳遞依賴，**不能漏** |
| `vendor/three/utils/SkeletonUtils.js` | ↑ 同上（依賴鏈的一環）|
| `liltoon-bridge.js` | **第 4 著色後端**的適配層（把我們的 lilCfg / Unity 材質喂给 three-liltoon） |
| `vendor/three-liltoon/index.js` | ↑ three-liltoon 運行時（MIT） |
| `vendor/three-liltoon/chunk-KNGRDLOZ.js` | ↑ 編譯好的 lilToon GLSL（1.9 MB，**不可省**） |
| `vendor/three-liltoon/chunk-WFYRXLGW.js` | ↑ 運行時的小 chunk |
| `vendor/three-liltoon/gltf.js` · `vrm.js` | ↑ 可選擴展（glTF 的 `MOCHIYA_materials_liltoon` / VRM） |
| `vendor/three-liltoon/schema/*.json` | ↑ 材質擴展的 JSON schema |
| `vendor/three-liltoon/THIRD_PARTY_NOTICES.md` | ↑ 第三方聲明（MIT 要求隨包分發） |
| `assets/sample.glb` | 模型檔案（演示用，換自己的模型直接替換即可） |
| `assets/sample.json` | 該模型的設定：模型 / 嘴部貼圖 / 縮放 / 取景 / 渲染 / 打光 / 背景 |
| `assets/fallback.json` | 同上，指向同一個模型；留作"復制一份改三處"的模板 |
| `assets/mouth/*.png` | 嘴部圖集貼圖（`sample.json` 用的是 `Character_Mouth_High.png`） |
| `.htaccess` | Apache 用：`.glb` 的 MIME + 緩存策略 |
| `_headers` | Netlify / Cloudflare Pages 用：同上 |
| `.nojekyll` | GitHub Pages 用：0 字節標記檔案，阻止 Jekyll 處理（**空的就是對的**） |
| `nginx-3d-viewer.conf` | nginx 用：設定模板，照抄到 `server { }` 裡（見第三節） |
| `DEPLOY.md` | 本檔案 |

> `viewer.js` 只依賴上錶裡的 5 個 vendor 檔案。整個 `vendor/three/` 目錄一共 1.4 MB。
>
> **第 4 著色後端必須隨包分發**（`liltoon-bridge.js` + `vendor/three-liltoon/`，原始 2.2 MB，
> 壓縮後約 0.35 MB）—— 漏了它們，切到「lilToon 源碼」會 404。
>
> ⚠️ 注意区分兩件事：
> - **打包**：這幾個檔案**必須在部署包裡**（不是可選項）。
> - **運行時**：瀏覽器**按需下載** —— viewer.js 用 `new URL(...)` 動態 import，
>   用戶不切到那個模式就一個字節都不會請求。這也是為什麼**構建產物裡看不出來**
>   （否則 esbuild 會把 1.9 MB 的 GLSL chunk 打進 dist 單檔案）。
>
> ⚠️ **單檔案嵌入版（`dist/3d-viewer.min.js`）用不了這個後端**（實測）：
> 他們的 `index.js` 對 `three` 是**裸模塊引用**（`import ... from "three"`），
> 而單檔案版是把 three 打進包裡的、沒有 importmap ⇒ 會報
> `Failed to resolve module specifier "three"`。
> 橋接層與 `vendor/three-liltoon/` 放在 dist 同目錄也沒用（我們實測過）。
> 失敗是**優雅的**：控制台記一條錯誤、自動退回 `lilToon 風格` 模式，其他功能完全不受影響。
> ⇒ 要用這個後端，必須走**標準部署**（`index.html` + `vendor/three/` + importmap）。
>
> 驗收：`node scripts/check-lilsrc.mjs`（真的去切那個模式，斷言庫檔案全部 200、
> 無残留材質、網格/三角形數還原）。

## 一·五、這個部署目錄是怎麼來的（给維護者）

  ⚠️ `_deploy/3D_Model_Web_Viewer/` **不是手工攢的**、由腳本按**顯式清單**生成：

      node scripts/make-deploy.mjs            # 重建（會先清空目標目錄）
      node scripts/make-deploy.mjs --check    # 只比對 · 不一致 exit=1（CI 用）
      node scripts/check-release-safety.mjs   # 發布物斷言：模型只有 sample.glb · 無內部文檔/路徑 · 文檔無死鏈

  ⇒ 清單裡**每一項**都必須能從倉庫裡找到源（見下錶）
  ⇒ 想往部署包裡加东西、**必須改腳本裡的 `MANIFEST`**、並同步本文檔的兩張錶。

  ### 為什麼要有這個約束

  之前是手工攢的、於是飄過兩次：

      · 留了一份**舊的 + 編碼損壞**的 `check-glsl.mjs`（6.6 KB、無人引用）
      · 又把整個 `scripts/` 拷了進去 ⇒ 部署包裡多了 5 個**開發工具**
        （部署目錄只保留站點運行需要的檔案，避免把開發工具一起拷進去）

  ### `develop_res/deploy-src/` 是什麼

  有幾個檔案**只屬於部署包**、倉庫根目錄裡沒有對應源：

      develop_res/deploy-src/.htaccess              → .htaccess
      develop_res/deploy-src/_headers               → _headers
      develop_res/deploy-src/.nojekyll              → .nojekyll            （0 字節）
      develop_res/deploy-src/nginx-3d-viewer.conf   → nginx-3d-viewer.conf
      develop_res/deploy-src/_lilpresets.json       → _lilpresets.json     （面板的 lilToon 預設數據）

  ⇒ 集中放到 `develop_res/deploy-src/`、這樣整個部署目錄就是**完全可重现**的。

  ### 现在一共 **61 個檔案（約 15.2 MB）**

      必需  index.html · viewer.js · liltoon-bridge.js · vendor/three 的 12 個 ·
            assets（sample.glb / 2 個 json / 3 張嘴部貼圖）·
            .htaccess / _headers / .nojekyll / nginx-3d-viewer.conf
      可選  dist 兩個 · 2 個演示頁 · vendor/three-liltoon 的 7 個 · _lilpresets.json ·
            2 張嘴部索引圖 · 測試貼圖 ·
            README / CONFIG / DEPLOY / LILTOON1.x / LILTOON2.x（各含 `.en` / `.ja`）·
            LICENSE · THIRD-PARTY-NOTICES.md

> ℹ️ 開發期的檢查器（`scripts/check-*.mjs` · `make-deploy.mjs`）服務於構建與驗證流程，
> 靜態站點運行不需要它們 —— `check-layout.mjs` 用無頭瀏覽器驗證浮窗布局
> （拖動 / 縮放 / 持久化），因此部署時既不需要 Node、也不需要瀏覽器自動化。
> 這些檢查器只在開發倉庫裡運行，隨包的 `.md` 文檔已完整描述部署流程。

> ⚠️ **`index.html` 现在是浮窗布局**（Unity 風格）、場景 / 工具欄 / 状態 /
> 參數面板都是可拖動可縮放的独立視窗、位置尺寸存在瀏覽器的 localStorage 裡。
> ⇒ 與部署無關（纯前端）、詳見 `CONFIG.md` 的「★ 浮窗布局」一節。

## 二、可選檔案（不影響運行，刪掉也能跑）

| 路徑 | 說明 |
|---|---|
| `embed-demo.html` | 3D 模型網頁內嵌看板娘演示頁（浮層 + 動作選單 + 百分比縮放） |
| `dist/3d-viewer.js` | **自包含單檔案版**（約 1.94 MB），给別的頁面用 `<script type="module">` 引入，**不需要 importmap、不需要 vendor/** |
| `dist/3d-viewer.min.js` | 上者的壓縮版（約 0.92 MB），`embed-demo.html` 用的就是它 |
| `CONFIG.md` | 設定欄位完整參考（含 `data-*` 屬性、事件、全域鉤子） |
| `CONFIG.zh-TW.md` · `CONFIG.en.md` · `CONFIG.ja.md` · `CONFIG.ko.md` | 設定參考的繁體 / 英文 / 日文 / 韓文版 |
| `README.md` | 項目說明 |
| `docs/README.zh-TW.md` · `docs/README.en.md` · `docs/README.ja.md` · `docs/README.ko.md` | 專案說明的繁體 / 英文 / 日文 / 韓文版 |
| `DEPLOY.zh-TW.md` · `DEPLOY.en.md` · `DEPLOY.ja.md` · `DEPLOY.ko.md` | 本檔案的繁體 / 英文 / 日文 / 韓文版 |
| `LICENSE` | 項目許可證（MIT © 2026 Hazuki Kaguya）——**分發時必須保留** |
| `THIRD-PARTY-NOTICES.md` | 第三方聲明（three.js / lilToon / three-liltoon 的 MIT 全文）——**分發時必須保留** |
| `LILTOON1.x.md` · `LILTOON2.x.md` | lilToon 基線對照（1.3.7 歸檔 / 2.3.4 現行）；另有 `.zh-TW` · `.en` · `.ja` · `.ko` 版 |
| `assets/mouth/_cells-preview-*.png` | 嘴部圖集 8×8 索引圖，挑 `mouthCell` 時照著看用 |

跑主頁面真正必需的就是：**`index.html` + `viewer.js` + `vendor/three/` 的 12 個檔案 + `assets/` 裡的模型與設定**。
錶格裡其餘幾項都是按平台/用途可選的（`.htaccess` / `_headers` / `.nojekyll` / `nginx-3d-viewer.conf` / `DEPLOY.md`）。

## 三、部署到子目錄（例如 nginx 的 `api.sample.site/3d-viewer/`）

**檔案一個都不用改** —— 頁面裡所有引用都是相對路徑（`./viewer.js`、`./vendor/three/...`、`./assets/...`），
importmap 裡也是 `./vendor/three/`，所以整目錄放進任意子目錄都能直接跑。

只需要注意兩點：

### 1. 必須帶結尾斜杠訪問

```
✅  https://api.sample.site/3d-viewer/
❌  https://api.sample.site/3d-viewer
```

沒有結尾斜杠時，瀏覽器會把 `3d-viewer` 當成**檔案**，於是相對路徑 `./vendor/three/...`
會解析到站點根目錄 `/vendor/three/...` → 全部 404、白屏。用 nginx 強制跳轉即可：

```nginx
location = /3d-viewer {
    return 301 /3d-viewer/;
}
```

### 2. nginx 設定

`.htaccess` 是 Apache 的、`_headers` 是 Netlify / Cloudflare Pages 的，**nginx 兩個都不讀**，
需要手動配 MIME 和緩存。完整可抄的設定見同目錄 **`nginx-3d-viewer.conf`**，核心是：

```nginx
location /3d-viewer/ {
    index index.html;
    try_files $uri $uri/ =404;

    location ~* \.(glb|png|js|mjs)$ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
    location ~* \.json$ {
        add_header Cache-Control "no-cache";     # 設定改完上傳即生效
    }
}
```

`.glb` 的 MIME 建議直接加到全局 `/etc/nginx/mime.types`（一行）：

```
model/gltf-binary  glb;
```

> ⚠️ 別在 location 裡寫裸的 `types { model/gltf-binary glb; }` —— nginx 的 `types` 塊
> **會整體覆盖**繼承來的類型錶，`html` / `css` / `png` 會全變成
> `application/octet-stream`（瀏覽器變成下載而不是顯示頁面）。
> 非要在 server 塊裡補，就必須先 `include mime.types;`。

### 目錄結構不能變

```
3d-viewer/
├── index.html
├── viewer.js
├── .htaccess           ← Apache 用
├── _headers            ← Netlify / Cloudflare Pages 用
├── .nojekyll           ← GitHub Pages 用（0 字節）
├── nginx-3d-viewer.conf← nginx 用
├── vendor/three/…      ← 必須和 index.html 同級（importmap 指向 ./vendor/three/）
│   ├── three.module.js
│   ├── three.core.js
│   ├── controls/OrbitControls.js
│   ├── loaders/GLTFLoader.js
│   ├── environments/RoomEnvironment.js
│   ├── effects/OutlineEffect.js
│   └── utils/BufferGeometryUtils.js   ← GLTFLoader 的傳遞依賴，不能漏
├── assets/
│   ├── sample.glb      ← 模型
│   ├── sample.json     ← 設定
│   ├── fallback.json
│   └── mouth/*.png     ← 嘴部圖集
├── dist/…              ← 可選：给別人嵌入用的自包含單檔案版
└── *.html / *.md       ← 可選：演示頁和文檔
```

### 順手驗證

```bash
curl -I https://api.sample.site/3d-viewer          # 期望 301 → …/3d-viewer/
curl -I https://api.sample.site/3d-viewer/         # 期望 200
curl -I https://api.sample.site/3d-viewer/vendor/three/three.module.js   # 期望 200
curl -I https://api.sample.site/3d-viewer/assets/sample.glb             # 期望 200
```

---

## 四、服務器要求

1. **`.glb` 要返回正確 MIME**
   沒有的話瀏覽器仍能加載（GLTFLoader 不看 MIME），但部分 CDN / 中間層會攔。用 `.htaccess` 或 `_headers` 配好即可。

2. **`assets/*.json` 不要長緩存**
   設定檔案是運行時讀取的，改了要立刻生效。兩個設定檔案裡都設了 `no-cache`。
   如果托管平台不認這兩個檔案（**nginx 兩個都不讀**，見第三節），手動加上：
   ```nginx
   location ~* \.json$ { add_header Cache-Control "no-cache"; }
   location ~* \.glb$  { default_type model/gltf-binary; }
   ```

3. **必需支持 ES module + importmap**
   现代瀏覽器都支持。`index.html` 裡用的是：
   ```html
   <script type="importmap">
   { "imports": { "three": "./vendor/three/three.module.js", "three/addons/": "./vendor/three/" } }
   </script>
   ```
   **上傳時目錄結構不能改**，`vendor/three/` 必須和 `index.html` 同級。

4. **所有路徑都是相對的**，所以放域名根目錄或子目錄（如 `/ba3d/`）都可以，不用改任何檔案。

## 五、上傳後可以打開的地址

| 地址 | 內容 |
|---|---|
| `/` | 全屏查看器（含"自定義模型"上傳面板） |
| `/?config=./assets/sample.json` | 演示模型 |
| `/embed-demo.html` | 網頁內嵌看板娘演示 |

## 六、想只部署一個模型

只傳那一個 `.glb` + 它對應的 `.json` + 用到的 `assets/mouth/*.png` 即可。
當前部署包裡就是這種形態：只有一個 `sample.glb`，配 `sample.json`（和指向同一模型的 `fallback.json`）。
`fallback.json` 只是留给你當模板用，刪掉不影響運行。

## 七、換模型 / 加模型

1. 把 `.glb` 放進 `assets/`
2. 復制一份现成的 `.json`（`assets/fallback.json` 就是模板），改三處：
   - `model.url` → 指向新的 `.glb`（相對 json 自身所在目錄）
   - `model.mouthAtlas` → 嘴部圖集
   - `animation.name` → 想要的開場動作（也可留簡寫如 `"Cafe_Idle"`）
3. 訪問 `/?config=./assets/你的.json` 驗證

字段含義見 `CONFIG.md`。
