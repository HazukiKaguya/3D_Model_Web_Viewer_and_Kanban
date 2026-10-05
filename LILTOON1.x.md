> ⚠️ **本文档已归档** —— 它记录的是**旧基线 lilToon 1.3.7** 的对照与核对。
> **当前生效的基线是 2.3.4**、见 [`LILTOON2.x.md`](LILTOON2.x.md)。
>
> 保留本文档的原因：
>   · 阶段 1~3 的**完成度记录**与当时的判断过程
>   · **描边（Outline）的完整规格**（源码级、仍有效）
>   · **预设按材质**的架构改造方案（仍有效）
>   · 许多「为什么这么做」的推导、迁移时没有重写。
>
> ⚠️ 里面的**行号引用是 1.3.7 的**、想查源码请用 LILTOON2.x.md §4 的源码地图。
# lilToon → Web (three.js) 对照表

> 目的：判断 lilToon 的哪些效果能在本查看器（three.js r160）里还原，需要哪些输入。
>
> **已核对到真实源码**：`lilToon/`（工作区，`jp.lilxyzw.liltoon` **v1.3.7**，Unity 2018.1+）。
> 第二节的逐项判断来自源码通读，第六节给出**精确公式与文件行号**。
> 面板项名称按 1.3.7 的 `Editor/` 与 `lts.shader` 整理；你 Unity 里若对不上，以你看到的为准。

---

## 一、结论先行

| 问题 | 结论 |
|---|---|
| 能把 lilToon **整体移植**过来吗 | ❌ **不能**。它是 Unity ShaderLab + HLSL，上万行、拆成几十个 `.cginc`，且深度依赖 Unity 运行时（多 Pass、`UNITY_LIGHT_ATTENUATION`、Lightmap、Light Probe、屏幕空间阴影、MaterialPropertyBlock）。没有现成的 three.js 移植版。 |
| 能把它的**观感主体**重写出来吗 | ✅ **能**。核心是「多段 ramp + 边界色 + Rim + MatCap + 材质级自发光/背光 + 反壳描边」——这几项占了 lilToon 出图效果的绝大部分。 |
| 最大的障碍是什么 | ⚠️ **不是技术，是参数**。GLB/FBX 里不会带「影の境界 = 0.5、リムライト強度 = 0.3、MatCap = `xxx.png`」这些设置。观感只能来自「你抄给我的参数」或「一套通用默认值」。 |
| 贴图拿得到吗 | ✅ 大部分能：`MainColor` / `NormalMap` / `EmissionMap` / 描边贴图，这些会以贴图文件形式存在于模型旁边或内嵌在 GLB 里。 |

---

## 二、逐项对照表

图例：✅ 能完整实现　🟡 能近似 / 需要额外工作　❌ 做不了

### 1. 基本設定 / Basic Settings

| lilToon 项 | 可行性 | 在 three.js 里怎么做 |
|---|---|---|
| 色（Base Color） | ✅ | 材质 `color` |
| 影の色（1st Shadow Color） | ✅ | 注入 ramp 时用两个颜色插值（现在只有一个 `celDark` 亮度，需改成「颜色 × 亮度」） |
| 影の境界（Shadow Border） | ✅ | ramp 的阈值，直接进 `celGradientGLSL` |
| 影のぼかし（Shadow Blur） | ✅ | ramp 过渡带宽度。**注意：lilToon 用的是线性重映射，不是 smoothstep**（见第六节） |
| 2nd 影 / 3rd 影 | ✅ | ramp 做 3~4 段，每段各自的颜色与阈值 |
| バックライト | ✅ | 半个 lambert（`dotNL * 0.5 + 0.5`）× 颜色，叠加在最终色上 |
| 逆光ライト（Transparent 用） | ✅ | 同バックライト，主要用于半透明 |
| ライト制限（VRC Light Volumes） | ❌ | 依赖 Unity 的 Light Volume 系统，Web 侧没有对应概念 |

### 2. メインカラー / Main Color

| lilToon 项 | 可行性 | 在 three.js 里怎么做 |
|---|---|---|
| テクスチャ | ✅ | `material.map`（已经在用） |
| 色 | ✅ | 与贴图相乘 |
| ブレンドモード（Normal / Add / Screen / Multiply …） | 🟡 | three.js 标准材质没有这个开关，需要在 `onBeforeCompile` 里手写混合公式（能做，约 20 行） |
| アルファマスク | ✅ | `material.alphaMap` |
| カットオフ | ✅ | `material.alphaTest` |
| デカール / 2nd メインカラー | 🟡 | 需要再注入一次采样 + UV 变换，代码量中等 |

### 3. ノーマルマップ / Normal Map

| lilToon 项 | 可行性 | 在 three.js 里怎么做 |
|---|---|---|
| 1st ノーマルマップ | ✅ | `material.normalMap`（已经在用） |
| 2nd / 3rd ノーマルマップ | 🟡 | three.js 只支持一张。要自己注入第二/三次采样并按 lilToon 的方式混合（代码量中等，2~3 张法线的混合顺序容易出错） |
| スケール / マスク | ✅ | 作为 uniform 传进去 |

