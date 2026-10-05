# lilToon 2.3.4 → Web (three.js) 移植基线

> **本文档是当前生效的基线**。
> 旧基线（**1.3.7**）的对照表与核对记录见 [`LILTOON1.x.md`](LILTOON1.x.md)。
> 实现细节与全部配置键见 [`CONFIG.md`](CONFIG.md)。

---

## 零、基线的定义

| 项 | 值 |
|---|---|
| **基线版本** | **lilToon 2.3.4** |
| **源码路径** | `liltoon-2.3.4/`（旧基线在 `lilToon/`、保留作对照）|
| **对标文件** | `Shader/lts.shader` —— 不透明的完整版 |
| **属性总数** | **517**（1.3.x 是 483）|
| **代码里的行号引用** | **93 处**、已全部迁移到 2.3.4（见 §5） |

### 为什么对标 `lts.shader` 而不是别的

`lilToon/Shader/` 下有 **61 个 shader 文件**、但它们是同一套逻辑的**变体**：

```
lts.shader          不透明完整版        ← 我们对标这个
lts_cutout / _trans / _trans_oo …       按渲染模式切的变体
ltsl_*                                  lite 版（属性少一半）
ltsmulti_*                              多材质变体
lts_fur / _gem / _tess / _ref           独立特性（Fur / Gem / 曲面细分 / 折射）
ltspass_*                               各 pass 单独拆出来的
```

⇒ 其余变体的属性是 `lts.shader` 的子集、或属于**独立特性**（Fur/Gem/Tess/Ref 是不同 shader、不是 lts 的属性）。

---

## 一、为什么可以换基线：对比结论

把两个版本逐项对比后的结论是 —— **向后兼容、几乎不用返工**。

| 对比项 | 结果 |
|---|---|
| **属性默认值** | 483 个共有属性里、**只有 `_lilToonVersion` 变了**（33 → 45）、其余**一个都没改** |
| **19 个官方预设** | **逐项数值完全一致**（0 处差异） |
| **我们移植过的公式** | **完全一致** |

### 逐个函数核对（用花括号配对抽出函数体、逐行比对）

| 函数 | 结果 |
|---|---|
| `lilBlendNormal` |、完全一致 |
| `lilBlendColor` |、完全一致 |
| `lilTooningNoSaturateScale` |、完全一致 |
| `lilToneCorrection` |、完全一致 |
| `lilCalcSpecular` |、完全一致 |
| `lilCalcMatCapUV` | ⚠️ 唯一差异：`lerp(uvMat, `**`saturate(uv1)`**`*2-1, matcapBlendUV1)` —— **我们没实现 `_MatCapBlendUV1`** ⇒ 不适用 |

⇒ **我们的 `LIL_PRESETS` 数据（从 `Presets/*.asset` 转的）仍然有效**、不用重新生成。

---

## 二、对比中发现并已修的 1 处

### `dissolveParams.xy = round(...)`

**2.3.4 新增**（`lil_common_functions.hlsl:638` 与 `:684`）：

```hlsl
dissolveParams.xy = round(dissolveParams.xy);   // mode, shape
```

⇒ **mode 与 shape 都要取整**（1.3.x 没有这行）

我们的情况：

| 参数 | 2.3.4 之前 | 2.3.4 |
|---|---|---|
| `mode` | 我们已 `Math.round` | — |
| `shape`（`_DissolveParams.g` / 我们的 `linear` 键）| `!== 0`、**没取整** | `round()` |

⇒ 后果：配置里写 `"linear": 0.5` 时、我们当成 **Line**、lilToon 会 `round(0.5) = 0` 即 **Point**。
⇒ 面板滑杆是 `step 1`、平时都是 0/1、**只在手写 JSON 时暴露**。
⇒ 已改成 `Math.round(num(D.linear, 1)) === 1`。

---

## 三、2.3.4 相对 1.3.x 的差异

新增 **68** 个属性、移除 **34** 个。

### 3.1 真新功能（我们没有）

| 功能 | 属性数 | 默认 | 说明 |
|---|---|---|---|
| **RimShade** | 7 | 0 | 新增的「边缘阴影」层、`_RimShadeColor` / `Mask` / `NormalStrength` / `Border` / `Blur` / `FresnelPower` |
| **IDMask** | 34 | 0 | 用 ID 控制溶解 / 隐藏部件、依赖 Unity 侧工具把 ID 烘到顶点或贴图 |
| **Dither** | 3 | 0 | 屏幕空间有序抖动、`_DitherTex` / `_DitherMaxValue`、配合 DistanceFade 用 |
| **DistanceFadeRim** | 3 | — | 距离淡出时加一圈彩色边缘光、`_DistanceFadeRimColor` / `FresnelPower`、另有 `_DistanceFadeMode` |
| **Main2nd/3rdTexAlphaMode** | 2 | 0 | 主色层自己的 **alpha** 混合模式（原来只有颜色 blend）|

