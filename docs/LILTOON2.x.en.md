# lilToon 2.3.4 → Web (three.js) port baseline

[简体中文](LILTOON2.x.md) ｜ [繁體中文](LILTOON2.x.zh-TW.md) ｜ **English** ｜ [日本語](LILTOON2.x.ja.md) ｜ [한국어](LILTOON2.x.ko.md)

> **This document is the currently effective baseline**.
> The comparison table and verification record of the old baseline (**1.3.7**) are in [`LILTOON1.x.en.md`](LILTOON1.x.en.md).
> Implementation details and all configuration keys are in [`CONFIG.en.md`](CONFIG.en.md).

---

## Zero, the definition of the baseline

| Item | Value |
|---|---|
| **Baseline version** | **lilToon 2.3.4** |
| **Source path** | `develop_res/liltoon-2.3.4/` (the old baseline is in `develop_res/lilToon/`, kept for comparison)|
| **Reference file** | `Shader/lts.shader` —— the opaque full version |
| **Total property count** | **517** (1.3.x was 483)|
| **Line-number references in the code** | **93 places**, all migrated to 2.3.4 (see §5) |

### Why reference `lts.shader` and not something else

Under `lilToon/Shader/` there are **61 shader files**, but they are **variants** of the same set of logic:

```
lts.shader          opaque full version        ← this is what we reference
lts_cutout / _trans / _trans_oo …       variants split by render mode
ltsl_*                                  lite version (half the properties)
ltsmulti_*                              multi-material variants
lts_fur / _gem / _tess / _ref           independent features (Fur / Gem / tessellation / refraction)
ltspass_*                               each pass split out separately
```

⇒ The properties of the other variants are a subset of `lts.shader`, or belong to **independent features** (Fur/Gem/Tess/Ref are different shaders, not lts properties).

---

## One, why the baseline can be swapped: comparison conclusions

The conclusion after comparing the two versions item by item is —— **backward compatible, almost no rework needed**.

| Comparison item | Result |
|---|---|
| **Property default values** | Among the 483 shared properties, **only `_lilToonVersion` changed** (33 → 45); **not a single one** of the rest changed |
| **19 official presets** | **Item-by-item values completely identical** (0 differences) |
| **The formulas we ported** | **Completely identical** |

### Function-by-function verification (function bodies extracted by brace pairing, compared line by line)

| Function | Result |
|---|---|
| `lilBlendNormal` |, completely identical |
| `lilBlendColor` |, completely identical |
| `lilTooningNoSaturateScale` |, completely identical |
| `lilToneCorrection` |, completely identical |
| `lilCalcSpecular` |, completely identical |
| `lilCalcMatCapUV` | ⚠️ The only difference: `lerp(uvMat, `**`saturate(uv1)`**`*2-1, matcapBlendUV1)` —— **we did not implement `_MatCapBlendUV1`** ⇒ not applicable |

⇒ **Our `LIL_PRESETS` data (converted from `Presets/*.asset`) is still valid**, no need to regenerate it.

---

## Two, the 1 place found in the comparison and already fixed

### `dissolveParams.xy = round(...)`

**New in 2.3.4** (`lil_common_functions.hlsl:638` and `:684`):

```hlsl
dissolveParams.xy = round(dissolveParams.xy);   // mode, shape
```

⇒ **Both mode and shape must be rounded** (1.3.x does not have this line)

Our situation:

| Parameter | Before 2.3.4 | 2.3.4 |
|---|---|---|
| `mode` | we already `Math.round` | — |
| `shape` (`_DissolveParams.g` / our `linear` key)| `!== 0`, **not rounded** | `round()` |

⇒ Consequence: when the config writes `"linear": 0.5`, we treat it as **Line**, while lilToon does `round(0.5) = 0`, i.e. **Point**.
⇒ The panel slider has `step 1`, normally always 0/1, **only exposed when hand-writing JSON**.
⇒ Already changed to `Math.round(num(D.linear, 1)) === 1`.

---

## Three, the differences of 2.3.4 relative to 1.3.x

**68** properties added, **34** removed.

### 3.1 Genuinely new features (we do not have them)

