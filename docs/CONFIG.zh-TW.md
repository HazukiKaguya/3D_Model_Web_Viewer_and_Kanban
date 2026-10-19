# BA3D 設定 JSON 字段說明

[简体中文](CONFIG.md) ｜ **繁體中文** ｜ [English](CONFIG.en.md) ｜ [日本語](CONFIG.ja.md) ｜ [한국어](CONFIG.ko.md)

> **lilToon 基線：2.3.4**
> 本文檔裡的 **UI 標籤按檢視器目前的介面語言書寫**（本文為繁體中文版，介面寫「材質 / 貼圖 / 輪廓」等）。
>   · 源碼地圖（2.3.4 行號）、版本差異清單 ⇒ [`LILTOON2.x.zh-TW.md`](LILTOON2.x.zh-TW.md)
>   · 舊基線（1.3.7）的對照與核對記錄 ⇒ [`LILTOON1.x.zh-TW.md`](LILTOON1.x.zh-TW.md)（已歸檔、行號是 1.3.7 的）
>
> 本文檔裡的 `lil_*.hlsl:NNN` 行號引用**已全部對齊 2.3.4**。

一份設定 `assets/<角色>.json` 描述「模型 + 嘴部修復貼圖 + 縮放/取景 + 渲染/打光/背景 + 預設動作」。

**相對路徑一律按本 JSON 所在目錄解析** —— 所以把 json 和 glb 放在同一個檔案夾裡，
無論站點部署在哪、被誰內嵌，路徑都成立。绝對 URL（`http(s):` / `data:` / `blob:`）原樣使用。

完整示例見 `assets/sample.json`（示例模型 CH0155）與 `assets/fallback.json`（同一模型的另一份設定模板）。

---

## 一、頂層字段

```jsonc
{
  "_comment":   "隨便寫的備注，不參與渲染",
  "model":      { ... },   // 模型檔案與嘴部貼圖
  "pivot":      { ... },   // 旋轉基準偏移
  "renderer":   { ... },   // 縮放 / 取景 / 渲染 / 描邊
  "lighting":   { ... },   // 打光
  "background": { ... },   // 背景
  "animation":  { ... },   // 預設動作與外部 Unity .anim
  "camera":     { ... }    // 聲明式相機（按 Unity 的單位填，復现 Unity 取景）
}
```

---

## 二、`model` —— 模型與嘴部貼圖

| 字段 | 類型 | 預設 | 說明 |
|---|---|---|---|
| `url` | string | `./assets/sample.glb` | 模型檔案。**推薦 `.glb`（自包含）**；`.gltf` 若貼圖/`.bin` 是外部檔案會加載失敗 |
| `mouthAtlas` | string \| `null` | `null` | 嘴部修復用的圖集（kivo 那套）。**不配 = 不做嘴部修復** —— 適合口型本來就是独立網格 / morph target 驅動的模型 |

**關於嘴部修復**：原始模型的嘴部 UV 落在貼圖的纯黑占位区，所以嘴是黑的。
查看器會按「材質名含 `EyeMouth`」找到那張臉圖網格，再按 **UV 岛中 z 最低的那個**切出嘴部，
換成圖集裡對應的口型。CH0155 與 CH0273 實測嘴部 UV 完全一致（`u[0.0086,0.2413] v[0.7926,0.9574]`），
所以單元格布局通用。

> 共用同一材質的網格可能有多個（CH0155 有 Body+Star、CH0167 有 嘴+臉描邊+眼睛），
> 判定"哪個才是嘴"用的是**選中岛的 UV 是否落在嘴部区域**（這幾代 BA 模型一致：
> u≈[0.009,0.241] v≈[0.793,0.957]），可用 `renderer.mouthUv` 覆盖。
> 單看"誰 z 最低"不行 —— CH0155 的 Star（眼睛高光）z 比嘴更低。

> **不配 `model.mouthAtlas` 就不做嘴部修復**（預設行為）。修復是给「嘴混在 EyeMouth 網格裡、
> 渲染成黑塊」的那批模型用的；而像 BA 系列那批，每種口型本來就是**独立網格 + morph target**
> 驅動（實測 morph 權重 1 時把口型甩到自身尺寸的 17 倍之外＝隱藏，動畫設成 0 才顯形），
> 強行套修復反而會把眼睛當嘴拆掉。所以：
>
> - 需要修復 → 在 json 裡寫 `"model": { "mouthAtlas": "./mouth/xxx.png" }`（或容器加 `data-ba3d-mouth`）
> - 不需要修復 → **什麼都別寫**，加載時會輸出 `[fixMouth] 未指定嘴部圖集 … → 跳過嘴部修復`

圖集要求：正方形、**8 × 8 網格**（`Character_Mouth_2.png` 是 1024²，`Character_Mouth_High.png` 是 2048²）。

> **可用格數取決於具體圖集**（逐格采樣實測的結論）：
>
> | 圖集 | 尺寸 | 真正是嘴型的格 | 其餘 |
> |---|---|---|---|
> | `Character_Mouth_High.png` | 2048² | **#0 ~ #63（全部 64 格）** | — |
> | `Character_Mouth_2.png` | 1024² | #0 ~ #17 | #18 起是纯青色 (0,198,188) 占位 |
> | `Character_Mouth_Black.png` | 1024² | #0 ~ #50 | #51 起是青色占位 |
>
> 索引圖（8×8 帶編號，可直接照著挑格）：
> `assets/mouth/_cells-preview-high.png`、`assets/mouth/_cells-preview-2.png`。
> 規律：**從左往右張口度遞增**，第 0 列幾乎是閉合細線。

---

## 三、`pivot` —— 旋轉基準（水平偏移，世界單位）

| 字段 | 類型 | 預設 | 說明 |
|---|---|---|---|
| `x` | number | `0` | 旋轉軸左右偏移 |
| `z` | number | `0` | 旋轉軸前後偏移 |

角色已經**自動按真實內容居中 + 腳落地**，所以正常情況保持 `0`。
只有當某個模型的重心特別偏（比如手裡舉著很大的武器）才需要微調。

---

## 四、`renderer` —— 縮放 / 取景 / 渲染

### FBX 貼圖（`textureBase` / `textureMap`）★

**FBX 把貼圖路徑存在檔案裡** —— 常見是匯出者機器上的绝對路徑（`C:/art/tex/body.png`），
而且用 **Windows 反斜杠**、（瀏覽器會把它編碼成 `%5C`）。所以貼圖很容易全部 404。

我們用一個 `LoadingManager.setURLModifier()` 攔下所有貼圖請求（`TextureLoader` 最終會走 `manager.resolveURL()`），依次處理：

1. **反斜杠 → 正斜杠**（必須，否則路徑根本不對）
2. **去掉盘符**（`C:/art/tex/body.png` → `art/tex/body.png`）
3. **`textureMap` 三級匹配**：完整 URL → 去查詢串 → **只看檔案名**
4. **`textureBase` 兜底**：基準目錄 + 檔案名（只在路徑看起來是外部绝對路徑時才用，避免改壞正常的相對路徑）
5. 都沒命中就**原樣返回**，交给預設邏輯（URL 加載時相對路徑本來就能解析）

#### 三種用法

**① 服務器上有 Texture 子目錄**（URL 加載）

```jsonc
"renderer": { "textureBase": "./Texture/" }
```

**② 貼圖在別的目錄 / 改了名**

```jsonc
"renderer": {
  "textureMap": {
    "body.png": "./Texture/body_diffuse.png",
    "C:/artist/tex/hair.png": "./Texture/hair.png"
  }
}
```

**③ 本地拖入（上傳）**

「自定義模型」面板裡多了 **「選擇貼圖（可多選）」** 和 **「選整個貼圖檔案夾」** ——
選中的檔案會按**檔案名**建映射（`body.png → blob:…`） —— FBX 裡存什麼路徑都無所謂，認檔案名就夠。

> 路徑都按**相對於設定檔案所在目錄**解析、和 `model.url` 一致。

### 自動加載同名設定（`autoConfig`）

加載模型時若**沒有顯式指定設定**（既沒给 `configUrl` 也沒给 `config`），
會自動去找**同目錄下同名的 .json**：

```
assets/sample.glb   →   assets/sample.json     找到就用。
assets/Natsu.glb    →   assets/Natsu.json      沒有 → 靜默跳過（一次 404，不影響加載）
拖入本地檔案         →   不探測（blob: 沒有「同目錄」概念）
```

優先級（`resolveConfig()`）：

1. `configUrl` —— 顯式指定，讀不到會**報錯**
2. `config` —— 直接给對象
3. **同名 JSON 自動發现** —— 讀不到/解析失敗都**靜默**，不阻斷加載

設定裡的相對路徑一律按**設定檔案所在目錄**解析 —— 所以 `sample.json` 裡的 `./sample.glb`、`./mouth/xxx.png` 都能正確定位。

關掉自動發现：

```js
createViewer(el, { autoConfig: false })
```

> 命中時控制台輸出 `[autoConfig] 已自動加載同名設定：<url>`。
> 注意同名 JSON 裡的 `model.url` 會**覆盖**調用方给的模型地址 —— 這是原有行為（顯式設定優先），
> 所以 `sample.json` 裡寫 `./sample.glb` 時仍然加載同一個模型，**不會重復加載**。

### 4.1 縮放與取景（重點）

| 字段 | 類型 | 預設 | 說明 |
|---|---|---|---|
| `targetHeight` | number | `2.0` | **角色真實高度（世界單位）**。歸一化基準 |
| `modelHeightPx` | number | `360` | **角色在屏幕上的高度（CSS 像素）** ← 這就是「預設縮放」 |
| `framing` | `"tight"` \| `"auto"` | `"auto"` | 取景模式，見下 |
| `modelRotation` | `[x,y,z]` \| `null` | `null` | 加載後给模型加旋轉（單位**度**）。**FBX 常見 Z-up，需要它**，如 `[-90,0,0]`；GLB 一般不用 |
| `textureBase` | string \| `null` | `null` | **FBX 貼圖基準目錄**，如 `"./Texture/"`。等價於 `fbxLoader.setResourcePath()` |
| `textureMap` | object \| `null` | `null` | **FBX 貼圖精確映射** `{ "檔案名或原路徑": "實際URL" }`。FBX 裡常存匯出者機器的绝對路徑，所以**按檔案名匹配**最可靠 |
| `framingReferenceHeight` | number | `0` | 參考画布高度；`>0` 時相機參數按它算成固定世界量 |
| `framingOffsetY` | number | **`22`** | 取景垂直偏移（CSS 像素、正值 = 取景下移 ⇒ **画面內容上移**）⚠️ 預設 **不是 0**、見下 |
| `fov` | number | `30` | 垂直視場角 |

**兩個高度字段的区別**（很容易混）：

- `targetHeight` 只管**模型在 3D 世界裡的高度**，用來把不同模型歸一到同一尺度。
  它**不影響屏幕大小** —— 因為相機距離會跟著等比調整。
- `modelHeightPx` 才是**屏幕上的大小**：角色真實內容在參考画布上占多少像素。
  因為歸一化用的是「真實蒙皮內容」而不是包圍盒，**同一個 `modelHeightPx` 在任何模型上
  都是同樣的屏幕大小**。

```jsonc
"targetHeight": 2.0,        // 角色在世界裡 2 個單位高
"modelHeightPx": 360,       // 屏幕上是 360 像素高
```

**換模型時怎麼調**：先用同一套設定。如果該模型的動作幅度大（比如有跪姿、倒地），
角色會超出面板 —— 這時**只調小 `modelHeightPx`** 即可（滾動滾輪縮放只是臨時的，不會儲存）。

> 實測參考（面板 420×430，含全部常用動作不裁切）：
> - CH0155：`modelHeightPx: 360` → 需要 308×405。
> - CH0273：`modelHeightPx: 275` → 需要 309×394。

**`framing` 兩種模式**：

- `"auto"`（預設）—— 基線取景。角色約占画面高度的 85%，隨容器大小變化。
- `"tight"` —— 按**真實蒙皮內容**居中（整盒包圍體在蒙皮網格上不可靠，會讓角色偏心 + 懸空），
  配合 `framingReferenceHeight` 把相機參數固定成世界量。

**`framingReferenceHeight` 的作用**：

| 取值 | 行為 |
|---|---|
| `0`（不配） | 相機距離隨画布高等比 → 角色像素大小恒定（鎖定像素，換容器不變大小） |
| `>0`（如 `430`） | 相機參數按該高度算成**固定世界量** → **面板按百分比縮放時画面整體等比縮放** |

面板尺寸按百分比改（`420×430` → `630×645` → `252×258`）不需要動任何其它設定。

### 4.2 根位移（角色"跑出画面"）

| 字段 | 類型 | 預設 | 說明 |
|---|---|---|---|
| `stripRootMotion` | `"compensate"` \| `"root"` \| `"xyz"` \| `"xz"` \| `false` | `"compensate"` | 根位移處理：**`"compensate"` 對象級抵消（預設，不動動畫軌道）**；`"root"`/`"xyz"` 改寫軌道（會拆散道具，僅特殊模型用）；`"xz"` 保留跳躍；`false` 關閉 |
| `pressHoldMs` | number | `200` | 左鍵在模型上按住多久才算「按下」（否則算點擊，見第九節） |
| `mouthUv` | `[u0,u1,v0,v1]` | 內置值 | 嘴在圖集裡的 UV 区域，僅在「多個網格共用 EyeMouth 材質」時用來判定哪個是嘴 |
| `mouthCell` | number \| `null` | `null` | **預設口型**（圖集格 0~63）：動作沒驅動嘴部骨骼時用哪一格，`null` = 第一個口型 |
| `visibilityRules` | array | `null` | **卡通（Cel / Toon）著色可調項**：卡通模式用 `MeshToonMaterial` + `onBeforeCompile` 注入，
**不重寫整條管線**（貼圖 / 蒙皮 / morph / 陰影 / 頂點色全保留）。注入兩處：

1. **替換 `getGradientIrradiance`** —— 它的返回值會**乘到灯光顏色上**，所以分檔數和暗部色調都在這裡算
   （不再需要 DataTexture 梯度圖）：
   ```glsl
   float q = floor( t * 4.0 ) / max( 4.0 - 1.0, 1.0 );   // 4 檔硬邊
   float v = 0.5500 + 0.4500 * q;                          // 最暗 0.55
   return mix( vec3(1.0), vec3(1.0), v );                  // 暗部色調（null 時是白色）
   ```
   **預設值與舊實现數學等價**（舊 DataTexture 生成的正是 0.55 / 0.70 / 0.85 / 1.00），所以預設外觀零變化。
   ### 分檔色 + 過渡帶（`celBandRamp` / `celBandSoft`）

   **預設不啟用** —— `celBandRamp = null` 時走的正是上面那段老公式，**生成的 GLSL 逐字節不變**，
   所以「cel 模式沒變」這條回歸保證仍然成立。勾上面板上的「分檔色」才切換成下面這個版本。

   原來只有一個「最暗檔亮度 + 暗部色調」，亮暗之間是**線性**過渡、每檔只能用同一個色相。
   现在可以给 **4 個色標各自指定顏色**（最暗段 → 最亮段），每一檔取自己那一檔的顏色：

```glsl
vec3 ba3dRamp4( float u ) {              // 4 色標查錶（頂層函數 —— GLSL 不允許嵌套定義）
  float x = clamp( u, 0.0, 1.0 ) * 3.0;
  vec3 a = mix( C0, C1, clamp( x,       0.0, 1.0 ) );
  vec3 b = mix( C1, C2, clamp( x - 1.0, 0.0, 1.0 ) );
  vec3 c = mix( C2, C3, clamp( x - 2.0, 0.0, 1.0 ) );
  return mix( mix( a, b, step( 1.0, x ) ), c, step( 2.0, x ) );
}
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
  ...
  float x  = t * 3.0;                  // = STEPS-1
  float bi = floor( x );               // 段號
  float bf = x - bi;                   // 段內位置
  float s  = SOFT > 0.0005 ? smoothstep( 0.0, SOFT, bf ) : 0.0;   // 過渡帶
  float d  = max( 3.0, 1.0 );
  float u0 = bi / d, u1 = min( u0 + 1.0 / d, 1.0 );
  return mix( ba3dRamp4( u0 ), ba3dRamp4( u1 ), s );
}
```

   | 鍵 | 類型 | 預設 | 說明 |
   |---|---|---|---|
   | `celBandRamp` | 4×`[r,g,b]` 或 `null` | `null` | 4 個色標，**從最暗段到最亮段**。`null` = 老公式 |
   | `celBandSoft` | number | `0` | 段間**過渡帶寬度** 0~1。0 = 硬邊（`floor`，與老公式一致）· 0.5 = 段內後半段平滑 · 1 = 整段都在過渡。只對 `celBandRamp` 生效 |

   ⚠️ 每一檔拿到的是**色標插值出來的顏色**（`bandSoft = 0` 時是硬邊切換），
   不是「每檔一根独立滑杆」。4 個色標足以錶達冷/暖分檔，同時不至於讓面板爆炸。

   ⚠️ 面板上「分檔色」**不勾選**時，`bandRamp` 傳 `null`、`bandSoft` 傳 `0` —— 和從沒打開過完全一樣。

```jsonc
"celBandRamp": [                 // 藍紫暗部 → 白亮部，四種色相
  [0.16, 0.14, 0.25],
  [0.42, 0.39, 0.53],
  [0.66, 0.63, 0.75],
  [1.0,  1.0,  1.0 ]
],
"celBandSoft": 0.25              // 段間 1/4 段做平滑
```

```js
viewer.setCel({ bandRamp: [[0.2,0.1,0.3],[0.5,0.4,0.6],[0.8,0.75,0.9],[1,1,1]] });
viewer.setCel({ bandSoft: 0.4 });
viewer.setCel({ bandRamp: null });          // 恢復老公式
```

2. **覆盖 `vNormal`（僅臉/眼/眉）** —— 把法線強制指向攝像機（view space 的 `+z`）。
   否則頭一轉，臉上的受光跟著法線變化，會出现一塊塊臟陰影；這是動漫渲染的標準做法。
   **BA 那批模型建議打開** `"celFaceLight": true`。

```jsonc
"renderer": {
  "shading": "cel",
  "celSteps": 2,                              // 硬邊兩級，更"紙片"
  "celDark": 0.62,                            // 暗部再亮一點
  "celShadowTint": [0.72, 0.62, 0.85],        // 暗部偏紫，而不是變黑
  "celFaceLight": true                        // 面部光照修正
}
```

運行時也能改（控制台直接試，立刻重建材質）：

```js
viewer.getCel();                                  // 看當前參數
viewer.setCel({ steps: 2 });                      // 切成硬邊兩級
viewer.setCel({ faceLight: true });               // 開面部修正
viewer.setCel({ shadowTint: [0.72, 0.62, 0.85] });// 暗部偏紫
viewer.setCel({ shadowTint: null });              // 恢復
```

**面部不接收陰影（`faceNoShadow`）**：白晝光下頭發會在臉上投一道很明顯的影，官方渲染裡臉基本是"乾淨"的。
打開後把面部網格的 `receiveShadow` 關掉 —— 陰影貼圖不再作用在臉上，但**頭發投在身體上的陰影不受影響**。
判定復用 `facePattern`，所以卡通模式的 `_Toon` 材質也照樣匹配。

實測匹配結果：

| 模型 | 關掉陰影（面部） | 保持陰影 |
|---|---|---|
| `sample.glb` | 4 個（Face / Eyebrow / EyeMouth / Star）| 7 個（Hair / Body / Weapon / Milk / Pie …）|
| BA `Hoshino.glb` | 19 個（16 個 Mouth_* + Face + Eyebrow + EyeMouth）| 5 個（Hair / Body / Shield / Weapon / Halo）|

```jsonc
"renderer": { "faceNoShadow": true }
```

運行時開關：

```js
viewer.getFaceNoShadow();          // { enabled, pattern, meshes }
viewer.setFaceNoShadow(true);      // 立即生效
viewer.setFaceNoShadow(false);     // 恢復
```

**自陰影 vs 頭發投影（`noCastPattern`）** —— 重要限制：

**標準陰影貼圖無法区分"自陰影"和"他物投影"**。陰影圖只記錄每個像素被什麼深度擋住，
它不知道遮擋物是不是物體自己。所以：