### 4. リムライト / Rim Light　★ 我们现在完全没有

| lilToon 项 | 可行性 | 在 three.js 里怎么做 |
|---|---|---|
| 色 | ✅ | uniform |
| 境界 / ぼかし | ✅ | `fresnel = 1 - dot(N, V)`，再 `smoothstep` 卡边界 |
| 方向（ライト方向 or 視点方向） | ✅ | 用 `V` 或 `L`，切换 uniform |
| マスク | ✅ | 采样一张遮罩贴图（或复用主贴图的某通道） |
| ブレンドモード | 🟡 | 同 Main Color 的混合模式处理 |

> 注意：**我们现在配置里的 `rimLight` 是「场景里的一盏灯」，和 lilToon 的「材质级视角边缘光」是两回事**。lilToon 的 Rim 必须写在着色器里。

### 5. マットキャップ / MatCap　★ 我们现在完全没有

| lilToon 项 | 可行性 | 在 three.js 里怎么做 |
|---|---|---|
| 1st マットキャップ | ✅ | 取视角空间法线的 `xy` 作为 UV 去采样一张球面贴图，约 5 行 GLSL |
| 2nd / 3rd マットキャップ | 🟡 | 多张叠加，注意各自独立的混合模式与遮罩 |
| ブレンドモード | 🟡 | 同 Main Color |
| 法線補正 / マスク | ✅ | uniform 开关 |

### 6. エミッション / Emission

| lilToon 项 | 可行性 | 在 three.js 里怎么做 |
|---|---|---|
| 1st / 2nd エミッション | ✅ | `material.emissive` + `emissiveMap`（已在用）；第二张要自己注入 |
| 強度 / マスク | ✅ | uniform |
| アニメーション（点滅・流れ） | ✅ | 加时间 uniform，在 `onBeforeCompile` 里做 UV 滚动/闪烁 |

### 7. アウトライン / Outline

| lilToon 项 | 可行性 | 在 three.js 里怎么做 |
|---|---|---|
| 色 / 太さ | ✅ | 现在用的 `OutlineEffect` 就支持（`outlineParameters`） |
| 基準（法線 / 位置） | 🟡 | `OutlineEffect` 是法线外扩；「位置基准」要自己写描边 pass |
| テクスチャ / マスク | 🟡 | `OutlineEffect` **不支持描边贴图**，要换成自己写的反壳 pass（一次额外 draw call） |
| 頂点カラーで太さ制御 | 🟡 | 同上，自己写 pass 才能读顶点色 |
| Z オフセット / カリング | ✅ | 现有参数可调 |

### 8. その他の拡張

| lilToon 项 | 可行性 | 说明 |
|---|---|---|
| Glitter（ラメ） | ❌ | 需要程序化噪声 + 粒子闪烁，浏览器端性价比很低，视觉收益有限 |
| Dissolve（溶解） | 🟡 | 噪声贴图 + `discard`，能做，但不是"看着像 lilToon"的关键 |
| Audio Link | ❌ | 依赖 Unity 的 AudioLink 生态，查看器里没有意义 |
| Fur / Gem / Tessellation | ❌ | WebGL **没有曲面细分**；Gem 需要折射/立方体贴图，建议放弃 |
| Lightmap / Light Probe | ❌ | 模型里没有烘焙数据，无从谈起 |
| スクリーンスペース影 | ❌ | 需要深度 prepass，与当前单 pass 架构冲突 |
| ステンシル | 🟡 | three.js 支持 stencil，但用途很窄（描边遮罩等） |

---

## 三、需要你从 Unity 抄给我的参数

> 面板项名字按 lilToon 1.7.x 整理，对不上就以你看到的为准，照抄即可。
> 拿不准的项**留空**，我按默认值补。

### 基本信息

```
lilToon 版本：            （1.7.x / 2.0.x / 其他）
Unity 版本：
这是：                    （VRChat アバター / 普通模型 / 场景物件）
模型导出格式：            （FBX / GLB）
目前 Web 上看到的效果：   （截图更好）
Unity 里参考效果：        （截图更好）
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
テクスチャ：              （文件名）
色：                      #______
ブレンドモード：          Normal / Add / Screen / Multiply / …
アルファマスク：          （文件名，没有就留空）
カットオフ：              0.__
```

### ノーマルマップ

```
1st：                     （文件名）  スケール：0.__
2nd / 3rd：               （文件名，没有就留空）
```

### リムライト

```
有効：                    是 / 否
色：                      #______
境界：                    0.__        ぼかし：0.__
方向：                    ライト方向 / 視点方向
マスク：                  （文件名，没有就留空）
```

### マットキャップ

```
1st：                     （文件名）  ブレンドモード：____
2nd / 3rd：               （文件名，没有就留空）
```

### エミッション

```
1st：                     （文件名）  色：#______  強度：0.__
2nd：                     （文件名，没有就留空）
```

### アウトライン

```
有効：                    是 / 否
色：                      #______
太さ：                    0.___
基準：                    法線 / 位置
テクスチャ：              （文件名，没有就留空）
```

---

## 四、建议的实施顺序

按「视觉收益 ÷ 工作量」排的，**分三阶段**，每阶段做完你都能直接看效果：

