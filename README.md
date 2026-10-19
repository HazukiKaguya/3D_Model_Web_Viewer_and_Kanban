# 3D 角色模型查看器（3D 模型网页内嵌看板娘）

**简体中文** ｜ [繁體中文](docs/README.zh-TW.md) ｜ [English](docs/README.en.md) ｜ [日本語](docs/README.ja.md) ｜ [한국어](docs/README.ko.md)

three.js 角色查看器：**可配置**（模型 / 嘴部贴图 / 基准 JSON）、**可嵌入**（自包含单文件版）、**可部署**（纯静态）。

着色后端（**仅「卡通材质」下可用**）：
**Cel 分档**（简易的 BA 模型特化着色器）· **lilToon 风格**（自研移植实现）· **three-liltoon**（直接使用上游对真 lilToon 源码的转译产物，按需加载）· **不注入（原生）**。

- 材质模型三档：原始（PBR）/ **卡通材质（Toon）** / 无光照（Unlit）；着色后端挂在**卡通材质**上（PBR / Unlit 用的是 three 自带材质，没有注入点）。默认 **卡通材质 + Cel 分档**。
- **three-liltoon 是「lilToon 风格」的变体**：只把表面材质换成上游的 `LilToonMaterial`；**描边仍走自研实现**（0.1.9 起上游描边需用 `shaderVariant` 显式选 `Hidden/lilToonOutline`；实测蒙皮网格能出细边 ✓，静态道具会整片填充 ✗）。
- lilToon 是卡通（NPR）着色器家族 —— 不存在「把 lilToon 用在 PBR 材质上」这种做法。

【[部署本工具](docs/DEPLOY.md)】  【[模型 JSON 配置](docs/CONFIG.md)】  【[第三方库许可证声明](THIRD-PARTY-NOTICES.md)】

## 快速开始

本目录就是一个完整站点：**直接打开 `index.html`** 即可，也可以把整个目录放进任意静态服务器（Nginx / Apache / Netlify / Cloudflare Pages / OSS 都行）。

| 页面 | 入口 |
|---|---|
| 全屏查看器（带浮窗控制台 UI） | `index.html` |
| **3D 模型网页内嵌看板娘演示** | `embed-demo.html` |

## 文件

| 文件 | 作用 |
|---|---|
| [index.html](index.html) | 全屏查看器（浮窗控制台 UI） |
| [embed-demo.html](embed-demo.html) | 3D 模型网页内嵌看板娘演示 |
| [viewer.js](viewer.js) | 查看器核心（`createViewer` / `autoMount`） |
| [assets/sample.json](assets/sample.json) | **CH0155 配置**（模型 + 嘴部贴图 + 基准 + 渲染/打光/背景） |
| [assets/sample.glb](assets/sample.glb) | 模型（= CH0155，24 段动画） |
| [assets/mouth/](assets/mouth/) | 嘴部修复图集（kivo：`Character_Mouth_2` / `_Black` / `_High`） |
| [dist/3d-viewer.js](dist/3d-viewer.js) | **自包含单文件版**（1.94 MB，three 全内联，内嵌用；无裸 import） |
| [dist/3d-viewer.min.js](dist/3d-viewer.min.js) | 同上，压缩版（944 KB，部署用） |
| [liltoon-bridge.js](liltoon-bridge.js) | 第 4 着色后端适配层（把 lilCfg / Unity 材质喂给 three-liltoon） |
| [vendor/three/](vendor/three/) | 本地 three.js r185.1 + addons（含 `effects/OutlineEffect.js`） |
| [vendor/three-liltoon/](vendor/three-liltoon/) | three-liltoon 运行时 + 编译好的 lilToon GLSL（2.2 MB，第 4 后端按需加载） |
| [CONFIG.md](docs/CONFIG.md) | 配置字段完整参考 |
| [README.zh-TW.md](docs/README.zh-TW.md) · [README.en.md](docs/README.en.md) · [README.ja.md](docs/README.ja.md) · [README.ko.md](docs/README.ko.md) | 本说明的繁體 / 英文 / 日文 / 韓文版（`CONFIG` / `DEPLOY` / `LILTOON` 同样有 `.zh-TW` / `.en` / `.ja` / `.ko`） |
| [DEPLOY.md](docs/DEPLOY.md) | 部署与打包说明 |
| [LICENSE](LICENSE) | 项目许可证（MIT） |
| [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) | 第三方声明（three.js / lilToon / three-liltoon） |