| 想要 | 做法 | 代價 |
|---|---|---|
| 臉上完全沒有影 | `"faceNoShadow": true`（預設）| 自陰影也一並沒了 |
| **臉保留自陰影、劉海不投影** | `"faceNoShadow": false` + `"noCastPattern": "Hair"` | **頭發不再往身體/肩上投影** |
| 臉不接收陰影、但頭發照常投影 | `"faceNoShadow": true` | 同上（自陰影沒了）|

用 layers 给臉單独一盏不投影的灯**也無法解決** —— 那盏灯自己不帶陰影，臉照樣沒有自陰影。

實測 `noCastPattern: "Hair"` 的命中（各 1 個網格，很準）：

| 模型 | 命中 |
|---|---|
| `sample.glb` | `CH0155_Body_1 [CH0155_Hair]` |
| BA `Hoshino.glb` | `Hoshino_Original_Body_6 [Hoshino_Original_Hair]` |

```jsonc
"renderer": {
  "faceNoShadow": false,      // 臉恢復接收陰影（自陰影回來）
  "noCastPattern": "Hair"     // 但頭發不進陰影圖 → 劉海不在臉上投一片
}
```

> 注意：臉能不能出现自陰影，還取決於面部網格自身的**曲率**和 `castShadow`。
> 平面卡片式的臉幾乎沒有自陰影可看；有鼻梁/下巴起伏的才會明顯。

### 卡通（Cel）：除陰影外 ≈ 無光照 ★

**只影響卡通通路，PBR 完全不動**（倍率只寫在 `cel` 分支裡，白晝預設數值保持原樣）。

#### 兩個關鍵點

1. **明暗分檔**：`celSteps: 2`（只有「受光 / 陰影」兩級）+ `celDark: 0.80`。
   分檔讓**所有受光面處於同一亮度** —— 這正是「除陰影外和無光照一樣」的來源。
2. **色調映射**：卡通走 `LinearToneMapping`（數學上等價於 `× toneMappingExposure`）。
   ACES 會把兩檔一起推向纯白：實測受光 1.03 / 陰影 0.83 經 ACES 後變成
   **0.85 / 0.82，對比從 19% 掉到 8.5%，陰影明顯變糊**。
   等比縮放 → **陰影對比原樣保留**，同時曝光旋鈕才真正能用來調亮度。

   > ⚠️ 材質端**一律不參與** tone mapping（與 Unity 一致）：風格後端剥 `#include <tonemapping_fragment>`、源碼後端 `mat.toneMapped = false`；頁面的 tone mapping 只對 PBR / 原生材質生效。詳見 `LILTOON2.x.md` 第十節。

#### 卡通灯光補償（`applyLightingPreset`）

MeshToonMaterial **不支持 envMap**，RoomEnvironment 的環境照明整個丟掉，所以要補；
但**補償方向很關鍵**。渲染式：

```
lit    = hemi×0.62 + key×1.0     + rim + fill
shadow = hemi×0.62 + key×celDark + rim + fill     ← 投影擋住的是整個主光
```

**hemi 同時出现在兩項裡 → 它越高，陰影被衝得越淡。**
舊程式碼把 hemi ×1.25（想補回環境光），結果受光/陰影一起被推向纯白 → 陰影消失。
现在反過來：**大幅壓低 hemi、讓主光主導**，背光面由分檔的 `celDark` 那一檔兜住。

| 參數 | 原值 | 卡通倍率 | 結果 | 作用 |
|---|---|---|---|---|
| `hemi.intensity` | 0.5 | **× 0.48** | 0.24 | 環境光同時出现在受光/陰影兩項裡，**越低陰影越清楚** |
| `key.intensity` | 2.0 | **× 1.22** | 2.44 | 主力：負責受光亮度 + 投影對比 |
| `rim.intensity` | 1.2 | **× 0.15** | 0.18 | 壓到幾乎不可見（不投影，只會衝淡陰影） |
| `fill.intensity` | 0.4 | **× 0.15** | 0.06 | 同上 |
| `exposure` | 1.0 | **× 1.15** | 1.15 | 卡通唯一的亮度總閘 |

**倍率已按實測定標**：亮度滑塊在 **2.1** 時觀感與無光照一致，故把 2.1 直接折進倍率 —— `lightingScale` 保持 1.0 即預設正確，仍可繼續調。
陰影對比約 **17%**（`celDark: 0.80`，比最初 0.72 的 24% 更淡，按實測反饋調過）。
背光面由 0.80 那一檔兜住，不會發黑。

#### 投射陰影浓淡（`celShadowMin`）★ 和 celDark 是兩件事

用戶反饋「照在身上的陰影還是很浓」—— 那不是分檔問題，而是**投射陰影**：

| | 成因 | 由誰控制 |
|---|---|---|
| **分檔** | 法線背光 → 主光打個折 | `celDark`（0.80 = 暗一檔）|
| **投射陰影** | 被頭發/身體**擋住** → 主光**整個被砍掉** | `celShadowMin` |

r160 裡平行光的陰影是**內聯**在 `lights_fragment_begin` 裡的：

```glsl
directLight.color *= ( directLight.visible && receiveShadow )
    ? getShadow( directionalShadowMap[i], … ) : 1.0;
```

而 `getShadow` 只返回 0 或 1 —— **要麼全给要麼全不给**，`celDark` 那一檔根本管不到它。
所以陰影裡只剩環境光，看起來特別浓。

處理：把結果重映射成 `mix( keep, 1.0, s )` ——
受光（s=1）原樣，投影（s=0）保留 `keep` 倍主光。**现預設 `0.3`**（實測定標：0.5 偏淡，0.3 合適）。

> ⚠️ **實现上有個必須注意的坑**：three 的調用順序是
> `WebGLRenderer → material.onBeforeCompile(parameters, renderer)`（回調），
> `WebGLProgram → resolveIncludes(fragmentShader)`（include 才展開）。
> 也就是說**回調拿到的還是含 `#include` 的原始源碼**，直接去找 `getShadow(…)` 那一行是找不到的
> （cel 渐變能生效，正是因為替換的是 `#include` 本身）。
> 這裡取 `THREE.ShaderChunk.lights_fragment_begin` 原文、軟化後整體頂替該 include，保證與 three 原版逐字一致。

#### ✅ 臉部陰影的真相（三輪排查後的結論）

結論修正過兩次，最終用 **Raycaster 精確遮擋測試**定案 —— 從面部頂點朝主光方向打射線，看有沒有被頭發擋住：

```
主光方向 (0.38, 0.77, 0.51)
sample.glb   266 個面部頂點 → 229 個被頭發擋住 (86.1%)
Natsu.glb    288 個面部頂點 → 148 個被擋住 (51.4%)
命中距離 = 0.000 ~ 0.001        ← 關鍵在這
```

**臉上確實有投射陰影**，而且是**貼合**的（臉和頭發互相穿插）。

真凶是 `keyLight.shadow.normalBias = 0.02` —— 它把陰影采樣沿法線**推開**，
0.02 在只有 ~2 單位高的模型上是**接觸距離 0.001 的 20 倍** → 臉上的投影被整個抹掉。
身體的影還在，是因為那裡間隙大得多，现象完全吻合。

> 前兩輪的判斷都錯了：先說「是分檔不是投影」，又說「幾何上投不出來」。
> 第一輪錯在把額頭暗帶當成唯一可能；第二輪錯在拿**模型中心**當人臉做采樣，測的根本不是臉。

**嘗試過但無效**：把 `shadowNormalBias` 從 0.02 調到 0 —— 實測**臉影仍然沒出來，反而讓光照變怪**，已回退到原值。
所以這條推斷**不成立**，此處僅記錄排查過程，別再照它去調。

> 兩個值仍保留為設定項（`shadowBias` / `shadowNormalBias`），預設即 viewer 一直以來的原值。

#### 臉部陰影：**只用一個參數**（`celFaceShadowMin`）

浓度本身就錶達了「有無」：**拖到最右（≥0.95）= 沒有面部陰影**，所以不再需要額外的開關。

| `celFaceShadowMin` | number \| `null` | **`0.7`** | **面部陰影的唯一參數**：`0` = 最深，`>= 0.95` = 沒有面部陰影，`null` = 跟隨 `celShadowMin` |

| 取值 | 含義 |
|---|---|
| **`0.7`（預設）** | 面部比身體（0.3）**更淡**的投影 |
| `null` | 跟隨全局 `celShadowMin` |
| `0` | 面部保留原始硬陰影（最深）|
| `0.3` | 與身體同檔（柔和）|
| `>= 0.95` | **沒有面部陰影** |

實现上，這個值同時驅動兩件事，**一個參數覆盖兩個渲染通路**：

1. **卡通**：改寫 `lights_fragment_begin` 裡的 `getShadow(...)` → `mix(keep, 1.0, s)`，控制投影浓度
2. **兩者通用**：當 `>= 0.95` 時派生 `faceNoShadow = true`，直接關掉面部網格的 `receiveShadow`
   —— `receiveShadow` 在 `lights_fragment_begin` 裡被**所有材質類型**檢查（toon / standard / lambert / phong），
   所以 PBR 通路也一並覆盖、（只靠著色器軟化的話 PBR 是無效的）

界面：**「臉部」滑塊**（旁邊是全局「陰影浓淡」）。未動過它時跟隨全局並實時同步顯示，一動就變成独立值。
想回到跟隨：設定寫 `null`，或 `viewer.setCel({ faceShadowMin: null })`。

> 已移除的东西：独立的「面部陰影」開關、以及 `setFaceNoShadow()` API —— 都合並進這一個參數了。
> `renderer.faceNoShadow` 也不再被讀取（設定裡寫了會被忽略）。

索引頁右下角有 **「陰影浓淡」滑塊**（0 ~ 0.95）可以實時調。也可以在設定 JSON 裡寫：

```jsonc
"renderer": {
  "celShadowMin": 0.3,        // 全身投射陰影：0 = 硬陰影，1 = 完全沒有
  "celFaceShadowMin": null,   // 面部單独一檔；null = 跟隨上面。設 0 讓臉影最深
  "celSteps": 2,              // 只有受光/陰影兩級
  "celDark": 0.80,            // 背光面的分檔浓淡
  "shadowNormalBias": 0.02,   // 陰影沿法線推開的距離（預設值，未調優）
  "shadowBias": -0.0003
}
```

運行時等價寫法：`viewer.setCel({ shadowMin: 0.3 })`

#### 微調（索引頁已帶「光照亮度」滑塊 + 數字輸入框）

- **陰影太淡** → 調 `viewer.setCel({ dark: 0.68 })`（`celDark` 越小陰影越深；现 0.80）
- **整體偏暗/偏亮** → **界面上的「光照亮度」滑塊**（實時；兩個通路都吃，1.0 = 預設原值）
- 卡通另有總閘 `toneMappingExposure × 1.15`，調它同樣等比、不損陰影對比
- **想更「卡通」的分檔** → `viewer.setCel({ steps: 4 })`（回到四級梯度）

> `faceNoShadow` 預設 `false`（**保留面部陰影**）。分檔 + 直通之後投影很乾淨，
> 不再需要以前那種關掉面部陰影的兜底；設 `true` 仍可去掉。

### 可選部件與道具（`hideOptional` / `hideParts`）

**這批模型自己在 GLB 節點上帶了標記**（lihaohong6/BlueArchiveModels，共 295 個裡 44 個有 extras）：

```json
"Hoshino_Original_Shield_Weapon": { "optional": true, "prop0": true }
"Juri_Original_Weapon":           { "optional": true, "prop0": true }
```

GLTFLoader 會把 extras 放進 `object.userData`，所以能直接讀。語義是：
**標了 `optional` 的部件預設隱藏，只有當前動作真的驅動它時才顯示** —— 對應參考查看器的
`data-hide-parts="optional"`。實測完全對得上：

| 模型 | 部件 | 顯示於 |
|---|---|---|
| `Hoshino.glb` | 盾牌 | `Exs_Cutin` / `Exs`（2/36 段）|
| `Juri.glb` | 武器 | `Formation_Idle` / `Tactical_Start`（2/8 段）|

**預設開啟**，不用設定。這也把以前手寫的 `visibilityRules` 自動化了 —— 同一條規則现在可以刪掉。

```js
viewer.getOptionalParts()
// [{ name: 'Hoshino_Original_Shield_Weapon_1', prop: true, usedBy: 2, visible: false }]
```

#### 那"位置不對的小物件"呢

有一批道具（計算器 / 無人機 / 服裝配件）的骨骼是**與 `Bip001_Pelvis` 平級的独立根**，
位置由游戲引擎決定，GLB 裡就是錯的，且**換父級也修不好**（動畫的局部值按原父級寫的，
實測 Yuuka 的計算器掛到右手後與手的距離反而從 0.29 變成 0.69）。這類只能藏：

```jsonc
"hideParts": "Calculator|Dron"     // 正則片段，匹配網格名或材質名
```

> 注意 `bone_cos1_01..04` 那類是**服裝配件**（被 31~33/44 段動作驅動），本來就該顯示，別誤藏。

### 骨骼縮放 = 隱藏道具（`hideByBoneScale`）

**這批模型普遍用「把驅動骨骼縮到很小」來錶達「這個道具现在不顯示」** —— 但縮到 0.3 並不是 0，
於是縮小版道具仍然浮在原處（實測 Airi.glb 的冰激凌就掛在腦門上）。

判據：**該網格骨架裡的所有骨頭縮放都小於閾值**（預設 0.5）。用「所有」而不是「取最小」，
是為了不誤伤角色本體 —— 本體 100+ 根骨骼總有接近 1 的，永遠不會全部低於閾值；
道具只有 1~2 根，很容易命中。每幀判定（縮放隨動作變化），但會跳過 `hideOptional` 管理的網格。

實測效果（這條規則**精確復现了模型作者錶達的隱藏意圖**）：

| 模型 | 網格 | 隱藏於 | 顯示於 |
|---|---|---|---|
| `Airi.glb` | 冰激凌 | `Cafe_Reaction` / `Cafe_Idle` / `Cafe_Walk`（scale 0.315）| 其餘 4 段（0.761~1.0）|
| `Natsu.glb` | 派 `CH0155_Pie01` | **全部動作** | — |
| `Natsu.glb` | 牛奶盒 | `Formation_*` / `Normal_*` 等 | `Cafe_Idle` / `Cafe_Walk` / `Cafe_Reaction` |
| `Shiroko.glb` | 無人機火箭 / 機翼 | **全部動作** | — |

```jsonc
"hideByBoneScale": 0.5      // 預設開啟；設 0 關閉
```

### 光環在 PBR / Cel 下全黑 → 零法線（已自動修復）★

**症状**：模型的光環在 `unlit` 下正常，在 **PBR / Cel 下是纯黑**。

**原因**：相當一部分模型的**光環網格根本沒有 NORMAL 屬性**。按 glTF 規範，
GLTFLoader 遇到缺失法線會填一整個**零向量**緩衝；零法線在受光材質下光照恒為 0 → 纯黑。
而 unlit 用的是 `MeshBasicMaterial`，**根本不讀法線**，所以看起來正常。

**範圍**（掃描 60 個模型）：29 / 1078 個網格是零法線，**其中 28 個都是光環**
（`Airi_Original_Halo_1`、`Hoshino_Origina_Halo`、`Akari_Halo`、`Aris_Original_Halo_1` …）。
也有正常的光環，例如 `CH0155_Halo_1`（Natsu.glb）法線是 1.000 —— **這個缺陷是逐模型的**。

**處理**：加載時對所有網格做一次抽樣檢查，**整片都是零 / NaN 法線**的調用
`geometry.computeVertexNormals()` 重算（得到面法線，平面著色；對光環這種薄片正合適）。
抽樣判斷保證正常網格不會被誤改、也不付全量代價。

實測：

| 模型 | 修復前 | 修復後 |
|---|---|---|
| `Airi.glb` | 333/333 頂點零法線 | 0/333，平均長度 1.000 |
| `Hoshino.glb` | 282/282 頂點零法線 | 0/282，平均長度 1.000 |
| `Natsu.glb` | 0/268（本來正常）| 未改動 |

> 光環預設仍然**不描邊**（`outlineSkipPattern: "Halo"`）—— 那是另一個独立問題：
> 薄板 + DoubleSide 的反殼會戳穿自身造成閃烁，與法線無關。

### 根位移：對象級抵消，不要改寫動畫軌道 ★

**預設 `stripRootMotion: "compensate"`** —— 把根位移在**對象層**抵消：動畫照常播放，
每幀讀出根骨骼相對 `modelRoot` 的位移，把 `modelRoot` 反向偏移。

#### 為什麼不能改寫動畫軌道

舊做法（壓平 `Bip001` / `bone_root` 的 position 軌道）有致命副作用：
那些**掛在模型根下、不隨骨架移動**的道具會和身體分家。實測：

| 模型 | 现象 |
|---|---|
| `Natsu.glb` 牛奶盒 | 從嘴邊（57% 身高）跑到**頭頂**（90%）|
| `Airi.glb` 冰激凌 | 同樣跑到頭部 |

而且這個坑很深：`Airi.glb` 的鏈上**只有 `Bip001.position`**（沒有 `bone_root`），
所以連"只壓最外層"也救不了它。

#### 新方案實測

| | 根骨骼世界擺動 | 道具距手 |
|---|---|---|
| Natsu `Vital_Death` | 0.539 → **0.000** | 0.24 → **0.24**（不變）|
| Hoshino `Exs_Root` | 3.010 → **0.000** | 0.42 → **0.42**（不變）|
| Airi `Exs` | 0.392 → **0.000** | 0.43 → **0.43**（不變）|

**根位移徹底消除，同時一根骨骼都沒碰** —— 道具自然還掛在動畫安排的位置上。

#### 兩個實现細節

1. **用「相對 modelRoot 的局部坐標」而不是世界坐標** —— 世界坐標裡含上一幀的補償量，
   會形成自反饋（抬起→判定不需要→落回→再抬起）。`worldToLocal` 會把 `modelRoot`
   自身的平移除乾淨，天然無反饋。
2. **局部增量要乘回模型縮放** —— `worldToLocal` 會**除以** `modelRoot.scale`
   （歸一化後通常 1.3~1.8），不乘回去只能抵消 1/scale，實測剩餘 45~55% 擺動。

只抵消水平(X/Z)，**保留豎向** —— 跳躍/倒地的上下位移是動作本身要錶達的。

> Hoshino 的 `Exs_Root` 原始根位移高達 **3.01 單位**（角色才 2 單位高），
> 是最需要這個機制的動作。

**按動作控制網格顯隱**：盾牌/武器只在特定動作裡出现時用它（見下方說明） |
| `mouthIdle` | boolean | `false` | **兜底口型**：動作沒驅動嘴部骨骼時，讓口型自行循環（見下方說明） |
| `mouthIdleMs` | number | `180` | 兜底口型每格停留時長（毫秒），最小 60 |

有些動作（行走 `Move_Ing`、舞台錶演）會平移根節點，而模型歸一化時整體被放大了上百倍
（CH0273 是 150 倍），於是 0.0126 的原始位移變成約 1.9 個世界單位 —— 角色直接走出画面。

- `"xyz"` —— 三軸全抹，角色**永遠**留在画面裡。代價：跳躍高度、倒地墜落也被抹平
- `"xz"` —— 只抹水平位移，保留跳躍 / 倒地
- `false` —— 不處理

實现上**不寫死節點名**：根位移的載體在 CH0273 裡是 Object3D `Bip001`（不是 Bone，但子樹含全部 141 根骨骼）。
判定方式是「從最頂層骨骼往上，凡是帶 position 動畫的祖先」。

### 4.3 著色與描邊

