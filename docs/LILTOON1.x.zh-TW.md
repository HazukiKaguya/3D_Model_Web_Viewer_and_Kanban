# lilToon 1.3.7 → Web (three.js) 舊基線對照（已歸檔）

[简体中文](LILTOON1.x.md) ｜ **繁體中文** ｜ [English](LILTOON1.x.en.md) ｜ [日本語](LILTOON1.x.ja.md) ｜ [한국어](LILTOON1.x.ko.md)

> ⚠️ **本文檔已歸檔** —— 它記錄的是**舊基線 lilToon 1.3.7** 的對照與核對。
> **當前生效的基線是 2.3.4**、見 [`LILTOON2.x.zh-TW.md`](LILTOON2.x.zh-TW.md)。
>
> 保留本文檔的原因：
>   · 階段 1~3 的**完成度記錄**與當時的判斷過程
>   · **描邊（Outline）的完整規格**（源碼級、仍有效）
>   · **預設按材質**的架構改造方案（仍有效）
>   · 許多「為什麼這麼做」的推導、遷移時沒有重寫。
>
> ⚠️ 裡面的**行號引用是 1.3.7 的**、想查源碼請用 LILTOON2.x.md §4 的源碼地圖。
# lilToon → Web (three.js) 對照錶

> 目的：判斷 lilToon 的哪些效果能在本查看器（three.js r160）裡還原，需要哪些輸入。
>
> **已核對到真實源碼**：`lilToon/`（工作区，`jp.lilxyzw.liltoon` **v1.3.7**，Unity 2018.1+）。
> 第二節的逐項判斷來自源碼通讀，第六節给出**精確公式與檔案行號**。
> 面板項名稱按 1.3.7 的 `Editor/` 與 `lts.shader` 整理；你 Unity 裡若對不上，以你看到的為準。

---

## 一、結論先行

| 問題 | 結論 |
|---|---|
| 能把 lilToon **整體移植**過來嗎 | ❌ **不能**。它是 Unity ShaderLab + HLSL，上萬行、拆成幾十個 `.cginc`，且深度依賴 Unity 運行時（多 Pass、`UNITY_LIGHT_ATTENUATION`、Lightmap、Light Probe、屏幕空間陰影、MaterialPropertyBlock）。沒有现成的 three.js 移植版。 |
| 能把它的**觀感主體**重寫出來嗎 | ✅ **能**。核心是「多段 ramp + 邊界色 + Rim + MatCap + 材質級自發光/背光 + 反殼描邊」——這幾項占了 lilToon 出圖效果的绝大部分。 |
| 最大的障礙是什麼 | ⚠️ **不是技術，是參數**。GLB/FBX 裡不會帶「影の境界 = 0.5、リムライト強度 = 0.3、MatCap = `xxx.png`」這些設置。觀感只能來自「你抄给我的參數」或「一套通用預設值」。 |
| 貼圖拿得到嗎 | ✅ 大部分能：`MainColor` / `NormalMap` / `EmissionMap` / 描邊貼圖，這些會以貼圖檔案形式存在於模型旁邊或內嵌在 GLB 裡。 |

---

## 二、需要你從 Unity 抄给我的參數

> 面板項名字按 lilToon 1.7.x 整理，對不上就以你看到的為準，照抄即可。
> 拿不準的項**留空**，我按預設值補。

### 基本資訊

```
lilToon 版本：            （1.7.x / 2.0.x / 其他）
Unity 版本：
這是：                    （VRChat アバター / 普通模型 / 場景物件）
模型匯出格式：            （FBX / GLB）
目前 Web 上看到的效果：   （截圖更好）
Unity 裡參考效果：        （截圖更好）
```

### 基本設定

```
色：                      R__ G__ B__  /  #______
影の色：                  R__ G__ B__  /  #______
影の境界：                0.__
影のぼかし：              0.__
2nd 影 有効：             是 / 否     色：____  境界：0.__
3rd 影 有効：             是 / 否     色：____  境界：0.__
バックライト：            色：____  強度：0.__
```

### メインカラー

```
テクスチャ：              （檔案名）
色：                      #______
ブレンドモード：          Normal / Add / Screen / Multiply / …
アルファマスク：          （檔案名，沒有就留空）
カットオフ：              0.__
```

### ノーマルマップ