### 阶段 1 —— 观感提升最明显的四件事

1. **多段 ramp + 边界色**：把现在的 `celSteps/celDark` 升级成「N 段 + 每段各自颜色 + 过渡带宽度」
2. **Rim Light**：视角边缘光 + 颜色 + 边界 + 遮罩
3. **MatCap**：1st 槽位（视角空间球面采样）
4. **Emission**：材质级自发光 + 强度（第二张先不做）

> 这四项都在 `onBeforeCompile` 的注入范围内，不动渲染架构，风险最低

### 阶段 2 —— 更接近 lilToon

5. **描边升级**：从 `OutlineEffect` 换成自己的反壳 pass → 支持**描边宽度贴图**与**顶点色控制**
6. **Main Color 的ブレンドモード**（Add / Screen / Multiply）
7. **Backlight / 逆光**
8. **Dissolve**


### 阶段 3 —— 已完成（2026-10-05、见 CONFIG.md 的「阶段 3 参数对照」）

原计划两条、实际执行时**你要求先跳过法线贴图通路**（成本最高）、改为做「其他的」：

**9. 2nd / 3rd 主色层 + 2nd MatCap** —— ✅ 完成
- 2nd / 3rd 主色层各 8 项（含 ★ `_Main2ndEnableLighting` 是「参与光照的**比例**」、需两处注入）
- MatCap 1st / 2nd 各 11 项（顺手给 1st 补上完整版才有的 color / backfaceMask / mainStrength）
- 遮罩类贴图 **3 个**（`_MatCapBlendMask` / `_MatCap2ndBlendMask` 取 `.rgb`、`_EmissionBlendMask` 取 RGBA）
  ⚠️ `_RimBlendMask` / `_BacklightBlendMask` **不存在**（Rim 用顶点色 G）
- ⏸ **2nd / 3rd ノーマルマップ** 主动搁置
- ❌ 未做：Decal 贴花（7 项/层）、距离淡出、层溶解（3 项/层）

**10. Stencil 等边缘特性** —— ✅ 完成
- Stencil：本体 8 项 + 描边 8 项、Unity 枚举 → three 常量映射。
  ★ 前提：`renderer` 必须 `stencil: true`（three r160 默认 false、且无法事后加）
  ★ 面板里拆成 **「Stencil 模型」** 和 **「Stencil 描边」** 两组。
  ★ 附「模板模式」下拉（4 个模式、从 lilInspector.cs 导出、其中 2 个名字与直觉相反）
- 描边贴图的 `_OutlineTex_ST` / `_OutlineTex_ScrollRotate` / `_OutlineTexHSVG` —— ✅
- ❌ 未做：自发光第二层（Emission2nd、7 项）、自发光 GradSpeed / ParallaxDepth / Fluorescence

**⚠️ 法线贴图搁置的连带代价** —— 9 个参数「有开关没通路」、调了无效果。
`_Main2ndNormalStrength` / `_Main3rdNormalStrength` / `_MatCapNormalStrength` / `_MatCap2ndNormalStrength` /
`_RimNormalStrength` / `_BacklightNormalStrength` / `_ShadowNormalStrength` /
`_Shadow2ndNormalStrength` / `_Shadow3rdNormalStrength`

**建议的后续顺序**：① 自发光第二层（低）② 层溶解（低）③ 距离淡出（中）④ Decal（中）⑤ 法线贴图通路（高、一次解锁 9+3 个参数）

### 后续项（阶段 3 之后）

用户在阶段 3 结项后指定了四项、按顺序做。

| # | 项 | 状态 |
|---|---|---|
| **A** | 自发光第二层 Emission 2nd | ✅ 完成（两层完全同构、抽出共用生成器）|
| **B** | 主色层 2nd/3rd 的层溶解 | ✅ 完成（11 个字段 × 2 层）|
| **C** | 主色层的距离淡出 | ✅ 完成（3 个标量 × 2 层）|
| **D** | 法线贴图通路 | ✅ 完成（2 张法线贴图 + 4 个 NormalStrength + MatCap 的 Lod/自定法线）|

**关键发现（都写进 CONFIG.md 了）**：

  · 层溶解和顶层 Dissolve **不是一回事**。
    顶层丢弃像素（alphaTest）、层溶解只把这一层的 alpha 乘 0/1。
    边缘颜色是**加算到 emissionColor**、不是画在颜色缓冲上。
  · `fd.depth` 的名字有误导。
    `lilHeadDirection` 的定义就是 `lilViewDirection`、是 VR 头显时代的命名。
    ⇒ `fd.depth` = **到相机的距离**、不是「到头部骨骼」。
  · 层内处理顺序：遮罩 → 层溶解 → 距离淡出 → 剔除
    （lil_common_frag.hlsl:697 → :706 → :742 → :743）

**⚠️ 纠正**：之前说「9 个参数有开关没通路」、**其中 2 个（_Main2nd/3rdNormalStrength）根本不存在**。
逐个 grep 之后确认是 **7 个**、D 已完成其中的 4 个（Rim / 背光 / MatCap 1st / 2nd）。
剩下 3 个是**三层阴影**的（`_Shadow{,2nd,3rd}NormalStrength`）、面板有滑杆但着色器未接。
原因：它们要喂给**明暗分档的计算**、而分档是 three 在做、要接就得替换 three 的分档、单独立项。

