# lilToon 2.3.4 → Web (three.js) 移植基線

[简体中文](LILTOON2.x.md) ｜ **繁體中文** ｜ [English](LILTOON2.x.en.md) ｜ [日本語](LILTOON2.x.ja.md) ｜ [한국어](LILTOON2.x.ko.md)

> **本文檔是當前生效的基線**。
> 舊基線（**1.3.7**）的對照錶與核對記錄見 [`LILTOON1.x.zh-TW.md`](LILTOON1.x.zh-TW.md)。
> 實现細節與全部設定鍵見 [`CONFIG.zh-TW.md`](CONFIG.zh-TW.md)。

---

## 零、基線的定義

| 項 | 值 |
|---|---|
| **基線版本** | **lilToon 2.3.4** |
| **源碼路徑** | `develop_res/liltoon-2.3.4/`（舊基線在 `develop_res/lilToon/`、保留作對照）|
| **對標檔案** | `Shader/lts.shader` —— 不透明的完整版 |
| **屬性總數** | **517**（1.3.x 是 483）|
| **程式碼裡的行號引用** | **93 處**、已全部遷移到 2.3.4（見 §5） |

### 為什麼對標 `lts.shader` 而不是別的

`lilToon/Shader/` 下有 **61 個 shader 檔案**、但它們是同一套邏輯的**變體**：

```
lts.shader          不透明完整版        ← 我們對標這個
lts_cutout / _trans / _trans_oo …       按渲染模式切的變體
ltsl_*                                  lite 版（屬性少一半）
ltsmulti_*                              多材質變體
lts_fur / _gem / _tess / _ref           独立特性（Fur / Gem / 曲面細分 / 折射）
ltspass_*                               各 pass 單独拆出來的
```

⇒ 其餘變體的屬性是 `lts.shader` 的子集、或屬於**独立特性**（Fur/Gem/Tess/Ref 是不同 shader、不是 lts 的屬性）。

---

## 一、為什麼可以換基線：對比結論

把兩個版本逐項對比後的結論是 —— **向後兼容、幾乎不用返工**。

| 對比項 | 結果 |
|---|---|
| **屬性預設值** | 483 個共有屬性裡、**只有 `_lilToonVersion` 變了**（33 → 45）、其餘**一個都沒改** |
| **19 個官方預設** | **逐項數值完全一致**（0 處差異） |
| **我們移植過的公式** | **完全一致** |

### 逐個函數核對（用花括號配對抽出函數體、逐行比對）

| 函數 | 結果 |
|---|---|
| `lilBlendNormal` |、完全一致 |
| `lilBlendColor` |、完全一致 |
| `lilTooningNoSaturateScale` |、完全一致 |
| `lilToneCorrection` |、完全一致 |
| `lilCalcSpecular` |、完全一致 |
| `lilCalcMatCapUV` | ⚠️ 唯一差異：`lerp(uvMat, `**`saturate(uv1)`**`*2-1, matcapBlendUV1)` —— **我們沒實现 `_MatCapBlendUV1`** ⇒ 不適用 |

⇒ **我們的 `LIL_PRESETS` 數據（從 `Presets/*.asset` 轉的）仍然有效**、不用重新生成。

---

## 二、對比中發现並已修的 1 處

### `dissolveParams.xy = round(...)`

**2.3.4 新增**（`lil_common_functions.hlsl:638` 與 `:684`）：

```hlsl
dissolveParams.xy = round(dissolveParams.xy);   // mode, shape
```

⇒ **mode 與 shape 都要取整**（1.3.x 沒有這行）

我們的情況：

| 參數 | 2.3.4 之前 | 2.3.4 |
|---|---|---|
| `mode` | 我們已 `Math.round` | — |
| `shape`（`_DissolveParams.g` / 我們的 `linear` 鍵）| `!== 0`、**沒取整** | `round()` |

⇒ 後果：設定裡寫 `"linear": 0.5` 時、我們當成 **Line**、lilToon 會 `round(0.5) = 0` 即 **Point**。
⇒ 面板滑杆是 `step 1`、平時都是 0/1、**只在手寫 JSON 時暴露**。
⇒ 已改成 `Math.round(num(D.linear, 1)) === 1`。

