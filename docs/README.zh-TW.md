# 3D 角色模型查看器（3D 模型網頁內嵌看板娘）

[简体中文](../README.md) ｜ **繁體中文** ｜ [English](README.en.md) ｜ [日本語](README.ja.md) ｜ [한국어](README.ko.md)

three.js 角色查看器：**可設定**（模型 / 嘴部貼圖 / 基準 JSON）、**可嵌入**（自包含單檔案版）、**可部署**（纯靜態）。

著色後端（**僅「卡通材質」下可用**）：
**Cel 分檔**（簡易的 BA 模型特化著色器）· **lilToon 風格**（自研移植實现）· **three-liltoon**（直接使用上游對真 lilToon 源碼的轉譯產物，按需加載）· **不注入（原生）**。

- 材質模型三檔：原始（PBR）/ **卡通材質（Toon）** / 無光照（Unlit）；著色後端掛在**卡通材質**上（PBR / Unlit 用的是 three 自帶材質，沒有注入點）。預設 **卡通材質 + Cel 分檔**。
- **three-liltoon 是「lilToon 風格」的變體**：只把錶面材質換成上游的 `LilToonMaterial`；**描邊仍走自研實现**（0.1.9 起上游描邊需用 `shaderVariant` 顯式選 `Hidden/lilToonOutline`；實測蒙皮網格能出細邊 ✓，靜態道具會整片填充 ✗）。
- lilToon 是卡通（NPR）著色器家族 —— 不存在「把 lilToon 用在 PBR 材質上」這種做法。

【[部署本工具](DEPLOY.zh-TW.md)】  【[模型 JSON 設定](CONFIG.zh-TW.md)】  【[第三方庫許可證聲明](../THIRD-PARTY-NOTICES.md)】

## 快速開始

本目錄就是一個完整站點：**直接打開 `index.html`** 即可，也可以把整個目錄放進任意靜態服務器（Nginx / Apache / Netlify / Cloudflare Pages / OSS 都行）。

| 頁面 | 入口 |
|---|---|
| 全屏查看器（帶浮窗控制台 UI） | `index.html` |
| **3D 模型網頁內嵌看板娘演示** | `embed-demo.html` |

## 檔案

| 檔案 | 作用 |
|---|---|
| [index.html](../index.html) | 全屏查看器（浮窗控制台 UI） |
| [embed-demo.html](../embed-demo.html) | 3D 模型網頁內嵌看板娘演示 |
| [viewer.js](../viewer.js) | 查看器核心（`createViewer` / `autoMount`） |
| [assets/sample.json](../assets/sample.json) | **CH0155 設定**（模型 + 嘴部貼圖 + 基準 + 渲染/打光/背景） |
| [assets/sample.glb](../assets/sample.glb) | 模型（= CH0155，24 段動畫） |
| [assets/mouth/](../assets/mouth/) | 嘴部修復圖集（kivo：`Character_Mouth_2` / `_Black` / `_High`） |
| [dist/3d-viewer.js](../dist/3d-viewer.js) | **自包含單檔案版**（1.94 MB，three 全內聯，內嵌用；無裸 import） |
| [dist/3d-viewer.min.js](../dist/3d-viewer.min.js) | 同上，壓縮版（944 KB，部署用） |
| [liltoon-bridge.js](../liltoon-bridge.js) | 第 4 著色後端適配層（把 lilCfg / Unity 材質喂给 three-liltoon） |
| [vendor/three/](../vendor/three/) | 本地 three.js r185.1 + addons（含 `effects/OutlineEffect.js`） |
| [vendor/three-liltoon/](../vendor/three-liltoon/) | three-liltoon 運行時 + 編譯好的 lilToon GLSL（2.2 MB，第 4 後端按需加載） |
| [CONFIG.md](CONFIG.zh-TW.md) | 設定字段完整參考 |
| [README.en.md](README.en.md) · [README.ja.md](README.ja.md) · [README.zh-TW.md](README.zh-TW.md) · [README.ko.md](README.ko.md) | 本說明的其他語言版（`CONFIG` / `DEPLOY` / `LILTOON` 同樣有） |
| [DEPLOY.md](DEPLOY.zh-TW.md) | 部署與打包說明 |
| [LICENSE](../LICENSE) | 項目許可證（MIT） |
| [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) | 第三方聲明（three.js / lilToon / three-liltoon） |