**D 的收尾（本轮）**：

  ✅ `_MatCapLod` —— 贴图 LOD bias（GLSL 的 texture2D 第 3 个参数）
  ✅ `_MatCapCustomNormal` + `_MatCapBumpMap` + `_MatCapBumpScale` —— MatCap 专用第三张法线图（2 层各一套）
  ⚠️ `_MatCapVRParallaxStrength` —— **参数存在、但非 VR 下是空操作**：
     `lil_common_macro.hlsl:689` 的 `lilBlendVRParallax` 在非 stereo 下直接 `return b;`
     ⇒ 浏览器里调它不会有任何变化、这是 lilToon 的设计、不是缺陷。
     面板保留了滑杆、标签写明「（非VR无效）」、只为和 lilToon 参数表对应。

**⇒ 至此 A / B / C / D **全部完成**、没有例外了。

**⇒ 面板规模：124 条目 / 14 分组**。

### 明确不做

Glitter、Audio Link、Fur / Gem / Tessellation、Lightmap / Light Probe、屏幕空间阴影、VRC Light Volumes

---

## 五、两个必须提前知道的事

1. **不会和你 Unity 里一模一样**
   three.js 的光照模型、色调映射、阴影处理都和 Unity 不同。参数抄得再准，最终也会有可见差异（尤其是**阴影的软硬**和**高光**）。目标是「一眼看过去是同一个角色的同一个画风」，而不是像素级一致。

2. **参数必须逐个材质抄**
   lilToon 是**逐材质**配置的。一个角色的脸、身体、衣服、头发可能是 4 个材质、4 套参数。
   如果材质多，建议**先只抄「皮肤」和「头发」两套**，这两块占观感的 80%。

---

## 六、源码核对结果（v1.3.7 实测）

### 6.1 源码地图（后续实现直接查这些位置）

| 文件 | 大小 | 作用 |
|---|---|---|
| `Shader/Includes/lil_common_frag.hlsl` | 84 KB | **着色核心**：背光 / MatCap / Rim / 自发光 / Glitter 都在这里 |
| `Shader/Includes/lil_common_functions.hlsl` | 43 KB | 工具函数：**分档 / 混合 / MatCap UV / 描边宽度** |
| `Shader/Includes/lil_common_macro.hlsl` | 94 KB | 宏与关键字开关（`LIL_FEATURE_*`） |
| `Shader/Includes/lil_common_input.hlsl` | 27 KB | 属性 → uniform 的映射 |
| `Shader/Includes/lil_vert_outline.hlsl` | 1.8 KB | 描边顶点位移 |
| `Shader/lts.shader` | 46 KB | **Properties 段：182 个属性**（第 3~578 行） |
| `Editor/lilInspector.cs` | 452 KB | 面板结构定义 |
| `Editor/Resources/lang.txt` | 60 KB | 面板项名称（多语言） |

**关键函数行号**（`lil_common_frag.hlsl`）：

```
lilGetMain2nd      671      lilGetMain3rd      757
lilBacklight      1107      lilGetMatCap      1391 / 1440
lilGetMatCap2nd   1459      lilGetRim         1517 / 1607
lilGlitter        1632      lilEmission       1689 / 1744
lilEmission2nd    1774
```

**关键函数行号**（`lil_common_functions.hlsl`）：

```
lilTooningNoSaturateScale   21 / 33   ★ 分档的数学本体
lilBlendColor              306        ★ 混合模式
lilGetOutlineWidth      254 / 265     lilCalcMatCapUV   526  ★
lilGetOutlineVector        272        lilCalcOutlinePosition 279
lilCalcDissolve         602 / 642     lilCalcGlitter   1074
```

### 6.2 分档（阴影 / Rim 共用）—— **比想象中简单得多**

```hlsl
// 无模糊：就是硬台阶
float lilTooningNoSaturateScale(float aascale, float value, float border) {
    return step(border, value);
}

// 有模糊：把 value 在 [border-blur/2, border+blur/2] 上线性重映射到 [0,1]
float lilTooningNoSaturateScale(float aascale, float value, float border, float blur) {
    float borderMin = saturate(border - blur * 0.5);
    float borderMax = saturate(border + blur * 0.5);
    return (value - borderMin) / saturate(borderMax - borderMin);
}
```

**是线性重映射，不是 smoothstep。** 外层 `lilTooningScale()` 再 `saturate()` 一次。
我们的 `celGradientGLSL` 现在用的是「`floor(t*STEPS)/(STEPS-1)` 量化」——**换成这个重映射就能直接对齐 lilToon 的观感**。

### 6.3 混合模式 `lilBlendColor` —— 全部只有 8 行

```hlsl
float3 lilBlendColor(float3 dstCol, float3 srcCol, float3 srcA, uint blendMode) {
    float3 ad = dstCol + srcCol;
    float3 mu = dstCol * srcCol;
    float3 outCol;
    if(blendMode == 0) outCol = srcCol;               // Normal
    if(blendMode == 1) outCol = ad;                   // Add
    if(blendMode == 2) outCol = max(ad - mu, dstCol); // Screen
    if(blendMode == 3) outCol = mu;                   // Multiply
    return lerp(dstCol, outCol, srcA);
}
```

