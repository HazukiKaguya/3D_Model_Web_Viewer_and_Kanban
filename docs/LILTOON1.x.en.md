# lilToon 1.3.7 → Web (three.js) old-baseline comparison (archived)

[简体中文](LILTOON1.x.md) ｜ [繁體中文](LILTOON1.x.zh-TW.md) ｜ **English** ｜ [日本語](LILTOON1.x.ja.md) ｜ [한국어](LILTOON1.x.ko.md)

> ⚠️ **This document is archived** —— it records the comparison and verification of the **old baseline lilToon 1.3.7**.
> **The baseline currently in effect is 2.3.4**, see [`LILTOON2.x.en.md`](LILTOON2.x.en.md).
>
> Why this document is kept:
>   · the **completion records** of phases 1~3 and the judgment process at the time
>   · the **complete outline (Outline) specification** (source-level, still valid)
>   · the architecture rework plan for **per-material presets** (still valid)
>   · many derivations of "why it was done this way"; they were not rewritten during the migration.
>
> ⚠️ The **line-number references inside are 1.3.7's**; to look up the source, use the source map in LILTOON2.x.md §4.
# lilToon → Web (three.js) comparison table

> Purpose: to judge which of lilToon's effects can be reproduced in this viewer (three.js r160), and what inputs are needed.
>
> **Verified against the real source**: `lilToon/` (workspace, `jp.lilxyzw.liltoon` **v1.3.7**, Unity 2018.1+).
> The item-by-item judgments in section 2 come from reading through the source; section 6 gives the **exact formulas and file line numbers**.
> Panel item names are organized from 1.3.7's `Editor/` and `lts.shader`; if they do not match in your Unity, go by what you see.

---

## 1. Conclusion first

| Question | Conclusion |
|---|---|
| Can lilToon be **ported as a whole**? | ❌ **No.** It is Unity ShaderLab + HLSL, tens of thousands of lines split into dozens of `.cginc` files, and it depends deeply on the Unity runtime (multi-Pass, `UNITY_LIGHT_ATTENUATION`, Lightmap, Light Probe, screen-space shadows, MaterialPropertyBlock). There is no ready-made three.js port. |
| Can its **main look** be rewritten? | ✅ **Yes.** The core is "multi-band ramp + border color + Rim + MatCap + material-level emission/backlight + inverted-hull outline" —— these items account for the vast majority of what lilToon renders. |
| What is the biggest obstacle? | ⚠️ **Not technology, but parameters.** A GLB/FBX will not carry settings like "影の境界 = 0.5, リムライト強度 = 0.3, MatCap = `xxx.png`". The look can only come from "the parameters you copy over to me" or "a generic set of default values". |
| Can the textures be obtained? | ✅ Mostly yes: `MainColor` / `NormalMap` / `EmissionMap` / outline textures exist as texture files next to the model or embedded in the GLB. |

---

## 2. Parameters I need you to copy over from Unity

> Panel item names are organized from lilToon 1.7.x; if they do not match, go by what you see and just copy them over.
> **Leave blank** any item you are unsure about; I will fill it in with the default value.

### Basic information

```
lilToon version:           (1.7.x / 2.0.x / other)
Unity version:
This is:                   (VRChat アバター / ordinary model / scene object)
Model export format:       (FBX / GLB)
Effect currently seen on the Web:   (a screenshot is better)
Reference effect in Unity:          (a screenshot is better)
```

### 基本設定 (Basic Settings)

```
色:                       R__ G__ B__  /  #______
影の色:                   R__ G__ B__  /  #______
影の境界:                 0.__
影のぼかし:               0.__
2nd 影 enabled:           yes / no     color: ____  border: 0.__
3rd 影 enabled:           yes / no     color: ____  border: 0.__
バックライト:             color: ____  strength: 0.__
```

### メインカラー (Main Color)

```
テクスチャ:              (file name)
色:                      #______
ブレンドモード:          Normal / Add / Screen / Multiply / …
アルファマスク:          (file name; leave blank if none)
カットオフ:              0.__
```

### ノーマルマップ (Normal Map)

