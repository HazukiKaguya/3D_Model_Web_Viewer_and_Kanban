# 3D 模型配置 JSON 字段说明

一份配置 `assets/<角色>.json` 描述「模型 + 嘴部修复贴图 + 缩放/取景 + 渲染/打光/背景 + 默认动作」。

**相对路径一律按本 JSON 所在目录解析** —— 所以把 json 和 glb 放在同一个文件夹里，
无论站点部署在哪、被谁内嵌，路径都成立。绝对 URL（`http(s):` / `data:` / `blob:`）原样使用。

完整示例见 `assets/sample.json`。

---

## 一、顶层字段

```jsonc
{
  "_comment":   "随便写的备注，不参与渲染",
  "model":      { ... },   // 模型文件与嘴部贴图
  "pivot":      { ... },   // 旋转基准偏移
  "renderer":   { ... },   // 缩放 / 取景 / 渲染 / 描边
  "lighting":   { ... },   // 打光
  "background": { ... },   // 背景
  "animation":  { ... }    // 默认动作
}
```

---

## 二、`model` —— 模型与嘴部贴图

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `url` | string | `./assets/sample.glb` | 模型文件。**推荐 `.glb`（自包含）**；`.gltf` 若贴图/`.bin` 是外部文件会加载失败 |
| `mouthAtlas` | string | `./assets/mouth/Character_Mouth_High.png` | 嘴部修复用的图集 |

**关于嘴部修复**：原始模型的嘴部 UV 落在贴图的纯黑占位区，所以嘴是黑的。
查看器会按「材质名含 `EyeMouth`」找到那张脸图网格，再按 **UV 岛中 z 最低的那个**切出嘴部，
换成图集里对应的口型。BA小人模型嘴部 UV 一般来说都是一致的（`u[0.0086,0.2413] v[0.7926,0.9574]`），
所以单元格布局通用。

> 共用同一材质的网格可能有多个（如CH0155 有 Body+Star），
> 判定"哪个才是嘴"用的是**选中岛的 UV 是否落在嘴部区域**（这几代 BA 模型一致：
> u≈[0.009,0.241] v≈[0.793,0.957]），可用 `renderer.mouthUv` 覆盖。
> 单看"谁 z 最低"不行 —— 如CH0155 的 Star（眼睛高光）z 比嘴更低。

图集要求：正方形、**8 × 8 网格**（`Character_Mouth_2.png` 是 1024²，`Character_Mouth_High.png` 是 2048²）。

> **可用格数取决于具体图集**（逐格采样实测的结论）：
>
> | 图集 | 尺寸 | 真正是嘴型的格 | 其余 |
> |---|---|---|---|
> | `Character_Mouth_High.png` | 2048² | **#0 ~ #63（全部 64 格）** | — |
> | `Character_Mouth_2.png` | 1024² | #0 ~ #17 | #18 起是纯青色 (0,198,188) 占位 |
> | `Character_Mouth_Black.png` | 1024² | #0 ~ #50 | #51 起是青色占位 |
>
> 索引图（8×8 带编号，可直接照着挑格）：
> `assets/mouth/_cells-preview-high.png`、`assets/mouth/_cells-preview-2.png`。
> 规律：**从左往右张口度递增**，第 0 列几乎是闭合细线。

---

## 三、`pivot` —— 旋转基准（水平偏移，世界单位）

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `x` | number | `0` | 旋转轴左右偏移 |
| `z` | number | `0` | 旋转轴前后偏移 |

角色已经**自动按真实内容居中 + 脚落地**，所以正常情况保持 `0`。
只有当某个模型的重心特别偏（比如手里举着很大的武器）才需要微调。

---

## 四、`renderer` —— 缩放 / 取景 / 渲染

### 4.1 缩放与取景（重点）

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `targetHeight` | number | `2.0` | **角色真实高度（世界单位）**。归一化基准 |
| `modelHeightPx` | number | `360` | **角色在屏幕上的高度（CSS 像素）** ← 这就是「默认缩放」 |
| `framing` | `"tight"` \| `"auto"` | `"auto"` | 取景模式，见下 |
| `framingReferenceHeight` | number | `0` | 参考画布高度；`>0` 时相机参数按它算成固定世界量 |
| `framingOffsetY` | number | `0` | 取景垂直偏移（CSS 像素，正值 = 取景下移 / 画面内容上移） |
| `fov` | number | `30` | 垂直视场角 |

**两个高度字段的区别**（很容易混）：

- `targetHeight` 只管**模型在 3D 世界里的高度**，用来把不同模型归一到同一尺度。
  它**不影响屏幕大小** —— 因为相机距离会跟着等比调整。