---

## 三、2.3.4 相對 1.3.x 的差異

新增 **68** 個屬性、移除 **34** 個。

### 3.1 真新功能（我們沒有）

| 功能 | 屬性數 | 預設 | 說明 |
|---|---|---|---|
| **RimShade** | 7 | 0 | 新增的「邊緣陰影」層、`_RimShadeColor` / `Mask` / `NormalStrength` / `Border` / `Blur` / `FresnelPower` |
| **IDMask** | 34 | 0 | 用 ID 控制溶解 / 隱藏部件、依賴 Unity 側工具把 ID 烘到頂點或貼圖 |
| **Dither** | 3 | 0 | 屏幕空間有序抖動、`_DitherTex` / `_DitherMaxValue`、配合 DistanceFade 用 |
| **DistanceFadeRim** | 3 | — | 距離淡出時加一圈彩色邊緣光、`_DistanceFadeRimColor` / `FresnelPower`、另有 `_DistanceFadeMode` |
| **Main2nd/3rdTexAlphaMode** | 2 | 0 | 主色層自己的 **alpha** 混合模式（原來只有顏色 blend）|

### 3.2 Unity 專屬、與我們無關

```
UDIM Discard                      20 個    Unity UDIM
Motion vectors                    多個     TAA / 運動矢量（TransformPreviousObjectToWorld 等）
Probe Volumes L1/L2                       Unity APV
VRC Light Volumes / Udon Light Volume
  ├ _EnvRimBorder / _EnvRimBlur（2 個）
  └ _UdonLightVolumeEnabled
```

### 3.3 移除的 34 個

```
資源加密：_IgnoreEncryption · _Keys · _BitKey0..31      ⇒ N/A（我們本來也沒做）
```

---

## 四、2.3.4 源碼地圖

> **所有行號都是 `liltoon-2.3.4/Shader/Includes/` 下的**。
> 我們程式碼裡的注釋引用就是這些行號、已全部對齊。

### 4.1 工具函數（`lil_common_functions.hlsl`）

| 行 | 函數 | 我們用它做什麼 |
|---|---|---|
| 11 | `lilIsIn0to1` | — |
| **26** | `lilTooningNoSaturateScale` | 卡通化的核心（3/4/5 參重載）、陰影分檔 / Rim / 高光都用 |
| **135** | `lilBlendNormal` | Whiteout blend（2nd 法線）|
| **325** | `lilBlendColor` | 全部混合模式（Normal/Add/Screen/Multiply）、我們的 `ba3dBlend` |
| **347** | `lilToneCorrection` | 描邊貼圖的 HSV 校正 |
| **419** | `lilRotateUV` | 層溶解的 Line 形状 |
| **438** | `lilCalcUV` | UV 變換（ST + 滾動旋轉）|
| **550** | `lilCalcMatCapUV` | MatCap 的 UV（含 ZRotCancel / Perspective）|
| **626** | `lilCalcDissolve` | 溶解 |
| **668** | `lilCalcDissolveWithNoise` | 溶解（帶噪聲）|
| **638 / 684** | `dissolveParams.xy = round(...)` | ★ 2.3.4 新增、見 §2 |

### 4.2 裝飾層（`lil_common_frag.hlsl`）

**⚠️ 這些大多是 `#define OVERRIDE_*` 宏、不是函數**。

