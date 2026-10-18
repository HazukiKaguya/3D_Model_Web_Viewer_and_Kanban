# 3D Character Model Viewer (mascot embedded in a web page)

[中文](../README.md) ｜ **English** ｜ [日本語](README.ja.md)

three.js character viewer: **configurable** (model / mouth texture / baseline JSON), **embeddable** (self-contained single-file build), **deployable** (pure static).

Shading backends (**available only for the toon material**):
**Cel banding** (a simple shader specialised for BA models) · **lilToon style** (our own port of the source) · **three-liltoon** (uses upstream's transpiled output of the real lilToon source, loaded on demand) · **No injection (original)**.

- Three material models: Original (PBR) / **toon material (Toon)** / Unlit. Shading backends attach to the **toon material** (PBR / Unlit use three.js's own materials, which have no injection point). Default: **toon material + Cel banding**.
- **three-liltoon is a variant of "lilToon style"**: it only swaps the surface material for upstream's `LilToonMaterial`; **outlines still use our own implementation** (since 0.1.9 upstream outlines require explicitly selecting `Hidden/lilToonOutline` via `shaderVariant`; measured: fine rims on skinned meshes, solid fill on static props).
- lilToon is a toon (NPR) shader family — there is no such thing as "applying lilToon to a PBR material".

【[Deploy this tool](DEPLOY.md)】  【[Model JSON configuration](CONFIG.md)】  【[Third-party license notices](../THIRD-PARTY-NOTICES.md)】

## Quick start

This directory is a complete site: **just open `index.html`**, or drop the whole directory into any static server (Nginx / Apache / Netlify / Cloudflare Pages / OSS all work).

| Page | Entry |
|---|---|
| Full-screen viewer (with floating-window console UI) | `index.html` |
| **3D model web-embedded mascot demo** | `embed-demo.html` |

## Files

| File | Purpose |
|---|---|
| [index.html](../index.html) | Full-screen viewer (floating-window console UI) |
| [embed-demo.html](../embed-demo.html) | 3D model web-embedded mascot demo |
| [viewer.js](../viewer.js) | Viewer core (`createViewer` / `autoMount`) |
| [assets/sample.json](../assets/sample.json) | **CH0155 configuration** (model + mouth texture + baseline + render/lighting/background) |
| [assets/sample.glb](../assets/sample.glb) | Model (= CH0155, 24 animation clips) |
| [assets/mouth/](../assets/mouth/) | Mouth fix atlases (kivo: `Character_Mouth_2` / `_Black` / `_High`) |
| [dist/3d-viewer.js](../dist/3d-viewer.js) | **Self-contained single-file build** (1.94 MB, three fully inlined, for embedding; no bare imports) |
| [dist/3d-viewer.min.js](../dist/3d-viewer.min.js) | Same as above, minified (944 KB, for deployment) |
| [liltoon-bridge.js](../liltoon-bridge.js) | 4th shading backend adapter layer (feeds lilCfg / Unity materials to three-liltoon) |
| [vendor/three/](../vendor/three/) | Local three.js r185.1 + addons (including `effects/OutlineEffect.js`) |
| [vendor/three-liltoon/](../vendor/three-liltoon/) | three-liltoon runtime + compiled lilToon GLSL (2.2 MB, 4th backend loaded on demand) |
| [CONFIG.md](CONFIG.md) | Complete reference for configuration fields |
| [README.en.md](README.en.md) · [README.ja.md](README.ja.md) | English / Japanese editions of this README (`CONFIG` / `DEPLOY` / `LILTOON` have `.en` / `.ja` too) |
| [DEPLOY.md](DEPLOY.md) | Deployment and packaging instructions |
| [LICENSE](../LICENSE) | Project license (MIT) |
| [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) | Third-party notices (three.js / lilToon / three-liltoon) |

## Configuration (JSON)

`createViewer` accepts `config` (an object) or `configUrl` (a JSON address). All fields are optional:

```jsonc
{
  "model": {
    "url": "./assets/sample.glb",                         // model file
    "mouthAtlas": "./assets/mouth/Character_Mouth_2.png"  // mouth fix texture (kivo atlas)
  },
  "pivot": { "x": 0.25, "z": 0.30 },                      // pivot offset
  "renderer": {
    "render": "toon",                                     // material model: "pbr" | "toon" | "unlit"
    "shader": "cel",                                      // shading backend (only effective when render:"toon"):
                                                          //   "none" | "cel" | "lilToon" | "liltoon-src"
    "outline": true, "outlineThickness": 0.002,
    "outlineColor": [0.10, 0.07, 0.11], "outlineAlpha": 1.0,
    "targetHeight": 2.0, "fov": 30, "shadows": true
  },
  "lighting": { "preset": "day", "exposure": 1.0 },       // "day" | "golden" | "night"
  "background": { "transparent": true, "color": null },   // transparent by default
  "animation": { "name": "CH0155_Normal_Idle" }
}
```

> The old key `"shading"` (`"pbr"` / `"cel"` / `"unlit"`) still works, and is equivalent to a shortcut combination of `render` + `shader`.
>
> **Relative paths are resolved against the directory containing the configuration file**. So if you put the configuration
> in the site root, its `"./assets/sample.glb"` is always correct — and the model can still be located when embedded by another site.
>
> A ready-made CH0155 configuration is in [assets/sample.json](../assets/sample.json) (pivot X = +0.25, Z = +0.30),
> and [assets/fallback.json](../assets/fallback.json) can serve as a "copy it and change three things" template.

The complete fields (including `data-*` attributes, events, and global hooks) are in [CONFIG.md](CONFIG.md).

## Three ways to use it

### 1. Open index directly (URL parameters can be passed in)

```
index.html?config=./assets/sample.json
index.html?model=./assets/sample.glb&mouth=./assets/mouth/Character_Mouth_2.png&config=./assets/sample.json
```

### 2. Embed in a third-party website (recommended: self-contained single-file build, **no importmap needed**)

```html
<!-- 1. Place a container and declare the configuration with data-ba3d-* -->
<div data-ba3d data-ba3d-config="./assets/sample.json"
     style="width:480px;height:640px"></div>

<!-- 2. Include the self-contained single-file build and mount automatically -->
<script type="module">
  import { autoMount } from 'https://your-domain/ba3d/dist/3d-viewer.min.js';
  autoMount();
</script>
```

Attributes available on the container:

| Attribute | Description |
|---|---|
| `data-ba3d` | Marks this container as one to mount the viewer on (the value may be left empty) |
| `data-ba3d-model` | Model file URL (`.glb`) |
| `data-ba3d-mouth` | Mouth fix texture URL (kivo atlas `.png`) |
| `data-ba3d-config` | URL of the configuration JSON (pivot + render + lighting + background) |
| `data-ba3d-auto-rotate` | Auto-rotate when `true` |

### 3. Create with JS (equivalent)

```js
import { createViewer } from './dist/3d-viewer.min.js';

const viewer = createViewer(document.getElementById('stage'), {
  modelUrl: 'https://your-domain/ba3d/assets/sample.glb',
  mouthAtlasUrl: 'https://your-domain/ba3d/assets/mouth/Character_Mouth_2.png',
  configUrl: 'https://your-domain/ba3d/assets/sample.json',   // you can also pass an object directly: config: {...}
  backgroundTransparent: true,
});
await viewer.load();
```

> If you do not use the single-file build but instead use `vendor/three/` + `viewer.js`, the host page must provide an importmap:
> ```html
> <script type="importmap">
> { "imports": { "three": "https://your-domain/ba3d/vendor/three/three.module.js",
>                "three/addons/": "https://your-domain/ba3d/vendor/three/" } }
> </script>
> ```

## Features

- **Material model**: Original (PBR) / **Toon material** / Unlit
- **Shading backend** (toolbar "Shading" dropdown, 4 items, **available only under the Toon material**):
  - `No injection (original)` / **`Cel banding` (default)** / `lilToon style` (in-house port implementation)
  - **`lilToon source`** —— surface shading directly reuses the output of translating [three-liltoon](https://www.npmjs.com/package/@mochiya/three-liltoon)
    against the **real lilToon source** (comparison against Unity: simple path 2.22%, shadows + rim light 5.37%, brightness ratio 1.000).
    ⚠️ This backend is **loaded on demand** (2.2 MB, not downloaded unless you switch to it); **outlines still go through our own implementation**
    (the outline in their released version is measurably unusable);
    ⚠️ **The single-file build cannot use this backend** (`dist/` uses the bare `three` specifier internally) — to use it, deploy the `vendor/` + `viewer.js` form.
- **Outline**: inverted-hull method (three's `OutlineEffect`, supports skinning), with adjustable thickness and color; under the lilToon mode it is taken over by `setLilOutline`
- **lilToon parameter panel**: tune parameters directly without editing JSON, and import `.lilToon.json` / `.mat` / `.asset` exported from the Unity side
- **Configuration export / import**: the toolbar's "Export JSON" writes only the items that differ from the defaults; the UI syncs automatically after importing
- **Parts panel**: hide / show optional parts and props
- **Lighting presets**: day / morning·evening / night
- **Background**: **transparent** by default (showing the web page content through), plus 4 preset colors + a color picker
- **Animations**: switching between 24 animation clips, by default only idle plays; Unity `.anim` files can also be played directly (blendShape expressions / outfit visibility / generic transform curves — see [CONFIG.en.md](CONFIG.en.md)); outfit clips (the `m_IsActive` kind) appear as **buttons** in the toolbar: click to put on, click again to take off (restores the pre-outfit state, repeatable); for custom models you can **select several** `.anim` files, lilToon `.mat` / `.asset` files (each matched to its material by name) and Unity `.prefab` files (which reproduce "which parts are hidden by default" — that state lives only in the prefab, not in the FBX or the .anim); you can also **drop the whole Unity project folder**, and the model / prefabs / `.anim` / `.mat` / textures plus the Humanoid muscle table (`humanoid-muscles.json`) are recognised and loaded automatically
- **Viewpoint**: axis views (front / back / left / right); **720° stepless rotation**; the pivot offset is configurable in X/Z (slider + numeric input)
- **Floating-window layout**: positions and sizes are remembered automatically; `ba3dResetLayout()` in the console restores the defaults
- **Mobile**: touch support
- **Halo** is bound to the head bone `Bip001_Head`
- **Mouth**: following the kivo approach, splitting the UV islands + a mouth atlas, driven open/closed by `bone_mouth`, with the material following the render mode

## Deployment

A pure static site, **no build step and no CDN dependency**, all using relative paths (no configuration changes needed whether deployed at the root path or a subpath).
`dist/` is already pre-bundled, so just upload it; see [DEPLOY.md](DEPLOY.md) for the complete manifest.

The MIME type of `.glb` must be `model/gltf-binary` (`_headers` / `.htaccess` / `.nojekyll` are included — see the table below):

| Platform | Handling |
|---|---|
| Netlify / Cloudflare Pages | `_headers` (already included in the deployment package) |
| Apache | `.htaccess` (already included in the deployment package) |
| GitHub Pages | `.nojekyll` (already included in the deployment package) |
| Nginx | Add `model/gltf-binary glb;` to `mime.types`, or use `nginx-3d-viewer.conf` directly |

## Technical points

### Scene parameters (copied from the baseline)

- Normalization: `targetHeight = 2.0` (scaling by the longest axis), feet aligned to y=0, horizontally centered
- Camera: `PerspectiveCamera(fov=30, near=0.05, far=200)`
- Lights: hemisphere light + main directional light (with shadows) + rim light + fill light; `RoomEnvironment` PMREM
- Controls: `OrbitControls` (damping, limits); shadows PCFSoft + a `ShadowMaterial` ground

Deliberate differences from the baseline: local `vendor/three` replaces the CDN; the unneeded DRACO/KTX2/Meshopt loaders are removed;
by default only idle plays (the baseline original file playing all animations at once is a bug); render modes / outline / lighting presets / background / pivot / mouth fix are added.

### Toon rendering

`MeshToonMaterial` does not support `envMap`, so in toon mode the lighting is compensated automatically (hemisphere light ×1.25, main light ×0.8, exposure ×0.9).
Switching is fully reversible: the original material is stored on `userData.__src`.

### Outline

Inverted-hull method: draw the model a second time, expanding vertices along the **normal**, rendering only **back faces**, and filling them with the outline color.
**Transparent materials are not outlined** — the inverted hull is a "solid back-face shell", and for thin sheets (shields) it would smear a layer of solid color over the semi-transparency.

### Mouth fix (copied from kivo.wiki)

In `CH0155_Body_4` (EyeMouth), the "mouth" = the UV island with the **lowest z** (38 triangles),
and its UV box falls in the **pure-black placeholder area** of the texture → which is why the mouth was originally black. The fix: split the mesh by UV island,
make the mouth triangles into a separate `SkinnedMesh` using the mouth atlas, and use `repeat/offset` to map the UV box to one cell of the atlas.

### Fake BLEND correction

In the GLB, `CH0155_Weapon` (gun) / `CH0155_Milk` (milk carton) are marked as `BLEND`, but their textures are actually
of the "opaque + cut-out/blank" type. The criterion is the **proportion of intermediate alpha values** (`0 < a < 250`):
a very small proportion → render as opaque; a very large proportion (e.g. shield alpha≈128) → keep transparent.

## License

This project is under the **MIT License** (© 2026 Hazuki Kaguya) — see [LICENSE](../LICENSE).

The third-party components distributed with the package are likewise MIT; the full copyright and license texts are in [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md):

| Component | License | Where it is used |
|---|---|---|
| three.js 0.185.1 | MIT © 2010-2026 three.js authors | `vendor/three/`, and inlined into `dist/` |
| lilToon 2.3.4 | MIT © 2020-present lilxyzw | Its compiled output only: `assets/lilshaders.inline.js`, `vendor/three-liltoon/chunk-*.js` |
| @mochiya/three-liltoon 0.1.9 | MIT © 2026 Mochiya | `vendor/three-liltoon/` (4th backend loaded on demand) |

> **When embedding / redistributing, please retain `LICENSE` and `THIRD-PARTY-NOTICES.md` along with it** — MIT requires retaining the copyright and license notices.
> Both files are included in this directory.
>
> The **sample model and texture assets in the repository are not covered by the above licenses** (`assets/sample.glb`, `assets/mouth/*.png`,
> `assets/test/*.png`); please verify their authorization yourself before redistributing.