- `modelHeightPx` 才是**屏幕上的大小**：角色真实内容在参考画布上占多少像素。
  因为归一化用的是「真实蒙皮内容」而不是包围盒，**同一个 `modelHeightPx` 在任何模型上
  都是同样的屏幕大小**。

```jsonc
"targetHeight": 2.0,        // 角色在世界里 2 个单位高
"modelHeightPx": 360,       // 屏幕上是 360 像素高
```

**换模型时怎么调**：先用同一套配置。如果该模型的动作幅度大（比如有跪姿、倒地），
角色会超出面板 —— 这时**只调小 `modelHeightPx`** 即可（滚动滚轮缩放只是临时的，不会保存）。


**`framing` 两种模式**：

- `"auto"`（默认）—— 基线取景。角色约占画面高度的 85%，随容器大小变化。
- `"tight"` —— 按**真实蒙皮内容**居中（整盒包围体在蒙皮网格上不可靠，会让角色偏心 + 悬空），
  配合 `framingReferenceHeight` 把相机参数固定成世界量。

**`framingReferenceHeight` 的作用**：

| 取值 | 行为 |
|---|---|
| `0`（不配） | 相机距离随画布高等比 → 角色像素大小恒定（锁定像素，换容器不变大小） |
| `>0`（如 `430`） | 相机参数按该高度算成**固定世界量** → **面板按百分比缩放时画面整体等比缩放** |

面板尺寸按百分比改（`420×430` → `630×645` → `252×258`）不需要动任何其它配置。

### 4.2 根位移（角色"跑出画面"）

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `stripRootMotion` | `"xyz"` \| `"xz"` \| `false` | `"xyz"` | 把根节点的位移压成常量（原地化） |
| `pressHoldMs` | number | `200` | 左键在模型上按住多久才算「按下」（否则算点击，见第九节） |
| `mouthUv` | `[u0,u1,v0,v1]` | 内置值 | 嘴在图集里的 UV 区域，仅在「多个网格共用 EyeMouth 材质」时用来判定哪个是嘴 |
| `mouthCell` | number \| `null` | `null` | **默认口型**（图集格 0~63）：动作没驱动嘴部骨骼时用哪一格，`null` = 第一个口型 |
| `visibilityRules` | array | `null` | **按动作控制网格显隐**：盾牌/武器只在特定动作里出现时用它（见下方说明） |
| `mouthIdle` | boolean | `false` | **兜底口型**：动作没驱动嘴部骨骼时，让口型自行循环（见下方说明） |
| `mouthIdleMs` | number | `180` | 兜底口型每格停留时长（毫秒），最小 60 |

有些动作（行走 `Move_Ing`、舞台表演）会平移根节点，而模型归一化时整体被放大了上百倍
（CH0273 是 150 倍），于是 0.0126 的原始位移变成约 1.9 个世界单位 —— 角色直接走出画面。

- `"xyz"` —— 三轴全抹，角色**永远**留在画面里。代价：跳跃高度、倒地坠落也被抹平
- `"xz"` —— 只抹水平位移，保留跳跃 / 倒地
- `false` —— 不处理

实现上**不写死节点名**：根位移的载体在 CH0273 里是 Object3D `Bip001`（不是 Bone，但子树含全部 141 根骨骼）。
判定方式是「从最顶层骨骼往上，凡是带 position 动画的祖先」。

### 4.3 着色与描边

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `shading` | `"pbr"` \| `"cel"` | `"pbr"` | `pbr` = 原始材质；`cel` = 卡通（MeshToonMaterial + 4 段梯度图） |
| `outline` | boolean | `true` | 反壳描边开关 |
| `outlineThickness` | number | `0.004` | 描边粗细 |
| `outlineColor` | `[r,g,b]` | `[0.10,0.07,0.11]` | 描边颜色（线性 0~1，官方是偏暖的深色，不是纯黑） |
| `outlineAlpha` | number | `1.0` | 描边透明度 |
| `shadows` | boolean | `true` | 阴影（含地面接触阴影） |

> `cel` 模式下 `MeshToonMaterial` **不支持 envMap**，环境光贡献会丢失，所以取景时会给灯光做补偿
> （半球光 ×1.25、主光 ×0.8、曝光 ×0.9）。切回 `pbr` 会自动还原。

---

## 五、`lighting` —— 打光

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `preset` | `"day"` \| `"golden"` \| `"night"` | `"day"` | 白昼 / 早晨傍晚 / 黑夜 |
| `exposure` | number | `1.0` | 渲染器曝光 |

打光只改灯光，**不碰背景** —— 背景由下面的字段独立控制。