| 行 | 宏 / 函數 | 對應我們的 |
|---|---|---|
| 395 | `OVERRIDE_OUTLINE_COLOR` | 描邊的受光 |
| 488 / 506 | `OVERRIDE_DISSOLVE` | Dissolve |
| 527 / 534 | `OVERRIDE_DITHER` | ★ 2.3.4 新增 |
| 566 / 573 | `OVERRIDE_NORMAL_1ST` | 1st 法線 |
| 585 / 598 | `OVERRIDE_NORMAL_2ND` | 2nd 法線（Whiteout）|
| 617 | `OVERRIDE_ANISOTROPY` | ❌ 未做 |
| 814 | `OVERRIDE_MAIN2ND` | 主色層 2nd |
| 910 | `OVERRIDE_MAIN3RD` | 主色層 3rd |
| 1192 | `OVERRIDE_SHADOW`（分檔）| 陰影分檔 + 三層法線強度 |
| 1222 / 1225 | `OVERRIDE_RIMSHADE` | ★ 2.3.4 新增 |
| **1267** | `OVERRIDE_BACKLIGHT` | 背光 |
| **1315** | `float3 lilCalcSpecular` | ★ 鏡面高光 |
| **1437** | `perceptualRoughness - fd.smoothness` | ★ `roughness = (1 - _Smoothness)²` |
| **1510** | `OVERRIDE_REFLECTION` | ★ 反射（含高光混合）|
| **1578** | `OVERRIDE_MATCAP` | MatCap 1st |
| **1636** | `OVERRIDE_MATCAP_2ND` | MatCap 2nd |
| **1747 / 1750** | `OVERRIDE_RIMLIGHT` | Rim |
| **1888 / 1891** | `OVERRIDE_EMISSION_1ST` | 自發光 1st |
| **1955** | `OVERRIDE_EMISSION_2ND` | 自發光 2nd |
| **2057** | `OVERRIDE_DISTANCE_FADE` | 距離淡出 |

### 4.3 宏與光照（`lil_common_macro.hlsl`）

| 行 | 內容 | 說明 |
|---|---|---|
| **621** | `lilHeadDirection` | 頭部方向（MatCap 視差用、非 VR 無效）|
| **696** | `lilBlendVRParallax` | ⚠️ 非 VR 下**直接返回 b**、參數無效 |
| **2079** | `LIL_CORRECT_LIGHTCOLOR_VS` | 光照夾取的宏 |
| **2081 / 2086** | `lightColor = clamp(lightColor, _LightMinLimit, _LightMaxLimit)` | ★ 光照夾取本體 |

### 4.4 裝飾層的**順序**（`lil_pass_forward_normal.hlsl`）

```
行 219 / 386   Dither            ★ 2.3.4 新增
行 251 / 446   Lighting
行 339         Layer Color（Main2nd / Main3rd）
行 446         Shadow
行 492         Backlight
行 520         **Reflection**    ★ 我們剛補的
行 527         MatCap
行 539         Rim light
             （RimShade、2.3.4 新增、在 Rim 之後）
行 554 / 560   Emission 1st / 2nd
```

完整順序：

```
Anisotropy → AudioLink → Main2nd → Main3rd → Shadow → Backlight → 【Reflection】
→ MatCap → MatCap2nd → Rim → 【RimShade】→ Glitter → Emission1st → Emission2nd
（Dither 在最外圍、作用在 fd.col.a 上）
```

### 4.5 其它關鍵位置

| 行 | 檔案 | 內容 |
|---|---|---|
| **206** | `lil_common.hlsl` | `fd.perceptualRoughness = 1.0`（初值）|
| 1438 | `lil_common_frag.hlsl` | `fd.roughness = fd.perceptualRoughness * fd.perceptualRoughness` |

---

## 五、必須提前知道的幾件事

### 7.1 `_MatCapVRParallaxStrength` 在非 VR 下是空操作

`lil_common_macro.hlsl:696`：

```hlsl
float3 lilBlendVRParallax(float3 a, float3 b, float c) {
    #if defined(USING_STEREO_MATRICES)
        return lerp(a, b, c);
    #else
        return b;          // ← 非 VR 直接返回視線方向 · 強度參數沒用上
    #endif
}
```

⇒ 瀏覽器裡調它**不會有任何效果**、這是 lilToon 的設計、不是我們的缺陷。
⇒ 面板上保留只是為了和 lilToon 的參數錶一一對應（標注了「（非VR無效）」）

### 7.2 遮罩預設來自**頂點色**

lilToon 的 `triMask`：

| 通道 | 用途 |
|---|---|
| R | MatCap 權重 |
| G | Rim 權重 |
| B | 自發光權重 |

⇒ **模型沒有頂點色時自動回退成「權重恒為 1」**、不會讓效果消失。
⇒ 面板有「頂點色」預覽按鈕、把頂點色直接當顏色渲染、用來確認遮罩分区。