→ 任何特性（Rim / MatCap / 自发光）的「ブレンドモード」都用这一个函数，移植成本极低。

### 6.4 MatCap —— 简化式就写在源码注释里

```hlsl
// lil_common_functions.hlsl:526 lilCalcMatCapUV()
// Simple  ← 源码自己的注释
//return mul((float3x3)LIL_MATRIX_V, normalWS).xy * 0.5 + 0.5;

// 完整版（多了 VR 视差 / Z 轴旋转取消 / UV 混合）
float2 uvMat = mul(tbnVD, normalWS).xy;
uvMat = lerp(uvMat, uv1*2-1, matcapBlendUV1);
uvMat = uvMat * matcap_ST.xy + matcap_ST.zw;
uvMat = uvMat * 0.5 + 0.5;
```

采样与混合（`frag.hlsl:1440`）：

```hlsl
matcap = SAMPLE(_MatCapTex, uvMat).rgb;
fd.col.rgb = lerp(fd.col.rgb, _MatCapMul ? fd.col.rgb * matcap : fd.col.rgb + matcap, fd.triMask.r);
```

→ **约 5 行 GLSL。这是性价比最高的一项。**

### 6.5 Rim Light —— 精确公式

```hlsl
float nvabs = abs(dot(N, V));
float rim    = pow(saturate(1.0 - nvabs), _RimFresnelPower);
float lnRaw  = dot(L, N) * 0.5 + 0.5;                                  // 半 lambert
float lnDir  = saturate((lnRaw + _RimDirRange) / (1.0 + _RimDirRange));      // 受光侧
float lnIndir= saturate((1.0 - lnRaw + _RimIndirRange) / (1.0 + _RimIndirRange)); // 背光侧

float rimDir   = lerp(rim, rim * lnDir,   _RimDirStrength);
float rimIndir = rim * lnIndir * _RimDirStrength;

rimDir   = lilTooningScale(_AAStrength, rimDir,   _RimBorder,   _RimBlur);   // 同一套分档
rimIndir = lilTooningScale(_AAStrength, rimIndir, _RimIndirBorder, _RimIndirBlur);
rimDir   = lerp(rimDir,   rimDir   * fd.shadowmix, _RimShadowMask);          // 可被阴影压暗
rimIndir = lerp(rimIndir, rimIndir * fd.shadowmix, _RimShadowMask);

// 混合
fd.col.rgb = lilBlendColor(fd.col.rgb, rimColor.rgb * rimLightMul, rimDir * rimColor.a, _RimBlendMode);
fd.col.rgb = lilBlendColor(fd.col.rgb, rimIndirColor.rgb * rimLightMul, rimIndir * rimIndirColor.a, _RimBlendMode);
```

**Rim 是双色的**：`_RimColor`（受光侧）+ `_RimIndirColor`（背光侧），各带独立的 Border / Blur。

### 6.6 阴影的层次

从 `frag.hlsl:872` 起可以看到 lilToon 的阴影是**三层**，每层独立控制：

```
lns.x / lns.y / lns.z        ← 1st / 2nd / 3rd 阴影
_ShadowReceive / _Shadow2ndReceive / _Shadow3rdReceive    ← 每层是否接收投射阴影
_ShadowBlur / _Shadow2ndBlur / _Shadow3rdBlur             ← 每层的过渡宽度
_ShadowBlurMask (r/g/b)      ← 用贴图逐像素调过渡宽度
_ShadowBorderMask + _ShadowAOShift                        ← 用贴图逐像素调边界（AO）
```

→ 我们的 `celSteps / celDark` 相当于**只有 1st 层**。要做到 lilToon 的观感，**至少要 3 层 + 每层独立颜色与边界**。

### 6.7 核对之后的结论修正

| 项 | 原判断 | 核对后 |
|---|---|---|
| 分档数学 | smoothstep | **线性重映射**（更简单，也更好对齐） |
| MatCap | 低难度 | **极低难度**（源码注释直接给了简化式） |
| 混合模式 | 🟡 中等 | **✅ 极低**（8 行，一个函数通吃） |
| Rim | 低难度 | **低难度**，但要留意**双色 + 受光/背光分离** |
| 阴影 | 未细看 | **三层结构**，工作量比预想大，但公式本身简单 |

---

## 七、阶段 1 完成度与缺口清单（源码逐项核对）

### 7.1 一个关键机制：遮罩默认来自**顶点色**

lilToon 里 Rim / MatCap / 自发光的"遮罩"**默认不是贴图**，而是**网格顶点色的三个通道**：

```hlsl
fd.triMask.r   →  MatCap 的混合权重
fd.triMask.g   →  Rim 的混合权重
fd.triMask.b   →  自发光的混合权重（闪烁序列也乘它）
```

（`lil_common_frag.hlsl:1446` MatCap，`:1614` Rim，`:1756` 自发光，）

