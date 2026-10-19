# Changelog

[简体中文](CHANGELOG.md) ｜ [繁體中文](CHANGELOG.zh-TW.md) ｜ **English** ｜ [日本語](CHANGELOG.ja.md) ｜ [한국어](CHANGELOG.ko.md)

> Version note: **3.0.0** is the release that "upgraded three.js to r0.185.1 and introduced the three-liltoon source build (lilToon source)";
> every change in the round after it is recorded together as **3.0.1** (three sections below, in chronological order).

## 3.0.1 — Visual alignment with Unity · upstream three-liltoon 0.1.9 · native capability replacement (2026-10-10 ～ 2026-10-18)

### 3.0.1.1 Brightness semantics of the lilToon-style backend (2026-10-10)

This release only touched shading — no UI or config format changes. It aligned the **light composition**, **output handling**
and **base-colour source** of the "lilToon style" backend with the real semantics of the reference backend (lilToon source),
fixing two visible brightness deviations.

#### Problems fixed

| Symptom | Cause | Fix |
|---|---|---|
| The default model is **too bright / washed out** under a **fully default config** | The style side summed direct light per lamp, while the reference side takes only the **first directional light** and **clamps the light colour per channel** to `_LightMinLimit` / `_LightMaxLimit` | The style side now does a **single composition**: `A × clamp(key + ambient, min, max) × R`, same semantics as the reference |
| After applying the "Skin · Animation" preset the style side became **too dark** | Asymmetric base colour: the style side multiplied the material base colour **once more**, while the reference uses the material's own effective colour | Base colour is now derived from "effective config → config mapping → vendor runtime defaults" and composed with the same main texture and main-layer set |
| Large areas of the lit region were **near-white** | The output stage applied tone mapping (`LinearToneMapping`, exposure 1.15) that the reference does **not** have, squeezing the difference into clipping | Page-level tone mapping kept; after switching direct light to the single composition above, the large-area clipping disappeared |

#### Results (measured after writing back; black-background α composite, luminance `L = .2126R + .7152G + .0722B`)

| State | Mean absolute difference (whole image) | Share of pixels with luminance diff > 12 | Key regions (mean abs. diff) |
|---|---|---|---|
| Home default model, fully default | 0.029 | 0.076 % | hair +0.10 / face +0.37 / coat +0.11 / socks +0.01 |
| Home default model, "Skin · Animation" global | 0.000074 | 0.00016 % | all regions ≈ 0 |
| Melano (reference pose) | 0.050 | 0.122 % | face −0.14 / coat −0.16 |
| Melano, "Skin · Animation" global | 0.00067 | 0.0029 % | all regions ≈ 0 |

- The accepted **face-shadow fix** (shadow normals assigned unconditionally, per-step banding with anti-aliasing, border transition) is **left untouched**.
- On first entry into "lilToon style" the viewer **loads the lilToon bridge module once** (module load only, no renderer switch) so it can read the config mapping and vendor runtime defaults.

#### Not yet verified in this release (honest record)

- The **intermediate strength** of `_ShadowNormalStrength`: the slider writes it, but the corresponding shader branch is not active yet.
- The enable branches of the 2nd/3rd main layers (`_UseMain2ndTex` / `_UseMain3rdTex`) were not verified separately.
- Face shadow was only checked against the **luminance** metric; independent checks of **shape / transition** were not done.
- The transparent-background branch, other models and preset targets for "specific material" were not tested.

---

### 3.0.1.2 Upstream runtime upgrade three-liltoon 0.1.4 → 0.1.9 (2026-10-18)

The upstream runtime used by the "lilToon source" backend moved from **0.1.4** to **0.1.9** (vendor and manifest only; our own shading path untouched).

#### What upstream brought (visible to us)

| Item | 0.1.4 | 0.1.9 |
|---|---|---|
| Outlines | no public `shaderVariant` ⇒ upstream outlines could **not be drawn** ✗ | `shaderVariant: 'Hidden/lilToonOutline'` works ✓ (measured: thin edges on skinned meshes are correct ✓) |
| Output policy | — | since 0.1.6 it follows three's tone mapping / `outputColorSpace` ✓ (we use `LinearToneMapping` + exposure 1.15 ✓ measured: **no brightness shift** ✓) |
| Render cost | — | 0.1.9 reduces redundant material preparation, extra framebuffer copies and resolves ✓ |
| Texture orientation | — | documented: material-owned texture views are always `flipY = false` ✓ (upstream issue 3) |