| 字段 | 類型 | 預設 | 說明 |
|---|---|---|---|
| `autoConfig` | boolean | `true` | 未顯式给設定時，自動加載與模型同名的 .json（詳見「自動加載同名設定」一節）|
| `shading` | `"pbr"` \| `"cel"` \| `"unlit"` | **`"cel"`** | `pbr`（原始）\| `cel`（卡通，預設）\| `unlit`（無光照）|
| `celSteps` | number | `2` | 卡通明暗分檔數（**2 = 只有受光/陰影兩級** → 除陰影外就是平的；4 以上回到多級梯度）|
| `celDark` | number | `0.80` | 卡通最暗檔亮度（1.0 = 全亮）；**越小陰影越深**，0.80 = 只淡一檔 |
| `celShadowMin` | number | `0.3` | **投射陰影裡保留多少主光**：0 = 原來的硬陰影，1 = 完全沒有投射陰影（僅卡通模式）|
| `shadowNormalBias` | number | `0.02` | 沿法線推開陰影采樣（保持原值）|
| `shadowBias` | number | `-0.0003` | 陰影深度偏移（保持原值）|
| `celFaceShadowMin` | number \| `null` | `null` | **面部單独的投射陰影浓度**（`null` = 跟隨 `celShadowMin`）。比全局小 = 臉影更清晰；`0` = 满強度硬影 |
| `celShadowTint` | `[r,g,b]` \| `null` | `null` | 卡通暗部色調（0~1），如 `[0.72,0.62,0.85]`；`null` = 只變暗不變色 |
| `celFaceLight` | boolean | `false` | **面部光照修正**：臉/眼/眉法線強制朝向攝像機 |
| `celFacePattern` | string | `Face\|EyeMouth\|Eyebrow\|Mouth` | 哪些材質名算「臉」（正則片段）|
| ~~`faceNoShadow`~~ | — | 派生 | **已改為派生字段，不再單独設定**：由 `celFaceShadowMin`（未設則 `celShadowMin`）決定，**≥0.95 視為沒有面部陰影** |
| `outlineSkipPattern` | string \| `null` | `"Halo"` | 這些材質名不描邊（薄板反殼會戳穿自身 → 閃烁）|
| `hideOptional` | boolean | `true` | **GLB 標了 `extras.optional` 的部件預設隱藏**，只有動作真的驅動它時才顯示 |
| `hideByBoneScale` | number | `0.5` | **按骨骼縮放隱藏道具**：網格骨架裡所有骨頭縮放都小於此值時視為隱藏；`0` = 關閉 |
| `lightingScale` | number | `1` | 打光預設的**整體亮度倍率**（運行時可用 `viewer.setLightingScale(x)` 實時調）|
| `hideParts` | string \| `null` | `null` | 直接隱藏匹配的網格（正則片段，匹配網格名或材質名）|
| `attachProps` | array \| `null` | `null` | 把脫落的道具骨骼掛到角色骨骼上 —— **實測不可靠**，優先用 hideParts |
| `noCastPattern` | string \| `null` | `null` | **不投影的材質名**（正則片段），如 `"Hair"`。配合 `faceNoShadow: false` 可做到「臉保留自陰影、但劉海不在臉上投影」|
| `outline` | boolean | `true` | 反殼描邊開關 |
| `outlineThickness` | number | `0.002` | 描邊粗細 |
| `outlineColor` | `[r,g,b]` | `[0.10,0.07,0.11]` | 描邊顏色（線性 0~1，官方是偏暖的深色，不是纯黑） |
| `outlineAlpha` | number | `1.0` | 描邊透明度 |
| `shadows` | boolean | `true` | 陰影（含地面接觸陰影） |

> `cel` 模式下 `MeshToonMaterial` **不支持 envMap**，環境光貢献會丟失，所以取景時會给灯光做補償
> （半球光 ×1.25、主光 ×0.8、曝光 ×0.9）。切回 `pbr` 會自動還原。

---

## 五、`lighting` —— 打光

| 字段 | 類型 | 預設 | 說明 |
|---|---|---|---|
| `preset` | `"day"` \| `"golden"` \| `"night"` | `"day"` | 白晝 / 早晨傍晚 / 黑夜 |
| `exposure` | number | `1.0` | 渲染器曝光 |

打光只改灯光，**不碰背景** —— 背景由下面的字段独立控制。

---

## 六、`background` —— 背景

| 字段 | 類型 | 預設 | 說明 |
|---|---|---|---|
| `transparent` | boolean | `true` | `true` = 透明背景（**內嵌時透出下方網頁內容**） |
| `color` | string \| number \| `null` | `null` | 非透明時用；`#rrggbb` 或 `0xRRGGBB` |

透明背景的實现是渲染器 `alpha: true` + `scene.background = null` + `setClearAlpha(0)`，
所以 canvas 是真的透明，不是"画一個和網頁同色的底"。

---

## 七、`animation` —— 預設動作與外部動畫

| 字段 | 類型 | 預設 | 說明 |
|---|---|---|---|
| `name` | string | 不配 → **在名字含 `idle` 的動作裡隨機** | 初始動作 |
| `clips` | array | `[]` | **外部 Unity `.anim` 列錶**（FBX 通常不自帶動畫）。每項 `{ url, name?, group? }`，相對路徑同樣按設定檔案所在目錄解析 |
| `axisFix` | boolean | `true` | 外部 `.anim` 的坐標轉換（Unity 左手 → three 右手）。模型軸向不一致時設 `false` |
| `humanoid` | string \| object | `null` | **Humanoid 肌肉換算錶**（URL 或內聯對象）：Unity 側腳本一次性量出「每條肌肉 → 哪根骨骼 · 什麼軸 · 每單位多少度」✓ 有它 ⇒ 只含肌肉曲線的 `.anim` 也能播 |
| `rootMotion` | bool | `true` | **根運動**（Humanoid 片段裡的 `RootT` / `RootQ`）：把片段的位移與轉身疊到角色身上 ✓ 關掉則只播骨骼動作、角色原地不動 |

匹配規則（依次嘗試）：**精確名字 → 忽略大小寫精確 → 名字包含（忽略大小寫）**。
所以 `"CH0273_Cafe_Idle"` 和簡寫 `"Cafe_Idle"` 都能命中。

**Humanoid 動作需要換算錶**：肌肉值的解算依賴 Avatar，而 Avatar **不落盘**（實測 melano.fbx.meta 裡沒有任何映射字段）
⇒ 用 Unity 側腳本一次性量出來：選中角色 → `Tools ▸ BA3D ▸ 匯出 Humanoid 肌肉換算錶（JSON）`，
把生成的 JSON 放到模型目錄，並在這裡填 `"humanoid": "./humanoid-muscles.json"`。解算公式是「零姿勢 × ∏ 單軸旋轉」，
與腳本的自檢公式**逐字相同** —— 腳本會報告最大角度誤差（≈0 即精確）。
錶是**按角色**的，換角色要重導。

**兩種讓舞蹈動起來的方式**：
· **烘焙**（最精確）：Unity 裡 `Tools ▸ BA3D ▸ 把選中的 Humanoid .anim 烘成變換曲線` ⇒ 生成 `*_transform.anim`，
  由 Unity 用 Avatar 精確解算（含腳部 IK），導入後逐幀一致；腳本已自動瘦身，一個舞通常幾 MB 而不是幾百 MB；
· **直讀 `.anim`**（方便）：配上 `humanoid` 換算錶即可直接播，
  片段的位移與轉身（`RootT` / `RootQ`）也會自動疊上 ✓。

### 7.1 外部 Unity `.anim`

Unity 工程裡的 FBX 通常**不帶動畫** —— 動作與錶情都是独立的 `.anim`（AnimationClip，YAML 文本）。
查看器直接讀它們，並按曲線類型分流：

| `.anim` 裡的內容 | 支持 | 落到 three 的 |
|---|---|---|
| `blendShape.<名字>` | 是 | `morphTargetInfluences[i]`（錶情） |
| `m_IsActive` / `m_Enabled` | 是 | `visible`（換裝與部件顯隱，按階躍插值） |
| `m_LocalPosition` / `m_LocalRotation` / `m_LocalScale` / `localEulerAnglesRaw` | 是 | `position` / `quaternion` / `scale`（骨骼動畫） |
| **Humanoid 肌肉曲線**（`Chest Twist Left-Right` 這類） | 否 | 無 —— 肌肉值是相對 Avatar T-pose 的，而 Avatar 映射不在 `.anim` 裡 |
| `RootT` / `RootQ`（Humanoid 根運動） | 否 | 無 |
| `m_PPtrCurves`（貼圖與材質切換） | 否 | 無 |

**含不支持曲線的片段會被整體跳過**（不做「半套用」—— 否則身體停在绑定姿勢、只有錶情在動，
觀感是錯的）。跳過時控制台會寫明是哪一類、各多少條。

兩個前提，缺一不可：

- **錶情要求模型自帶 blendShape**：GLB 可以；**FBX 不行** —— three 的 FBXLoader 不解析 FBX 的
  BlendShape 段 ⇒ FBX 模型上只有「顯隱」與「變換」兩類 `.anim` 能生效。
- **Humanoid 動作要求 Avatar**：`.anim` 裡只存歸一化的肌肉值，骨骼映射在 Avatar（工程設置）裡，
  瀏覽器端拿不到 ⇒ 這類片段無法解算。

**Humanoid 動作的正解**：在 Unity 裡把片段**烘成變換曲線**（逐幀采樣每根骨骼的 `local*`，另存為
`<原名>_transform.anim`）⇒ 那種片段查看器**能直接播**（含 `m_LocalRotation.x/y/z/w` 分量寫法 ✓）；
也可以改用 FBX Exporter 讓動畫隨 FBX 一起匯出（零轉換）。
肌肉值本身在瀏覽器端無解 —— 解算要 Avatar。

```jsonc
"animation": {
  "name": "Melano_DefaultFace",                              // 初始動作（可選）
  "clips": [
    { "url": "./anim/Facial/Melano_smile.anim", "group": "face" },
    { "url": "./anim/Gimmick/shoes_ON.anim",    "group": "parts" }
  ]
}
```

`group` 只是给調用方（選單、內嵌頁）分類用的標簽，查看器不依賴它。
`getAnimations()` 會額外返回每段的 `overlay` / `kind`（`body` / `face` / `parts`）/ `source`：
**錶情與換裝屬於 overlay** —— 播放它們**不會**打斷當前身體動作（Unity 裡同樣是疊加的）。

### 7.2 聲明式相機（頂層鍵 `camera`）

想讓 `?config=` 直接復现 Unity 場景的取景（而不是由查看器自動取景）時用它。
**各項按 Unity 的單位填**，換算交给查看器：

```jsonc
"camera": {
  "position": [0, 1.1, 1],      // Unity 相機位置
  "target":   [0, 1.1, 0],      // 對準點
  "fov":      26.9914,          // 相機 FOV（度）
  "unityModelHeight": 1.2477    // 該模型在 Unity 裡的真實高度
}
```

`unityModelHeight` 是換算的關鍵：查看器載入時把模型歸一化到 `targetHeight`（預設 2），
所以相機各項會整體乘 `K = targetHeight / unityModelHeight`。
**等比縮放不改變 FOV 下的画面構成** ⇒ 這樣得到的就是 Unity 的取景。
不填它則 `K = 1`，相機值按查看器當前空間解釋。

---

## 八、HTML 側怎麼用

**纯 HTML 內嵌**（屬性寫在容器上）：

```html
<div data-ba3d
     data-ba3d-config="./assets/sample.json"
     data-ba3d-drag
     style="width:420px;height:430px"></div>

<script type="module">
  import { autoMount } from './dist/3d-viewer.min.js';
  autoMount();           // 自動掃描 [data-ba3d]、創建查看器並開始加載
</script>
```

| 屬性 | 說明 |
|---|---|
| `data-ba3d` | 標記該容器掛查看器 |
| `data-ba3d-config` | 設定 JSON 的 URL |
| `data-ba3d-model` | 直接给模型 URL（不配 config 時可用） |
| `data-ba3d-mouth` | 直接给嘴部貼圖 URL |
| `data-ba3d-drag` | 開啟「左鍵按在模型上拖動整個容器」 |
| `data-ba3d-auto-rotate` | `true` 自動旋轉 |

> ⚠️ **容器自己不要给不透明背景。**
> 查看器画布是真透明的（`background.transparent: true` → `alpha: true` + `setClearAlpha(0)`），
> 但如果你给容器 div 設了實色 / 不透明渐變，透明就看不出來了 —— 背後的網頁內容會被整塊盖住，
> 看起來像"透明背景沒生效"。
>
> ```css
> .panel {
>   background: transparent;          /* ✅ 完全透出背後內容 */
>   /* background: rgba(12,16,24,.2); /* ✅ 想要淡淡一層底就用半透明 */
>   /* background: linear-gradient(...#1a2233...#0a0d14); /* ❌ 不透明 → 透明失效 */
> }
> ```
>
> `embed-demo.html` 裡浮層背後特意放了一塊彩色裝飾（`#showcase`）來直觀驗證這一點。

**URL 參數**（独立頁面）：

```
index.html?config=./assets/sample.json
index.html?config=./assets/fallback.json
index.html?model=./assets/sample.glb&mouth=./assets/mouth/Character_Mouth_2.png
```

---

## 九、頁面事件與動作鉤子

查看器會在容器上派發**冒泡的 CustomEvent**：

| 事件 | `detail` | 用途 |
|---|---|---|
| `ba3d:pointerdown` | `{ button, hit }` | 立即派發（未過閾值）；`hit` = 左鍵是否按在模型身上 |
| `ba3d:press` | `{ button, heldMs, thresholdMs, hit }` | **按住夠久才算「按下」**（預設 200ms），此時才開始拖動容器 |
| `ba3d:click` | `{ button, heldMs, thresholdMs, hit }` | 沒按夠就松手 → 算點擊，不觸發拖動 |
| `ba3d:pointerup` | `{ button, hit, pressedOnModel, pressed }` | 抬起；`pressed` = 本次是否越過按住閾值 |
| `ba3d:action` | `{ name }` | 動作切換（用來同步選單） |

**按住閾值**由 `renderer.pressHoldMs` 控制（預設 `200`）。左鍵在模型上按下後先進入待定：

- 按住 ≥ 200ms → 派發 `ba3d:press`，並開始拖動容器
- 提前松開 → 派發 `ba3d:click`，**不**拖動

這樣「點一下想觸發動作，結果把面板拖走了」就不會發生了。拖動起點取的是**跨過閾值那一刻的指針位置**，
所以按住期間手抖移動過也不會導致面板跳位。

**嘴型**：圖集格預設由 `bone_mouth` 的縮放驅動。但**有些模型的 GLB 裡沒有嘴部動畫數據**
（實測 CH0273 的 42 段動畫、每段 142 條軌道，沒有一條和嘴相關），這時嘴型不會自己變 —— 不是實现問題，
是模型沒這份數據。頁面可以手動驅動：

```js
viewer.setMouthCell(10);              // 0~63，圖集 8×8 的第 10 格
viewer.getMouthCell();                // 當前格
viewer.getMouthInfo();                // { mesh, cell, driver: {bone, scaleTrack, ...}, ... }
//   driver.scaleTrack === false → 該模型的嘴不隨動作變化（無數據）
```

**按動作控制網格顯隱 `visibilityRules`**：有些模型的盾牌/武器**只在特定動作裡出现**，
但 GLB 的動畫數據裡並沒有"隱藏"這件事 —— 實測 `Hoshino_Original` 的盾牌绑在 `bone_shield_root` 上、
縮到 0 確實會消失，可 42 段動畫裡它的 scale 只在 `[0.70, 1.00]`，**沒有任何一段去縮它**。
那是游戲引擎按動作設定的顯隱，只能用規則補：

```jsonc
"renderer": {
  "visibilityRules": [
    // 三種寫法任選一種：
    { "mesh": "Shield", "clipContains": "Shield" },              // 動作名含 Shield 時顯示
    { "mesh": "Shield", "clips": ["Hoshino_Original_Shield_A"] },  // 精確列出動作名（**完全匹配**）
    { "mesh": "Shield", "always": true }                         // 一直顯示（強制恢復）
    // 都可以加 "invert": true 取反
  ]
}
```

> 為什麼不能靠"盾牌有沒有移動"來判斷（實測數據）：`Hoshino_Original` 裡盾牌是**常駐掛在手臂骨骼**上的，
> 手臂一動它相對角色就有位移 —— 4 段 Shield 動作反而**位移恰好是 0**（舉得很穩），
> 而 `Exs_Cutin` 位移 0.011 最大。位移會判反；骨骼縮放在那 4 段也恒為 1.0。
> 數據裡沒有可靠信號，所以只能靠命名約定或顯式列錶。

含義：網格名匹配 `/Shield/i` 的，只在**動作名包含** `Shield` 時顯示，其餘動作隱藏。
`mesh` / `clipContains` 是正則片段（`clipContains` 為**子串**匹配），`clips` 則是**完全匹配**（整個動作名必須等於列錶裡的一項，忽略大小寫）；可選 `"invert": true` 反向（只在不含時顯示）。
不配則完全不乾預顯隱（預設）。

沒配規則但檢測到"網格名和部分動作名同含 shield/weapon"時，加載會在控制台给出一條可直接抄的提示。

**預設口型 `mouthCell`**：有些模型的 GLB 裡**完全沒有嘴部動畫數據**
（實測 CH0273 的 42 段動畫、每段 142 條軌道，沒有一條和嘴相關），這時嘴型會一直固定。
用 `mouthCell` 指定那一刻用哪個口型（圖集 8×8，合法值 0~63）：

```jsonc
"renderer": {
  "mouthCell": 10        // 沒嘴部數據時用第 10 格；null（預設）= 第一個口型
}
```

有嘴部數據的動作**不受影響**，仍然跟著動作走 —— `mouthCell` 只在"沒數據可用"時兜底。

用 `viewer.setMouthCell(n)` 在控制台裡逐格試，或直接看 `assets/mouth/_cells-preview-*.png` 挑格，再寫進設定。（合法範圍永遠是 0~63，但**超出該圖集實際嘴型範圍的格會顯示成一塊青色**。）

**兜底口型 `mouthIdle`**（預設關閉，優先級高於 `mouthCell`）：有些模型的 GLB 裡**完全沒有嘴部動畫數據**
（實測 CH0273 的 42 段動畫、每段 142 條軌道，沒有一條和嘴相關），這時嘴型會一直固定。
打開後，當前動作若沒在驅動嘴部骨骼，口型會按 `mouthIdleMs` 的節奏循環一遍
（纯視覺效果，與動作內容無關）；有嘴部數據的動作不受影響，仍然跟著動作走。

```jsonc
"renderer": {
  "mouthIdle": true,      // 打開兜底口型
  "mouthIdleMs": 180      // 每格停留 180ms（8 格約 1.44s 一輪）
}
```

加載時會輸出 `[fixMouth] 沒有任何動作驅動「bone_mouth.scale」…` 提示該模型缺嘴部數據；
也可以用 `viewer.getMouthInfo().driverClips` 查有幾個動作真的會動嘴（0 = 完全沒數據）。

全局動作鉤子（頁面其它 js 直接調）：

```js
play3dmodelaction(['Formation_Pickup']);   // 播第一個能匹配到的動作
play3dmodelaction(['A', 'B']);             // 按順序找，播第一個存在的
play3dmodelaction([3]);                    // 索引
play3dmodelaction('Cafe_Idle');            // 單個字符串
play3dmodelaction();                       // 不傳 → 回預設動作
```

交互約定：**左鍵按在模型身上拖動 = 移動容器；右鍵拖動 = 旋轉角色**（開啟 `dragContainer` 時）。

---

## lilToon 描邊（Outline）

對著色器 = `lilToon` 生效。對應 lilToon 的 `_Outline*` 系列參數。

```jsonc
"lilToon": {
  "outline": {
    "enable": false,                  // _UseOutline —— 總開關
    "color": [0.6, 0.56, 0.73, 1.0],  // _OutlineColor（第 4 位是透明度）
    "tex": null,                      // _OutlineTex（貼圖 URL、暫未接加載）
    "width": 0.08,                    // _OutlineWidth（內部 ×0.01）
    "widthMask": null,                // _OutlineWidthMask（URL、取 .r 通道）
    "fixWidth": 0.5,                  // _OutlineFixWidth
    "fixWidthMode": "lilToon",        // 'lilToon' | 'screen'（見下）
    "vertexR2Width": 0,               // _OutlineVertexR2Width：0 不用 / 1 用 R / 2 用 A（並把 RGB 當法線）
    "zBias": 0.0,                     // _OutlineZBias
    "cull": "back",                   // 'back'（預設、只画背面）| 'front'
    "skipPattern": "mouth",           // 不做描邊的網格名（正則、不区分大小寫）
    "litColor": [1.0, 0.2, 0.0, 0.0], // _OutlineLitColor（alpha=0 錶示不受光、暫未實现）
    "litScale": 10.0,                 // _OutlineLitScale
    "litOffset": -8.0                 // _OutlineLitOffset
  }
}
```