所以预设里 `_UseRim` 之类默认都是 0 —— 效果**由顶点色逐部位控制**。这也意味着：**支持顶点色遮罩 = 支持 lilToon 最常用的工作流**。

### 7.2 逐项缺口

| # | 项 | 已实现 | 还缺（含源码依据）|
|---|---|---|---|
| **①** | 分档 | 线性重映射。三层独立颜色/边界/过渡。| `_ShadowBorderRange`（第 5 参：额外收窄过渡带）· `_ShadowMainStrength`（对比度）· `_ShadowNormalStrength` · **`_ShadowReceive / 2ndReceive / 3rdReceive`**（每层是否接收投射阴影）|
| **②** | Rim | 双色。Border/Blur。FresnelPower。DirStrength/Range。BlendMode。| **顶点色 G 通道遮罩**。· `_RimColorTex`（贴图遮罩，）· `_RimMainStrength`（与 albedo 混合，）· `_RimNormalStrength` · `_RimShadowMask`（在投影里压暗）|
| **③** | MatCap | 视角空间 UV。贴图。加色/乘色。BlendMode。| **顶点色 R 通道遮罩**。· `_MatCapColor` · `_MatCapMainStrength` · `_MatCapNormalStrength` · `_MatCapShadowMask` · 2nd/3rd 槽位 |
| **④** | 自发光 | 材质级颜色。强度。BlendMode。| **`_EmissionMap` 贴图**。· **顶点色 B 通道遮罩**。· `_EmissionBlendMask` · `_EmissionMainStrength` · `_Emission2nd` · 闪烁/荧光（`_EmissionFluorescence`，）|
| ⑤ | 背光 | 双色。Border/Blur。Directivity。ViewStrength。| `_BacklightColorTex` · `_BacklightMainStrength` · `_BacklightReceiveShadow` |

### 7.3 建议的实现顺序（按"像不像 lilToon"排）

1. **顶点色遮罩（triMask）** —— 一次改动同时让 Rim / MatCap / 自发光三者的遮罩都成立。需要：材质开 `vertexColors`。+ 在注入的 GLSL 里读 `vColor`。⚠️ 但注意：BA 那批 GLB **没有顶点色**，（VRChat 模型才有）—— 需回退成"没有顶点色时遮罩恒为 1"。
2. **三个 MainStrength**（与 albedo 混合，）—— 各 1 行。3. **`_RimShadowMask` / `_MatCapShadowMask`** —— 需要拿到 shadowmix，要接 lights_fragment_begin，4. **`_ShadowReceive / 2nd / 3rd`** —— 影响投射阴影与分档的叠加方式。5. **`_EmissionMap` / `_RimColorTex` / `_EmissionBlendMask`** —— 需要多张贴图 uniform，配置项要扩。6. **`_ShadowBorderRange` / `_ShadowMainStrength` / `_ShadowNormalStrength`**

### 7.4 一个待拍板的问题

我的默认值和 lilToon 预设**差得比较远**，：

| 参数 | 我的默认 | lilToon 常见值 |
|---|---|---|
| `shadowBorder` | 0.5 | **0.1** |
| `shadowBlur` | 0.1 | **0.005 ~ 0.15** |
| `rim.fresnelPower` | 1.0 | **1 ~ 3.5** |
| `shadowColor` | [0.82, 0.76, 0.85] | 皮肤 [0.925, 0.70, 0.74] · 头发 [0.60, 0.65, 0.75] |

`shadowBorder` **0.5 → 0.1 是质变**，0.5 意味着"一半受光才算亮"（阴影面积很大，）
0.1 才是动漫渲染那种"大面积受光 + 边缘一圈影"。→ 待定：**是否把默认值改成 lilToon 的实际值**，（会改变现在的观感，）


---

## 8. 描边（Outline）完整规格 —— 源码级

> 与 `Hidden/lilToonOutline` 的关系：那是编辑器从主着色器**生成**的变体（源码里没有独立文件）。
> 描边的全部属性都在 `lts.shader` 里（474~556 行），渲染时走独立的一趟 pass。

### 8.1 顶点位移

链路：`lil_vert_outline.hlsl`（29 行、只是调度）
     → `lil_common_functions.hlsl:279 lilCalcOutlinePosition`
     → `lil_common_functions.hlsl:254/265 lilGetOutlineWidth`