#### Our handling

- **Outlines remain fully self-implemented** ✓ (hybrid outline switch `HYBRID_UPSTREAM_OUTLINE = false`, see `viewer.js`).
- Reason: BA characters ship **outline shell meshes** (names containing `_Outline`, e.g. `CH0155_Milk_Outline`); applying upstream outlines to them inflates into large solids ✗. Excluding them works for BA ✓, but the VRC side renders abnormally on this repository's test model (missing texture 404, unrelated to this upgrade) ⇒ **enable after VRC verification**.
- Vendor files: `index.js` · `chunk-KNGRDLOZ.js` · `chunk-WFYRXLGW.js` · `gltf.js` · `vrm.js` · `schema/…` · third-party notices (old `chunk-A4BIABDA.js` / `chunk-F6TSGO5L.js` removed).
- Deploy manifest, the chunk tables in the five-language `DEPLOY` docs and the version/outline wording in the five-language `README` docs were synchronised ✓.

---

### 3.0.1.3 Visual alignment with Unity (source backend) + upstream native capability replacement (2026-10-18)

This release re-aligned the **look** of the "lilToon source" backend to Unity and replaced several self-implementations with upstream 0.1.9's native capabilities.

#### Problem fixed: source backend brighter, banding flatter

| Symptom | Cause | Fix |
|---|---|---|
| After upgrading to 0.1.9 the "lilToon source" backend was overall brighter with flatter shadows | Upstream 0.1.6+ **honours `renderer.toneMapping`**, and this page uses **ACES** in toon mode; Unity's lilToon materials do **no** tone mapping (ACES can only come from a post-processing Volume) | Source-backend material uses `toneMapped = false` (= 0.1.4 behaviour = Unity semantics); **sRGB output kept** (Unity is Linear ⇒ the display stage needs sRGB anyway) |

Measured (static scene; reference state = 0.1.4 build): before the fix the net per-channel delta was **+0.93 / +0.28 / +0.33** (too bright) → after **−0.29 / −0.94 / −1.01**; mean absolute difference **2.20 → 1.34**; share > 12 **7.7 % → 3.8 %**.

#### Switched to upstream native capabilities

- **Outlines (hybrid)**: skinned meshes use `shaderVariant = Hidden/lilToon*Outline` drawn by upstream; static meshes keep our inverted-hull outline; meshes handed to upstream get no extra shell (avoids double outlines).
  ⚠️ **Model-provided `*_Outline` shell meshes must be excluded** (otherwise they inflate into large solids, measured); switch `HYBRID_UPSTREAM_OUTLINE`.