```
1st：                     （檔案名）  スケール：0.__
2nd / 3rd：               （檔案名，沒有就留空）
```

### リムライト

```
有効：                    是 / 否
色：                      #______
境界：                    0.__        ぼかし：0.__
方向：                    ライト方向 / 視點方向
マスク：                  （檔案名，沒有就留空）
```

### マットキャップ

```
1st：                     （檔案名）  ブレンドモード：____
2nd / 3rd：               （檔案名，沒有就留空）
```

### エミッション

```
1st：                     （檔案名）  色：#______  強度：0.__
2nd：                     （檔案名，沒有就留空）
```

### アウトライン

```
有効：                    是 / 否
色：                      #______
太さ：                    0.___
基準：                    法線 / 位置
テクスチャ：              （檔案名，沒有就留空）
```

---

## 三、建議的實施順序

按「視覺收益 ÷ 工作量」排的，**分三階段**，每階段做完你都能直接看效果：

### 階段 1 —— 觀感提升最明顯的四件事

1. **多段 ramp + 邊界色**：把现在的 `celSteps/celDark` 升級成「N 段 + 每段各自顏色 + 過渡帶寬度」
2. **Rim Light**：視角邊緣光 + 顏色 + 邊界 + 遮罩
3. **MatCap**：1st 槽位（視角空間球面采樣）
4. **Emission**：材質級自發光 + 強度（第二張先不做）

> 這四項都在 `onBeforeCompile` 的注入範圍內，不動渲染架構，風險最低

### 階段 2 —— 更接近 lilToon

5. **描邊升級**：從 `OutlineEffect` 換成自己的反殼 pass → 支持**描邊寬度貼圖**與**頂點色控制**
6. **Main Color 的ブレンドモード**（Add / Screen / Multiply）
7. **Backlight / 逆光**
8. **Dissolve**

### 階段 3 —— 已完成

原計劃兩條、實際執行時**你要求先跳過法線貼圖通路**（成本最高）、改為做「其他的」：

**9. 2nd / 3rd 主色層 + 2nd MatCap** —— ✅ 完成
- 2nd / 3rd 主色層各 8 項（含 ★ `_Main2ndEnableLighting` 是「參與光照的**比例**」、需兩處注入）
- MatCap 1st / 2nd 各 11 項（順手给 1st 補上完整版才有的 color / backfaceMask / mainStrength）
- 遮罩類貼圖 **3 個**（`_MatCapBlendMask` / `_MatCap2ndBlendMask` 取 `.rgb`、`_EmissionBlendMask` 取 RGBA）
  ⚠️ `_RimBlendMask` / `_BacklightBlendMask` **不存在**（Rim 用頂點色 G）
- ⏸ **2nd / 3rd ノーマルマップ** 主動搁置
- ❌ 未做：Decal 貼花（7 項/層）、距離淡出、層溶解（3 項/層）

**10. Stencil 等邊緣特性** —— ✅ 完成
- Stencil：本體 8 項 + 描邊 8 項、Unity 枚舉 → three 常量映射。
  ★ 前提：`renderer` 必須 `stencil: true`（three r160 預設 false、且無法事後加）
  ★ 面板裡拆成 **「Stencil 模型」** 和 **「Stencil 描邊」** 兩組。
  ★ 附「模板模式」下拉（4 個模式、從 lilInspector.cs 匯出、其中 2 個名字與直覺相反）
- 描邊貼圖的 `_OutlineTex_ST` / `_OutlineTex_ScrollRotate` / `_OutlineTexHSVG` —— ✅
- ❌ 未做：自發光第二層（Emission2nd、7 項）、自發光 GradSpeed / ParallaxDepth / Fluorescence

**⚠️ 法線貼圖搁置的連帶代價** —— 9 個參數「有開關沒通路」、調了無效果。
`_Main2ndNormalStrength` / `_Main3rdNormalStrength` / `_MatCapNormalStrength` / `_MatCap2ndNormalStrength` /
`_RimNormalStrength` / `_BacklightNormalStrength` / `_ShadowNormalStrength` /
`_Shadow2ndNormalStrength` / `_Shadow3rdNormalStrength`

**建議的後續順序**：① 自發光第二層（低）② 層溶解（低）③ 距離淡出（中）④ Decal（中）⑤ 法線貼圖通路（高、一次解鎖 9+3 個參數）