| Feature | Property count | Default | Notes |
|---|---|---|---|
| **RimShade** | 7 | 0 | The newly added "rim shadow" layer, `_RimShadeColor` / `Mask` / `NormalStrength` / `Border` / `Blur` / `FresnelPower` |
| **IDMask** | 34 | 0 | Use IDs to control dissolve / hide parts, relies on a Unity-side tool to bake the IDs into vertices or a texture |
| **Dither** | 3 | 0 | Screen-space ordered dithering, `_DitherTex` / `_DitherMaxValue`, used together with DistanceFade |
| **DistanceFadeRim** | 3 | — | Adds a ring of colored rim light during distance fade, `_DistanceFadeRimColor` / `FresnelPower`, plus `_DistanceFadeMode` |
| **Main2nd/3rdTexAlphaMode** | 2 | 0 | The main color layer's own **alpha** blend mode (originally only a color blend)|

### 3.2 Unity-exclusive, irrelevant to us

```
UDIM Discard                      20     Unity UDIM
Motion vectors                    several     TAA / motion vectors (TransformPreviousObjectToWorld etc.)
Probe Volumes L1/L2                       Unity APV
VRC Light Volumes / Udon Light Volume
  ├ _EnvRimBorder / _EnvRimBlur (2)
  └ _UdonLightVolumeEnabled
```

### 3.3 The 34 removed

```
Asset encryption: _IgnoreEncryption · _Keys · _BitKey0..31      ⇒ N/A (we never did it anyway)
```

---

## Four, the 2.3.4 source map

> **All line numbers are under `liltoon-2.3.4/Shader/Includes/`**.
> The comment references in our code are exactly these line numbers, all already aligned.

### 4.1 Utility functions (`lil_common_functions.hlsl`)

| Line | Function | What we use it for |
|---|---|---|
| 11 | `lilIsIn0to1` | — |
| **26** | `lilTooningNoSaturateScale` | The core of toon shading (3/4/5-argument overloads), used by shadow banding / Rim / specular |
| **135** | `lilBlendNormal` | Whiteout blend (2nd normal)|
| **325** | `lilBlendColor` | All blend modes (Normal/Add/Screen/Multiply), our `ba3dBlend` |
| **347** | `lilToneCorrection` | HSV correction of the outline texture |
| **419** | `lilRotateUV` | The Line shape of the layer dissolve |
| **438** | `lilCalcUV` | UV transform (ST + scroll rotation)|
| **550** | `lilCalcMatCapUV` | MatCap's UV (including ZRotCancel / Perspective)|
| **626** | `lilCalcDissolve` | Dissolve |
| **668** | `lilCalcDissolveWithNoise` | Dissolve (with noise)|
| **638 / 684** | `dissolveParams.xy = round(...)` | ★ new in 2.3.4, see §2 |

### 4.2 Decoration layers (`lil_common_frag.hlsl`)

**⚠️ Most of these are `#define OVERRIDE_*` macros, not functions**.

| Line | Macro / function | Corresponds to ours |
|---|---|---|
| 395 | `OVERRIDE_OUTLINE_COLOR` | lit of the outline |
| 488 / 506 | `OVERRIDE_DISSOLVE` | Dissolve |
| 527 / 534 | `OVERRIDE_DITHER` | ★ new in 2.3.4 |
| 566 / 573 | `OVERRIDE_NORMAL_1ST` | 1st normal |
| 585 / 598 | `OVERRIDE_NORMAL_2ND` | 2nd normal (Whiteout)|
| 617 | `OVERRIDE_ANISOTROPY` | ❌ not done |
| 814 | `OVERRIDE_MAIN2ND` | main color layer 2nd |
| 910 | `OVERRIDE_MAIN3RD` | main color layer 3rd |
| 1192 | `OVERRIDE_SHADOW` (banding)| shadow banding + three-layer normal strength |
| 1222 / 1225 | `OVERRIDE_RIMSHADE` | ★ new in 2.3.4 |
| **1267** | `OVERRIDE_BACKLIGHT` | backlight |
| **1315** | `float3 lilCalcSpecular` | ★ specular highlight |
| **1437** | `perceptualRoughness - fd.smoothness` | ★ `roughness = (1 - _Smoothness)²` |
| **1510** | `OVERRIDE_REFLECTION` | ★ reflection (including specular blend)|
| **1578** | `OVERRIDE_MATCAP` | MatCap 1st |
| **1636** | `OVERRIDE_MATCAP_2ND` | MatCap 2nd |
| **1747 / 1750** | `OVERRIDE_RIMLIGHT` | Rim |
| **1888 / 1891** | `OVERRIDE_EMISSION_1ST` | emission 1st |
| **1955** | `OVERRIDE_EMISSION_2ND` | emission 2nd |
| **2057** | `OVERRIDE_DISTANCE_FADE` | distance fade |