---

## 六、`background` —— 背景

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `transparent` | boolean | `true` | `true` = 透明背景（**内嵌时透出下方网页内容**） |
| `color` | string \| number \| `null` | `null` | 非透明时用；`#rrggbb` 或 `0xRRGGBB` |

透明背景的实现是渲染器 `alpha: true` + `scene.background = null` + `setClearAlpha(0)`，
所以 canvas 是真的透明，不是"画一个和网页同色的底"。

---

## 七、`animation` —— 默认动作

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `name` | string | 不配 → **在名字含 `idle` 的动作里随机** | 初始动作 |

匹配规则（依次尝试）：**精确名字 → 忽略大小写精确 → 名字包含（忽略大小写）**。
所以 `"xxx_Cafe_Idle"` 和简写 `"Cafe_Idle"` 都能命中。

---

## 八、HTML 侧怎么用

**纯 HTML 内嵌**（属性写在容器上）：

```html
<div data-ba3d
     data-ba3d-config="./assets/sample.json"
     data-ba3d-drag
     style="width:420px;height:430px"></div>

<script type="module">
  import { autoMount } from './dist/ba3d-viewer.min.js';
  autoMount();           // 自动扫描 [data-ba3d]、创建查看器并开始加载
</script>
```

| 属性 | 说明 |
|---|---|
| `data-ba3d` | 标记该容器挂查看器 |
| `data-ba3d-config` | 配置 JSON 的 URL |
| `data-ba3d-model` | 直接给模型 URL（不配 config 时可用） |
| `data-ba3d-mouth` | 直接给嘴部贴图 URL |
| `data-ba3d-drag` | 开启「左键按在模型上拖动整个容器」 |
| `data-ba3d-auto-rotate` | `true` 自动旋转 |

> ⚠️ **容器自己不要给不透明背景。**
> 查看器画布是真透明的（`background.transparent: true` → `alpha: true` + `setClearAlpha(0)`），
> 但如果你给容器 div 设了实色 / 不透明渐变，透明就看不出来了 —— 背后的网页内容会被整块盖住，
> 看起来像"透明背景没生效"。
>
> ```css
> .panel {
>   background: transparent;          /* ✅ 完全透出背后内容 */
>   /* background: rgba(12,16,24,.2); /* ✅ 想要淡淡一层底就用半透明 */
>   /* background: linear-gradient(...#1a2233...#0a0d14); /* ❌ 不透明 → 透明失效 */
> }
> ```
>
> `embed-demo.html` 里浮层背后特意放了一块彩色装饰（`#showcase`）来直观验证这一点。

**URL 参数**（独立页面）：

```
index.html?config=./assets/sample.json
index.html?model=./assets/sample.glb&mouth=./assets/mouth/Character_Mouth_2.png
```

---

## 九、页面事件与动作钩子

查看器会在容器上派发**冒泡的 CustomEvent**：

| 事件 | `detail` | 用途 |
|---|---|---|
| `ba3d:pointerdown` | `{ button, hit }` | 立即派发（未过阈值）；`hit` = 左键是否按在模型身上 |
| `ba3d:press` | `{ button, heldMs, thresholdMs, hit }` | **按住够久才算「按下」**（默认 200ms），此时才开始拖动容器 |
| `ba3d:click` | `{ button, heldMs, thresholdMs, hit }` | 没按够就松手 → 算点击，不触发拖动 |
| `ba3d:pointerup` | `{ button, hit, pressedOnModel, pressed }` | 抬起；`pressed` = 本次是否越过按住阈值 |
| `ba3d:action` | `{ name }` | 动作切换（用来同步选单） |

**按住阈值**由 `renderer.pressHoldMs` 控制（默认 `200`）。左键在模型上按下后先进入待定：

- 按住 ≥ 200ms → 派发 `ba3d:press`，并开始拖动容器
- 提前松开 → 派发 `ba3d:click`，**不**拖动

这样「点一下想触发动作，结果把面板拖走了」就不会发生了。拖动起点取的是**跨过阈值那一刻的指针位置**，
所以按住期间手抖移动过也不会导致面板跳位。

**嘴型**：图集格默认由 `bone_mouth` 的缩放驱动。但**有些模型的 GLB 里没有嘴部动画数据**
（实测 CH0273 的 42 段动画、每段 142 条轨道，没有一条和嘴相关），这时嘴型不会自己变 —— 不是实现问题，
是模型没这份数据。页面可以手动驱动：

```js
viewer.setMouthCell(10);              // 0~63，图集 8×8 的第 10 格
viewer.getMouthCell();                // 当前格
viewer.getMouthInfo();                // { mesh, cell, driver: {bone, scaleTrack, ...}, ... }
//   driver.scaleTrack === false → 该模型的嘴不随动作变化（无数据）
```