## 配置（JSON）

`createViewer` 接受 `config`（对象）或 `configUrl`（JSON 地址）。所有字段可选：

```jsonc
{
  "model": {
    "url": "./assets/sample.glb",                             // 模型文件
    "mouthAtlas": "./assets/mouth/Character_Mouth_2.png"      // 嘴部修复贴图（kivo 图集）
  },
  "pivot": { "x": 0.25, "z": 0.30 },                          // 旋转基准调整
  "renderer": {
    "render": "toon",                                         // 材质模型："pbr" | "toon" | "unlit"
    "shader": "cel",                                          // 着色后端（仅 render:"toon" 有效）：
                                                              //   "none" | "cel" | "lilToon" | "liltoon-src"
    "outline": true, "outlineThickness": 0.002,
    "outlineColor": [0.10, 0.07, 0.11], "outlineAlpha": 1.0,
    "targetHeight": 2.0, "fov": 30, "shadows": true
  },
  "lighting": { "preset": "day", "exposure": 1.0 },           // "day" | "golden" | "night"
  "background": { "transparent": true, "color": null },       // 默认透明
  "animation": { "name": "CH0155_Normal_Idle" }
}
```

> 旧键 `"shading"`（`"pbr"` / `"cel"` / `"unlit"`）仍然可用，等价于 `render` + `shader` 的快捷组合。
>
> **相对路径按配置文件所在目录解析**。所以把配置放在站点根目录，
> 它的 `"./assets/sample.glb"` 就始终正确 —— 被别的站点内嵌时也能定位到模型。
>
> 现成的 CH0155 配置见 [assets/sample.json](assets/sample.json)（基准 X = +0.25，Z = +0.30），
> 另有 [assets/fallback.json](assets/fallback.json) 可作"复制一份改三处"的模板。

完整字段（含 `data-*` 属性、事件、全局钩子）见 [CONFIG.md](docs/CONFIG.md)。

## 三种使用方式

### 1. 直接打开 index（可用 URL 参数传入）

```
index.html?config=./assets/sample.json
index.html?model=./assets/sample.glb&mouth=./assets/mouth/Character_Mouth_2.png&config=./assets/sample.json
```

### 2. 第三方网站内嵌（推荐：自包含单文件版，**不需要 importmap**）

```html
<!-- 1. 放一个容器，用 data-ba3d-* 声明配置 -->
<div data-ba3d data-ba3d-config="./assets/sample.json"
     style="width:480px;height:640px"></div>

<!-- 2. 引入自包含单文件版并自动挂载 -->
<script type="module">
  import { autoMount } from 'https://你的域名/ba3d/dist/3d-viewer.min.js';
  autoMount();
</script>
```

容器上可用的属性：

| 属性 | 说明 |
|---|---|
| `data-ba3d` | 标记这个容器要挂查看器（值可留空） |
| `data-ba3d-model` | 模型文件 URL（`.glb`） |
| `data-ba3d-mouth` | 嘴部修复贴图 URL（kivo 图集 `.png`） |
| `data-ba3d-config` | 配置 JSON 的 URL（基准 + 渲染 + 打光 + 背景） |
| `data-ba3d-auto-rotate` | `true` 时自动旋转 |

### 3. JS 创建（等价）