## 設定（JSON）

`createViewer` 接受 `config`（對象）或 `configUrl`（JSON 地址）。所有字段可選：

```jsonc
{
  "model": {
    "url": "./assets/sample.glb",                             // 模型檔案
    "mouthAtlas": "./assets/mouth/Character_Mouth_2.png"      // 嘴部修復貼圖（kivo 圖集）
  },
  "pivot": { "x": 0.25, "z": 0.30 },                          // 旋轉基準調整
  "renderer": {
    "render": "toon",                                         // 材質模型："pbr" | "toon" | "unlit"
    "shader": "cel",                                          // 著色後端（僅 render:"toon" 有效）：
                                                              //   "none" | "cel" | "lilToon" | "liltoon-src"
    "outline": true, "outlineThickness": 0.002,
    "outlineColor": [0.10, 0.07, 0.11], "outlineAlpha": 1.0,
    "targetHeight": 2.0, "fov": 30, "shadows": true
  },
  "lighting": { "preset": "day", "exposure": 1.0 },           // "day" | "golden" | "night"
  "background": { "transparent": true, "color": null },       // 預設透明
  "animation": { "name": "CH0155_Normal_Idle" }
}
```

> 舊鍵 `"shading"`（`"pbr"` / `"cel"` / `"unlit"`）仍然可用，等價於 `render` + `shader` 的快捷組合。
>
> **相對路徑按設定檔案所在目錄解析**。所以把設定放在站點根目錄，
> 它的 `"./assets/sample.glb"` 就始終正確 —— 被別的站點內嵌時也能定位到模型。
>
> 现成的 CH0155 設定見 [assets/sample.json](../assets/sample.json)（基準 X = +0.25，Z = +0.30），
> 另有 [assets/fallback.json](../assets/fallback.json) 可作"復制一份改三處"的模板。

完整字段（含 `data-*` 屬性、事件、全局鉤子）見 [CONFIG.md](CONFIG.zh-TW.md)。

## 三種使用方式

### 1. 直接打開 index（可用 URL 參數傳入）

```
index.html?config=./assets/sample.json
index.html?model=./assets/sample.glb&mouth=./assets/mouth/Character_Mouth_2.png&config=./assets/sample.json
```

### 2. 第三方網站內嵌（推薦：自包含單檔案版，**不需要 importmap**）

```html
<!-- 1. 放一個容器，用 data-ba3d-* 聲明設定 -->
<div data-ba3d data-ba3d-config="./assets/sample.json"
     style="width:480px;height:640px"></div>

<!-- 2. 引入自包含單檔案版並自動掛載 -->
<script type="module">
  import { autoMount } from 'https://你的域名/ba3d/dist/3d-viewer.min.js';
  autoMount();
</script>
```

容器上可用的屬性：

| 屬性 | 說明 |
|---|---|
| `data-ba3d` | 標記這個容器要掛查看器（值可留空） |
| `data-ba3d-model` | 模型檔案 URL（`.glb`） |
| `data-ba3d-mouth` | 嘴部修復貼圖 URL（kivo 圖集 `.png`） |
| `data-ba3d-config` | 設定 JSON 的 URL（基準 + 渲染 + 打光 + 背景） |
| `data-ba3d-auto-rotate` | `true` 時自動旋轉 |

### 3. JS 創建（等價）

```js
import { createViewer } from './dist/3d-viewer.min.js';

const viewer = createViewer(document.getElementById('stage'), {
  modelUrl: 'https://你的域名/ba3d/assets/sample.glb',
  mouthAtlasUrl: 'https://你的域名/ba3d/assets/mouth/Character_Mouth_2.png',
  configUrl: 'https://你的域名/ba3d/assets/sample.json',   // 也可直接傳對象：config: {...}
  backgroundTransparent: true,
});
await viewer.load();
```