```
1st:                     (file name)  scale: 0.__
2nd / 3rd:               (file name; leave blank if none)
```

### リムライト (Rim Light)

```
enabled:                 yes / no
色:                      #______
border:                  0.__        blur: 0.__
direction:               light direction / view direction
mask:                    (file name; leave blank if none)
```

### マットキャップ (MatCap)

```
1st:                     (file name)  blend mode: ____
2nd / 3rd:               (file name; leave blank if none)
```

### エミッション (Emission)

```
1st:                     (file name)  color: #______  strength: 0.__
2nd:                     (file name; leave blank if none)
```

### アウトライン (Outline)

```
enabled:                 yes / no
色:                      #______
thickness:               0.___
basis:                   normal / position
texture:                 (file name; leave blank if none)
```

---

## 3. Recommended implementation order

Ordered by "visual payoff ÷ work", **in three phases**; after finishing each phase you can see the result directly:

### Phase 1 —— the four things that most improve the look

1. **Multi-band ramp + border color**: upgrade the current `celSteps/celDark` to "N bands + each band's own color + transition-band width"
2. **Rim Light**: view-angle rim light + color + border + mask
3. **MatCap**: 1st slot (view-space spherical sampling)
4. **Emission**: material-level emission + strength (skip the second one for now)

> All four of these fall within what `onBeforeCompile` can inject, do not touch the rendering architecture, and carry the lowest risk

### Phase 2 —— getting closer to lilToon

5. **Outline upgrade**: switch from `OutlineEffect` to your own inverted-hull pass → supports an **outline width texture** and **vertex-color control**
6. **Main Color's ブレンドモード** (Add / Screen / Multiply)
7. **Backlight / 逆光**
8. **Dissolve**

### Phase 3 —— completed

Two items were originally planned; in actual execution **you asked to skip the normal-map path first** (the highest cost) and to do "the others" instead:

**9. 2nd / 3rd main color layers + 2nd MatCap** —— ✅ done
- 2nd / 3rd main color layers, 8 items each (including ★ `_Main2ndEnableLighting`, which is the "**proportion** that participates in lighting" and needs injection in two places)
- MatCap 1st / 2nd, 11 items each (while at it, the 1st was given the color / backfaceMask / mainStrength that only the full version had)
- **3** mask-type textures (`_MatCapBlendMask` / `_MatCap2ndBlendMask` sample `.rgb`, `_EmissionBlendMask` samples RGBA)
  ⚠️ `_RimBlendMask` / `_BacklightBlendMask` **do not exist** (Rim uses vertex color G)
- ⏸ **2nd / 3rd ノーマルマップ** deliberately shelved
- ❌ Not done: Decal (7 items/layer), distance fade-out, layer dissolve (3 items/layer)

**10. Edge features such as Stencil** —— ✅ done
- Stencil: 8 items for the body + 8 for the outline, Unity enum → three constant mapping.
  ★ Precondition: the `renderer` must have `stencil: true` (three r160 defaults to false, and it cannot be added after the fact)
  ★ On the panel it is split into two groups, **「Stencil (model)」** (Stencil model) and **「Stencil (outline)」** (Stencil outline).
  ★ Plus a 「Stencil mode」 (Stencil mode) dropdown (4 modes, exported from lilInspector.cs; 2 of the names are counter-intuitive)
- The outline texture's `_OutlineTex_ST` / `_OutlineTex_ScrollRotate` / `_OutlineTexHSVG` —— ✅
- ❌ Not done: the second emission layer (Emission2nd, 7 items), emission GradSpeed / ParallaxDepth / Fluorescence

**⚠️ The knock-on cost of shelving the normal map** —— 9 parameters "have a switch but no path", so changing them has no effect.
`_Main2ndNormalStrength` / `_Main3rdNormalStrength` / `_MatCapNormalStrength` / `_MatCap2ndNormalStrength` /
`_RimNormalStrength` / `_BacklightNormalStrength` / `_ShadowNormalStrength` /
`_Shadow2ndNormalStrength` / `_Shadow3rdNormalStrength`

**Suggested follow-up order**: ① second emission layer (low) ② layer dissolve (low) ③ distance fade-out (medium) ④ Decal (medium) ⑤ normal-map path (high; unlocks 9+3 parameters at once)