### 3.2 Unity 专属、与我们无关

```
UDIM Discard                      20 个    Unity UDIM
Motion vectors                    多个     TAA / 运动矢量（TransformPreviousObjectToWorld 等）
Probe Volumes L1/L2                       Unity APV
VRC Light Volumes / Udon Light Volume
  ├ _EnvRimBorder / _EnvRimBlur（2 个）
  └ _UdonLightVolumeEnabled
```

### 3.3 移除的 34 个

```
资源加密：_IgnoreEncryption · _Keys · _BitKey0..31      ⇒ N/A（我们本来也没做）
```

---

## 四、2.3.4 源码地图

> **所有行号都是 `liltoon-2.3.4/Shader/Includes/` 下的**。
> 我们代码里的注释引用就是这些行号、已全部对齐。

### 4.1 工具函数（`lil_common_functions.hlsl`）

| 行 | 函数 | 我们用它做什么 |
|---|---|---|
| 11 | `lilIsIn0to1` | — |
| **26** | `lilTooningNoSaturateScale` | 卡通化的核心（3/4/5 参重载）、阴影分档 / Rim / 高光都用 |
| **135** | `lilBlendNormal` | Whiteout blend（2nd 法线）|
| **325** | `lilBlendColor` | 全部混合模式（Normal/Add/Screen/Multiply）、我们的 `ba3dBlend` |
| **347** | `lilToneCorrection` | 描边贴图的 HSV 校正 |
| **419** | `lilRotateUV` | 层溶解的 Line 形状 |
| **438** | `lilCalcUV` | UV 变换（ST + 滚动旋转）|
| **550** | `lilCalcMatCapUV` | MatCap 的 UV（含 ZRotCancel / Perspective）|
| **626** | `lilCalcDissolve` | 溶解 |
| **668** | `lilCalcDissolveWithNoise` | 溶解（带噪声）|
| **638 / 684** | `dissolveParams.xy = round(...)` | ★ 2.3.4 新增、见 §2 |

### 4.2 装饰层（`lil_common_frag.hlsl`）

**⚠️ 这些大多是 `#define OVERRIDE_*` 宏、不是函数**。

| 行 | 宏 / 函数 | 对应我们的 |
|---|---|---|
| 395 | `OVERRIDE_OUTLINE_COLOR` | 描边的受光 |
| 488 / 506 | `OVERRIDE_DISSOLVE` | Dissolve |
| 527 / 534 | `OVERRIDE_DITHER` | ★ 2.3.4 新增 |
| 566 / 573 | `OVERRIDE_NORMAL_1ST` | 1st 法线 |
| 585 / 598 | `OVERRIDE_NORMAL_2ND` | 2nd 法线（Whiteout）|
| 617 | `OVERRIDE_ANISOTROPY` | ❌ 未做 |
| 814 | `OVERRIDE_MAIN2ND` | 主色层 2nd |
| 910 | `OVERRIDE_MAIN3RD` | 主色层 3rd |
| 1192 | `OVERRIDE_SHADOW`（分档）| 阴影分档 + 三层法线强度 |
| 1222 / 1225 | `OVERRIDE_RIMSHADE` | ★ 2.3.4 新增 |
| **1267** | `OVERRIDE_BACKLIGHT` | 背光 |
| **1315** | `float3 lilCalcSpecular` | ★ 镜面高光 |
| **1437** | `perceptualRoughness - fd.smoothness` | ★ `roughness = (1 - _Smoothness)²` |
| **1510** | `OVERRIDE_REFLECTION` | ★ 反射（含高光混合）|
| **1578** | `OVERRIDE_MATCAP` | MatCap 1st |
| **1636** | `OVERRIDE_MATCAP_2ND` | MatCap 2nd |
| **1747 / 1750** | `OVERRIDE_RIMLIGHT` | Rim |
| **1888 / 1891** | `OVERRIDE_EMISSION_1ST` | 自发光 1st |
| **1955** | `OVERRIDE_EMISSION_2ND` | 自发光 2nd |
| **2057** | `OVERRIDE_DISTANCE_FADE` | 距离淡出 |

### 4.3 宏与光照（`lil_common_macro.hlsl`）