```hlsl
// lil_common_functions.hlsl:254
float lilGetOutlineWidth(uv, color, outlineWidth, outlineWidthMask, outlineVertexR2Width) {
    outlineWidth *= 0.01;                                   // ★ 1/100
    #if LIL_FEATURE_OutlineWidthMask
        outlineWidth *= SAMPLE(outlineWidthMask, uv).r;     // 遮罩取 R 通道
    #endif
    if (outlineVertexR2Width == 1) outlineWidth *= color.r; // 顶点色 R 当宽度
    if (outlineVertexR2Width == 2) outlineWidth *= color.a; // 顶点色 A 当宽度
    return outlineWidth;
}

// lil_common_functions.hlsl:265
float lilGetOutlineWidth(positionOS, positionWS, uv, color, ...outlineFixWidth) {
    outlineWidth = <上面那个>;
    // ★ 关键：世界单位 ↔ 屏幕恒定粗细的混合
    outlineWidth *= lerp(1.0, saturate(length(lilHeadDirection(positionWS))), outlineFixWidth);
    return outlineWidth;
}

// lil_common_functions.hlsl:279
void lilCalcOutlinePosition(inout positionOS, uvs, color, normalOS, tbnOS, ...) {
    float3 positionWS = <M 矩阵 × positionOS>;
    float width = lilGetOutlineWidth(...);
    float3 outlineN = normalOS;
    #if LIL_FEATURE_OutlineVectorTex
        outlineN = lilGetOutlineVector(tbnOS, uvs[outlineVectorUVMode], outlineVectorScale, outlineVectorTex);
    #endif
    if (outlineVertexR2Width == 2) outlineN = mul(color.rgb * 2.0 - 1.0, tbnOS);
    positionOS += outlineN * width;
    float3 V = <透视> ? lilViewDirectionOS(positionOS) : <正交>;
    positionOS -= normalize(V) * outlineZBias;
}
```

`lil_common_macro.hlsl`:
- `614 lilHeadDirection(positionWS) = _WorldSpaceCameraPos - positionWS`
  ⇒ `length(...)` 就是**顶点到相机的距离**。
- `646 lilViewDirectionOS(positionOS) = 相机在对象空间的位置 - positionOS`

**⇒ `_OutlineFixWidth` 的语义**：
| 值 | factor | 效果 |
|---|---|---|
| 0 | 1.0 | 宽度是**世界单位**（远处看起来更细） |
| 1 | saturate(距离) | 宽度**屏幕上恒定**（透视下乘距离恰好抵消） |
| 0.5（默认）| 两者插值 | 折中 |

### 8.2 片元着色

`lil_common_frag.hlsl:349-387`：

```hlsl
fd.col = SAMPLE(_OutlineTex, uv);                       // 若启用、否则白
fd.col.rgb = lilToneCorrection(fd.col.rgb, _OutlineTexHSVG);   // 若启用
float3 outlineLitColor  = _OutlineLitApplyTex ? fd.col.rgb * _OutlineLitColor.rgb : _OutlineLitColor.rgb;
float  outlineLitFactor = saturate(NdotL * _OutlineLitScale + _OutlineLitOffset) * _OutlineLitColor.a;
// 若 _OutlineLitShadowReceive、再 *= fd.attenuation
fd.col.rgb = lerp(fd.col.rgb * _OutlineColor.rgb, outlineLitColor, outlineLitFactor);
fd.col.a  *= _OutlineColor.a;
```

**默认 `_OutlineLitColor.a = 0`** ⇒ `outlineLitFactor = 0` ⇒ **就是 `贴图 × _OutlineColor`**。
受光是可选的高级功能。

### 8.3 全部属性与默认值（lts.shader:474-556）

| 属性 | 含义 | 默认 |
|---|---|---|
| `_OutlineColor` | 描边颜色 | (0.6, 0.56, 0.73, 1) |
| `_OutlineTex` | 描边贴图 | white |
| `_OutlineTexHSVG` | 色相/饱和/明度/Gamma | (0,1,1,1) |
| `_OutlineLitColor` | 受光色 | (1.0, 0.2, 0, **0**) |
| `_OutlineLitApplyTex` | 受光是否乘贴图 | 0 |
| `_OutlineLitScale` | 受光强度 | 10 |
| `_OutlineLitOffset` | 受光偏移 | -8 |
| `_OutlineLitShadowReceive` | 受光是否收阴影 | 0 |
| `_OutlineWidth` | 宽度 Range(0,1) ⚠️ [lilOLWidth] | 0.08 |
| `_OutlineWidthMask` | 宽度遮罩贴图 | white |
| `_OutlineFixWidth` | 固定宽度 Range(0,1) | 0.5 |
| `_OutlineVertexR2Width` | 顶点色当宽度：0 None / 1 R / 2 RGBA | 0 |
| `_OutlineVectorTex` | 法线向量贴图 | bump |
| `_OutlineVectorUVMode` | UV0..UV3 | 0 |
| `_OutlineVectorScale` | -10~10 | 1 |
| `_OutlineEnableLighting` | Range(0,1) | 1 |
| `_OutlineZBias` | Z 偏移 | 0 |
| `_OutlineDisableInVR` | | 0 |
| `_UseOutline` | 总开关 | 0 |
| `_OutlineCull` | Cull：0 Off / 1 Front / 2 Back | 1 |
| `_OutlineSrcBlend` / `DstBlend` / `SrcBlendAlpha` / `DstBlendAlpha` / `BlendOp` / `BlendOpAlpha` | 独立混合 | 1/0/1/10/0/0 |

### 8.4 three.js 实现路径（我们的移植方案）