### 寬度的語義

```
世界描邊粗細 = width × 0.01 ÷ 網格世界縮放 × 網格世界縮放 = width × 0.01
```

程式碼裡做了**按網格世界縮放歸一化**、所以 `width` 的物理含義與模型縮放無關。
（Unity 裡 1 單位 = 1 米、角色約 1.5、所以 width 0.08 對應約 0.8 毫米、很細）

**⇒ 面板上「寬度」的範圍是 0 ~ 10、步長 0.01**。

### fixWidthMode

lilToon 原版是：

```hlsl
outlineWidth *= lerp(1.0, saturate(length(headDirection)), _OutlineFixWidth);
```

`saturate` 把距離**截斷在 1.0**、而相機距離通常遠大於 1。
**⇒ 原版裡 `_OutlineFixWidth` 拉 0 還是 1 結果完全一樣、參數實際失效**。

| 值 | 行為 |
|---|---|
| `'lilToon'`（預設）| 保留 saturate、**完全對齊 lilToon** |
| `'screen'` | 去掉 saturate、`fixWidth=1` 時**描邊屏幕粗細恒定**（縮遠不變細）|

面板上對應「固定寬度生效（去掉 saturate）」復選框。

### skipPattern

**只匹配網格名**、不匹配材質名也不匹配路徑。

原因：材質常常被多個網格共用、按材質匹配會誤伤一片。

```jsonc
"skipPattern": "mouth|eye"            // 名字裡含 mouth 或 eye 的網格不描邊
"skipPattern": "^CH0155_Body_4_Mouth_Split$"   // 精確匹配
```

**用「部件」面板可以看到每個網格的真實名字**、（懸停顯示層級路徑與材質名）

### 與舊描邊的互斥

開啟 lilToon 描邊時、內置的 `OutlineEffect`（HUD 的「描邊」按鈕）會**自動讓位**。
兩者不會疊加。

**FBX 模型**：內置描邊對 FBX 一律不生效（反殼實现對其坐標系敏感）。
但 **lilToon 描邊對 FBX 是正常工作的**。

---

## 部件面板

HUD 上的 **[部件]** 按鈕、列出模型所有網格。

| 元素 | 作用 |
|---|---|
| 復選框 | 顯示 / 隱藏該部件 |
| 名字（點擊）| **只看這個**（再點一次恢復全部）|
| 三角形數 | 該網格的面數（k = 千）|
| 材質名 | 便於判斷某個部件在哪 |
| 🔓 / 🔒 | **鎖定**該部件的可見性 |

### 鎖定語義（記憶 ≠ 凍結）

| 状態 | 用戶勾選/取消 | 自動邏輯* |
|---|---|---|
| 🔓 未鎖定 | 立即生效 | **可能被改回去** |
| 🔒 已鎖定 | 立即生效 **並更新鎖定值** | **不動它** |

\* 自動邏輯包括：`hideParts`（正則隱藏）`hideOptional`（按動作隱藏可選部件）
`hideByBoneScale`（道具被縮小到體內時隱藏）

**[全顯] / [全隱] 會同時鎖定所有部件**、否則自動邏輯會讓某些部件又冒出來。

### API

```js
viewer.listMeshes()                       // 列錶（含 path / material / triangles）
viewer.setMeshVisible('CH0155_Body/CH0155_Body_4', false)
viewer.setAllMeshesVisible(true)
viewer.isolateMeshes(['CH0155_Hair'])     // 只看這些、傳 [] 恢復全部
viewer.setMeshLocked('CH0155_Hair', true) // 鎖定為顯示、傳 null 解鎖
viewer.getMeshLocks()
viewer.debugTree()                        // 完整層級（排查用）
```

---

## 貼圖匹配規則

FBX 裡的貼圖路徑常常與實際檔案對不上、按下面的順序匹配。

1. **完整 URL 精確匹配** `textureMap`
2. **去掉查詢串後匹配**
3. **檔案名匹配**
4. **★ 主檔案名匹配**（去擴展名、忽略大小寫）
   —— 例如 FBX 請求 `Body.psd`、你上傳的是 `Body.png`、**能匹配上**。
5. **`.psd` 自動改寫**：按 `../TEX/`、`TEX/`、`../Textures/`、`Textures/`、`./` 依次嘗試同名 `.png`

**空貼圖會被置為 `null`**、避免"采樣纯黑導致模型全黑"。

> ⚠️ 本項目修改了 `vendor/three/loaders/FBXLoader.js` 的 `.psd` 分支：
> 原版會造一個 `new Texture()` 占位、而**空貼圖在 three 裡采樣是纯黑**、會讓整個模型變黑。
> 改成當普通圖片請求、交给上面的 URL 改寫處理。

---

## lilToon 預設

面板（著色器 = lilToon 時可用）頂部下拉、19 個官方預設。
數據來自 `lilToon/Presets/*.asset`、內聯為 `LIL_PRESETS`。

```js
viewer.getLilPresets()
viewer.applyLilPreset('Skin-Anime')   // 或 'Hair-OutlineRimLight' / 'Inorganic-Metal (MatCap)'
```

**套用時會自動**：
1. 切到 `shader = 'lilToon'`
2. **先把 Rim / MatCap / 自發光 的 blend 清零**、避免上一個預設的特性残留。
3. 套用預設字段、重建材質。

⚠️ 預設裡的 `outline.enable` **一律是 false**。
lilToon 官方預設的 `_UseOutline` 全是 0、即"是否描邊"由美術按材質手動勾、預設只提供數值。

⚠️ **官方預設是按材質使用的**（皮膚材質套 Skin-*、頭發套 Hair-*）。
當前的實现是全局的、按材質覆盖的方案見 `LILTOON1.x.md` 第 9 節。

---

## 頂點色工具

lilToon 的遮罩讀的是**頂點色的 RGB 三通道**。

```
R → MatCap 權重
G → Rim 權重
B → 自發光權重
```

```js
viewer.showVertexColors(true)   // 把頂點色當顏色渲染（無光照無貼圖）
viewer.vertexColorInfo()        // 每個網格的 min/max/均值/是否全白
```

HUD 上的 **[頂點色]** 按鈕 = 前者、並會輸出後者。

**沒有頂點色的模型**：遮罩恒為 1、三個效果全区域生效、（程式碼裡用 `#ifdef USE_COLOR` 自動回退）

---

## 描邊受光（_OutlineEnableLighting / _OutlineLitColor）

嚴格照 lil_common_frag.hlsl:371-380：

    litCol  = _OutlineLitApplyTex ? col.rgb * _OutlineLitColor.rgb : _OutlineLitColor.rgb
    litF    = saturate( NdotL * _OutlineLitScale + _OutlineLitOffset ) * _OutlineLitColor.a
    col.rgb = mix( col.rgb * _OutlineColor.rgb, litCol, litF )

| 設定 | lilToon 參數 | 面板控件 |
|---|---|---|
| litEnable | _OutlineEnableLighting | 受光生效（復選框）|
| litColor | _OutlineLitColor（RGB + alpha）| 受光色 + 受光強度 |
| litScale | _OutlineLitScale | 受光對比 |
| litOffset | _OutlineLitOffset | 受光閾值 |
| litApplyTex | _OutlineLitApplyTex | 受光色乘描邊貼圖（復選框）|

### 預設不受光

_OutlineLitColor.a 預設是 0，所以 litF = 0，結果就是「貼圖 × 描邊色」。
**這個功能預設完全不影響觀感**，只有把「受光強度」調大才生效。

### 光源方向

每幀從**主光的實際世界位置**算方向，傳進 uOutlineLitDir。
所以換打光預設（白晝 / 傍晚 / 黑夜）時描邊的受光方向會跟著變。

### 法線來源

頂點著色器裡用 objectNormal，它在 three 的 skinnormal_vertex 之後**已經被蒙皮過**，
再乘 mat3(modelMatrix) 得到世界空間法線。

---

## 描邊貼圖（_OutlineTex / _OutlineWidthMask）

| 設定 | lilToon 參數 | 說明 |
|---|---|---|
| tex | _OutlineTex | 描邊貼圖，用紋理给描邊上色 |
| widthMask | _OutlineWidthMask | 寬度遮罩，**取 R 通道** |

面板上用「選擇檔案」按鈕（本地圖片走 blob URL，也可以用 JSON 設定给相對路徑）。

### 寬度遮罩的用法

    白色（R=1） -> 满寬描邊
    黑色（R=0） -> 沒有描邊

**這是 lilToon 處理「局部不要描邊」的正统做法。**
比如嘴巴和頭共用同一個網格時，skipPattern（按網格名）就無能為力，
這時给一張遮罩圖、嘴部画黑，就能精確到像素。

貼圖按 URL 緩存，加載完成後自動重新應用描邊（不用手動刷新）。
加載失敗會輸出 [outline] 貼圖加載失敗：...（warn 級別，始終可見）。

---

## 詳細日志開關

HUD 上的 **詳細日志** 復選框，設置儲存在 localStorage，刷新後保持。
它控制 window.__ba3dDebugUI，影響三類診斷輸出：

| 輸出 | 受它控制 |
|---|---|
| 陰影自檢錶格（每次加載一張 console.table）| 是 |
| syncRenderUI 的判定輸入輸出 | 是 |
| [lilPanel] 已打開，控件 N 個 | 是 |
| viewer.js 裡的 21 處 console.debug | **否** —— 受 DevTools 的 Verbose 級別控制 |

平時控制台應該只剩一行：

    [viewer] 加載完成 | 模型=... | 網格=11 | 描邊=true

console.warn / console.error 始終可見（真異常才出）。

---

## 設定面板覆盖與匯出

面板能改的（著色器 = lilToon 時）：

    預設     19 個 lilToon 官方預設
    分檔     浓度 / 第一層邊界·過渡 / 第二層邊界·過渡 / 第三層邊界·過渡 / 第三層開關 / 顏色
    Rim      強度 / 邊界 / 過渡 / 菲涅爾 / 受光方向 / 顏色 / 背光色
    MatCap   強度 / 貼圖檔案
    自發光   強度 / 顏色
    背光     強度 / 指向性
    描邊     啟用 / 寬度 / 固定寬度 / 頂點色當寬度 / Z 偏移 / 固定寬度生效 /
             描邊顏色 / 不透明度 / 受光色 / 受光強度 / 受光對比 / 受光閾值 /
             描邊貼圖 / 寬度遮罩 / 受光生效 / 受光色乘貼圖 / Cull 模式 / 跳過部件

**描邊的 16 個設定字段全部有控件。**

HUD 的 **[匯出 JSON]** 生成只含與預設值不同項的設定。描邊參數在 lilToon.outline 下。
匯出用的是遞歸 diff，等於預設值的字段會省略。

---

## 描邊外擴方向貼圖（_OutlineVectorTex）

用貼圖覆盖描邊的外擴方向（手绘描邊）。

| 設定 | lilToon 參數 | 面板控件 |
|---|---|---|
| vectorTex | _OutlineVectorTex | 外擴方向（選擇檔案）|
| vectorScale | _OutlineVectorScale | 方向強度（-10 ~ 10）|
| vectorUVMode | _OutlineVectorUVMode | 方向 UV（UV0 ~ UV3）|

貼圖按**切線空間**法線解算，再經 TBN 轉到對象空間（lil_common_functions.hlsl:272）。

### 與 Unity 的差異（重要）

three 的 MeshBasicMaterial 只有在幾何體帶 tangent 屬性時才有 objectTangent。
所以：

    #ifdef USE_TANGENT   → 真實 TBN，與 Unity 一致
    #else                → 用「法線 + 任意正交軸」近似，與 Unity 會有差異

這個 fallback 是 three 的幾何數據限制，不是可以绕過的。

---

## 描邊受光接收陰影（_OutlineLitShadowReceive）

描邊受光時是否被主光的陰影遮擋。

| 設定 | lilToon 參數 | 面板控件 |
|---|---|---|
| litShadowReceive | _OutlineLitShadowReceive | 受光接收陰影（復選框）|

### 為什麼是自己算的

lilToon 裡就是 outlineLitFactor *= fd.attenuation（乘光照衰減）。
但在 three 裡，MeshBasicMaterial **拿不到陰影數據**：

    three 只在 materialProperties.needsLights 為真時賦值
    directionalShadowMap / directionalShadowMatrix（three.module.js:30062~30088），
    而 materialNeedsLights() 的白名單裡沒有 MeshBasicMaterial。

實測（探針日志）：描邊材質裡 directionalShadowMatrix 始終不存在，
vDirectionalShadowCoord 算出來全 0，getShadowMask() 恒返回 1。

所以改成**自己算**：

    每幀（updateLilOutlineCamera）從 keyLight.shadow 取：
      biasM = 0.5 偏移 + 0.5 縮放的矩陣（把 NDC 映射到紋理空間 [0,1]）
      uOutlineShadowMatrix = biasM × shadow.camera.projectionMatrix × matrixWorldInverse
      uOutlineShadowMap    = keyLight.shadow.map.texture
      uOutlineShadowBias   = keyLight.shadow.bias
      uOutlineShadowMapSize= keyLight.shadow.mapSize

    頂點：vOutlineShadowCoord = uOutlineShadowMatrix × modelMatrix × vec4(transformed, 1.0)
    片元：ba3dOutlineShadow() 做 4 次 PCF 采樣（unpackRGBAToDepth + step）
          返回 1 = 受光、0 = 全陰影，然後 ba3dLitF *= 它

完全绕開 three 的材質系统，也不依賴任何 three 的陰影 chunk。

### 面板上的診斷開關

「陰影遮罩預覽（診斷）」= litShadowDebug，作用與 litShadowReceive 相同但
用於排查（會強制應用陰影遮罩，方便看管線是否接通）。

---

## 描邊色的相乘開關

lilCfg.outline.shaderColorMult（預設 false）：

    false → 描邊色只由 mat.color 乘一次（正確，受光色纯淨）
    true  → 著色器裡再乘一次 uOutlineColor（受光色會被描邊色染暗，對照舊行為用）

面板上對應「著色器裡再乘一次描邊色」復選框。

---

## 按材質設定（lilToonByMaterial）

lilToon 的預設本來是**每個材質槽各選一個**（皮膚套 Skin-*、頭發套 Hair-*），
所以設定也按材質分開。見 LILTOON1.x.md 第 9 節的設計。

### 數據結構

    lilCfg                      全局預設（面板選「全部（預設）」時改它）
    lilCfgByMaterial = {        按材質名覆盖（稀疏，只存改過的鍵）
      'CH0155_Hair_Toon': { shadowBorder: 0.05, rim: { blend: 1 } },
      'CH0155_Milk_Toon': { matcap: { url: 'blob:...' } },
    }

### 生效方式

    function lilCfgFor(mat) {
      const nm = mat && mat.name;
      if (!nm || !lilCfgByMaterial[nm]) return lilCfg;
      return mergeLilCfg(lilCfg, lilCfgByMaterial[nm]);
    }

mergeLilCfg 做**一層深合並**（嵌套對象如 outline / rim / matcap 逐字段合並），
其餘直接覆盖。

### 生效點

    patchToonMaterial(mat) 裡：
      const __cfgM = lilCfgFor(mat);
      celGradientGLSL(__cfgM, celCfgFor(mat))     // 分檔
      lilShaderGLSL(__cfgM)                       // Rim / MatCap / 自發光 / 背光
      resolveMatCapTexture(__cfgM.matcap.url)     // MatCap 貼圖

    applyLilOutline() 裡按網格的材質名解析描邊設定（帶緩存）：
      const o = _mn0 ? resolveFor(_mn0) : oGlobal;

### cacheKey（關鍵）

    mat.customProgramCacheKey = () =>
      'ba3d-cel:' + celProgramVersion + ':' + shaderMode + ':' + (mat.name || '')
      + ':v' + lilMaterialVersion;

兩個坑：
  ① 必須帶**材質名**，否則不同材質的程序會被復用，參數就串了。
  ② 必須**無條件**帶 lilMaterialVersion。
     曾經寫成「有覆盖才帶版本號」，但「有沒有覆盖」是打補丁那一刻的判定，
     之後才给某個材質加覆盖的話 key 不變 → three 既不重編也不重建，
     錶现就是「設了沒反應」。

### 面板

    [● lilToon 參數]                    ← 標題欄（拖拽把手）
    ─────────────────
    材質  [ 全部（預設）▾ ]  [清除覆盖]
          選「全部」改全局；選某個材質只覆盖它（帶 ● 錶示已有覆盖，面板顯示合並後的值）
    預設  [（不套用 ▾）]                ← 套到上面選中的材質

面板裡 40 多處調用通過薄封裝自動帶上當前材質：

    const lilG  = (m) => viewer.getLilConfig(m === undefined ? lilCurMat() : m);
    const lilS  = (p, m) => viewer.setLilConfig(p, m === undefined ? lilCurMat() : m);
    const lilOG = (m) => viewer.getLilOutline(m === undefined ? lilCurMat() : m);
    const lilOS = (p, m) => viewer.setLilOutline(p, m === undefined ? lilCurMat() : m);

⚠️ 全局替換這 4 個 API 名時，**封裝函數自己也會被替換**，導致自遞歸
   （同一個坑在 lilApplyPreset 上又踩了一次）。改完必須檢查定義本身。

⚠️ lilCurMat() 要回退到 window.__ba3dLilMat：
   buildLilPanel() 會先 lilPanel.innerHTML = '' 清空面板，
   此時選擇器元素還沒重建，只看 DOM 會讀成「全局」。

### API

    viewer.getLilConfig(matName)              // 合並後的值
    viewer.setLilConfig(partial, matName)     // 寫全局或某材質
    viewer.getLilOutline(matName)
    viewer.setLilOutline(o, matName)
    viewer.applyLilPreset(name, matName)
    viewer.getLilMaterials()                  // 模型裡的材質名列錶
    viewer.getLilCfgByMaterial() / setLilCfgByMaterial(obj)
    viewer.clearLilMaterialOverride(matName)

### 匯出

    {
      "lilToon": { /* 全局預設 */ },
      "lilToonByMaterial": { "CH0155_Hair_Toon": { "shadowBorder": 0.05 } }
    }

匯出仍然按預設值做遞歸 diff，只寫變了的項。

### 按材質的覆盖範圍（全部支持）

    陰影分檔（浓度 / 每層邊界·過渡 / 每層顏色 / 第三層開關）
    Rim（強度 / 邊界 / 過渡 / 菲涅爾 / 顏色 / 背光色）
    MatCap（強度 / 邊界 / **貼圖**）
    自發光（強度 / 顏色）
    背光（強度 / 指向性）
    描邊 20 個參數（含描邊貼圖 / 寬度遮罩 / 外擴方向）

MatCap 貼圖以前只有全局一張（lilMatCapTex 單變量），现已改為
resolveMatCapTexture 按 URL 緩存 + 按材質取 uniform。

---

## 浮層面板：標題欄與拖拽

三個面板（#lilPanel / #exportPanel / #partsPanel）是 .lp 元素，
自定義模型（#upload）是独立容器。每個都有標題欄：

    [● lilToon 參數]        ← 標題與打開它的按鈕文字一致
    [● 匯出 JSON]
    [● 部件]
    [● 自定義模型（本地檔案，不會上傳到任何服務器）]   ← 用 .u-title

### 拖拽

按住標題欄拖動面板。要點：

  · 监聽掛在**面板本身**（事件委托），不掛在標題元素上
    —— lilToon 面板每次打開/改預設都會 innerHTML = '' 重建，掛在標題上會失效。
  · 把手識別順序：指定選擇器 > .lp-title > .u-title > h4
  · 面板原本是 right:16px + top:16px 定位，拖動時切成 left/top。
  · 拖出視窗時夾緊（Math.max(4, ...) / Math.min(innerWidth - w - 4, ...)）。
  · 視窗 resize 後面板若在視口外，自動拉回右對齊。

### 標題欄樣式统一

.lp-title 與 #upload .u-title 用同一套視覺：

    藍點（7px, #3d6fe0）+ 12.5px / 600 / #c3ccdd + 底部分隔線 rgba(255,255,255,.09)
    cursor: move（拖動時 grabbing）

.lp-title 還多了 position: sticky（滾動時吸頂）與負外邊距（貼满面板頂部）。