| 行 | 内容 | 说明 |
|---|---|---|
| **621** | `lilHeadDirection` | 头部方向（MatCap 视差用、非 VR 无效）|
| **696** | `lilBlendVRParallax` | ⚠️ 非 VR 下**直接返回 b**、参数无效 |
| **2079** | `LIL_CORRECT_LIGHTCOLOR_VS` | 光照夹取的宏 |
| **2081 / 2086** | `lightColor = clamp(lightColor, _LightMinLimit, _LightMaxLimit)` | ★ 光照夹取本体 |

### 4.4 装饰层的**顺序**（`lil_pass_forward_normal.hlsl`）

```
行 219 / 386   Dither            ★ 2.3.4 新增
行 251 / 446   Lighting
行 339         Layer Color（Main2nd / Main3rd）
行 446         Shadow
行 492         Backlight
行 520         **Reflection**    ★ 我们刚补的
行 527         MatCap
行 539         Rim light
             （RimShade、2.3.4 新增、在 Rim 之后）
行 554 / 560   Emission 1st / 2nd
```

完整顺序：

```
Anisotropy → AudioLink → Main2nd → Main3rd → Shadow → Backlight → 【Reflection】
→ MatCap → MatCap2nd → Rim → 【RimShade】→ Glitter → Emission1st → Emission2nd
（Dither 在最外围、作用在 fd.col.a 上）
```

### 4.5 其它关键位置

| 行 | 文件 | 内容 |
|---|---|---|
| **206** | `lil_common.hlsl` | `fd.perceptualRoughness = 1.0`（初值）|
| 1438 | `lil_common_frag.hlsl` | `fd.roughness = fd.perceptualRoughness * fd.perceptualRoughness` |

---

## 五、代码里的行号引用迁移（已完成）

`viewer.js` 里对 lilToon 源码有 **93 处精确行号引用**、基线换到 2.3.4 后**全部迁移完毕**。

### 迁移方法（可复现）

```js
// 1. 对一个文件的每一行、找出它属于哪个函数（用花括号配对求函数范围）
// 2. 在 2.3.4 的同名函数里、用「函数内偏移」算出新行号
//     newLine = nb.start + ( oldLine - fa.start )
// 3. 校验 newLine 仍落在 nb 的范围内、否则退回到 nb.start
// 4. 不是函数的、试 #define 宏（同名宏的起始行）
// 5. 既不是函数也不是宏的（注释 / #if 行）、用「该行的文本」在 2.3.4 里精确匹配
```

**结果**：`93 / 93` 全部命中、逐个复查**全部落在 2.3.4 的某个函数或宏范围内**。

### ⚠️ 迁移时踩的坑

**第一版脚本的正则只匹配了 `file.hlsl:NNN`**、于是：

```
lil_common_frag.hlsl:1189-1208   →   lil_common_frag.hlsl:1315-1208、只改了第一个
lil_common_frag.hlsl:1557 / :1499 →   lil_common_frag.hlsl:1557 / :1499、没改
```

⇒ 文件里出现**新旧混用**的引用。
⇒ **教训**：引用的形态不止一种（`A-B` 区间、`A / B` 并列、`A / :B`）。
   正则要把**整个引用组**吃掉、组内所有数字一起映射。
⇒ 修好后：**93 组、0 失败、0 落空**。

### 抽查（对着 2.3.4 核实）

| 我们写的 | 2.3.4 该行的实际内容 |
|---|---|
| `lil_common_frag.hlsl:1315` | `float3 lilCalcSpecular(inout lilFragData fd, ...)` |
| `lil_common_frag.hlsl:1557` | `matCapMask = LIL_SAMPLE_2D_ST(_MatCapBlendMask, ...)` |
| `lil_common_functions.hlsl:550` | `float2 lilCalcMatCapUV(float2 uv1, ...)` |

---

## 五点五、实施进度（滚动更新）

> 每完成一项就在这里记一笔、详细经过见 `archive/` 下对应的 `stage-*/MANIFEST.md`。

### 已完成