### Explicitly not done

Glitter, Audio Link, Fur / Gem / Tessellation, Lightmap / Light Probe, screen-space shadows, VRC Light Volumes

---

## 4. Two things you must know in advance

1. **It will not be exactly the same as in your Unity**
   three.js's lighting model, tone mapping, and shadow handling all differ from Unity. However accurately the parameters are copied, there will still be visible differences in the end (especially the **softness/hardness of shadows** and **specular highlights**). The goal is "at a glance, it is the same character with the same art style", not pixel-level identity.

2. **Parameters must be copied material by material**
   lilToon is configured **per material**. One character's face, body, clothes, and hair may be 4 materials with 4 sets of parameters.
   If there are many materials, it is suggested to **copy only the "skin" and "hair" sets first**; these two account for 80% of the look.

---

## 5. Complete outline (Outline) specification —— source level

> Relationship to `Hidden/lilToonOutline`: that is a variant the editor **generates** from the main shader (there is no separate file in the source).
> All of the outline's properties are in `lts.shader` (lines 474~556), and at render time it goes through a separate pass.

### 8.1 Vertex displacement

Chain: `lil_vert_outline.hlsl` (29 lines, just dispatch)
     → `lil_common_functions.hlsl:279 lilCalcOutlinePosition`
     → `lil_common_functions.hlsl:254/265 lilGetOutlineWidth`

```hlsl
// lil_common_functions.hlsl:254
float lilGetOutlineWidth(uv, color, outlineWidth, outlineWidthMask, outlineVertexR2Width) {
    outlineWidth *= 0.01;                                   // ★ 1/100
    #if LIL_FEATURE_OutlineWidthMask
        outlineWidth *= SAMPLE(outlineWidthMask, uv).r;     // the mask takes the R channel
    #endif
    if (outlineVertexR2Width == 1) outlineWidth *= color.r; // vertex color R as width
    if (outlineVertexR2Width == 2) outlineWidth *= color.a; // vertex color A as width
    return outlineWidth;
}

// lil_common_functions.hlsl:265
float lilGetOutlineWidth(positionOS, positionWS, uv, color, ...outlineFixWidth) {
    outlineWidth = <the one above>;
    // ★ key: blending between world units ↔ constant screen thickness
    outlineWidth *= lerp(1.0, saturate(length(lilHeadDirection(positionWS))), outlineFixWidth);
    return outlineWidth;
}

// lil_common_functions.hlsl:279
void lilCalcOutlinePosition(inout positionOS, uvs, color, normalOS, tbnOS, ...) {
    float3 positionWS = <M matrix × positionOS>;
    float width = lilGetOutlineWidth(...);
    float3 outlineN = normalOS;
    #if LIL_FEATURE_OutlineVectorTex
        outlineN = lilGetOutlineVector(tbnOS, uvs[outlineVectorUVMode], outlineVectorScale, outlineVectorTex);
    #endif
    if (outlineVertexR2Width == 2) outlineN = mul(color.rgb * 2.0 - 1.0, tbnOS);
    positionOS += outlineN * width;
    float3 V = <perspective> ? lilViewDirectionOS(positionOS) : <orthographic>;
    positionOS -= normalize(V) * outlineZBias;
}
```

`lil_common_macro.hlsl`:
- `614 lilHeadDirection(positionWS) = _WorldSpaceCameraPos - positionWS`
  ⇒ `length(...)` is just **the distance from the vertex to the camera**.
- `646 lilViewDirectionOS(positionOS) = the camera's position in object space - positionOS`

**⇒ The semantics of `_OutlineFixWidth`**:
| Value | factor | Effect |
|---|---|---|
| 0 | 1.0 | The width is in **world units** (it looks thinner from a distance) |
| 1 | saturate(distance) | The width is **constant on screen** (under perspective, multiplying by the distance cancels out exactly) |
| 0.5 (default)| interpolating between the two | a compromise |

### 8.2 Fragment shading

`lil_common_frag.hlsl:349-387`:

```hlsl
fd.col = SAMPLE(_OutlineTex, uv);                       // if enabled, otherwise white
fd.col.rgb = lilToneCorrection(fd.col.rgb, _OutlineTexHSVG);   // if enabled
float3 outlineLitColor  = _OutlineLitApplyTex ? fd.col.rgb * _OutlineLitColor.rgb : _OutlineLitColor.rgb;
float  outlineLitFactor = saturate(NdotL * _OutlineLitScale + _OutlineLitOffset) * _OutlineLitColor.a;
// if _OutlineLitShadowReceive, then *= fd.attenuation
fd.col.rgb = lerp(fd.col.rgb * _OutlineColor.rgb, outlineLitColor, outlineLitFactor);
fd.col.a  *= _OutlineColor.a;
```

**By default `_OutlineLitColor.a = 0`** ⇒ `outlineLitFactor = 0` ⇒ **it is just `texture × _OutlineColor`**.
Lit shading is an optional advanced feature.

### 8.3 All properties and default values (lts.shader:474-556)

| Property | Meaning | Default |
|---|---|---|
| `_OutlineColor` | outline color | (0.6, 0.56, 0.73, 1) |
| `_OutlineTex` | outline texture | white |
| `_OutlineTexHSVG` | hue/saturation/brightness/Gamma | (0,1,1,1) |
| `_OutlineLitColor` | lit color | (1.0, 0.2, 0, **0**) |
| `_OutlineLitApplyTex` | whether lit shading multiplies the texture | 0 |
| `_OutlineLitScale` | lit strength | 10 |
| `_OutlineLitOffset` | lit offset | -8 |
| `_OutlineLitShadowReceive` | whether lit shading receives shadows | 0 |
| `_OutlineWidth` | width Range(0,1) ⚠️ [lilOLWidth] | 0.08 |
| `_OutlineWidthMask` | width mask texture | white |
| `_OutlineFixWidth` | fixed width Range(0,1) | 0.5 |
| `_OutlineVertexR2Width` | vertex color as width: 0 None / 1 R / 2 RGBA | 0 |
| `_OutlineVectorTex` | normal vector texture | bump |
| `_OutlineVectorUVMode` | UV0..UV3 | 0 |
| `_OutlineVectorScale` | -10~10 | 1 |
| `_OutlineEnableLighting` | Range(0,1) | 1 |
| `_OutlineZBias` | Z offset | 0 |
| `_OutlineDisableInVR` | | 0 |
| `_UseOutline` | master switch | 0 |
| `_OutlineCull` | Cull: 0 Off / 1 Front / 2 Back | 1 |
| `_OutlineSrcBlend` / `DstBlend` / `SrcBlendAlpha` / `DstBlendAlpha` / `BlendOp` / `BlendOpAlpha` | independent blending | 1/0/1/10/0/0 |

### 8.4 three.js implementation path (our porting plan)

```
① Carrier: append a **cloned material** to each mesh (sharing the geometry, side = THREE.BackSide)
   or use a second child Mesh, sharing the geometry, with a cloned material.
   —— Why not use OutlineEffect: its parameters are only thickness/color/alpha.
      It cannot add a width mask / vertex-color width / fixed width / Z Bias / lit shading.

② Vertex displacement: onBeforeCompile injects after #include <begin_vertex>
   vec3 outlineN = objectNormal;                      // the normal from the vertex attributes
   float ow = uOutlineWidth * 0.01;
   ow *= <mask sample .r>;                             // if enabled
   ow *= <color.r or color.a>;                        // _OutlineVertexR2Width
   ow *= mix(1.0, saturate(dist), uOutlineFixWidth);  // dist = -mvPosition.z
   transformed += outlineN * ow;
   transformed -= normalize(cameraPosOS - transformed) * uOutlineZBias;

③ Fragment: output uOutlineColor × texture (the default path)
   The lit part follows the formula in 8.2 and needs NdotL → use the same lighting as toon.

④ Render state: side = BackSide, depthWrite = true.
   —— Same inverted-hull idea as OutlineEffect, but the parameters are entirely under our own control.

⑤ Why FBX was originally wrong (three candidate causes, verified one by one during implementation)
   · the FBX unit scale is not 1 → world-unit extrusion fails → solvable with _OutlineFixWidth's semantics
   · FBX hard-edge normals → cracks appear in the extrusion → smoothing the normals is needed
   · FBX skinning → the inverted hull and the main render are inconsistent
```

