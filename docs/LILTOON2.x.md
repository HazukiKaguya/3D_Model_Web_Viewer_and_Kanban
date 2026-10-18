# lilToon 2.3.4 → Web (three.js) 移植基线

中文 ｜ [English](LILTOON2.x.en.md) ｜ [日本語](LILTOON2.x.ja.md)

> **本文档是当前生效的基线**。
> 旧基线（**1.3.7**）的对照表与核对记录见 [`LILTOON1.x.md`](LILTOON1.x.md)。
> 实现细节与全部配置键见 [`CONFIG.md`](CONFIG.md)。

---

## 零、基线的定义

| 项 | 值 |
|---|---|
| **基线版本** | **lilToon 2.3.4** |
| **源码路径** | `develop_res/liltoon-2.3.4/`（旧基线在 `develop_res/lilToon/`、保留作对照）|
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

## 五、必须提前知道的几件事

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

## 六、对比方法（可复现）

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

## 七、已知偏差清单（诚实记录）

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

## 八、参考

| 文件 | 内容 |
|---|---|
| [`LILTOON1.x.md`](LILTOON1.x.md) | 旧基线（1.3.7）与当前基线的对照、描边（Outline）完整规格、预设按材质的架构方案 |
| [`CONFIG.md`](CONFIG.md) | 全部配置键、实现细节、每轮的坑与教训 |
| `viewer.js` | 93 处行号引用、已全部对齐 2.3.4 |
| `develop_res/liltoon-2.3.4/` | 当前基线源码 |
| `develop_res/lilToon/` | 旧基线源码（保留作对照）|

---

## 九、2026-10-10 本轮：风格后端亮度语义对齐（滚动记录）

「lilToon 风格」后端与对照后端（lilToon 源码移植）此前有两处肉眼可见的亮度偏差；
本轮把风格端的**光照合成 / 输出处理 / 基础色来源**按对照端的实际语义对齐。

### 9.1 改动要点

| 项 | 之前的做法 | 现在的做法 |
|---|---|---|
| 直接光 | 逐灯求和的 Lambert 项，再乘一个经验补偿 | **取首盏方向光**，`clamp(主光 + 环境, 下限, 上限)`，**单次** `A × 光色 × R` 合成 |
| 经验补偿 | 合成里带一个 `1.65` 系数 | 该路径**不再使用**它（默认值本身未改；未改模式的旧通路保留） |
| 基础色 | 与对照端**不对称**（一侧多乘一遍材质基础色） | 由「有效配置 → 配置映射 → vendor 运行默认」推导，与主贴图、主色层一起合成 |
| 输出 | 页面色调映射（`LinearToneMapping`，曝光 1.15） | 保留；对齐后受光区的大面积近白裁切消失 |
| 首次加载 | 只走风格路径时不会装载桥接模块 | 首次进入风格后端时**顺带装载模块**（只加载，不切换渲染后端） |

### 9.2 实测（黑底 α 合成，`L = .2126R + .7152G + .0722B`）

| 状态 | 全图平均绝对差 | 亮度差 > 12 占比 |
|---|---|---|
| 首页默认模型，纯默认 | 0.029 | 0.076 % |
| 首页默认模型，「皮肤 · 动画」全局预设 | 0.000074 | 0.00016 % |
| Melano（基准姿态） | 0.050 | 0.122 % |
| Melano，「皮肤 · 动画」全局预设 | 0.00067 | 0.0029 % |

判据：关键区域（头发 / 脸 / 外套 / 袜）平均绝对差 ≤ 3，全图亮度差 > 12 的像素占比 ≤ 1 %。

### 9.3 顺序（与上游一致）

法线 → 接收（receive）→ 普通档 `x/y/z` 与边界过渡档 `w` → 强度 → 各层色 →
主强度 → 取小 → 边界色 → 最终混合；`_UseShadow = 0` 时整段跳过。
阴影法线仍保持**无条件赋值**（默认强度 1 也要写），逐层分档含抗锯齿。

### 9.4 尚未验证（诚实记录）

- `_ShadowNormalStrength` 中间强度：滑块可写，对应的着色器分支尚未生效。
- 主色层第二/第三层启用分支未单独验证。
- 脸部阴影只核了**亮度**口径，**形状 / 过渡**的独立核对未做。
- 透明背景分支、其它模型、「指定材质」的预设目标未测。

---

## 十、2026-10-18 观感基准：Unity 侧条件（已核实）

参考工程：Unity **2022.3.22f1** · 项目 `Melano-Migrated` · 场景 `Melano_scene`（本机只读核实）。

| 项 | 值 | 依据 |
|---|---|---|
| 渲染管线 | **Built-in** | `ProjectSettings/GraphicsSettings.asset`：`m_CustomRenderPipeline: {fileID: 0}` · `m_SRPDefaultSettings: {}` |
| 颜色空间 | **Linear** | `ProjectSettings/ProjectSettings.asset`：`m_ActiveColorSpace: 1` |
| 后处理 / tone mapping | **无** | 全项目 grep：Assets/Scenes 里 0 个 `PostProcessVolume` / `Tonemapping`（postprocessing 包虽安装但未使用） |
| lilToon | **2.3.4** | `Assets/lilToon/package.json` |

**结论**：Unity 侧的 lilToon **不做材质级 tone mapping**；输出为「**线性着色 + 显示端 sRGB 变换**」。

对应到本仓库：

- 源码后端：`mat.toneMapped = false`（不跟随页面 tone mapping）+ **保留 sRGB 输出** ⇒ 与 Unity 语义一致。
- 我们的风格后端：本来就剥掉 `#include <tonemapping_fragment>` ⇒ 两个后端口径一致。
- 页面级 ACES 只作用于 **PBR / 原生材质**；不要让它影响卡通两条路径（上游 0.1.6+ 会跟随，必须显式关掉）。

### 描边（混合方案）

| 网格类型 | 由谁画 | 说明 |
|---|---|---|
| 蒙皮网格 | **上游**（`shaderVariant = Hidden/lilToonOutline` 等） | Unity 用的就是上游描边 ⇒ 更贴基准 |
| 静态网格 | **自研反壳** | 上游对静态网格的观感未验 |
| 名字带 `_Outline` 的壳网格 | **自研**（且不套上游） | 它本身就是外扩壳；再套上游会在 150× 缩放下膨胀成大片实体 |

⚠️ 实测：`_OutlineCull`、强制 `side = FrontSide` 对该膨胀**均无效**（像素几乎不变）⇒ 只能靠"排除壳网格"这一条。