| 项 | 内容 | 归档 |
|---|---|---|
| **①** | 卡通镜面高光（`_ApplySpecular` / `_SpecularToon`）| `stage-20261006-0020-reflection-specular` |
| **③** | 光照上下限（`_LightMinLimit` / `_LightMaxLimit`）| `stage-20261005-2350-lightclamp-revert-v1` |
| **B1** | 每材质渲染状态（`_TransparentMode` / `_Cutoff` / `_Cull`）| `stage-20261006-0300-b1-cull-priority-fix` |
| **B2** | 主色 UV / 色调（`_MainTexHSVG` / `_MainTex_ScrollRotate`）| `stage-20261006-0445-b2-shared-time-uniform` |
| **A1** | 层 Alpha 模式（`_Main2nd/3rdTexAlphaMode`）| `stage-20261006-0530-a1-layer-alphamode` |
| **A3** | 抖动 Dither（`_UseDither` / `_DitherTex` / `_DitherMaxValue`）| `stage-20261006-0640-a3-accepted-dither-row-fix` |
| **B5** | Decal 贴花（`_Main2nd/3rdTexIsDecal` 及 6 个开关 + 图集动画 + ST）| `stage-20261006-0745-b5-decal` |

### ★★ 一个**顺带修掉的长期 bug**（影响面比 B5 大得多）

  做 B5 时用户做了一个关键实验：

      「参与光照比例」（enableLighting）默认 1 ⇒ **完全看不见**
      调到 0                                ⇒ **可见**

  ⇒ 一下把范围锁到「受光那条路径」上。

  ### 根因：three 的 toon 光照读的是 `material.diffuseColor`

  `lights_toon_pars_fragment`（three r160）：

      void RE_Direct_Toon( ..., const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
          reflectedLight.directDiffuse += irradiance * BRDF_Lambert( **material.diffuseColor** );   ← ★
      }
      void RE_IndirectDiffuse_Toon( ..., const in ToonMaterial material, ... ) {
          reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( **material.diffuseColor** ); ← ★
      }

  用的是那个 **struct `material` 的字段**、不是局部的 `diffuseColor`。

  ### 而我们一直写的是局部 `diffuseColor`

      diffuseColor.rgb = ba3dBlend( diffuseColor.rgb, ba3dLc.rgb, ba3dLc.a * el, bm );

  ⇒ 这句话在 `#include <lights_fragment_begin>` **之前** ⇒ 对**光照**毫无影响。
  ⇒ 而 `el = 1` 时 after 块又是 `srcA = a × (1-el) = 0` ⇒ **两边都不出力**。
  ⇒ ⇒ **「参与光照比例 = 1」（默认）时这一层彻底不可见**。
  ⇒ ⇒ 也就是说 **主色层 2nd / 3rd 在默认设置下一直画不出来**、功能实际是半废的。

  ### ✅ 修法

  生成器额外产出 `afterMaterial`、挂在 `#include <lights_fragment_begin>` **之后**：

      material.diffuseColor.rgb = mix( material.diffuseColor.rgb,
                                        ba3dColor2nd.rgb, ba3dColor2nd.a * 1.0000 );

  ⚠️ **必须在 include 之后** —— `material` 这个局部 struct 是在**那个 include 里面**被赋值的。
     写在它前面会被覆盖。
  ⚠️⚠️ **不能引用 `ba3dLc`** —— 它是 before 那个 `{ }` 块里的局部变量。
     而 afterMaterial 在块**外面** ⇒ GLSL 没有块外可见性 ⇒ 编译失败。
     ⇒ 用前导里声明过的 `ba3dColor2nd` / `ba3dColor3rd`。

  ⇒ 现在注入链是**三层**：

      lights_fragment_begin 之前   ⇒ before         （算层色 · 写 diffuseColor）
      lights_fragment_begin 之后   ⇒ afterMaterial  （喂 material.diffuseColor）★
      dithering_fragment 之前       ⇒ after          （未受光部分 / 溶解边缘）

  归档：`stage-20261006-1410-layer-enablelighting-material-diffusecolor`

### ★ B2 这一轮固化的 4 条教训（都很典型、值得单独记）

  ① **GLSL 没有函数提升** ⇒ 先用后声明编译不过
     生成器里的顺序必须是「旋转函数 → 滚动函数 → 调用」
     ⇒ `check-glsl.mjs` 已加「声明顺序」校验、（比对三个 index 的先后）

  ② **`applyLilConfig` 的顶层白名单只认数字** ⇒ vec4 数组被**静默丢弃**
     而且面板送来的是**稀疏补丁对象** `{0: 0.5}`（不是数组）
     ⇒ `lilSet` 用 reduce 逐层建对象 ⇒ 走到数组那层也建成了普通对象。
     ⇒ 必须按下标**合并** · 并同时支持数组（JSON 导入那条路）

  ③ **登记语句写在 `return` 之后** ⇒ 死代码
     ⚠️ `node --check` 不会报、语法完全合法。
     ⇒ 教训：**看到可疑代码就要修**、不要因为它不是当前的根因就留着
        （我当时看到了 · 判断「它不会阻止日志」就放过 · 结果它就是第二个 bug）

  ④ **「维护 shader 列表 + 事后改 `shader.uniforms`」不生效**
     three 构建程序时会对 uniforms 做处理 ⇒ 改不到真正上传的那份
     ⇒ 改成**共享同一个 uniform 对象** · 注入时挂引用而不是新建。

  ⇒ ①② 静态检查能抓（已加）、**③④ 抓不到**
  ⇒ 只能靠**按功能分组验收** —— 用户把「静态旋转 PASS / 时间相关 FAIL」分开报 ⇒
     一下就把范围缩到「时间」上。

