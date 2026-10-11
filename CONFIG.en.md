# BA3D configuration JSON field reference

[中文](CONFIG.md) ｜ **English** ｜ [日本語](CONFIG.ja.md)

> **lilToon baseline: 2.3.4**
> **UI labels are kept in their original Chinese** — the viewer's UI itself is Chinese-only — with a translation added on first occurrence.
>   · Source map (2.3.4 line numbers), version-difference list ⇒ [`LILTOON2.x.md`](LILTOON2.x.md)
>   · Comparison and verification record for the old baseline (1.3.7) ⇒ [`LILTOON1.x.md`](LILTOON1.x.md) (archived, line numbers are 1.3.7's)
>
> The `lil_*.hlsl:NNN` line-number references in this document are **all aligned to 2.3.4**.

One configuration file `assets/<角色>.json` describes "model + mouth fix texture + scale/framing + rendering/lighting/background + default motion".

**Relative paths are always resolved against the directory containing this JSON** —— so if you put the json and the glb in the same folder,
the paths hold no matter where the site is deployed or who embeds it. Absolute URLs (`http(s):` / `data:` / `blob:`) are used as-is.

For a complete example see `assets/sample.json` (example model CH0155) and `assets/fallback.json` (another configuration template for the same model).

---

## 1. Top-level fields

```jsonc
{
  "_comment":   "free-form note, not involved in rendering",
  "model":      { ... },   // model file and mouth texture
  "pivot":      { ... },   // rotation pivot offset
  "renderer":   { ... },   // scale / framing / rendering / outline
  "lighting":   { ... },   // lighting
  "background": { ... },   // background
  "animation":  { ... },   // default motion and external Unity .anim
  "camera":     { ... }    // declarative camera (fill in Unity units, reproduces Unity framing)
}
```

---

## 2. `model` —— model and mouth texture

| Field | Type | Default | Description |
|---|---|---|---|
| `url` | string | `./assets/sample.glb` | Model file. **`.glb` (self-contained) is recommended**; with `.gltf`, if the textures/`.bin` are external files, loading will fail |
| `mouthAtlas` | string \| `null` | `null` | Atlas used for the mouth fix (the kivo set). **Not configured = no mouth fix** —— suited to models whose mouth shapes are originally driven by a separate mesh / morph target |

**About the mouth fix**: in the original model the mouth's UVs fall in the pure-black placeholder region of the texture, so the mouth is black.
The viewer finds that face-texture mesh by "material name contains `EyeMouth`", then cuts out the mouth by **the UV island whose z is lowest**,
and swaps in the corresponding mouth shape from the atlas. CH0155 and CH0273 measured mouth UVs are exactly identical (`u[0.0086,0.2413] v[0.7926,0.9574]`),
so the cell layout is universal.

> Meshes sharing the same material may be multiple (CH0155 has Body+Star, CH0167 has Mouth+FaceOutline+Eye),
> and the way to decide "which one is the mouth" is **whether the selected island's UVs fall in the mouth region** (consistent across these BA model generations:
> u≈[0.009,0.241] v≈[0.793,0.957]), overridable with `renderer.mouthUv`.
> Just looking at "whose z is lowest" does not work —— CH0155's Star (eye highlight) has a lower z than the mouth.

> **Without `model.mouthAtlas`, no mouth fix is done** (default behavior). The fix is for that batch of models where "the mouth is mixed into the EyeMouth mesh and
> renders as a black block"; whereas for a batch like the BA series, each mouth shape is originally driven by a **separate mesh + morph target**
> (measured: at morph weight 1 the mouth shape is thrown out to 17 times its own size = hidden, and it only shows when the animation sets it to 0),
> so forcing the fix on instead would tear the eyes off as if they were the mouth. Therefore:
>
> - Need the fix → write `"model": { "mouthAtlas": "./mouth/xxx.png" }` in the json (or add `data-ba3d-mouth` to the container)
> - No fix needed → **write nothing**, and at load time it prints `[fixMouth] 未指定嘴部图集 … → 跳过嘴部修复`

Atlas requirements: square, **8 × 8 grid** (`Character_Mouth_2.png` is 1024², `Character_Mouth_High.png` is 2048²).

> **The number of usable cells depends on the specific atlas** (conclusion from per-cell sampling measurements):
>
> | Atlas | Size | Cells that are really mouth shapes | The rest |
> |---|---|---|---|
> | `Character_Mouth_High.png` | 2048² | **#0 ~ #63 (all 64 cells)** | — |
> | `Character_Mouth_2.png` | 1024² | #0 ~ #17 | From #18 on it is a pure cyan (0,198,188) placeholder |
> | `Character_Mouth_Black.png` | 1024² | #0 ~ #50 | From #51 on it is a cyan placeholder |
>
> Index images (8×8 with numbers, so you can pick cells directly):
> `assets/mouth/_cells-preview-high.png`, `assets/mouth/_cells-preview-2.png`.
> The pattern: **mouth opening increases from left to right**, and column 0 is almost a closed thin line.

---

## 3. `pivot` —— rotation pivot (horizontal offset, world units)

| Field | Type | Default | Description |
|---|---|---|---|
| `x` | number | `0` | Left/right offset of the rotation axis |
| `z` | number | `0` | Front/back offset of the rotation axis |

The character is already **automatically centered on its real content + feet on the ground**, so normally keep `0`.
Only when a model's center of gravity is especially off (for example holding a very large weapon) is fine-tuning needed.

---

## 4. `renderer` —— scale / framing / rendering

### FBX textures (`textureBase` / `textureMap`) ★

**FBX stores texture paths inside the file** —— commonly an absolute path on the exporter's machine (`C:/art/tex/body.png`),
and with **Windows backslashes** (which the browser encodes as `%5C`). So the textures very easily all 404.

We use one `LoadingManager.setURLModifier()` to intercept all texture requests (`TextureLoader` ultimately goes through `manager.resolveURL()`), handling them in order:

1. **Backslash → forward slash** (mandatory, otherwise the path is simply wrong)
2. **Strip the drive letter** (`C:/art/tex/body.png` → `art/tex/body.png`)
3. **Three-level `textureMap` matching**: full URL → without query string → **file name only**
4. **`textureBase` fallback**: base directory + file name (only used when the path looks like an external absolute path, to avoid breaking normal relative paths)
5. If nothing matches, **return as-is** and hand it to the default logic (relative paths already resolve for URL loads)

#### Three usages

**① A Texture subdirectory on the server** (URL load)

```jsonc
"renderer": { "textureBase": "./Texture/" }
```

**② Textures in another directory / renamed**

```jsonc
"renderer": {
  "textureMap": {
    "body.png": "./Texture/body_diffuse.png",
    "C:/artist/tex/hair.png": "./Texture/hair.png"
  }
}
```

**③ Local drag-in (upload)**

The "Custom model" panel has gained **"Choose textures (multi-select allowed)"** and **"Choose an entire texture folder"** ——
the selected files are mapped by **file name** (`body.png → blob:…`) —— whatever path is stored in the FBX does not matter; matching by file name is enough.

> All paths are resolved **relative to the directory containing the configuration file**, same as `model.url`.

### Automatic loading of the same-named configuration (`autoConfig`)

When loading a model, if **no configuration was specified explicitly** (neither `configUrl` nor `config` given),
it will automatically look for a **same-named .json in the same directory**:

```
assets/sample.glb   →   assets/sample.json     found → use it.
assets/Natsu.glb    →   assets/Natsu.json      absent → skipped silently (one 404, does not affect loading)
drag in a local file →   no probing (a blob: has no concept of "same directory")
```

Priority (`resolveConfig()`):

1. `configUrl` —— explicit; if it cannot be read it will **error**
2. `config` —— give the object directly
3. **Same-named JSON auto-discovery** —— unreadable/unparsable are both **silent** and do not block loading

Relative paths in the configuration are always resolved against **the directory containing the configuration file** —— so `./sample.glb` and `./mouth/xxx.png` in `sample.json` both resolve correctly.

Turning off auto-discovery:

```js
createViewer(el, { autoConfig: false })
```

> On a hit the console prints `[autoConfig] 已自动加载同名配置：<url>`.
> Note that `model.url` in the same-named JSON will **override** the model address given by the caller —— this is the existing behavior (explicit configuration wins),
> so when `sample.json` says `./sample.glb` it still loads the same model and **does not load it twice**.

### 4.1 Scale and framing (important)

| Field | Type | Default | Description |
|---|---|---|---|
| `targetHeight` | number | `2.0` | **The character's real height (world units)**. The normalization baseline |
| `modelHeightPx` | number | `360` | **The character's on-screen height (CSS pixels)** ← this is the "default scale" |
| `framing` | `"tight"` \| `"auto"` | `"auto"` | Framing mode, see below |
| `modelRotation` | `[x,y,z]` \| `null` | `null` | Adds rotation to the model after loading (unit: **degrees**). **FBX is often Z-up and needs it**, e.g. `[-90,0,0]`; GLB generally does not |
| `textureBase` | string \| `null` | `null` | **FBX texture base directory**, e.g. `"./Texture/"`. Equivalent to `fbxLoader.setResourcePath()` |
| `textureMap` | object \| `null` | `null` | **Exact FBX texture mapping** `{ "文件名或原路径": "实际URL" }`. FBX often stores absolute paths from the exporter's machine, so **matching by file name** is most reliable |
| `framingReferenceHeight` | number | `0` | Reference canvas height; when `>0` the camera parameters are computed from it as fixed world quantities |
| `framingOffsetY` | number | **`22`** | Framing vertical offset (CSS pixels, positive = framing moves down ⇒ **picture content moves up**) ⚠️ the default is **not 0**, see below |
| `fov` | number | `30` | Vertical field of view |

**The difference between the two height fields** (easy to confuse):

- `targetHeight` only governs **the model's height in the 3D world**, used to normalize different models to the same scale.
  It **does not affect on-screen size** —— because the camera distance is adjusted proportionally.
- `modelHeightPx` is what determines **on-screen size**: how many pixels the character's real content occupies on the reference canvas.
  Because normalization uses "real skinned content" rather than the bounding box, **the same `modelHeightPx` gives
  the same on-screen size on any model**.

```jsonc
"targetHeight": 2.0,        // the character is 2 units tall in the world
"modelHeightPx": 360,       // 360 pixels tall on screen
```

**How to adjust when swapping models**: start with the same configuration. If that model's motions have a large range (for example kneeling or lying down),
the character will exceed the panel —— then **just reduce `modelHeightPx`** (wheel scrolling to zoom is only temporary and is not saved).

> Measured references (panel 420×430, with all common motions and no cropping):
> - CH0155: `modelHeightPx: 360` → needs 308×405.
> - CH0273: `modelHeightPx: 275` → needs 309×394.

**The two `framing` modes**:

- `"auto"` (default) —— baseline framing. The character occupies about 85% of the picture height and changes with the container size.
- `"tight"` —— centers on the **real skinned content** (a full-box bounding volume on a skinned mesh is unreliable and would make the character off-center + floating),
  and together with `framingReferenceHeight` fixes the camera parameters as world quantities.

**What `framingReferenceHeight` does**:

| Value | Behavior |
|---|---|
| `0` (not configured) | Camera distance scales with canvas height → character pixel size is constant (pixels locked, size unchanged when the container changes) |
| `>0` (e.g. `430`) | Camera parameters are computed from that height as **fixed world quantities** → **when the panel is scaled by percentage the whole picture scales proportionally** |

Changing the panel size by percentage (`420×430` → `630×645` → `252×258`) requires no other configuration change.

### 4.2 Root motion (the character "running out of frame")

| Field | Type | Default | Description |
|---|---|---|---|
| `stripRootMotion` | `"compensate"` \| `"root"` \| `"xyz"` \| `"xz"` \| `false` | `"compensate"` | Root motion handling: **`"compensate"` object-level cancellation (default, animation tracks untouched)**; `"root"`/`"xyz"` rewrite the tracks (splits props apart, only for special models); `"xz"` keeps jumps; `false` turns it off |
| `pressHoldMs` | number | `200` | How long the left button must be held on the model to count as a "press" (otherwise it is a click, see section 9) |
| `mouthUv` | `[u0,u1,v0,v1]` | built-in value | The mouth's UV region in the atlas, used only when "multiple meshes share the EyeMouth material" to decide which one is the mouth |
| `mouthCell` | number \| `null` | `null` | **Default mouth shape** (atlas cell 0~63): which cell to use when the motion does not drive the mouth bone; `null` = the first mouth shape |
| `visibilityRules` | array | `null` | **Toon (Cel / Toon) shading tunables**: the toon mode uses `MeshToonMaterial` + `onBeforeCompile` injection,
**without rewriting the whole pipeline** (textures / skinning / morph / shadows / vertex colors are all preserved). It injects in two places:

1. **Replaces `getGradientIrradiance`** —— its return value is **multiplied onto the light color**, so the band count and the shadow tint are both computed here
   (the DataTexture gradient map is no longer needed):
   ```glsl
   float q = floor( t * 4.0 ) / max( 4.0 - 1.0, 1.0 );   // 4 hard-edged bands
   float v = 0.5500 + 0.4500 * q;                          // darkest 0.55
   return mix( vec3(1.0), vec3(1.0), v );                  // shadow tint (white when null)
   ```
   **The defaults are mathematically equivalent to the old implementation** (what the old DataTexture generated was exactly 0.55 / 0.70 / 0.85 / 1.00), so the default appearance changes by zero.
   ### Band colors + transition band (`celBandRamp` / `celBandSoft`)

   **Not enabled by default** —— when `celBandRamp = null` it goes through exactly the old formula above, and **the generated GLSL is byte-identical**,
   so the regression guarantee that "cel mode has not changed" still holds. Only ticking "band colors" on the panel switches to the version below.

   Previously there was only one "darkest band brightness + shadow tint", the transition between light and dark was **linear**, and every band could only use the same hue.
   Now you can give **each of the 4 color stops its own color** (darkest segment → brightest segment), with each band taking the color of its own band:

```glsl
vec3 ba3dRamp4( float u ) {              // 4-color-stop table lookup (top-level function —— GLSL does not allow nested definitions)
  float x = clamp( u, 0.0, 1.0 ) * 3.0;
  vec3 a = mix( C0, C1, clamp( x,       0.0, 1.0 ) );
  vec3 b = mix( C1, C2, clamp( x - 1.0, 0.0, 1.0 ) );
  vec3 c = mix( C2, C3, clamp( x - 2.0, 0.0, 1.0 ) );
  return mix( mix( a, b, step( 1.0, x ) ), c, step( 2.0, x ) );
}
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
  ...
  float x  = t * 3.0;                  // = STEPS-1
  float bi = floor( x );               // segment index
  float bf = x - bi;                   // position within the segment
  float s  = SOFT > 0.0005 ? smoothstep( 0.0, SOFT, bf ) : 0.0;   // transition band
  float d  = max( 3.0, 1.0 );
  float u0 = bi / d, u1 = min( u0 + 1.0 / d, 1.0 );
  return mix( ba3dRamp4( u0 ), ba3dRamp4( u1 ), s );
}
```

   | Key | Type | Default | Description |
   |---|---|---|---|
   | `celBandRamp` | 4×`[r,g,b]` or `null` | `null` | 4 color stops, **from the darkest segment to the brightest segment**. `null` = the old formula |
   | `celBandSoft` | number | `0` | **Transition band width** between segments, 0~1. 0 = hard edge (`floor`, consistent with the old formula) · 0.5 = the second half of each segment is smoothed · 1 = the whole segment is in transition. Only takes effect for `celBandRamp` |

   ⚠️ Each band gets **a color interpolated from the color stops** (with `bandSoft = 0` it is a hard-edged switch),
   not "one independent slider per band". 4 color stops are enough to express cool/warm banding while keeping the panel from exploding.

   ⚠️ When "band colors" **is not ticked** on the panel, `bandRamp` is passed `null` and `bandSoft` is passed `0` —— exactly the same as never having opened it.

```jsonc
"celBandRamp": [                 // blue-purple shadows → white highlights, four hues
  [0.16, 0.14, 0.25],
  [0.42, 0.39, 0.53],
  [0.66, 0.63, 0.75],
  [1.0,  1.0,  1.0 ]
],
"celBandSoft": 0.25              // smooth 1/4 of the segment between bands
```

```js
viewer.setCel({ bandRamp: [[0.2,0.1,0.3],[0.5,0.4,0.6],[0.8,0.75,0.9],[1,1,1]] });
viewer.setCel({ bandSoft: 0.4 });
viewer.setCel({ bandRamp: null });          // restore the old formula
```