- **Textures**: constructor parameter `textures` (native semantics; colour space decided by upstream `LILTOON_TEXTURE_SEMANTICS`).
- **Render queue**: `enableLilToon(renderer, { materialRenderQueue: true })` (closer to Unity's sorting; measured: no visible difference).

#### Property-table self-check

All **199** of our lilToon property names are found among upstream's **591** native names (self-invented/aliases = 0).

#### Not adopted (measured and rolled back)

Frame-level post-processing (moving tone mapping from the material to a whole-frame pass, Unity Volume semantics): conflicts with upstream `enableLilToon`'s renderer wrapper (it rewrites render targets / captures the framebuffer) ⇒ our render target ended up empty ⇒ **rolled back**, material-level approach kept.

#### Known leftovers

- Upstream outline appearance on the VRC (FBX) side is unverified (this repository's test models render fully black; 0.1.4 is equally black ⇒ fixture issue).
- 392 upstream properties remain unmapped (fur / refraction / gem / cube reflection …).

---

### 3.0.1.4 Site icon and page heads (2026-10-18)

- Added `favicon.ico` (shipped in the deploy package) and a `<link rel="icon" href="./favicon.ico" type="image/x-icon">` in the `<head>` of `index.html` and `embed-demo.html`;
- The `<head>` of these two pages and the demo page's copy are maintained by the user (see `develop_res/USER-MAINTAINED.md`); builds only copy them and never regenerate.

---

## 3.0.0

> **Feature overview (aligned with GitHub Release 3.0.0)**: this is the major release that "introduced the lilToon source build and improved the FBX experience".

1. three.js upgraded to **r0.185.1**;
2. several bug fixes;
3. when **Toon** is selected, the shader dropdown gains **lilToon source** (three-liltoon: upstream lilToon shader code translated directly);
4. importing an FBX model can pick a prefab so parts are shown/hidden correctly;
5. improved FBX viewing experience, with **anim playback (experimental)**;
6. can import an entire VRC avatar Unity project's `assets` folder, auto-detecting FBX, prefabs, textures, shader configs, scenes and anim clips;
7. site favicon and the `<link rel="icon">` in both pages (introduced in **3.0.1**, see that section).

> The body below is the technical record of the same version. It does not conflict with the overview above: the overview is for release notes, the body is for implementation archaeology.

The previous release (`legacy-v1`) was a **draggable 3D character widget** that could be embedded in any site, with game-like toon banding as its only shading.

This release turned it into a **character 3D viewer**, whose main goal was **adding lilToon-style shading and making the viewer's lilToon configuration interoperable with Unity**.

---

### 1. New lilToon-style shader

The "Shader" dropdown went from two entries to three:

| Option | Description |
|---|---|
| None (native) | Use the model's own materials, no modification |
| Cel banding | The game-like toon shading from the previous release |
| **lilToon style** | New; implemented against the lilToon 2.3.4 source |

The implementation aligns item by item against the **lilToon 2.3.4 source** rather than tuning by eye:

- **517 properties** were extracted from the Properties block of `Shader/lts.shader` as the reference table (script-generated, reproducible); **228** are aligned so far.
- Mapping performs a **shape check**: colour↔colour, vector↔vector, texture↔texture, int↔int; anything with a mismatched shape is skipped. All 80 checked items passed.
- The parameter panel follows lilToon's grouping and is collapsible: shadow banding, outline, Stencil (model), Stencil (outline), MatCap, MatCap 2nd, emission, emission 2nd, dither, normal, main layer 2nd, main layer 3rd, dissolve.

Implemented features:

- **Three-step shadow banding**: `_ShadowStrength` / `_ShadowBorder` / `_ShadowBlur`, plus the 2nd/3rd layer colours and borders and the `_ShadowBorderRange` transition.
- **Real-time shadow receiving**: each layer decides independently (`_ShadowReceive` etc.), same formula as lilToon (`lerp(1.0, shadow, _ShadowReceive)`).
- **Shadow master switch**: `_UseShadow`; when off the whole shadow block is not generated.
- **Outlines**: inverted-hull outlines, including width mask, expand-direction texture, outline lighting, `fixWidthMode`, `skipPattern` and other lilToon outline properties.
- **Main layers**: UV transform and scroll of the main texture, HSV correction, decals and blend modes of the 2nd/3rd layers.
- **Rim / MatCap / backlight / reflection / emission**: wired in lilToon's formulas and order.
- **Render state**: `_TransparentMode`, `_Cutoff`, `_Cull` synchronised to actual rendering.

---

### 2. Two-way compatibility with lilToon `.asset` presets

The goal is to **let the viewer's config and lilToon's real Unity files read and write each other**; both directions are implemented:

- **Import**: recognises `.asset` (Unity lilToon presets), `.mat` (materials) and `.json`; dropping a file in detects the type automatically.
- **Export**: produces lilToon preset text that Unity can load directly, using lilToon's original field names (`_UseOutline` etc.) and float32 values.

Related details:

- **19 official presets built in**, generated directly from lilToon's `Presets/*.asset` (not hand-transcribed). Categories (skin, hair, cloth, nature, inorganic, effect, other) match Unity.
- **Per-material configuration**: a material dropdown at the top of the panel lets you apply a preset or change parameters for one material while the rest keep global defaults; modified materials are marked and overrides can be cleared in one click.
- **Export lives inside the lilToon parameter panel**, matching Unity's habit (preset import/export are in lilToon's own menu). On export you can choose:

  - **Type**: default "auto", guessed from the material name (hair→hair, skin→skin, cloth→cloth, others→other); or pick one of the seven manually.
  - **Shader**: default "auto", derived from the current parameters; or pick a specific variant manually.
  - **Export current material**: one `.asset` per material, named `model_material.asset`.
  - **Export all materials**: one file per material.

---

### 3. Sub-shader (variant) handling

This was the key finding of the interoperability work, so it gets its own section.

**Unity's lilToon "main shader" does not contain every feature.**
The main shader `lilToon` (`lts.shader`) carries only four passes (`FORWARD`, `FORWARD_ADD`, `SHADOW_CASTER`, `META`) and **no outline pass**.
So with the main shader, `_UseOutline = 1` still renders no outline; you must switch to `Hidden/lilToonOutline`, which adds `FORWARD_OUTLINE` etc.

lilToon ships **64 shaders**, of which **only 1** has a name selectable in the material panel; the other 63 are `Hidden/*` or `_lil/*` variants (glass refraction, transparent, fur, gem …) that **can only be bound through presets**.

So the viewer derives and writes the correct sub-shader when exporting:

```
base mode from _TransparentMode
  ├ outline on ⇒ switch to the matching *Outline variant
  ├ that mode has no outline variant (refraction / fur / gem) ⇒ fall back to one without outline
  └ parameters can't decide (refraction, transparent) ⇒ use what the preset itself carries
```

The export UI shows which variant will be bound, e.g.
"Sub-shader → Hidden/lilToonOutline (Opaque + outline)".

---

### 4. Changes to the viewer itself

Compared with the previous widget, the entire interface was replaced:

- **Floating windows**: every panel is a draggable, minimisable, dockable floating window.
- **Panels**: shading and outline, lilToon parameters, parts, scene, export.
- **Lighting presets**: day, morning / evening, night, plus fine controls for key-light azimuth, elevation, strength and colour and ambient sky/ground colours.
- **Render modes**: original PBR, toon Cel; outlines can be toggled and thickened.
- **Parts panel**: hide optional parts and props (including hiding props by bone scale), with lock and isolate.
- **Scene helpers**: ground grid, axes etc., all off by default, explicitly enabled on the main page.
- **Camera**: top, bottom and axis views, default front view, 720° continuous rotation.
- **Model position correction**: rotation pivot and model offset are configurable, solving "the character leaves the frame".
- **FBX support**: the previous release only took glTF; this one supports FBX and handles the absolute texture paths common in FBX (match by file name, `textureBase` / `textureMap` fallbacks).
- **Config-driven**: the whole parameter set is JSON (`assets/sample.json` is the baseline), with URL parameters, auto-loading of a same-named config and exporting of the current config.
- **Embedding**: a self-contained single-file build (no importmap), configured via `data-ba3d-*` attributes or the JS API.
- **Mouth fix**: keeps the previous approach (UV island split + mouth atlas + `bone_mouth` driver); materials now follow the render mode.

The project changed too:

- From `src/` modules + a `dist/` widget to `viewer.js` + `index.html` + `assets/`, plus a self-contained single-file build.
- **Generators and checkers** added: the lilToon property table, field mapping table, presets and shader table are all generated from the lilToon source by scripts with a `--check` mode; plus several consistency checkers and a fixed deploy manifest.

---

### 5. Bugs fixed

- **Culling direction was inverted**: Unity's `Cull Back` means "cull back faces" (draw front faces); it had been read as "draw back faces only", so applying presets flipped the model inside out and it looked white.
- **Cutoff threshold misused**: `_Cutoff` only applies in Cutout mode, but it was applied whenever a config contained a cutoff; since `_Cutoff` defaults to 0.5, existing alphaTest values were forced to 0.5, cutting away semi-transparent pixels and making materials look transparent. Now it is only used when the mode really is Cutout.
- **Shadow master switch not wired**: `_UseShadow` had no mapping at all, so 5 of the 19 official presets (skin·flat, skin·outline, metal MatCap, glass, light glass) that explicitly disable shadows still showed them after applying.
- **Derived switches made self-consistent**: switches derived from sub-parameters (`_UseRim` / `_UseMatCap` / `_UseOutline`) no longer produce bogus "unrecognised fields" during export self-check, and round-tripping between config and presets no longer overwrites each other.

---

### 6. Known limitations

- Of lilToon's 517 properties we map 228; among the rest are fields that **do affect appearance but are not implemented** — in the shadow banding, emission, reflection, MatCap, rim, backlight and dissolve groups. They neither affect the preview nor get exported. The full gap list is in `LILTOON2.x.md` and the "not done" section of `CONFIG.md`.
- **Exporting `.mat` material files is not implemented** (import only). Unity materials can be imported, but generating `.mat` is still missing.
- Refraction, fur and gem modes have no web-side shader implementation; the preview treats them as transparent with a notice, while export still writes the correct sub-shader.
- Multiple instances each own a renderer and GPU resources (inherited limitation); if you need several characters, switching one instance is recommended.