### 已固化的检查器（`scripts/`）

    check-scope.mjs   作用域 / TDZ / HLSL 残留
    check-glsl.mjs    花括号平衡 · 嵌套函数 · HLSL-ism · 反斜杠 ·
                      一元加号 · JS 变量名写进 GLSL · 纹理 uniform 守卫 ·
                      **GLSL 函数声明顺序**（B2 新增）
    check-panel.mjs   缺逗号 · lg() 目标 · 孤儿注释 · groupify 位置 · K() 映射 ·
                      单一 groupifyLilPanel 调用 · 克隆块后缀 · 组白名单 ⊆ applyLilConfig

  ⚠️ **已知盲区**（B2 暴露的）：
     check-panel 只核对**组名**、不核对**顶层数组键** ⇒ B2 那次漏过去了。
     ⇒ 待补：LIL_CTRL 里所有顶层键的首段 ⇒
        必须能在 applyLilConfig 里找到处理路径（数字白名单 / 数组块 / 组白名单）

---
## 六、重新评估的实施顺序

### 已经完成的（覆盖率已对齐）

按 **19 个官方预设的启用率** 对照、常用的都做完了：

| 开关 | 预设启用率 | 我们 |
|---|---|---|
| `_UseShadow` | 14/19 | ✓ |
| `_UseRim` | 7/19 | ✓ |
| `_UseReflection`（含镜面高光）| 3/19 |、**刚补** |
| `_UseBacklight` | 2/19 | ✓ |
| `_UseMatCap` | 1/19 |、（还做了 2nd）|
| **真正 always-on 的** | — |、光照夹取那类已对齐 |

⇒ 其余（Main2nd/3rd、Bump、Emission、Dissolve、Parallax、Anisotropy …）
   在 19 个预设里**启用率都是 0**、属于「模型作者手动开」的功能。

### 阶段 A —— 2.3.4 新增里值得做的（建议）

| # | 项 | 属性数 | 工作量 | 理由 |
|---|---|---|---|---|
| ~~A1~~ ✅ | ~~Main2nd/3rdTexAlphaMode~~ **已完成 2026-10-06** | 2 | — | 层的 alpha 混合模式（0不改 1替换 2乘 3加 4减）· 只在 Cutout/Transparent 下生效 |
| **A2** | **DistanceFadeRim** | 3 | 小 | 我们有主色层的距离淡出基础、加几行即可、视觉明显 |
| **A3** | **Dither** | 3 | 小 | 只有配合 DistanceFade 才有意义（用抖动代替半透明）、WebGL 可做 |
| **A4** | **RimShade** | 7 | 中 | 独立的新效果层、要新写一个生成器（公式从 `lil_common_frag.hlsl:1222` 起）|
| **A5** | **IDMask** | 34 | 大 | ❌ **建议不做**、要靠 Unity 侧工具把 ID 烘到顶点/贴图、查看器里没有那套工具、34 个里大部分是「8 个 ID 各自的开关/序号/优先/位图」⇒ 那是工具界面 |

### 阶段 B —— 1.3.x 时代就缺、2.3.4 也没补的

按 **碰到概率** 排（都不是默认开、模型手动才用）：

| # | 项 | 说明 |
|---|---|---|
| ~~B1~~ ✅ | ~~每材质 `_TransparentMode` / `_Cutoff`~~ **已完成 2026-10-06** | 还多做了 `_Cull`（0双面 1正面 2背面）· 默认全 `-1 = 不改` ⇒ 零副作用 |
| ~~B2~~ ✅ | ~~主色贴图 HSV + 滚动~~ **已完成 2026-10-06** | `_MainTexHSVG` 全做（逐字移植 `lilToneCorrection`）· `_MainTex_ScrollRotate` 按方案 A（只改主色自己的 UV） |
| **B3** | **AlphaMask** | 隐藏部件（帽子下藏头发）|
| **B4** | **Parallax / POM** | 眼睛 / 衣服的立体感 |
| **B5** | **Decal**（`_Main2ndTexIsDecal` 一套）| 脸部贴花 / 腮红、lilToon 就这么做脸部装饰 |
| **B6** | **背面**（`_BackfaceColor` / `_BackfaceForceShadow` / `_FlipNormal`）| 双面头发 / 裙子 |
| **B7** | **Emission 渐变 LUT**（44 个属性）| 烘焙渐变、靠 Unity 工具生成 ⇒ 优先级低 |
| **B8** | **Anisotropy**（40 个属性）| 头发 / 拉丝金属、预设 0/19 ⇒ 优先级低 |