2. **Overrides `vNormal` (face/eye/brow only)** —— forces the normal to point at the camera (view space's `+z`).
   Otherwise, when the head turns, the lighting on the face follows the normal and patchy dirty shadows appear; this is standard practice in anime rendering.
   **For that BA batch of models it is recommended to turn on** `"celFaceLight": true`.

```jsonc
"renderer": {
  "shading": "cel",
  "celSteps": 2,                              // hard-edged two levels, more "paper-cutout"
  "celDark": 0.62,                            // shadows a bit brighter
  "celShadowTint": [0.72, 0.62, 0.85],        // shadows tinted purple instead of going black
  "celFaceLight": true                        // facial light correction
}
```

It can also be changed at runtime (try it right in the console, the material is rebuilt immediately):

```js
viewer.getCel();                                  // see the current parameters
viewer.setCel({ steps: 2 });                      // switch to hard-edged two levels
viewer.setCel({ faceLight: true });               // turn on face correction
viewer.setCel({ shadowTint: [0.72, 0.62, 0.85] });// shadows tinted purple
viewer.setCel({ shadowTint: null });              // restore
```

**The face does not receive shadows (`faceNoShadow`)**: under daylight the hair casts a very obvious shadow on the face, while in the official rendering the face is basically "clean".
Turning this on disables `receiveShadow` on the face meshes —— the shadow map no longer acts on the face, but **the shadow the hair casts on the body is unaffected**.
The test reuses `facePattern`, so `_Toon` materials in toon mode match as well.

Measured matching results:

| Model | Shadows off (face) | Shadows kept |
|---|---|---|
| `sample.glb` | 4 (Face / Eyebrow / EyeMouth / Star) | 7 (Hair / Body / Weapon / Milk / Pie …) |
| BA `Hoshino.glb` | 19 (16 Mouth_* + Face + Eyebrow + EyeMouth) | 5 (Hair / Body / Shield / Weapon / Halo) |

```jsonc
"renderer": { "faceNoShadow": true }
```

Runtime switch:

```js
viewer.getFaceNoShadow();          // { enabled, pattern, meshes }
viewer.setFaceNoShadow(true);      // takes effect immediately
viewer.setFaceNoShadow(false);     // restore
```

**Self-shadow vs. hair cast shadow (`noCastPattern`)** —— an important limitation:

**A standard shadow map cannot distinguish "self-shadow" from "something else's cast shadow"**. The shadow map only records what depth blocks each pixel;
it does not know whether the occluder is the object itself. Therefore:

| Want | How | Cost |
|---|---|---|
| No shadow at all on the face | `"faceNoShadow": true` (default) | Self-shadow is lost too |
| **Face keeps self-shadow, bangs do not cast** | `"faceNoShadow": false` + `"noCastPattern": "Hair"` | **Hair no longer casts onto the body/shoulders** |
| Face receives no shadow, but hair casts as usual | `"faceNoShadow": true` | Same as above (self-shadow gone) |

Giving the face its own non-casting light via layers **also does not solve it** —— that light carries no shadow itself, so the face still has no self-shadow.

Measured hits for `noCastPattern: "Hair"` (1 mesh each, very precise):

| Model | Hits |
|---|---|
| `sample.glb` | `CH0155_Body_1 [CH0155_Hair]` |
| BA `Hoshino.glb` | `Hoshino_Original_Body_6 [Hoshino_Original_Hair]` |

```jsonc
"renderer": {
  "faceNoShadow": false,      // the face receives shadows again (self-shadow is back)
  "noCastPattern": "Hair"     // but the hair does not enter the shadow map → the bangs do not cast a patch on the face
}
```

> Note: whether self-shadow can appear on the face also depends on the face mesh's own **curvature** and `castShadow`.
> A flat card-like face has almost no self-shadow to see; only one with a nose bridge/chin relief shows it clearly.

### Toon (Cel): apart from shadows ≈ unlit ★

**Only affects the toon path; PBR is completely untouched** (the multipliers are written only in the `cel` branch, and the daylight preset values stay as they are).

#### Two key points

1. **Shading banding**: `celSteps: 2` (only "lit / shadow" two levels) + `celDark: 0.80`.
   The banding puts **all lit surfaces at the same brightness** —— this is exactly where "identical to unlit apart from shadows" comes from.
2. **Tone mapping**: toon goes through `LinearToneMapping` (mathematically equivalent to `× toneMappingExposure`).
   ACES pushes both bands toward pure white: measured lit 1.03 / shadow 0.83 become, after ACES,
   **0.85 / 0.82, with the contrast dropping from 19% to 8.5%, and the shadow visibly muddying**.
   Proportional scaling → **the shadow contrast is preserved as-is**, and only then does the exposure knob actually work for adjusting brightness.

#### Toon light compensation (`applyLightingPreset`)

MeshToonMaterial **does not support envMap**, and RoomEnvironment's ambient lighting is lost entirely, so it must be compensated;
but **the direction of the compensation is critical**. The rendering formula:

```
lit    = hemi×0.62 + key×1.0     + rim + fill
shadow = hemi×0.62 + key×celDark + rim + fill     ← what the cast shadow blocks is the entire key light
```

**hemi appears in both terms → the higher it is, the more the shadow is washed out.**
The old code used hemi ×1.25 (trying to add the ambient light back), and as a result lit/shadow were both pushed toward pure white → the shadow disappeared.
Now it is the reverse: **substantially lower hemi and let the key light dominate**, with the backlit side carried by the banded `celDark` level.

| Parameter | Original value | Toon multiplier | Result | Role |
|---|---|---|---|---|
| `hemi.intensity` | 0.5 | **× 0.48** | 0.24 | Ambient light appears in both the lit/shadow terms; **the lower it is the clearer the shadow** |
| `key.intensity` | 2.0 | **× 1.22** | 2.44 | The main force: responsible for lit brightness + cast-shadow contrast |
| `rim.intensity` | 1.2 | **× 0.15** | 0.18 | Pressed down to almost invisible (casts no shadow and only dilutes the shadow) |
| `fill.intensity` | 0.4 | **× 0.15** | 0.06 | Same as above |
| `exposure` | 1.0 | **× 1.15** | 1.15 | Toon's only master brightness gate |

**The multipliers have been calibrated by measurement**: with the brightness slider at **2.1** the look matches unlit, so 2.1 was folded directly into the multipliers —— keeping `lightingScale` at 1.0 is then correct by default, and it can still be adjusted further.
The shadow contrast is about **17%** (`celDark: 0.80`, lighter than the original 0.72's 24%, adjusted per measured feedback).
The backlit side is carried by the 0.80 band and will not go black.

#### Cast shadow strength (`celShadowMin`) ★ this is a different thing from celDark

User feedback said "the shadow falling on the body is still very strong" —— that is not a banding issue but the **cast shadow**:

| | Cause | Controlled by |
|---|---|---|
| **Banding** | Normal faces away from the light → the key light is discounted | `celDark` (0.80 = one band darker) |
| **Cast shadow** | Blocked by hair/body → the key light is **cut off entirely** | `celShadowMin` |

In r160 the directional light's shadow is **inlined** in `lights_fragment_begin`:

```glsl
directLight.color *= ( directLight.visible && receiveShadow )
    ? getShadow( directionalShadowMap[i], … ) : 1.0;
```

And `getShadow` returns only 0 or 1 —— **all or nothing**, and the `celDark` band cannot reach it at all.
So only ambient light remains in the shadow, which looks especially strong.

The handling: remap the result to `mix( keep, 1.0, s )` ——
lit (s=1) as-is, cast (s=0) keeps `keep` times the key light. **Currently defaults to `0.3`** (calibrated by measurement: 0.5 too light, 0.3 right).

> ⚠️ **There is a pitfall in the implementation that must be noted**: three's call order is
> `WebGLRenderer → material.onBeforeCompile(parameters, renderer)` (callback),
> `WebGLProgram → resolveIncludes(fragmentShader)` (only then are includes expanded).
> That is, **what the callback receives is still the raw source containing `#include`**, and searching directly for the `getShadow(…)` line will not find it
> (the cel gradient works precisely because what is replaced is the `#include` itself).
> Here we take the original text of `THREE.ShaderChunk.lights_fragment_begin`, soften it, and substitute it for that include as a whole, guaranteeing it is word-for-word identical to three's original.

#### ✅ The truth about facial shadows (the conclusion after three rounds of investigation)

The conclusion was revised twice and finally settled with an **accurate occluder test using Raycaster** —— cast rays from face vertices toward the key light direction and see whether they are blocked by hair:

```
key light direction (0.38, 0.77, 0.51)
sample.glb   266 face vertices → 229 blocked by hair (86.1%)
Natsu.glb    288 face vertices → 148 blocked (51.4%)
hit distance = 0.000 ~ 0.001        ← this is the key
```

**There really are cast shadows on the face**, and they are **fitted close** (face and hair interpenetrate).

The real culprit is `keyLight.shadow.normalBias = 0.02` —— it **pushes** the shadow sampling along the normal,
and 0.02 on a model only ~2 units tall is **20 times the 0.001 contact distance** → the cast shadow on the face is wiped out entirely.
The body's shadow remains because the gap there is much larger; the phenomenon matches completely.

> Both earlier rounds of judgment were wrong: first saying "it's banding not casting", then saying "it cannot be cast geometrically".
> The first round was wrong in treating the dark band on the forehead as the only possibility; the second was wrong in sampling using the **model center** as the face, so what was measured was not the face at all.

**Tried but ineffective**: changing `shadowNormalBias` from 0.02 to 0 —— measured result: **the face shadow still did not appear, and it made the lighting strange instead**, so it was reverted to the original value.
So this inference **does not hold**; the investigation process is recorded here only, do not follow it to adjust anything.

> The two values are still kept as configuration items (`shadowBias` / `shadowNormalBias`), defaulting to the values the viewer has always used.

#### Facial shadow: **one parameter only** (`celFaceShadowMin`)

The strength itself expresses "whether there is any": **dragged to the far right (≥0.95) = no facial shadow**, so a separate switch is no longer needed.

| `celFaceShadowMin` | number \| `null` | **`0.7`** | **The only parameter for facial shadows**: `0` = deepest, `>= 0.95` = no facial shadow, `null` = follow `celShadowMin` |

| Value | Meaning |
|---|---|
| **`0.7` (default)** | A cast shadow on the face **lighter** than on the body (0.3) |
| `null` | Follow the global `celShadowMin` |
| `0` | The face keeps the original hard shadow (deepest) |
| `0.3` | Same level as the body (soft) |
| `>= 0.95` | **No facial shadow** |

In the implementation this value drives two things at once, **one parameter covering two rendering paths**:

1. **Toon**: rewrites `getShadow(...)` inside `lights_fragment_begin` → `mix(keep, 1.0, s)`, controlling the cast shadow strength
2. **Common to both**: when `>= 0.95` it derives `faceNoShadow = true`, directly turning off `receiveShadow` on the face meshes
   —— `receiveShadow` is checked by **all material types** in `lights_fragment_begin` (toon / standard / lambert / phong),
   so the PBR path is covered as well (softening via the shader alone is ineffective for PBR)

UI: the **"Face" slider** (next to it is the global "shadow strength"). While it has not been touched it follows the global and displays in sync in real time; as soon as it is moved it becomes an independent value.
To go back to following: write `null` in the configuration, or `viewer.setCel({ faceShadowMin: null })`.

> Things that were removed: the separate "facial shadow" switch, and the `setFaceNoShadow()` API —— both were merged into this one parameter.
> `renderer.faceNoShadow` is no longer read either (it is ignored if written in the configuration).

At the bottom right of the index page there is a **"shadow strength" slider** (0 ~ 0.95) for real-time adjustment. It can also be written in the configuration JSON:

```jsonc
"renderer": {
  "celShadowMin": 0.3,        // whole-body cast shadows: 0 = hard shadow, 1 = none at all
  "celFaceShadowMin": null,   // a separate level for the face; null = follow the one above. Set 0 to make the face shadow deepest
  "celSteps": 2,              // only lit/shadow two levels
  "celDark": 0.80,            // banded strength of backlit surfaces
  "shadowNormalBias": 0.02,   // distance the shadow is pushed along the normal (default value, not tuned)
  "shadowBias": -0.0003
}
```

Equivalent at runtime: `viewer.setCel({ shadowMin: 0.3 })`

#### Fine-tuning (the index page already has a "light brightness" slider + numeric input)

- **Shadow too light** → adjust `viewer.setCel({ dark: 0.68 })` (the smaller `celDark`, the deeper the shadow; currently 0.80)
- **Overall too dark/too bright** → **the "light brightness" slider in the UI** (real time; both paths consume it, 1.0 = preset original value)
- Toon additionally has a master gate `toneMappingExposure × 1.15`; adjusting it likewise scales proportionally without damaging shadow contrast
- **Want more "cartoon" banding** → `viewer.setCel({ steps: 4 })` (back to a four-level gradient)

> `faceNoShadow` defaults to `false` (**facial shadows preserved**). After banding + pass-through the cast shadow is very clean,
> and the old fallback of turning off facial shadows is no longer needed; setting `true` still removes it.

### Optional parts and props (`hideOptional` / `hideParts`)

**This batch of models carries markers on the GLB nodes themselves** (lihaohong6/BlueArchiveModels, 44 of 295 have extras):

```json
"Hoshino_Original_Shield_Weapon": { "optional": true, "prop0": true }
"Juri_Original_Weapon":           { "optional": true, "prop0": true }
```

GLTFLoader puts extras into `object.userData`, so they can be read directly. The semantics are:
**parts marked `optional` are hidden by default and only shown when the current motion actually drives them** —— corresponding to the reference viewer's
`data-hide-parts="optional"`. The measurements match exactly:

| Model | Part | Shown in |
|---|---|---|
| `Hoshino.glb` | Shield | `Exs_Cutin` / `Exs` (2/36 clips) |
| `Juri.glb` | Weapon | `Formation_Idle` / `Tactical_Start` (2/8 clips) |

**On by default**, no configuration needed. This also automates the previously hand-written `visibilityRules` —— the same rule can now be deleted.

```js
viewer.getOptionalParts()
// [{ name: 'Hoshino_Original_Shield_Weapon_1', prop: true, usedBy: 2, visible: false }]
```

#### What about those "small objects in the wrong position"?

There is a batch of props (calculator / drone / clothing accessories) whose bones are **independent roots on the same level as `Bip001_Pelvis`**;
their position is decided by the game engine, is simply wrong in the GLB, and **reparenting does not fix it either** (the animation's local values were written for the original parent;
measured: after hanging Yuuka's calculator on the right hand, its distance to the hand went from 0.29 to 0.69 instead). Such things can only be hidden:

```jsonc
"hideParts": "Calculator|Dron"     // regex fragment, matches mesh name or material name
```

> Note that the `bone_cos1_01..04` kind are **clothing accessories** (driven by clips 31~33/44) and are supposed to be shown; do not hide them by mistake.

### Bone scale = hidden prop (`hideByBoneScale`)

**This batch of models generally expresses "this prop is not shown right now" by "scaling the driving bone very small"** —— but scaling to 0.3 is not 0,
so the shrunken prop still floats in place (measured: Airi.glb's ice cream hangs on the forehead).

The criterion: **all bone scales in that mesh's skeleton are below the threshold** (default 0.5). Using "all" rather than "take the minimum"
is to avoid damaging the character body by mistake —— the body has 100+ bones and always has some near 1, so they will never all be below the threshold;
a prop has only 1~2, so it is easily hit. Evaluated every frame (the scale changes with the motion), but meshes managed by `hideOptional` are skipped.

Measured results (this rule **exactly reproduces the hiding intent expressed by the model author**):

| Model | Mesh | Hidden in | Shown in |
|---|---|---|---|
| `Airi.glb` | Ice cream | `Cafe_Reaction` / `Cafe_Idle` / `Cafe_Walk` (scale 0.315) | The other 4 clips (0.761~1.0) |
| `Natsu.glb` | Pie `CH0155_Pie01` | **all motions** | — |
| `Natsu.glb` | Milk carton | `Formation_*` / `Normal_*` etc. | `Cafe_Idle` / `Cafe_Walk` / `Cafe_Reaction` |
| `Shiroko.glb` | Drone rocket / wing | **all motions** | — |

```jsonc
"hideByBoneScale": 0.5      // on by default; set 0 to turn off
```

### Halos are all black under PBR / Cel → zero normals (already auto-fixed) ★

**Symptom**: the model's halo is normal under `unlit`, but **pure black under PBR / Cel**.

**Cause**: a considerable number of models' **halo meshes have no NORMAL attribute at all**. Per the glTF spec,
when GLTFLoader encounters missing normals it fills an entire **zero-vector** buffer; zero normals give a constant 0 under lit materials → pure black.
Whereas unlit uses `MeshBasicMaterial`, which **does not read normals at all**, so it looks normal.

**Scope** (60 models scanned): 29 / 1078 meshes have zero normals, **28 of which are halos**
(`Airi_Original_Halo_1`, `Hoshino_Origina_Halo`, `Akari_Halo`, `Aris_Original_Halo_1` …).
There are also normal halos, for example `CH0155_Halo_1` (Natsu.glb) has normals of 1.000 —— **this defect is per-model**.

**Handling**: at load time do a sampled check on all meshes, and for those where **the whole thing is zero / NaN normals** call
`geometry.computeVertexNormals()` to recompute (yielding face normals, flat shading; just right for a thin sheet like a halo).
The sampled check guarantees normal meshes are not modified by mistake and that no full-scale cost is paid.

Measurements:

| Model | Before fix | After fix |
|---|---|---|
| `Airi.glb` | 333/333 vertices zero normals | 0/333, average length 1.000 |
| `Hoshino.glb` | 282/282 vertices zero normals | 0/282, average length 1.000 |
| `Natsu.glb` | 0/268 (already normal) | unchanged |

> Halos still **do not get outlines** by default (`outlineSkipPattern: "Halo"`) —— that is another, independent issue:
> a thin sheet + DoubleSide inverted hull pierces itself and flickers, unrelated to normals.

### Root motion: object-level cancellation, do not rewrite animation tracks ★

**Default `stripRootMotion: "compensate"`** —— cancels root motion at the **object level**: the animation plays as usual,
and each frame the root bone's displacement relative to `modelRoot` is read out and `modelRoot` is offset in the opposite direction.

#### Why the animation tracks must not be rewritten

The old approach (flattening the position tracks of `Bip001` / `bone_root`) has a fatal side effect:
those **props hanging under the model root that do not move with the skeleton** separate from the body. Measured:

| Model | Phenomenon |
|---|---|
| `Natsu.glb` milk carton | Moves from beside the mouth (57% of height) to the **top of the head** (90%) |
| `Airi.glb` ice cream | Likewise moves to the head |

And this pitfall runs deep: on `Airi.glb`'s chain there is **only `Bip001.position`** (no `bone_root`),
so even "flatten only the outermost" cannot save it.

#### Measured results of the new scheme

| | Root bone world sway | Prop distance from hand |
|---|---|---|
| Natsu `Vital_Death` | 0.539 → **0.000** | 0.24 → **0.24** (unchanged) |
| Hoshino `Exs_Root` | 3.010 → **0.000** | 0.42 → **0.42** (unchanged) |
| Airi `Exs` | 0.392 → **0.000** | 0.43 → **0.43** (unchanged) |

**Root motion is eliminated completely while not a single bone is touched** —— the props naturally stay at the positions the animation arranges.

#### Two implementation details

1. **Use "local coordinates relative to modelRoot" rather than world coordinates** —— world coordinates contain last frame's compensation amount,
   which would form self-feedback (lift → judged unnecessary → fall back → lift again). `worldToLocal` divides out `modelRoot`'s
   own translation cleanly, so it is naturally feedback-free.
2. **The local delta must be multiplied back by the model scale** —— `worldToLocal` **divides** by `modelRoot.scale`
   (usually 1.3~1.8 after normalization); without multiplying back it can only cancel 1/scale, and measured residual sway is 45~55%.

Only horizontal (X/Z) is canceled, **vertical is preserved** —— the up/down displacement of jumps/falling is what the motion itself is meant to express.

> Hoshino's `Exs_Root` has an original root displacement of up to **3.01 units** (the character is only 2 units tall),
> making it the motion that needs this mechanism most.

**Controlling mesh visibility per motion**: use it when a shield/weapon only appears in certain motions (see the explanation below) |
| `mouthIdle` | boolean | `false` | **Fallback mouth shape**: when the motion does not drive the mouth bone, let the mouth shape cycle on its own (see the explanation below) |
| `mouthIdleMs` | number | `180` | How long the fallback mouth shape stays on each cell (milliseconds), minimum 60 |

Some motions (walking `Move_Ing`, stage performance) translate the root node, and during model normalization the whole thing is scaled up by over a hundred times
(CH0273 is 150 times), so a raw displacement of 0.0126 becomes about 1.9 world units —— the character simply walks out of the frame.

- `"xyz"` —— wipes all three axes; the character **always** stays in frame. The cost: jump height and falling to the ground are also flattened
- `"xz"` —— wipes only horizontal displacement, keeping jumps / falling
- `false` —— no handling

The implementation **does not hard-code node names**: in CH0273 the carrier of the root motion is the Object3D `Bip001` (not a Bone, but its subtree contains all 141 bones).
The criterion is "from the topmost bone upward, any ancestor that has position animation".

### 4.3 Shading and outline

| Field | Type | Default | Description |
|---|---|---|---|
| `autoConfig` | boolean | `true` | When no configuration is given explicitly, automatically load the .json with the same name as the model (see the "Automatic loading of the same-named configuration" section) |
| `shading` | `"pbr"` \| `"cel"` \| `"unlit"` | **`"cel"`** | `pbr` (original) \| `cel` (toon, default) \| `unlit` (unlit) |
| `celSteps` | number | `2` | Number of toon shading bands (**2 = only lit/shadow two levels** → flat apart from shadows; 4 and above return to a multi-level gradient) |
| `celDark` | number | `0.80` | Toon darkest band brightness (1.0 = fully bright); **the smaller, the deeper the shadow**, 0.80 = only one band lighter |
| `celShadowMin` | number | `0.3` | **How much key light is kept in a cast shadow**: 0 = the original hard shadow, 1 = no cast shadow at all (toon mode only) |
| `shadowNormalBias` | number | `0.02` | Pushes shadow sampling along the normal (kept at the original value) |
| `shadowBias` | number | `-0.0003` | Shadow depth offset (kept at the original value) |
| `celFaceShadowMin` | number \| `null` | `null` | **The facial cast shadow strength on its own** (`null` = follow `celShadowMin`). Smaller than the global = a clearer face shadow; `0` = full-strength hard shadow |
| `celShadowTint` | `[r,g,b]` \| `null` | `null` | Toon shadow tint (0~1), e.g. `[0.72,0.62,0.85]`; `null` = darkens without a color shift |
| `celFaceLight` | boolean | `false` | **Facial light correction**: face/eye/brow normals forced toward the camera |
| `celFacePattern` | string | `Face\|EyeMouth\|Eyebrow\|Mouth` | Which material names count as "face" (regex fragment) |
| ~~`faceNoShadow`~~ | — | derived | **Changed to a derived field, no longer configured separately**: decided by `celFaceShadowMin` (or `celShadowMin` if unset), **≥0.95 is treated as no facial shadow** |
| `outlineSkipPattern` | string \| `null` | `"Halo"` | These material names get no outline (a thin-sheet inverted hull pierces itself → flickering) |
| `hideOptional` | boolean | `true` | **Parts marked `extras.optional` in the GLB are hidden by default** and only shown when a motion actually drives them |
| `hideByBoneScale` | number | `0.5` | **Hide props by bone scale**: when all bone scales in the mesh's skeleton are below this value it is treated as hidden; `0` = off |
| `lightingScale` | number | `1` | **Overall brightness multiplier** of the lighting preset (adjustable in real time at runtime with `viewer.setLightingScale(x)`) |
| `hideParts` | string \| `null` | `null` | Directly hide matching meshes (regex fragment, matches mesh name or material name) |
| `attachProps` | array \| `null` | `null` | Attach detached prop bones to character bones —— **measured unreliable**, prefer hideParts |
| `noCastPattern` | string \| `null` | `null` | **Material names that do not cast shadows** (regex fragment), e.g. `"Hair"`. Together with `faceNoShadow: false` it achieves "the face keeps self-shadow but the bangs do not cast on the face" |
| `outline` | boolean | `true` | Inverted-hull outline switch |
| `outlineThickness` | number | `0.002` | Outline thickness |
| `outlineColor` | `[r,g,b]` | `[0.10,0.07,0.11]` | Outline color (linear 0~1; the official one is a warm dark color, not pure black) |
| `outlineAlpha` | number | `1.0` | Outline opacity |
| `shadows` | boolean | `true` | Shadows (including the ground contact shadow) |

> In `cel` mode `MeshToonMaterial` **does not support envMap** and the ambient contribution is lost, so during framing the lights are compensated
> (hemisphere light ×1.25, key light ×0.8, exposure ×0.9). Switching back to `pbr` restores it automatically.

---

## 5. `lighting` —— lighting

| Field | Type | Default | Description |
|---|---|---|---|
| `preset` | `"day"` \| `"golden"` \| `"night"` | `"day"` | Daytime / morning-evening / night |
| `exposure` | number | `1.0` | Renderer exposure |

Lighting only changes the lights and **does not touch the background** —— the background is controlled independently by the fields below.

---

## 6. `background` —— background

| Field | Type | Default | Description |
|---|---|---|---|
| `transparent` | boolean | `true` | `true` = transparent background (**when embedded, the web page content below shows through**) |
| `color` | string \| number \| `null` | `null` | Used when not transparent; `#rrggbb` or `0xRRGGBB` |

The transparent background is implemented as renderer `alpha: true` + `scene.background = null` + `setClearAlpha(0)`,
so the canvas is genuinely transparent, not "painting a background the same color as the web page".

---

## 7. `animation` —— default motion and external animation

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | string | not configured → **random among motions whose name contains `idle`** | Initial motion |
| `clips` | array | `[]` | **list of external Unity `.anim`** (FBX usually does not carry animation). Each entry is `{ url, name?, group? }`; relative paths are likewise resolved against the directory containing the config file |
| `axisFix` | boolean | `true` | Coordinate conversion for external `.anim` (Unity left-handed → three right-handed). Set `false` when the model's axes do not match |
| `humanoid` | string \| object | `null` | **Humanoid muscle table** (URL or inline object): a Unity-side script measures "which bone, which axis, how many degrees per unit" for every muscle. With it, `.anim` files containing only muscle curves can play |
| `rootMotion` | bool | `true` | **Root motion** (`RootT` / `RootQ` inside Humanoid clips): apply the clip's translation and turn to the character. Turn it off to play the bone motion only, leaving the character in place |

Matching rules (tried in order): **exact name → case-insensitive exact → name contains (case-insensitive)**.
So both `"CH0273_Cafe_Idle"` and the short form `"Cafe_Idle"` hit.

**Humanoid motions need this table**: solving muscle values depends on the Avatar, and the Avatar is **not stored on disk**
(verified: `melano.fbx.meta` contains no mapping fields at all). Measure it once with the Unity-side script: select the
character → `Tools ▸ BA3D ▸ 导出 Humanoid 肌肉换算表（JSON）`, put the generated JSON next to the model and set
`"humanoid": "./humanoid-muscles.json"` here. The formula is "zero pose × ∏ single-axis rotations", **byte-for-byte the
same** as the script's self-check — the script reports the max angle error (≈0 means exact). The table is **per character**.

**Two ways to make a dance move**:
· **Bake** (most exact): in Unity run `Tools ▸ BA3D ▸ 把选中的 Humanoid .anim 烘成变换曲线` to get `*_transform.anim`;
  Unity solves it with the Avatar (foot IK included), so it matches frame by frame — and the script slims it to a few MB;
· **Read the `.anim` directly** (convenient): with a `humanoid` table it plays as is,
  and the clip's translation and turn (`RootT` / `RootQ`) are applied automatically too.

### 7.1 External Unity `.anim`

FBX in a Unity project usually **does not carry animation** —— motions and facial expressions are all separate `.anim` files (AnimationClip, YAML text).
The viewer reads them directly and routes them by curve type:

| What is in the `.anim` | Supported | Lands on in three |
|---|---|---|
| `blendShape.<name>` | yes | `morphTargetInfluences[i]` (facial expression) |
| `m_IsActive` / `m_Enabled` | yes | `visible` (outfit switching and part visibility, with stepped (discrete) interpolation) |
| `m_LocalPosition` / `m_LocalRotation` / `m_LocalScale` / `localEulerAnglesRaw` | yes | `position` / `quaternion` / `scale` (bone animation) |
| **Humanoid muscle curves** (things like `Chest Twist Left-Right`) | no | nothing —— the muscle values are relative to the Avatar T-pose, and the Avatar mapping is not in the `.anim` |
| `RootT` / `RootQ` (Humanoid root motion) | no | nothing |
| `m_PPtrCurves` (texture and material switching) | no | nothing |

**A clip containing unsupported curves is skipped as a whole** (no "half-application" —— otherwise the body stays in the bind pose while only the facial expression moves,
which looks wrong). When skipping, the console states which category, and how many of each.

Two prerequisites, both required:

- **Facial expressions require the model to have its own blendShape**: GLB can; **FBX cannot** —— three's FBXLoader does not parse FBX's
  BlendShape section ⇒ on an FBX model only the two kinds of `.anim`, "visibility" and "transform", can take effect.
- **Humanoid motions require an Avatar**: the `.anim` stores only normalized muscle values, and the bone mapping is in the Avatar (project settings),
  which the browser side cannot obtain ⇒ such clips cannot be solved.

**The way to make Humanoid motions work**: **bake them into transform curves** in Unity (sample every bone's `local*`
per frame, save as `<name>_transform.anim`) — the viewer plays those directly (including the
`m_LocalRotation.x/y/z/w` component form). Alternatively export the animation inside the FBX with the FBX Exporter.
Muscle values themselves cannot be solved in the browser — that needs the Avatar.

```jsonc
"animation": {
  "name": "Melano_DefaultFace",                              // initial motion (optional)
  "clips": [
    { "url": "./anim/Facial/Melano_smile.anim", "group": "face" },
    { "url": "./anim/Gimmick/shoes_ON.anim",    "group": "parts" }
  ]
}
```

`group` is just a label for the caller (menu, embedding page) to categorize by; the viewer does not depend on it.
`getAnimations()` additionally returns each segment's `overlay` / `kind` (`body` / `face` / `parts`) / `source`:
**Facial expressions and outfit switching are overlay** —— playing them does **not** interrupt the current body motion (in Unity they are likewise layered).

### 7.2 Declarative camera (top-level key `camera`)

Use it when you want `?config=` to reproduce the Unity scene's framing directly (instead of the viewer framing it automatically).
**Fill in each value in Unity units**; the conversion is left to the viewer:

```jsonc
"camera": {
  "position": [0, 1.1, 1],      // Unity camera position
  "target":   [0, 1.1, 0],      // aim point
  "fov":      26.9914,          // camera FOV (degrees)
  "unityModelHeight": 1.2477    // the model's true height in Unity
}
```

`unityModelHeight` is the key to the conversion: on load the viewer normalizes the model to `targetHeight` (default 2),
so all camera values are multiplied by `K = targetHeight / unityModelHeight`.
**A uniform scale does not change the composition under a given FOV** ⇒ what you get this way is Unity's framing.
If it is omitted then `K = 1`, and the camera values are interpreted in the viewer's current space.

---

## 8. How to use it from the HTML side

**Pure HTML embedding** (attributes on the container):

```html
<div data-ba3d
     data-ba3d-config="./assets/sample.json"
     data-ba3d-drag
     style="width:420px;height:430px"></div>

<script type="module">
  import { autoMount } from './dist/3d-viewer.min.js';
  autoMount();           // automatically scans [data-ba3d], creates viewers and starts loading
</script>
```

| Attribute | Description |
|---|---|
| `data-ba3d` | Marks this container as carrying a viewer |
| `data-ba3d-config` | URL of the configuration JSON |
| `data-ba3d-model` | Give the model URL directly (usable when no config is set) |
| `data-ba3d-mouth` | Give the mouth texture URL directly |
| `data-ba3d-drag` | Enables "hold the left button on the model and drag the whole container" |
| `data-ba3d-auto-rotate` | `true` auto-rotation |

> ⚠️ **Do not give the container itself an opaque background.**
> The viewer canvas is genuinely transparent (`background.transparent: true` → `alpha: true` + `setClearAlpha(0)`),
> but if you set a solid color / opaque gradient on the container div, the transparency can no longer be seen —— the web page content behind is covered by a whole block,
> and it looks like "the transparent background is not taking effect".
>
> ```css
> .panel {
>   background: transparent;          /* ✅ fully shows the content behind */
>   /* background: rgba(12,16,24,.2); /* ✅ use semi-transparency for a faint base layer */
>   /* background: linear-gradient(...#1a2233...#0a0d14); /* ❌ opaque → transparency fails */
> }
> ```
>
> In `embed-demo.html` a colored decoration (`#showcase`) is deliberately placed behind the overlay to verify this visually.

**URL parameters** (standalone page):

```
index.html?config=./assets/sample.json
index.html?config=./assets/fallback.json
index.html?model=./assets/sample.glb&mouth=./assets/mouth/Character_Mouth_2.png
```

---

## 9. Page events and action hooks

The viewer dispatches **bubbling CustomEvent** on the container:

| Event | `detail` | Purpose |
|---|---|---|
| `ba3d:pointerdown` | `{ button, hit }` | Dispatched immediately (threshold not yet passed); `hit` = whether the left button is on the model itself |
| `ba3d:press` | `{ button, heldMs, thresholdMs, hit }` | **Only counts as a "press" after being held long enough** (200ms by default); only then does container dragging start |
| `ba3d:click` | `{ button, heldMs, thresholdMs, hit }` | Released before the threshold → counted as a click, no dragging triggered |
| `ba3d:pointerup` | `{ button, hit, pressedOnModel, pressed }` | Release; `pressed` = whether this time passed the press threshold |
| `ba3d:action` | `{ name }` | Motion switch (used to sync the menu) |

**The press threshold** is controlled by `renderer.pressHoldMs` (default `200`). After the left button is pressed on the model it first enters a pending state:

- Held ≥ 200ms → dispatch `ba3d:press` and start dragging the container
- Released early → dispatch `ba3d:click` and do **not** drag

This way "you clicked to trigger a motion and ended up dragging the panel away" can no longer happen. The drag start point is taken as **the pointer position at the moment the threshold is crossed**,
so a shaky movement while holding will not make the panel jump.

**Mouth shapes**: atlas cells are driven by the scale of `bone_mouth` by default. But **some models' GLBs contain no mouth animation data at all**
(measured: CH0273's 42 clips at 142 tracks each have not a single track related to the mouth), and then the mouth shape does not change by itself —— this is not an implementation problem,
it is the model lacking that data. The page can drive it manually:

```js
viewer.setMouthCell(10);              // 0~63, cell 10 of the 8×8 atlas
viewer.getMouthCell();                // current cell
viewer.getMouthInfo();                // { mesh, cell, driver: {bone, scaleTrack, ...}, ... }
//   driver.scaleTrack === false → this model's mouth does not change with motions (no data)
```

**Controlling mesh visibility per motion `visibilityRules`**: some models' shields/weapons **only appear in specific motions**,
but the GLB's animation data says nothing about "hiding" —— measured: `Hoshino_Original`'s shield is bound to `bone_shield_root`
and scaling it to 0 does make it disappear, yet across 42 clips its scale only ever ranges over `[0.70, 1.00]`, **not one clip scales it down**.
That is the game engine's per-motion visibility configuration, and it can only be filled in with rules:

```jsonc
"renderer": {
  "visibilityRules": [
    // choose any one of the three forms:
    { "mesh": "Shield", "clipContains": "Shield" },              // show when the motion name contains Shield
    { "mesh": "Shield", "clips": ["Hoshino_Original_Shield_A"] },  // list motion names exactly (**exact match**)
    { "mesh": "Shield", "always": true }                         // always shown (force restore)
    // any of them can add "invert": true to negate
  ]
}
```

> Why "did the shield move" cannot be used as the criterion (measured data): in `Hoshino_Original` the shield is **permanently attached to the arm bone**,
> so when the arm moves it is displaced relative to the character —— the 4 Shield motions actually have **exactly 0 displacement** (held very steady),
> while `Exs_Cutin` has the largest displacement at 0.011. Displacement would judge it backwards; the bone scale is also constantly 1.0 across those 4 clips.
> There is no reliable signal in the data, so only naming conventions or an explicit list can be used.

Meaning: meshes whose name matches `/Shield/i` are shown only when the **motion name contains** `Shield`, and hidden for other motions.
`mesh` / `clipContains` are regex fragments (`clipContains` is a **substring** match), while `clips` is an **exact match** (the whole motion name must equal one entry in the list, case-insensitive); the optional `"invert": true` reverses it (shown only when it does not contain).
If not configured, visibility is not interfered with at all (default).

If no rule is configured but it detects that "a mesh name and some motion names both contain shield/weapon", loading prints a hint in the console that can be copied directly.

**Default mouth shape `mouthCell`**: some models' GLBs contain **no mouth animation data at all**
(measured: CH0273's 42 clips at 142 tracks each have not a single track related to the mouth), and then the mouth shape stays fixed.
Use `mouthCell` to specify which mouth shape to use at that moment (atlas 8×8, valid values 0~63):

```jsonc
"renderer": {
  "mouthCell": 10        // use cell 10 when there is no mouth data; null (default) = the first mouth shape
}
```

Motions that have mouth data are **unaffected** and still follow the motion —— `mouthCell` is only a fallback for "no data available".

Use `viewer.setMouthCell(n)` to try cells one by one in the console, or look directly at `assets/mouth/_cells-preview-*.png` to pick a cell, then write it into the configuration. (The valid range is always 0~63, but **cells beyond that atlas's actual mouth-shape range display as a cyan block**.)

**Fallback mouth shape `mouthIdle`** (off by default, takes priority over `mouthCell`): some models' GLBs contain **no mouth animation data at all**
(measured: CH0273's 42 clips at 142 tracks each have not a single track related to the mouth), and then the mouth shape stays fixed.
Once enabled, if the current motion is not driving the mouth bone, the mouth shapes cycle through once at the rhythm of `mouthIdleMs`
(purely a visual effect, unrelated to the motion content); motions that have mouth data are unaffected and still follow the motion.

```jsonc
"renderer": {
  "mouthIdle": true,      // turn on the fallback mouth shape
  "mouthIdleMs": 180      // stay 180ms per cell (8 cells ≈ 1.44s per round)
}
```

At load time it prints `[fixMouth] 没有任何动作驱动「bone_mouth.scale」…` to indicate the model lacks mouth data;
you can also use `viewer.getMouthInfo().driverClips` to check how many motions really move the mouth (0 = no data at all).

Global action hooks (called directly by other js on the page):

```js
play3dmodelaction(['Formation_Pickup']);   // play the first motion that matches
play3dmodelaction(['A', 'B']);             // search in order, play the first that exists
play3dmodelaction([3]);                    // index
play3dmodelaction('Cafe_Idle');            // a single string
play3dmodelaction();                       // no argument → back to the default motion
```

Interaction conventions: **holding the left button on the model and dragging = move the container; right-button dragging = rotate the character** (when `dragContainer` is enabled).


---

## lilToon outline

Applies when the shader = `lilToon`. Corresponds to lilToon's `_Outline*` parameter family.

```jsonc
"lilToon": {
  "outline": {
    "enable": false,                  // _UseOutline —— master switch
    "color": [0.6, 0.56, 0.73, 1.0],  // _OutlineColor (the 4th component is opacity)
    "tex": null,                      // _OutlineTex (texture URL, loading not wired up yet)
    "width": 0.08,                    // _OutlineWidth (internally ×0.01)
    "widthMask": null,                // _OutlineWidthMask (URL, takes the .r channel)
    "fixWidth": 0.5,                  // _OutlineFixWidth
    "fixWidthMode": "lilToon",        // 'lilToon' | 'screen' (see below)
    "vertexR2Width": 0,               // _OutlineVertexR2Width: 0 unused / 1 use R / 2 use A (and treat RGB as the normal)
    "zBias": 0.0,                     // _OutlineZBias
    "cull": "back",                   // 'back' (default, draw back faces only) | 'front'
    "skipPattern": "mouth",           // mesh names that get no outline (regex, case-insensitive)
    "litColor": [1.0, 0.2, 0.0, 0.0], // _OutlineLitColor (alpha=0 means unlit, not implemented yet)
    "litScale": 10.0,                 // _OutlineLitScale
    "litOffset": -8.0                 // _OutlineLitOffset
  }
}
```

### Semantics of the width

```
world outline thickness = width × 0.01 ÷ mesh world scale × mesh world scale = width × 0.01
```

The code does **normalization by mesh world scale**, so the physical meaning of `width` is independent of the model scale.
(In Unity 1 unit = 1 meter and a character is about 1.5, so width 0.08 corresponds to about 0.8 millimeters, very thin)

**⇒ The range of "width" on the panel is 0 ~ 10 with a step of 0.01**.

### fixWidthMode

lilToon's original is:

```hlsl
outlineWidth *= lerp(1.0, saturate(length(headDirection)), _OutlineFixWidth);
```

`saturate` **clamps the distance at 1.0**, while camera distances are usually far greater than 1.
**⇒ In the original, pulling `_OutlineFixWidth` to 0 or 1 gives exactly the same result, and the parameter is effectively dead**.

| Value | Behavior |
|---|---|
| `'lilToon'` (default) | Keeps saturate, **fully aligned with lilToon** |
| `'screen'` | Removes saturate; with `fixWidth=1` the **outline keeps a constant on-screen thickness** (does not thin out when zoomed away) |

On the panel this corresponds to the "fixed width effective (remove saturate)" checkbox.

### skipPattern

**Matches mesh names only**, neither material names nor paths.

Reason: materials are often shared by several meshes, and matching by material would damage a whole group.

```jsonc
"skipPattern": "mouth|eye"            // meshes whose name contains mouth or eye get no outline
"skipPattern": "^CH0155_Body_4_Mouth_Split$"   // exact match
```

**The "Parts" panel lets you see each mesh's real name** (hovering shows the hierarchy path and material name)

### Mutual exclusion with the old outline

When the lilToon outline is enabled, the built-in `OutlineEffect` (the HUD's "outline" button) **automatically gives way**.
The two never stack.

**FBX models**: the built-in outline never works for FBX (the inverted-hull implementation is sensitive to its coordinate system).
But **the lilToon outline works normally for FBX**.

---

## Parts panel

The **[Parts]** button on the HUD lists all the model's meshes.

| Element | Role |
|---|---|
| Checkbox | Show / hide that part |
| Name (click) | **Show only this one** (click again to restore everything) |
| Triangle count | That mesh's face count (k = thousand) |
| Material name | Helps determine where a part is |
| 🔓 / 🔒 | **Lock** that part's visibility |

### Lock semantics (remembering ≠ freezing)

| State | User checks/unchecks | Automatic logic* |
|---|---|---|
| 🔓 unlocked | Takes effect immediately | **May be changed back** |
| 🔒 locked | Takes effect immediately **and updates the locked value** | **Left alone** |

\* Automatic logic includes: `hideParts` (regex hiding), `hideOptional` (hide optional parts per motion),
`hideByBoneScale` (hide a prop when it is shrunk into the body)

**[Show all] / [Hide all] lock all parts at once**, otherwise the automatic logic would make some parts pop back out.

### API

```js
viewer.listMeshes()                       // list (with path / material / triangles)
viewer.setMeshVisible('CH0155_Body/CH0155_Body_4', false)
viewer.setAllMeshesVisible(true)
viewer.isolateMeshes(['CH0155_Hair'])     // show only these; pass [] to restore everything
viewer.setMeshLocked('CH0155_Hair', true) // lock to visible; pass null to unlock
viewer.getMeshLocks()
viewer.debugTree()                        // full hierarchy (for troubleshooting)
```

---

## Texture matching rules

Texture paths inside an FBX often do not match the actual files; matching proceeds in the order below.

1. **Exact match on the full URL** `textureMap`
2. **Match after stripping the query string**
3. **File name match**
4. **★ Base file name match** (extension removed, case-insensitive)
   —— for example the FBX requests `Body.psd` while you uploaded `Body.png`, and it **does match**.
5. **`.psd` automatic rewrite**: try a `.png` with the same name in the order `../TEX/`, `TEX/`, `../Textures/`, `Textures/`, `./`

**An empty texture is set to `null`**, avoiding "sampling pure black makes the whole model black".

> ⚠️ This project modified the `.psd` branch of `vendor/three/loaders/FBXLoader.js`:
> the original creates a `new Texture()` placeholder, and **an empty texture samples as pure black in three**, which turns the whole model black.
> Changed to request it as an ordinary image and hand it to the URL rewriting above.

---

## lilToon presets

A dropdown at the top of the panel (available when shader = lilToon), 19 official presets.
The data comes from `lilToon/Presets/*.asset`, inlined as `LIL_PRESETS`.

```js
viewer.getLilPresets()
viewer.applyLilPreset('Skin-Anime')   // or 'Hair-OutlineRimLight' / 'Inorganic-Metal (MatCap)'
```

**Applying automatically**:
1. switches to `shader = 'lilToon'`
2. **first zeroes the blend of Rim / MatCap / emission**, to avoid features left over from the previous preset.
3. applies the preset fields and rebuilds the material.

⚠️ `outline.enable` in the presets **is always false**.
The `_UseOutline` of lilToon's official presets is all 0, i.e. "whether to outline" is checked manually per material by the artist; the preset only provides the numeric values.

⚠️ **The official presets are meant to be used per material** (apply Skin-* to skin materials, Hair-* to hair).
The current implementation is global; for the per-material override scheme see `LILTOON1.x.md`, section 9.

---

## Vertex color tool

The masks lilToon reads are the **RGB three channels of the vertex color**.

```
R → MatCap weight
G → Rim weight
B → emission weight
```

```js
viewer.showVertexColors(true)   // render vertex colors as color (no lighting, no texture)
viewer.vertexColorInfo()        // min/max/mean per mesh, and whether it is all white
```

The **[顶点色]** (vertex color) button on the HUD = the former, and it also prints the latter.

**For a model without vertex colors**: the mask is constantly 1, all three effects apply over the whole area, (the code uses `#ifdef USE_COLOR` to fall back automatically)

---

## Outline lit (_OutlineEnableLighting / _OutlineLitColor)

Strictly following lil_common_frag.hlsl:371-380:

    litCol  = _OutlineLitApplyTex ? col.rgb * _OutlineLitColor.rgb : _OutlineLitColor.rgb
    litF    = saturate( NdotL * _OutlineLitScale + _OutlineLitOffset ) * _OutlineLitColor.a
    col.rgb = mix( col.rgb * _OutlineColor.rgb, litCol, litF )

| Config | lilToon parameter | Panel control |
|---|---|---|
| litEnable | _OutlineEnableLighting | 受光生效 (lit enabled) (checkbox) |
| litColor | _OutlineLitColor (RGB + alpha) | 受光色 (lit color) + 受光强度 (lit strength) |
| litScale | _OutlineLitScale | 受光对比 (lit contrast) |
| litOffset | _OutlineLitOffset | 受光阈值 (lit threshold) |
| litApplyTex | _OutlineLitApplyTex | 受光色乘描边贴图 (multiply lit color by outline texture) (checkbox) |

### Not lit by default

_OutlineLitColor.a defaults to 0, so litF = 0, and the result is "texture × outline color".
**By default this feature does not affect the look at all**; it only takes effect once you raise "受光强度" (lit strength).

### Light direction

The direction is computed every frame from the **actual world position of the main light** and passed in as uOutlineLitDir.
So when you switch lighting presets (白昼 / 傍晚 / 黑夜, daylight / dusk / night) the lit direction of the outline changes accordingly.

### Normal source

The vertex shader uses objectNormal, which after three's skinnormal_vertex is **already skinned**,
and is then multiplied by mat3(modelMatrix) to get the world-space normal.

---

## Outline textures (_OutlineTex / _OutlineWidthMask)

| Config | lilToon parameter | Description |
|---|---|---|
| tex | _OutlineTex | outline texture, colors the outline with a texture |
| widthMask | _OutlineWidthMask | width mask, **takes the R channel** |

On the panel, use the "选择文件" (choose file) button (local images go through a blob URL; a relative path can also be given via the JSON config).

### Using the width mask

    white (R=1) -> full-width outline
    black (R=0) -> no outline

**This is lilToon's orthodox way of handling "no outline in a local area".**
For example when the mouth and the head share the same mesh, skipPattern (by mesh name) is powerless,
and in that case a mask image with the mouth painted black gets you pixel precision.

Textures are cached by URL, and the outline is reapplied automatically once loading finishes (no manual refresh needed).
A load failure prints [outline] 贴图加载失败：... (texture load failed: ...) (warn level, always visible).

---

## Verbose log switch

The **详细日志** (verbose log) checkbox on the HUD; the setting is stored in localStorage and survives a refresh.
It controls window.__ba3dDebugUI and affects three kinds of diagnostic output:

| Output | Controlled by it |
|---|---|
| Shadow self-check table (one console.table per load) | yes |
| syncRenderUI's decision input printout | yes |
| [lilPanel] 已打开，控件 N 个 (opened, N controls) | yes |
| the 21 console.debug calls in viewer.js | **no** —— controlled by DevTools' Verbose level |

Normally the console should be left with a single line:

    [viewer] 加载完成 | 模型=... | 网格=11 | 描边=true

console.warn / console.error are always visible (they only appear on a real exception).

---

## Config panel overrides and export

What the panel can change (when shader = lilToon):

    预设 (preset)   19 lilToon official presets
    分档 (banding)  浓度 / 第一层边界·过渡 / 第二层边界·过渡 / 第三层边界·过渡 / 第三层开关 / 颜色
    Rim      强度 / 边界 / 过渡 / 菲涅尔 / 受光方向 / 颜色 / 背光色
    MatCap   强度 / 贴图文件
    自发光 (emission)   强度 / 颜色
    背光 (backlight)    强度 / 指向性
    描边 (outline)      启用 / 宽度 / 固定宽度 / 顶点色当宽度 / Z 偏移 / 固定宽度生效 /
              描边颜色 / 不透明度 / 受光色 / 受光强度 / 受光对比 / 受光阈值 /
              描边贴图 / 宽度遮罩 / 受光生效 / 受光色乘贴图 / Cull 模式 / 跳过部件

**All 16 config fields of the outline have controls.**

The HUD's **[导出 JSON]** (export JSON) generates a config containing only the entries that differ from the defaults. The outline parameters live under lilToon.outline.
The export uses a recursive diff; fields equal to the default are omitted.

---

## Outline extrusion direction texture (_OutlineVectorTex)

Use a texture to override the extrusion direction of the outline (hand-drawn outline).

| Config | lilToon parameter | Panel control |
|---|---|---|
| vectorTex | _OutlineVectorTex | 外扩方向 (extrusion direction) (choose file) |
| vectorScale | _OutlineVectorScale | 方向强度 (direction strength) (-10 ~ 10) |
| vectorUVMode | _OutlineVectorUVMode | 方向 UV (direction UV) (UV0 ~ UV3) |

The texture is decoded as a **tangent-space** normal and then transformed to object space via the TBN (lil_common_functions.hlsl:272).

### Differences from Unity (important)

three's MeshBasicMaterial only has objectTangent when the geometry carries a tangent attribute.
Therefore:

    #ifdef USE_TANGENT   → real TBN, consistent with Unity
    #else                → approximated with "normal + an arbitrary orthogonal axis", which will differ from Unity

This fallback is a limitation of three's geometry data and cannot be worked around.

---

## Outline lit receiving shadows (_OutlineLitShadowReceive)

Whether the outline, when lit, is occluded by the main light's shadow.

| Config | lilToon parameter | Panel control |
|---|---|---|
| litShadowReceive | _OutlineLitShadowReceive | 受光接收阴影 (lit receives shadow) (checkbox) |

### Why it is computed by ourselves

In lilToon it is simply outlineLitFactor *= fd.attenuation (multiply by the light attenuation).
But in three, MeshBasicMaterial **cannot get shadow data**:

    three only assigns when materialProperties.needsLights is true
    directionalShadowMap / directionalShadowMatrix (three.module.js:30062~30088),
    and MeshBasicMaterial is not in the whitelist of materialNeedsLights().

Measured (probe log): in the outline material directionalShadowMatrix never exists,
vDirectionalShadowCoord computes to all 0, and getShadowMask() constantly returns 1.

So it was changed to **compute it ourselves**:

    each frame (updateLilOutlineCamera) take from keyLight.shadow:
      biasM = matrix of 0.5 offset + 0.5 scale (maps NDC to texture space [0,1])
      uOutlineShadowMatrix = biasM × shadow.camera.projectionMatrix × matrixWorldInverse
      uOutlineShadowMap    = keyLight.shadow.map.texture
      uOutlineShadowBias   = keyLight.shadow.bias
      uOutlineShadowMapSize= keyLight.shadow.mapSize

    vertex: vOutlineShadowCoord = uOutlineShadowMatrix × modelMatrix × vec4(transformed, 1.0)
    fragment: ba3dOutlineShadow() does 4 PCF samples (unpackRGBAToDepth + step)
          returns 1 = lit, 0 = fully shadowed, then ba3dLitF *= it

It bypasses three's material system entirely and does not depend on any of three's shadow chunks.

### Diagnostic switch on the panel

"阴影遮罩预览（诊断）" (shadow mask preview (diagnostics)) = litShadowDebug, which acts the same as litShadowReceive but
is for troubleshooting (it force-applies the shadow mask, so you can see whether the pipeline is connected).

---

## Outline color multiplication switch

lilCfg.outline.shaderColorMult (default false):

    false → the outline color is multiplied only once, by mat.color (correct, the lit color stays clean)
    true  → the shader multiplies uOutlineColor once more (the lit color gets darkened by the outline color; for comparing against the old behavior)

On the panel this corresponds to the "着色器里再乘一次描边色" (multiply the outline color once more in the shader) checkbox.

---

## Per-material configuration (lilToonByMaterial)

lilToon's presets are originally **one choice per material slot** (apply Skin-* to skin, Hair-* to hair),
so the configuration is also separated per material. See the design in section 9 of LILTOON1.x.md.

### Data structure

    lilCfg                      global default (changed when the panel selects "全部（默认）" (all (default)))
    lilCfgByMaterial = {        override by material name (sparse, only changed keys are stored)
      'CH0155_Hair_Toon': { shadowBorder: 0.05, rim: { blend: 1 } },
      'CH0155_Milk_Toon': { matcap: { url: 'blob:...' } },
    }

### How it takes effect

    function lilCfgFor(mat) {
      const nm = mat && mat.name;
      if (!nm || !lilCfgByMaterial[nm]) return lilCfg;
      return mergeLilCfg(lilCfg, lilCfgByMaterial[nm]);
    }

mergeLilCfg does a **one-level deep merge** (nested objects such as outline / rim / matcap are merged field by field),
everything else is overwritten directly.

### Effect points

    in patchToonMaterial(mat):
      const __cfgM = lilCfgFor(mat);
      celGradientGLSL(__cfgM, celCfgFor(mat))     // banding
      lilShaderGLSL(__cfgM)                       // Rim / MatCap / emission / backlight
      resolveMatCapTexture(__cfgM.matcap.url)     // MatCap texture

    in applyLilOutline() the outline config is resolved by the mesh's material name (with caching):
      const o = _mn0 ? resolveFor(_mn0) : oGlobal;

### cacheKey (critical)

    mat.customProgramCacheKey = () =>
      'ba3d-cel:' + celProgramVersion + ':' + shaderMode + ':' + (mat.name || '')
      + ':v' + lilMaterialVersion;

Two pitfalls:
  ① The **material name** must be included, otherwise programs of different materials get reused and parameters cross over.
  ② lilMaterialVersion must be included **unconditionally**.
     It was once written as "include the version only when there is an override", but "whether there is an override" is decided at the moment the patch is applied,
     and if an override is added to some material afterwards the key does not change → three neither recompiles nor rebuilds,
     and the symptom is "setting it does nothing".

### Panel

    [● lilToon 参数]                    ← title bar (drag handle)
    ─────────────────
    材质 (material)  [ 全部（默认）▾ ]  [清除覆盖]
           选 "全部" changes the global; selecting a material only overrides that one (a ● indicates an existing override, and the panel shows the merged values)
    预设 (preset)  [（不套用 ▾）]                ← applied to the material selected above

The 40-odd calls in the panel automatically carry the current material through thin wrappers:

    const lilG  = (m) => viewer.getLilConfig(m === undefined ? lilCurMat() : m);
    const lilS  = (p, m) => viewer.setLilConfig(p, m === undefined ? lilCurMat() : m);
    const lilOG = (m) => viewer.getLilOutline(m === undefined ? lilCurMat() : m);
    const lilOS = (p, m) => viewer.setLilOutline(p, m === undefined ? lilCurMat() : m);

⚠️ When globally replacing these 4 API names, **the wrapper functions themselves also get replaced**, causing self-recursion
   (the same pitfall was stepped in again on lilApplyPreset). After changing them you must check the definitions themselves.

⚠️ lilCurMat() must fall back to window.__ba3dLilMat:
   buildLilPanel() first clears the panel with lilPanel.innerHTML = '',
   at which point the selector element has not been rebuilt yet, and looking only at the DOM reads it as "global".

### API

    viewer.getLilConfig(matName)              // merged value
    viewer.setLilConfig(partial, matName)     // write to global or to a material
    viewer.getLilOutline(matName)
    viewer.setLilOutline(o, matName)
    viewer.applyLilPreset(name, matName)
    viewer.getLilMaterials()                  // list of material names in the model
    viewer.getLilCfgByMaterial() / setLilCfgByMaterial(obj)
    viewer.clearLilMaterialOverride(matName)

### Export

    {
      "lilToon": { /* global default */ },
      "lilToonByMaterial": { "CH0155_Hair_Toon": { "shadowBorder": 0.05 } }
    }

The export still does a recursive diff against the defaults and writes only the changed entries.

### Per-material override scope (all supported)

    shadow banding (浓度 / 每层边界·过渡 / 每层颜色 / 第三层开关)
    Rim (强度 / 边界 / 过渡 / 菲涅尔 / 颜色 / 背光色)
    MatCap (强度 / 边界 / **贴图**)
    自发光（强度 / 颜色）
    背光（强度 / 指向性）
    outline's 20 parameters (including outline texture / width mask / extrusion direction)

The MatCap texture used to be a single global one (the lilMatCapTex variable); it has now been changed to
resolveMatCapTexture with per-URL caching + per-material uniform lookup.

---

## Floating panel: title bar and dragging

The three panels (#lilPanel / #exportPanel / #partsPanel) are .lp elements,
and the custom model (#upload) is a separate container. Each has a title bar:

    [● lilToon 参数]        ← the title matches the text of the button that opens it
    [● 导出 JSON]
    [● 部件]
    [● 自定义模型（本地文件，不会上传到任何服务器）]   ← uses .u-title

### Dragging

Hold the title bar and drag the panel. Key points:

  · The listener is attached to the **panel itself** (event delegation), not to the title element
    —— the lilToon panel is rebuilt with innerHTML = '' every time it opens or the preset changes, so attaching to the title stops working.
  · Handle recognition order: specified selector > .lp-title > .u-title > h4
  · The panel is originally positioned with right:16px + top:16px; while dragging it switches to left/top.
  · Clamp when dragged out of the window (Math.max(4, ...) / Math.min(innerWidth - w - 4, ...)).
  · After a window resize, if the panel is outside the viewport, pull it back to right alignment automatically.

### Unified title bar styling

.lp-title and #upload .u-title use the same visual set:

    blue dot (7px, #3d6fe0) + 12.5px / 600 / #c3ccdd + bottom separator line rgba(255,255,255,.09)
    cursor: move (grabbing while dragging)

.lp-title additionally has position: sticky (sticks to the top while scrolling) and a negative margin (fills the top of the panel).

### Panel width

    .lp        400px (was 320px), overflow-x: hidden (no horizontal scrollbar)
    .lp.parts  340px (was 300px)

---

## lilToon shadow system (phase 1 extras + look tuning)

### Parameter overview

| Config | lilToon parameter | Description |
|---|---|---|
| shadowStrength | _ShadowStrength | banding strength, **range 0~2**; above 1 it keeps darkening via mix extrapolation |
| shadowBorder / shadowBlur | _ShadowBorder / _ShadowBlur | 1st layer border / transition |
| shadow2ndBorder / shadow2ndBlur | _Shadow2ndBorder / _Shadow2ndBlur | 2nd layer |
| shadow3rdBorder / shadow3rdBlur | _Shadow3rdBorder / _Shadow3rdBlur | 3rd layer |
| shadowBorderRange | _ShadowBorderRange | pushes only the lower edge of the transition band toward the shadow side (lil_common_functions.hlsl:33) |
| shadowMainStrength | _ShadowMainStrength | multiplies the main color once more on the shadow side (lil_common_frag.hlsl:1024) |
| shadowReceive / shadow2ndReceive / shadow3rdReceive | _ShadowReceive etc. | whether each layer receives **realtime cast shadows** (:872-876) |
| shadowColor / shadow2ndColor / shadow3rdColor | _ShadowColor etc. | per-layer color **+ alpha** |
| shadowAmbient | (three-specific, lilToon does not have it) | how much ambient light is kept in the shadow area |

### ★ The alpha of the three layer colors is "how strong this layer is"

lilToon: lns.y = _Shadow2ndColor.a - lns.y * _Shadow2ndColor.a (:1013)
so alpha = 0 means **that layer is off**.

⚠️ Pitfall stepped in: the first version took only RGB and ignored alpha, so
     "shadow2ndColor": [0, 0, 0, 0] (which in the official presets means "2nd layer off")
    was treated as "pure black at full strength", and 11 of the 19 presets are like this and all came out absurdly dark.

The current implementation:
    outCol = mix( outCol, shadowColor, s1 * alpha1 );
    outCol = mix( outCol, shadow2ndColor, s2 * alpha2 );
    outCol = mix( outCol, shadow3rdColor, s3 * alpha3 );

Each row on the panel has three controls: color / alpha slider / alpha number box.

### ★ shadowAmbient (three-specific) —— the "ambient light floor"

three's toon adds ambient light **separately, outside the banding**:

    irradiance  = ambient + lightProbe + banding * directLight

whereas lilToon's indirectCol is a **wholesale replacement** (including ambient light).
So our shadows have a floor: the stronger the light, the brighter the lit side, and the shadow area does not follow.
The relative contrast gets diluted, and the symptom is "when the lighting is strong the shadow is actually not pronounced enough".

Solution: **after** lights_fragment_begin (before lights_fragment_end)

    reflectedLight.indirectDiffuse *= mix( shadowAmbient, 1.0, ba3dShadowMaskG );

    shadowAmbient = 1.0 → no reduction (default, behavior unchanged)
    shadowAmbient = 0.0 → no ambient light at all in the shadow area (deepest)

To get closer to the look of cel mode (阴影浓淡=0 / 脸部=0, shadow strength=0 / face=0), set it to 0~0.2.

### ★ The difference between the two projection paths (why _ShadowReceive did not work in the first version)

lilToon (Unity): the projection is **folded into the banding value**, and direct light is no longer multiplied separately:

    calculatedShadow = saturate( fd.attenuation + distance( fd.L, fd.origL ) );
    lns.x *= lerp( 1.0, calculatedShadow, _ShadowReceive );

three: in lights_fragment_begin the projection **cuts the direct light outright**:

    directLight.color *= getShadow( directionalShadowMap[i], ... );

The two paths are unrelated, so merely multiplying the shadow into t1/t2/t3 does nothing.

The current approach: in lilToon mode, **neutralize** three's path

    getShadow(...)  →  ( getShadow(...) * 0.0 + 1.0 )  =  1.0

so that the projection enters the banding **only via ba3dShadowMaskG**.

### The behavior of the three layers stacking (not a bug)

The three layers **stack in order**, and a later layer overrides an earlier one:

    outCol = mix( outCol, 1st layer color, s1 );
    outCol = mix( outCol, 2nd layer color, s2 );   // overrides
    outCol = mix( outCol, 3rd layer color, s3 );   // overrides again

The three layer borders default to 0.1 / 0.15 / 0.25, and a later layer **encloses** the earlier one.
So if you only adjust _ShadowReceive on the first layer, the effect is covered by the 2nd and 3rd layers and you cannot see it.
To turn off cast shadows entirely, all three must be set to 0.

### The strength can exceed 1

When mix's t exceeds 1 it **extrapolates**:

    mix( vec3(1.0), outCol, 1.5 ) = 1 + 1.5 * ( outCol - 1 )   ← darker than the shadow color

This is to work around the "ambient light floor" above; the slider range is 0~2.

### The "（重置为默认）" (reset to default) preset

A special entry in the preset dropdown:

    select "全部（默认）" → restore the whole lilCfg to LIL_DEFAULTS
    select a material      → delete that material's override (back to the global default)

---

## Dissolve (phase 2)

### Of the four items in phase 2, three were already done

| # | Item | Status |
|---|---|---|
| 5 | outline upgrade (self-built inverted hull + width texture + vertex color control) | already done long ago, applyLilOutline() |
| 6 | decoration layer blend modes (Normal/Add/Screen/Multiply) | already done long ago, ba3dBlend() |
| 7 | Backlight / rim light from behind | already done long ago |
| 8 | Dissolve | **implemented this round** |

(Regarding 6: lilToon 1.3.7's _MainColor itself has no blend mode.
  Blend modes exist only on the decoration layers, and those are implemented)

### Parameters

| Config | lilToon | Description |
|---|---|---|
| dissolve.mode | _DissolveParams.r | 0=off 1=texture threshold 2=UV 3=object space |
| dissolve.linear | _DissolveParams.g | 1=linear/planar 0=circular/spherical |
| dissolve.threshold | _DissolveParams.b | threshold |
| dissolve.softness | _DissolveParams.a | edge feather width (fallback 0.001, otherwise division by zero) |
| dissolve.pos | _DissolvePos | for linear it is the **direction**, for circular/spherical it is the **center point**, w is the rotation for mode 2 only |
| dissolve.color | _DissolveColor.rgb | edge color (**additive**, see lil_common_frag.hlsl:1841) |
| dissolve.maskTex | _DissolveMask | the mask for mode 1, samples .r |
| dissolve.noiseTex / noiseStrength | _DissolveNoiseMask / _DissolveNoiseStrength | noise perturbation |

### Injection points (two, same as lilToon)

    (1) before #include <alphatest_fragment>
         compute the mask → diffuseColor.a *= maskVal
         and store the edge factor in the global ba3dDissolveEdge
    (2) #include <dithering_fragment>
        gl_FragColor.rgb += _DissolveColor.rgb * ba3dDissolveEdge;

(Verified: in the toon fragment, alphatest is at line 37 and dithering at line 53.
  gl_FragColor only exists after opaque_fragment, so the position of (2) is correct)

### Coordinate normalization (our change relative to lilToon)

lilToon uses the raw object-space coordinates of _DissolvePos directly, because in Unity a character is only 1~2 units tall.
The models this viewer loads have arbitrary scale, so normalization is done:

    evaluation coordinate for mode 3 = ( vBa3dPositionWS - center ) * vec3( 1/sizeX, 1/sizeY, 1/sizeZ )

  · normalization is **per axis** (not only by the longest side); the model maps to the unit cube
    If it were only by the longest side, a tall thin character would occupy only ±0.15 in x/z and the sphere shell would not sweep far enough.
  · hence the threshold semantics: plane ±0.5, sphere 0 ~ 0.87, and the position (0,0,0) is the model center.

### ⚠️ lilToon's mode 2 linear has two different implementations

    without noise (lil_common_functions.hlsl:628) → lilRotateUV( uv, _DissolvePos.w ).x
    with noise (:675)                            → dot( uv, normalize(_DissolvePos.xy) ) + noise

The former uses only one rotation angle, xy is entirely unused, and for the viewer there is no way to guess it.
The latter dots the raw uv directly; when the direction is negative the result lands in [-1, 0], and a threshold > 0 never holds.
The whole model disappears (this is a pitfall we stepped in)

**We unify it as**:

    ba3dDissolveAlpha = dot( vBa3dUv - 0.5, normalize(pos.xy) ) + 0.5;   // range 0~1

After centering, a threshold of 0~1 sweeps exactly across the whole texture, with semantics consistent with mode 3's plane.

### ★ This feature stepped in 6 pitfalls (all of the "two places disagree" kind)

1. **Asynchronous texture vs synchronous compilation**
   In GLSL, texture2D( ba3dDissolveMask, ... ) is generated synchronously.
   But uniform sampler2D ba3dDissolveMask; was originally declared only after the texture **loaded successfully**.
   The first frame necessarily returns null, → undeclared identifier, compilation fails.
   Fix: declare the uniform **unconditionally** and cover it with a placeholder texture
     mask placeholder = pure white (.r=1.0, equivalent to "mask inactive", consistent with lilToon disabling the mask)
     noise placeholder = mid grey (.r=0.5, which is 0 after subtracting 0.5, equivalent to "no noise")

2. **alphaTest was set one stage too late**
   It was originally assigned in the mat.onBeforeCompile callback, when WebGLProgram was already compiling.
   The USE_ALPHATEST macro was decided long before, and the discard in alphatest_fragment **does not take effect**.
   Symptom: "the model turns into a silhouette" —— alpha is lowered but not discarded, and under opaque rendering alpha is ignored anyway.
   Fix: move it to the beginning of patchToonMaterial (before the callback), and mat.needsUpdate = true
   In addition, syncDissolveAlphaTest() was added, hooked onto every applyLilOutline()
     (to prevent the case where the material is reused, patchToonMaterial no longer runs, and alphaTest goes stale)

3. **The outline shell must dissolve along with it**
   Dissolve only affects the geometry itself, whereas the outline is a **separate inverted hull mesh** and is not inside the dissolve scope.
   So after the body dissolves, a dark outline is left over.
   In lilToon the outline uses the same shader, so it dissolves together.
   Fix: do the same injection in makeLilOutlineMaterial(o, srcMat).
   ⚠️ It must be injected **before** the lit block, because that block replaces the whole '#include <common>'.

4. **Outline takeover in lilToon mode**
   outlineActive() originally yielded only when lilCfg.outline.enable was true.
   So during the period "switched to lilToon but lilToon's outline is not enabled yet",
   cel's OutlineEffect was still drawing, and it is **post-processing based** and takes no part in the dissolve.
   → After dissolving, a complete character silhouette remained (troubleshot for a long time)
   Fix: if ( shaderActive() && shaderMode === 'lilToon' ) return false;  yield unconditionally.
         and when applyShader('lilToon') runs, automatically convert cel's outline parameters over:
           width = thickness * 100 (because ba3dOW = _OutlineWidth * 0.01)
           color / alpha are copied over directly.

5. **TDZ: OUTLINE_DEFAULT is defined after applyShader**
   I referenced it inside applyShader, which throws ReferenceError at initialization.
   Fix: move the whole declaration block before applyShader.
   (This is the project's 3rd TDZ; the first two were hex / celShadow.
     The common factor: **a "function that runs early" references a const defined further down the file**)

6. **Object space vs world space**
   The bounding box uses Box3().setFromObject() (**world space**)
   while the shader uses position (**object space**)
   The two can differ by a hundredfold, so "subtract the center" has almost no effect and the normalization is completely wrong.
   The k/center in the console looks normal, but substituting it into the shader is just wrong.
   Fix: add vBa3dPositionWS = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz
       (injected after project_vertex, at which point transformed has already completed skinning and morph targets)
       mode 3 uses it instead, unifying the space with the bounding box.

### The edge color is additive

In lilToon _DissolveColor glows:

    fd.col.rgb += _DissolveColor.rgb * dissolveAlpha;
    fd.emissionColor += _DissolveColor.rgb * dissolveAlpha;

So the default pure white makes the dissolve boundary **glow**; this is the expected effect.
If you do not want a white edge, set "边缘颜色" (edge color) to black.
(The default feather width was also lowered from 0.1 to 0.03, otherwise the edge band is too wide and the whole model turns white together)

### Diagnostics

Every time a **new parameter combination** appears it prints a line (the same combination prints only once, and it does not depend on the verbose log switch):

    [dissolve] 生成 GLSL：模式=3 线性=1 阈值=0.200 羽化=0.030 位置/方向=(0,-1,0,0) 遮罩=无 噪声=无
    [dissolve] 世界空间归一化：k=(1.37118, 0.62073, 1.30632) 尺寸=(0.729, 1.611, 0.766) center=(-0.20, 0.87, 0.02)

These two lines let you see directly "the actual parameters compiled in" and "the coordinate system used for normalization".
Very useful for troubleshooting this kind of problem.

### Verified behavior

    mode 3, linear 1, position (0,-1,0,0), threshold 0.2 → a horizontal cut keeps the lower body.
    mode 3, linear 1, position (1,0,0,0), threshold 0   → keeps the left half.
    mode 3, linear 0, position (0,0,0,0), threshold 0→0.6 → the spherical cross-section gradually disappears.
    mode 1 (mask texture) / mode 2 (UV) behave normally.

---

## lilToon 1.3.7 parameter mapping (not-yet-implemented list)

> Data source: the Properties section of `lilToon/Shader/lts.shader`, **182 parameters** in total.
> The table below is grouped by function; ✅ = implemented and wired into the panel, — = not implemented.
>
> ⚠️ This list is **diffed out of the source**, no longer judged from memory.
>    (There was an earlier verbal mistake: "phase 1 left over mask-type parameters" —— in fact
>      the phase 1/2 plans never contained these parameters, see LILTOON1.x.md)

> ⚠️ This table's data source is the **1.3.7** `lts.shader`; after moving to the 2.3.4 baseline a further batch was implemented
>    (2nd/3rd main-color layers, layer dissolve, distance fade, the normal-map path, MatCap Lod and custom normals),
>    so the status column of an individual row may lag behind — trust what the panel actually exposes.

### Shadow (15/22 implemented)

| lilToon parameter | Status | Our key |
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

### Rim (11/12 implemented)

| lilToon parameter | Status | Our key |
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

### MatCap (6/18 implemented)

| lilToon parameter | Status | Our key |
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

### Emission (3/14 implemented)

| lilToon parameter | Status | Our key |
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

### Backlight (4/6 implemented)

| lilToon parameter | Status | Our key |
|---|---|---|
| `_BacklightMainStrength` | — |  |
| `_BacklightNormalStrength` | ✅ | `backlight.normalStrength` |
| `_BacklightBorder` | ✅ | `backlight.border` |
| `_BacklightBlur` | ✅ | `backlight.blur` |
| `_BacklightDirectivity` | ✅ | `backlight.directivity` |
| `_BacklightViewStrength` | ✅ | `backlight.viewStrength` |

### Dissolve (3/3 implemented)

| lilToon parameter | Status | Our key |
|---|---|---|
| `_DissolveMask` | ✅ | `dissolve.maskTex` |
| `_DissolveNoiseMask` | ✅ | `dissolve.noiseTex` |
| `_DissolveNoiseStrength` | ✅ | `dissolve.noiseStrength` |

### Summary

    the six groups above total 75 parameters, 42 implemented (56%)

### Main categories not implemented (why not)

| Category | Examples | Reason |
|---|---|---|
| **mask-type textures** | `_ShadowBlurMask` `_ShadowBorderMask` `_RimBlendMask` `_MatCapBlendMask` `_EmissionBlendMask` `_BacklightBlendMask` | they need an extra UV transform and sampling; the payoff is below the effort, and they are **not in any phase plan** |
| **shadow color textures** | `_ShadowColorTex` `_Shadow2ndColorTex` | the same texture category as above |
| **AO shift** | `_ShadowAOShift` `_ShadowAOShift2` | needs AO Map support, and three's toon path does not hook up AO |
| **shadow normal strength** | `_ShadowNormalStrength` `_Shadow2ndNormalStrength` `_Shadow3rdNormalStrength` | sliders exist, but they only take effect once three's shading-banding maths is replaced (the other `*NormalStrength` are implemented) |
| **the full 2nd / 3rd set** | `_Main2nd*` `_Main3rd*` `_MatCap2nd*` `_Rim2nd*` `_Emission2nd*` | ✅ implemented (layer dissolve / distance fade / the normal-map path included); only `_Emission2ndBlink` (blinking) is not done |
| **advanced vertex color/UV transforms** | `*_ScrollRotate` `*_UVMode` `*_Parallax*` | not needed by the viewer |
| **explicitly not doing** | Glitter, AudioLink, Fur/Gem/Tessellation, Lightmap, screen-space shadows, VRC Light Volumes | see LILTOON1.x.md |

### What we did **additionally** (lilToon does not have these)

| Our key | Description |
|---|---|
| `shadowAmbient` | how much ambient light is kept in the shadow area —— compensating for three adding ambient light separately outside the banding |
| `outline.litBlur` (`litShadowBlur`) | the self-computed PCF blur radius for the outline's lit shadow |
| `outline.vectorTex` / `vectorScale` / `vectorUVMode` | outline extrusion direction texture |
| `outline.skipPattern` | skip the outline by mesh name (to prevent flicker on thin plates) |
| `outline.fixWidthMode` | constant screen thickness mode (lilToon's fixWidth does not work at normal viewing distances) |

---

## Phase 3 (2nd/3rd layers + Stencil)

### Completion status

| # | Item | Status |
|---|---|---|
| 9 | 2nd / 3rd main color layers | ✅ done (including their own blendMask) |
| 9 | MatCap 2nd | ✅ done |
| 9 | 2nd / 3rd normal maps | ⏸ **deliberately shelved** (a normal map path has to be built first; the highest cost) |
| 10 | Stencil | ✅ done (body + outline, 7 parameters each) |
| — | mask-type textures (BlendMask) | ✅ done (3) |
| — | outline texture UV transform / scroll / HSV | ✅ done |

### Main color layers 2nd / 3rd (_Main2nd* / _Main3rd*)

**⇒ This is not "adding one more normal map", it is adding one more base color layer**, (lil_common_frag.hlsl:671 / :757)

| Config | lilToon | Description |
|---|---|---|
| use | _UseMain2ndTex | switch |
| color | _Color2nd | color + **alpha** (this layer's opacity) |
| tex | _Main2ndTex | texture |
| uvMode | _Main2ndTex_UVMode | 0=uv0, 4=view spherical (1/2/3 need uv1~3, not supported yet) |
| blendMode | _Main2ndTexBlendMode | Normal / Add / Screen / Multiply |
| enableLighting | _Main2ndEnableLighting | **the proportion participating in lighting** (see below) |
| blendMask | _Main2ndBlendMask | takes the **R channel** and multiplies it into this layer's alpha |
| cull | _Main2ndTex_Cull | 0=both faces 1=back only 2=front only |

#### ★ _Main2ndEnableLighting is not a switch, it is "what proportion of this layer participates in lighting"

In lil_pass_forward_normal.hlsl it **blends twice**:

    :352 (before lighting)
        fd.col.rgb = lilBlendColor( fd.col.rgb, color2nd.rgb,
                                    color2nd.a * _Main2ndEnableLighting, _Main2ndTexBlendMode );
    :386 (after lighting)
        fd.col.rgb = lilBlendColor( fd.col.rgb, color2nd.rgb,
                                    color2nd.a - color2nd.a * _Main2ndEnableLighting, ... );

  ⇒ 1.0 = fully lit (affected by the shading banding, like part of the skin)
    0.0 = completely unlit (keeps its original color, like a sticker/emission)
    intermediate values blend proportionally.

So our implementation also **injects in two places**:
  · before → **before** #include <lights_fragment_begin>
    (at that point normal is already declared, and diffuseColor.rgb can still be changed)
  · after  → #include <dithering_fragment>
    **⚠️ a later .replace takes effect first**, so 3rd must be added before 2nd.
       Only then is the final execution order 2nd → 3rd (consistent with lilToon)

The intermediate results are passed through two globals: vec4 ba3dColor2nd / vec4 ba3dColor3rd.

#### ⚠️ "Culling" requires double-sided rendering

cull=1 (back only) on a material with **side=FrontSide** means **there are never any fragments**.
  The back face is culled at the rasterization stage, and gl_FrontFacing in the fragment is constantly true.
  So a is constantly set to 0, the symptom is "the overlay disappears", and it looks broken.
  cull=2 (front only) then changes nothing at all, just like cull=0.
⇒ As soon as any layer enables culling, switch the material to DoubleSide, and restore it when turned off.
   (syncLayerDoubleSide(), hooked onto every applyLilOutline())

### MatCap 2nd (_MatCap2nd*)

The parameters are isomorphic to the 1st, and along the way the three parameters that only the full version has were added to the 1st.

⚠️ lilToon's MatCap has **two sets**, a full version and a lite version:

    full version (:1414-1436 / :1482-1504)
        float4 matCapColor = _MatCapColor;                    ← has tinting
        matCapColor *= SAMPLE( _MatCapTex, matUV );
        matCapColor.rgb = lerp( rgb, rgb * fd.lightColor, _MatCapEnableLighting );
        matCapColor.a   = lerp( a, a * fd.shadowmix, _MatCapShadowMask );
        matCapColor.a   = fd.facing < ( _MatCapBackfaceMask - 1.0 ) ? 0.0 : a;   ← backface culling
        matCapColor.rgb = lerp( rgb, rgb * fd.albedo, _MatCapMainStrength );     ← multiply by albedo
        fd.col.rgb = lilBlendColor( ..., _MatCapBlend * a * mask, _MatCapBlendMode );

    lite version (:1446)
        fd.col.rgb = lerp( fd.col.rgb,
                           _MatCapMul ? fd.col.rgb * matcap : fd.col.rgb + matcap,
                           fd.triMask.r );

We **support both**: the original `mul` switch is kept (the lite form, off by default).
And color / backfaceMask / the albedo-based mainStrength were added.

Common generator: lilMatCapGLSL( M, texUni, triCall, tag ), shared by 1st / 2nd.

### Mask-type textures (BlendMask) —— only 3

⚠️ I first said "all four decoration layers have one", which was **wrong**; after grepping the source item by item:

| Parameter | lilToon line | Sampling | Status |
|---|---|---|---|
| _MatCapBlendMask | :1431 | `.rgb` → **per-channel** blend | ✅ |
| _MatCap2ndBlendMask | :1499 | same as above | ✅ |
| _EmissionBlendMask | :1715 | RGBA **multiplied as a whole** (rgb tints, a sets strength) | ✅ |
| _Main2ndBlendMask | :697 | `.r` multiplied into alpha | ✅ (already done for the main color layers) |
| _Main3rdBlendMask | :783 | same as above | ✅ |
| **_RimBlendMask** | — | **does not exist**; Rim uses `fd.triMask.g` (vertex color) | ✅ already there long ago |
| **_BacklightBlendMask** | — | **does not exist** | — |

#### ★ MatCap's mask is a vec3, so ba3dBlend3 is needed

    weight = _MatCapBlend * matCapColor.a * matCapMask      ← matCapMask is a float3
    ⇒ in mix( dstCol, outCol, srcA ) srcA is also a vec3 (per channel)

So a vec3 alpha version was added to GLSL:

    vec3 ba3dBlend3( vec3 dstCol, vec3 srcCol, vec3 srcA, uint blendMode ) { ... }

When there is a mask, ba3dBlend3 is used; when there is not, ba3dBlend (float) is still used, at zero cost.

#### Texture caching

    resolveMaskTexture()  →  reuses resolveDissolveTexture (**data texture**, NoColorSpace)
    ⚠️ It must not go through sRGB, otherwise mask values of 0~1 get distorted by gamma and the affected area is entirely wrong.
    ⚠️ During asynchronous loading it returns null, so the uniform must be declared **unconditionally** and covered by a placeholder texture.
       mask placeholder = pure white (.r = 1.0, equivalent to "no restriction")

### Outline texture UV transform / scroll / HSV

Three new parameters (lil_common_frag.hlsl:268-360):

| Config | lilToon | Format |
|---|---|---|
| texST | _OutlineTex_ST | [tilingX, tilingY, offsetX, offsetY], default [1,1,0,0] |
| texScrollRotate | _OutlineTex_ScrollRotate | [scrollX, scrollY, angle, angleSpeed], default [0,0,0,0] |
| texHSVG | _OutlineTexHSVG | [hue shift, saturation multiplier, brightness multiplier, gamma], default [0,1,1,1] |

    lilCalcUV (lil_common_functions.hlsl:436):
        outuv = uv * ST.xy + ST.zw;
        outuv = lilRotateUV( outuv, SR.z + SR.w * _Time.y ) + frac( SR.xy * _Time.y );

    lilToneCorrection (:328): gamma → RGB→HSV → adjust → HSV→RGB

**⇒ when all three are at their defaults it goes through three's native mat.map path, at zero cost, with no change in look**.
  Only when they are non-default is mat.map set to null and sampling done manually in the fragment.
  Time uses uBa3dTime, updated every frame in updateLilOutlineCamera.

(Note: _OutlineOffsetFactor / _OutlineOffsetUnits are **not used at all** in 1.3.7's hlsl.
  They are leftover Properties, and there is nothing to do)

### Stencil (stencil buffer)

lilToon has **two sets** (lts.shader:535-541 / :566-572):
body _Stencil*, outline _OutlineStencil*, 7 each.

#### ⚠️ Prerequisite: the renderer must enable the stencil buffer

    const renderer = new THREE.WebGLRenderer({ ..., stencil: true });

three r160 defaults to **false**, and a stencil buffer **cannot be added after the context is created**.
If this item is not changed, Stencil is implemented but still "does nothing when adjusted", yet another silent failure.

#### Unity enum → three constants (the two numbering schemes are completely different and cannot be passed through directly)

    Unity CompareFunction          three StencilFunc
      Disabled = 0                   Never = 512
      Never = 1                      Less = 513
      Less = 2                       Equal = 514
      Equal = 3                      LessEqual = 515
      LessEqual = 4          →       Greater = 516
      Greater = 5                    NotEqual = 517
      NotEqual = 6                   GreaterEqual = 518
      GreaterEqual = 7               Always = 519
      Always = 8  ← lilToon default

    Unity StencilOp                three StencilOp
      Keep = 0  ← lilToon default    Zero = 0
      Zero = 1                       Keep = 7680
      Replace = 2                    Replace = 7681
      IncrSat = 3            →       Increment = 7682
      DecrSat = 4                    Decrement = 7683
      Invert = 5                     Invert = 5386
      IncrWrap = 6                   IncrementWrap = 34055
      DecrWrap = 7                   DecrementWrap = 34056

#### Field correspondence

    _StencilRef        → stencilRef
    _StencilReadMask   → stencilFuncMask
    _StencilWriteMask  → stencilWriteMask
    _StencilComp       → stencilFunc
    _StencilPass       → stencilZPass     (Unity's Pass = both depth and stencil pass)
    _StencilFail       → stencilFail
    _StencilZFail      → stencilZFail

three only uses these settings when **stencilWrite = true**, and when it is off it fully restores the original 8 fields.

#### ★ How to use it correctly (the chicken-and-egg problem)

    ⚠️ Setting it globally to Comp=Equal + Ref=1 makes **everything** disappear.
       The initial stencil buffer = 0, the test 0 == 1 fails, and everything is discarded.
       Once discarded it does not write the stencil, so it stays 0 forever and always fails.
       (Measured symptom: the body disappears and only the outline color silhouette is left)

    Correct usage requires **two objects dividing the work**:
      object A (the marker): Comp = Always(8), Pass = Replace(2), Ref = 1
      object B (the receiver): Comp = Equal(3), Ref = 1
    ⇒ In the viewer that means: set A's parameters globally, then **select B in the material dropdown** and set B's parameters separately.

    Measured verification: global Comp=8/Pass=2/Ref=1, select CH0155_Shield_Toon and set Comp=3/Ref=1
      → the shield is only shown where another part occludes it (clipped)
      → set the outline's 8 items to Comp=3/Ref=1 as well, and the shield's outline disappears too.

### Decoration layer execution order (aligned with lilToon)

lil_pass_forward_normal.hlsl:352 / 360 / 411 / 445 / 450 / 457 / 472 / 478:

    Main2nd → Main3rd → Backlight → MatCap → MatCap2nd → Rim → Emission1st → Emission2nd
    (the first two are half before and half after lighting, so they are naturally first)

We had it wrong before (Rim → MatCap → Emission → Backlight); it has been changed to
**Backlight → MatCap → MatCap2nd → Rim → Emission**.

A wrong order changes the look when "multiple effects overlay in the same area", especially since Backlight is additive.

---

## ★ The scene view trio (Unity style)

> The toolbar's "Scene" button opens a `#scenePanel` floating window with three groups of controls.
> ⚠️ It is just an ordinary `.lp` floating window ⇒ dragging / resizing / position persistence are all handled by the floating-window base.

### ⚠️⚠️ Helper displays are **all off by default**, the main page turns them on explicitly

  ```
  main page index.html        showGrid:true · showViewGizmo:true   （scene view）
  embedded board autoMount       showGrid:false · showViewGizmo:false  （pasted onto a web page）
  ```

  ⚠️ The user's exact words: "the grid over on the web page board should be off".

  ⇒ In `viewer.js`, `showGrid` / `showViewGizmo` **default to false**.
     `index.html` **turns them on explicitly** in `createViewer(...)`'s opts.

  ⇒ An embedder that wants them writes data attributes:

      <div data-ba3d
           data-ba3d-grid="true"
           data-ba3d-axes="true"
           data-ba3d-gizmo="true"
           data-ba3d-light-helper="true"></div>

  ⚠️ The decision rule is always `!== 'false'` ⇒ writing `="true"` or just writing `data-ba3d-grid` both count as on.

  ### Measured

      main page index.html        {grid:true,  gizmo:true,  axes:false}
      embed page embed-demo.html  {grid:false, gizmo:false, axes:false}

---

### ① Helper displays

  | Key | Default | Notes |
  |---|---|---|
  | `showGrid` | **false** | ground grid (`GridHelper`, y=0 slightly raised by 0.0005 to avoid z-fighting) |
  | `showAxes` | false | origin XYZ axes (red X / green Y / blue Z, Unity coloring) |
  | `showLightHelper` | false | key light direction indicator (a line from the light position toward the origin + a small sphere at the end) |
  | `showViewGizmo` | **false** | bottom-right… no, **top-right** view gizmo |
  | `gridSize` / `gridDivisions` | 8 / 16 | grid size and division count |
  | `axesLength` | 1.6 | axis length |

  ⇒ The positive direction of the axes is solid, the negative direction is semi-transparent, （Unity does this too）

  ### ⚠️ Why the view gizmo is in the **top-right**

      The bottom-right is occupied by the "Status" floating window, the bottom-left is the toolbar ⇒ only the top-right is left.
      （Unity's Scene view is also top-right）

  ### ⚠️ The gizmo uses a **separate 2D canvas**, it does not open a second WebGL

  A second `WebGLRenderer` would fight for the context, and is very expensive.
  ⇒ Use a 2D canvas, rotate the three world axes by the **camera rotation**, and take the xy projection.
  ⇒ Sort by z, draw the ones facing away fainter ⇒ giving a sense of front/back occlusion.
  ⇒ Uses only rotation, not position ⇒ what it represents is "the current view direction", consistent with Unity.

### ② Lighting

  ⚠️ `keyLight` is a **directional light**; its `position` only indicates **direction** (the light source is at infinity)
  ⇒ Rather than making people fill in xyz, offer an **azimuth / elevation** (Unity's habit is also to rotate the orientation)

      azimuth   [0,360)  around the Y axis, 0 = +Z (model front), increasing clockwise
      elevation [-89,89] elevation, 0 = horizon · 90 = straight up

  Conversion (`anglesToPosition` / `positionToAngles`):

      x = r·cos(el)·sin(az)      y = r·sin(el)      z = r·cos(el)·cos(az)

  ⇒ When reading, it is **solved back** into angles ⇒ the three presets and manual value adjustment coexist.

  Adjustable: key light azimuth / elevation / intensity / color · ambient light intensity / sky color / ground color ·
        rim light intensity · fill light intensity · exposure · preset dropdown (Day / Morning & Evening / Night)

  ⚠️⚠️ **Manual changes blank out `cfg.lightingPreset`** ——
     otherwise the next `applyLighting()` would overwrite everything the user changed.
     ⇒ The panel's preset dropdown then shows "（custom）".

  ⚠️ What is written manually is the **final value**, it does not go through that toon coefficient in `applyLighting`
     （`key ×1.22` · `rim/fill ×0.15`）⇒ otherwise the panel display would not match reality.

### ③ Camera

  Readable and writable: `position[3]` · `target[3]` · `distance` · `fov`

  ⚠️ When only `target` is passed, the camera **translates along** (keeping the relative orientation, consistent with Unity's "move the observation point")

  Axis-aligned quick views (`setViewPreset`):

      front / back / left / right / top / bottom

  ⚠️ **Keeps the current distance** (otherwise it would suddenly zoom far away and the user would get dizzy)
  ⚠️ For straight up/straight down use a **slightly offset direction** (at pure vertical the orbit control's up degenerates ⇒ gimbal lock)

  ⚠️ The camera can be dragged with the mouse ⇒ the panel's numbers go stale ⇒
     while the panel is visible, **re-read at 2Hz** (not every frame), and **do not overwrite the field being edited**.

### API

      viewer.getSceneHelpers() / setSceneHelpers({...})
      viewer.getLightState()  / setLightState({...})
      viewer.getCameraState() / setCameraState({ position, target, distance, fov })
      viewer.setViewPreset('front'|'back'|'left'|'right'|'top'|'bottom')

### ⚠️ A wiring-order pitfall (hit it)

  The content of `#scenePanel` is built **when it is opened**, while `ensurePanelTitle` /
  `makePanelDraggable` / `initFloatWin` are defined **later** in this piece of code.

  ⇒ Calling directly would be `is not defined`, and yet the panel **still opens** ⇒ it is just not wired up for dragging, very subtle.
  ⇒ Fix: inside `toggleScenePanel`, use `setTimeout(..., 0)` to **defer by one frame**.
     （by then the script has finished executing and the functions are all in place）

  ⚠️ The title text goes through the `PANEL_TITLES` mapping table; do **not** modify the DOM.
     （`const txt = PANEL_TITLES[el.id] || el.id`）

---

# ★ Interaction conventions (read this section before changing the UI)

> The user's exact words: "**do not add a learning cost for people and do not make things feel counter-intuitive or anti-human**"
> ⇒ This is this project's **highest design constraint**; no amount of "technical elegance" may violate it.

## 1. Align with industry conventions · do not invent your own

  | Thing | Convention |
  |---|---|
  | Quick view Top / Bottom | **Vertical** (looking straight down / straight up), no slanted versions allowed |
  | Quick view Front / Back / Left / Right | The camera lands on a **world axis** |
  | Screen up | = **+Z = the character's front** (same as Unity / Blender) |
  | Looking down / looking up | When the camera is below the ground, **hide the grid automatically** (mimicking Unity's single-sided Grid) |
  | Status floating window | **Bottom-right** (the info slot in IDEs / engines) |
  | Toolbar | Bottom-left · launcher |
  | Character display | Top-left · the canvas body |

  ⚠️ The reason I **changed the looking-down / looking-up behavior three times** before was that I was inventing my own:
     ① Offset 0.0001 to dodge gimbal lock ⇒ degenerate orientation
     ② Changed looking-up to a **slanted** one ⇒ "why did you make it slanted, aaaah"
     ③ Looking down with `up=(0,0,-1)` ⇒ the model appears **upside down** on screen
     ✅ Correct answer: **the right direction + swap the up vector** (solve technical problems with technical means)

## 2. Do not use internal nouns as UI copy

  |, Do not use |, Use |
  |---|---|
  | `pivot` / 取景中心偏移 (framing center offset) | **修正模型位置 XYZ** (correct model position XYZ) |
  | `groundOffsetY` | Same as above (it is just an alias for `modelOffset.y`) |
  | `showGrid` / `showAxes` | Ground grid / origin axes |
  | `action` mode | **view** (users call it view; the internal value is still action) |

  ⚠️ A distinction like "the button is called **场景** (Scene) · the panel is called **场景参数** (Scene parameters)" must be **necessary** to be worth it.
     Keeping two names purely for historical reasons ⇒ that is just a learning cost.

## 3. The default state is the correct state

  ⚠️⚠️ **Never allow "it only takes effect after you click once"** ——

     My mistake: `buildShaderPanel()` was only called when the panel was **opened** ⇒
     in the default state the toolbar was still full ⇒ what the user saw was the opposite of the requirement.
     And my probe **clicked the button before measuring** ⇒ so it could never find this.

  ⇒ Rule: **to test the default state, do not perform any interaction**, and only then add interaction tests.
  ⇒ Rule: decorative / structural elements should be **written into the HTML**, not inserted at JS runtime.
     (The three `.fw` floating windows are hard-coded ⇒ they have never had the "wiped out by a rebuild" problem.
       `partsPanel` / `lilPanel` are built at runtime ⇒ their title / [—] / grip **disappear in turn**)

## 4. The coordinate system must be self-consistent (one mental model)

      · The **center axis** under the character's feet = the vertical line at the world origin
      · The purpose of `modelOffset` = **to place the model onto that line** (default 0 ⇒ it is already on it)
      · Auto-grounding is responsible for making the feet land on y=0
      · Quick view: the camera is on a world axis, the target is on the center axis
      · Orbital rotation turns around this center axis ⇒ **centered on the character**

  ⚠️ Counterexample (already fixed): `sample.json` still had the old `pivot.x = -0.1` ⇒
     under the old semantics it meant "only move the camera aim point", but migrated to the new semantics it becomes
     **"push the model 0.1 away from the center axis"** ⇒ the exact opposite of the whole mental model.

## 5. A concept may have only one source of truth

      ⚠️ Similar cases hit in this session:
        · `groundOffsetY` and `modelOffset.y` coexisting ⇒ auto-grounding "wrote but nobody read"
        · Display mode switching placed both in the toolbar and in the panel ⇒ changed to using only the one at the top-left of the floating window
        · `pivot` and `modelOffset` coexisting ⇒ pivot has been deprecated

      ⇒ When merging concepts you **must change all writers together**; miss one and it silently stops working.

---

## ★ Floating window layout (Unity style)

> `index.html` is no longer a "full-screen scene + fixed sidebar", but rather **several non-nested floating windows**.
> Like Unity: the scene in one window · the parameter panel in another · both can be dragged and resized.

### Why change it

  ⚠️ `frameModel()` scales the model to a fixed pixel height based on **`container.clientHeight`**.
     And the scene used to be `position: fixed; inset: 0` (filling the viewport) ⇒
     **when the browser window gets shorter ⇒ the model shrinks too**, which is very surprising.
  ⇒ Fixed-size floating windows ⇒ constant `clientHeight` ⇒ **constant model size**.

  ⚠️ When the user **actively** resizes the scene window, it **still** re-frames —— this is expected behavior.
     Unity's Scene view behaves the same way.

### The four floating windows

  | id | Title | Content | Default position · size |
  |---|---|---|---|
  | `#sceneWin` | 场景 (Scene) | `#app` (three canvas) + `#vignette` | 16,16 · 960×700 |
  | `#hudWin` | 工具栏 (Toolbar) | `#hud` (buttons + action/lighting/brightness/shadow/banding color/clamp) | 16,bottom · 660×210 |
  | `#infoWin` | 状态 (Status) | `#info` (frame rate / triangle count / material count) | right,16,bottom · 300×130 |
  | `.lp` ×3 | 参数 / 导出 / 部件 (Parameters / Export / Parts) | lilToon panel · Export JSON · parts list | right,top · 400 wide |
  | `#upload` | 自定义模型 (Custom model) | Upload glb / texture / config (using its own `.u-title` as the handle) | left,top · 288 wide |

  ⚠️ `#loading` is **not** a floating window —— it is a loading overlay and is still a full-screen cover.

### Common operations

     Drag      Hold the **title bar** and drag (`#upload` is dragged by holding its own `.u-title`)
     Resize    Drag the **small triangle at the bottom-right** (`.fw-grip`)
     Layering  Whichever window you click comes to the front (adds `.raised` ⇒ z-index:30)
     Persistence  Automatically saved into localStorage under `ba3d-layout-v1` (the key name deliberately has no dot)
     └ What is saved   left / top / width / height / collapsed

  ⚠️ The key name **deliberately has no dot** —— `check-panel.mjs` treats dotted strings in the source
     as a panel's "group.key" ⇒ a dotted key name would be misjudged as a group name (actually hit this)

### Reset layout

  **Run in the console**:

      ba3dResetLayout()        // clear persistence + reload

  ⚠️ It is also attached to `window.ba3dResetLayout`.

### Narrow-screen fallback

  ⚠️ Floating windows are impractical on phones ⇒ under `@media (max-width: 820px), (max-height: 560px)`:

      #sceneWin   Fill the viewport · remove border radius · hide the title bar and grip
      .lp         Full-screen cover (the inside can already scroll)
      #hudWin     bottom 34vh · #infoWin bottom 20vh
      #upload     Full-screen cover

  ⇒ It does not matter that they cannot be dragged (both the title bar and the grip are hidden); CSS alone is enough, no JS branching needed.

### Where it is implemented

  · CSS     The four rules `.fw` / `.fw-title` / `.fw-body` / `.fw-grip` in `index.html`
  · Drag    Reuses the existing `makePanelDraggable(el, handleSel)`
             (handle chain: `.fw-title` > `.lp-title` > `.u-title` > `h4`)
  · Resize  `makePanelResizable(el)` —— bottom-right grip · minimum 240×160 · clamped to the viewport.
  · Persistence   `fwSave` / `fwRestore` / `fwClearAll` / `fwClampBox`
  · Aggregation   `initFloatWin(el)` = drag + resize + restore + layering.
             `enableAllPanelDrag()` calls it for all `.fw` and `.lp`.

  ⚠️ **Zero DOM restructuring**: `.lp-title` is already `position: sticky`, so when the panel scrolls internally
     the title is not scrolled away, and there is no need to touch the container of those 438 controls.

---

## ★ `modelOffset` (correct model position) · `pivot` is deprecated

  ### What it controls

      renderer.modelOffset = { x, y, z }     // world units

  ⇒ **It is the model itself that moves** ⇒ shadow / outline / lighting all follow.
  ⇒ The camera aim point = the model's new center ⇒ **rotation is naturally centered on the character**.

  ### ⚠️ Difference from the deprecated `renderer.pivot`

      Old approach pivot = { x, z }   only moved the **camera aim point**
        ⇒ It looked like the model had shifted, but **neither the model nor the shadow moved** ⇒ not intuitive.
        ⇒ And "rotation centered on the character" was **faked** by offsetting the aim point.

      New approach modelOffset = { x, y, z }   **actually moves the model**
        ⇒ Once the model is at 000, the rotation center is naturally the character.

  ⇒ The user's own words:

      "The framing center offset was itself designed to make the character sit at the rotation center when rotating.
        What we actually need is for people to be able to intuitively move the model to the 000 position.
        That way rotation looks centered on the character, **without moving the rotation axis but moving the character's position**"

  ### ⚠️ `pivot` is deprecated (but the API is still there)

      · `renderer.pivot` —— **already removed** from the default configuration, and no longer read on load.
      · `viewer.getPivot()` / `setPivot()` —— kept but **nobody calls them**, regarded as deprecated.
      · The "取景中心" (framing center) group in the scene panel —— **already deleted**, only "修正模型位置" (correct model position) remains.

  ### Default-value migration for the three old controls

      The toolbar's original three controls "落地微调 / 基准X / 基准Z" (ground fine-tune / pivot X / pivot Z) have been deleted ⇒ merged into modelOffset:

          落地微调 (ground fine-tune) (groundOffsetY) ⇒ **modelOffset.y** (`groundOffsetY` is kept as a compatibility alias)
          基准 X (pivot X) (pivotX)          ⇒ **modelOffset.x**
          基准 Z (pivot Z) (pivotZ)          ⇒ **modelOffset.z**

      ⇒ In `sample.json` / `fallback.json`, the original `pivot.x = -0.1` has been migrated to
         `renderer.modelOffset = { x: -0.1, y: 0, z: 0 }` (to preserve the original look)

  ⚠️ There is also a **pitfall**: `modelOffset` must be placed inside `renderer`.
     The first time I wrote it at the JSON **top level** ⇒ the loader did not recognize it ⇒ the config silently stopped working.

---

## ★ Framing vertical offset defaults to 22 (`framingOffsetY`)

  ⚠️ This default was **tuned by measurement**, not handed out casually.

  ### Why it is not 0

  `CH0155_Vital_Death` (the falling-down motion) drops entirely into the lower half of the frame at **second 4** ⇒
  the bottom exceeds the lower edge by **0.0934 NDC** ⇒ it gets clipped.

  ⚠️ Sampling a single moment **cannot reveal this** —— the frame at 0.7 seconds is completely normal.
     You must sample multiple moments per motion (0.4 / 1.0 / 1.8 / 2.8 / 4.0 / 6.0 seconds) and take the worst value.
     (you can also check it yourself with `viewer.frameFitReport()`)

  ### How 22 was derived

      `framingReferenceHeight = 430` ⇒ half height 215px
      0.0934 NDC × 215 ≈ 20px ⇒ take **22** to leave a little margin.

  ### Measured effect (the 5 tightest motions × 3 moments)

      Motion                   Before      After
      CH0155_Vital_Death      −0.0934, +0.0372.
      CH0155_Exs_Cutin        +0.0131      +0.1350    ← it used to hug the bottom edge and was saved along with it
      CH0155_Vital_Dying_Ing   …           +0.1881.
      CH0155_Vital_Panic       …           +0.1937.
      Clipped: 1 ⇒ **0**.

  ### ⚠️⚠️ This is not "raising the ground / raising the model"

, raising the model  ⇒ the foot grounding that was just fixed would break, and the shadow would separate from the feet again
, what is changed is the **camera aim point** (`target.y` of `frameModel`)
        ⇒ the ground is still at y=0, and the feet are still at y=0 (the grounding of `groundOffsetY` still applies)

  ### How to tune it

      "Positive value = framing moves down ⇒ the picture content **moves up**"
      ⇒ Content clipped by the **bottom edge** ⇒ tune it **larger**
      ⇒ Content clipped by the **top edge** ⇒ tune it **smaller** (or give a negative number)

  ⇒ It can also be changed at runtime (no refresh needed):

      viewer.getFraming()                        // see the current value
      viewer.setFraming({ framingOffsetY: 30 })  // change it
      viewer.frameFitReport()                    // measure whether anything goes off frame

  ⚠️ After switching models, it is recommended to run `probe-fit.mjs` once to see whether the new model's motions go off frame.

---

## ★ Grounding: character feet and the ground (`groundOffsetY`)

### Problem

  "The character's feet are not grounded, and the shadow and the body are separated" (long-standing feedback)

  ⚠️ Root cause: `fitToView` uses the `min.y` of `measureContentBox(root)` to drop the model to y=0.
     But **the bounding box of a skinned mesh is that of the bind pose** ⇒
     once the animation moves, the real height of the feet changes ⇒ a gap appears between the shadow (cast on y=0) and the feet.

  ### Measured (measured with a headless browser)

      Before auto-grounding   minY = 0.0664   groundY = 0   gap = 0.0664   ← floating in the air
      After auto-grounding    minY = -0.00003 groundY = 0   gap = 0        ← precisely grounded
      Sampled 9303 points / 11 meshes

  ⇒ The model is 2 world units tall in total ⇒ floating about **3.3% of body height** ⇒ exactly the seam that is visible to the naked eye.

  ### How to measure: `viewer.probeGround()`

  ⚠️ You **must apply the skinning transform to the vertices**, you cannot read the bounding box.
     Use `SkinnedMesh.applyBoneTransform(i, v)` (three r151+).
     Then `applyMatrix4(o.matrixWorld)` to world space.
     There are hundreds of thousands of vertices ⇒ sample about 2000 points per mesh (enough density at the feet)

  ### Configuration

  | Key | Default | Description |
  |---|---|---|
  | `groundOffsetY` | 0 | Ground fine-tune (world units); positive raises · negative pushes down |
  | `autoGroundSnap` | true | **Automatically ground once** after loading |

  ### ⚠️⚠️ Why it can only be applied **once**

  Motions such as jumping / crouching / lifting a leg **exist precisely to take the feet off the ground**.
  Grounding every frame would flatten them ⇒ the character would look nailed to the ground.

  ⇒ And you must **wait until the animation has advanced 12 frames** before measuring ——
     right after load the pose is still the bind pose, which is exactly what fitToView already used ⇒ the measured gap≈0 and grounding is wasted.

  ⇒ If the gap is smaller than `0.5% × body height`, do not ground (skinning sampling has noise, and grounding may overshoot)

  ### Panel

  In the toolbar there are:

      落地微调 (ground fine-tune)   Slider + number box (-0.5 ~ 0.5)
      自动贴地 (auto-ground)        Button ⇒ `viewer.snapToGround()` (measure once · compensate automatically)

  ⚠️ If the slider has been adjusted manually ⇒ auto-grounding **steps aside** (`__autoSnapSkip`) and does not overwrite the user's value.

  ### ★ Framing follows along (important, a hidden risk the user raised)

  ⚠️ `frameModel` uses the **`contentBox` cached** during `fitToView`.
     But grounding moves the whole model down by `groundOffsetY` ⇒ the framing center still sits at the old position.

      Small offset (default −0.0666 = 3.3% of body height) ⇒ not noticeable
      The slider can go to ±0.5 (= 25% of body height) ⇒ at that point it will push out of frame.

  ⇒ Fix: add `groundOffsetY` to the `target.y` of `frameModel`.
     And recompute **only when the ground fine-tune changes** (not every frame).

  ### Measured (NDC margin measured for each of 24 motions)

      Before      Tightest motion  top=0.2133  bottom=0.1161
      After       Tightest motion  top=0.1553  bottom=0.1745   ← more balanced
      Clipped motions  0 / 24.

      Extreme offset (both ends of the slider · 25% of body height):
        Offset −0.5  ⇒ top=0.6734  bottom=0.2518.
        Offset +0.5  ⇒ top=0.6751  bottom=0.2040.

  ⚠️ How to measure: `viewer.frameFitReport()` projects the **skinned bounding box** of the current pose into NDC.
     `|ndc| <= 1` is inside the frame; anything beyond is clipped.
     ⇒ After switching models / motions, if you want to confirm "does anything go off frame", just run it once and you will know.

  ### The ground itself does not need to move

  Grounding is **stretching the model down to the ground**, not raising the ground ⇒
  the ground is still at `y=0`, and the feet are exactly at `y=0`, so the contact is accurate.

  ### API

      viewer.probeGround()            → { minY, groundY, gap, sampled, meshes }
      viewer.frameFitReport()         → { ndcTop, ndcBottom, marginTop, marginBottom, clipped }
      viewer.getGroundOffset()        → current offset
      viewer.setGroundOffset(y)       → set it (disables auto-grounding)
      viewer.snapToGround()           → ground automatically for the current pose
      viewer.onGroundOffsetChange(fn) → sync the panel slider after auto-grounding

---

## ★ Day mode (`body.light`)

  ### What it does

  A "日间 / 夜间" (Day / Night) button on the far left of the toolbar switches the whole color scheme.

  ### ⚠️ The approach is **incremental override**

  Append a set of `body.light …` rules before `</style>` in `index.html`.
  **Not touching any of the dark rules above** ⇒ zero risk for night mode (not a single byte changed)

  ⇒ If you want to add one more spot, just add a rule with a **matching selector** inside that set (the one written later wins)

  Scope of the override (about 40 rules):

      html/body background · .fw / .fw-title / .fw-grip · the body of #sceneWin
      #hud's buttons / dropdowns / number boxes / separators / option
      .lp panel + title bar + buttons + textarea + inputs
      #upload upload panel + .u-pick + .u-actions
      #info / #loading / #bar · #vignette (in day mode the vignette is relaxed, otherwise the corners go black)

  ### Priority

      localStorage('ba3d-theme')  >  the system's prefers-color-scheme  >  night

  ⚠️ The key name **has no dot** (`check-panel.mjs` treats dotted strings as a panel's "group.key")

  ### Console

      ba3dSetTheme('light')     // or 'dark'

  ### ⚠️ The scene background changes along with it

  The default background is "transparent" ⇒ the CSS color of the scene window body shows through ⇒
  in day mode the model stands on a **light-colored** background (this is intentional and consistent with Unity)
  If you want a fixed base color ⇒ use the "背景" (Background) dropdown in the toolbar to pick a specific color.

---

## ★ Added 2026-10-06 (aligned with lilToon 2.3.4)

> This batch is everything that was filled in after switching the baseline from lilToon 1.3.7 to **2.3.4**.
> For the version comparison and source map, see [`LILTOON2.x.md`](LILTOON2.x.md).

### 1. Render state (per material) —— `_TransparentMode` / `_Cutoff` / `_Cull`

  **Three top-level keys**, all defaulting to **-1 = do not change** (inherit the value that comes with the model):

  | Key | Default | Corresponds to | Description |
  |---|---|---|---|
  | `transparentMode` | -1 | `_TransparentMode` | -1 no change · 0=Opaque · 1=Cutout · 2=Transparent · 3~6 (Refraction/Fur/FurCutout/Gem) are downgraded to Transparent and a log is printed |
  | `cutoff` | 0.5 | `_Cutoff` | Only meaningful in Cutout mode |
  | `cull` | -1 | `_Cull` | -1 no change · 0=Off (double-sided) · 1=Front · 2=Back |

  ⚠️ **Unity and three have different side enum orders** ⇒ they cannot be copied directly.

      _Cull 0 (Off, double-sided) → THREE.DoubleSide (2)
      _Cull 1 (Front)    → THREE.FrontSide  (0)
      _Cull 2 (Back)     → THREE.BackSide   (1)

  ### The **single authority** for alphaTest is `syncDissolveAlphaTest`

  Priority (from high to low):

      ① Dissolve is on (lilToon and dissolve.mode > 0) ⇒ max( 0.5, original value )
         (it must be ≥ 0.5 to actually discard)
      ② transparentMode = 1 (Cutout) ⇒ cutoff
      ③ transparentMode = 0 / ≥2 (Opaque / Transparent) ⇒ 0
      ④ Mode unchanged (-1) but cutoff given separately and it was originally Cutout ⇒ cutoff
      ⑤ Otherwise ⇒ restore the model's original value (userData.__ba3dOrigAlphaTest)

  ⚠️ `applyLilRenderState` **does not touch** alphaTest; it only sets transparent / depthWrite / side.
     The division of labor between the two is to avoid applying it twice (hit this once)

  ⚠️ Changing alphaTest affects three's `USE_ALPHATEST` macro ⇒ `needsUpdate = true` is required.

  ### Sync chain (order matters)

      syncDissolveAlphaTest();   // ① alphaTest (single authority)
      syncRenderState();         // ② transparent / depthWrite / side
      syncLayerDoubleSide();     // ③ culling of the main color layer (explicit _Cull takes precedence · will be skipped)
      syncStencil();             // ④ stencil parameters
      applyOutlineParams();      // ⑤ re-evaluate the outline skip rules

  ⚠️ The first four functions must all traverse everything on **every configuration change**.
     Because **materials are reused** ⇒ `patchToonMaterial` will not run again ⇒ changing only the config has no effect.

### 2. Main color UV / tone —— `_MainTexHSVG` / `_MainTex_ScrollRotate`

  | Key | Default | Corresponds to |
  |---|---|---|
  | `mainTexHSVG` | `[0,1,1,1]` | `_MainTexHSVG`: (hue shift, saturation multiplier, brightness multiplier, Gamma) |
  | `mainTexScrollRotate` | `[0,0,0,0]` | `_MainTex_ScrollRotate`: (scroll X, scroll Y, rotation angle, rotation angular speed) |

  Formula copied verbatim (`lil_common_frag.hlsl:263 / :317`):

      fd.uvMain = lilCalcUV( fd.uvMain, _MainTex_ST, _MainTex_ScrollRotate );
      fd.col.rgb = lilToneCorrection( fd.col.rgb, _MainTexHSVG );

  ⇒ Implementation: **replacing `#include <common>` (adding a uniform + two helpers)
     and **`#include <map_fragment>`** (swapped for a patched sampling).

  ⚠️ **Do not multiply by `_MainTex_ST` anymore** —— three's `vMapUv` already includes ST.
  ⚠️ **GLSL has no function hoisting** ⇒ the order in the generator must be "rotation function → scroll function → call".
  ⚠️ When everything is at default the generator returns `null` ⇒ both replaces degrade to the original text ⇒ **zero side effects**.

  ### Time uniform (`uBa3dTime`)

  ⚠️ **Declared unconditionally** (an unused uniform gets optimized away by GLSL ⇒ declaring it without using it costs nothing)
     Because declaring it only when needed lets cases slip through —— Decal's atlas animation uses it too (hit this once)

  ⚠️ All shaders **share the same uniform object** (`ba3dTimeUniform`).
     It is not "maintain a list of shaders and change them afterwards" (that way the uniforms three has already processed cannot be changed; hit this before)

  ⚠️ **Known deviation**: lilToon changes the **shared `fd.uvMain`** ⇒ the shadow/outline textures scroll along with it.
     We only change the main color texture's own UV ⇒ this is recorded as a known difference in `LILTOON2.x.md`.

### 3. Layer Alpha mode —— `_Main2nd/3rdTexAlphaMode`

  `main2nd.alphaMode` / `main3rd.alphaMode` (Int · default 0):

      0 = do not change   1 = replace with this layer's alpha   2 = multiply
      3 = add (clamped)   4 = subtract (clamped)

  ⚠️ **Only takes effect under Cutout / Transparent** —— in lilToon the whole block sits inside
     `#if LIL_RENDER != 0`, and three has no such macro
     ⇒ it is inferred from `mat.alphaTest > 0 || mat.transparent`.
  ⚠️ After use it **sets this layer's alpha to 1** (`lil_common_frag.hlsl:805`)
     ⇒ the immediately following **color blending** is computed at full strength (this line is very easy to miss)

### 4. Dither —— `_UseDither` / `_DitherTex` / `_DitherMaxValue`

  `dither: { use, url, maxValue }`, formula copied verbatim (`lil_common_frag.hlsl:524-546`):

      fd.col.a = fd.col.a >= ( texture value * 255 + 1 ) / ( _DitherMaxValue + 2 ) ? 1 : 0;

  ⚠️ **GLSL ES 1.00 has no `uint`** ⇒ the equivalent of `lilSamplePointRepeat`:

      vec2 cell = mod( floor( gl_FragCoord.xy ), size );
      vec2 uv   = ( cell + 0.5 ) / size;      // ★ use the texel center

  ⚠️ Use the **texel center** rather than lilToon's literal `uv/size`.
     Because on the Unity side `_DitherTex` is usually Point-filtered (corner = center ⇒ equivalent)
     while **three loads textures with LinearFilter by default** ⇒ landing on a corner blends 4 texels ⇒ the dot pattern gets blurred out.

  ⚠️ The texture defaults to white ⇒ all 1s ⇒ threshold = 256/257 ≈ **0.996** ⇒ **almost everything is discarded**
     To get a real dot-pattern effect you need an **ordered dither matrix** texture.
     Two are built in and ready to use:

         assets/test/dither-bayer4.png   4×4   16 distinct values
         assets/test/dither-bayer8.png   8×8   64 distinct values

### 5. Decal —— `_Main2nd/3rdTexIsDecal`

  ⚠️ **A Decal is not an independent layer** ⇒ it is a **mode** of main2nd / main3rd.
     The logic is in `lilGetSubTex` (`lil_common_functions.hlsl:719`).

  7 switches + 2 vec4s per layer:

      isDecal / isLeftOnly / isRightOnly / shouldCopy / shouldFlipMirror / shouldFlipCopy
      decalAnimation (4)   // (columns, rows, fixed frame, frame rate) default (1,1,1,30)
      decalSubParam  (4)   // (width, height, snap to center, 1)    default (1,1,0,1)

  Three-part formula (copied verbatim):

      lilCalcDecalUV (:473):
          if(shouldCopy) outUV.x = abs(outUV.x - 0.5) + 0.5;
          outUV = outUV * uv_ST.xy + uv_ST.zw;
          if(shouldFlipCopy && uv.x < 0.5) outUV.x = 1.0 - outUV.x;
          if(shouldFlipMirror && isRightHand) outUV.x = 1.0 - outUV.x;
          if(isLeftOnly  &&  isRightHand) outUV.x = -1.0;
          if(isRightOnly && !isRightHand) outUV.x = -1.0;
          outUV = (outUV - uv_ST.zw) / uv_ST.xy;      // undo ST before rotating
          outUV = lilRotateUV(outUV, angle);
          outUV = outUV * uv_ST.xy + uv_ST.zw;

      lilCalcAtlasAnimationAtAnimTime (:533) —— atlas frame animation
      Edge AA (:748): outCol.a *= lilIsIn0to1( uv2, saturate(nv - 0.05) )
          ⚠️ HLSL passing a float2 to a float ⇒ **implicitly truncated to .x** ⇒ **only the x direction is tested**.

  ⚠️ `isRightHand` = **the sign of the tangent W** (`lil_pass_forward_normal.hlsl:341`)
     A model without tangents ⇒ always 1.0 (= lilToon's initial value, `lil_common.hlsl:162`)
  ⚠️ The edge AA of `isDecal` clears pixels whose `decalUv.x` falls outside [0,1].
     When using a UV channel that goes outside [0,1], you must set `texST` to squeeze the range back in.

  ### ⚠️ Practical note (to avoid misunderstandings)

  **A Decal is not a tool for "sticking an image somewhere on the face"**; it gives this layer's texture
  **a different set of sampling rules** (different UV / mirroring / one side / atlas animation / clipping to [0,1])
  ⇒ A real "decal" comes from **the model/artist providing a set of UVs prepared for decals**.
  ⇒ The uv1 of the BA series repeats over a large range ⇒ `texture2D(tex, uv1)` only yields **stripes**.
     (Using the same UV1 + the same ST in Unity produces exactly the same stripes; it is not a bug)

  ⇒ The practical use of `texST` here is "**zoom into one part of the texture and tile it across**", not free placement.
  ⇒ "★Decal 调试" (★Decal debug) = 2 can output the decal UV directly as color, to confirm where the UV lands.

### 6. Reflection / specular highlight —— `_UseReflection` / `_ApplySpecular`

  `reflection: { use, apply, toon, border, blur, normalStrength, smoothness,
                reflectance, metallic, color, blendMode, aaStrength }`

  ⚠️ **`_UseReflection` defaults to 0** ⇒ lilToon **does not draw highlights** by default.
     Of the 19 official presets only 3 enable it (Inorganic-Glass / LiteGlass / Metal)
     ⇒ This is a feature for **metal / glass-like** materials; skin/clothes/hair all leave it off.

  Formula copied verbatim (`lil_common_frag.hlsl:1189-1208` / `:1348`):

      N  = lerp( fd.origN, fd.N, _SpecularNormalStrength );
      H  = normalize( fd.V + L );
      nh = saturate( dot( N, H ) );
      if ( _SpecularToon )
          reflectCol = lilTooningScale( _AAStrength, pow( nh, 1.0/fd.roughness ),
                                        _SpecularBorder, _SpecularBlur );
      fd.col.rgb = lilBlendColor( fd.col.rgb, reflectionColor.rgb * lightColorSpc,
                                  reflectCol * reflectionColor.a, _ReflectionBlendMode );

  `roughness = (1 - _Smoothness)²` (`lil_common.hlsl:200` + `lil_common_frag.hlsl:1311-1312`)

  ⚠️ **`_Smoothness = 1` (the default) ⇒ `roughness = 0` ⇒ `pow( nh, 1.0/0.0 )`**.
     HLSL: `pow(x, +INF)` returns 0 for x<1 · 1 for x>=1
     GLSL: **an infinite exponent is undefined behavior** ⇒ written explicitly as `ba3dSpNH >= 1.0 ? 1.0 : 0.0`.

  ⚠️ Decoration layer order (`lil_pass_forward_normal.hlsl:335-470`).
     Reflection comes **after Backlight · before MatCap**.

  ⚠️ Intentionally not done: `_ReflectionCubeTex` (Unity relies on a Reflection Probe) · the full non-toon GGX.

### 7. ★ Outline and transparent materials (behavior change)

  **lilToon has no rule saying "skip the outline for transparent materials"**; it draws outlines for transparent materials too.
  ⇒ Our old rule was an approximation we added ourselves ⇒ **it has been removed**.

  ### Current behavior

      · Transparent materials **draw the outline as usual**
      · The outline material's `transparent` follows the source ⇒ **`depthWrite = false`**
        (otherwise the opaque shell would **depth-cull** the semi-transparent body into a solid; hit this once)
      · The outline color / alpha comes from `_OutlineColor` (the outline color + transparency in the panel)
        ⚠️ **It is not multiplied by the source material's alpha** —— in lilToon, `fd.col.a *= _OutlineColor.a`.
           The real mechanism of "following the transparency" is that **the outline pass inherits the material's `_TransparentMode`**
           (blending / depth state), not multiplying the alphas together.

  ### ⚠️ There are **two outline systems**, and their state must be shared

      ① three's OutlineEffect (non-lilToon mode)
      ② the independent inverted-hull mesh of `applyLilOutline()` (lilToon mode)

  ⇒ The two each have their own "skip" rules, and **changing one does not affect the other** (hit this once)
  ⇒ Now `applyLilOutline` also reads `userData.outlineParameters.visible`.

  ### Related configuration

      outline.skipPattern      Exclude by **mesh name** regex (default "Halo"; thin plates poke through themselves and cause flicker)
      outline.skipTransparent  【our switch】whether semi-transparent materials should skip the outline entirely
                               ⚠️ Default **false** = draw it (= lilToon)
                               It only needs to be turned on in extreme thin-plate cases.
      (ground / mouth patches with off = true **always** skip, regardless of transparency)

### 8. ★ Layout: if there is a texture ⇒ this layer counts as enabled

  ⚠️ lilToon's `_UseMain2ndTex` is **a switch of its own**, while the user's mental model is
     "I picked a texture = this layer is in use" ⇒ if it is not turned on, the first line of `lilMainLayerGLSL`
     is `return null` ⇒ **all the parameters after it in the panel stop responding**, even though the texture row clearly shows a file name.
     (Stuck on this for a long time; the user's own words: "I use uploading a texture as enabling it")

  ⇒ Three safeguards:

      ① Panel `mkTex`: when choosing a file for the layer's main texture, also set `use = true`
      ② `applyLilConfig`: if `tex` has a value ⇒ `G.use = true` (any code path)
      ③ **Read path** `normalizeLayerUse()`: both return points of `lilCfgFor` go through it
         ⇒ Even **old configurations** (where the texture was chosen long ago and no onchange will fire again) get patched up.

  ⚠️ Side effect: you **cannot** temporarily turn off a layer that already has a texture via "enabled = 0".
     To turn it off, click "清除" (Clear) on the texture row (that is the intuitive behavior)

### 9. ★★ Fix for a **long-standing bug** (the largest impact)

  ⚠️ three's toon lighting reads **`material.diffuseColor`** (that struct).
     **Not** the local `diffuseColor`:

      lights_toon_pars_fragment:
          reflectedLight.directDiffuse   += irradiance * BRDF_Lambert( material.diffuseColor );
          reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );

  ⇒ And we had always been writing the local `diffuseColor` ⇒ **no effect on lighting whatsoever**.
  ⇒ And when `enableLighting = 1` the after block is `srcA = a × (1-el) = 0` ⇒ **neither side contributes**.
  ⇒ ⇒ **With "light interaction ratio = 1" (the default), "main color layer 2nd / 3rd" is completely invisible.**
     The feature was in fact **half broken** and had been lurking for a long time.

  ### ✅ Fix: additionally emit an `afterMaterial` section

      before #include <lights_fragment_begin>  ⇒ before        (compute the layer color · write diffuseColor)
      after  #include <lights_fragment_begin>  ⇒ afterMaterial (feed material.diffuseColor) ★
      before #include <dithering_fragment>     ⇒ after         (the unlit part / dissolve edge)

      material.diffuseColor.rgb = mix( material.diffuseColor.rgb,
                                        ba3dColor2nd.rgb, ba3dColor2nd.a * el );

  ⚠️ **It must come after the include** —— `material` is assigned **inside that include**.
  ⚠️⚠️ **You must not reference `ba3dLc`** —— it is a local variable inside the `{ }` block of before.
     And afterMaterial is outside the block ⇒ GLSL has no out-of-block visibility ⇒ compilation fails.
     ⇒ Use the `ba3dColor2nd` / `ba3dColor3rd` declared in the preamble.

### 9.5 Additions: layer dissolve / Decal debug / MatCap / outline stencil


  #### Layer dissolve for main color layers 2nd / 3rd (`main2nd.dissolve*` / `main3rd.dissolve*`)

  | Key | Default | Corresponds to |
  |---|---|---|
  | `dissolveThreshold` | 0 | `_Main2ndDissolveParams.x` threshold (the criterion in texture mode) |
  | `dissolveSoftness` | 0 | `..y` feathering (softening the boundary) |
  | `dissolveDir` | 0 | `..z` direction: 0=use vertex color · 1=use texture |
  | `dissolveNoiseStrength` | 0 | `_Main2ndDissolveNoiseStrength` noise strength |

  ⚠️ In lilToon the layer dissolve parameters are packed into a **vec4** (`.x` threshold / `.y` feathering /
     `.z` direction), while the panel splits them into three sliders.
  ⚠️ The dissolve's `alphaTest` must be ≥ 0.5 to actually discard.
     And the **single authority** for `alphaTest` is `syncDissolveAlphaTest` (see section 1)

  #### Decal debug switch (`main2nd.decalDebug` / `main3rd.decalDebug`)

  **Something we added on top** (lilToon does not have it), default 0:

      0 = normal
      1 = skip the Decal's edge AA (keep the texture's original alpha)
      2 = output the decal UV as color (R=uv.x · G=uv.y · B=1 · a=1)
      3 = force alpha = 1 (keep RGB)

  ⇒ Used to bisect "Decal is on but the picture does not change":

      1 changes something ⇒ it is the **edge AA** clearing alpha to 0 (the decal UV went outside [0,1])
      2 changes something ⇒ sampling is running ⇒ the problem is in alpha / blending
      3 changes something ⇒ sampling succeeded ⇒ the problem is in color / blending
      Nothing changes ⇒ this GLSL **never made it into the shader** (check the `[inject]` log)

  #### Layer UV rotation angle (`main2nd.texAngle` / `main3rd.texAngle`)

  Corresponds to `_Main2ndTexAngle`, default 0, in radians.
  ⚠️ The rotation is around **(0.5, 0.5)**, not the UV origin.
  ⚠️ If this layer's UV is itself a small island (common for face decals), after rotation the whole
     block may move out of the sampling range ⇒ it looks like it "disappeared" rather than "rotated".

  #### Two extra MatCap keys (`matcap.*` / `matcap2nd.*`)

  | Key | Default | Corresponds to |
  |---|---|---|
  | `customNormal` | 0 | The switch for `_MatCapNormalStrength` (whether to disturb the MatCap's N with a normal map) |
  | `vrParallax` | 1 | `_MatCapVRParallaxStrength` ⚠️ **a no-op outside VR**, see `LILTOON2.x.md §7.1` |

  ⚠️ `vrParallax` is kept only to align with lilToon's property table; in the Web it **never has any effect**.
     (`lil_common_macro.hlsl:696`: with `!USING_STEREO_MATRICES` it returns b directly)

  #### Outline stencil parameters (`outline.stencilPass` / `outline.stencilReadMask`)

  | Key | Default | Corresponds to |
  |---|---|---|
  | `stencilPass` | 0 | `_OutlineStencilPass` (the outline's own stencil operation) |
  | `stencilReadMask` | 255 | `_OutlineStencilReadMask` |

  ⇒ There is also a family of `outline.stencil*` (Ref / Comp / WriteMask / Fail / ZFail)
     See the "模板模式下拉" (Stencil mode dropdown) section of `CONFIG.md`.
  ⚠️ three does not have as complete a stencil API as Unity ⇒ only the ones that can be done are mapped.
     The ones that cannot (such as some combinations of `_StencilFail`) fall under known deviations.

### 10. Diagnostic log overview (look at these first when troubleshooting)

      [layer] 2nd | use=… tex=… isDecal=… uvMode=… blendMode=… enableLighting=…
          ⇒ Printed **unconditionally** before the `return null` of lilMainLayerGLSL
             (if it were printed inside the branch, "there is no log" could not by itself distinguish the reason)
      [inject] <material> layer 2nd | hit include=… | before length=… | contains ba3dLc after injection=…
          ⇒ A log at the **injection moment**, distinguishing "the text was generated" from "the text was inserted into the shader".
      [decal] 2nd | … rawTexST=… rawAnim=… rawSub=…
          ⇒ Contains the **raw values**, so you can see at a glance whether the panel wrote them in.
      [uv-check] <material>: uv1 present · span=… · tangents yes/no
          ⇒ A preliminary health check for Decal / one-sided display.
      [lightClamp] / [reflection] / [mainTex] / [dither] / [renderState] / …

  ⚠️ Experience: **print diagnostics before the check you suspect**, otherwise there is not enough information.