### 明確不做

Glitter、Audio Link、Fur / Gem / Tessellation、Lightmap / Light Probe、屏幕空間陰影、VRC Light Volumes

---

## 四、兩個必須提前知道的事

1. **不會和你 Unity 裡一模一樣**
   three.js 的光照模型、色調映射、陰影處理都和 Unity 不同。參數抄得再準，最終也會有可見差異（尤其是**陰影的軟硬**和**高光**）。目標是「一眼看過去是同一個角色的同一個画風」，而不是像素級一致。

2. **參數必須逐個材質抄**
   lilToon 是**逐材質**設定的。一個角色的臉、身體、衣服、頭發可能是 4 個材質、4 套參數。
   如果材質多，建議**先只抄「皮膚」和「頭發」兩套**，這兩塊占觀感的 80%。

---

## 五、描邊（Outline）完整規格 —— 源碼級

> 與 `Hidden/lilToonOutline` 的關系：那是編輯器從主著色器**生成**的變體（源碼裡沒有独立檔案）。
> 描邊的全部屬性都在 `lts.shader` 裡（474~556 行），渲染時走独立的一趟 pass。

### 8.1 頂點位移

鏈路：`lil_vert_outline.hlsl`（29 行、只是調度）
     → `lil_common_functions.hlsl:279 lilCalcOutlinePosition`
     → `lil_common_functions.hlsl:254/265 lilGetOutlineWidth`

```hlsl
// lil_common_functions.hlsl:254
float lilGetOutlineWidth(uv, color, outlineWidth, outlineWidthMask, outlineVertexR2Width) {
    outlineWidth *= 0.01;                                   // ★ 1/100
    #if LIL_FEATURE_OutlineWidthMask
        outlineWidth *= SAMPLE(outlineWidthMask, uv).r;     // 遮罩取 R 通道
    #endif
    if (outlineVertexR2Width == 1) outlineWidth *= color.r; // 頂點色 R 當寬度
    if (outlineVertexR2Width == 2) outlineWidth *= color.a; // 頂點色 A 當寬度
    return outlineWidth;
}

// lil_common_functions.hlsl:265
float lilGetOutlineWidth(positionOS, positionWS, uv, color, ...outlineFixWidth) {
    outlineWidth = <上面那個>;
    // ★ 關鍵：世界單位 ↔ 屏幕恒定粗細的混合
    outlineWidth *= lerp(1.0, saturate(length(lilHeadDirection(positionWS))), outlineFixWidth);
    return outlineWidth;
}

// lil_common_functions.hlsl:279
void lilCalcOutlinePosition(inout positionOS, uvs, color, normalOS, tbnOS, ...) {
    float3 positionWS = <M 矩陣 × positionOS>;
    float width = lilGetOutlineWidth(...);
    float3 outlineN = normalOS;
    #if LIL_FEATURE_OutlineVectorTex
        outlineN = lilGetOutlineVector(tbnOS, uvs[outlineVectorUVMode], outlineVectorScale, outlineVectorTex);
    #endif
    if (outlineVertexR2Width == 2) outlineN = mul(color.rgb * 2.0 - 1.0, tbnOS);
    positionOS += outlineN * width;
    float3 V = <透視> ? lilViewDirectionOS(positionOS) : <正交>;
    positionOS -= normalize(V) * outlineZBias;
}
```

`lil_common_macro.hlsl`:
- `614 lilHeadDirection(positionWS) = _WorldSpaceCameraPos - positionWS`
  ⇒ `length(...)` 就是**頂點到相機的距離**。
- `646 lilViewDirectionOS(positionOS) = 相機在對象空間的位置 - positionOS`

**⇒ `_OutlineFixWidth` 的語義**：
| 值 | factor | 效果 |
|---|---|---|
| 0 | 1.0 | 寬度是**世界單位**（遠處看起來更細） |
| 1 | saturate(距離) | 寬度**屏幕上恒定**（透視下乘距離恰好抵消） |
| 0.5（預設）| 兩者插值 | 折中 |

### 8.2 片元著色

`lil_common_frag.hlsl:349-387`：