### 明确不做（维持原判）

```
Glitter（21 个）          —— 预设 0/19、但 VRChat 衣服闪粉偶有 · 可重新评估
AudioLink（20 个）        —— 静态查看器**原理上无法复现**（要有音乐流）
Lightmap / Light Probe / VRC Light Volumes —— 数据在 Unity 场景里、glTF 里根本不带
Fur / Tessellation / Gem / Refraction —— 是**独立 shader**（lts_fur / lts_gem / lts_tess / lts_ref）
                            不在 lts.shader 的属性里 ⇒ 超出我们的对标范围
IDMask（34 个）           —— 见 A5
```

---

## 七、必须提前知道的几件事

### 7.1 `_MatCapVRParallaxStrength` 在非 VR 下是空操作

`lil_common_macro.hlsl:696`：

```hlsl
float3 lilBlendVRParallax(float3 a, float3 b, float c) {
    #if defined(USING_STEREO_MATRICES)
        return lerp(a, b, c);
    #else
        return b;          // ← 非 VR 直接返回视线方向 · 强度参数没用上
    #endif
}
```

⇒ 浏览器里调它**不会有任何效果**、这是 lilToon 的设计、不是我们的缺陷。
⇒ 面板上保留只是为了和 lilToon 的参数表一一对应（标注了「（非VR无效）」）

### 7.2 遮罩默认来自**顶点色**

lilToon 的 `triMask`：

| 通道 | 用途 |
|---|---|
| R | MatCap 权重 |
| G | Rim 权重 |
| B | 自发光权重 |

⇒ **模型没有顶点色时自动回退成「权重恒为 1」**、不会让效果消失。
⇒ 面板有「顶点色」预览按钮、把顶点色直接当颜色渲染、用来确认遮罩分区。

### 7.3 `_Smoothness = 1` ⇒ `roughness = 0` ⇒ `pow(nh, +INF)`

```
perceptualRoughness = 1 - _Smoothness        （lil_common.hlsl:206 初值 1.0）
roughness           = perceptualRoughness²    （lil_common_frag.hlsl:1438）
```

**HLSL**：`1.0/0.0 = +INF`、`pow(nh, +INF)` 对 `nh<1` 返回 0、`nh>=1` 返回 1。
**GLSL**：**指数为无穷是未定义行为**。

⇒ 我们显式写成 `nh >= 1.0 ? 1.0 : 0.0`。

### 7.4 GLSL 与 HLSL 的矩阵方向不同

```
HLSL  mul(float3x3(a,b,c), v)  是**行点积**  ⇒ (dot(a,v), dot(b,v), dot(c,v))
GLSL  mat3(a,b,c) * v          是**列组合**  ⇒ 两者不同
```

⇒ 移植时直接写 `dot` 最不容易搞反、（`lilCalcMatCapUV` 就是一处）

### 7.5 ★★ three 的 toon 光照读 `material.diffuseColor`（不是局部 `diffuseColor`）

  ⚠️⚠️ 想让**受光结果**变化、必须改 **`material.diffuseColor`**（那个 struct 的字段）。
     改局部的 `diffuseColor` 只影响**后续阶段**（alpha / emissive / fog）、不影响光照。

      lights_toon_pars_fragment：
          reflectedLight.directDiffuse   += irradiance * BRDF_Lambert( material.diffuseColor );
          reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );

  ⚠️ 而且 `material` 是在 **`#include <lights_fragment_begin>` 里面**被赋值的 ⇒
     要改它必须写在那个 include **之后**。
  ⚠️ 挂在 include 之后的代码在**所有块之外** ⇒ 不能引用块内局部变量（如 `ba3dLc`）。
     要改用文件作用域/前导里声明过的变量（如 `ba3dColor2nd`）。

  ⇒ 这个坑让「主色层 2nd / 3rd」在默认设置下**完全不可见**、潜伏了很久。
     是 B5 期间靠用户的「enableLighting 调 0 才可见」这个实验才挖出来的。