### 4.3 Macros and lighting (`lil_common_macro.hlsl`)

| Line | Content | Notes |
|---|---|---|
| **621** | `lilHeadDirection` | head direction (used by MatCap parallax, ineffective when not VR)|
| **696** | `lilBlendVRParallax` | ⚠️ when not VR it **returns b directly**, the parameters have no effect |
| **2079** | `LIL_CORRECT_LIGHTCOLOR_VS` | the light-clamping macro |
| **2081 / 2086** | `lightColor = clamp(lightColor, _LightMinLimit, _LightMaxLimit)` | ★ the light clamping itself |

### 4.4 The **order** of the decoration layers (`lil_pass_forward_normal.hlsl`)

```
line 219 / 386   Dither            ★ new in 2.3.4
line 251 / 446   Lighting
line 339         Layer Color (Main2nd / Main3rd)
line 446         Shadow
line 492         Backlight
line 520         **Reflection**    ★ we just added it
line 527         MatCap
line 539         Rim light
             (RimShade, new in 2.3.4, after Rim)
line 554 / 560   Emission 1st / 2nd
```

Full order:

```
Anisotropy → AudioLink → Main2nd → Main3rd → Shadow → Backlight → 【Reflection】
→ MatCap → MatCap2nd → Rim → 【RimShade】→ Glitter → Emission1st → Emission2nd
(Dither is outermost, acting on fd.col.a)
```

### 4.5 Other key locations

| Line | File | Content |
|---|---|---|
| **206** | `lil_common.hlsl` | `fd.perceptualRoughness = 1.0` (initial value)|
| 1438 | `lil_common_frag.hlsl` | `fd.roughness = fd.perceptualRoughness * fd.perceptualRoughness` |

---

## Five, a few things that must be known in advance

### 7.1 `_MatCapVRParallaxStrength` is a no-op when not VR

`lil_common_macro.hlsl:696`:

```hlsl
float3 lilBlendVRParallax(float3 a, float3 b, float c) {
    #if defined(USING_STEREO_MATRICES)
        return lerp(a, b, c);
    #else
        return b;          // ← when not VR, returns the view direction directly · the strength parameter is unused
    #endif
}
```

⇒ Adjusting it in the browser **has no effect at all**; this is lilToon's design, not a defect of ours.
⇒ It is kept on the panel only to correspond one-to-one with lilToon's parameter table (marked "(ineffective when not VR)")

### 7.2 Masks come from **vertex color** by default

lilToon's `triMask`:

| Channel | Use |
|---|---|
| R | MatCap weight |
| G | Rim weight |
| B | emission weight |

⇒ **When the model has no vertex colors it automatically falls back to "weight constantly 1"**, so the effects do not disappear.
⇒ The panel has a "vertex color" preview button, which renders the vertex colors directly as color, used to confirm the mask regions.

### 7.3 `_Smoothness = 1` ⇒ `roughness = 0` ⇒ `pow(nh, +INF)`

```
perceptualRoughness = 1 - _Smoothness        (lil_common.hlsl:206 initial value 1.0)
roughness           = perceptualRoughness²    (lil_common_frag.hlsl:1438)
```

**HLSL**: `1.0/0.0 = +INF`, `pow(nh, +INF)` returns 0 for `nh<1` and 1 for `nh>=1`.
**GLSL**: **an infinite exponent is undefined behavior**.

⇒ We write it explicitly as `nh >= 1.0 ? 1.0 : 0.0`.

### 7.4 GLSL and HLSL have different matrix orientations

```
HLSL  mul(float3x3(a,b,c), v)  is a **row dot product**  ⇒ (dot(a,v), dot(b,v), dot(c,v))
GLSL  mat3(a,b,c) * v          is a **column combination**  ⇒ the two differ
```

⇒ When porting, writing `dot` directly is the least error-prone, (`lilCalcMatCapUV` is one such place)

### 7.5 ★★ three's toon lighting reads `material.diffuseColor` (not the local `diffuseColor`)

  ⚠️⚠️ To change the **lighting result**, you must change **`material.diffuseColor`** (that struct's field).
     Changing the local `diffuseColor` only affects **later stages** (alpha / emissive / fog), not lighting.

      lights_toon_pars_fragment:
          reflectedLight.directDiffuse   += irradiance * BRDF_Lambert( material.diffuseColor );
          reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );

  ⚠️ Moreover `material` is assigned **inside `#include <lights_fragment_begin>`** ⇒
     to change it you must write it **after** that include.
  ⚠️ Code attached after the include is **outside all blocks** ⇒ it cannot reference block-local variables (such as `ba3dLc`).
     Use variables declared at file scope / in the prologue (such as `ba3dColor2nd`) instead.

  ⇒ This pitfall made "main color layers 2nd / 3rd" **completely invisible** under default settings, and it lurked for a long time.
     It was dug out during B5 thanks to the user's experiment "it is only visible when enableLighting is set to 0".