### 7.3 `_Smoothness = 1` ⇒ `roughness = 0` ⇒ `pow(nh, +INF)`

```
perceptualRoughness = 1 - _Smoothness        （lil_common.hlsl:206 初值 1.0）
roughness           = perceptualRoughness²    （lil_common_frag.hlsl:1438）
```

**HLSL**：`1.0/0.0 = +INF`、`pow(nh, +INF)` 對 `nh<1` 返回 0、`nh>=1` 返回 1。
**GLSL**：**指數為無窮是未定義行為**。

⇒ 我們顯式寫成 `nh >= 1.0 ? 1.0 : 0.0`。

### 7.4 GLSL 與 HLSL 的矩陣方向不同

```
HLSL  mul(float3x3(a,b,c), v)  是**行點積**  ⇒ (dot(a,v), dot(b,v), dot(c,v))
GLSL  mat3(a,b,c) * v          是**列組合**  ⇒ 兩者不同
```

⇒ 移植時直接寫 `dot` 最不容易搞反、（`lilCalcMatCapUV` 就是一處）

### 7.5 ★★ three 的 toon 光照讀 `material.diffuseColor`（不是局部 `diffuseColor`）

  ⚠️⚠️ 想讓**受光結果**變化、必須改 **`material.diffuseColor`**（那個 struct 的字段）。
     改局部的 `diffuseColor` 只影響**後續階段**（alpha / emissive / fog）、不影響光照。

      lights_toon_pars_fragment：
          reflectedLight.directDiffuse   += irradiance * BRDF_Lambert( material.diffuseColor );
          reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );

  ⚠️ 而且 `material` 是在 **`#include <lights_fragment_begin>` 裡面**被賦值的 ⇒
     要改它必須寫在那個 include **之後**。
  ⚠️ 掛在 include 之後的程式碼在**所有塊之外** ⇒ 不能引用塊內局部變量（如 `ba3dLc`）。
     要改用檔案作用域/前導裡聲明過的變量（如 `ba3dColor2nd`）。

  ⇒ 這個坑讓「主色層 2nd / 3rd」在預設設置下**完全不可見**、潜伏了很久。
     是 B5 期間靠用戶的「enableLighting 調 0 才可見」這個實驗才挖出來的。

### 7.5.5 ★ 描邊有**兩套系统**、状態必須共享

  ⚠️ lilToon 模式下走的是 **`applyLilOutline()` 的独立反殼網格**。
     而不是 three 的 `OutlineEffect`、兩者各自有一套「跳過」規則：

      applyOutlineParams()  ⇒ 寫 userData.outlineParameters.visible
                              （透明 / 地面 / 嘴部貼片 ⇒ false）
      applyLilOutline()     ⇒ 原來**只認設定裡的 o.skipPattern**、完全不看 visible

  ⇒ 結果：「透明材質自動關描邊」只對 three 的 OutlineEffect 有效。
     對 lilToon 的反殼描邊**完全無效**。
  ⇒ 现象：切到 lilToon 風格 · 預設帶描邊、什麼都不動 ⇒
     **透明材質被那層實心背面殼盖成了不透明**。

  ### 另外：描邊殼**不能寫深度**

  原來的描邊材質 `depthWrite = true`、而它 `renderOrder = -1`（先画）
  ⇒ 深度先鋪下 ⇒ 後面的半透明薄板**被深度剔除** ⇒ 那片区域看起來就「實」了。

  ⇒ 正確做法：源材質透明 ⇒ 描邊材質也 `transparent` + **`depthWrite = false`**。
     （lilToon 是把描邊當独立 pass、繼承材質的 `_TransparentMode`）

  ### ⚠️ 而描邊的 alpha **不來自材質**

      lil_common_frag.hlsl:389     fd.col.a *= **_OutlineColor.a**;

  ⇒ 描邊色自帶 alpha（面板上的「描邊透明度」）、和主體材質無關。
  ⇒ 「跟著透明」體现在**混合 / 深度状態**、不是把 alpha 乘起來。