### 7.5.5 ★ 描边有**两套系统**、状态必须共享

  ⚠️ lilToon 模式下走的是 **`applyLilOutline()` 的独立反壳网格**。
     而不是 three 的 `OutlineEffect`、两者各自有一套「跳过」规则：

      applyOutlineParams()  ⇒ 写 userData.outlineParameters.visible
                              （透明 / 地面 / 嘴部贴片 ⇒ false）
      applyLilOutline()     ⇒ 原来**只认配置里的 o.skipPattern**、完全不看 visible

  ⇒ 结果：「透明材质自动关描边」只对 three 的 OutlineEffect 有效。
     对 lilToon 的反壳描边**完全无效**。
  ⇒ 现象：切到 lilToon 风格 · 默认带描边、什么都不动 ⇒
     **透明材质被那层实心背面壳盖成了不透明**。

  ### 另外：描边壳**不能写深度**

  原来的描边材质 `depthWrite = true`、而它 `renderOrder = -1`（先画）
  ⇒ 深度先铺下 ⇒ 后面的半透明薄板**被深度剔除** ⇒ 那片区域看起来就「实」了。

  ⇒ 正确做法：源材质透明 ⇒ 描边材质也 `transparent` + **`depthWrite = false`**。
     （lilToon 是把描边当独立 pass、继承材质的 `_TransparentMode`）

  ### ⚠️ 而描边的 alpha **不来自材质**

      lil_common_frag.hlsl:389     fd.col.a *= **_OutlineColor.a**;

  ⇒ 描边色自带 alpha（面板上的「描边透明度」）、和主体材质无关。
  ⇒ 「跟着透明」体现在**混合 / 深度状态**、不是把 alpha 乘起来。

### 7.5.6 ★ 检查器自己也会踩「下标错位」

  ⚠️ `check-panel.mjs` 把**内联脚本**抽成 `codeLines`、同时保留整份 `html` 的 `L`。
     两者**下标差着 `base` 行**。

  原来的 ⑧ 号检查写成 `L[i]`、靠「脚本正好在文件开头附近」碰巧对上。
  ⇒ 一旦在脚本**之前**插内容（比如加日间主题的 CSS）、偏移就变 ⇒
     注释判定读到别的行 ⇒ **把生效的调用误判成被注释掉的** ⇒
     报「groupifyLilPanel() 有 0 处生效调用」、而代码其实是好的。

  ⇒ 修法：凡是要读原文的判定都用 `L[i + base]`。

  ⚠️ 教训：**检查器有 bug 时会报假问题、比不报更浪费时间**。
     看到「本来好好的突然报错」时、先怀疑检查器、再怀疑代码。

### 7.6 `onBeforeCompile` 拿到的是**未展开 `#include` 的原文**

three 在 `onBeforeCompile` **之后**才做 `resolveIncludes`。

⇒ 想改 three 内置 chunk 里的代码（如 `RE_Direct_Toon`）。
   **必须替换 `#include <xxx>` 指令本身**、拼上打过补丁的 chunk 文本。
⇒ 直接对 `shader.fragmentShader` 找 chunk 里的那一行**永远找不到**。

### 7.7 预设是**按材质**的

lilToon 的预设本来就是每个材质一份、我们的架构是「全局默认 + 按材质稀疏覆盖」。
详见 [`CONFIG.md`](CONFIG.md) 与 `LILTOON1.x.md` 第 9 节。

---

## 八、对比方法（可复现）

### 8.1 属性层面

两边 `lts.shader` 按 `[attr] _Name ("Label", Type) = default` 解析。

⚠️ **类型里可能有 `Range(0, 1)` 这种带括号的**、正则要用**贪婪的 `(.*)`**。
   否则 `_AsUnlit ("As Unlit", Range(0, 1)) = 0` 会匹配失败（多一个右括号）

### 8.2 预设层面

解析 `.asset` 的 `m_Floats` 段：

```
- name: _UseReflection
    value: 1
```

（`- name:` 与 `value:` 是**相邻两行**）

### 8.3 公式层面

按函数签名抽函数体（花括号配对）、逐行比对（忽略注释与空行）

### 8.4 行号映射

见 §5 的方法。

---

## 九、已知偏差清单（诚实记录）

