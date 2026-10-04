# 3D 角色模型查看器

[部署本工具](DEPLOY.md)
[模型JSON配置](CONFIG.md)
Three.js 角色查看器：**可配置**（模型 / 嘴部贴图 / 基准 JSON）、**可嵌入**（自包含单文件版）、**可部署**（纯静态）。

## 快速开始

```bash
node scripts/serve.mjs 5199
```

| 页面 | 地址 |
|---|---|
| 全屏查看器（带控制台 UI） | http://127.0.0.1:5199/ |
| **第三方内嵌演示** | http://127.0.0.1:5199/embed-demo.html |

## 文件

| 文件 | 作用 |
|---|---|
| [index.html](index.html) | 3D 模型查看器（全屏、控制台 UI） |
| [embed-demo.html](embed-demo.html) | 3D 模型网页内嵌看板娘演示 |
| [viewer.js](viewer.js) | 查看器核心（`createViewer` / `autoMount`） |
| [dist/ba3d-viewer.js](dist/ba3d-viewer.js) | **自包含单文件版**（three 全内联，内嵌用；无裸 import） |
| [dist/ba3d-viewer.min.js](dist/ba3d-viewer.min.js) | 同上，压缩版（部署用，587 KB） |
| [scripts/serve.mjs](scripts/serve.mjs) | 静态服务器（带 `.glb` MIME） |
| [scripts/build.mjs](scripts/build.mjs) | 打包单文件版 |
| [assets/sample.glb](assets/sample.glb) | 模型（= `sample.glb`，24 段动画） |
| [assets/sample.json](assets/sample.json) | **sample模型的配置**（模型 + 嘴部贴图 + 基准 + 渲染/打光/背景） |
| [assets/mouth/](assets/mouth/) | 嘴部修复图集（`Character_Mouth_2` / `_Black` / `_High`） |
| [vendor/three/](vendor/three/) | 本地 three.js r160 + addons（含 `effects/OutlineEffect.js`） |

## 配置（JSON）

`createViewer` 接受 `config`（对象）或 `configUrl`（JSON 地址）。所有字段可选：

```jsonc
{
  "model": {
    "url": "./assets/sample.glb",                              // 模型文件
    "mouthAtlas": "./assets/mouth/Character_Mouth_High.png"      // 嘴部修复贴图
  },
  "pivot": { "x": 0.25, "z": 0.30 },                          // 旋转基准调整
  "renderer": {
    "shading": "cel",                                         // "pbr" | "cel"
    "outline": true, "outlineThickness": 0.004,
    "outlineColor": [0.10, 0.07, 0.11], "outlineAlpha": 1.0,
    "targetHeight": 2.0, "fov": 30, "shadows": true
  },
  "lighting": { "preset": "day", "exposure": 1.0 },           // "day" | "golden" | "night"
  "background": { "transparent": true, "color": null },       // 默认透明
  "animation": { "name": "xxx_Normal_Idle" }
}
```

> **相对路径按配置文件所在目录解析**。所以把 `sample.json` 放在站点根目录，
> 它的 `"./assets/sample.glb"` 就始终正确 —— 被别的站点内嵌时也能定位到模型。
>
> 现成的 sample 配置见 [sample.json](sample.json)（基准 X = +0.25，Z = +0.30）。

## 三种使用方式

### 1. 直接打开 index（可用 URL 参数传入）

```
index.html?config=./sample.json
index.html?model=./assets/sample.glb&mouth=./assets/mouth/Character_Mouth_High.png&config=./sample.json
```

### 2. 第三方网站内嵌（推荐：自包含单文件版，**不需要 importmap**）

```html
<!-- 1. 放一个容器，用 data-ba3d-* 声明配置 -->
<div data-ba3d data-ba3d-config="./sample.json"
     style="width:480px;height:640px"></div>

<!-- 2. 引入自包含单文件版并自动挂载 -->
<script type="module">
  import { autoMount } from 'https://你的域名/ba3d/dist/ba3d-viewer.min.js';
  autoMount();
</script>
```

容器上可用的属性：

| 属性 | 说明 |
|---|---|
| `data-ba3d` | 标记这个容器要挂查看器（值可留空） |
| `data-ba3d-model` | 模型文件 URL（`.glb`） |
| `data-ba3d-mouth` | 嘴部修复贴图 URL（`.png`） |
| `data-ba3d-config` | 配置 JSON 的 URL（基准 + 渲染 + 打光 + 背景） |
| `data-ba3d-auto-rotate` | `true` 时自动旋转 |

### 3. JS 创建（等价）

```js
import { createViewer } from './dist/ba3d-viewer.min.js';

const viewer = createViewer(document.getElementById('stage'), {
  modelUrl: 'https://你的域名/ba3d/assets/sample.glb',
  mouthAtlasUrl: 'https://你的域名/ba3d/assets/mouth/Character_Mouth_High.png',
  configUrl: 'https://你的域名/ba3d/sample.json',   // 也可直接传对象：config: {...}
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

- **渲染模式**：原始 PBR / **卡通 Cel**（`MeshToonMaterial` + 明暗分档）
- **描边**：反壳法（three 的 `OutlineEffect`，支持蒙皮），可调粗细
- **打光预设**：白昼 / 早晨·傍晚 / 黑夜
- **背景**：默认**透明**（透出网页内容），另有 4 预设色 + 取色器
- **动作**：24 段动画切换，默认只播 idle
- **旋转基准位置**可配置 X/Z（滑杆 + 数字输入）
- **720° 无极旋转**
- **光环**绑定头部骨骼 `Bip001_Head`
- **嘴部**：拆 UV 岛 + 嘴部图集，由 `bone_mouth` 驱动开合，材质跟随渲染模式

## 打包

```bash
node scripts/build.mjs            # dist/ba3d-viewer.js
node scripts/build.mjs --minify   # dist/ba3d-viewer.min.js
```

## 技术要点

### 场景参数

- 归一化：`targetHeight = 2.0`（最长轴缩放），脚对齐 y=0、水平居中
- 相机：`PerspectiveCamera(fov=30, near=0.05, far=200)`
- 灯光：半球光 + 主方向光（带阴影）+ 轮廓光 + 补光；`RoomEnvironment` PMREM
- 控制器：`OrbitControls`（damping、限位）；阴影 PCFSoft + `ShadowMaterial` 地面

### 卡通渲染

`MeshToonMaterial` 不支持 `envMap`，所以卡通模式下自动补偿光照（半球光 ×1.25、主光 ×0.8、曝光 ×0.9）。
切换完全可逆：原材质挂在 `userData.__src`。

### 描边

反壳法：把模型再画一遍，顶点沿**法线**外扩、只渲染**背面**、填成描边色。
**透明材质不做描边** —— 反壳是"实心背面壳"，对薄片（盾牌）会糊上一层实色把半透明盖掉。

### 嘴部修复（参考了 kivo.wiki 的修复方法）

比如`CH0155_Body_4`（EyeMouth）里「嘴」= **z 最低**的那个 UV 岛（38 三角形），
其 UV 框落在贴图的**纯黑占位区** → 所以原本是黑嘴。修法：按 UV 岛拆网格，
把嘴的三角形独立成一个 `SkinnedMesh` 用嘴部图集，`repeat/offset` 把 UV 框映射到图集某一格。

### 假 BLEND 修正

GLB 里有的元素被标成 `BLEND`，但贴图其实是
「不透明 + 镂空/留白」型。判据是**中间值 alpha 占比**（`0 < a < 250`）：
占比很小 → 按不透明渲染；占比很大（如盾牌 alpha≈128）→ 保持透明。