### 7.5.6 ★ 檢查器自己也會踩「下標錯位」

  ⚠️ `check-panel.mjs` 把**內聯腳本**抽成 `codeLines`、同時保留整份 `html` 的 `L`。
     兩者**下標差著 `base` 行**。

  原來的 ⑧ 號檢查寫成 `L[i]`、靠「腳本正好在檔案開頭附近」碰巧對上。
  ⇒ 一旦在腳本**之前**插內容（比如加日間主題的 CSS）、偏移就變 ⇒
     注釋判定讀到別的行 ⇒ **把生效的調用誤判成被注釋掉的** ⇒
     報「groupifyLilPanel() 有 0 處生效調用」、而程式碼其實是好的。

  ⇒ 修法：凡是要讀原文的判定都用 `L[i + base]`。

  ⚠️ 教訓：**檢查器有 bug 時會報假問題、比不報更浪費時間**。
     看到「本來好好的突然報錯」時、先懷疑檢查器、再懷疑程式碼。

### 7.6 `onBeforeCompile` 拿到的是**未展開 `#include` 的原文**

three 在 `onBeforeCompile` **之後**才做 `resolveIncludes`。

⇒ 想改 three 內置 chunk 裡的程式碼（如 `RE_Direct_Toon`）。
   **必須替換 `#include <xxx>` 指令本身**、拼上打過補丁的 chunk 文本。
⇒ 直接對 `shader.fragmentShader` 找 chunk 裡的那一行**永遠找不到**。

### 7.7 預設是**按材質**的

lilToon 的預設本來就是每個材質一份、我們的架構是「全局預設 + 按材質稀疏覆盖」。
詳見 [`CONFIG.zh-TW.md`](CONFIG.zh-TW.md) 與 `LILTOON1.x.md` 第 9 節。

---

## 六、對比方法（可復现）

### 8.1 屬性層面

兩邊 `lts.shader` 按 `[attr] _Name ("Label", Type) = default` 解析。

⚠️ **類型裡可能有 `Range(0, 1)` 這種帶括號的**、正則要用**貪婪的 `(.*)`**。
   否則 `_AsUnlit ("As Unlit", Range(0, 1)) = 0` 會匹配失敗（多一個右括號）

### 8.2 預設層面

解析 `.asset` 的 `m_Floats` 段：

```
- name: _UseReflection
    value: 1
```

（`- name:` 與 `value:` 是**相鄰兩行**）

### 8.3 公式層面

按函數簽名抽函數體（花括號配對）、逐行比對（忽略注釋與空行）

### 8.4 行號映射

見 §5 的方法。

---

## 七、已知偏差清單（誠實記錄）

| 項 | 情況 |
|---|---|
| `_MatCapVRParallaxStrength` | 非 VR 下是空操作、lilToon 本身如此 |
| UV1 / UV2 / UV3 | 未支持、面板下拉只给 `uv0` 和「視角球面」、選項上注明了 |
| 層溶解「UV」模式 | 用**網格 UV0**（= 圖集）、角色上會切出碎塊、**和 Unity 錶现一致** |
| **Decal 的實用性** | ⚠️ 公式 / 注入 / 邊緣 AA / 鏡像 / 單側 / 圖集動畫 **全部按 lilToon 忠實實现**、但**該模型缺少 Decal 用的 UV 布局** ⇒ 實際只能得到條紋、詳見下 || `_ReflectionCubeTex` | 未做、Unity 靠 Reflection Probe、查看器裡沒有 ⇒ 只做了鏡面高光那一路 |
| 非卡通路徑的完整 GGX | 未做、`_SpecularToon` 預設 1 ⇒ 預設都走卡通路 ⇒ 给了足夠接近的近似 |
| 光照夾取與 lilToon 的差異 | lilToon 的間接光也乘同一個 `lightColor` ⇒ 陰影裡環境光被壓下去、而 three 的環境光是**独立相加**的 ⇒ 下限拉很高時會比 lilToon 略亮、這是光照結構差異、不強行模擬 |
| cel 模式 | cel 與 lilToon 是**兩條正交的軸**、每輪都驗證 lilToon 側改動沒有污染 cel |