| 项 | 情况 |
|---|---|
| `_MatCapVRParallaxStrength` | 非 VR 下是空操作、lilToon 本身如此 |
| UV1 / UV2 / UV3 | 未支持、面板下拉只给 `uv0` 和「视角球面」、选项上注明了 |
| 层溶解「UV」模式 | 用**网格 UV0**（= 图集）、角色上会切出碎块、**和 Unity 表现一致** |
| **Decal 的实用性** | ⚠️ 公式 / 注入 / 边缘 AA / 镜像 / 单侧 / 图集动画 **全部按 lilToon 忠实实现**、但**该模型缺少 Decal 用的 UV 布局** ⇒ 实际只能得到条纹、详见下 || `_ReflectionCubeTex` | 未做、Unity 靠 Reflection Probe、查看器里没有 ⇒ 只做了镜面高光那一路 |
| 非卡通路径的完整 GGX | 未做、`_SpecularToon` 默认 1 ⇒ 预设都走卡通路 ⇒ 给了足够接近的近似 |
| 光照夹取与 lilToon 的差异 | lilToon 的间接光也乘同一个 `lightColor` ⇒ 阴影里环境光被压下去、而 three 的环境光是**独立相加**的 ⇒ 下限拉很高时会比 lilToon 略亮、这是光照结构差异、不强行模拟 |
| cel 模式 | cel 与 lilToon 是**两条正交的轴**、每轮都验证 lilToon 侧改动没有污染 cel |

### ★ 关于 B5 Decal 的实用性（单独说明、避免误会）

  **Decal 不是「把一张图贴到脸上某个位置」的工具**、它是**给这一层的贴图换一套采样规则**：

      ① 换 UV 通道（通常 uv1）
      ② 镜像复制到另一半 / 只显示单侧（靠切线 w 的符号分区）
      ③ 图集帧动画（_Main2ndTexDecalAnimation）
      ④ 裁掉 decalUv.x 落在 [0,1] 之外的像素（带边缘抗锯齿）

  ⇒ 真正的「贴花」效果来自**模型/美术提供了一套为贴花准备的 UV**、而不是任意一张图。

  ### 为什么这个模型上只能看到条纹

      CH0155_Face   uv1.x ∈ [-0.53, 1.00]   uv1.y ∈ [-0.998, 1.00]
      CH0155_Body   uv1.x ∈ [-11.65, 12.10]
      CH0155_Hair   uv1.x ∈ [-13.27, 14.46]

  ⇒ `texture2D(tex, uv1)` 在 UV 空间里被**反复采样** ⇒ 条纹 / 带状。
  ⇒ 加上 Decal 的 AA 只留 `x ∈ [0,1]` 的一条竖带 ⇒ 就是看到的样子。
  ⇒ **Unity 里用同样的 UV1 + 同样的 ST 会出现一模一样的条纹**、不是我们的 bug。

  ### 「ST 缩放 / 偏移」在这里的实际用法

      ST 缩放 = (0.1, 0.1)  ⇒ 只取贴图 1/10 的一块 ⇒ 放大 10 倍铺在模型上
      ST 偏移 = (0.3, 0.5)  ⇒ 取哪一块

  ⇒ 可以用它做「取贴图一角铺满」、但**不是自由摆放**。
  ⇒ 「★Decal 调试 = 2」可以把 decal UV 直接输出成颜色、用来确认 UV 落在哪。

  ### 想真正做「在脸上画小贴图」需要什么

      · 模型要有一套**为贴花排布过的 UV 通道**（美术在建模时留的）
        例如把脸上所有可贴装饰的位置排成一张「贴花图集」
      · 每个位置占据图集里的一块 [u0,u1] × [v0,v1]
      · 然后用 _Main2ndTex_ST 把那一块放大到 [0,1]
      · 用 _Main2ndTexDecalAnimation 选帧

  ⇒ BA 系列的 uv1 显然不是这么排的 ⇒ 所以只能得到条纹。

---

## 十、参考

| 文件 | 内容 |
|---|---|
| [`LILTOON1.x.md`](LILTOON1.x.md) | 旧基线（1.3.7）的对照表、源码核对、阶段 1~3 的完成度、描边完整规格、预设按材质的架构方案 |
| [`CONFIG.md`](CONFIG.md) | 全部配置键、实现细节、每轮的坑与教训 |
| `viewer.js` | 93 处行号引用、已全部对齐 2.3.4 |
| `scripts/check-glsl.mjs` / `check-scope.mjs` / `check-panel.mjs` / `check-docs.mjs` / `make-deploy.mjs` / `check-layout.mjs` | 六个构建期检查器、都能双向验证、（`check-docs` 管「配置键 ↔ 文档」· `make-deploy --check` 管「部署目录 ↔ 清单」· `check-layout` 是**真·无头浏览器**跑布局） |
| `liltoon-2.3.4/` | 当前基线源码 |
| `lilToon/` | 旧基线源码（保留作对照）|
