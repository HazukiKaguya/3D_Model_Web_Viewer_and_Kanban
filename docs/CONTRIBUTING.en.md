# Contributing

Bug reports, minimal reproductions and rendering improvements are welcome. Before you start, read the [lilToon porting baseline](LILTOON2.x.md), [configuration and implementation notes](CONFIG.md) and [deployment guide](DEPLOY.md).

## Build from source

Node.js 20 or newer is required.

```bash
npm install                       # once
node scripts/serve.mjs            # static server for UI work
node scripts/build.mjs            # dist/3d-viewer.js (unminified)
node scripts/build.mjs --minify   # dist/3d-viewer.min.js (for deployment)
```

The product code is `viewer.js`, `index.html`, `unity-anim.js`, `unity-scene.js` and `liltoon-bridge.js`. The upstream runtime lives in `vendor/three-liltoon` and ships with the package; its source is kept in the research directory for version comparison, and upgrading it requires updating the manifest in `scripts/make-deploy.mjs`.

Run all three checkers before submitting:

```bash
node scripts/check-deploy.mjs            # deploy directory loads: no failed requests, no page errors, panel and export area intact
node scripts/check-release-safety.mjs    # shipped docs contain no internal paths or dead links; only assets/sample.glb is shipped
node scripts/check-lilsrc.mjs            # 4th-backend deploy check: outlines, leftover materials, pixel residue
```

Specialised checkers (`check-docs`, `check-glsl`, `check-panel`, `check-assets`, `check-scope`) are used according to the change. The release order is documented in the header of `scripts/make-devpack.mjs`: docs first, then the three packages, then the three checkers.

## Source map

| Location | Responsibility |
| --- | --- |
| `viewer.js`, `index.html` | Viewer core, UI and the lilToon parameter panel |
| `unity-anim.js`, `unity-scene.js` | Unity animation and scene import |
| `liltoon-bridge.js` | Adapter between our configuration and the upstream runtime |
| `vendor/three-liltoon` | Upstream runtime (0.1.9, shipped with the package) |
| `assets`, `vendor/three` | Shipped resources and the three dependencies |
| `docs` | Every document except the main README and the third-party notices (three languages) |
| `scripts` | Build and check scripts |
| research directory | Upstream sources, experiments, internal documents, archives; not shipped |
| `models` | Test models and texture fixtures; **do not modify** |

## Reporting a rendering problem

Include the model and texture sources, browser and GPU, shading mode, relevant lilToon parameters and textures, console warnings and reproduction steps. A minimal procedural scene or a redistributable model is preferred.

For differences from Unity, also report the lilToon version and matching camera, lighting and color-space settings (our reference project uses the Built-in pipeline, Linear color space and no post-processing).

Numeric claims must state the fixture, the measurement convention and the criterion. A single WebGL screenshot is not evidence of Unity parity; compare the same scene with the same parameters.

## Submission conventions

- Every document except `README.md` and `THIRD-PARTY-NOTICES.md` lives in the `docs` directory; the deploy package uses the same layout
- All three languages (`X.md`, `X.en.md`, `X.ja.md`) must be updated in the same change
- Shipped documents must not contain repository-internal paths (`check-release-safety` rejects them)
- File names added to packages must be ASCII: the bundled packer does not support non-ASCII file names and silently drops those files
- Do not submit third-party assets you lack permission to redistribute