### ★ 關於 B5 Decal 的實用性（單独說明、避免誤會）

  **Decal 不是「把一張圖貼到臉上某個位置」的工具**、它是**给這一層的貼圖換一套采樣規則**：

      ① 換 UV 通道（通常 uv1）
      ② 鏡像復制到另一半 / 只顯示單側（靠切線 w 的符號分区）
      ③ 圖集幀動畫（_Main2ndTexDecalAnimation）
      ④ 裁掉 decalUv.x 落在 [0,1] 之外的像素（帶邊緣抗鋸齒）

  ⇒ 真正的「貼花」效果來自**模型/美術提供了一套為貼花準備的 UV**、而不是任意一張圖。

  ### 為什麼這個模型上只能看到條紋

      CH0155_Face   uv1.x ∈ [-0.53, 1.00]   uv1.y ∈ [-0.998, 1.00]
      CH0155_Body   uv1.x ∈ [-11.65, 12.10]
      CH0155_Hair   uv1.x ∈ [-13.27, 14.46]

  ⇒ `texture2D(tex, uv1)` 在 UV 空間裡被**反復采樣** ⇒ 條紋 / 帶状。
  ⇒ 加上 Decal 的 AA 只留 `x ∈ [0,1]` 的一條豎帶 ⇒ 就是看到的樣子。
  ⇒ **Unity 裡用同樣的 UV1 + 同樣的 ST 會出现一模一樣的條紋**、不是我們的 bug。

  ### 「ST 縮放 / 偏移」在這裡的實際用法

      ST 縮放 = (0.1, 0.1)  ⇒ 只取貼圖 1/10 的一塊 ⇒ 放大 10 倍鋪在模型上
      ST 偏移 = (0.3, 0.5)  ⇒ 取哪一塊

  ⇒ 可以用它做「取貼圖一角鋪满」、但**不是自由擺放**。
  ⇒ 「★Decal 調試 = 2」可以把 decal UV 直接輸出成顏色、用來確認 UV 落在哪。

  ### 想真正做「在臉上画小貼圖」需要什麼

      · 模型要有一套**為貼花排布過的 UV 通道**（美術在建模時留的）
        例如把臉上所有可貼裝飾的位置排成一張「貼花圖集」
      · 每個位置占據圖集裡的一塊 [u0,u1] × [v0,v1]
      · 然後用 _Main2ndTex_ST 把那一塊放大到 [0,1]
      · 用 _Main2ndTexDecalAnimation 選幀

  ⇒ BA 系列的 uv1 顯然不是這麼排的 ⇒ 所以只能得到條紋。

---

## 八、參考

| 檔案 | 內容 |
|---|---|
| [`LILTOON1.x.zh-TW.md`](LILTOON1.x.zh-TW.md) | 舊基線（1.3.7）與當前基線的對照、描邊（Outline）完整規格、預設按材質的架構方案 |
| [`CONFIG.zh-TW.md`](CONFIG.zh-TW.md) | 全部設定鍵、實现細節、每輪的坑與教訓 |
| `viewer.js` | 93 處行號引用、已全部對齊 2.3.4 |
| `develop_res/liltoon-2.3.4/` | 當前基線源碼 |
| `develop_res/lilToon/` | 舊基線源碼（保留作對照）|

---

## 九、2026-10-10 本輪：風格後端亮度語義對齊（滾動記錄）

「lilToon 風格」後端與對照後端（lilToon 源碼移植）此前有兩處肉眼可見的亮度偏差；
本輪把風格端的**光照合成 / 輸出處理 / 基础色來源**按對照端的實際語義對齊。

### 9.1 改動要點

| 項 | 之前的做法 | 现在的做法 |
|---|---|---|
| 直接光 | 逐灯求和的 Lambert 項，再乘一個經驗補償 | **取首盏方向光**，`clamp(主光 + 環境, 下限, 上限)`，**單次** `A × 光色 × R` 合成 |
| 經驗補償 | 合成裡帶一個 `1.65` 系數 | 該路徑**不再使用**它（預設值本身未改；未改模式的舊通路保留） |
| 基础色 | 與對照端**不對稱**（一側多乘一遍材質基础色） | 由「有效設定 → 設定映射 → vendor 運行預設」推導，與主貼圖、主色層一起合成 |
| 輸出 | 頁面色調映射（`LinearToneMapping`，曝光 1.15） | 保留；對齊後受光区的大面積近白裁切消失 |
| 首次加載 | 只走風格路徑時不會裝載橋接模塊 | 首次進入風格後端時**順帶裝載模塊**（只加載，不切換渲染後端） |

