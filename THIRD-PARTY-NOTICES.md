# Third-Party Notices

This project (**BA3D character viewer**) is distributed under the MIT License — see
[LICENSE](LICENSE), Copyright (c) 2026 Hazuki Kaguya.

It includes the following third-party components. The full license text of each bundled
component is reproduced below, as those licenses require.

---

## Three.js

- **Component Name**: Three.js
- **Version**: 0.185.1
- **License Type**: MIT
- **Used in**: `vendor/three/` (source import), and inlined into `dist/3d-viewer.js` / `dist/3d-viewer.min.js`
- **License Details**:

The MIT License
Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## lilToon

- **Component Name**: lilToon
- **Version**: 2.3.4 (the baseline this project's shading port follows)
- **License Type**: MIT
- **Used in**: only compiled/translated artifacts derived from it are distributed —
  `assets/lilshaders.inline.js` and `vendor/three-liltoon/chunk-*.js`
- **License Details**:

MIT License
Copyright (c) 2020-present lilxyzw

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## @mochiya/three-liltoon

- **Component Name**: @mochiya/three-liltoon
- **Version**: 0.1.4
- **License Type**: MIT
- **Used in**: `vendor/three-liltoon/` (`index.js`, `chunk-*.js`, `gltf.js`, `vrm.js`, `schema/`),
  loaded on demand by the "lilToon source" shading mode.
  `liltoon-bridge.js` is this project's own adapter and is not part of the component.
- **License Details**:

MIT License

Copyright (c) 2026 Mochiya

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## Further notices carried by the components above

`@mochiya/three-liltoon` ships an aggregated notice file which also carries the notices that
lilToon itself requires. It is redistributed with this project:

- `vendor/three-liltoon/THIRD_PARTY_NOTICES.md` — lilToon, Unlit_WF_ShaderSuite, GTAvaCrypt,
  PoiyomiToonShader, Arktoon-Shaders, msdfgen, MToon, …
  (upstream: <https://github.com/mochiya-labs/three-liltoon/blob/main/THIRD_PARTY_NOTICES.md>)
- lilToon's own notice file: `lilToon/Third Party Notices.md`
  (upstream: <https://github.com/lilxyzw/lilToon>)

## Assets that are not covered by this notice

The example model and texture assets shipped with this repository / deployment package are
third-party assets provided for demonstration only. Their copyright and licensing are **not**
declared by this project; verify their terms before redistributing them:

- `assets/sample.glb` — example character model (the only model in the deployment package)
- `assets/mouth/*.png` — example mouth texture atlases
- `assets/test/*.png` — shader test textures

## Redistribution

If you redistribute this project or its `dist/` bundles, keep `LICENSE` and
`THIRD-PARTY-NOTICES.md` — together with the component notice files listed above — alongside it.
The MIT licenses above require the copyright and permission notices to be retained.