> 如果不用單檔案版、而是用 `vendor/three/` + `viewer.js`，宿主頁面必須提供 importmap：
> ```html
> <script type="importmap">
> { "imports": { "three": "https://你的域名/ba3d/vendor/three/three.module.js",
>                "three/addons/": "https://你的域名/ba3d/vendor/three/" } }
> </script>
> ```

## 功能

- **材質模型**：原始（PBR）/ **卡通材質（Toon）** / 無光照（Unlit）
- **著色後端**（工具欄「著色」下拉，4 項，**僅卡通材質下可用**）：
  - `不注入（原生）` / **`Cel 分檔`（預設）** / `lilToon 風格`（自研移植實现）
  - **`lilToon 源碼`** —— 錶面著色直接復用 [three-liltoon](https://www.npmjs.com/package/@mochiya/three-liltoon)
    對**真 lilToon 源碼**的轉譯產物（與 Unity 對拍：簡單路徑 2.22%、陰影+邊緣光 5.37%、亮度比 1.000）。
    ⚠️ 該後端**按需加載**（2.2 MB，不切到它就不下載）；**描邊仍走我們自己的實现**
    （實測上游發布版的描邊不可用）；
    ⚠️ **單檔案版用不了這個後端**（`dist/` 內部是裸 `three` 說明符）—— 要用它請部署 `vendor/` + `viewer.js` 形態。
- **描邊**：反殼法（three 的 `OutlineEffect`，支持蒙皮），可調粗細與顏色；lilToon 模式下由 `setLilOutline` 接管
- **lilToon 參數面板**：免改 JSON 直接調參數，可導入 Unity 側匯出的 `.lilToon.json` / `.mat` / `.asset`
- **設定匯出 / 導入**：工具欄「匯出 JSON」只寫與預設值不同的項；導入後 UI 自動同步
- **部件面板**：隱藏 / 顯示可選部件與道具
- **打光預設**：白晝 / 早晨·傍晚 / 黑夜
- **背景**：預設**透明**（透出網頁內容），另有 4 預設色 + 取色器
- **動作**：24 段動畫切換，預設只播 idle；也能直接播 Unity 的 `.anim`（錶情 blendShape / 換裝顯隱 / 通用變換曲線，見 [CONFIG.md](CONFIG.zh-TW.md)）；換裝動作（`m_IsActive` 那類）在工具欄是**按鈕**：點一下換上、再點一下脫掉（按換裝前的状態還原，可反復切換）；自定義模型可**一次多選** `.anim`、lilToon `.mat` / `.asset`（按材質名各自對應）與 Unity `.prefab`（據此復现「哪些部件預設隱藏」—— 這個状態只在 prefab 裡、FBX 與 .anim 都不存）；**整個 Unity 工程檔案夾也可以直接拖進來**，會自動認出模型 / prefab / `.anim` / `.mat` / 貼圖，以及 Humanoid 肌肉換算錶（`humanoid-muscles.json`）並加載
- **視角**：軸視圖（前 / 後 / 左 / 右）；**720° 無極旋轉**；旋轉基準位置可設定 X/Z（滑杆 + 數字輸入）
- **浮窗布局**：位置尺寸自動記住，控制台 `ba3dResetLayout()` 恢復預設
- **移動端**：支持觸控
- **光環**绑定頭部骨骼 `Bip001_Head`
- **嘴部**：按 kivo 方案拆 UV 岛 + 嘴部圖集，由 `bone_mouth` 驅動開合，材質跟隨渲染模式

## 部署

纯靜態站點，**無構建步驟、無 CDN 依賴**，全部使用相對路徑（根路徑/子路徑部署都不用改設定）。
`dist/` 已預打包好，直接上傳即可；完整清單見 [DEPLOY.md](DEPLOY.zh-TW.md)。

`.glb` 的 MIME 需要是 `model/gltf-binary`（`_headers` / `.htaccess` / `.nojekyll` 已隨包提供，見下錶）：

| 平台 | 處理 |
|---|---|
| Netlify / Cloudflare Pages | `_headers`（部署包內已含） |
| Apache | `.htaccess`（部署包內已含） |
| GitHub Pages | `.nojekyll`（部署包內已含） |
| Nginx | `mime.types` 加 `model/gltf-binary glb;`，或直接用 `nginx-3d-viewer.conf` |

## 技術要點

### 場景參數（照搬基線）

- 歸一化：`targetHeight = 2.0`（最長軸縮放），腳對齊 y=0、水平居中
- 相機：`PerspectiveCamera(fov=30, near=0.05, far=200)`
- 灯光：半球光 + 主方向光（帶陰影）+ 輪廓光 + 補光；`RoomEnvironment` PMREM
- 控制器：`OrbitControls`（damping、限位）；陰影 PCFSoft + `ShadowMaterial` 地面

與基線的刻意差異：本地 `vendor/three` 代替 CDN；去掉用不到的 DRACO/KTX2/Meshopt loader；
預設只播 idle（基線原檔案同時 play 全部動畫是 bug）；新增渲染模式/描邊/打光預設/背景/基準/嘴部修復。

### 卡通渲染

`MeshToonMaterial` 不支持 `envMap`，所以卡通模式下自動補償光照（半球光 ×1.25、主光 ×0.8、曝光 ×0.9）。
切換完全可逆：原材質掛在 `userData.__src`。

### 描邊

反殼法：把模型再画一遍，頂點沿**法線**外擴、只渲染**背面**、填成描邊色。
**透明材質不做描邊** —— 反殼是"實心背面殼"，對薄片（盾牌）會糊上一層實色把半透明盖掉。

### 嘴部修復（照搬 kivo.wiki）

`CH0155_Body_4`（EyeMouth）裡「嘴」= **z 最低**的那個 UV 岛（38 三角形），
其 UV 框落在貼圖的**纯黑占位区** → 所以原本是黑嘴。修法：按 UV 岛拆網格，
把嘴的三角形独立成一個 `SkinnedMesh` 用嘴部圖集，`repeat/offset` 把 UV 框映射到圖集某一格。

### 假 BLEND 修正

GLB 裡 `CH0155_Weapon`（枪）/ `CH0155_Milk`（牛奶盒）被標成 `BLEND`，但貼圖其實是
「不透明 + 鏤空/留白」型。判據是**中間值 alpha 占比**（`0 < a < 250`）：
占比很小 → 按不透明渲染；占比很大（如盾牌 alpha≈128）→ 保持透明。

## 許可證

本項目采用 **MIT 許可證**（© 2026 Hazuki Kaguya）—— 見 [LICENSE](../LICENSE)。

隨包分發的第三方組件同樣為 MIT，版權與許可全文見 [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md)：

| 組件 | 許可證 | 用在哪 |
|---|---|---|
| three.js 0.185.1 | MIT © 2010-2026 three.js authors | `vendor/three/`，並內聯進 `dist/` |
| lilToon 2.3.4 | MIT © 2020-present lilxyzw | 僅其編譯產物：`assets/lilshaders.inline.js`、`vendor/three-liltoon/chunk-*.js` |
| @mochiya/three-liltoon 0.1.9 | MIT © 2026 Mochiya | `vendor/three-liltoon/`（第 4 後端按需加載） |

> **內嵌 / 分發時請一並保留 `LICENSE` 與 `THIRD-PARTY-NOTICES.md`** —— MIT 要求保留版權與許可聲明。
> 本目錄已包含這兩份檔案。
>
> 倉庫內的**示例模型與貼圖素材不屬於上述許可範圍**（`assets/sample.glb`、`assets/mouth/*.png`、
> `assets/test/*.png`），再分發前請自行核實其授權。