```
① 载体：每个网格追加一份**克隆材质**（共享 geometry、side = THREE.BackSide）
   或用第二个 Mesh 子节点、共享 geometry、克隆材质。
   —— 为什么不用 OutlineEffect：它参数只有 thickness/color/alpha。
      加不了宽度遮罩 / 顶点色宽度 / 固定宽度 / Z Bias / 受光。

② 顶点位移：onBeforeCompile 注入在 #include <begin_vertex> 之后
   vec3 outlineN = objectNormal;                      // 顶点属性里的法线
   float ow = uOutlineWidth * 0.01;
   ow *= <遮罩采样 .r>;                                // 若启用
   ow *= <color.r 或 color.a>;                        // _OutlineVertexR2Width
   ow *= mix(1.0, saturate(dist), uOutlineFixWidth);  // dist = -mvPosition.z
   transformed += outlineN * ow;
   transformed -= normalize(cameraPosOS - transformed) * uOutlineZBias;

③ 片元：输出 uOutlineColor × 贴图（默认路径）
   受光部分按 8.2 的公式、需要 NdotL → 用 toon 的同一套光照。

④ 渲染状态：side = BackSide、depthWrite = true。
   —— 与 OutlineEffect 的反壳思路一致、但参数完全自己控制。

⑤ FBX 为什么原来不对（三个候选原因、实现时逐一验证）
   · FBX 单位缩放不是 1 → 世界单位外扩失效 → 用 _OutlineFixWidth 语义可解
   · FBX 硬边法线 → 外扩出现裂缝 → 需要平滑法线
   · FBX 蒙皮 → 反壳与主渲染不一致
```

### 8.5 待办

- [ ] 实现描边材质与顶点位移
- [ ] 接入 lilToon 参数面板（宽度 / 遮罩 / 顶点色 / 固定宽度 / Z Bias / 颜色 / 受光）
- [ ] 接入预设（预设里 `_OutlineWidth` 等值填入 LIL_PRESETS）
- [ ] GLB 与 FBX 双验证
- [ ] 决定是否替换掉现有的 OutlineEffect 路径


---

## 9. 预设是**按材质**的 —— 架构改造方案

> 观察（用户 2026-10-05）：lilToon 的预设支持**按材质分别选择**，所以才有
> 皮肤 / 头发 / 衣服 / 无机 / 自然 这几个大类。用法是：
>   · 皮肤的材质槽  → 套 Skin-*
>   · 衣服的材质槽  → 套 Cloth-*
>   · 头发的材质槽  → 套 Hair-*
> （实际上多数人不会去逐个调，但这是 lilToon 预设的本来设计）

### 9.1 现状的问题

我们现在是**全局唯一一份 `lilCfg`**：

```js
applyLilPreset('Skin-Anime')   // → 整个模型（含头发/衣服）全被套成皮肤预设。
```

这与 lilToon 的语义不符。

### 9.2 改造方案（推荐：全局默认 + 按材质覆盖）

```js
lilCfg                       // 全局默认（现有结构不变）
lilCfgByMaterial = {         // ★ 新增：按材质名覆盖
  'Melano_hair_MT_Toon': { shadowBorder: 0.05, rim: { blend: 1, ... } },
  'Melano_cloth_MT_Toon': { shadowBorder: 0.3 },
}
```

**生效点**：`patchToonMaterial(mat)` 里按 `mat.name` 查覆盖表。
浅合并到全局之上、于是：

```
最终参数 = { ...lilCfg, ...lilCfgByMaterial[mat.name] }
```

**cacheKey 要带上材质名**、否则不同材质的程序会被复用、参数就串了。
（现在的 key 是 `ba3d-cel:<version>:<shaderMode>:...`、要加 `:<matName>`）

### 9.3 界面改动

面板顶部加一个**材质选择器**：

```
材质  [ 全部（默认） ▾ ]     ← 默认：改的是全局 lilCfg
      [ Melano_hair_MT_Toon ]
      [ Melano_cloth_MT_Toon ]
      [ Melano_Body_MT_Toon ]
      ...

预设  [ 头发 · 描边+Rim ▾ ]  ← 套用到**上面选中的材质**（不是全局）
```

- 选「全部」→ 改 `lilCfg`（现在的行为、适合"我就想整体调一下"）
- 选某个材质 → 改 `lilCfgByMaterial[名字]`、面板滑杆显示的是**合并后**的值。
- 预设下拉的选项可以**按材质名自动筛类**（名字含 hair → 只列头发系）
  —— 但保留全部选项、用户可能想手动指定。

### 9.4 导出配置

```jsonc
"lilToon": { /* 全局默认 */ },
"lilToonByMaterial": {
  "Melano_hair_MT_Toon": { "shadowBorder": 0.05 }
}
```

导出时按默认值做 diff、只写变了的项（和现有 exportConfig 语义一致）

### 9.5 实施顺序建议

1. `lilCfgByMaterial` 数据结构 + `patchToonMaterial` 里的合并 + cacheKey 加材质名
2. API：`getLilConfig(matName)` / `setLilConfig(obj, matName)`
3. 面板：材质选择器 + 预设套用目标跟着变
4. 导出 / 导入支持 `lilToonByMaterial`

### 9.6 附注

- 材质名匹配建议**用派生材质的名字**（`Melano_hair_MT_Toon`、带 `_Toon` 后缀）
  或统一剥掉后缀再匹配、避免重建后名字变了对不上。
- 也可以支持**按网格名**匹配（`melano_hair`）—— 某些模型材质名不够语义化。
  两者都支持更稳、优先级：材质名 > 网格名。