### 面板寬度

    .lp        400px（原 320px），overflow-x: hidden（不要左右滾輪）
    .lp.parts  340px（原 300px）

---

## lilToon 陰影系统（階段 1 超綱項 + 觀感調優）

### 參數總錶

| 設定 | lilToon 參數 | 說明 |
|---|---|---|
| shadowStrength | _ShadowStrength | 分檔浓度，**範圍 0~2**，>1 靠 mix 外推繼續壓暗 |
| shadowBorder / shadowBlur | _ShadowBorder / _ShadowBlur | 第一層邊界 / 過渡 |
| shadow2ndBorder / shadow2ndBlur | _Shadow2ndBorder / _Shadow2ndBlur | 第二層 |
| shadow3rdBorder / shadow3rdBlur | _Shadow3rdBorder / _Shadow3rdBlur | 第三層 |
| shadowBorderRange | _ShadowBorderRange | 只把過渡帶下沿往陰影側推（lil_common_functions.hlsl:33）|
| shadowMainStrength | _ShadowMainStrength | 陰影側再乘一次主色（lil_common_frag.hlsl:1024）|
| shadowReceive / shadow2ndReceive / shadow3rdReceive | _ShadowReceive 等 | 每層是否接收**實時投射陰影**（:872-876）|
| shadowColor / shadow2ndColor / shadow3rdColor | _ShadowColor 等 | 每層顏色 **+ alpha** |
| shadowAmbient | （three 專屬、lilToon 沒有）| 陰影区保留多少環境光 |

### ★ 三層顏色的 alpha 就是「這一層多強」

lilToon：lns.y = _Shadow2ndColor.a - lns.y * _Shadow2ndColor.a（:1013）
所以 alpha = 0 錶示**關閉該層**。

⚠️ 踩過的坑：第一版只取 RGB、忽略 alpha、於是
     "shadow2ndColor": [0, 0, 0, 0]（官方預設裡錶示「第二層關閉」）
   被當成了「纯黑满強度」、19 個預設裡有 11 個是這種、全都暗得離譜。

现在的實现：
    outCol = mix( outCol, shadowColor, s1 * alpha1 );
    outCol = mix( outCol, shadow2ndColor, s2 * alpha2 );
    outCol = mix( outCol, shadow3rdColor, s3 * alpha3 );

面板上每行三個控件：顏色 / alpha 滑杆 / alpha 數字框。

### ★ shadowAmbient（three 專屬）——「環境光地板」

three 的 toon 把環境光**單独加在分檔之外**：

    irradiance  = ambient + lightProbe + 分檔 * directLight

而 lilToon 的 indirectCol 是**整體替換**（含環境光）。
所以我們的陰影有個地板、光越強、受光面越亮、陰影区不跟著變。
相對對比度被稀釋、錶现就是「光照強的時候陰影反而不夠明顯」。

解法：在 lights_fragment_begin **之後**（lights_fragment_end 之前）

    reflectedLight.indirectDiffuse *= mix( shadowAmbient, 1.0, ba3dShadowMaskG );

    shadowAmbient = 1.0 → 不削減（預設、行為不變）
    shadowAmbient = 0.0 → 陰影区完全沒有環境光（最深）

要接近 cel 模式（陰影浓淡=0 / 臉部=0）的觀感、就把它調到 0~0.2。

### ★ 兩套投影路徑的差異（_ShadowReceive 為什麼第一版不生效）

lilToon（Unity）：投影**折進分檔值**，直射光不再單独乘：

    calculatedShadow = saturate( fd.attenuation + distance( fd.L, fd.origL ) );
    lns.x *= lerp( 1.0, calculatedShadow, _ShadowReceive );

three：投影在 lights_fragment_begin 裡**直接把直射光砍掉**：

    directLight.color *= getShadow( directionalShadowMap[i], ... );

兩條路互不相乾、所以只把陰影乘進 t1/t2/t3 是沒用的。

现在的做法：在 lilToon 模式裡把 three 那條路**中和掉**

    getShadow(...)  →  ( getShadow(...) * 0.0 + 1.0 )  =  1.0

讓投影**只經由 ba3dShadowMaskG** 進入分檔。

### 三層疊加的行為（不是 bug）

三層是**順序疊加**的、後一層會覆盖前一層：

    outCol = mix( outCol, 第一層色, s1 );
    outCol = mix( outCol, 第二層色, s2 );   // 覆盖
    outCol = mix( outCol, 第三層色, s3 );   // 再覆盖

三層邊界預設 0.1 / 0.15 / 0.25、後一層**包圍**前一層。
所以只調第一層的 _ShadowReceive、效果會被二三層盖掉、看不出來。
想整體關投射陰影、三個都要調 0。

### 浓度可以超過 1

mix 的 t 超過 1 時是**外推**：

    mix( vec3(1.0), outCol, 1.5 ) = 1 + 1.5 * ( outCol - 1 )   ← 比陰影色更暗

這是為了绕過上面那個「環境光地板」、滑杆範圍 0~2。

### 「（重置為預設）」預設

預設下拉裡的特殊項：

    選「全部（預設）」→ 把整份 lilCfg 恢復成 LIL_DEFAULTS
    選了某個材質      → 刪掉該材質的覆盖（回到全局預設）

---

## Dissolve（階段 2）

### 階段 2 的四項裡，三項本來就已經完成

| # | 項 | 状態 |
|---|---|---|
| 5 | 描邊升級（自建反殼 + 寬度貼圖 + 頂點色控制）| 早已完成、applyLilOutline() |
| 6 | 裝飾層混合模式（Normal/Add/Screen/Multiply）| 早已完成、ba3dBlend() |
| 7 | Backlight / 逆光 | 早已完成 |
| 8 | Dissolve | **本輪實现** |

（關於 6：lilToon 1.3.7 的 _MainColor 本身沒有混合模式。
  混合模式只在裝飾層上、那幾個已實现）

### 參數

| 設定 | lilToon | 說明 |
|---|---|---|
| dissolve.mode | _DissolveParams.r | 0=關 1=貼圖閾值 2=UV 3=對象空間 |
| dissolve.linear | _DissolveParams.g | 1=線性/平面 0=圓形/球形 |
| dissolve.threshold | _DissolveParams.b | 閾值 |
| dissolve.softness | _DissolveParams.a | 邊緣羽化寬度（兜底 0.001、否則除零）|
| dissolve.pos | _DissolvePos | 線性時是**方向**、圓形/球形時是**中心點**、w 僅模式 2 的旋轉 |
| dissolve.color | _DissolveColor.rgb | 邊緣顏色（**加色**、見 lil_common_frag.hlsl:1841）|
| dissolve.maskTex | _DissolveMask | 模式 1 的遮罩、采 .r |
| dissolve.noiseTex / noiseStrength | _DissolveNoiseMask / _DissolveNoiseStrength | 噪聲擾動 |

### 注入點（兩處、和 lilToon 一樣）

    (1) #include <alphatest_fragment> 之前
        算遮罩 → diffuseColor.a *= maskVal
        並把邊緣因子存進全局 ba3dDissolveEdge
    (2) #include <dithering_fragment>
        gl_FragColor.rgb += _DissolveColor.rgb * ba3dDissolveEdge;

（已驗證：toon 片元裡 alphatest 在行 37、dithering 在行 53。
  opaque_fragment 之後 gl_FragColor 才存在、所以 (2) 的位置是對的）

### 坐標歸一化（我們相對 lilToon 的改動）

lilToon 直接用 _DissolvePos 的原始對象空間坐標、因為 Unity 裡角色只有 1~2 單位高。
這個查看器加載的模型尺度不定、所以做歸一化：

    mode 3 的求值坐標 = ( vBa3dPositionWS - center ) * vec3( 1/sizeX, 1/sizeY, 1/sizeZ )

  · **按軸**歸一化（不是只按最長邊）、模型映到單位立方體
    只按最長邊的話、高瘦角色在 x/z 方向只占 ±0.15、球殼掃不到位。
  · 於是閾值語義：平面 ±0.5、球形 0 ~ 0.87、位置 (0,0,0) 就是模型中心。

### ⚠️ lilToon 的模式 2 線性有兩份不同實现

    無噪聲（lil_common_functions.hlsl:628）→ lilRotateUV( uv, _DissolvePos.w ).x
    有噪聲（:675）                         → dot( uv, normalize(_DissolvePos.xy) ) + noise

前者只用一個旋轉角、xy 完全用不上、對查看器來說沒法猜。
後者直接 dot 原始 uv、方向為負時結果落在 [-1, 0]、閾值 > 0 就永遠不成立。
模型整個消失（這是踩過的坑）

**我們统一成**：

    ba3dDissolveAlpha = dot( vBa3dUv - 0.5, normalize(pos.xy) ) + 0.5;   // 範圍 0~1

居中後閾值 0~1 正好掃過整張貼圖、語義和模式 3 的平面一致。

### ★ 這個功能踩了 6 個坑（都屬於「兩處約定不一致」這一類）

1. **異步貼圖 vs 同步編譯**
   GLSL 裡 texture2D( ba3dDissolveMask, ... ) 是同步生成的。
   而 uniform sampler2D ba3dDissolveMask; 原來只在貼圖**加載成功**後才聲明。
   第一幀必然返回 null、→ undeclared identifier、編譯失敗。
   修法：uniform **無條件聲明**、用占位貼圖頂上
     遮罩占位 = 纯白（.r=1.0、等價「遮罩不生效」、和 lilToon 禁用遮罩一致）
     噪聲占位 = 中灰（.r=0.5、減 0.5 後是 0、等價「沒有噪聲」）

2. **alphaTest 設晚了一個階段**
   原來在 mat.onBeforeCompile 回調裡賦值、那時 WebGLProgram 已經在編譯。
   USE_ALPHATEST 宏早定了、alphatest_fragment 裡的 discard **不生效**。
   錶现：「模型變成剪影」—— alpha 被改小但不丟棄、不透明渲染下 alpha 又被忽略。
   修法：移到 patchToonMaterial 開頭（回調之前）、並 mat.needsUpdate = true
   另外加了 syncDissolveAlphaTest() 掛在每次 applyLilOutline() 上
     （防止材質被復用、patchToonMaterial 不再跑、alphaTest 過期）

3. **描邊殼必須一起溶解**
   溶解只作用於幾何體本身、而描邊是**独立的反殼網格**、不在溶解範圍內。
   於是本體溶解後剩下一個深色輪廓。
   lilToon 裡描邊用同一個 shader、所以會一起溶解。
   修法：makeLilOutlineMaterial(o, srcMat) 裡做同樣的注入。
   ⚠️ 必須在受光塊**之前**注入、那個塊會把 '#include <common>' 整段替換掉。

4. **lilToon 模式的描邊接管**
   outlineActive() 原來只在 lilCfg.outline.enable 為真時才讓位。
   於是「切到 lilToon 但還沒開 lilToon 描邊」這段時間裡。
   cel 的 OutlineEffect 仍在画、而它是**後處理式**的、完全不參與溶解。
   → 溶解完還剩一個完整的角色剪影（排查了很久）
   修法：if ( shaderActive() && shaderMode === 'lilToon' ) return false;  無條件讓位。
        並在 applyShader('lilToon') 時自動把 cel 的描邊參數換算過去：
          width = thickness * 100（因為 ba3dOW = _OutlineWidth * 0.01）
          color / alpha 直接照搬。

5. **TDZ：OUTLINE_DEFAULT 定義在 applyShader 之後**
   我在 applyShader 裡引用了它、初始化時會 ReferenceError。
   修法：把整塊聲明移到 applyShader 之前。
   （這是本項目第 3 次 TDZ、前兩次是 hex / celShadow。
    共同點：**「早期就會跑的函數」引用了檔案下方定義的 const**）

6. **對象空間 vs 世界空間**
   包圍盒用 Box3().setFromObject()（**世界空間**）
   而著色器裡用 position（**對象空間**）
   兩者可以差上百倍、於是「減去中心」幾乎沒作用、歸一化全錯。
   控制台上的 k/center 看起來正常、但代入著色器就是不對。
   修法：新增 vBa3dPositionWS = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz
        （注入在 project_vertex 之後、此時 transformed 已完成蒙皮與形態目標）
        模式 3 改用它、和包圍盒统一空間。

### 邊緣顏色是「加色」的

lilToon 裡 _DissolveColor 會發光：

    fd.col.rgb += _DissolveColor.rgb * dissolveAlpha;
    fd.emissionColor += _DissolveColor.rgb * dissolveAlpha;

所以預設纯白會讓溶解邊界**發亮**、這是預期效果。
不想要白邊、就把「邊緣顏色」設成黑色。
（預設羽化寬度也從 0.1 降到 0.03、否則邊緣帶太寬、整個模型會一起變白）

### 診斷

每次出现**新的參數組合**會打一行（同組合只打一次、不依賴詳細日志開關）：

    [dissolve] 生成 GLSL：模式=3 線性=1 閾值=0.200 羽化=0.030 位置/方向=(0,-1,0,0) 遮罩=無 噪聲=無
    [dissolve] 世界空間歸一化：k=(1.37118, 0.62073, 1.30632) 尺寸=(0.729, 1.611, 0.766) center=(-0.20, 0.87, 0.02)

這兩行能直接看出「編譯進去的實際參數」和「歸一化用的坐標系」。
排查這類問題非常有用。

### 已驗證的行為

    模式 3、線性 1、位置 (0,-1,0,0)、閾值 0.2 → 水平切面保留下半身。
    模式 3、線性 1、位置 (1,0,0,0)、閾值 0   → 保留左半邊。
    模式 3、線性 0、位置 (0,0,0,0)、閾值 0→0.6 → 球形截面逐渐消失。
    模式 1（遮罩貼圖）/ 模式 2（UV）行為正常。

---

## lilToon 1.3.7 參數對照（未實现清單）

> 數據來源：`lilToon/Shader/lts.shader` 的 Properties 段、共 **182 個參數**。
> 下錶按功能分組、✅ = 已實现並接入面板、— = 未實现。
>
> ⚠️ 這份清單是**從源碼 diff 出來的**、不再靠記憶判斷。
>    （之前有過一次口頭說錯：「階段 1 遺留了遮罩類參數」—— 實際上
>      階段 1/2 的計劃裡從來沒有這些參數、見 LILTOON1.x.md）

> ⚠️ 本錶的數據源是 **1.3.7** 的 `lts.shader`；切到 2.3.4 基線後又補做了一批
>    （2nd/3rd 主色層、層溶解、距離淡出、法線貼圖通路、MatCap Lod 與自定法線），
>    因此個別行的状態列可能滞後 —— 以界面實際可調為準。

### 陰影 Shadow（15/22 已實现）

| lilToon 參數 | 状態 | 我們的鍵 |
|---|---|---|
| `_ShadowStrength` | ✅ | `shadowStrength` |
| `_ShadowColor` | ✅ | `shadowColor` |
| `_ShadowNormalStrength` | — |  |
| `_ShadowBorder` | ✅ | `shadowBorder` |
| `_ShadowBlur` | ✅ | `shadowBlur` |
| `_ShadowReceive` | ✅ | `shadowReceive` |
| `_Shadow2ndColor` | ✅ | `shadow2ndColor` |
| `_Shadow2ndNormalStrength` | — |  |
| `_Shadow2ndBorder` | ✅ | `shadow2ndBorder` |
| `_Shadow2ndBlur` | ✅ | `shadow2ndBlur` |
| `_Shadow2ndReceive` | ✅ | `shadow2ndReceive` |
| `_Shadow3rdColor` | ✅ | `shadow3rdColor` |
| `_Shadow3rdNormalStrength` | — |  |
| `_Shadow3rdBorder` | ✅ | `shadow3rdBorder` |
| `_Shadow3rdBlur` | ✅ | `shadow3rdBlur` |
| `_Shadow3rdReceive` | ✅ | `shadow3rdReceive` |
| `_ShadowBorderColor` | — |  |
| `_ShadowBorderRange` | ✅ | `shadowBorderRange` |
| `_ShadowMainStrength` | ✅ | `shadowMainStrength` |
| `_ShadowEnvStrength` | — |  |
| `_ShadowFlatBorder` | — |  |
| `_ShadowFlatBlur` | — |  |

### Rim 邊緣光（11/12 已實现）

| lilToon 參數 | 状態 | 我們的鍵 |
|---|---|---|
| `_RimMainStrength` | ✅ | `rim.mainStrength` |
| `_RimNormalStrength` | ✅ | `rim.normalStrength` |
| `_RimBorder` | ✅ | `rim.border` |
| `_RimBlur` | ✅ | `rim.blur` |
| `_RimEnableLighting` | ✅ | `rim.enableLighting` |
| `_RimShadowMask` | ✅ | `rim.shadowMask` |
| `_RimVRParallaxStrength` | — |  |
| `_RimDirStrength` | ✅ | `rim.dirStrength` |
| `_RimDirRange` | ✅ | `rim.dirRange` |
| `_RimIndirRange` | ✅ | `rim.indirRange` |
| `_RimIndirBorder` | ✅ | `rim.indirBorder` |
| `_RimIndirBlur` | ✅ | `rim.indirBlur` |

### MatCap（6/18 已實现）

| lilToon 參數 | 状態 | 我們的鍵 |
|---|---|---|
| `_MatCapTex` | ✅ | `matcap.url` |
| `_MatCapMainStrength` | ✅ | `matcap.mainStrength` |
| `_MatCapVRParallaxStrength` | — |  |
| `_MatCapBlend` | ✅ | `matcap.blend` |
| `_MatCapEnableLighting` | ✅ | `matcap.enableLighting` |
| `_MatCapShadowMask` | ✅ | `matcap.shadowMask` |
| `_MatCapLod` | — |  |
| `_MatCapNormalStrength` | ✅ | `matcap.normalStrength` |
| `_MatCapBumpScale` | — |  |
| `_MatCap2ndTex` | — |  |
| `_MatCap2ndMainStrength` | — |  |
| `_MatCap2ndVRParallaxStrength` | — |  |
| `_MatCap2ndBlend` | — |  |
| `_MatCap2ndEnableLighting` | — |  |
| `_MatCap2ndShadowMask` | — |  |
| `_MatCap2ndLod` | — |  |
| `_MatCap2ndNormalStrength` | ✅ | `matcap2nd.normalStrength` |
| `_MatCap2ndBumpScale` | — |  |

### 自發光 Emission（3/14 已實现）

| lilToon 參數 | 状態 | 我們的鍵 |
|---|---|---|
| `_EmissionMap` | ✅ | `emission.tex` |
| `_EmissionMainStrength` | ✅ | `emission.mainStrength` |
| `_EmissionBlend` | ✅ | `emission.blend` |
| `_EmissionBlendMask` | — |  |
| `_EmissionGradSpeed` | — |  |
| `_EmissionParallaxDepth` | — |  |
| `_EmissionFluorescence` | — |  |
| `_Emission2ndMap` | — |  |
| `_Emission2ndMainStrength` | — |  |
| `_Emission2ndBlend` | — |  |
| `_Emission2ndBlendMask` | — |  |
| `_Emission2ndGradSpeed` | — |  |
| `_Emission2ndParallaxDepth` | — |  |
| `_Emission2ndFluorescence` | — |  |

### 背光 Backlight（4/6 已實现）

| lilToon 參數 | 状態 | 我們的鍵 |
|---|---|---|
| `_BacklightMainStrength` | — |  |
| `_BacklightNormalStrength` | ✅ | `backlight.normalStrength` |
| `_BacklightBorder` | ✅ | `backlight.border` |
| `_BacklightBlur` | ✅ | `backlight.blur` |
| `_BacklightDirectivity` | ✅ | `backlight.directivity` |
| `_BacklightViewStrength` | ✅ | `backlight.viewStrength` |

### Dissolve（3/3 已實现）

| lilToon 參數 | 状態 | 我們的鍵 |
|---|---|---|
| `_DissolveMask` | ✅ | `dissolve.maskTex` |
| `_DissolveNoiseMask` | ✅ | `dissolve.noiseTex` |
| `_DissolveNoiseStrength` | ✅ | `dissolve.noiseStrength` |

### 匯總

    上方六組共 75 個參數、已實现 42 個（56%）

### 未實现的主要類別（為什麼不做）