**按动作控制网格显隐 \`visibilityRules\`**：有些模型的盾牌/武器**只在特定动作里出现**，
但 GLB 的动画数据里并没有"隐藏"这件事 —— 实测 `Hoshino_Original` 的盾牌绑在 `bone_shield_root` 上、
缩到 0 确实会消失，可 42 段动画里它的 scale 只在 `[0.70, 1.00]`，**没有任何一段去缩它**。
那是游戏引擎按动作配置的显隐，只能用规则补：

\`\`\`jsonc
"renderer": {
  "visibilityRules": [
    // 三种写法任选一种：
    { "mesh": "Shield", "clipContains": "Shield" },              // 动作名含 Shield 时显示
    { "mesh": "Shield", "clips": ["Hoshino_Original_Shield_A"] },  // 精确列出动作名（**完全匹配**）
    { "mesh": "Shield", "always": true }                         // 一直显示（强制恢复）
    // 都可以加 "invert": true 取反
  ]
}
\`\`\`

> 为什么不能靠"盾牌有没有移动"来判断（实测数据）：`Hoshino_Original` 里盾牌是**常驻挂在手臂骨骼**上的，
> 手臂一动它相对角色就有位移 —— 4 段 Shield 动作反而**位移恰好是 0**（举得很稳），
> 而 `Exs_Cutin` 位移 0.011 最大。位移会判反；骨骼缩放在那 4 段也恒为 1.0。
> 数据里没有可靠信号，所以只能靠命名约定或显式列表。

含义：网格名匹配 `/Shield/i` 的，只在**动作名包含** `Shield` 时显示，其余动作隐藏。
`mesh` / `clipContains` 是正则片段（`clipContains` 为**子串**匹配），`clips` 则是**完全匹配**（整个动作名必须等于列表里的一项，忽略大小写）；可选 `"invert": true` 反向（只在不含时显示）。
不配则完全不干预显隐（默认）。

没配规则但检测到"网格名和部分动作名同含 shield/weapon"时，加载会在控制台给出一条可直接抄的提示。

**默认口型 \`mouthCell\`**：有些模型的 GLB 里**完全没有嘴部动画数据**
（实测 CH0273 的 42 段动画、每段 142 条轨道，没有一条和嘴相关），这时嘴型会一直固定。
用 `mouthCell` 指定那一刻用哪个口型（图集 8×8，合法值 0~63）：

```jsonc
"renderer": {
  "mouthCell": 10        // 没嘴部数据时用第 10 格；null（默认）= 第一个口型
}
```

有嘴部数据的动作**不受影响**，仍然跟着动作走 —— `mouthCell` 只在"没数据可用"时兜底。

用 `viewer.setMouthCell(n)` 在控制台里逐格试，或直接看 `assets/mouth/_cells-preview-*.png` 挑格，再写进配置。（合法范围永远是 0~63，但**超出该图集实际嘴型范围的格会显示成一块青色**。）

**兜底口型 `mouthIdle`**（默认关闭，优先级高于 `mouthCell`）：有些模型的 GLB 里**完全没有嘴部动画数据**
（实测 CH0273 的 42 段动画、每段 142 条轨道，没有一条和嘴相关），这时嘴型会一直固定。
打开后，当前动作若没在驱动嘴部骨骼，口型会按 `mouthIdleMs` 的节奏循环一遍
（纯视觉效果，与动作内容无关）；有嘴部数据的动作不受影响，仍然跟着动作走。

```jsonc
"renderer": {
  "mouthIdle": true,      // 打开兜底口型
  "mouthIdleMs": 180      // 每格停留 180ms（8 格约 1.44s 一轮）
}
```

加载时会打印 `[fixMouth] 没有任何动作驱动「bone_mouth.scale」…` 提示该模型缺嘴部数据；
也可以用 `viewer.getMouthInfo().driverClips` 查有几个动作真的会动嘴（0 = 完全没数据）。

全局动作钩子（页面其它 js 直接调）：

```js
play3dmodelaction(['Formation_Pickup']);   // 播第一个能匹配到的动作
play3dmodelaction(['A', 'B']);             // 按顺序找，播第一个存在的
play3dmodelaction([3]);                    // 索引
play3dmodelaction('Cafe_Idle');            // 单个字符串
play3dmodelaction();                       // 不传 → 回默认动作
```

交互约定：**左键按在模型身上拖动 = 移动容器；右键拖动 = 旋转角色**（开启 `dragContainer` 时）。