```js
import { createViewer } from './dist/3d-viewer.min.js';

const viewer = createViewer(document.getElementById('stage'), {
  modelUrl: 'https://你的域名/ba3d/assets/sample.glb',
  mouthAtlasUrl: 'https://你的域名/ba3d/assets/mouth/Character_Mouth_2.png',
  configUrl: 'https://你的域名/ba3d/assets/sample.json',   // 也可直接传对象：config: {...}
  backgroundTransparent: true,
});
await viewer.load();
```

> 如果不用单文件版、而是用 `vendor/three/` + `viewer.js`，宿主页面必须提供 importmap：
> ```html
> <script type="importmap">
> { "imports": { "three": "https://你的域名/ba3d/vendor/three/three.module.js",
>                "three/addons/": "https://你的域名/ba3d/vendor/three/" } }
> </script>
> ```

## 功能

- **材质模型**：原始（PBR）/ **卡通材质（Toon）** / 无光照（Unlit）
- **着色后端**（工具栏「着色」下拉，4 项，**仅卡通材质下可用**）：
  - `不注入（原生）` / **`Cel 分档`（默认）** / `lilToon 风格`（自研移植实现）
  - **`lilToon 源码`** —— 表面着色直接复用 [three-liltoon](https://www.npmjs.com/package/@mochiya/three-liltoon)
    对**真 lilToon 源码**的转译产物（与 Unity 对拍：简单路径 2.22%、阴影+边缘光 5.37%、亮度比 1.000）。
    ⚠️ 该后端**按需加载**（2.2 MB，不切到它就不下载）；**描边仍走我们自己的实现**
    （实测上游发布版的描边不可用）；
    ⚠️ **单文件版用不了这个后端**（`dist/` 内部是裸 `three` 说明符）—— 要用它请部署 `vendor/` + `viewer.js` 形态。
- **描边**：反壳法（three 的 `OutlineEffect`，支持蒙皮），可调粗细与颜色；lilToon 模式下由 `setLilOutline` 接管
- **lilToon 参数面板**：免改 JSON 直接调参数，可导入 Unity 侧导出的 `.lilToon.json` / `.mat` / `.asset`
- **配置导出 / 导入**：工具栏「导出 JSON」只写与默认值不同的项；导入后 UI 自动同步
- **部件面板**：隐藏 / 显示可选部件与道具
- **打光预设**：白昼 / 早晨·傍晚 / 黑夜
- **背景**：默认**透明**（透出网页内容），另有 4 预设色 + 取色器
- **动作**：24 段动画切换，默认只播 idle；也能直接播 Unity 的 `.anim`（表情 blendShape / 换装显隐 / 通用变换曲线，见 [CONFIG.md](docs/CONFIG.md)）；换装动作（`m_IsActive` 那类）在工具栏是**按钮**：点一下换上、再点一下脱掉（按换装前的状态还原，可反复切换）；自定义模型可**一次多选** `.anim`、lilToon `.mat` / `.asset`（按材质名各自对应）与 Unity `.prefab`（据此复现「哪些部件默认隐藏」—— 这个状态只在 prefab 里、FBX 与 .anim 都不存）；**整个 Unity 工程文件夹也可以直接拖进来**，会自动认出模型 / prefab / `.anim` / `.mat` / 贴图，以及 Humanoid 肌肉换算表（`humanoid-muscles.json`）并加载
- **视角**：轴视图（前 / 后 / 左 / 右）；**720° 无极旋转**；旋转基准位置可配置 X/Z（滑杆 + 数字输入）
- **浮窗布局**：位置尺寸自动记住，控制台 `ba3dResetLayout()` 恢复默认
- **移动端**：支持触控
- **光环**绑定头部骨骼 `Bip001_Head`
- **嘴部**：按 kivo 方案拆 UV 岛 + 嘴部图集，由 `bone_mouth` 驱动开合，材质跟随渲染模式

## 部署

纯静态站点，**无构建步骤、无 CDN 依赖**，全部使用相对路径（根路径/子路径部署都不用改配置）。
`dist/` 已预打包好，直接上传即可；完整清单见 [DEPLOY.md](docs/DEPLOY.md)。

`.glb` 的 MIME 需要是 `model/gltf-binary`（`_headers` / `.htaccess` / `.nojekyll` 已随包提供，见下表）：

| 平台 | 处理 |
|---|---|
| Netlify / Cloudflare Pages | `_headers`（部署包内已含） |
| Apache | `.htaccess`（部署包内已含） |
| GitHub Pages | `.nojekyll`（部署包内已含） |
| Nginx | `mime.types` 加 `model/gltf-binary glb;`，或直接用 `nginx-3d-viewer.conf` |

## 技术要点

### 场景参数（照搬基线）

- 归一化：`targetHeight = 2.0`（最长轴缩放），脚对齐 y=0、水平居中
- 相机：`PerspectiveCamera(fov=30, near=0.05, far=200)`
- 灯光：半球光 + 主方向光（带阴影）+ 轮廓光 + 补光；`RoomEnvironment` PMREM
- 控制器：`OrbitControls`（damping、限位）；阴影 PCFSoft + `ShadowMaterial` 地面

与基线的刻意差异：本地 `vendor/three` 代替 CDN；去掉用不到的 DRACO/KTX2/Meshopt loader；
默认只播 idle（基线原文件同时 play 全部动画是 bug）；新增渲染模式/描边/打光预设/背景/基准/嘴部修复。

### 卡通渲染

`MeshToonMaterial` 不支持 `envMap`，所以卡通模式下自动补偿光照（半球光 ×1.25、主光 ×0.8、曝光 ×0.9）。
切换完全可逆：原材质挂在 `userData.__src`。

### 描边

反壳法：把模型再画一遍，顶点沿**法线**外扩、只渲染**背面**、填成描边色。
**透明材质不做描边** —— 反壳是"实心背面壳"，对薄片（盾牌）会糊上一层实色把半透明盖掉。

### 嘴部修复（照搬 kivo.wiki）

`CH0155_Body_4`（EyeMouth）里「嘴」= **z 最低**的那个 UV 岛（38 三角形），
其 UV 框落在贴图的**纯黑占位区** → 所以原本是黑嘴。修法：按 UV 岛拆网格，
把嘴的三角形独立成一个 `SkinnedMesh` 用嘴部图集，`repeat/offset` 把 UV 框映射到图集某一格。

### 假 BLEND 修正

GLB 里 `CH0155_Weapon`（枪）/ `CH0155_Milk`（牛奶盒）被标成 `BLEND`，但贴图其实是
「不透明 + 镂空/留白」型。判据是**中间值 alpha 占比**（`0 < a < 250`）：
占比很小 → 按不透明渲染；占比很大（如盾牌 alpha≈128）→ 保持透明。

## 许可证

本项目采用 **MIT 许可证**（© 2026 Hazuki Kaguya）—— 见 [LICENSE](LICENSE)。

随包分发的第三方组件同样为 MIT，版权与许可全文见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)：

| 组件 | 许可证 | 用在哪 |
|---|---|---|
| three.js 0.185.1 | MIT © 2010-2026 three.js authors | `vendor/three/`，并内联进 `dist/` |
| lilToon 2.3.4 | MIT © 2020-present lilxyzw | 仅其编译产物：`assets/lilshaders.inline.js`、`vendor/three-liltoon/chunk-*.js` |
| @mochiya/three-liltoon 0.1.9 | MIT © 2026 Mochiya | `vendor/three-liltoon/`（第 4 后端按需加载） |

> **内嵌 / 分发时请一并保留 `LICENSE` 与 `THIRD-PARTY-NOTICES.md`** —— MIT 要求保留版权与许可声明。
> 本目录已包含这两份文件。
>
> 仓库内的**示例模型与贴图素材不属于上述许可范围**（`assets/sample.glb`、`assets/mouth/*.png`、
> `assets/test/*.png`），再分发前请自行核实其授权。