| 類別 | 例子 | 原因 |
|---|---|---|
| **遮罩類貼圖** | `_ShadowBlurMask` `_ShadowBorderMask` `_RimBlendMask` `_MatCapBlendMask` `_EmissionBlendMask` `_BacklightBlendMask` | 需要額外的 UV 變換與采樣、收益低於工作量、**不在任何階段計劃裡** |
| **陰影色貼圖** | `_ShadowColorTex` `_Shadow2ndColorTex` | 同上的貼圖類 |
| **AO 偏移** | `_ShadowAOShift` `_ShadowAOShift2` | 需要 AO Map 支持、three 的 toon 通路不接 AO |
| **陰影法線強度** | `_ShadowNormalStrength` `_Shadow2ndNormalStrength` `_Shadow3rdNormalStrength` | 面板有滑杆、但需替換 three 的明暗分檔計算才生效（其餘 `*NormalStrength` 已實现）|
| **2nd / 3rd 全套** | `_Main2nd*` `_Main3rd*` `_MatCap2nd*` `_Rim2nd*` `_Emission2nd*` | ✅ 已實现（含層溶解 / 距離淡出 / 法線通路）；僅 `_Emission2ndBlink` 閃烁不做 |
| **頂點色/UV 高級變換** | `*_ScrollRotate` `*_UVMode` `*_Parallax*` | 查看器用不上 |
| **明確不做** | Glitter、AudioLink、Fur/Gem/Tessellation、Lightmap、屏幕空間陰影、VRC Light Volumes | 見 LILTOON1.x.md |

### 我們**額外**做的（lilToon 沒有）

| 我們的鍵 | 說明 |
|---|---|
| `shadowAmbient` | 陰影区保留多少環境光 —— 補 three 把環境光單独加在分檔之外的問題 |
| `outline.litBlur`（`litShadowBlur`）| 描邊受光陰影的自算 PCF 模糊半徑 |
| `outline.vectorTex` / `vectorScale` / `vectorUVMode` | 描邊外擴方向貼圖 |
| `outline.skipPattern` | 按網格名跳過描邊（薄板防閃烁）|
| `outline.fixWidthMode` | 屏幕粗細恒定模式（lilToon 的 fixWidth 在常規視距下無效）|

---

## 階段 3（2nd/3rd 層 + Stencil）

### 完成情況

| # | 項 | 状態 |
|---|---|---|
| 9 | 2nd / 3rd 主色層 | ✅ 完成（含各自的 blendMask）|
| 9 | MatCap 2nd | ✅ 完成 |
| 9 | 2nd / 3rd ノーマルマップ | ⏸ **主動搁置**（要先建法線貼圖通路、成本最高）|
| 10 | Stencil | ✅ 完成（本體 + 描邊、各 7 個參數）|
| — | 遮罩類貼圖（BlendMask）| ✅ 完成（3 個）|
| — | 描邊貼圖 UV 變換 / 滾動 / HSV | ✅ 完成 |

### 主色層 2nd / 3rd（_Main2nd* / _Main3rd*）

**⇒ 這不是「再加一張法線貼圖」、是再加一層基础色**、（lil_common_frag.hlsl:671 / :757）

| 設定 | lilToon | 說明 |
|---|---|---|
| use | _UseMain2ndTex | 開關 |
| color | _Color2nd | 顏色 + **alpha**（這一層的不透明度）|
| tex | _Main2ndTex | 貼圖 |
| uvMode | _Main2ndTex_UVMode | 0=uv0、4=視角球面（1/2/3 需要 uv1~3、暫不支持）|
| blendMode | _Main2ndTexBlendMode | Normal / Add / Screen / Multiply |
| enableLighting | _Main2ndEnableLighting | **參與光照的比例**（見下）|
| blendMask | _Main2ndBlendMask | 取 **R 通道** 乘到這一層的 alpha |
| cull | _Main2ndTex_Cull | 0=兩面 1=只背面 2=只正面 |

#### ★ _Main2ndEnableLighting 不是開關、是「這一層有多大比例參與光照」

lil_pass_forward_normal.hlsl 裡**混了兩次**：

    :352（光照**之前**）
        fd.col.rgb = lilBlendColor( fd.col.rgb, color2nd.rgb,
                                    color2nd.a * _Main2ndEnableLighting, _Main2ndTexBlendMode );
    :386（光照**之後**）
        fd.col.rgb = lilBlendColor( fd.col.rgb, color2nd.rgb,
                                    color2nd.a - color2nd.a * _Main2ndEnableLighting, ... );

  ⇒ 1.0 = 完全受光照（會被明暗分檔影響、像皮膚的一部分）
    0.0 = 完全不受光照（保持原色、像貼紙/自發光）
    中間值按比例混合。

所以我們的實现也**兩處注入**：
  · before → #include <lights_fragment_begin> **之前**
    （那時 normal 已聲明、而且 diffuseColor.rgb 還能改）
  · after  → #include <dithering_fragment>
    **⚠️ 後加的 .replace 先生效**、所以要先加 3rd 再加 2nd。
       最終執行順序才是 2nd → 3rd（和 lilToon 一致）

中間結果用兩個全局變量傳遞：vec4 ba3dColor2nd / vec4 ba3dColor3rd。

#### ⚠️ 「剔除」需要雙面渲染

cull=1（只背面）在 **side=FrontSide** 的材質上**永遠沒有片元**。
  背面在光栅化階段就被剔除、片元裡的 gl_FrontFacing 恒為 true。
  於是 a 被恒置 0、錶现是「疊加消失」、看起來像壞了。
  cull=2（只正面）則完全沒變化、和 cull=0 一樣。
⇒ 只要任意一層開了剔除、就把材質改成 DoubleSide、關掉時還原。
   （syncLayerDoubleSide()、掛在每次 applyLilOutline() 上）

### MatCap 2nd（_MatCap2nd*）

參數與 1st 同構、並且順手给 1st 補上了完整版才有的三個參數。

⚠️ lilToon 的 MatCap 有**完整版**和 **lite 版**兩套：

    完整版（:1414-1436 / :1482-1504）
        float4 matCapColor = _MatCapColor;                    ← 有染色
        matCapColor *= SAMPLE( _MatCapTex, matUV );
        matCapColor.rgb = lerp( rgb, rgb * fd.lightColor, _MatCapEnableLighting );
        matCapColor.a   = lerp( a, a * fd.shadowmix, _MatCapShadowMask );
        matCapColor.a   = fd.facing < ( _MatCapBackfaceMask - 1.0 ) ? 0.0 : a;   ← 背面剔除
        matCapColor.rgb = lerp( rgb, rgb * fd.albedo, _MatCapMainStrength );     ← 乘 albedo
        fd.col.rgb = lilBlendColor( ..., _MatCapBlend * a * mask, _MatCapBlendMode );

    lite 版（:1446）
        fd.col.rgb = lerp( fd.col.rgb,
                           _MatCapMul ? fd.col.rgb * matcap : fd.col.rgb + matcap,
                           fd.triMask.r );

我們**兩套都支持**：保留了原有的 `mul` 開關（lite 形式、預設關）。
並補上了 color / backfaceMask / 用 albedo 的 mainStrength。

通用生成器：lilMatCapGLSL( M, texUni, triCall, tag )、1st / 2nd 共用。

### 遮罩類貼圖（BlendMask）—— 只有 3 個

⚠️ 我一開始說「四個裝飾層都有」、**錯了**、逐條 grep 源碼後：

| 參數 | lilToon 行 | 采樣方式 | 状態 |
|---|---|---|---|
| _MatCapBlendMask | :1431 | `.rgb` → **逐通道**混合 | ✅ |
| _MatCap2ndBlendMask | :1499 | 同上 | ✅ |
| _EmissionBlendMask | :1715 | RGBA **整體乘**（rgb 調色、a 調強度）| ✅ |
| _Main2ndBlendMask | :697 | `.r` 乘到 alpha | ✅（主色層已做）|
| _Main3rdBlendMask | :783 | 同上 | ✅ |
| **_RimBlendMask** | — | **不存在**、Rim 用 `fd.triMask.g`（頂點色）| ✅ 早已有 |
| **_BacklightBlendMask** | — | **不存在** | — |

#### ★ MatCap 的遮罩是 vec3、所以需要 ba3dBlend3

    權重 = _MatCapBlend * matCapColor.a * matCapMask      ← matCapMask 是 float3
    ⇒ mix( dstCol, outCol, srcA ) 裡 srcA 也是 vec3（逐通道）

所以给 GLSL 加了一個 vec3 alpha 版：

    vec3 ba3dBlend3( vec3 dstCol, vec3 srcCol, vec3 srcA, uint blendMode ) { ... }

有遮罩時用 ba3dBlend3、沒有時仍用 ba3dBlend（float）、零開銷。

#### 貼圖緩存

    resolveMaskTexture()  →  復用 resolveDissolveTexture（**數據貼圖**、NoColorSpace）
    ⚠️ 不能走 sRGB、否則 0~1 的遮罩值被 gamma 扭曲、生效区域全錯。
    ⚠️ 異步加載時會返回 null、所以 uniform 要**無條件聲明**、用占位貼圖頂上。
       遮罩占位 = 纯白（.r = 1.0、等價「不限制」）

### 描邊貼圖的 UV 變換 / 滾動 / HSV

三個新參數（lil_common_frag.hlsl:268-360）：

| 設定 | lilToon | 格式 |
|---|---|---|
| texST | _OutlineTex_ST | [tilingX, tilingY, offsetX, offsetY]、預設 [1,1,0,0] |
| texScrollRotate | _OutlineTex_ScrollRotate | [scrollX, scrollY, angle, angleSpeed]、預設 [0,0,0,0] |
| texHSVG | _OutlineTexHSVG | [色相偏移, 飽和度倍率, 明度倍率, gamma]、預設 [0,1,1,1] |

    lilCalcUV（lil_common_functions.hlsl:436）：
        outuv = uv * ST.xy + ST.zw;
        outuv = lilRotateUV( outuv, SR.z + SR.w * _Time.y ) + frac( SR.xy * _Time.y );

    lilToneCorrection（:328）：gamma → RGB→HSV → 調整 → HSV→RGB

**⇒ 三個都在預設值時走 three 原生的 mat.map 路徑、零開銷、觀感不變**。
  非預設時才把 mat.map 置空、改成自己在片元裡采樣。
  時間用 uBa3dTime、每幀在 updateLilOutlineCamera 裡更新。

（注：_OutlineOffsetFactor / _OutlineOffsetUnits 在 1.3.7 的 hlsl 裡**完全沒被使用**。
  是遺留的 Properties、無事可做）

### Stencil（模板緩衝）

lilToon 有**兩套**（lts.shader:535-541 / :566-572）：
本體 _Stencil*、描邊 _OutlineStencil*、各 7 個。

#### ⚠️ 前提：renderer 必須開模板緩衝

    const renderer = new THREE.WebGLRenderer({ ..., stencil: true });

three r160 預設 **false**、而模板緩衝**無法在 context 創建後再加**。
如果沒改這一項、Stencil 做完了也會「調了沒反應」、又一次靜默失效。

#### Unity 枚舉 → three 常量（兩套編號完全不同、不能直傳）

    Unity CompareFunction          three StencilFunc
      Disabled = 0                   Never = 512
      Never = 1                      Less = 513
      Less = 2                       Equal = 514
      Equal = 3                      LessEqual = 515
      LessEqual = 4          →       Greater = 516
      Greater = 5                    NotEqual = 517
      NotEqual = 6                   GreaterEqual = 518
      GreaterEqual = 7               Always = 519
      Always = 8  ← lilToon 預設

    Unity StencilOp                three StencilOp
      Keep = 0  ← lilToon 預設      Zero = 0
      Zero = 1                       Keep = 7680
      Replace = 2                    Replace = 7681
      IncrSat = 3            →       Increment = 7682
      DecrSat = 4                    Decrement = 7683
      Invert = 5                     Invert = 5386
      IncrWrap = 6                   IncrementWrap = 34055
      DecrWrap = 7                   DecrementWrap = 34056

#### 字段對應

    _StencilRef        → stencilRef
    _StencilReadMask   → stencilFuncMask
    _StencilWriteMask  → stencilWriteMask
    _StencilComp       → stencilFunc
    _StencilPass       → stencilZPass     （Unity 的 Pass = 深度與模板都通過）
    _StencilFail       → stencilFail
    _StencilZFail      → stencilZFail

three 只有 **stencilWrite = true** 時才用這些設置、關閉時完整還原原本的 8 個字段。

#### ★ 怎麼用才對（雞生蛋問題）

    ⚠️ 全局設成 Comp=Equal + Ref=1、會讓**所有**东西消失。
       初始模板緩衝 = 0、測試 0 == 1 失敗、全部丟棄。
       丟棄了就不會寫模板、永遠是 0、永遠失敗。
       （實測现象：本體消失、只剩描邊色剪影）

    正確用法需要**兩個對象分工**：
      對象 A（標記者）：Comp = Always(8)、Pass = Replace(2)、Ref = 1
      對象 B（接收者）：Comp = Equal(3)、Ref = 1
    ⇒ 在查看器裡就是：全局設 A 的參數、然後**材質下拉選 B**、單独設 B 的參數。

    實測驗證：全局 Comp=8/Pass=2/Ref=1、選 CH0155_Shield_Toon 設 Comp=3/Ref=1
      → 盾牌只顯示在別的部件遮住它的位置（被裁切）
      → 把描邊那 8 項也設成 Comp=3/Ref=1、盾牌描邊同樣消失。

### 裝飾層執行順序（對齊 lilToon）

lil_pass_forward_normal.hlsl:352 / 360 / 411 / 445 / 450 / 457 / 472 / 478：

    Main2nd → Main3rd → Backlight → MatCap → MatCap2nd → Rim → Emission1st → Emission2nd
    （前面兩個在光照前後各半、天然在最前）

我們原來錯了（Rim → MatCap → Emission → Backlight）、已改為
**Backlight → MatCap → MatCap2nd → Rim → Emission**。

順序錯了在「同区域多個效果疊加」時觀感會不同、尤其 Backlight 是加色。

---

## ★ 場景視圖三件套（Unity 風格）

> 工具欄的「場景」按鈕打開一個 `#scenePanel` 浮窗、三組控件。
> ⚠️ 它就是個普通的 `.lp` 浮窗 ⇒ 拖動 / 縮放 / 位置持久化都由浮窗底座接管。

### ⚠️⚠️ 輔助顯示**預設全關**、主頁面顯式打開

  ```
  主頁面 index.html        showGrid:true · showViewGizmo:true   （場景視圖）
  嵌入看板 autoMount       showGrid:false · showViewGizmo:false  （貼在網頁上）
  ```

  ⚠️ 用戶的原話：「網格在網頁看板那裡、應該是關閉的」。

  ⇒ `viewer.js` 裡 `showGrid` / `showViewGizmo` **預設 false**。
     `index.html` 在 `createViewer(...)` 的 opts 裡**顯式打開**。

  ⇒ 嵌入方想要就寫 data 屬性：

      <div data-ba3d
           data-ba3d-grid="true"
           data-ba3d-axes="true"
           data-ba3d-gizmo="true"
           data-ba3d-light-helper="true"></div>

  ⚠️ 判定規則都是 `!== 'false'` ⇒ 寫 `="true"` 或直接寫 `data-ba3d-grid` 都算開。

  ### 實測

      主頁面 index.html        {grid:true,  gizmo:true,  axes:false}
      嵌入頁 embed-demo.html   {grid:false, gizmo:false, axes:false}

---

### ① 輔助顯示

  | 鍵 | 預設 | 說明 |
  |---|---|---|
  | `showGrid` | **false** | 地面網格（`GridHelper`、y=0 略高 0.0005 避免 z-fighting） |
  | `showAxes` | false | 原點 XYZ 坐標軸（紅 X / 綠 Y / 藍 Z、Unity 配色） |
  | `showLightHelper` | false | 主光方向指示（從光源位置指向原點的線 + 端點小球） |
  | `showViewGizmo` | **false** | 右下角… 不、**右上角**視角指示器 |
  | `gridSize` / `gridDivisions` | 8 / 16 | 網格尺寸與分格數 |
  | `axesLength` | 1.6 | 坐標軸長度 |

  ⇒ 坐標軸的正方向實線、負方向半透明、（Unity 也這樣）

  ### ⚠️ 視角指示器為什麼在**右上角**

      右下角被「状態」浮窗占著、左下角是工具欄 ⇒ 只剩右上角。
      （Unity 的 Scene 視圖也是右上角）

  ### ⚠️ 指示器用**独立的 2D canvas**、不開第二個 WebGL

  第二個 `WebGLRenderer` 會搶上下文、而且很貴。
  ⇒ 用 2D canvas 把三條世界軸按**相機旋轉**轉一下、取 xy 投影。
  ⇒ 按 z 排序、朝後的画淡一點 ⇒ 有前後遮擋感。
  ⇒ 只用旋轉不用位置 ⇒ 它錶示的是「當前視角朝向」、和 Unity 一致。

### ② 光照

  ⚠️ `keyLight` 是**方向光**、它的 `position` 只錶示**方向**（光源在無窮遠）
  ⇒ 與其讓人填 xyz、不如给 **方位角 / 仰角**（Unity 習慣也是轉朝向）

      azimuth   [0,360)  绕 Y 軸、0 = +Z（模型正面）、順時針增加
      elevation [-89,89] 仰角、0 = 地平線 · 90 = 正上方

  換算（`anglesToPosition` / `positionToAngles`）：

      x = r·cos(el)·sin(az)      y = r·sin(el)      z = r·cos(el)·cos(az)

  ⇒ 讀的時候**反解**成角度 ⇒ 三套預設和手動調值能共存。

  可調：主光 方位角 / 仰角 / 強度 / 顏色 · 環境光 強度 / 天空色 / 地面色 ·
        邊緣光強度 · 補光強度 · 曝光 · 預設下拉（白晝 / 早晨傍晚 / 黑夜）

  ⚠️⚠️ **手動改過就把 `cfg.lightingPreset` 置空** ——
     否則下次 `applyLighting()` 會把用戶改的值全盖掉。
     ⇒ 面板的預設下拉這時顯示「（自定義）」。

  ⚠️ 手動寫的是**最終值**、不走 `applyLighting` 裡那條卡通系數
     （`key ×1.22` · `rim/fill ×0.15`）⇒ 否則面板顯示和實際不符。

### ③ 相機

  可讀可寫：`position[3]` · `target[3]` · `distance` · `fov`

  ⚠️ 只傳 `target` 時相機**跟著平移**（保持相對方位、和 Unity 的「移動觀察點」一致）

  軸對齊快捷視角（`setViewPreset`）：

      front / back / left / right / top / bottom

  ⚠️ **保留當前距離**（否則會突然拉到很遠、用戶會暈）
  ⚠️ 正上/正下用**略偏的方向**（纯垂直時軌道控制的 up 會退化 ⇒ 萬向鎖）

  ⚠️ 相機能被鼠標拖動 ⇒ 面板數字會過期 ⇒
     面板可見時 **2Hz 回讀**（不是每幀）、而且**正在編輯的框不覆盖**。

### API

      viewer.getSceneHelpers() / setSceneHelpers({...})
      viewer.getLightState()  / setLightState({...})
      viewer.getCameraState() / setCameraState({ position, target, distance, fov })
      viewer.setViewPreset('front'|'back'|'left'|'right'|'top'|'bottom')

### ⚠️ 一個接線順序的坑（踩到了）

  `#scenePanel` 的內容是**打開時**才 build 的、而 `ensurePanelTitle` /
  `makePanelDraggable` / `initFloatWin` 在本段程式碼**後面**才定義。

  ⇒ 直接調會 `is not defined`、而面板**還是會開** ⇒ 只是沒接上拖動、很隱蔽。
  ⇒ 修法：在 `toggleScenePanel` 裡用 `setTimeout(..., 0)` **延遲一幀**調。
     （那時腳本已執行完、函數都就位了）

  ⚠️ 標題文案走 `PANEL_TITLES` 映射錶、**不要**去改 DOM。
     （`const txt = PANEL_TITLES[el.id] || el.id`）

---

# ★ 交互約定（改 UI 前先讀這一節）

> 用戶的原話：「**不要给人增加學習成本和讓人感覺反直覺反人類**」
> ⇒ 這是本項目的**最高設計約束**、任何「技術上的優雅」都不許違反它。