```hlsl
fd.col = SAMPLE(_OutlineTex, uv);                       // 若啟用、否則白
fd.col.rgb = lilToneCorrection(fd.col.rgb, _OutlineTexHSVG);   // 若啟用
float3 outlineLitColor  = _OutlineLitApplyTex ? fd.col.rgb * _OutlineLitColor.rgb : _OutlineLitColor.rgb;
float  outlineLitFactor = saturate(NdotL * _OutlineLitScale + _OutlineLitOffset) * _OutlineLitColor.a;
// 若 _OutlineLitShadowReceive、再 *= fd.attenuation
fd.col.rgb = lerp(fd.col.rgb * _OutlineColor.rgb, outlineLitColor, outlineLitFactor);
fd.col.a  *= _OutlineColor.a;
```

**預設 `_OutlineLitColor.a = 0`** ⇒ `outlineLitFactor = 0` ⇒ **就是 `貼圖 × _OutlineColor`**。
受光是可選的高級功能。

### 8.3 全部屬性與預設值（lts.shader:474-556）

| 屬性 | 含義 | 預設 |
|---|---|---|
| `_OutlineColor` | 描邊顏色 | (0.6, 0.56, 0.73, 1) |
| `_OutlineTex` | 描邊貼圖 | white |
| `_OutlineTexHSVG` | 色相/飽和/明度/Gamma | (0,1,1,1) |
| `_OutlineLitColor` | 受光色 | (1.0, 0.2, 0, **0**) |
| `_OutlineLitApplyTex` | 受光是否乘貼圖 | 0 |
| `_OutlineLitScale` | 受光強度 | 10 |
| `_OutlineLitOffset` | 受光偏移 | -8 |
| `_OutlineLitShadowReceive` | 受光是否收陰影 | 0 |
| `_OutlineWidth` | 寬度 Range(0,1) ⚠️ [lilOLWidth] | 0.08 |
| `_OutlineWidthMask` | 寬度遮罩貼圖 | white |
| `_OutlineFixWidth` | 固定寬度 Range(0,1) | 0.5 |
| `_OutlineVertexR2Width` | 頂點色當寬度：0 None / 1 R / 2 RGBA | 0 |
| `_OutlineVectorTex` | 法線向量貼圖 | bump |
| `_OutlineVectorUVMode` | UV0..UV3 | 0 |
| `_OutlineVectorScale` | -10~10 | 1 |
| `_OutlineEnableLighting` | Range(0,1) | 1 |
| `_OutlineZBias` | Z 偏移 | 0 |
| `_OutlineDisableInVR` | | 0 |
| `_UseOutline` | 總開關 | 0 |
| `_OutlineCull` | Cull：0 Off / 1 Front / 2 Back | 1 |
| `_OutlineSrcBlend` / `DstBlend` / `SrcBlendAlpha` / `DstBlendAlpha` / `BlendOp` / `BlendOpAlpha` | 独立混合 | 1/0/1/10/0/0 |

### 8.4 three.js 實现路徑（我們的移植方案）

```
① 載體：每個網格追加一份**克隆材質**（共享 geometry、side = THREE.BackSide）
   或用第二個 Mesh 子節點、共享 geometry、克隆材質。
   —— 為什麼不用 OutlineEffect：它參數只有 thickness/color/alpha。
      加不了寬度遮罩 / 頂點色寬度 / 固定寬度 / Z Bias / 受光。

② 頂點位移：onBeforeCompile 注入在 #include <begin_vertex> 之後
   vec3 outlineN = objectNormal;                      // 頂點屬性裡的法線
   float ow = uOutlineWidth * 0.01;
   ow *= <遮罩采樣 .r>;                                // 若啟用
   ow *= <color.r 或 color.a>;                        // _OutlineVertexR2Width
   ow *= mix(1.0, saturate(dist), uOutlineFixWidth);  // dist = -mvPosition.z
   transformed += outlineN * ow;
   transformed -= normalize(cameraPosOS - transformed) * uOutlineZBias;

③ 片元：輸出 uOutlineColor × 貼圖（預設路徑）
   受光部分按 8.2 的公式、需要 NdotL → 用 toon 的同一套光照。

④ 渲染状態：side = BackSide、depthWrite = true。
   —— 與 OutlineEffect 的反殼思路一致、但參數完全自己控制。

⑤ FBX 為什麼原來不對（三個候選原因、實现時逐一驗證）
   · FBX 單位縮放不是 1 → 世界單位外擴失效 → 用 _OutlineFixWidth 語義可解
   · FBX 硬邊法線 → 外擴出现裂縫 → 需要平滑法線
   · FBX 蒙皮 → 反殼與主渲染不一致
```