### 8.5 To-do

- [ ] Implement the outline material and vertex displacement
- [ ] Wire it into the lilToon parameter panel (width / mask / vertex color / fixed width / Z Bias / color / lit)
- [ ] Wire it into the presets (fill values such as `_OutlineWidth` from the presets into LIL_PRESETS)
- [ ] Verify both GLB and FBX
- [ ] Decide whether to replace the existing OutlineEffect path

---

## 6. Presets are **per material** —— architecture rework plan

> Observation (user, 2026-10-05): lilToon's presets support **being selected separately per material**, which is why
> there are these major categories: skin / hair / clothes / inorganic / natural. The usage is:
>   · a skin material slot  → apply Skin-*
>   · a clothes material slot  → apply Cloth-*
>   · a hair material slot  → apply Hair-*
> (in practice most people do not adjust them one by one, but this is lilToon's original preset design)

### 9.1 The problem with the current state

We currently have **a single global `lilCfg`**:

```js
applyLilPreset('Skin-Anime')   // → the whole model (including hair/clothes) gets the skin preset applied.
```

This does not match lilToon's semantics.

### 9.2 Rework plan (recommended: global default + per-material override)

```js
lilCfg                       // global default (existing structure unchanged)
lilCfgByMaterial = {         // ★ new: override by material name
  'Melano_hair_MT_Toon': { shadowBorder: 0.05, rim: { blend: 1, ... } },
  'Melano_cloth_MT_Toon': { shadowBorder: 0.3 },
}
```

**Where it takes effect**: look up the override table by `mat.name` inside `patchToonMaterial(mat)`.
Shallow-merge it on top of the global, so:

```
final parameters = { ...lilCfg, ...lilCfgByMaterial[mat.name] }
```

**The cacheKey must include the material name**, otherwise programs for different materials get reused and the parameters get mixed up.
（the current key is `ba3d-cel:<version>:<shaderMode>:...`, and `:<matName>` must be added）

### 9.3 UI changes

Add a **material selector** at the top of the panel:

```
材质 (material)  [ 全部（默认） (all (default)) ▾ ]     ← by default: it changes the global lilCfg
      [ Melano_hair_MT_Toon ]
      [ Melano_cloth_MT_Toon ]
      [ Melano_Body_MT_Toon ]
      ...

预设 (preset)  [ 头发 · 描边+Rim (hair · outline+Rim) ▾ ]  ← applied to the **material selected above** (not global)
```

- Selecting 「全部」 (all) → changes `lilCfg` (the current behavior, suited to "I just want to tune the whole thing")
- Selecting a given material → changes `lilCfgByMaterial[name]`; the panel sliders show the **merged** values.
- The preset dropdown's options can **auto-filter the category by material name** (a name containing hair → list only the hair family)
  —— but keep all options, since the user may want to specify manually.

### 9.4 Exporting the configuration

```jsonc
"lilToon": { /* global default */ },
"lilToonByMaterial": {
  "Melano_hair_MT_Toon": { "shadowBorder": 0.05 }
}
```

At export time, diff against the default values and write only the items that changed (consistent with the existing exportConfig semantics)

### 9.5 Suggested implementation order

1. The `lilCfgByMaterial` data structure + the merge inside `patchToonMaterial` + adding the material name to the cacheKey
2. API: `getLilConfig(matName)` / `setLilConfig(obj, matName)`
3. Panel: the material selector + the preset application target changing along with it
4. Export / import supporting `lilToonByMaterial`

### 9.6 Notes

- For material-name matching it is suggested to **use the derived material's name** (`Melano_hair_MT_Toon`, with the `_Toon` suffix)
  or to uniformly strip the suffix before matching, to avoid mismatches after a rebuild changes the name.
- Matching **by mesh name** (`melano_hair`) can also be supported —— some models' material names are not semantic enough.
  Supporting both is more robust; priority: material name > mesh name.