## 一、對齊業界慣例 · 不自創

  | 东西 | 約定 |
  |---|---|
  | 快捷視角 Top / Bottom | **豎直**（正下方 / 正上方看）、不許搞斜的 |
  | 快捷視角 Front / Back / Left / Right | 相機落在**世界軸**上 |
  | 屏幕上方 | = **+Z = 角色正面**（和 Unity / Blender 一致） |
  | 俯視 / 仰視 | 相機低於地面時**自動隱藏網格**（模擬 Unity 的單面 Grid） |
  | 状態浮窗 | **右下角**（IDE / 引擎的資訊位） |
  | 工具欄 | 左下角 · 啟動器 |
  | 角色顯示 | 左上角 · 画布主體 |

  ⚠️ 我之前在俯視 / 仰視上**連改三次**都是因為自創：
     ① 偏移 0.0001 想绕開萬向鎖 ⇒ 朝向退化
     ② 把仰視改成 **斜的** ⇒ 「你搞個斜的乾嘛啊啊」
     ③ 俯視 `up=(0,0,-1)` ⇒ 画面裡模型是**倒的**
     ✅ 正解：**正方向 + 換 up 向量**（技術問題用技術手段解）

## 二、不用內部名詞當界面文案

  |、別用 |、用 |
  |---|---|
  | `pivot` / 取景中心偏移 | **修正模型位置 XYZ** |
  | `groundOffsetY` | 同上（它只是 `modelOffset.y` 的別名） |
  | `showGrid` / `showAxes` | 地面網格 / 原點坐標軸 |
  | `action` 模式 | **view**（用戶叫它 view、內部值仍用 action） |

  ⚠️ 「按鈕叫**場景** · 面板叫**場景參數**」這種区分要**有必要**才行。
     纯粹因為歷史原因留兩個名字 ⇒ 就是學習成本。

## 三、預設状態就是正確状態

  ⚠️⚠️ **不許出现「先點一下才生效」** ——

     我犯過：`buildShaderPanel()` 只在**點開面板**時調用 ⇒
     預設状態下工具欄還是满的 ⇒ 用戶看到的和需求相反。
     而我的探針**先點了按鈕再測** ⇒ 永遠發现不了。

  ⇒ 規矩：**測預設状態就別做任何交互**、再接交互測試。
  ⇒ 規矩：裝飾性 / 結構性元素**寫進 HTML**、不要靠 JS 運行時塞。
     （`.fw` 那三個浮窗是寫死的 ⇒ 從來沒出過「被重建清掉」的問題。
       `partsPanel` / `lilPanel` 是運行時建的 ⇒ 標題 / [—] / 手柄**輪流消失**）

## 四、坐標系要自洽（一套心智模型）

      · 角色腳下的**中軸線** = 世界原點的豎直線
      · `modelOffset` 的用途 = **把模型擺到這條線上**（預設 0 ⇒ 已經在上面）
      · 自動貼地負責讓腳落在 y=0
      · 快捷視角：相機在世界軸上、目標在中軸線上
      · 軌道旋轉绕這條中軸線轉 ⇒ **以角色為中心**

  ⚠️ 反例（已修）：`sample.json` 裡留著老 `pivot.x = -0.1` ⇒
     它在老語義下是「只動相機對準點」、遷到新語義就變成
     **「把模型推離中軸線 0.1」** ⇒ 和整套心智模型**正相反**。

## 五、一個概念只能有一處真相

      ⚠️ 本會話踩過的同類：
        · `groundOffsetY` 與 `modelOffset.y` 並存 ⇒ 自動貼地「寫了沒人讀」
        · 顯示模式切換放在工具欄 + 面板兩處 ⇒ 改成只用浮窗左上那一處
        · `pivot` 與 `modelOffset` 並存 ⇒ 已廢棄 pivot

      ⇒ 合並概念時**必須把所有寫入方一起改**、漏一個就靜默失效。

---

## ★ 浮窗布局（Unity 風格）

> `index.html` 不再是「全屏場景 + 固定側欄」、而是**若乾個互不嵌套的浮窗**。
> 像 Unity 那樣：場景一個視窗 · 參數面板另一個視窗 · 都能拖動和縮放。

### 為什麼改

  ⚠️ `frameModel()` 是按 **`container.clientHeight`** 把模型縮放到固定像素高的。
     而場景原來是 `position: fixed; inset: 0`（鋪满視口）⇒
     **瀏覽器視窗一變扁 ⇒ 模型跟著縮**、很意外。
  ⇒ 固定尺寸的浮窗 ⇒ `clientHeight` 恒定 ⇒ **模型大小恒定**。

  ⚠️ 用戶**主動**縮放場景視窗時**仍會**重新取景 —— 這是預期行為。
     Unity 的 Scene 視圖也是這樣。

### 四個浮窗

  | id | 標題 | 內容 | 預設位置尺寸 |
  |---|---|---|---|
  | `#sceneWin` | 場景 | `#app`（three canvas）+ `#vignette` | 16,16 · 960×700 |
  | `#hudWin` | 工具欄 | `#hud`（按鈕 + 動作/打光/亮度/陰影/分檔色/夾取） | 16,bottom · 660×210 |
  | `#infoWin` | 状態 | `#info`（幀率 / 三角形數 / 材質數） | right,16,bottom · 300×130 |
  | `.lp` ×3 | 參數 / 匯出 / 部件 | lilToon 面板 · 匯出 JSON · 部件列錶 | right,top · 400 寬 |
  | `#upload` | 自定義模型 | 上傳 glb / 貼圖 / 設定（用自己的 `.u-title` 當把手） | left,top · 288 寬 |

  ⚠️ `#loading` **不是**浮窗 —— 它是加載遮罩、仍是全屏覆盖。

### 通用操作

     拖動      按住**標題欄**拖（`#upload` 是按住它自己的 `.u-title`）
     縮放      拖**右下角小三角**（`.fw-grip`）
     層級      點哪個視窗哪個到最前（加 `.raised` ⇒ z-index:30）
     持久化    自動存進 localStorage 的 `ba3d-layout-v1`（鍵名故意不帶點）
     └ 存的是   left / top / width / height / collapsed

  ⚠️ 鍵名**故意不帶點** —— `check-panel.mjs` 會把源碼裡帶點的字符串當成
     面板的「組.鍵」⇒ 帶點的鍵名會被誤判成組名（實測踩到）

### 重置布局

  **控制台裡執行**：

      ba3dResetLayout()        // 清掉持久化 + 重新載入

  ⚠️ 也掛在 `window.ba3dResetLayout`。

### 窄屏兜底

  ⚠️ 浮窗在手機上不實用 ⇒ `@media (max-width: 820px), (max-height: 560px)` 下：

      #sceneWin   鋪满視口 · 去掉邊框圓角 · 隱藏標題欄與手柄
      .lp         全屏覆盖（內部本來就能滾）
      #hudWin     底部 34vh · #infoWin 底部 20vh
      #upload     全屏覆盖

  ⇒ 拖不動也沒關系（標題欄和手柄都隱藏了）、CSS 就夠、不用 JS 分支。

### 實现位置

  · CSS      `index.html` 的 `.fw` / `.fw-title` / `.fw-body` / `.fw-grip` 四條規則
  · 拖動     復用已有的 `makePanelDraggable(el, handleSel)`
             （把手鏈：`.fw-title` > `.lp-title` > `.u-title` > `h4`）
  · 縮放     `makePanelResizable(el)` —— 右下角手柄 · 最小 240×160 · 視口夾緊。
  · 持久化   `fwSave` / `fwRestore` / `fwClearAll` / `fwClampBox`
  · 匯總     `initFloatWin(el)` = 拖動 + 縮放 + 恢復 + 層級。
             `enableAllPanelDrag()` 對所有 `.fw` 和 `.lp` 調它。

  ⚠️ **零 DOM 重構**：`.lp-title` 本來就是 `position: sticky`、所以面板內部滾動時
     標題不會被滾走、不用動那 438 個控件的容器。

---

## ★ `modelOffset`（修正模型位置）· `pivot` 已廢棄

  ### 控制什麼

      renderer.modelOffset = { x, y, z }     // 世界單位

  ⇒ **移動的是模型本體** ⇒ 影子 / 描邊 / 光照全都跟著動。
  ⇒ 相機對準點 = 模型的新中心 ⇒ **旋轉天然以角色為中心**。

  ### ⚠️ 和已廢棄的 `renderer.pivot` 的区別

      舊做法 pivot = { x, z }   只動**相機對準點**
        ⇒ 看起來模型移位了、但**模型和影子都沒動** ⇒ 不直觀。
        ⇒ 而且「旋轉以角色為中心」是靠偏移對準點**湊**出來的。

      新做法 modelOffset = { x, y, z }   **真的移動模型**
        ⇒ 模型到了 000 ⇒ 旋轉中心自然就是角色。

  ⇒ 用戶的原話：

      「取景中心偏移本身就是為了實现旋轉時角色在旋轉中心設計的。
        我們實際需要的就是讓人可以直觀把模型移動到 000 位置。
        這樣旋轉就是角色為中心看、**不動旋轉軸、動角色位置**」

  ### ⚠️ `pivot` 已廢棄（但 API 還在）

      · `renderer.pivot` —— 預設設定裡**已刪除**、載入時不再讀。
      · `viewer.getPivot()` / `setPivot()` —— 保留但**沒人調了**、視為廢棄。
      · 場景面板裡的「取景中心」組 —— **已刪**、只剩「修正模型位置」。

  ### 三個舊控件的預設值遷移

      工具欄原來的「落地微調 / 基準X / 基準Z」三個控件已刪 ⇒ 合並成 modelOffset：

          落地微調（groundOffsetY） ⇒ **modelOffset.y**（`groundOffsetY` 保留為兼容別名）
          基準 X（pivotX）          ⇒ **modelOffset.x**
          基準 Z（pivotZ）          ⇒ **modelOffset.z**

      ⇒ `sample.json` / `fallback.json` 裡原 `pivot.x = -0.1` 已遷成
         `renderer.modelOffset = { x: -0.1, y: 0, z: 0 }`（保住原觀感）

  ⚠️ 還有個**坑**：`modelOffset` 必須放在 `renderer` 裡。
     我第一次寫到了 JSON **頂層** ⇒ 載入器不認 ⇒ 設定靜默失效。

---

## ★ 取景垂直偏移預設 22（`framingOffsetY`）

  ⚠️ 這個預設值是**實測調出來的**、不是隨手给的。

  ### 為什麼不是 0

  `CH0155_Vital_Death`（倒地動作）在**第 4 秒**整體掉到画面下半 ⇒
  底部超出下邊緣 **0.0934 NDC** ⇒ 被裁。

  ⚠️ 只采一個時刻**看不出來** —— 0.7 秒那幀完全正常。
     必須每個動作采多個時刻（0.4 / 1.0 / 1.8 / 2.8 / 4.0 / 6.0 秒）取最差值。
     （也可用 `viewer.frameFitReport()` 自查）

  ### 22 是怎麼來的

      `framingReferenceHeight = 430` ⇒ 半高 215px
      0.0934 NDC × 215 ≈ 20px ⇒ 取 **22** 留一點餘量。

  ### 實測效果（5 個最緊的動作 × 3 個時刻）

      動作                     改之前      改之後
      CH0155_Vital_Death      −0.0934、+0.0372。
      CH0155_Exs_Cutin        +0.0131      +0.1350    ← 原來貼在底邊、一起救了
      CH0155_Vital_Dying_Ing   …           +0.1881。
      CH0155_Vital_Panic       …           +0.1937。
      被裁：1 個 ⇒ **0 個**。

  ### ⚠️⚠️ 這不是「抬高地面 / 抬高模型」

、抬模型  ⇒ 剛修好的踩地會壞掉、影子又會和腳分開
、動的是 **相機對準點**（`frameModel` 的 target.y）
        ⇒ 地面仍在 y=0、腳也仍在 y=0（`groundOffsetY` 的貼地還生效）

  ### 調法

      「正值 = 取景下移 ⇒ 画面內容**上移**」
      ⇒ 內容被**下邊緣**裁 ⇒ 調**大**
      ⇒ 內容被**上邊緣**裁 ⇒ 調**小**（或给負數）

  ⇒ 運行時也能改（不用刷新）：

      viewer.getFraming()                        // 看當前值
      viewer.setFraming({ framingOffsetY: 30 })  // 改
      viewer.frameFitReport()                    // 量有沒有出画

  ⚠️ 換模型後建議跑一次 `probe-fit.mjs` 看新模型的動作有沒有出画。

---

## ★ 接地：角色腳與地面（`groundOffsetY`）

### 問題

  「角色腳步沒有接地、影子和身體是分開的」（長期反饋）

  ⚠️ 根因：`fitToView` 用 `measureContentBox(root)` 的 `min.y` 把模型落到 y=0。
     但**蒙皮網格的包圍盒是绑定姿勢（bind pose）的** ⇒
     動畫一動、腳的真實高度就變了 ⇒ 影子（投在 y=0）和腳之間出现縫。

  ### 實測（無頭瀏覽器量出來的）

      自動貼地前   minY = 0.0664   groundY = 0   gap = 0.0664   ← 懸空
      自動貼地後   minY = -0.00003 groundY = 0   gap = 0        ← 精確接地
      采樣 9303 點 / 11 個網格

  ⇒ 模型總高 2 世界單位 ⇒ 懸空約 **3.3% 身高** ⇒ 正好是肉眼能看到的那條縫。

  ### 量法：`viewer.probeGround()`

  ⚠️ **必須對頂點做蒙皮變換**、不能讀包圍盒。
     用 `SkinnedMesh.applyBoneTransform(i, v)`（three r151+）。
     再 `applyMatrix4(o.matrixWorld)` 到世界空間。
     頂點有幾十萬 ⇒ 每個網格采樣約 2000 點（腳部密度足夠）

  ### 設定

  | 鍵 | 預設 | 說明 |
  |---|---|---|
  | `groundOffsetY` | 0 | 落地微調（世界單位）正數抬高 · 負數壓下去 |
  | `autoGroundSnap` | true | 加載後**自動貼地一次** |

  ### ⚠️⚠️ 為什麼只能貼**一次**

  跳躍 / 蹲下 / 抬腿這些動作**本身就是讓腳離地的**。
  每幀貼會把它們壓平 ⇒ 角色像被釘在地上。

  ⇒ 而且必須**等動畫推進 12 幀**再量 ——
     剛 load 完姿勢還是绑定姿勢、那正是 fitToView 已經用過的 ⇒ 量出來 gap≈0 白貼。

  ⇒ 縫小於 `0.5% × 身高` 時不貼（蒙皮采樣有噪聲、貼了可能過衝）

  ### 面板

  工具欄裡有：

      落地微調   滑杆 + 數字框（-0.5 ~ 0.5）
      自動貼地   按鈕 ⇒ `viewer.snapToGround()`（量一次 · 自動補償）

  ⚠️ 手動調過滑杆 ⇒ 自動貼地**讓位**（`__autoSnapSkip`）、不覆盖用戶的值。

  ### ★ 取景會跟著走（重要、用戶提的隱患）

  ⚠️ `frameModel` 用的是 `fitToView` 時**緩存的 `contentBox`**。
     而貼地會把模型整體下移 `groundOffsetY` ⇒ 取景中心卻還停在舊位置。

      偏移小（預設 −0.0666 = 身高的 3.3%）⇒ 看不出來
      滑杆能拖到 ±0.5（= 身高的 25%）⇒ 那時候就會頂出画面。

  ⇒ 修法：`frameModel` 的 `target.y` 加上 `groundOffsetY`。
     並且**只在落地微調變化時**重算（不是每幀）。

  ### 實測（24 個動作逐個量 NDC 餘量）

      改之前   最緊動作  top=0.2133  bottom=0.1161
      改之後   最緊動作  top=0.1553  bottom=0.1745   ← 更均衡
      被裁動作數  0 / 24。

      極端偏移（滑杆兩端 · 身高的 25%）：
        偏移 −0.5  ⇒ top=0.6734  bottom=0.2518。
        偏移 +0.5  ⇒ top=0.6751  bottom=0.2040。

  ⚠️ 量法：`viewer.frameFitReport()` 把當前姿勢的**蒙皮包圍盒**投到 NDC。
     `|ndc| <= 1` 在画面裡、超出就是被裁。
     ⇒ 換模型 / 換動作後想確認「有沒有出画」跑一次就知道。

  ### 地面本身不用動

  貼地是**把模型往下夠地面**、不是把地面抬起來 ⇒
  地面仍在 `y=0`、腳也正好在 `y=0`、接觸是準的。

  ### API

      viewer.probeGround()            → { minY, groundY, gap, sampled, meshes }
      viewer.frameFitReport()         → { ndcTop, ndcBottom, marginTop, marginBottom, clipped }
      viewer.getGroundOffset()        → 當前偏移
      viewer.setGroundOffset(y)       → 設置（會禁用自動貼地）
      viewer.snapToGround()           → 按當前姿勢自動貼地
      viewer.onGroundOffsetChange(fn) → 自動貼地後同步面板滑杆

---

## ★ 日間模式（`body.light`）

  ### 做什麼

  工具欄最左邊一個「日間 / 夜間」按鈕、切換整套配色。

  ### ⚠️ 做法是**增量覆盖**

  在 `index.html` 的 `</style>` 之前追加一組 `body.light …` 規則。
  **不動上面任何一條暗色規則** ⇒ 夜間模式零風險（一個字節都沒變）

  ⇒ 想再加一處、就在那一組裡補一條**同選擇器**的規則（後寫的贏）

  覆盖範圍（約 40 條）：

      html/body 背景 · .fw / .fw-title / .fw-grip · #sceneWin 的 body
      #hud 的按鈕 / 下拉 / 數字框 / 分隔線 / option
      .lp 面板 + 標題欄 + 按鈕 + textarea + 輸入
      #upload 上傳面板 + .u-pick + .u-actions
      #info / #loading / #bar · #vignette（日間把暗角放松、否則四角發黑）

  ### 優先級

      localStorage('ba3d-theme')  >  系统 prefers-color-scheme  >  夜間

  ⚠️ 鍵名**不帶點**（`check-panel.mjs` 會把帶點字符串當成面板的「組.鍵」）

  ### 控制台

      ba3dSetTheme('light')     // 或 'dark'

  ### ⚠️ 場景背景也跟著變

  預設背景是「透明」⇒ 場景視窗 body 的 CSS 色透出來 ⇒
  日間模式下模型站在**浅色**底上、（這是有意的、和 Unity 一致）
  想要固定底色 ⇒ 用工具欄的「背景」下拉選一個具體顏色。

---

## ★ 2026-10-06 新增（對齊 lilToon 2.3.4）

> 這一批都是為了把基線從 lilToon 1.3.7 換到 **2.3.4** 之後補齊的东西。
> 版本對比與源碼地圖見 [`LILTOON2.x.zh-TW.md`](LILTOON2.x.zh-TW.md)。