### 8.5 待辦

- [ ] 實现描邊材質與頂點位移
- [ ] 接入 lilToon 參數面板（寬度 / 遮罩 / 頂點色 / 固定寬度 / Z Bias / 顏色 / 受光）
- [ ] 接入預設（預設裡 `_OutlineWidth` 等值填入 LIL_PRESETS）
- [ ] GLB 與 FBX 雙驗證
- [ ] 決定是否替換掉现有的 OutlineEffect 路徑

---

## 六、預設是**按材質**的 —— 架構改造方案

> 觀察（用戶 2026-10-05）：lilToon 的預設支持**按材質分別選擇**，所以才有
> 皮膚 / 頭發 / 衣服 / 無機 / 自然 這幾個大類。用法是：
>   · 皮膚的材質槽  → 套 Skin-*
>   · 衣服的材質槽  → 套 Cloth-*
>   · 頭發的材質槽  → 套 Hair-*
> （實際上多數人不會去逐個調，但這是 lilToon 預設的本來設計）

### 9.1 现状的問題

我們现在是**全局唯一一份 `lilCfg`**：

```js
applyLilPreset('Skin-Anime')   // → 整個模型（含頭發/衣服）全被套成皮膚預設。
```

這與 lilToon 的語義不符。

### 9.2 改造方案（推薦：全局預設 + 按材質覆盖）

```js
lilCfg                       // 全局預設（现有結構不變）
lilCfgByMaterial = {         // ★ 新增：按材質名覆盖
  'Melano_hair_MT_Toon': { shadowBorder: 0.05, rim: { blend: 1, ... } },
  'Melano_cloth_MT_Toon': { shadowBorder: 0.3 },
}
```

**生效點**：`patchToonMaterial(mat)` 裡按 `mat.name` 查覆盖錶。
浅合並到全局之上、於是：

```
最終參數 = { ...lilCfg, ...lilCfgByMaterial[mat.name] }
```

**cacheKey 要帶上材質名**、否則不同材質的程序會被復用、參數就串了。
（现在的 key 是 `ba3d-cel:<version>:<shaderMode>:...`、要加 `:<matName>`）

### 9.3 界面改動

面板頂部加一個**材質選擇器**：

```
材質  [ 全部（預設） ▾ ]     ← 預設：改的是全局 lilCfg
      [ Melano_hair_MT_Toon ]
      [ Melano_cloth_MT_Toon ]
      [ Melano_Body_MT_Toon ]
      ...

預設  [ 頭發 · 描邊+Rim ▾ ]  ← 套用到**上面選中的材質**（不是全局）
```

- 選「全部」→ 改 `lilCfg`（现在的行為、適合"我就想整體調一下"）
- 選某個材質 → 改 `lilCfgByMaterial[名字]`、面板滑杆顯示的是**合並後**的值。
- 預設下拉的選項可以**按材質名自動篩類**（名字含 hair → 只列頭發系）
  —— 但保留全部選項、用戶可能想手動指定。

### 9.4 匯出設定

```jsonc
"lilToon": { /* 全局預設 */ },
"lilToonByMaterial": {
  "Melano_hair_MT_Toon": { "shadowBorder": 0.05 }
}
```

匯出時按預設值做 diff、只寫變了的項（和现有 exportConfig 語義一致）

### 9.5 實施順序建議

1. `lilCfgByMaterial` 數據結構 + `patchToonMaterial` 裡的合並 + cacheKey 加材質名
2. API：`getLilConfig(matName)` / `setLilConfig(obj, matName)`
3. 面板：材質選擇器 + 預設套用目標跟著變
4. 匯出 / 導入支持 `lilToonByMaterial`

### 9.6 附注

- 材質名匹配建議**用派生材質的名字**（`Melano_hair_MT_Toon`、帶 `_Toon` 後綴）
  或统一剥掉後綴再匹配、避免重建後名字變了對不上。
- 也可以支持**按網格名**匹配（`melano_hair`）—— 某些模型材質名不夠語義化。
  兩者都支持更穩、優先級：材質名 > 網格名。
