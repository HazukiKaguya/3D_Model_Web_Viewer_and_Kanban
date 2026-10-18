# 3D Character Model Web-Embedded Mascot Deployment Guide

[中文](DEPLOY.md) ｜ **English** ｜ [日本語](DEPLOY.ja.md)

Pure static site, **no build step, no CDN dependency, no Node required**, everything uses relative paths (no config changes needed whether deployed at the root path or a subpath).
`dist/` is already pre-packaged, so just **upload all files in this directory as-is to the website root directory** (or any subdirectory) and it runs on static hosting (Nginx / Apache / Netlify / Cloudflare Pages / OSS / COS all work).

> To take a look locally first: run `node scripts/serve.mjs 5199` in the **development repository**, then open <http://127.0.0.1:5199/>.
> (A pure static site — no Node needed: just open it in a browser, or serve it from any static server.)

| Platform | Handling |
|---|---|
| Netlify / Cloudflare Pages | `_headers` (already included in the deployment package root) |
| Apache | `.htaccess` (already included in the deployment package root) |
| GitHub Pages | `.nojekyll` included |
| Nginx | `mime.types` should preferably add `model/gltf-binary glb;` |

## 1. Required Files

| Path | Description |
|---|---|
| `index.html` | 3D model viewer (full screen, console UI) |
| `viewer.js` | Viewer core (`createViewer` / `autoMount`, ES module, referenced directly by index.html) |
| `unity-anim.js` | **Unity `.anim` conversion** (AnimationClip → three AnimationClip): expressions (blendShape) / outfit visibility (`m_IsActive`) / generic transform curves |
| `vendor/three/three.module.js` | three.js r185.1 itself (the `"three"` in the importmap points to it) |
| `vendor/three/three.core.js` | ↑ the core split out starting with r185, `three.module.js` references it via a relative import, **must not be missed** |
| `vendor/three/controls/OrbitControls.js` | Camera interaction (rotate / zoom) |
| `vendor/three/loaders/GLTFLoader.js` | Model loading (`.glb` / `.gltf`)|
| `vendor/three/loaders/FBXLoader.js` | Model loading (`.fbx`)|
| `vendor/three/libs/fflate.module.js` | ↑ transitive dependency of FBXLoader (binary FBX decompression), **must not be missed** |
| `vendor/three/curves/NURBSCurve.js` | ↑ transitive dependency of FBXLoader, **must not be missed** |
| `vendor/three/curves/NURBSUtils.js` | ↑ transitive dependency of NURBSCurve, **must not be missed** |
| `vendor/three/environments/RoomEnvironment.js` | Baked texture for the PBR environment |
| `vendor/three/effects/OutlineEffect.js` | Outline |
| `vendor/three/utils/BufferGeometryUtils.js` | ↑ transitive dependency of GLTFLoader, **must not be missed** |
| `vendor/three/utils/SkeletonUtils.js` | ↑ same as above (one link in the dependency chain)|
| `liltoon-bridge.js` | Adapter layer for the **4th shading backend** (feeds our lilCfg / Unity materials to three-liltoon) |
| `vendor/three-liltoon/index.js` | ↑ the three-liltoon runtime (MIT) |
| `vendor/three-liltoon/chunk-KNGRDLOZ.js` | ↑ compiled lilToon GLSL (1.9 MB, **cannot be omitted**) |
| `vendor/three-liltoon/chunk-WFYRXLGW.js` | ↑ small chunk of the runtime |
| `vendor/three-liltoon/gltf.js` · `vrm.js` | ↑ optional extensions (glTF's `MOCHIYA_materials_liltoon` / VRM) |
| `vendor/three-liltoon/schema/*.json` | ↑ JSON schema for the material extensions |
| `vendor/three-liltoon/THIRD_PARTY_NOTICES.md` | ↑ third-party notices (MIT requires distribution with the package) |
| `assets/sample.glb` | Model file (for demo use, replace it directly with your own model) |
| `assets/sample.json` | Configuration for that model: model / mouth texture / scale / framing / rendering / lighting / background |
| `assets/fallback.json` | Same as above, points to the same model; kept as a template for "copy one and change three places" |
| `assets/mouth/*.png` | Mouth texture atlas textures (`sample.json` uses `Character_Mouth_High.png`) |
| `.htaccess` | For Apache: MIME for `.glb` + caching policy |
| `_headers` | For Netlify / Cloudflare Pages: same as above |
| `.nojekyll` | For GitHub Pages: 0-byte marker file, prevents Jekyll processing (**empty is correct**) |
| `nginx-3d-viewer.conf` | For nginx: configuration template, copy it into `server { }` (see section 3) |
| `DEPLOY.md` | This file |

> `viewer.js` only depends on the 5 vendor files in the table above. The entire `vendor/three/` directory is 1.4 MB in total.
>
> **The 4th shading backend must be distributed with the package** (`liltoon-bridge.js` + `vendor/three-liltoon/`, 2.2 MB originally,
> about 0.35 MB after compression) —— if they are missing, switching to 「lilToon source」 will 404.
>
> ⚠️ Note the distinction between two things:
> - **Packaging**: these files **must be in the deployment package** (they are not optional).
> - **Runtime**: the browser **downloads them on demand** —— viewer.js uses `new URL(...)` for a dynamic import,
>   so if the user does not switch to that mode, not a single byte is requested. This is also why it **cannot be seen in the build output**
>   (otherwise esbuild would bundle the 1.9 MB GLSL chunk into the dist single file).
>
> ⚠️ **The single-file embedded build (`dist/3d-viewer.min.js`) cannot use this backend** (measured):
> their `index.js` uses a **bare module reference** for `three` (`import ... from "three"`),
> while the single-file build bundles three into the package and has no importmap ⇒ it reports
> `Failed to resolve module specifier "three"`.
> Putting the bridge layer and `vendor/three-liltoon/` in the same directory as dist does not help either (we measured this).
> The failure is **graceful**: one error is logged to the console, it automatically falls back to the `lilToon style` mode, and no other feature is affected at all.
> ⇒ To use this backend, you must go through the **standard deployment** (`index.html` + `vendor/three/` + importmap).
>
> Acceptance: `node scripts/check-lilsrc.mjs` (it really switches to that mode and asserts that all library files return 200,
> that no material is left over, and that the mesh / triangle counts are restored).

## 1.5. How This Deployment Directory Is Produced (for maintainers)

  ⚠️ `_deploy/3D_Model_Web_Viewer/` **is not put together by hand**; it is generated by a script from an **explicit manifest**:

      node scripts/make-deploy.mjs            # rebuild (empties the target directory first)
      node scripts/make-deploy.mjs --check    # compare only · exit=1 if inconsistent (for CI)
      node scripts/check-release-safety.mjs   # release assertions: only sample.glb · no internal docs/paths · no dead links

  ⇒ **Every item** in the manifest must have a source that can be found in the repository (see the table below)
  ⇒ To add something to the deployment package, **you must change the `MANIFEST` in the script** and update the two tables in this document accordingly.

  ### Why This Constraint Exists

  It used to be put together by hand, and so it drifted twice:

      · an **old + encoding-corrupted** `check-glsl.mjs` was left behind (6.6 KB, referenced by nobody)
      · and the entire `scripts/` was copied in ⇒ the deployment package gained 5 extra **development tools**
        (the deploy directory keeps only what the site needs to run — do not copy development tools in)

  ### What `develop_res/deploy-src/` Is

  A few files **belong only to the deployment package** and have no corresponding source in the repository root:

      develop_res/deploy-src/.htaccess              → .htaccess
      develop_res/deploy-src/_headers               → _headers
      develop_res/deploy-src/.nojekyll              → .nojekyll            (0 bytes)
      develop_res/deploy-src/nginx-3d-viewer.conf   → nginx-3d-viewer.conf
      develop_res/deploy-src/_lilpresets.json       → _lilpresets.json     (the panel's lilToon preset data)

  ⇒ They are centralized in `develop_res/deploy-src/`, so that the entire deployment directory is **fully reproducible**.

  ### Currently **61 files (~15.2 MB)**

      required  index.html · viewer.js · liltoon-bridge.js · the 12 files under vendor/three/ ·
                assets (sample.glb / 2 JSON files / 3 mouth textures) ·
                .htaccess / _headers / .nojekyll / nginx-3d-viewer.conf
      optional  the two dist builds · the two demo pages · the 7 files under vendor/three-liltoon/ ·
                _lilpresets.json · 2 mouth index sheets · test textures ·
                README / CONFIG / DEPLOY / LILTOON1.x / LILTOON2.x (each with `.en` / `.ja`) ·
                LICENSE · THIRD-PARTY-NOTICES.md

> ℹ️ The development-time checkers (`scripts/check-*.mjs` · `make-deploy.mjs`) serve the build and
> verification workflow; a running static site does not need them. `check-layout.mjs` drives a
> headless browser to verify the floating-window layout (drag / resize / persistence), so deploying
> requires neither Node nor browser automation.

> ⚠️ **`index.html` is now a floating-window layout** (Unity style); the scene / toolbar / status /
> parameter panels are all independent windows that can be dragged and resized, and their positions and sizes are stored in the browser's localStorage.
> ⇒ Unrelated to deployment (pure frontend), see the 「★ Floating-window layout」 section of `CONFIG.md` for details.

## 2. Optional Files (do not affect operation, it still runs if deleted)

| Path | Description |
|---|---|
| `embed-demo.html` | 3D character model web-embedded mascot demo page (overlay + action menu + percentage scaling) |
| `dist/3d-viewer.js` | **Self-contained single-file build** (about 1.94 MB), for other pages to include via `<script type="module">`, **needs no importmap and no vendor/** |
| `dist/3d-viewer.min.js` | Minified build of the above (about 0.92 MB), this is what `embed-demo.html` uses |
| `CONFIG.md` | Complete configuration field reference (including `data-*` attributes, events, global hooks) |
| `CONFIG.en.md` · `CONFIG.ja.md` | English / Japanese editions of the configuration reference |
| `README.md` | Project description |
| `docs/README.en.md` · `docs/README.ja.md` | English / Japanese editions of the project description |
| `DEPLOY.en.md` · `DEPLOY.ja.md` | English / Japanese editions of this file |
| `LICENSE` | Project license (MIT © 2026 Hazuki Kaguya) —— **must be retained when redistributing** |
| `THIRD-PARTY-NOTICES.md` | Third-party notices (full MIT texts of three.js / lilToon / three-liltoon) —— **must be retained when redistributing** |
| `LILTOON1.x.md` · `LILTOON2.x.md` | lilToon baseline comparison (1.3.7 archived / 2.3.4 active); `.en.md` · `.ja.md` editions available |
| `assets/mouth/_cells-preview-*.png` | Mouth atlas 8×8 index image, use it as a visual reference when choosing `mouthCell` |

What is truly required to run the main page is: **`index.html` + `viewer.js` + the 12 files of `vendor/three/` + the model and configuration in `assets/`**.
The remaining items in the table are optional depending on platform / purpose (`.htaccess` / `_headers` / `.nojekyll` / `nginx-3d-viewer.conf` / `DEPLOY.md`).

## 3. Deploying to a Subdirectory (for example nginx's `api.sample.site/3d-viewer/`)

**Not a single file needs to be changed** —— all references in the page are relative paths (`./viewer.js`, `./vendor/three/...`, `./assets/...`),
and the importmap is also `./vendor/three/`, so the whole directory runs directly no matter which subdirectory it is placed in.

There are only two things to watch out for:

### 1. It must be accessed with a trailing slash

```
✅  https://api.sample.site/3d-viewer/
❌  https://api.sample.site/3d-viewer
```

Without the trailing slash, the browser treats `3d-viewer` as a **file**, so the relative path `./vendor/three/...`
resolves to the site root `/vendor/three/...` → everything 404s and you get a blank page. Just force a redirect with nginx:

```nginx
location = /3d-viewer {
    return 301 /3d-viewer/;
}
```

### 2. nginx Configuration

`.htaccess` is for Apache and `_headers` is for Netlify / Cloudflare Pages; **nginx reads neither**,
so MIME and caching need to be configured manually. The complete configuration you can copy is in **`nginx-3d-viewer.conf`** in the same directory, the core of which is:

```nginx
location /3d-viewer/ {
    index index.html;
    try_files $uri $uri/ =404;

    location ~* \.(glb|png|js|mjs)$ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
    location ~* \.json$ {
        add_header Cache-Control "no-cache";     # config changes take effect as soon as they are uploaded
    }
}
```

For the `.glb` MIME it is recommended to add it directly to the global `/etc/nginx/mime.types` (one line):

```
model/gltf-binary  glb;
```

> ⚠️ Do not write a bare `types { model/gltf-binary glb; }` inside a location —— nginx's `types` block
> **completely overrides** the inherited type table, and `html` / `css` / `png` will all become
> `application/octet-stream` (the browser downloads instead of displaying the page).
> If you really must add it in a server block, you have to `include mime.types;` first.

### The directory structure must not change

```
3d-viewer/
├── index.html
├── viewer.js
├── .htaccess           ← for Apache
├── _headers            ← for Netlify / Cloudflare Pages
├── .nojekyll           ← for GitHub Pages (0 bytes)
├── nginx-3d-viewer.conf← for nginx
├── vendor/three/…      ← must be at the same level as index.html (the importmap points to ./vendor/three/)
│   ├── three.module.js
│   ├── three.core.js
│   ├── controls/OrbitControls.js
│   ├── loaders/GLTFLoader.js
│   ├── environments/RoomEnvironment.js
│   ├── effects/OutlineEffect.js
│   └── utils/BufferGeometryUtils.js   ← transitive dependency of GLTFLoader, must not be missed
├── assets/
│   ├── sample.glb      ← model
│   ├── sample.json     ← configuration
│   ├── fallback.json
│   └── mouth/*.png     ← mouth atlas
├── dist/…              ← optional: self-contained single-file build for others to embed
└── *.html / *.md       ← optional: demo pages and documents
```

### Quick Verification

```bash
curl -I https://api.sample.site/3d-viewer          # expect 301 → …/3d-viewer/
curl -I https://api.sample.site/3d-viewer/         # expect 200
curl -I https://api.sample.site/3d-viewer/vendor/three/three.module.js   # expect 200
curl -I https://api.sample.site/3d-viewer/assets/sample.glb             # expect 200
```

---

## 4. Server Requirements

1. **`.glb` must return the correct MIME**
   Without it the browser can still load the file (GLTFLoader does not look at the MIME), but some CDNs / intermediaries will block it. Just configure it with `.htaccess` or `_headers`.

2. **Do not cache `assets/*.json` for long**
   The configuration files are read at runtime, and changes must take effect immediately. Both configuration files set `no-cache`.
   If the hosting platform does not honor these two files (**nginx reads neither**, see section 3), add them manually:
   ```nginx
   location ~* \.json$ { add_header Cache-Control "no-cache"; }
   location ~* \.glb$  { default_type model/gltf-binary; }
   ```

3. **ES module + importmap support is required**
   All modern browsers support it. `index.html` uses:
   ```html
   <script type="importmap">
   { "imports": { "three": "./vendor/three/three.module.js", "three/addons/": "./vendor/three/" } }
   </script>
   ```
   **The directory structure must not change when uploading**; `vendor/three/` must be at the same level as `index.html`.

4. **All paths are relative**, so it can go in a domain root directory or a subdirectory (such as `/ba3d/`), without changing any file.

## 5. Addresses You Can Open After Uploading

| Address | Content |
|---|---|
| `/` | Full-screen viewer (including the "custom model" upload panel) |
| `/?config=./assets/sample.json` | Demo model |
| `/embed-demo.html` | Web-embedded mascot demo |

## 6. Deploying Only One Model

Just upload that one `.glb` + its corresponding `.json` + the `assets/mouth/*.png` it uses.
The current deployment package is already in this shape: only one `sample.glb`, configured by `sample.json` (and `fallback.json`, which points to the same model).
`fallback.json` is only kept for you as a template; deleting it does not affect operation.

## 7. Swapping / Adding Models

1. Put the `.glb` into `assets/`
2. Copy an existing `.json` (`assets/fallback.json` is the template) and change three places:
   - `model.url` → point to the new `.glb` (relative to the directory the json itself is in)
   - `model.mouthAtlas` → the mouth texture atlas
   - `animation.name` → the opening action you want (a shorthand such as `"Cafe_Idle"` may also be left)
3. Visit `/?config=./assets/your.json` to verify

For the meaning of the fields see `CONFIG.md`.
