# lilToon 1.3.7 → Web (three.js) 旧基线对照（已归档）

**简体中文** ｜ [繁體中文](LILTOON1.x.zh-TW.md) ｜ [English](LILTOON1.x.en.md) ｜ [日本語](LILTOON1.x.ja.md) ｜ [한국어](LILTOON1.x.ko.md)

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

## 二、需要你从 Unity 抄给我的参数

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

## 三、建议的实施顺序

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

### 阶段 3 —— 已完成

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

### 明确不做

Glitter、Audio Link、Fur / Gem / Tessellation、Lightmap / Light Probe、屏幕空间阴影、VRC Light Volumes

---

## 四、两个必须提前知道的事

1. **不会和你 Unity 里一模一样**
   three.js 的光照模型、色调映射、阴影处理都和 Unity 不同。参数抄得再准，最终也会有可见差异（尤其是**阴影的软硬**和**高光**）。目标是「一眼看过去是同一个角色的同一个画风」，而不是像素级一致。

2. **参数必须逐个材质抄**
   lilToon 是**逐材质**配置的。一个角色的脸、身体、衣服、头发可能是 4 个材质、4 套参数。
   如果材质多，建议**先只抄「皮肤」和「头发」两套**，这两块占观感的 80%。

---

## 五、描边（Outline）完整规格 —— 源码级

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

## 六、预设是**按材质**的 —— 架构改造方案

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