### 7.5.5 ★ The outline has **two systems**, and the state must be shared

  ⚠️ In lilToon mode it goes through **`applyLilOutline()`'s independent inverted-hull mesh**.
     Not three's `OutlineEffect`; the two each have their own set of "skip" rules:

      applyOutlineParams()  ⇒ writes userData.outlineParameters.visible
                              (transparent / ground / mouth patch ⇒ false)
      applyLilOutline()     ⇒ originally **only honored o.skipPattern from the config**, completely ignoring visible

  ⇒ Result: "transparent materials automatically turn off the outline" only works for three's OutlineEffect.
     It is **completely ineffective** for lilToon's inverted-hull outline.
  ⇒ Symptom: switch to lilToon style · it has an outline by default, change nothing ⇒
     **transparent materials get covered into opacity by that solid backface shell**.

  ### Also: the outline shell **must not write depth**

  The original outline material had `depthWrite = true`, and it has `renderOrder = -1` (drawn first)
  ⇒ the depth is laid down first ⇒ the semi-transparent thin panels behind are **depth-culled** ⇒ that area looks "solid".

  ⇒ Correct approach: if the source material is transparent ⇒ the outline material is also `transparent` + **`depthWrite = false`**.
     (lilToon treats the outline as an independent pass and inherits the material's `_TransparentMode`)

  ### ⚠️ And the outline's alpha **does not come from the material**

      lil_common_frag.hlsl:389     fd.col.a *= **_OutlineColor.a**;

  ⇒ The outline color carries its own alpha (the "outline opacity" on the panel), unrelated to the body material.
  ⇒ "Following transparency" is expressed in the **blend / depth state**, not by multiplying the alphas together.

### 7.5.6 ★ The checker itself also tripped over "index misalignment"

  ⚠️ `check-panel.mjs` extracts the **inline script** into `codeLines`, while keeping the `L` of the whole `html`.
     The two **differ in index by `base` lines**.

  The original check ⑧ was written as `L[i]`, and happened to line up because "the script is right near the start of the file".
  ⇒ Once content is inserted **before** the script (for example adding the light-theme CSS), the offset changes ⇒
     the comment detection reads a different line ⇒ **it misjudges an effective call as commented out** ⇒
     it reports "groupifyLilPanel() has 0 effective calls" while the code is actually fine.

  ⇒ Fix: every judgment that reads the original text uses `L[i + base]`.

  ⚠️ Lesson: **when a checker has a bug it reports false problems, which wastes more time than not reporting at all**.
     When you see "something that was fine suddenly reports an error", suspect the checker first, then the code.

### 7.6 `onBeforeCompile` receives the **original text with `#include` not yet expanded**

three only does `resolveIncludes` **after** `onBeforeCompile`.

⇒ To change code inside three's built-in chunks (such as `RE_Direct_Toon`),
  **you must replace the `#include <xxx>` directive itself** and splice in the patched chunk text.
⇒ Searching `shader.fragmentShader` directly for that line inside the chunk will **never find it**.

### 7.7 Presets are **per material**

lilToon's presets are inherently one per material, while our architecture is "global defaults + per-material sparse overrides".
See [`CONFIG.en.md`](CONFIG.en.md) and section 9 of `LILTOON1.x.md` for details.

---

## Six, comparison method (reproducible)

### 8.1 Property level

Both sides' `lts.shader` are parsed as `[attr] _Name ("Label", Type) = default`.

⚠️ **The type may contain parentheses such as `Range(0, 1)`**, so the regex must use a **greedy `(.*)`**.
   Otherwise `_AsUnlit ("As Unlit", Range(0, 1)) = 0` fails to match (one extra closing parenthesis)

### 8.2 Preset level

Parse the `m_Floats` section of the `.asset`:

```
- name: _UseReflection
    value: 1
```

(`- name:` and `value:` are **two adjacent lines**)

### 8.3 Formula level

Extract function bodies by function signature (brace pairing), compare line by line (ignoring comments and blank lines)

### 8.4 Line-number mapping

See the method in §5.

---

## Seven, the list of known deviations (honest record)

| Item | Situation |
|---|---|
| `_MatCapVRParallaxStrength` | a no-op when not VR, lilToon itself is like this |
| UV1 / UV2 / UV3 | not supported, the panel dropdown only offers `uv0` and "view spherical", noted on the options |
| layer dissolve "UV" mode | uses the **mesh UV0** (= atlas), which cuts out fragments on the character, **consistent with Unity's behavior** |
| **Decal's practicality** | ⚠️ the formula / injection / edge AA / mirroring / single-side / atlas animation are **all faithfully implemented per lilToon**, but **this model lacks the UV layout Decal uses** ⇒ in practice you only get stripes, see below || `_ReflectionCubeTex` | not done, Unity relies on Reflection Probe and the viewer does not have it ⇒ only the specular highlight path was done |
| full GGX of the non-toon path | not done, `_SpecularToon` defaults to 1 ⇒ the presets all take the toon path ⇒ a close-enough approximation was provided |
| difference between light clamping and lilToon | lilToon's indirect light is also multiplied by the same `lightColor` ⇒ ambient light in shadow gets pushed down, while three's ambient light is **added independently** ⇒ with a very high lower limit it is slightly brighter than lilToon; this is a difference in lighting structure, not forcibly simulated |
| cel mode | cel and lilToon are **two orthogonal axes**, and every round verifies that the lilToon-side changes did not contaminate cel |

### ★ About the practicality of B5 Decal (explained separately, to avoid misunderstanding)

  **Decal is not a tool for "sticking an image onto some position on the face"**; it **swaps in a different set of sampling rules for this layer's texture**:

      ① change the UV channel (usually uv1)
      ② mirror-copy to the other half / show only one side (via the sign partition of tangent w)
      ③ atlas frame animation (_Main2ndTexDecalAnimation)
      ④ clip pixels where decalUv.x falls outside [0,1] (with edge anti-aliasing)

  ⇒ The real "decal" effect comes from **the model/artist providing a UV set prepared for decals**, not from an arbitrary image.

  ### Why only stripes can be seen on this model

      CH0155_Face   uv1.x ∈ [-0.53, 1.00]   uv1.y ∈ [-0.998, 1.00]
      CH0155_Body   uv1.x ∈ [-11.65, 12.10]
      CH0155_Hair   uv1.x ∈ [-13.27, 14.46]

  ⇒ `texture2D(tex, uv1)` gets **repeatedly sampled** in UV space ⇒ stripes / bands.
  ⇒ Plus Decal's AA keeps only the one vertical band with `x ∈ [0,1]` ⇒ that is what you see.
  ⇒ **Using the same UV1 + the same ST in Unity produces exactly the same stripes**; it is not our bug.

  ### The actual use of "ST scale / offset" here

      ST scale = (0.1, 0.1)  ⇒ takes only 1/10 of the texture ⇒ magnified 10× and tiled over the model
      ST offset = (0.3, 0.5)  ⇒ which piece to take

  ⇒ You can use it to "take a corner of the texture and tile it", but **it is not free placement**.
  ⇒ "★Decal debug = 2" can output the decal UV directly as color, used to confirm where the UV falls.

  ### What is needed to truly do "draw a small decal on the face"

      · The model must have a **UV channel laid out for decals** (left by the artist when modeling)
        for example arranging all the positions on the face that can take decoration into one "decal atlas"
      · Each position occupies one block [u0,u1] × [v0,v1] in the atlas
      · Then use _Main2ndTex_ST to magnify that block to [0,1]
      · Use _Main2ndTexDecalAnimation to pick the frame

  ⇒ The BA series' uv1 is obviously not laid out that way ⇒ so you can only get stripes.

---

## Eight, references

| File | Content |
|---|---|
| [`LILTOON1.x.en.md`](LILTOON1.x.en.md) | comparison of the old baseline (1.3.7) with the current one, full outline specification, per-material preset architecture |
| [`CONFIG.en.md`](CONFIG.en.md) | all configuration keys, implementation details, each round's pitfalls and lessons |
| `viewer.js` | 93 line-number references, all aligned to 2.3.4 |
| `develop_res/liltoon-2.3.4/` | current baseline source |
| `develop_res/lilToon/` | old baseline source (kept for comparison)|

---

## Nine, 2026-10-10 this round: style-backend brightness semantics alignment (rolling record)

The "lilToon style" backend and the reference backend (the lilToon source port) previously had two brightness deviations visible to the eye;
this round aligns the style side's **lighting composition / output handling / base-color source** with the reference side's actual semantics.

### 9.1 Key changes

| Item | Previous approach | Current approach |
|---|---|---|
| Direct light | a per-light summed Lambert term, then multiplied by an empirical compensation | **take the first directional light**, `clamp(main light + ambient, lower limit, upper limit)`, a **single** `A × lightColor × R` composition |
| Empirical compensation | the composition carried a `1.65` factor | that path **no longer uses** it (the default value itself is unchanged; the old path of the unmodified modes is kept) |
| Base color | **asymmetric** with the reference side (one side multiplied the material base color one extra time) | derived from "effective configuration → configuration mapping → vendor runtime defaults", composed together with the main texture and the main color layer |
| Output | the page's tone mapping (`LinearToneMapping`, exposure 1.15) | kept; after alignment the large near-white clipping in lit areas disappears |
| First load | going only through the style path would not load the bridge module | on first entering the style backend the module is **loaded along the way** (load only, does not switch the render backend) |

### 9.2 Measured (black background α composition, `L = .2126R + .7152G + .0722B`)

| State | Whole-image mean absolute difference | Share of brightness difference > 12 |
|---|---|---|
| Homepage default model, pure defaults | 0.029 | 0.076 % |
| Homepage default model, "skin · animation" global preset | 0.000074 | 0.00016 % |
| Melano (reference pose) | 0.050 | 0.122 % |
| Melano, "skin · animation" global preset | 0.00067 | 0.0029 % |

Criterion: key regions (hair / face / coat / socks) mean absolute difference ≤ 3, share of pixels with whole-image brightness difference > 12 ≤ 1 %.

### 9.3 Order (consistent with upstream)

Normal → receive → the normal steps `x/y/z` and the boundary transition step `w` → strength → each layer's color →
main strength → take the smaller → boundary color → final blend; when `_UseShadow = 0` the whole block is skipped.
The shadow normal still keeps **unconditional assignment** (it must be written even at the default strength of 1), and the per-layer step partition includes anti-aliasing.

### 9.4 Not yet verified (honest record)

- `_ShadowNormalStrength` intermediate strength: the slider can be written, but the corresponding shader branch does not take effect yet.
- The enable branches of the second / third layer of the main color layer were not verified separately.
- For the face shadow only the **brightness** measure was checked; the independent check of **shape / transition** was not done.
- The transparent-background branch, other models, and the preset target of "specify material" were not tested.

---

## Ten, 2026-10-18 appearance baseline: the Unity-side conditions (verified)

Reference project: Unity **2022.3.22f1** · project `Melano-Migrated` · scene `Melano_scene` (verified read-only on this machine).

| Item | Value | Evidence |
|---|---|---|
| Pipeline | **Built-in** | `ProjectSettings/GraphicsSettings.asset`: `m_CustomRenderPipeline: {fileID: 0}` · `m_SRPDefaultSettings: {}` |
| Color space | **Linear** | `ProjectSettings/ProjectSettings.asset`: `m_ActiveColorSpace: 1` |
| Post-processing / tone mapping | **none** | project-wide grep: zero `PostProcessVolume` / `Tonemapping` under Assets/Scenes (the postprocessing package is installed but unused) |
| lilToon | **2.3.4** | `Assets/lilToon/package.json` |

**Conclusion**: on the Unity side lilToon does **no material-level tone mapping**; the pipeline is "linear shading + a display-side sRGB transform".

In this repository:

- Source backend: `mat.toneMapped = false` (does not follow the page tone mapping) **plus** the sRGB output ⇒ matches Unity semantics.
- Our style backend already strips `#include <tonemapping_fragment>` ⇒ both backends now agree.
- Page-level ACES applies only to **PBR / native materials**; keep it out of both toon paths (upstream 0.1.6+ follows it, so it must be switched off explicitly).

### Outlines (hybrid scheme)

| Mesh kind | Drawn by | Note |
|---|---|---|
| Skinned meshes | **upstream** (`shaderVariant = Hidden/lilToonOutline` etc.) | Unity itself uses the upstream outline ⇒ closer to the baseline |
| Static meshes | **our own inverted hull** | upstream's look on static meshes is unverified |
| Meshes named `*_Outline` (model-provided shells) | **ours**, and never upstream | they are already an expanded shell; adding the upstream outline inflates them into a large solid patch at a 150× world scale |

⚠️ Measured: `_OutlineCull` and forcing `side = FrontSide` have **no effect** on that inflation (pixels barely change) ⇒ excluding the shell meshes is the only working rule.