### 9.2 實測（黑底 α 合成，`L = .2126R + .7152G + .0722B`）

| 状態 | 全圖平均绝對差 | 亮度差 > 12 占比 |
|---|---|---|
| 首頁預設模型，纯預設 | 0.029 | 0.076 % |
| 首頁預設模型，「皮膚 · 動畫」全局預設 | 0.000074 | 0.00016 % |
| Melano（基準姿態） | 0.050 | 0.122 % |
| Melano，「皮膚 · 動畫」全局預設 | 0.00067 | 0.0029 % |

判據：關鍵区域（頭發 / 臉 / 外套 / 襪）平均绝對差 ≤ 3，全圖亮度差 > 12 的像素占比 ≤ 1 %。

### 9.3 順序（與上游一致）

法線 → 接收（receive）→ 普通檔 `x/y/z` 與邊界過渡檔 `w` → 強度 → 各層色 →
主強度 → 取小 → 邊界色 → 最終混合；`_UseShadow = 0` 時整段跳過。
陰影法線仍保持**無條件賦值**（預設強度 1 也要寫），逐層分檔含抗鋸齒。

### 9.4 尚未驗證（誠實記錄）

- `_ShadowNormalStrength` 中間強度：滑塊可寫，對應的著色器分支尚未生效。
- 主色層第二/第三層啟用分支未單独驗證。
- 臉部陰影只核了**亮度**口徑，**形状 / 過渡**的独立核對未做。
- 透明背景分支、其它模型、「指定材質」的預設目標未測。

---

## 十、2026-10-18 觀感基準：Unity 側條件（已核實）

參考工程：Unity **2022.3.22f1** · 項目 `Melano-Migrated` · 場景 `Melano_scene`（本機只讀核實）。

| 項 | 值 | 依據 |
|---|---|---|
| 渲染管線 | **Built-in** | `ProjectSettings/GraphicsSettings.asset`：`m_CustomRenderPipeline: {fileID: 0}` · `m_SRPDefaultSettings: {}` |
| 顏色空間 | **Linear** | `ProjectSettings/ProjectSettings.asset`：`m_ActiveColorSpace: 1` |
| 後處理 / tone mapping | **無** | 全項目 grep：Assets/Scenes 裡 0 個 `PostProcessVolume` / `Tonemapping`（postprocessing 包雖安裝但未使用） |
| lilToon | **2.3.4** | `Assets/lilToon/package.json` |

**結論**：Unity 側的 lilToon **不做材質級 tone mapping**；輸出為「**線性著色 + 顯示端 sRGB 變換**」。

對應到本倉庫：

- 源碼後端：`mat.toneMapped = false`（不跟隨頁面 tone mapping）+ **保留 sRGB 輸出** ⇒ 與 Unity 語義一致。
- 我們的風格後端：本來就剥掉 `#include <tonemapping_fragment>` ⇒ 兩個後端口徑一致。
- 頁面級 ACES 只作用於 **PBR / 原生材質**；不要讓它影響卡通兩條路徑（上游 0.1.6+ 會跟隨，必須顯式關掉）。

### 描邊（混合方案）

| 網格類型 | 由誰画 | 說明 |
|---|---|---|
| 蒙皮網格 | **上游**（`shaderVariant = Hidden/lilToonOutline` 等） | Unity 用的就是上游描邊 ⇒ 更貼基準 |
| 靜態網格 | **自研反殼** | 上游對靜態網格的觀感未驗 |
| 名字帶 `_Outline` 的殼網格 | **自研**（且不套上游） | 它本身就是外擴殼；再套上游會在 150× 縮放下膨脹成大片實體 |

⚠️ 實測：`_OutlineCull`、強制 `side = FrontSide` 對該膨脹**均無效**（像素幾乎不變）⇒ 只能靠"排除殼網格"這一條。