### 1. 渲染状態（每材質）—— `_TransparentMode` / `_Cutoff` / `_Cull`

  **三個頂層鍵**、預設**全是 `-1 = 不改**（沿用模型自帶的值）：

  | 鍵 | 預設 | 對應 | 說明 |
  |---|---|---|---|
  | `transparentMode` | -1 | `_TransparentMode` | -1不改 · 0=Opaque · 1=Cutout · 2=Transparent · 3~6（Refraction/Fur/FurCutout/Gem）降級成 Transparent 並打日志 |
  | `cutoff` | 0.5 | `_Cutoff` | 只在 Cutout 模式下有意義 |
  | `cull` | -1 | `_Cull` | -1不改 · 0=Off(雙面) · 1=Front · 2=Back |

  ⚠️ **Unity 與 three 的 side 枚舉順序不同** ⇒ 不能直接對拷。

      _Cull 0（Off 雙面）→ THREE.DoubleSide (2)
      _Cull 1（Front）    → THREE.FrontSide  (0)
      _Cull 2（Back）     → THREE.BackSide   (1)

  ### alphaTest 的**唯一權威**是 `syncDissolveAlphaTest`

  優先級（從高到低）：

      ① 溶解開著（lilToon 且 dissolve.mode > 0）⇒ max( 0.5, 原值 )
         （必須 ≥ 0.5 才會真正 discard）
      ② transparentMode = 1（Cutout）⇒ cutoff
      ③ transparentMode = 0 / ≥2（Opaque / Transparent）⇒ 0
      ④ 模式沒改（-1）但單独给了 cutoff 且原本就是 Cutout ⇒ cutoff
      ⑤ 否則 ⇒ 還原成模型原值（userData.__ba3dOrigAlphaTest）

  ⚠️ `applyLilRenderState` **不碰** alphaTest、只設 transparent / depthWrite / side。
     兩者分工是為了避免重復施加、（踩過一次）

  ⚠️ 改 alphaTest 會影響 three 的 `USE_ALPHATEST` 宏 ⇒ 必須 `needsUpdate = true`。

  ### 同步鏈（順序要緊）

      syncDissolveAlphaTest();   // ① alphaTest（唯一權威）
      syncRenderState();         // ② transparent / depthWrite / side
      syncLayerDoubleSide();     // ③ 主色層的剔除（顯式 _Cull 優先 · 會跳過）
      syncStencil();             // ④ 模板參數
      applyOutlineParams();      // ⑤ 重新評估描邊的跳過規則

  ⚠️ 前四個函數都必須在**每次設定變更**時整體遍歷一遍。
     因為**材質會被復用** ⇒ `patchToonMaterial` 不會再跑 ⇒ 只改設定不會生效。

### 2. 主色 UV / 色調 —— `_MainTexHSVG` / `_MainTex_ScrollRotate`

  | 鍵 | 預設 | 對應 |
  |---|---|---|
  | `mainTexHSVG` | `[0,1,1,1]` | `_MainTexHSVG`：(色相偏移, 飽和度倍率, 明度倍率, Gamma) |
  | `mainTexScrollRotate` | `[0,0,0,0]` | `_MainTex_ScrollRotate`：(滾動X, 滾動Y, 旋轉角, 旋轉角速度) |

  公式照抄（`lil_common_frag.hlsl:263 / :317`）：

      fd.uvMain = lilCalcUV( fd.uvMain, _MainTex_ST, _MainTex_ScrollRotate );
      fd.col.rgb = lilToneCorrection( fd.col.rgb, _MainTexHSVG );

  ⇒ 實现方式：**替換 `#include <common>`（加 uniform + 兩個 helper）
     與 **`#include <map_fragment>`**（換成打過補丁的采樣）。

  ⚠️ **不再乘 `_MainTex_ST`** —— three 的 `vMapUv` 已經含 ST 了。
  ⚠️ **GLSL 沒有函數提升** ⇒ 生成器裡順序必須是「旋轉函數 → 滾動函數 → 調用」。
  ⚠️ 全預設時生成器返回 `null` ⇒ 兩個 replace 都退化成原文 ⇒ **零副作用**。

  ### 時間 uniform（`uBa3dTime`）

  ⚠️ **無條件聲明**（未使用的 uniform 會被 GLSL 優化掉 ⇒ 聲明了不用沒代價）
     因為在需要時才聲明會漏 —— Decal 的圖集動畫也用它、（踩過一次）

  ⚠️ 所有 shader **共享同一個 uniform 對象**（`ba3dTimeUniform`）。
     不是「維護 shader 列錶事後去改」（那樣 three 處理過的 uniforms 改不到、踩過）

  ⚠️ **已知偏差**：lilToon 改的是**共享的 `fd.uvMain`** ⇒ 陰影/描邊貼圖也會跟著滾。
     我們只改主色貼圖自己的 UV ⇒ 已在 `LILTOON2.x.md` 記為已知差異。

### 3. 層 Alpha 模式 —— `_Main2nd/3rdTexAlphaMode`

  `main2nd.alphaMode` / `main3rd.alphaMode`（Int · 預設 0）：

      0 = 不改變   1 = 用這一層的 alpha 替換   2 = 相乘
      3 = 相加（截斷）   4 = 相減（截斷）

  ⚠️ **只在 Cutout / Transparent 下生效** —— lilToon 裡整塊在
     `#if LIL_RENDER != 0` 裡、three 裡沒有這個宏
     ⇒ 由 `mat.alphaTest > 0 || mat.transparent` 反推。
  ⚠️ 用完會把這一層的 alpha **置 1**（`lil_common_frag.hlsl:805`）
     ⇒ 緊接著的**顏色混合**按满強度算、（這一句很容易漏）

### 4. 抖動 Dither —— `_UseDither` / `_DitherTex` / `_DitherMaxValue`

  `dither: { use, url, maxValue }`、公式照抄（`lil_common_frag.hlsl:524-546`）：

      fd.col.a = fd.col.a >= ( 貼圖值 * 255 + 1 ) / ( _DitherMaxValue + 2 ) ? 1 : 0;

  ⚠️ **GLSL ES 1.00 沒有 `uint`** ⇒ `lilSamplePointRepeat` 的等價寫法：

      vec2 cell = mod( floor( gl_FragCoord.xy ), size );
      vec2 uv   = ( cell + 0.5 ) / size;      // ★ 用紋素中心

  ⚠️ 用**紋素中心**而不是 lilToon 字面的 `uv/size`。
     因為 Unity 那邊 `_DitherTex` 一般是 Point 過濾（角=中心 ⇒ 等價）
     而 **three 加載貼圖預設是 LinearFilter** ⇒ 落在角上會混合 4 個紋素 ⇒ 點陣被糊掉。

  ⚠️ 貼圖預設 white ⇒ 全 1 ⇒ 閾值 = 256/257 ≈ **0.996** ⇒ **幾乎全丟**
     想要真正的點陣效果需要一張**有序抖動矩陣**貼圖。
     內置兩張可直接用：

         assets/test/dither-bayer4.png   4×4   16 個不同值
         assets/test/dither-bayer8.png   8×8   64 個不同值

### 5. Decal 貼花 —— `_Main2nd/3rdTexIsDecal`

  ⚠️ **Decal 不是独立層** ⇒ 它是 main2nd / main3rd 的一個**模式**。
     邏輯在 `lilGetSubTex`（`lil_common_functions.hlsl:719`）裡。

  每層 7 個開關 + 2 個 vec4：

      isDecal / isLeftOnly / isRightOnly / shouldCopy / shouldFlipMirror / shouldFlipCopy
      decalAnimation (4)   // (列數, 行數, 固定幀, 幀率) 預設 (1,1,1,30)
      decalSubParam  (4)   // (寬, 高, 向中心吸附, 1)    預設 (1,1,0,1)

  三段公式（照抄）：

      lilCalcDecalUV（:473）：
          if(shouldCopy) outUV.x = abs(outUV.x - 0.5) + 0.5;
          outUV = outUV * uv_ST.xy + uv_ST.zw;
          if(shouldFlipCopy && uv.x < 0.5) outUV.x = 1.0 - outUV.x;
          if(shouldFlipMirror && isRightHand) outUV.x = 1.0 - outUV.x;
          if(isLeftOnly  &&  isRightHand) outUV.x = -1.0;
          if(isRightOnly && !isRightHand) outUV.x = -1.0;
          outUV = (outUV - uv_ST.zw) / uv_ST.xy;      // 旋轉前先逆 ST
          outUV = lilRotateUV(outUV, angle);
          outUV = outUV * uv_ST.xy + uv_ST.zw;

      lilCalcAtlasAnimationAtAnimTime（:533）—— 圖集幀動畫
      邊緣 AA（:748）：outCol.a *= lilIsIn0to1( uv2, saturate(nv - 0.05) )
          ⚠️ HLSL 把 float2 傳给 float ⇒ **隱式截斷成 .x** ⇒ **只判 x 方向**。

  ⚠️ `isRightHand` = **切線 W 的符號**（`lil_pass_forward_normal.hlsl:341`）
     沒有切線的模型 ⇒ 恒為 1.0（= lilToon 的初值、`lil_common.hlsl:162`）
  ⚠️ `isDecal` 的邊緣 AA 會清掉 `decalUv.x` 落在 [0,1] 之外的像素。
     用超出 [0,1] 的 UV 通道時必須設 `texST` 把範圍壓進來。

  ### ⚠️ 實用性說明（避免誤會）

  **Decal 不是「把一張圖貼到臉上某個位置」的工具**、它是给這一層的貼圖
  **換一套采樣規則**（換 UV / 鏡像 / 單側 / 圖集動畫 / 裁到 [0,1]）
  ⇒ 真正的「貼花」來自**模型/美術提供了一套為貼花準備的 UV**。
  ⇒ BA 系列的 uv1 是大範圍重復的 ⇒ `texture2D(tex, uv1)` 只會得到**條紋**。
     （Unity 裡用同樣的 UV1 + 同樣的 ST 會出现一模一樣的條紋、不是 bug）

  ⇒ `texST` 在這裡的實際用法是「**取貼圖哪一塊放大鋪满**」、不是自由擺放。
  ⇒ 「★Decal 調試」= 2 可以把 decal UV 直接輸出成顏色、用來確認 UV 落在哪。

### 6. 反射 / 鏡面高光 —— `_UseReflection` / `_ApplySpecular`

  `reflection: { use, apply, toon, border, blur, normalStrength, smoothness,
                reflectance, metallic, color, blendMode, aaStrength }`

  ⚠️ **`_UseReflection` 預設 0** ⇒ lilToon 預設**不画高光**。
     19 個官方預設裡只有 3 個開（Inorganic-Glass / LiteGlass / Metal）
     ⇒ 這是**金屬 / 玻璃類**材質的功能、皮膚/衣服/頭發都不開。

  公式照抄（`lil_common_frag.hlsl:1189-1208` / `:1348`）：

      N  = lerp( fd.origN, fd.N, _SpecularNormalStrength );
      H  = normalize( fd.V + L );
      nh = saturate( dot( N, H ) );
      if ( _SpecularToon )
          reflectCol = lilTooningScale( _AAStrength, pow( nh, 1.0/fd.roughness ),
                                        _SpecularBorder, _SpecularBlur );
      fd.col.rgb = lilBlendColor( fd.col.rgb, reflectionColor.rgb * lightColorSpc,
                                  reflectCol * reflectionColor.a, _ReflectionBlendMode );

  `roughness = (1 - _Smoothness)²`（`lil_common.hlsl:200` + `lil_common_frag.hlsl:1311-1312`）

  ⚠️ **`_Smoothness = 1`（預設）⇒ `roughness = 0` ⇒ `pow( nh, 1.0/0.0 )`**。
     HLSL：`pow(x, +INF)` 對 x<1 返回 0 · x>=1 返回 1
     GLSL：**指數為無窮是未定義行為** ⇒ 顯式寫成 `ba3dSpNH >= 1.0 ? 1.0 : 0.0`。

  ⚠️ 裝飾層順序（`lil_pass_forward_normal.hlsl:335-470`）。
     Reflection 在 **Backlight 之後 · MatCap 之前**。

  ⚠️ 有意未做：`_ReflectionCubeTex`（Unity 靠 Reflection Probe）· 非卡通的完整 GGX。

### 7. ★ 描邊與透明材質（行為變更）

  **lilToon 沒有「透明材質就跳過描邊」這條規則**、它给透明材質也画描邊。
  ⇒ 我們原來那條是自己加的近似 ⇒ **已去掉**。

  ### 现在的行為

      · 透明材質**照常画描邊**
      · 描邊材質 `transparent` 跟著源 ⇒ **`depthWrite = false`**
        （否則不透明的殼會把半透明本體**深度剔除**成實心、踩過一次）
      · 描邊顏色 / alpha 來自 `_OutlineColor`（面板上的描邊色 + 透明度）
        ⚠️ **不乘源材質的 alpha** —— lilToon 裡 `fd.col.a *= _OutlineColor.a`。
           「跟著透明」的真正機制是**描邊 pass 繼承材質的 `_TransparentMode`**
           （混合 / 深度状態）、不是把 alpha 乘起來。

  ### ⚠️ 描邊有**兩套系统**、状態要共享

      ① three 的 OutlineEffect（非 lilToon 模式）
      ② `applyLilOutline()` 的独立反殼網格（lilToon 模式）

  ⇒ 兩套各自有「跳過」規則、**改一處不會影響另一處**、（踩過一次）
  ⇒ 现在 `applyLilOutline` 也會讀 `userData.outlineParameters.visible`。

  ### 相關設定

      outline.skipPattern      按**網格名**正則排除（預設 "Halo"、薄板會戳穿自身造成閃烁）
      outline.skipTransparent  【我們的開關】半透明材質要不要整個跳過描邊
                               ⚠️ 預設 **false** = 画出來（= lilToon）
                               只有極端薄板情況才需要打開。
      （off = true 的地面 / 嘴部貼片 **始終**跳過、和透明無關）

### 8. ★ 布局：有貼圖 ⇒ 這一層就算啟用

  ⚠️ lilToon 的 `_UseMain2ndTex` 是**單独一個開關**、而用戶的心智模型是
     「選了貼圖 = 這層在用了」⇒ 不打開的話 `lilMainLayerGLSL` 第一行就
     `return null` ⇒ **面板上後面所有參數全部沒反應**、但貼圖那行明明顯示了檔案名。
     （踩了很久、用戶原話：「我是用上傳貼圖當啟用了」）

  ⇒ 三道保險：

      ① 面板 `mkTex`：给層的主貼圖選檔案時順帶 `use = true`
      ② `applyLilConfig`：`tex` 有值 ⇒ `G.use = true`（任何路徑）
      ③ **讀取路徑** `normalizeLayerUse()`：`lilCfgFor` 的兩個返回點都過一遍
         ⇒ 連**老設定**（貼圖早選好了、不會再觸發 onchange）也會被補上。

  ⚠️ 副作用：**不能**靠「啟用 = 0」臨時關掉一個已有貼圖的層。
     想關掉請點貼圖那行的「清除」、（符合直覺）

### 9. ★★ 一個**長期 bug** 的修復（影響面最大）

  ⚠️ three 的 toon 光照讀的是 **`material.diffuseColor`**（那個 struct）。
     **不是**局部的 `diffuseColor`：

      lights_toon_pars_fragment：
          reflectedLight.directDiffuse   += irradiance * BRDF_Lambert( material.diffuseColor );
          reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );

  ⇒ 而我們一直寫局部 `diffuseColor` ⇒ **對光照毫無影響**。
  ⇒ 而 `enableLighting = 1` 時 after 塊又是 `srcA = a × (1-el) = 0` ⇒ **兩邊都不出力**。
  ⇒ ⇒ **「參與光照比例 = 1」（預設）時「主色層 2nd / 3rd」徹底不可見**。
     功能實際是**半廢**的、潜伏了很久。

  ### ✅ 修法：額外產出一段 `afterMaterial`

      #include <lights_fragment_begin> 之前  ⇒ before        （算層色 · 寫 diffuseColor）
      #include <lights_fragment_begin> 之後  ⇒ afterMaterial （喂 material.diffuseColor）★
      #include <dithering_fragment> 之前      ⇒ after         （未受光部分 / 溶解邊緣）

      material.diffuseColor.rgb = mix( material.diffuseColor.rgb,
                                        ba3dColor2nd.rgb, ba3dColor2nd.a * el );

  ⚠️ **必須在 include 之後** —— `material` 是在**那個 include 裡面**被賦值的。
  ⚠️⚠️ **不能引用 `ba3dLc`** —— 它是 before 那個 `{ }` 塊裡的局部變量。
     而 afterMaterial 在塊外面 ⇒ GLSL 沒有塊外可見性 ⇒ 編譯失敗。
     ⇒ 用前導裡聲明過的 `ba3dColor2nd` / `ba3dColor3rd`。

### 9.5 補齊：層溶解 / Decal 調試 / MatCap / 描邊模板

  #### 主色層 2nd / 3rd 的層溶解（`main2nd.dissolve*` / `main3rd.dissolve*`）

  | 鍵 | 預設 | 對應 |
  |---|---|---|
  | `dissolveThreshold` | 0 | `_Main2ndDissolveParams.x` 閾值（貼圖模式的判據） |
  | `dissolveSoftness` | 0 | `..y` 羽化（邊界柔化） |
  | `dissolveDir` | 0 | `..z` 方向：0=用頂點色 · 1=用貼圖 |
  | `dissolveNoiseStrength` | 0 | `_Main2ndDissolveNoiseStrength` 噪聲強度 |

  ⚠️ 層溶解的參數在 lilToon 裡是打包進 **vec4** 的（`.x` 閾值 / `.y` 羽化 /
     `.z` 方向）、面板上拆成了三個滑杆。
  ⚠️ 溶解的 `alphaTest` 必須 ≥ 0.5 才會真正 discard。
     而 `alphaTest` 的**唯一權威**是 `syncDissolveAlphaTest`、（見第 1 節）

  #### Decal 調試開關（`main2nd.decalDebug` / `main3rd.decalDebug`）

  **我們額外做的**（lilToon 沒有）、預設 0：

      0 = 正常
      1 = 跳過 Decal 的邊緣 AA（保留貼圖原 alpha）
      2 = 把 decal UV 輸出成顏色（R=uv.x · G=uv.y · B=1 · a=1）
      3 = 強制 alpha = 1（保留 RGB）

  ⇒ 用來二分定位「開了 Decal 但画面沒變化」：

      1 有變化 ⇒ 是**邊緣 AA** 把 alpha 清成 0 了（decal UV 出了 [0,1]）
      2 有變化 ⇒ 采樣在跑 ⇒ 問題在 alpha / 混合
      3 有變化 ⇒ 采樣到了 ⇒ 問題在顏色 / 混合
      都沒變化 ⇒ 這段 GLSL **根本沒進著色器**（看 `[inject]` 日志）

  #### 層的 UV 旋轉角（`main2nd.texAngle` / `main3rd.texAngle`）

  對應 `_Main2ndTexAngle`、預設 0、單位是弧度。
  ⚠️ 旋轉圍绕 **(0.5, 0.5)**、不是 UV 原點。
  ⚠️ 如果這一層的 UV 本身是一小塊岛（臉部貼花常見）、旋轉後可能整塊
     跑出采樣範圍 ⇒ 看起來像「消失了」而不是「轉了」。

  #### MatCap 的兩個額外鍵（`matcap.*` / `matcap2nd.*`）

  | 鍵 | 預設 | 對應 |
  |---|---|---|
  | `customNormal` | 0 | `_MatCapNormalStrength` 的開關（是否用法線貼圖擾動 MatCap 的 N） |
  | `vrParallax` | 1 | `_MatCapVRParallaxStrength` ⚠️ **非 VR 下是空操作**、見 `LILTOON2.x.md §7.1` |

  ⚠️ `vrParallax` 保留只是為了對齊 lilToon 的屬性錶、在 Web 裡**永遠沒有效果**。
     （`lil_common_macro.hlsl:696`：`!USING_STEREO_MATRICES` 時直接返回 b）

  #### 描邊的模板參數（`outline.stencilPass` / `outline.stencilReadMask`）

  | 鍵 | 預設 | 對應 |
  |---|---|---|
  | `stencilPass` | 0 | `_OutlineStencilPass`（描邊自己的模板操作） |
  | `stencilReadMask` | 255 | `_OutlineStencilReadMask` |

  ⇒ 還有一組同族的 `outline.stencil*`（Ref / Comp / WriteMask / Fail / ZFail）
     見 `CONFIG.md` 的「模板模式下拉」一節。
  ⚠️ three 沒有 Unity 那麼完整的模板 API ⇒ 只映射了能做的那幾個。
     做不了的（如 `_StencilFail` 的部分組合）落在已知偏差裡。

### 10. 診斷日志一覽（排查時先看這些）

      [layer] 2nd | use=… tex=… isDecal=… uvMode=… blendMode=… enableLighting=…
          ⇒ **無條件**打在 lilMainLayerGLSL 的 return null **之前**
             （打在分支裡的話「沒有日志」這件事本身無法区分原因）
      [inject] <材質> 層2nd | 命中 include=… | before 長度=… | 注入後含 ba3dLc=…
          ⇒ **注入時刻**的日志、区分「文本被生成」和「文本被插進著色器」。
      [decal] 2nd | … rawTexST=… rawAnim=… rawSub=…
          ⇒ 含**原始值**、一眼看出面板有沒有寫進來。
      [uv-check] <材質>：uv1 存在 · 跨度=… · 切線 有/沒有
          ⇒ Decal / 單側顯示的前置體檢。
      [lightClamp] / [reflection] / [mainTex] / [dither] / [renderState] / …

  ⚠️ 經驗：**診斷要打在你懷疑的那個判定之前**、否則資訊量不足。
