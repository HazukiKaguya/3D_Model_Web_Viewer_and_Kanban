# BA3D 配置 JSON 字段说明

中文 ｜ [English](CONFIG.en.md) ｜ [日本語](CONFIG.ja.md)

> **lilToon 基线：2.3.4**
> 本文档里的**界面标签保留中文原文**（查看器界面本身就是中文），首次出现时附译名。
>   · 源码地图（2.3.4 行号）、版本差异清单 ⇒ [`LILTOON2.x.md`](LILTOON2.x.md)
>   · 旧基线（1.3.7）的对照与核对记录 ⇒ [`LILTOON1.x.md`](LILTOON1.x.md)（已归档、行号是 1.3.7 的）
>
> 本文档里的 `lil_*.hlsl:NNN` 行号引用**已全部对齐 2.3.4**。

一份配置 `assets/<角色>.json` 描述「模型 + 嘴部修复贴图 + 缩放/取景 + 渲染/打光/背景 + 默认动作」。

**相对路径一律按本 JSON 所在目录解析** —— 所以把 json 和 glb 放在同一个文件夹里，
无论站点部署在哪、被谁内嵌，路径都成立。绝对 URL（`http(s):` / `data:` / `blob:`）原样使用。

完整示例见 `assets/sample.json`（示例模型 CH0155）与 `assets/fallback.json`（同一模型的另一份配置模板）。

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
  "animation":  { ... },   // 默认动作与外部 Unity .anim
  "camera":     { ... }    // 声明式相机（按 Unity 的单位填，复现 Unity 取景）
}
```

---

## 二、`model` —— 模型与嘴部贴图

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `url` | string | `./assets/sample.glb` | 模型文件。**推荐 `.glb`（自包含）**；`.gltf` 若贴图/`.bin` 是外部文件会加载失败 |
| `mouthAtlas` | string \| `null` | `null` | 嘴部修复用的图集（kivo 那套）。**不配 = 不做嘴部修复** —— 适合口型本来就是独立网格 / morph target 驱动的模型 |

**关于嘴部修复**：原始模型的嘴部 UV 落在贴图的纯黑占位区，所以嘴是黑的。
查看器会按「材质名含 `EyeMouth`」找到那张脸图网格，再按 **UV 岛中 z 最低的那个**切出嘴部，
换成图集里对应的口型。CH0155 与 CH0273 实测嘴部 UV 完全一致（`u[0.0086,0.2413] v[0.7926,0.9574]`），
所以单元格布局通用。

> 共用同一材质的网格可能有多个（CH0155 有 Body+Star、CH0167 有 嘴+脸描边+眼睛），
> 判定"哪个才是嘴"用的是**选中岛的 UV 是否落在嘴部区域**（这几代 BA 模型一致：
> u≈[0.009,0.241] v≈[0.793,0.957]），可用 `renderer.mouthUv` 覆盖。
> 单看"谁 z 最低"不行 —— CH0155 的 Star（眼睛高光）z 比嘴更低。

> **不配 `model.mouthAtlas` 就不做嘴部修复**（默认行为）。修复是给「嘴混在 EyeMouth 网格里、
> 渲染成黑块」的那批模型用的；而像 BA 系列那批，每种口型本来就是**独立网格 + morph target**
> 驱动（实测 morph 权重 1 时把口型甩到自身尺寸的 17 倍之外＝隐藏，动画设成 0 才显形），
> 强行套修复反而会把眼睛当嘴拆掉。所以：
>
> - 需要修复 → 在 json 里写 `"model": { "mouthAtlas": "./mouth/xxx.png" }`（或容器加 `data-ba3d-mouth`）
> - 不需要修复 → **什么都别写**，加载时会打印 `[fixMouth] 未指定嘴部图集 … → 跳过嘴部修复`

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

### FBX 贴图（`textureBase` / `textureMap`）★

**FBX 把贴图路径存在文件里** —— 常见是导出者机器上的绝对路径（`C:/art/tex/body.png`），
而且用 **Windows 反斜杠**、（浏览器会把它编码成 `%5C`）。所以贴图很容易全部 404。

我们用一个 `LoadingManager.setURLModifier()` 拦下所有贴图请求（`TextureLoader` 最终会走 `manager.resolveURL()`），依次处理：

1. **反斜杠 → 正斜杠**（必须，否则路径根本不对）
2. **去掉盘符**（`C:/art/tex/body.png` → `art/tex/body.png`）
3. **`textureMap` 三级匹配**：完整 URL → 去查询串 → **只看文件名**
4. **`textureBase` 兜底**：基准目录 + 文件名（只在路径看起来是外部绝对路径时才用，避免改坏正常的相对路径）
5. 都没命中就**原样返回**，交给默认逻辑（URL 加载时相对路径本来就能解析）

#### 三种用法

**① 服务器上有 Texture 子目录**（URL 加载）

```jsonc
"renderer": { "textureBase": "./Texture/" }
```

**② 贴图在别的目录 / 改了名**

```jsonc
"renderer": {
  "textureMap": {
    "body.png": "./Texture/body_diffuse.png",
    "C:/artist/tex/hair.png": "./Texture/hair.png"
  }
}
```

**③ 本地拖入（上传）**

「自定义模型」面板里多了 **「选择贴图（可多选）」** 和 **「选整个贴图文件夹」** ——
选中的文件会按**文件名**建映射（`body.png → blob:…`） —— FBX 里存什么路径都无所谓，认文件名就够。

> 路径都按**相对于配置文件所在目录**解析、和 `model.url` 一致。

### 自动加载同名配置（`autoConfig`）

加载模型时若**没有显式指定配置**（既没给 `configUrl` 也没给 `config`），
会自动去找**同目录下同名的 .json**：

```
assets/sample.glb   →   assets/sample.json     找到就用。
assets/Natsu.glb    →   assets/Natsu.json      没有 → 静默跳过（一次 404，不影响加载）
拖入本地文件         →   不探测（blob: 没有「同目录」概念）
```

优先级（`resolveConfig()`）：

1. `configUrl` —— 显式指定，读不到会**报错**
2. `config` —— 直接给对象
3. **同名 JSON 自动发现** —— 读不到/解析失败都**静默**，不阻断加载

配置里的相对路径一律按**配置文件所在目录**解析 —— 所以 `sample.json` 里的 `./sample.glb`、`./mouth/xxx.png` 都能正确定位。

关掉自动发现：

```js
createViewer(el, { autoConfig: false })
```

> 命中时控制台打印 `[autoConfig] 已自动加载同名配置：<url>`。
> 注意同名 JSON 里的 `model.url` 会**覆盖**调用方给的模型地址 —— 这是原有行为（显式配置优先），
> 所以 `sample.json` 里写 `./sample.glb` 时仍然加载同一个模型，**不会重复加载**。

### 4.1 缩放与取景（重点）

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `targetHeight` | number | `2.0` | **角色真实高度（世界单位）**。归一化基准 |
| `modelHeightPx` | number | `360` | **角色在屏幕上的高度（CSS 像素）** ← 这就是「默认缩放」 |
| `framing` | `"tight"` \| `"auto"` | `"auto"` | 取景模式，见下 |
| `modelRotation` | `[x,y,z]` \| `null` | `null` | 加载后给模型加旋转（单位**度**）。**FBX 常见 Z-up，需要它**，如 `[-90,0,0]`；GLB 一般不用 |
| `textureBase` | string \| `null` | `null` | **FBX 贴图基准目录**，如 `"./Texture/"`。等价于 `fbxLoader.setResourcePath()` |
| `textureMap` | object \| `null` | `null` | **FBX 贴图精确映射** `{ "文件名或原路径": "实际URL" }`。FBX 里常存导出者机器的绝对路径，所以**按文件名匹配**最可靠 |
| `framingReferenceHeight` | number | `0` | 参考画布高度；`>0` 时相机参数按它算成固定世界量 |
| `framingOffsetY` | number | **`22`** | 取景垂直偏移（CSS 像素、正值 = 取景下移 ⇒ **画面内容上移**）⚠️ 默认 **不是 0**、见下 |
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

> 实测参考（面板 420×430，含全部常用动作不裁切）：
> - CH0155：`modelHeightPx: 360` → 需要 308×405。
> - CH0273：`modelHeightPx: 275` → 需要 309×394。

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
| `stripRootMotion` | `"compensate"` \| `"root"` \| `"xyz"` \| `"xz"` \| `false` | `"compensate"` | 根位移处理：**`"compensate"` 对象级抵消（默认，不动动画轨道）**；`"root"`/`"xyz"` 改写轨道（会拆散道具，仅特殊模型用）；`"xz"` 保留跳跃；`false` 关闭 |
| `pressHoldMs` | number | `200` | 左键在模型上按住多久才算「按下」（否则算点击，见第九节） |
| `mouthUv` | `[u0,u1,v0,v1]` | 内置值 | 嘴在图集里的 UV 区域，仅在「多个网格共用 EyeMouth 材质」时用来判定哪个是嘴 |
| `mouthCell` | number \| `null` | `null` | **默认口型**（图集格 0~63）：动作没驱动嘴部骨骼时用哪一格，`null` = 第一个口型 |
| `visibilityRules` | array | `null` | **卡通（Cel / Toon）着色可调项**：卡通模式用 `MeshToonMaterial` + `onBeforeCompile` 注入，
**不重写整条管线**（贴图 / 蒙皮 / morph / 阴影 / 顶点色全保留）。注入两处：

1. **替换 `getGradientIrradiance`** —— 它的返回值会**乘到灯光颜色上**，所以分档数和暗部色调都在这里算
   （不再需要 DataTexture 梯度图）：
   ```glsl
   float q = floor( t * 4.0 ) / max( 4.0 - 1.0, 1.0 );   // 4 档硬边
   float v = 0.5500 + 0.4500 * q;                          // 最暗 0.55
   return mix( vec3(1.0), vec3(1.0), v );                  // 暗部色调（null 时是白色）
   ```
   **默认值与旧实现数学等价**（旧 DataTexture 生成的正是 0.55 / 0.70 / 0.85 / 1.00），所以默认外观零变化。
   ### 分档色 + 过渡带（`celBandRamp` / `celBandSoft`）

   **默认不启用** —— `celBandRamp = null` 时走的正是上面那段老公式，**生成的 GLSL 逐字节不变**，
   所以「cel 模式没变」这条回归保证仍然成立。勾上面板上的「分档色」才切换成下面这个版本。

   原来只有一个「最暗档亮度 + 暗部色调」，亮暗之间是**线性**过渡、每档只能用同一个色相。
   现在可以给 **4 个色标各自指定颜色**（最暗段 → 最亮段），每一档取自己那一档的颜色：

```glsl
vec3 ba3dRamp4( float u ) {              // 4 色标查表（顶层函数 —— GLSL 不允许嵌套定义）
  float x = clamp( u, 0.0, 1.0 ) * 3.0;
  vec3 a = mix( C0, C1, clamp( x,       0.0, 1.0 ) );
  vec3 b = mix( C1, C2, clamp( x - 1.0, 0.0, 1.0 ) );
  vec3 c = mix( C2, C3, clamp( x - 2.0, 0.0, 1.0 ) );
  return mix( mix( a, b, step( 1.0, x ) ), c, step( 2.0, x ) );
}
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
  ...
  float x  = t * 3.0;                  // = STEPS-1
  float bi = floor( x );               // 段号
  float bf = x - bi;                   // 段内位置
  float s  = SOFT > 0.0005 ? smoothstep( 0.0, SOFT, bf ) : 0.0;   // 过渡带
  float d  = max( 3.0, 1.0 );
  float u0 = bi / d, u1 = min( u0 + 1.0 / d, 1.0 );
  return mix( ba3dRamp4( u0 ), ba3dRamp4( u1 ), s );
}
```

   | 键 | 类型 | 默认 | 说明 |
   |---|---|---|---|
   | `celBandRamp` | 4×`[r,g,b]` 或 `null` | `null` | 4 个色标，**从最暗段到最亮段**。`null` = 老公式 |
   | `celBandSoft` | number | `0` | 段间**过渡带宽度** 0~1。0 = 硬边（`floor`，与老公式一致）· 0.5 = 段内后半段平滑 · 1 = 整段都在过渡。只对 `celBandRamp` 生效 |

   ⚠️ 每一档拿到的是**色标插值出来的颜色**（`bandSoft = 0` 时是硬边切换），
   不是「每档一根独立滑杆」。4 个色标足以表达冷/暖分档，同时不至于让面板爆炸。

   ⚠️ 面板上「分档色」**不勾选**时，`bandRamp` 传 `null`、`bandSoft` 传 `0` —— 和从没打开过完全一样。

```jsonc
"celBandRamp": [                 // 蓝紫暗部 → 白亮部，四种色相
  [0.16, 0.14, 0.25],
  [0.42, 0.39, 0.53],
  [0.66, 0.63, 0.75],
  [1.0,  1.0,  1.0 ]
],
"celBandSoft": 0.25              // 段间 1/4 段做平滑
```

```js
viewer.setCel({ bandRamp: [[0.2,0.1,0.3],[0.5,0.4,0.6],[0.8,0.75,0.9],[1,1,1]] });
viewer.setCel({ bandSoft: 0.4 });
viewer.setCel({ bandRamp: null });          // 恢复老公式
```

2. **覆盖 `vNormal`（仅脸/眼/眉）** —— 把法线强制指向摄像机（view space 的 `+z`）。
   否则头一转，脸上的受光跟着法线变化，会出现一块块脏阴影；这是动漫渲染的标准做法。
   **BA 那批模型建议打开** `"celFaceLight": true`。

```jsonc
"renderer": {
  "shading": "cel",
  "celSteps": 2,                              // 硬边两级，更"纸片"
  "celDark": 0.62,                            // 暗部再亮一点
  "celShadowTint": [0.72, 0.62, 0.85],        // 暗部偏紫，而不是变黑
  "celFaceLight": true                        // 面部光照修正
}
```

运行时也能改（控制台直接试，立刻重建材质）：

```js
viewer.getCel();                                  // 看当前参数
viewer.setCel({ steps: 2 });                      // 切成硬边两级
viewer.setCel({ faceLight: true });               // 开面部修正
viewer.setCel({ shadowTint: [0.72, 0.62, 0.85] });// 暗部偏紫
viewer.setCel({ shadowTint: null });              // 恢复
```

**面部不接收阴影（`faceNoShadow`）**：白昼光下头发会在脸上投一道很明显的影，官方渲染里脸基本是"干净"的。
打开后把面部网格的 `receiveShadow` 关掉 —— 阴影贴图不再作用在脸上，但**头发投在身体上的阴影不受影响**。
判定复用 `facePattern`，所以卡通模式的 `_Toon` 材质也照样匹配。

实测匹配结果：

| 模型 | 关掉阴影（面部） | 保持阴影 |
|---|---|---|
| `sample.glb` | 4 个（Face / Eyebrow / EyeMouth / Star）| 7 个（Hair / Body / Weapon / Milk / Pie …）|
| BA `Hoshino.glb` | 19 个（16 个 Mouth_* + Face + Eyebrow + EyeMouth）| 5 个（Hair / Body / Shield / Weapon / Halo）|

```jsonc
"renderer": { "faceNoShadow": true }
```

运行时开关：

```js
viewer.getFaceNoShadow();          // { enabled, pattern, meshes }
viewer.setFaceNoShadow(true);      // 立即生效
viewer.setFaceNoShadow(false);     // 恢复
```

**自阴影 vs 头发投影（`noCastPattern`）** —— 重要限制：

**标准阴影贴图无法区分"自阴影"和"他物投影"**。阴影图只记录每个像素被什么深度挡住，
它不知道遮挡物是不是物体自己。所以：

| 想要 | 做法 | 代价 |
|---|---|---|
| 脸上完全没有影 | `"faceNoShadow": true`（默认）| 自阴影也一并没了 |
| **脸保留自阴影、刘海不投影** | `"faceNoShadow": false` + `"noCastPattern": "Hair"` | **头发不再往身体/肩上投影** |
| 脸不接收阴影、但头发照常投影 | `"faceNoShadow": true` | 同上（自阴影没了）|

用 layers 给脸单独一盏不投影的灯**也无法解决** —— 那盏灯自己不带阴影，脸照样没有自阴影。

实测 `noCastPattern: "Hair"` 的命中（各 1 个网格，很准）：

| 模型 | 命中 |
|---|---|
| `sample.glb` | `CH0155_Body_1 [CH0155_Hair]` |
| BA `Hoshino.glb` | `Hoshino_Original_Body_6 [Hoshino_Original_Hair]` |

```jsonc
"renderer": {
  "faceNoShadow": false,      // 脸恢复接收阴影（自阴影回来）
  "noCastPattern": "Hair"     // 但头发不进阴影图 → 刘海不在脸上投一片
}
```

> 注意：脸能不能出现自阴影，还取决于面部网格自身的**曲率**和 `castShadow`。
> 平面卡片式的脸几乎没有自阴影可看；有鼻梁/下巴起伏的才会明显。

### 卡通（Cel）：除阴影外 ≈ 无光照 ★

**只影响卡通通路，PBR 完全不动**（倍率只写在 `cel` 分支里，白昼预设数值保持原样）。

#### 两个关键点

1. **明暗分档**：`celSteps: 2`（只有「受光 / 阴影」两级）+ `celDark: 0.80`。
   分档让**所有受光面处于同一亮度** —— 这正是「除阴影外和无光照一样」的来源。
2. **色调映射**：卡通走 `LinearToneMapping`（数学上等价于 `× toneMappingExposure`）。
   ACES 会把两档一起推向纯白：实测受光 1.03 / 阴影 0.83 经 ACES 后变成
   **0.85 / 0.82，对比从 19% 掉到 8.5%，阴影明显变糊**。
   等比缩放 → **阴影对比原样保留**，同时曝光旋钮才真正能用来调亮度。

#### 卡通灯光补偿（`applyLightingPreset`）

MeshToonMaterial **不支持 envMap**，RoomEnvironment 的环境照明整个丢掉，所以要补；
但**补偿方向很关键**。渲染式：

```
lit    = hemi×0.62 + key×1.0     + rim + fill
shadow = hemi×0.62 + key×celDark + rim + fill     ← 投影挡住的是整个主光
```

**hemi 同时出现在两项里 → 它越高，阴影被冲得越淡。**
旧代码把 hemi ×1.25（想补回环境光），结果受光/阴影一起被推向纯白 → 阴影消失。
现在反过来：**大幅压低 hemi、让主光主导**，背光面由分档的 `celDark` 那一档兜住。

| 参数 | 原值 | 卡通倍率 | 结果 | 作用 |
|---|---|---|---|---|
| `hemi.intensity` | 0.5 | **× 0.48** | 0.24 | 环境光同时出现在受光/阴影两项里，**越低阴影越清楚** |
| `key.intensity` | 2.0 | **× 1.22** | 2.44 | 主力：负责受光亮度 + 投影对比 |
| `rim.intensity` | 1.2 | **× 0.15** | 0.18 | 压到几乎不可见（不投影，只会冲淡阴影） |
| `fill.intensity` | 0.4 | **× 0.15** | 0.06 | 同上 |
| `exposure` | 1.0 | **× 1.15** | 1.15 | 卡通唯一的亮度总闸 |

**倍率已按实测定标**：亮度滑块在 **2.1** 时观感与无光照一致，故把 2.1 直接折进倍率 —— `lightingScale` 保持 1.0 即默认正确，仍可继续调。
阴影对比约 **17%**（`celDark: 0.80`，比最初 0.72 的 24% 更淡，按实测反馈调过）。
背光面由 0.80 那一档兜住，不会发黑。

#### 投射阴影浓淡（`celShadowMin`）★ 和 celDark 是两件事

用户反馈「照在身上的阴影还是很浓」—— 那不是分档问题，而是**投射阴影**：

| | 成因 | 由谁控制 |
|---|---|---|
| **分档** | 法线背光 → 主光打个折 | `celDark`（0.80 = 暗一档）|
| **投射阴影** | 被头发/身体**挡住** → 主光**整个被砍掉** | `celShadowMin` |

r160 里平行光的阴影是**内联**在 `lights_fragment_begin` 里的：

```glsl
directLight.color *= ( directLight.visible && receiveShadow )
    ? getShadow( directionalShadowMap[i], … ) : 1.0;
```

而 `getShadow` 只返回 0 或 1 —— **要么全给要么全不给**，`celDark` 那一档根本管不到它。
所以阴影里只剩环境光，看起来特别浓。

处理：把结果重映射成 `mix( keep, 1.0, s )` ——
受光（s=1）原样，投影（s=0）保留 `keep` 倍主光。**现默认 `0.3`**（实测定标：0.5 偏淡，0.3 合适）。

> ⚠️ **实现上有个必须注意的坑**：three 的调用顺序是
> `WebGLRenderer → material.onBeforeCompile(parameters, renderer)`（回调），
> `WebGLProgram → resolveIncludes(fragmentShader)`（include 才展开）。
> 也就是说**回调拿到的还是含 `#include` 的原始源码**，直接去找 `getShadow(…)` 那一行是找不到的
> （cel 渐变能生效，正是因为替换的是 `#include` 本身）。
> 这里取 `THREE.ShaderChunk.lights_fragment_begin` 原文、软化后整体顶替该 include，保证与 three 原版逐字一致。

#### ✅ 脸部阴影的真相（三轮排查后的结论）

结论修正过两次，最终用 **Raycaster 精确遮挡测试**定案 —— 从面部顶点朝主光方向打射线，看有没有被头发挡住：

```
主光方向 (0.38, 0.77, 0.51)
sample.glb   266 个面部顶点 → 229 个被头发挡住 (86.1%)
Natsu.glb    288 个面部顶点 → 148 个被挡住 (51.4%)
命中距离 = 0.000 ~ 0.001        ← 关键在这
```

**脸上确实有投射阴影**，而且是**贴合**的（脸和头发互相穿插）。

真凶是 `keyLight.shadow.normalBias = 0.02` —— 它把阴影采样沿法线**推开**，
0.02 在只有 ~2 单位高的模型上是**接触距离 0.001 的 20 倍** → 脸上的投影被整个抹掉。
身体的影还在，是因为那里间隙大得多，现象完全吻合。

> 前两轮的判断都错了：先说「是分档不是投影」，又说「几何上投不出来」。
> 第一轮错在把额头暗带当成唯一可能；第二轮错在拿**模型中心**当人脸做采样，测的根本不是脸。

**尝试过但无效**：把 `shadowNormalBias` 从 0.02 调到 0 —— 实测**脸影仍然没出来，反而让光照变怪**，已回退到原值。
所以这条推断**不成立**，此处仅记录排查过程，别再照它去调。

> 两个值仍保留为配置项（`shadowBias` / `shadowNormalBias`），默认即 viewer 一直以来的原值。

#### 脸部阴影：**只用一个参数**（`celFaceShadowMin`）

浓度本身就表达了「有无」：**拖到最右（≥0.95）= 没有面部阴影**，所以不再需要额外的开关。

| `celFaceShadowMin` | number \| `null` | **`0.7`** | **面部阴影的唯一参数**：`0` = 最深，`>= 0.95` = 没有面部阴影，`null` = 跟随 `celShadowMin` |

| 取值 | 含义 |
|---|---|
| **`0.7`（默认）** | 面部比身体（0.3）**更淡**的投影 |
| `null` | 跟随全局 `celShadowMin` |
| `0` | 面部保留原始硬阴影（最深）|
| `0.3` | 与身体同档（柔和）|
| `>= 0.95` | **没有面部阴影** |

实现上，这个值同时驱动两件事，**一个参数覆盖两个渲染通路**：

1. **卡通**：改写 `lights_fragment_begin` 里的 `getShadow(...)` → `mix(keep, 1.0, s)`，控制投影浓度
2. **两者通用**：当 `>= 0.95` 时派生 `faceNoShadow = true`，直接关掉面部网格的 `receiveShadow`
   —— `receiveShadow` 在 `lights_fragment_begin` 里被**所有材质类型**检查（toon / standard / lambert / phong），
   所以 PBR 通路也一并覆盖、（只靠着色器软化的话 PBR 是无效的）

界面：**「脸部」滑块**（旁边是全局「阴影浓淡」）。未动过它时跟随全局并实时同步显示，一动就变成独立值。
想回到跟随：配置写 `null`，或 `viewer.setCel({ faceShadowMin: null })`。

> 已移除的东西：独立的「面部阴影」开关、以及 `setFaceNoShadow()` API —— 都合并进这一个参数了。
> `renderer.faceNoShadow` 也不再被读取（配置里写了会被忽略）。

索引页右下角有 **「阴影浓淡」滑块**（0 ~ 0.95）可以实时调。也可以在配置 JSON 里写：

```jsonc
"renderer": {
  "celShadowMin": 0.3,        // 全身投射阴影：0 = 硬阴影，1 = 完全没有
  "celFaceShadowMin": null,   // 面部单独一档；null = 跟随上面。设 0 让脸影最深
  "celSteps": 2,              // 只有受光/阴影两级
  "celDark": 0.80,            // 背光面的分档浓淡
  "shadowNormalBias": 0.02,   // 阴影沿法线推开的距离（默认值，未调优）
  "shadowBias": -0.0003
}
```

运行时等价写法：`viewer.setCel({ shadowMin: 0.3 })`

#### 微调（索引页已带「光照亮度」滑块 + 数字输入框）

- **阴影太淡** → 调 `viewer.setCel({ dark: 0.68 })`（`celDark` 越小阴影越深；现 0.80）
- **整体偏暗/偏亮** → **界面上的「光照亮度」滑块**（实时；两个通路都吃，1.0 = 预设原值）
- 卡通另有总闸 `toneMappingExposure × 1.15`，调它同样等比、不损阴影对比
- **想更「卡通」的分档** → `viewer.setCel({ steps: 4 })`（回到四级梯度）

> `faceNoShadow` 默认 `false`（**保留面部阴影**）。分档 + 直通之后投影很干净，
> 不再需要以前那种关掉面部阴影的兜底；设 `true` 仍可去掉。

### 可选部件与道具（`hideOptional` / `hideParts`）

**这批模型自己在 GLB 节点上带了标记**（lihaohong6/BlueArchiveModels，共 295 个里 44 个有 extras）：

```json
"Hoshino_Original_Shield_Weapon": { "optional": true, "prop0": true }
"Juri_Original_Weapon":           { "optional": true, "prop0": true }
```

GLTFLoader 会把 extras 放进 `object.userData`，所以能直接读。语义是：
**标了 `optional` 的部件默认隐藏，只有当前动作真的驱动它时才显示** —— 对应参考查看器的
`data-hide-parts="optional"`。实测完全对得上：

| 模型 | 部件 | 显示于 |
|---|---|---|
| `Hoshino.glb` | 盾牌 | `Exs_Cutin` / `Exs`（2/36 段）|
| `Juri.glb` | 武器 | `Formation_Idle` / `Tactical_Start`（2/8 段）|

**默认开启**，不用配置。这也把以前手写的 `visibilityRules` 自动化了 —— 同一条规则现在可以删掉。

```js
viewer.getOptionalParts()
// [{ name: 'Hoshino_Original_Shield_Weapon_1', prop: true, usedBy: 2, visible: false }]
```

#### 那"位置不对的小物件"呢

有一批道具（计算器 / 无人机 / 服装配件）的骨骼是**与 `Bip001_Pelvis` 平级的独立根**，
位置由游戏引擎决定，GLB 里就是错的，且**换父级也修不好**（动画的局部值按原父级写的，
实测 Yuuka 的计算器挂到右手后与手的距离反而从 0.29 变成 0.69）。这类只能藏：

```jsonc
"hideParts": "Calculator|Dron"     // 正则片段，匹配网格名或材质名
```

> 注意 `bone_cos1_01..04` 那类是**服装配件**（被 31~33/44 段动作驱动），本来就该显示，别误藏。

### 骨骼缩放 = 隐藏道具（`hideByBoneScale`）

**这批模型普遍用「把驱动骨骼缩到很小」来表达「这个道具现在不显示」** —— 但缩到 0.3 并不是 0，
于是缩小版道具仍然浮在原处（实测 Airi.glb 的冰激凌就挂在脑门上）。

判据：**该网格骨架里的所有骨头缩放都小于阈值**（默认 0.5）。用「所有」而不是「取最小」，
是为了不误伤角色本体 —— 本体 100+ 根骨骼总有接近 1 的，永远不会全部低于阈值；
道具只有 1~2 根，很容易命中。每帧判定（缩放随动作变化），但会跳过 `hideOptional` 管理的网格。

实测效果（这条规则**精确复现了模型作者表达的隐藏意图**）：

| 模型 | 网格 | 隐藏于 | 显示于 |
|---|---|---|---|
| `Airi.glb` | 冰激凌 | `Cafe_Reaction` / `Cafe_Idle` / `Cafe_Walk`（scale 0.315）| 其余 4 段（0.761~1.0）|
| `Natsu.glb` | 派 `CH0155_Pie01` | **全部动作** | — |
| `Natsu.glb` | 牛奶盒 | `Formation_*` / `Normal_*` 等 | `Cafe_Idle` / `Cafe_Walk` / `Cafe_Reaction` |
| `Shiroko.glb` | 无人机火箭 / 机翼 | **全部动作** | — |

```jsonc
"hideByBoneScale": 0.5      // 默认开启；设 0 关闭
```

### 光环在 PBR / Cel 下全黑 → 零法线（已自动修复）★

**症状**：模型的光环在 `unlit` 下正常，在 **PBR / Cel 下是纯黑**。

**原因**：相当一部分模型的**光环网格根本没有 NORMAL 属性**。按 glTF 规范，
GLTFLoader 遇到缺失法线会填一整个**零向量**缓冲；零法线在受光材质下光照恒为 0 → 纯黑。
而 unlit 用的是 `MeshBasicMaterial`，**根本不读法线**，所以看起来正常。

**范围**（扫描 60 个模型）：29 / 1078 个网格是零法线，**其中 28 个都是光环**
（`Airi_Original_Halo_1`、`Hoshino_Origina_Halo`、`Akari_Halo`、`Aris_Original_Halo_1` …）。
也有正常的光环，例如 `CH0155_Halo_1`（Natsu.glb）法线是 1.000 —— **这个缺陷是逐模型的**。

**处理**：加载时对所有网格做一次抽样检查，**整片都是零 / NaN 法线**的调用
`geometry.computeVertexNormals()` 重算（得到面法线，平面着色；对光环这种薄片正合适）。
抽样判断保证正常网格不会被误改、也不付全量代价。

实测：

| 模型 | 修复前 | 修复后 |
|---|---|---|
| `Airi.glb` | 333/333 顶点零法线 | 0/333，平均长度 1.000 |
| `Hoshino.glb` | 282/282 顶点零法线 | 0/282，平均长度 1.000 |
| `Natsu.glb` | 0/268（本来正常）| 未改动 |

> 光环默认仍然**不描边**（`outlineSkipPattern: "Halo"`）—— 那是另一个独立问题：
> 薄板 + DoubleSide 的反壳会戳穿自身造成闪烁，与法线无关。

### 根位移：对象级抵消，不要改写动画轨道 ★

**默认 `stripRootMotion: "compensate"`** —— 把根位移在**对象层**抵消：动画照常播放，
每帧读出根骨骼相对 `modelRoot` 的位移，把 `modelRoot` 反向偏移。

#### 为什么不能改写动画轨道

旧做法（压平 `Bip001` / `bone_root` 的 position 轨道）有致命副作用：
那些**挂在模型根下、不随骨架移动**的道具会和身体分家。实测：

| 模型 | 现象 |
|---|---|
| `Natsu.glb` 牛奶盒 | 从嘴边（57% 身高）跑到**头顶**（90%）|
| `Airi.glb` 冰激凌 | 同样跑到头部 |

而且这个坑很深：`Airi.glb` 的链上**只有 `Bip001.position`**（没有 `bone_root`），
所以连"只压最外层"也救不了它。

#### 新方案实测

| | 根骨骼世界摆动 | 道具距手 |
|---|---|---|
| Natsu `Vital_Death` | 0.539 → **0.000** | 0.24 → **0.24**（不变）|
| Hoshino `Exs_Root` | 3.010 → **0.000** | 0.42 → **0.42**（不变）|
| Airi `Exs` | 0.392 → **0.000** | 0.43 → **0.43**（不变）|

**根位移彻底消除，同时一根骨骼都没碰** —— 道具自然还挂在动画安排的位置上。

#### 两个实现细节

1. **用「相对 modelRoot 的局部坐标」而不是世界坐标** —— 世界坐标里含上一帧的补偿量，
   会形成自反馈（抬起→判定不需要→落回→再抬起）。`worldToLocal` 会把 `modelRoot`
   自身的平移除干净，天然无反馈。
2. **局部增量要乘回模型缩放** —— `worldToLocal` 会**除以** `modelRoot.scale`
   （归一化后通常 1.3~1.8），不乘回去只能抵消 1/scale，实测剩余 45~55% 摆动。

只抵消水平(X/Z)，**保留竖向** —— 跳跃/倒地的上下位移是动作本身要表达的。

> Hoshino 的 `Exs_Root` 原始根位移高达 **3.01 单位**（角色才 2 单位高），
> 是最需要这个机制的动作。

**按动作控制网格显隐**：盾牌/武器只在特定动作里出现时用它（见下方说明） |
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
| `autoConfig` | boolean | `true` | 未显式给配置时，自动加载与模型同名的 .json（详见「自动加载同名配置」一节）|
| `shading` | `"pbr"` \| `"cel"` \| `"unlit"` | **`"cel"`** | `pbr`（原始）\| `cel`（卡通，默认）\| `unlit`（无光照）|
| `celSteps` | number | `2` | 卡通明暗分档数（**2 = 只有受光/阴影两级** → 除阴影外就是平的；4 以上回到多级梯度）|
| `celDark` | number | `0.80` | 卡通最暗档亮度（1.0 = 全亮）；**越小阴影越深**，0.80 = 只淡一档 |
| `celShadowMin` | number | `0.3` | **投射阴影里保留多少主光**：0 = 原来的硬阴影，1 = 完全没有投射阴影（仅卡通模式）|
| `shadowNormalBias` | number | `0.02` | 沿法线推开阴影采样（保持原值）|
| `shadowBias` | number | `-0.0003` | 阴影深度偏移（保持原值）|
| `celFaceShadowMin` | number \| `null` | `null` | **面部单独的投射阴影浓度**（`null` = 跟随 `celShadowMin`）。比全局小 = 脸影更清晰；`0` = 满强度硬影 |
| `celShadowTint` | `[r,g,b]` \| `null` | `null` | 卡通暗部色调（0~1），如 `[0.72,0.62,0.85]`；`null` = 只变暗不变色 |
| `celFaceLight` | boolean | `false` | **面部光照修正**：脸/眼/眉法线强制朝向摄像机 |
| `celFacePattern` | string | `Face\|EyeMouth\|Eyebrow\|Mouth` | 哪些材质名算「脸」（正则片段）|
| ~~`faceNoShadow`~~ | — | 派生 | **已改为派生字段，不再单独配置**：由 `celFaceShadowMin`（未设则 `celShadowMin`）决定，**≥0.95 视为没有面部阴影** |
| `outlineSkipPattern` | string \| `null` | `"Halo"` | 这些材质名不描边（薄板反壳会戳穿自身 → 闪烁）|
| `hideOptional` | boolean | `true` | **GLB 标了 `extras.optional` 的部件默认隐藏**，只有动作真的驱动它时才显示 |
| `hideByBoneScale` | number | `0.5` | **按骨骼缩放隐藏道具**：网格骨架里所有骨头缩放都小于此值时视为隐藏；`0` = 关闭 |
| `lightingScale` | number | `1` | 打光预设的**整体亮度倍率**（运行时可用 `viewer.setLightingScale(x)` 实时调）|
| `hideParts` | string \| `null` | `null` | 直接隐藏匹配的网格（正则片段，匹配网格名或材质名）|
| `attachProps` | array \| `null` | `null` | 把脱落的道具骨骼挂到角色骨骼上 —— **实测不可靠**，优先用 hideParts |
| `noCastPattern` | string \| `null` | `null` | **不投影的材质名**（正则片段），如 `"Hair"`。配合 `faceNoShadow: false` 可做到「脸保留自阴影、但刘海不在脸上投影」|
| `outline` | boolean | `true` | 反壳描边开关 |
| `outlineThickness` | number | `0.002` | 描边粗细 |
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

## 七、`animation` —— 默认动作与外部动画

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `name` | string | 不配 → **在名字含 `idle` 的动作里随机** | 初始动作 |
| `clips` | array | `[]` | **外部 Unity `.anim` 列表**（FBX 通常不自带动画）。每项 `{ url, name?, group? }`，相对路径同样按配置文件所在目录解析 |
| `axisFix` | boolean | `true` | 外部 `.anim` 的坐标转换（Unity 左手 → three 右手）。模型轴向不一致时设 `false` |
| `humanoid` | string \| object | `null` | **Humanoid 肌肉换算表**（URL 或内联对象）：Unity 侧脚本一次性量出「每条肌肉 → 哪根骨骼 · 什么轴 · 每单位多少度」✓ 有它 ⇒ 只含肌肉曲线的 `.anim` 也能播 |
| `rootMotion` | bool | `true` | **根运动**（Humanoid 片段里的 `RootT` / `RootQ`）：把片段的位移与转身叠到角色身上 ✓ 关掉则只播骨骼动作、角色原地不动 |

匹配规则（依次尝试）：**精确名字 → 忽略大小写精确 → 名字包含（忽略大小写）**。
所以 `"CH0273_Cafe_Idle"` 和简写 `"Cafe_Idle"` 都能命中。

**Humanoid 动作需要换算表**：肌肉值的解算依赖 Avatar，而 Avatar **不落盘**（实测 melano.fbx.meta 里没有任何映射字段）
⇒ 用 Unity 侧脚本一次性量出来：选中角色 → `Tools ▸ BA3D ▸ 导出 Humanoid 肌肉换算表（JSON）`，
把生成的 JSON 放到模型目录，并在这里填 `"humanoid": "./humanoid-muscles.json"`。解算公式是「零姿势 × ∏ 单轴旋转」，
与脚本的自检公式**逐字相同** —— 脚本会报告最大角度误差（≈0 即精确）。
表是**按角色**的，换角色要重导。

**两种让舞蹈动起来的方式**：
· **烘焙**（最精确）：Unity 里 `Tools ▸ BA3D ▸ 把选中的 Humanoid .anim 烘成变换曲线` ⇒ 生成 `*_transform.anim`，
  由 Unity 用 Avatar 精确解算（含脚部 IK），导入后逐帧一致；脚本已自动瘦身，一个舞通常几 MB 而不是几百 MB；
· **直读 `.anim`**（方便）：配上 `humanoid` 换算表即可直接播，
  片段的位移与转身（`RootT` / `RootQ`）也会自动叠上 ✓。

### 7.1 外部 Unity `.anim`

Unity 工程里的 FBX 通常**不带动画** —— 动作与表情都是独立的 `.anim`（AnimationClip，YAML 文本）。
查看器直接读它们，并按曲线类型分流：

| `.anim` 里的内容 | 支持 | 落到 three 的 |
|---|---|---|
| `blendShape.<名字>` | 是 | `morphTargetInfluences[i]`（表情） |
| `m_IsActive` / `m_Enabled` | 是 | `visible`（换装与部件显隐，按阶跃插值） |
| `m_LocalPosition` / `m_LocalRotation` / `m_LocalScale` / `localEulerAnglesRaw` | 是 | `position` / `quaternion` / `scale`（骨骼动画） |
| **Humanoid 肌肉曲线**（`Chest Twist Left-Right` 这类） | 否 | 无 —— 肌肉值是相对 Avatar T-pose 的，而 Avatar 映射不在 `.anim` 里 |
| `RootT` / `RootQ`（Humanoid 根运动） | 否 | 无 |
| `m_PPtrCurves`（贴图与材质切换） | 否 | 无 |

**含不支持曲线的片段会被整体跳过**（不做「半套用」—— 否则身体停在绑定姿势、只有表情在动，
观感是错的）。跳过时控制台会写明是哪一类、各多少条。

两个前提，缺一不可：

- **表情要求模型自带 blendShape**：GLB 可以；**FBX 不行** —— three 的 FBXLoader 不解析 FBX 的
  BlendShape 段 ⇒ FBX 模型上只有「显隐」与「变换」两类 `.anim` 能生效。
- **Humanoid 动作要求 Avatar**：`.anim` 里只存归一化的肌肉值，骨骼映射在 Avatar（工程设置）里，
  浏览器端拿不到 ⇒ 这类片段无法解算。

**Humanoid 动作的正解**：在 Unity 里把片段**烘成变换曲线**（逐帧采样每根骨骼的 `local*`，另存为
`<原名>_transform.anim`）⇒ 那种片段查看器**能直接播**（含 `m_LocalRotation.x/y/z/w` 分量写法 ✓）；
也可以改用 FBX Exporter 让动画随 FBX 一起导出（零转换）。
肌肉值本身在浏览器端无解 —— 解算要 Avatar。

```jsonc
"animation": {
  "name": "Melano_DefaultFace",                              // 初始动作（可选）
  "clips": [
    { "url": "./anim/Facial/Melano_smile.anim", "group": "face" },
    { "url": "./anim/Gimmick/shoes_ON.anim",    "group": "parts" }
  ]
}
```

`group` 只是给调用方（选单、内嵌页）分类用的标签，查看器不依赖它。
`getAnimations()` 会额外返回每段的 `overlay` / `kind`（`body` / `face` / `parts`）/ `source`：
**表情与换装属于 overlay** —— 播放它们**不会**打断当前身体动作（Unity 里同样是叠加的）。

### 7.2 声明式相机（顶层键 `camera`）

想让 `?config=` 直接复现 Unity 场景的取景（而不是由查看器自动取景）时用它。
**各项按 Unity 的单位填**，换算交给查看器：

```jsonc
"camera": {
  "position": [0, 1.1, 1],      // Unity 相机位置
  "target":   [0, 1.1, 0],      // 对准点
  "fov":      26.9914,          // 相机 FOV（度）
  "unityModelHeight": 1.2477    // 该模型在 Unity 里的真实高度
}
```

`unityModelHeight` 是换算的关键：查看器载入时把模型归一化到 `targetHeight`（默认 2），
所以相机各项会整体乘 `K = targetHeight / unityModelHeight`。
**等比缩放不改变 FOV 下的画面构成** ⇒ 这样得到的就是 Unity 的取景。
不填它则 `K = 1`，相机值按查看器当前空间解释。

---

## 八、HTML 侧怎么用

**纯 HTML 内嵌**（属性写在容器上）：

```html
<div data-ba3d
     data-ba3d-config="./assets/sample.json"
     data-ba3d-drag
     style="width:420px;height:430px"></div>

<script type="module">
  import { autoMount } from './dist/3d-viewer.min.js';
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
index.html?config=./assets/fallback.json
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

**按动作控制网格显隐 `visibilityRules`**：有些模型的盾牌/武器**只在特定动作里出现**，
但 GLB 的动画数据里并没有"隐藏"这件事 —— 实测 `Hoshino_Original` 的盾牌绑在 `bone_shield_root` 上、
缩到 0 确实会消失，可 42 段动画里它的 scale 只在 `[0.70, 1.00]`，**没有任何一段去缩它**。
那是游戏引擎按动作配置的显隐，只能用规则补：

```jsonc
"renderer": {
  "visibilityRules": [
    // 三种写法任选一种：
    { "mesh": "Shield", "clipContains": "Shield" },              // 动作名含 Shield 时显示
    { "mesh": "Shield", "clips": ["Hoshino_Original_Shield_A"] },  // 精确列出动作名（**完全匹配**）
    { "mesh": "Shield", "always": true }                         // 一直显示（强制恢复）
    // 都可以加 "invert": true 取反
  ]
}
```

> 为什么不能靠"盾牌有没有移动"来判断（实测数据）：`Hoshino_Original` 里盾牌是**常驻挂在手臂骨骼**上的，
> 手臂一动它相对角色就有位移 —— 4 段 Shield 动作反而**位移恰好是 0**（举得很稳），
> 而 `Exs_Cutin` 位移 0.011 最大。位移会判反；骨骼缩放在那 4 段也恒为 1.0。
> 数据里没有可靠信号，所以只能靠命名约定或显式列表。

含义：网格名匹配 `/Shield/i` 的，只在**动作名包含** `Shield` 时显示，其余动作隐藏。
`mesh` / `clipContains` 是正则片段（`clipContains` 为**子串**匹配），`clips` 则是**完全匹配**（整个动作名必须等于列表里的一项，忽略大小写）；可选 `"invert": true` 反向（只在不含时显示）。
不配则完全不干预显隐（默认）。

没配规则但检测到"网格名和部分动作名同含 shield/weapon"时，加载会在控制台给出一条可直接抄的提示。

**默认口型 `mouthCell`**：有些模型的 GLB 里**完全没有嘴部动画数据**
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


---

## lilToon 描边（Outline）

对着色器 = `lilToon` 生效。对应 lilToon 的 `_Outline*` 系列参数。

```jsonc
"lilToon": {
  "outline": {
    "enable": false,                  // _UseOutline —— 总开关
    "color": [0.6, 0.56, 0.73, 1.0],  // _OutlineColor（第 4 位是透明度）
    "tex": null,                      // _OutlineTex（贴图 URL、暂未接加载）
    "width": 0.08,                    // _OutlineWidth（内部 ×0.01）
    "widthMask": null,                // _OutlineWidthMask（URL、取 .r 通道）
    "fixWidth": 0.5,                  // _OutlineFixWidth
    "fixWidthMode": "lilToon",        // 'lilToon' | 'screen'（见下）
    "vertexR2Width": 0,               // _OutlineVertexR2Width：0 不用 / 1 用 R / 2 用 A（并把 RGB 当法线）
    "zBias": 0.0,                     // _OutlineZBias
    "cull": "back",                   // 'back'（默认、只画背面）| 'front'
    "skipPattern": "mouth",           // 不做描边的网格名（正则、不区分大小写）
    "litColor": [1.0, 0.2, 0.0, 0.0], // _OutlineLitColor（alpha=0 表示不受光、暂未实现）
    "litScale": 10.0,                 // _OutlineLitScale
    "litOffset": -8.0                 // _OutlineLitOffset
  }
}
```

### 宽度的语义

```
世界描边粗细 = width × 0.01 ÷ 网格世界缩放 × 网格世界缩放 = width × 0.01
```

代码里做了**按网格世界缩放归一化**、所以 `width` 的物理含义与模型缩放无关。
（Unity 里 1 单位 = 1 米、角色约 1.5、所以 width 0.08 对应约 0.8 毫米、很细）

**⇒ 面板上「宽度」的范围是 0 ~ 10、步长 0.01**。

### fixWidthMode

lilToon 原版是：

```hlsl
outlineWidth *= lerp(1.0, saturate(length(headDirection)), _OutlineFixWidth);
```

`saturate` 把距离**截断在 1.0**、而相机距离通常远大于 1。
**⇒ 原版里 `_OutlineFixWidth` 拉 0 还是 1 结果完全一样、参数实际失效**。

| 值 | 行为 |
|---|---|
| `'lilToon'`（默认）| 保留 saturate、**完全对齐 lilToon** |
| `'screen'` | 去掉 saturate、`fixWidth=1` 时**描边屏幕粗细恒定**（缩远不变细）|

面板上对应「固定宽度生效（去掉 saturate）」复选框。

### skipPattern

**只匹配网格名**、不匹配材质名也不匹配路径。

原因：材质常常被多个网格共用、按材质匹配会误伤一片。

```jsonc
"skipPattern": "mouth|eye"            // 名字里含 mouth 或 eye 的网格不描边
"skipPattern": "^CH0155_Body_4_Mouth_Split$"   // 精确匹配
```

**用「部件」面板可以看到每个网格的真实名字**、（悬停显示层级路径与材质名）

### 与旧描边的互斥

开启 lilToon 描边时、内置的 `OutlineEffect`（HUD 的「描边」按钮）会**自动让位**。
两者不会叠加。

**FBX 模型**：内置描边对 FBX 一律不生效（反壳实现对其坐标系敏感）。
但 **lilToon 描边对 FBX 是正常工作的**。

---

## 部件面板

HUD 上的 **[部件]** 按钮、列出模型所有网格。

| 元素 | 作用 |
|---|---|
| 复选框 | 显示 / 隐藏该部件 |
| 名字（点击）| **只看这个**（再点一次恢复全部）|
| 三角形数 | 该网格的面数（k = 千）|
| 材质名 | 便于判断某个部件在哪 |
| 🔓 / 🔒 | **锁定**该部件的可见性 |

### 锁定语义（记忆 ≠ 冻结）

| 状态 | 用户勾选/取消 | 自动逻辑* |
|---|---|---|
| 🔓 未锁定 | 立即生效 | **可能被改回去** |
| 🔒 已锁定 | 立即生效 **并更新锁定值** | **不动它** |

\* 自动逻辑包括：`hideParts`（正则隐藏）`hideOptional`（按动作隐藏可选部件）
`hideByBoneScale`（道具被缩小到体内时隐藏）

**[全显] / [全隐] 会同时锁定所有部件**、否则自动逻辑会让某些部件又冒出来。

### API

```js
viewer.listMeshes()                       // 列表（含 path / material / triangles）
viewer.setMeshVisible('CH0155_Body/CH0155_Body_4', false)
viewer.setAllMeshesVisible(true)
viewer.isolateMeshes(['CH0155_Hair'])     // 只看这些、传 [] 恢复全部
viewer.setMeshLocked('CH0155_Hair', true) // 锁定为显示、传 null 解锁
viewer.getMeshLocks()
viewer.debugTree()                        // 完整层级（排查用）
```

---

## 贴图匹配规则

FBX 里的贴图路径常常与实际文件对不上、按下面的顺序匹配。

1. **完整 URL 精确匹配** `textureMap`
2. **去掉查询串后匹配**
3. **文件名匹配**
4. **★ 主文件名匹配**（去扩展名、忽略大小写）
   —— 例如 FBX 请求 `Body.psd`、你上传的是 `Body.png`、**能匹配上**。
5. **`.psd` 自动改写**：按 `../TEX/`、`TEX/`、`../Textures/`、`Textures/`、`./` 依次尝试同名 `.png`

**空贴图会被置为 `null`**、避免"采样纯黑导致模型全黑"。

> ⚠️ 本项目修改了 `vendor/three/loaders/FBXLoader.js` 的 `.psd` 分支：
> 原版会造一个 `new Texture()` 占位、而**空贴图在 three 里采样是纯黑**、会让整个模型变黑。
> 改成当普通图片请求、交给上面的 URL 改写处理。

---

## lilToon 预设

面板（着色器 = lilToon 时可用）顶部下拉、19 个官方预设。
数据来自 `lilToon/Presets/*.asset`、内联为 `LIL_PRESETS`。

```js
viewer.getLilPresets()
viewer.applyLilPreset('Skin-Anime')   // 或 'Hair-OutlineRimLight' / 'Inorganic-Metal (MatCap)'
```

**套用时会自动**：
1. 切到 `shader = 'lilToon'`
2. **先把 Rim / MatCap / 自发光 的 blend 清零**、避免上一个预设的特性残留。
3. 套用预设字段、重建材质。

⚠️ 预设里的 `outline.enable` **一律是 false**。
lilToon 官方预设的 `_UseOutline` 全是 0、即"是否描边"由美术按材质手动勾、预设只提供数值。

⚠️ **官方预设是按材质使用的**（皮肤材质套 Skin-*、头发套 Hair-*）。
当前的实现是全局的、按材质覆盖的方案见 `LILTOON1.x.md` 第 9 节。

---

## 顶点色工具

lilToon 的遮罩读的是**顶点色的 RGB 三通道**。

```
R → MatCap 权重
G → Rim 权重
B → 自发光权重
```

```js
viewer.showVertexColors(true)   // 把顶点色当颜色渲染（无光照无贴图）
viewer.vertexColorInfo()        // 每个网格的 min/max/均值/是否全白
```

HUD 上的 **[顶点色]** 按钮 = 前者、并会打印后者。

**没有顶点色的模型**：遮罩恒为 1、三个效果全区域生效、（代码里用 `#ifdef USE_COLOR` 自动回退）

---

## 描边受光（_OutlineEnableLighting / _OutlineLitColor）

严格照 lil_common_frag.hlsl:371-380：

    litCol  = _OutlineLitApplyTex ? col.rgb * _OutlineLitColor.rgb : _OutlineLitColor.rgb
    litF    = saturate( NdotL * _OutlineLitScale + _OutlineLitOffset ) * _OutlineLitColor.a
    col.rgb = mix( col.rgb * _OutlineColor.rgb, litCol, litF )

| 配置 | lilToon 参数 | 面板控件 |
|---|---|---|
| litEnable | _OutlineEnableLighting | 受光生效（复选框）|
| litColor | _OutlineLitColor（RGB + alpha）| 受光色 + 受光强度 |
| litScale | _OutlineLitScale | 受光对比 |
| litOffset | _OutlineLitOffset | 受光阈值 |
| litApplyTex | _OutlineLitApplyTex | 受光色乘描边贴图（复选框）|

### 默认不受光

_OutlineLitColor.a 默认是 0，所以 litF = 0，结果就是「贴图 × 描边色」。
**这个功能默认完全不影响观感**，只有把「受光强度」调大才生效。

### 光源方向

每帧从**主光的实际世界位置**算方向，传进 uOutlineLitDir。
所以换打光预设（白昼 / 傍晚 / 黑夜）时描边的受光方向会跟着变。

### 法线来源

顶点着色器里用 objectNormal，它在 three 的 skinnormal_vertex 之后**已经被蒙皮过**，
再乘 mat3(modelMatrix) 得到世界空间法线。

---

## 描边贴图（_OutlineTex / _OutlineWidthMask）

| 配置 | lilToon 参数 | 说明 |
|---|---|---|
| tex | _OutlineTex | 描边贴图，用纹理给描边上色 |
| widthMask | _OutlineWidthMask | 宽度遮罩，**取 R 通道** |

面板上用「选择文件」按钮（本地图片走 blob URL，也可以用 JSON 配置给相对路径）。

### 宽度遮罩的用法

    白色（R=1） -> 满宽描边
    黑色（R=0） -> 没有描边

**这是 lilToon 处理「局部不要描边」的正统做法。**
比如嘴巴和头共用同一个网格时，skipPattern（按网格名）就无能为力，
这时给一张遮罩图、嘴部画黑，就能精确到像素。

贴图按 URL 缓存，加载完成后自动重新应用描边（不用手动刷新）。
加载失败会输出 [outline] 贴图加载失败：...（warn 级别，始终可见）。

---

## 详细日志开关

HUD 上的 **详细日志** 复选框，设置保存在 localStorage，刷新后保持。
它控制 window.__ba3dDebugUI，影响三类诊断输出：

| 输出 | 受它控制 |
|---|---|
| 阴影自检表格（每次加载一张 console.table）| 是 |
| syncRenderUI 的判定输入打印 | 是 |
| [lilPanel] 已打开，控件 N 个 | 是 |
| viewer.js 里的 21 处 console.debug | **否** —— 受 DevTools 的 Verbose 级别控制 |

平时控制台应该只剩一行：

    [viewer] 加载完成 | 模型=... | 网格=11 | 描边=true

console.warn / console.error 始终可见（真异常才出）。

---

## 配置面板覆盖与导出

面板能改的（着色器 = lilToon 时）：

    预设     19 个 lilToon 官方预设
    分档     浓度 / 第一层边界·过渡 / 第二层边界·过渡 / 第三层边界·过渡 / 第三层开关 / 颜色
    Rim      强度 / 边界 / 过渡 / 菲涅尔 / 受光方向 / 颜色 / 背光色
    MatCap   强度 / 贴图文件
    自发光   强度 / 颜色
    背光     强度 / 指向性
    描边     启用 / 宽度 / 固定宽度 / 顶点色当宽度 / Z 偏移 / 固定宽度生效 /
             描边颜色 / 不透明度 / 受光色 / 受光强度 / 受光对比 / 受光阈值 /
             描边贴图 / 宽度遮罩 / 受光生效 / 受光色乘贴图 / Cull 模式 / 跳过部件

**描边的 16 个配置字段全部有控件。**

HUD 的 **[导出 JSON]** 生成只含与默认值不同项的配置。描边参数在 lilToon.outline 下。
导出用的是递归 diff，等于默认值的字段会省略。

---

## 描边外扩方向贴图（_OutlineVectorTex）

用贴图覆盖描边的外扩方向（手绘描边）。

| 配置 | lilToon 参数 | 面板控件 |
|---|---|---|
| vectorTex | _OutlineVectorTex | 外扩方向（选择文件）|
| vectorScale | _OutlineVectorScale | 方向强度（-10 ~ 10）|
| vectorUVMode | _OutlineVectorUVMode | 方向 UV（UV0 ~ UV3）|

贴图按**切线空间**法线解算，再经 TBN 转到对象空间（lil_common_functions.hlsl:272）。

### 与 Unity 的差异（重要）

three 的 MeshBasicMaterial 只有在几何体带 tangent 属性时才有 objectTangent。
所以：

    #ifdef USE_TANGENT   → 真实 TBN，与 Unity 一致
    #else                → 用「法线 + 任意正交轴」近似，与 Unity 会有差异

这个 fallback 是 three 的几何数据限制，不是可以绕过的。

---

## 描边受光接收阴影（_OutlineLitShadowReceive）

描边受光时是否被主光的阴影遮挡。

| 配置 | lilToon 参数 | 面板控件 |
|---|---|---|
| litShadowReceive | _OutlineLitShadowReceive | 受光接收阴影（复选框）|

### 为什么是自己算的

lilToon 里就是 outlineLitFactor *= fd.attenuation（乘光照衰减）。
但在 three 里，MeshBasicMaterial **拿不到阴影数据**：

    three 只在 materialProperties.needsLights 为真时赋值
    directionalShadowMap / directionalShadowMatrix（three.module.js:30062~30088），
    而 materialNeedsLights() 的白名单里没有 MeshBasicMaterial。

实测（探针日志）：描边材质里 directionalShadowMatrix 始终不存在，
vDirectionalShadowCoord 算出来全 0，getShadowMask() 恒返回 1。

所以改成**自己算**：

    每帧（updateLilOutlineCamera）从 keyLight.shadow 取：
      biasM = 0.5 偏移 + 0.5 缩放的矩阵（把 NDC 映射到纹理空间 [0,1]）
      uOutlineShadowMatrix = biasM × shadow.camera.projectionMatrix × matrixWorldInverse
      uOutlineShadowMap    = keyLight.shadow.map.texture
      uOutlineShadowBias   = keyLight.shadow.bias
      uOutlineShadowMapSize= keyLight.shadow.mapSize

    顶点：vOutlineShadowCoord = uOutlineShadowMatrix × modelMatrix × vec4(transformed, 1.0)
    片元：ba3dOutlineShadow() 做 4 次 PCF 采样（unpackRGBAToDepth + step）
          返回 1 = 受光、0 = 全阴影，然后 ba3dLitF *= 它

完全绕开 three 的材质系统，也不依赖任何 three 的阴影 chunk。

### 面板上的诊断开关

「阴影遮罩预览（诊断）」= litShadowDebug，作用与 litShadowReceive 相同但
用于排查（会强制应用阴影遮罩，方便看管线是否接通）。

---

## 描边色的相乘开关

lilCfg.outline.shaderColorMult（默认 false）：

    false → 描边色只由 mat.color 乘一次（正确，受光色纯净）
    true  → 着色器里再乘一次 uOutlineColor（受光色会被描边色染暗，对照旧行为用）

面板上对应「着色器里再乘一次描边色」复选框。

---

## 按材质配置（lilToonByMaterial）

lilToon 的预设本来是**每个材质槽各选一个**（皮肤套 Skin-*、头发套 Hair-*），
所以配置也按材质分开。见 LILTOON1.x.md 第 9 节的设计。

### 数据结构

    lilCfg                      全局默认（面板选「全部（默认）」时改它）
    lilCfgByMaterial = {        按材质名覆盖（稀疏，只存改过的键）
      'CH0155_Hair_Toon': { shadowBorder: 0.05, rim: { blend: 1 } },
      'CH0155_Milk_Toon': { matcap: { url: 'blob:...' } },
    }

### 生效方式

    function lilCfgFor(mat) {
      const nm = mat && mat.name;
      if (!nm || !lilCfgByMaterial[nm]) return lilCfg;
      return mergeLilCfg(lilCfg, lilCfgByMaterial[nm]);
    }

mergeLilCfg 做**一层深合并**（嵌套对象如 outline / rim / matcap 逐字段合并），
其余直接覆盖。

### 生效点

    patchToonMaterial(mat) 里：
      const __cfgM = lilCfgFor(mat);
      celGradientGLSL(__cfgM, celCfgFor(mat))     // 分档
      lilShaderGLSL(__cfgM)                       // Rim / MatCap / 自发光 / 背光
      resolveMatCapTexture(__cfgM.matcap.url)     // MatCap 贴图

    applyLilOutline() 里按网格的材质名解析描边配置（带缓存）：
      const o = _mn0 ? resolveFor(_mn0) : oGlobal;

### cacheKey（关键）

    mat.customProgramCacheKey = () =>
      'ba3d-cel:' + celProgramVersion + ':' + shaderMode + ':' + (mat.name || '')
      + ':v' + lilMaterialVersion;

两个坑：
  ① 必须带**材质名**，否则不同材质的程序会被复用，参数就串了。
  ② 必须**无条件**带 lilMaterialVersion。
     曾经写成「有覆盖才带版本号」，但「有没有覆盖」是打补丁那一刻的判定，
     之后才给某个材质加覆盖的话 key 不变 → three 既不重编也不重建，
     表现就是「设了没反应」。

### 面板

    [● lilToon 参数]                    ← 标题栏（拖拽把手）
    ─────────────────
    材质  [ 全部（默认）▾ ]  [清除覆盖]
          选「全部」改全局；选某个材质只覆盖它（带 ● 表示已有覆盖，面板显示合并后的值）
    预设  [（不套用 ▾）]                ← 套到上面选中的材质

面板里 40 多处调用通过薄封装自动带上当前材质：

    const lilG  = (m) => viewer.getLilConfig(m === undefined ? lilCurMat() : m);
    const lilS  = (p, m) => viewer.setLilConfig(p, m === undefined ? lilCurMat() : m);
    const lilOG = (m) => viewer.getLilOutline(m === undefined ? lilCurMat() : m);
    const lilOS = (p, m) => viewer.setLilOutline(p, m === undefined ? lilCurMat() : m);

⚠️ 全局替换这 4 个 API 名时，**封装函数自己也会被替换**，导致自递归
   （同一个坑在 lilApplyPreset 上又踩了一次）。改完必须检查定义本身。

⚠️ lilCurMat() 要回退到 window.__ba3dLilMat：
   buildLilPanel() 会先 lilPanel.innerHTML = '' 清空面板，
   此时选择器元素还没重建，只看 DOM 会读成「全局」。

### API

    viewer.getLilConfig(matName)              // 合并后的值
    viewer.setLilConfig(partial, matName)     // 写全局或某材质
    viewer.getLilOutline(matName)
    viewer.setLilOutline(o, matName)
    viewer.applyLilPreset(name, matName)
    viewer.getLilMaterials()                  // 模型里的材质名列表
    viewer.getLilCfgByMaterial() / setLilCfgByMaterial(obj)
    viewer.clearLilMaterialOverride(matName)

### 导出

    {
      "lilToon": { /* 全局默认 */ },
      "lilToonByMaterial": { "CH0155_Hair_Toon": { "shadowBorder": 0.05 } }
    }

导出仍然按默认值做递归 diff，只写变了的项。

### 按材质的覆盖范围（全部支持）

    阴影分档（浓度 / 每层边界·过渡 / 每层颜色 / 第三层开关）
    Rim（强度 / 边界 / 过渡 / 菲涅尔 / 颜色 / 背光色）
    MatCap（强度 / 边界 / **贴图**）
    自发光（强度 / 颜色）
    背光（强度 / 指向性）
    描边 20 个参数（含描边贴图 / 宽度遮罩 / 外扩方向）

MatCap 贴图以前只有全局一张（lilMatCapTex 单变量），现已改为
resolveMatCapTexture 按 URL 缓存 + 按材质取 uniform。

---

## 浮层面板：标题栏与拖拽

三个面板（#lilPanel / #exportPanel / #partsPanel）是 .lp 元素，
自定义模型（#upload）是独立容器。每个都有标题栏：

    [● lilToon 参数]        ← 标题与打开它的按钮文字一致
    [● 导出 JSON]
    [● 部件]
    [● 自定义模型（本地文件，不会上传到任何服务器）]   ← 用 .u-title

### 拖拽

按住标题栏拖动面板。要点：

  · 监听挂在**面板本身**（事件委托），不挂在标题元素上
    —— lilToon 面板每次打开/改预设都会 innerHTML = '' 重建，挂在标题上会失效。
  · 把手识别顺序：指定选择器 > .lp-title > .u-title > h4
  · 面板原本是 right:16px + top:16px 定位，拖动时切成 left/top。
  · 拖出窗口时夹紧（Math.max(4, ...) / Math.min(innerWidth - w - 4, ...)）。
  · 窗口 resize 后面板若在视口外，自动拉回右对齐。

### 标题栏样式统一

.lp-title 与 #upload .u-title 用同一套视觉：

    蓝点（7px, #3d6fe0）+ 12.5px / 600 / #c3ccdd + 底部分隔线 rgba(255,255,255,.09)
    cursor: move（拖动时 grabbing）

.lp-title 还多了 position: sticky（滚动时吸顶）与负外边距（贴满面板顶部）。

### 面板宽度

    .lp        400px（原 320px），overflow-x: hidden（不要左右滚轮）
    .lp.parts  340px（原 300px）

---

## lilToon 阴影系统（阶段 1 超纲项 + 观感调优）

### 参数总表

| 配置 | lilToon 参数 | 说明 |
|---|---|---|
| shadowStrength | _ShadowStrength | 分档浓度，**范围 0~2**，>1 靠 mix 外推继续压暗 |
| shadowBorder / shadowBlur | _ShadowBorder / _ShadowBlur | 第一层边界 / 过渡 |
| shadow2ndBorder / shadow2ndBlur | _Shadow2ndBorder / _Shadow2ndBlur | 第二层 |
| shadow3rdBorder / shadow3rdBlur | _Shadow3rdBorder / _Shadow3rdBlur | 第三层 |
| shadowBorderRange | _ShadowBorderRange | 只把过渡带下沿往阴影侧推（lil_common_functions.hlsl:33）|
| shadowMainStrength | _ShadowMainStrength | 阴影侧再乘一次主色（lil_common_frag.hlsl:1024）|
| shadowReceive / shadow2ndReceive / shadow3rdReceive | _ShadowReceive 等 | 每层是否接收**实时投射阴影**（:872-876）|
| shadowColor / shadow2ndColor / shadow3rdColor | _ShadowColor 等 | 每层颜色 **+ alpha** |
| shadowAmbient | （three 专属、lilToon 没有）| 阴影区保留多少环境光 |

### ★ 三层颜色的 alpha 就是「这一层多强」

lilToon：lns.y = _Shadow2ndColor.a - lns.y * _Shadow2ndColor.a（:1013）
所以 alpha = 0 表示**关闭该层**。

⚠️ 踩过的坑：第一版只取 RGB、忽略 alpha、于是
     "shadow2ndColor": [0, 0, 0, 0]（官方预设里表示「第二层关闭」）
   被当成了「纯黑满强度」、19 个预设里有 11 个是这种、全都暗得离谱。

现在的实现：
    outCol = mix( outCol, shadowColor, s1 * alpha1 );
    outCol = mix( outCol, shadow2ndColor, s2 * alpha2 );
    outCol = mix( outCol, shadow3rdColor, s3 * alpha3 );

面板上每行三个控件：颜色 / alpha 滑杆 / alpha 数字框。

### ★ shadowAmbient（three 专属）——「环境光地板」

three 的 toon 把环境光**单独加在分档之外**：

    irradiance  = ambient + lightProbe + 分档 * directLight

而 lilToon 的 indirectCol 是**整体替换**（含环境光）。
所以我们的阴影有个地板、光越强、受光面越亮、阴影区不跟着变。
相对对比度被稀释、表现就是「光照强的时候阴影反而不够明显」。

解法：在 lights_fragment_begin **之后**（lights_fragment_end 之前）

    reflectedLight.indirectDiffuse *= mix( shadowAmbient, 1.0, ba3dShadowMaskG );

    shadowAmbient = 1.0 → 不削减（默认、行为不变）
    shadowAmbient = 0.0 → 阴影区完全没有环境光（最深）

要接近 cel 模式（阴影浓淡=0 / 脸部=0）的观感、就把它调到 0~0.2。

### ★ 两套投影路径的差异（_ShadowReceive 为什么第一版不生效）

lilToon（Unity）：投影**折进分档值**，直射光不再单独乘：

    calculatedShadow = saturate( fd.attenuation + distance( fd.L, fd.origL ) );
    lns.x *= lerp( 1.0, calculatedShadow, _ShadowReceive );

three：投影在 lights_fragment_begin 里**直接把直射光砍掉**：

    directLight.color *= getShadow( directionalShadowMap[i], ... );

两条路互不相干、所以只把阴影乘进 t1/t2/t3 是没用的。

现在的做法：在 lilToon 模式里把 three 那条路**中和掉**

    getShadow(...)  →  ( getShadow(...) * 0.0 + 1.0 )  =  1.0

让投影**只经由 ba3dShadowMaskG** 进入分档。

### 三层叠加的行为（不是 bug）

三层是**顺序叠加**的、后一层会覆盖前一层：

    outCol = mix( outCol, 第一层色, s1 );
    outCol = mix( outCol, 第二层色, s2 );   // 覆盖
    outCol = mix( outCol, 第三层色, s3 );   // 再覆盖

三层边界默认 0.1 / 0.15 / 0.25、后一层**包围**前一层。
所以只调第一层的 _ShadowReceive、效果会被二三层盖掉、看不出来。
想整体关投射阴影、三个都要调 0。

### 浓度可以超过 1

mix 的 t 超过 1 时是**外推**：

    mix( vec3(1.0), outCol, 1.5 ) = 1 + 1.5 * ( outCol - 1 )   ← 比阴影色更暗

这是为了绕过上面那个「环境光地板」、滑杆范围 0~2。

### 「（重置为默认）」预设

预设下拉里的特殊项：

    选「全部（默认）」→ 把整份 lilCfg 恢复成 LIL_DEFAULTS
    选了某个材质      → 删掉该材质的覆盖（回到全局默认）

---

## Dissolve（阶段 2）

### 阶段 2 的四项里，三项本来就已经完成

| # | 项 | 状态 |
|---|---|---|
| 5 | 描边升级（自建反壳 + 宽度贴图 + 顶点色控制）| 早已完成、applyLilOutline() |
| 6 | 装饰层混合模式（Normal/Add/Screen/Multiply）| 早已完成、ba3dBlend() |
| 7 | Backlight / 逆光 | 早已完成 |
| 8 | Dissolve | **本轮实现** |

（关于 6：lilToon 1.3.7 的 _MainColor 本身没有混合模式。
  混合模式只在装饰层上、那几个已实现）

### 参数

| 配置 | lilToon | 说明 |
|---|---|---|
| dissolve.mode | _DissolveParams.r | 0=关 1=贴图阈值 2=UV 3=对象空间 |
| dissolve.linear | _DissolveParams.g | 1=线性/平面 0=圆形/球形 |
| dissolve.threshold | _DissolveParams.b | 阈值 |
| dissolve.softness | _DissolveParams.a | 边缘羽化宽度（兜底 0.001、否则除零）|
| dissolve.pos | _DissolvePos | 线性时是**方向**、圆形/球形时是**中心点**、w 仅模式 2 的旋转 |
| dissolve.color | _DissolveColor.rgb | 边缘颜色（**加色**、见 lil_common_frag.hlsl:1841）|
| dissolve.maskTex | _DissolveMask | 模式 1 的遮罩、采 .r |
| dissolve.noiseTex / noiseStrength | _DissolveNoiseMask / _DissolveNoiseStrength | 噪声扰动 |

### 注入点（两处、和 lilToon 一样）

    (1) #include <alphatest_fragment> 之前
        算遮罩 → diffuseColor.a *= maskVal
        并把边缘因子存进全局 ba3dDissolveEdge
    (2) #include <dithering_fragment>
        gl_FragColor.rgb += _DissolveColor.rgb * ba3dDissolveEdge;

（已验证：toon 片元里 alphatest 在行 37、dithering 在行 53。
  opaque_fragment 之后 gl_FragColor 才存在、所以 (2) 的位置是对的）

### 坐标归一化（我们相对 lilToon 的改动）

lilToon 直接用 _DissolvePos 的原始对象空间坐标、因为 Unity 里角色只有 1~2 单位高。
这个查看器加载的模型尺度不定、所以做归一化：

    mode 3 的求值坐标 = ( vBa3dPositionWS - center ) * vec3( 1/sizeX, 1/sizeY, 1/sizeZ )

  · **按轴**归一化（不是只按最长边）、模型映到单位立方体
    只按最长边的话、高瘦角色在 x/z 方向只占 ±0.15、球壳扫不到位。
  · 于是阈值语义：平面 ±0.5、球形 0 ~ 0.87、位置 (0,0,0) 就是模型中心。

### ⚠️ lilToon 的模式 2 线性有两份不同实现

    无噪声（lil_common_functions.hlsl:628）→ lilRotateUV( uv, _DissolvePos.w ).x
    有噪声（:675）                         → dot( uv, normalize(_DissolvePos.xy) ) + noise

前者只用一个旋转角、xy 完全用不上、对查看器来说没法猜。
后者直接 dot 原始 uv、方向为负时结果落在 [-1, 0]、阈值 > 0 就永远不成立。
模型整个消失（这是踩过的坑）

**我们统一成**：

    ba3dDissolveAlpha = dot( vBa3dUv - 0.5, normalize(pos.xy) ) + 0.5;   // 范围 0~1

居中后阈值 0~1 正好扫过整张贴图、语义和模式 3 的平面一致。

### ★ 这个功能踩了 6 个坑（都属于「两处约定不一致」这一类）

1. **异步贴图 vs 同步编译**
   GLSL 里 texture2D( ba3dDissolveMask, ... ) 是同步生成的。
   而 uniform sampler2D ba3dDissolveMask; 原来只在贴图**加载成功**后才声明。
   第一帧必然返回 null、→ undeclared identifier、编译失败。
   修法：uniform **无条件声明**、用占位贴图顶上
     遮罩占位 = 纯白（.r=1.0、等价「遮罩不生效」、和 lilToon 禁用遮罩一致）
     噪声占位 = 中灰（.r=0.5、减 0.5 后是 0、等价「没有噪声」）

2. **alphaTest 设晚了一个阶段**
   原来在 mat.onBeforeCompile 回调里赋值、那时 WebGLProgram 已经在编译。
   USE_ALPHATEST 宏早定了、alphatest_fragment 里的 discard **不生效**。
   表现：「模型变成剪影」—— alpha 被改小但不丢弃、不透明渲染下 alpha 又被忽略。
   修法：移到 patchToonMaterial 开头（回调之前）、并 mat.needsUpdate = true
   另外加了 syncDissolveAlphaTest() 挂在每次 applyLilOutline() 上
     （防止材质被复用、patchToonMaterial 不再跑、alphaTest 过期）

3. **描边壳必须一起溶解**
   溶解只作用于几何体本身、而描边是**独立的反壳网格**、不在溶解范围内。
   于是本体溶解后剩下一个深色轮廓。
   lilToon 里描边用同一个 shader、所以会一起溶解。
   修法：makeLilOutlineMaterial(o, srcMat) 里做同样的注入。
   ⚠️ 必须在受光块**之前**注入、那个块会把 '#include <common>' 整段替换掉。

4. **lilToon 模式的描边接管**
   outlineActive() 原来只在 lilCfg.outline.enable 为真时才让位。
   于是「切到 lilToon 但还没开 lilToon 描边」这段时间里。
   cel 的 OutlineEffect 仍在画、而它是**后处理式**的、完全不参与溶解。
   → 溶解完还剩一个完整的角色剪影（排查了很久）
   修法：if ( shaderActive() && shaderMode === 'lilToon' ) return false;  无条件让位。
        并在 applyShader('lilToon') 时自动把 cel 的描边参数换算过去：
          width = thickness * 100（因为 ba3dOW = _OutlineWidth * 0.01）
          color / alpha 直接照搬。

5. **TDZ：OUTLINE_DEFAULT 定义在 applyShader 之后**
   我在 applyShader 里引用了它、初始化时会 ReferenceError。
   修法：把整块声明移到 applyShader 之前。
   （这是本项目第 3 次 TDZ、前两次是 hex / celShadow。
    共同点：**「早期就会跑的函数」引用了文件下方定义的 const**）

6. **对象空间 vs 世界空间**
   包围盒用 Box3().setFromObject()（**世界空间**）
   而着色器里用 position（**对象空间**）
   两者可以差上百倍、于是「减去中心」几乎没作用、归一化全错。
   控制台上的 k/center 看起来正常、但代入着色器就是不对。
   修法：新增 vBa3dPositionWS = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz
        （注入在 project_vertex 之后、此时 transformed 已完成蒙皮与形态目标）
        模式 3 改用它、和包围盒统一空间。

### 边缘颜色是「加色」的

lilToon 里 _DissolveColor 会发光：

    fd.col.rgb += _DissolveColor.rgb * dissolveAlpha;
    fd.emissionColor += _DissolveColor.rgb * dissolveAlpha;

所以默认纯白会让溶解边界**发亮**、这是预期效果。
不想要白边、就把「边缘颜色」设成黑色。
（默认羽化宽度也从 0.1 降到 0.03、否则边缘带太宽、整个模型会一起变白）

### 诊断

每次出现**新的参数组合**会打一行（同组合只打一次、不依赖详细日志开关）：

    [dissolve] 生成 GLSL：模式=3 线性=1 阈值=0.200 羽化=0.030 位置/方向=(0,-1,0,0) 遮罩=无 噪声=无
    [dissolve] 世界空间归一化：k=(1.37118, 0.62073, 1.30632) 尺寸=(0.729, 1.611, 0.766) center=(-0.20, 0.87, 0.02)

这两行能直接看出「编译进去的实际参数」和「归一化用的坐标系」。
排查这类问题非常有用。

### 已验证的行为

    模式 3、线性 1、位置 (0,-1,0,0)、阈值 0.2 → 水平切面保留下半身。
    模式 3、线性 1、位置 (1,0,0,0)、阈值 0   → 保留左半边。
    模式 3、线性 0、位置 (0,0,0,0)、阈值 0→0.6 → 球形截面逐渐消失。
    模式 1（遮罩贴图）/ 模式 2（UV）行为正常。

---

## lilToon 1.3.7 参数对照（未实现清单）

> 数据来源：`lilToon/Shader/lts.shader` 的 Properties 段、共 **182 个参数**。
> 下表按功能分组、✅ = 已实现并接入面板、— = 未实现。
>
> ⚠️ 这份清单是**从源码 diff 出来的**、不再靠记忆判断。
>    （之前有过一次口头说错：「阶段 1 遗留了遮罩类参数」—— 实际上
>      阶段 1/2 的计划里从来没有这些参数、见 LILTOON1.x.md）

> ⚠️ 本表的数据源是 **1.3.7** 的 `lts.shader`；切到 2.3.4 基线后又补做了一批
>    （2nd/3rd 主色层、层溶解、距离淡出、法线贴图通路、MatCap Lod 与自定法线），
>    因此个别行的状态列可能滞后 —— 以界面实际可调为准。

### 阴影 Shadow（15/22 已实现）

| lilToon 参数 | 状态 | 我们的键 |
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

### Rim 边缘光（11/12 已实现）

| lilToon 参数 | 状态 | 我们的键 |
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

### MatCap（6/18 已实现）

| lilToon 参数 | 状态 | 我们的键 |
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

### 自发光 Emission（3/14 已实现）

| lilToon 参数 | 状态 | 我们的键 |
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

### 背光 Backlight（4/6 已实现）

| lilToon 参数 | 状态 | 我们的键 |
|---|---|---|
| `_BacklightMainStrength` | — |  |
| `_BacklightNormalStrength` | ✅ | `backlight.normalStrength` |
| `_BacklightBorder` | ✅ | `backlight.border` |
| `_BacklightBlur` | ✅ | `backlight.blur` |
| `_BacklightDirectivity` | ✅ | `backlight.directivity` |
| `_BacklightViewStrength` | ✅ | `backlight.viewStrength` |

### Dissolve（3/3 已实现）

| lilToon 参数 | 状态 | 我们的键 |
|---|---|---|
| `_DissolveMask` | ✅ | `dissolve.maskTex` |
| `_DissolveNoiseMask` | ✅ | `dissolve.noiseTex` |
| `_DissolveNoiseStrength` | ✅ | `dissolve.noiseStrength` |

### 汇总

    上方六组共 75 个参数、已实现 42 个（56%）

### 未实现的主要类别（为什么不做）

| 类别 | 例子 | 原因 |
|---|---|---|
| **遮罩类贴图** | `_ShadowBlurMask` `_ShadowBorderMask` `_RimBlendMask` `_MatCapBlendMask` `_EmissionBlendMask` `_BacklightBlendMask` | 需要额外的 UV 变换与采样、收益低于工作量、**不在任何阶段计划里** |
| **阴影色贴图** | `_ShadowColorTex` `_Shadow2ndColorTex` | 同上的贴图类 |
| **AO 偏移** | `_ShadowAOShift` `_ShadowAOShift2` | 需要 AO Map 支持、three 的 toon 通路不接 AO |
| **阴影法线强度** | `_ShadowNormalStrength` `_Shadow2ndNormalStrength` `_Shadow3rdNormalStrength` | 面板有滑杆、但需替换 three 的明暗分档计算才生效（其余 `*NormalStrength` 已实现）|
| **2nd / 3rd 全套** | `_Main2nd*` `_Main3rd*` `_MatCap2nd*` `_Rim2nd*` `_Emission2nd*` | ✅ 已实现（含层溶解 / 距离淡出 / 法线通路）；仅 `_Emission2ndBlink` 闪烁不做 |
| **顶点色/UV 高级变换** | `*_ScrollRotate` `*_UVMode` `*_Parallax*` | 查看器用不上 |
| **明确不做** | Glitter、AudioLink、Fur/Gem/Tessellation、Lightmap、屏幕空间阴影、VRC Light Volumes | 见 LILTOON1.x.md |

### 我们**额外**做的（lilToon 没有）

| 我们的键 | 说明 |
|---|---|
| `shadowAmbient` | 阴影区保留多少环境光 —— 补 three 把环境光单独加在分档之外的问题 |
| `outline.litBlur`（`litShadowBlur`）| 描边受光阴影的自算 PCF 模糊半径 |
| `outline.vectorTex` / `vectorScale` / `vectorUVMode` | 描边外扩方向贴图 |
| `outline.skipPattern` | 按网格名跳过描边（薄板防闪烁）|
| `outline.fixWidthMode` | 屏幕粗细恒定模式（lilToon 的 fixWidth 在常规视距下无效）|

---

## 阶段 3（2nd/3rd 层 + Stencil）

### 完成情况

| # | 项 | 状态 |
|---|---|---|
| 9 | 2nd / 3rd 主色层 | ✅ 完成（含各自的 blendMask）|
| 9 | MatCap 2nd | ✅ 完成 |
| 9 | 2nd / 3rd ノーマルマップ | ⏸ **主动搁置**（要先建法线贴图通路、成本最高）|
| 10 | Stencil | ✅ 完成（本体 + 描边、各 7 个参数）|
| — | 遮罩类贴图（BlendMask）| ✅ 完成（3 个）|
| — | 描边贴图 UV 变换 / 滚动 / HSV | ✅ 完成 |

### 主色层 2nd / 3rd（_Main2nd* / _Main3rd*）

**⇒ 这不是「再加一张法线贴图」、是再加一层基础色**、（lil_common_frag.hlsl:671 / :757）

| 配置 | lilToon | 说明 |
|---|---|---|
| use | _UseMain2ndTex | 开关 |
| color | _Color2nd | 颜色 + **alpha**（这一层的不透明度）|
| tex | _Main2ndTex | 贴图 |
| uvMode | _Main2ndTex_UVMode | 0=uv0、4=视角球面（1/2/3 需要 uv1~3、暂不支持）|
| blendMode | _Main2ndTexBlendMode | Normal / Add / Screen / Multiply |
| enableLighting | _Main2ndEnableLighting | **参与光照的比例**（见下）|
| blendMask | _Main2ndBlendMask | 取 **R 通道** 乘到这一层的 alpha |
| cull | _Main2ndTex_Cull | 0=两面 1=只背面 2=只正面 |

#### ★ _Main2ndEnableLighting 不是开关、是「这一层有多大比例参与光照」

lil_pass_forward_normal.hlsl 里**混了两次**：

    :352（光照**之前**）
        fd.col.rgb = lilBlendColor( fd.col.rgb, color2nd.rgb,
                                    color2nd.a * _Main2ndEnableLighting, _Main2ndTexBlendMode );
    :386（光照**之后**）
        fd.col.rgb = lilBlendColor( fd.col.rgb, color2nd.rgb,
                                    color2nd.a - color2nd.a * _Main2ndEnableLighting, ... );

  ⇒ 1.0 = 完全受光照（会被明暗分档影响、像皮肤的一部分）
    0.0 = 完全不受光照（保持原色、像贴纸/自发光）
    中间值按比例混合。

所以我们的实现也**两处注入**：
  · before → #include <lights_fragment_begin> **之前**
    （那时 normal 已声明、而且 diffuseColor.rgb 还能改）
  · after  → #include <dithering_fragment>
    **⚠️ 后加的 .replace 先生效**、所以要先加 3rd 再加 2nd。
       最终执行顺序才是 2nd → 3rd（和 lilToon 一致）

中间结果用两个全局变量传递：vec4 ba3dColor2nd / vec4 ba3dColor3rd。

#### ⚠️ 「剔除」需要双面渲染

cull=1（只背面）在 **side=FrontSide** 的材质上**永远没有片元**。
  背面在光栅化阶段就被剔除、片元里的 gl_FrontFacing 恒为 true。
  于是 a 被恒置 0、表现是「叠加消失」、看起来像坏了。
  cull=2（只正面）则完全没变化、和 cull=0 一样。
⇒ 只要任意一层开了剔除、就把材质改成 DoubleSide、关掉时还原。
   （syncLayerDoubleSide()、挂在每次 applyLilOutline() 上）

### MatCap 2nd（_MatCap2nd*）

参数与 1st 同构、并且顺手给 1st 补上了完整版才有的三个参数。

⚠️ lilToon 的 MatCap 有**完整版**和 **lite 版**两套：

    完整版（:1414-1436 / :1482-1504）
        float4 matCapColor = _MatCapColor;                    ← 有染色
        matCapColor *= SAMPLE( _MatCapTex, matUV );
        matCapColor.rgb = lerp( rgb, rgb * fd.lightColor, _MatCapEnableLighting );
        matCapColor.a   = lerp( a, a * fd.shadowmix, _MatCapShadowMask );
        matCapColor.a   = fd.facing < ( _MatCapBackfaceMask - 1.0 ) ? 0.0 : a;   ← 背面剔除
        matCapColor.rgb = lerp( rgb, rgb * fd.albedo, _MatCapMainStrength );     ← 乘 albedo
        fd.col.rgb = lilBlendColor( ..., _MatCapBlend * a * mask, _MatCapBlendMode );

    lite 版（:1446）
        fd.col.rgb = lerp( fd.col.rgb,
                           _MatCapMul ? fd.col.rgb * matcap : fd.col.rgb + matcap,
                           fd.triMask.r );

我们**两套都支持**：保留了原有的 `mul` 开关（lite 形式、默认关）。
并补上了 color / backfaceMask / 用 albedo 的 mainStrength。

通用生成器：lilMatCapGLSL( M, texUni, triCall, tag )、1st / 2nd 共用。

### 遮罩类贴图（BlendMask）—— 只有 3 个

⚠️ 我一开始说「四个装饰层都有」、**错了**、逐条 grep 源码后：

| 参数 | lilToon 行 | 采样方式 | 状态 |
|---|---|---|---|
| _MatCapBlendMask | :1431 | `.rgb` → **逐通道**混合 | ✅ |
| _MatCap2ndBlendMask | :1499 | 同上 | ✅ |
| _EmissionBlendMask | :1715 | RGBA **整体乘**（rgb 调色、a 调强度）| ✅ |
| _Main2ndBlendMask | :697 | `.r` 乘到 alpha | ✅（主色层已做）|
| _Main3rdBlendMask | :783 | 同上 | ✅ |
| **_RimBlendMask** | — | **不存在**、Rim 用 `fd.triMask.g`（顶点色）| ✅ 早已有 |
| **_BacklightBlendMask** | — | **不存在** | — |

#### ★ MatCap 的遮罩是 vec3、所以需要 ba3dBlend3

    权重 = _MatCapBlend * matCapColor.a * matCapMask      ← matCapMask 是 float3
    ⇒ mix( dstCol, outCol, srcA ) 里 srcA 也是 vec3（逐通道）

所以给 GLSL 加了一个 vec3 alpha 版：

    vec3 ba3dBlend3( vec3 dstCol, vec3 srcCol, vec3 srcA, uint blendMode ) { ... }

有遮罩时用 ba3dBlend3、没有时仍用 ba3dBlend（float）、零开销。

#### 贴图缓存

    resolveMaskTexture()  →  复用 resolveDissolveTexture（**数据贴图**、NoColorSpace）
    ⚠️ 不能走 sRGB、否则 0~1 的遮罩值被 gamma 扭曲、生效区域全错。
    ⚠️ 异步加载时会返回 null、所以 uniform 要**无条件声明**、用占位贴图顶上。
       遮罩占位 = 纯白（.r = 1.0、等价「不限制」）

### 描边贴图的 UV 变换 / 滚动 / HSV

三个新参数（lil_common_frag.hlsl:268-360）：

| 配置 | lilToon | 格式 |
|---|---|---|
| texST | _OutlineTex_ST | [tilingX, tilingY, offsetX, offsetY]、默认 [1,1,0,0] |
| texScrollRotate | _OutlineTex_ScrollRotate | [scrollX, scrollY, angle, angleSpeed]、默认 [0,0,0,0] |
| texHSVG | _OutlineTexHSVG | [色相偏移, 饱和度倍率, 明度倍率, gamma]、默认 [0,1,1,1] |

    lilCalcUV（lil_common_functions.hlsl:436）：
        outuv = uv * ST.xy + ST.zw;
        outuv = lilRotateUV( outuv, SR.z + SR.w * _Time.y ) + frac( SR.xy * _Time.y );

    lilToneCorrection（:328）：gamma → RGB→HSV → 调整 → HSV→RGB

**⇒ 三个都在默认值时走 three 原生的 mat.map 路径、零开销、观感不变**。
  非默认时才把 mat.map 置空、改成自己在片元里采样。
  时间用 uBa3dTime、每帧在 updateLilOutlineCamera 里更新。

（注：_OutlineOffsetFactor / _OutlineOffsetUnits 在 1.3.7 的 hlsl 里**完全没被使用**。
  是遗留的 Properties、无事可做）

### Stencil（模板缓冲）

lilToon 有**两套**（lts.shader:535-541 / :566-572）：
本体 _Stencil*、描边 _OutlineStencil*、各 7 个。

#### ⚠️ 前提：renderer 必须开模板缓冲

    const renderer = new THREE.WebGLRenderer({ ..., stencil: true });

three r160 默认 **false**、而模板缓冲**无法在 context 创建后再加**。
如果没改这一项、Stencil 做完了也会「调了没反应」、又一次静默失效。

#### Unity 枚举 → three 常量（两套编号完全不同、不能直传）

    Unity CompareFunction          three StencilFunc
      Disabled = 0                   Never = 512
      Never = 1                      Less = 513
      Less = 2                       Equal = 514
      Equal = 3                      LessEqual = 515
      LessEqual = 4          →       Greater = 516
      Greater = 5                    NotEqual = 517
      NotEqual = 6                   GreaterEqual = 518
      GreaterEqual = 7               Always = 519
      Always = 8  ← lilToon 默认

    Unity StencilOp                three StencilOp
      Keep = 0  ← lilToon 默认      Zero = 0
      Zero = 1                       Keep = 7680
      Replace = 2                    Replace = 7681
      IncrSat = 3            →       Increment = 7682
      DecrSat = 4                    Decrement = 7683
      Invert = 5                     Invert = 5386
      IncrWrap = 6                   IncrementWrap = 34055
      DecrWrap = 7                   DecrementWrap = 34056

#### 字段对应

    _StencilRef        → stencilRef
    _StencilReadMask   → stencilFuncMask
    _StencilWriteMask  → stencilWriteMask
    _StencilComp       → stencilFunc
    _StencilPass       → stencilZPass     （Unity 的 Pass = 深度与模板都通过）
    _StencilFail       → stencilFail
    _StencilZFail      → stencilZFail

three 只有 **stencilWrite = true** 时才用这些设置、关闭时完整还原原本的 8 个字段。

#### ★ 怎么用才对（鸡生蛋问题）

    ⚠️ 全局设成 Comp=Equal + Ref=1、会让**所有**东西消失。
       初始模板缓冲 = 0、测试 0 == 1 失败、全部丢弃。
       丢弃了就不会写模板、永远是 0、永远失败。
       （实测现象：本体消失、只剩描边色剪影）

    正确用法需要**两个对象分工**：
      对象 A（标记者）：Comp = Always(8)、Pass = Replace(2)、Ref = 1
      对象 B（接收者）：Comp = Equal(3)、Ref = 1
    ⇒ 在查看器里就是：全局设 A 的参数、然后**材质下拉选 B**、单独设 B 的参数。

    实测验证：全局 Comp=8/Pass=2/Ref=1、选 CH0155_Shield_Toon 设 Comp=3/Ref=1
      → 盾牌只显示在别的部件遮住它的位置（被裁切）
      → 把描边那 8 项也设成 Comp=3/Ref=1、盾牌描边同样消失。

### 装饰层执行顺序（对齐 lilToon）

lil_pass_forward_normal.hlsl:352 / 360 / 411 / 445 / 450 / 457 / 472 / 478：

    Main2nd → Main3rd → Backlight → MatCap → MatCap2nd → Rim → Emission1st → Emission2nd
    （前面两个在光照前后各半、天然在最前）

我们原来错了（Rim → MatCap → Emission → Backlight）、已改为
**Backlight → MatCap → MatCap2nd → Rim → Emission**。

顺序错了在「同区域多个效果叠加」时观感会不同、尤其 Backlight 是加色。

---

## ★ 场景视图三件套（Unity 风格）

> 工具栏的「场景」按钮打开一个 `#scenePanel` 浮窗、三组控件。
> ⚠️ 它就是个普通的 `.lp` 浮窗 ⇒ 拖动 / 缩放 / 位置持久化都由浮窗底座接管。

### ⚠️⚠️ 辅助显示**默认全关**、主页面显式打开

  ```
  主页面 index.html        showGrid:true · showViewGizmo:true   （场景视图）
  嵌入看板 autoMount       showGrid:false · showViewGizmo:false  （贴在网页上）
  ```

  ⚠️ 用户的原话：「网格在网页看板那里、应该是关闭的」。

  ⇒ `viewer.js` 里 `showGrid` / `showViewGizmo` **默认 false**。
     `index.html` 在 `createViewer(...)` 的 opts 里**显式打开**。

  ⇒ 嵌入方想要就写 data 属性：

      <div data-ba3d
           data-ba3d-grid="true"
           data-ba3d-axes="true"
           data-ba3d-gizmo="true"
           data-ba3d-light-helper="true"></div>

  ⚠️ 判定规则都是 `!== 'false'` ⇒ 写 `="true"` 或直接写 `data-ba3d-grid` 都算开。

  ### 实测

      主页面 index.html        {grid:true,  gizmo:true,  axes:false}
      嵌入页 embed-demo.html   {grid:false, gizmo:false, axes:false}

---

### ① 辅助显示

  | 键 | 默认 | 说明 |
  |---|---|---|
  | `showGrid` | **false** | 地面网格（`GridHelper`、y=0 略高 0.0005 避免 z-fighting） |
  | `showAxes` | false | 原点 XYZ 坐标轴（红 X / 绿 Y / 蓝 Z、Unity 配色） |
  | `showLightHelper` | false | 主光方向指示（从光源位置指向原点的线 + 端点小球） |
  | `showViewGizmo` | **false** | 右下角… 不、**右上角**视角指示器 |
  | `gridSize` / `gridDivisions` | 8 / 16 | 网格尺寸与分格数 |
  | `axesLength` | 1.6 | 坐标轴长度 |

  ⇒ 坐标轴的正方向实线、负方向半透明、（Unity 也这样）

  ### ⚠️ 视角指示器为什么在**右上角**

      右下角被「状态」浮窗占着、左下角是工具栏 ⇒ 只剩右上角。
      （Unity 的 Scene 视图也是右上角）

  ### ⚠️ 指示器用**独立的 2D canvas**、不开第二个 WebGL

  第二个 `WebGLRenderer` 会抢上下文、而且很贵。
  ⇒ 用 2D canvas 把三条世界轴按**相机旋转**转一下、取 xy 投影。
  ⇒ 按 z 排序、朝后的画淡一点 ⇒ 有前后遮挡感。
  ⇒ 只用旋转不用位置 ⇒ 它表示的是「当前视角朝向」、和 Unity 一致。

### ② 光照

  ⚠️ `keyLight` 是**方向光**、它的 `position` 只表示**方向**（光源在无穷远）
  ⇒ 与其让人填 xyz、不如给 **方位角 / 仰角**（Unity 习惯也是转朝向）

      azimuth   [0,360)  绕 Y 轴、0 = +Z（模型正面）、顺时针增加
      elevation [-89,89] 仰角、0 = 地平线 · 90 = 正上方

  换算（`anglesToPosition` / `positionToAngles`）：

      x = r·cos(el)·sin(az)      y = r·sin(el)      z = r·cos(el)·cos(az)

  ⇒ 读的时候**反解**成角度 ⇒ 三套预设和手动调值能共存。

  可调：主光 方位角 / 仰角 / 强度 / 颜色 · 环境光 强度 / 天空色 / 地面色 ·
        边缘光强度 · 补光强度 · 曝光 · 预设下拉（白昼 / 早晨傍晚 / 黑夜）

  ⚠️⚠️ **手动改过就把 `cfg.lightingPreset` 置空** ——
     否则下次 `applyLighting()` 会把用户改的值全盖掉。
     ⇒ 面板的预设下拉这时显示「（自定义）」。

  ⚠️ 手动写的是**最终值**、不走 `applyLighting` 里那条卡通系数
     （`key ×1.22` · `rim/fill ×0.15`）⇒ 否则面板显示和实际不符。

### ③ 相机

  可读可写：`position[3]` · `target[3]` · `distance` · `fov`

  ⚠️ 只传 `target` 时相机**跟着平移**（保持相对方位、和 Unity 的「移动观察点」一致）

  轴对齐快捷视角（`setViewPreset`）：

      front / back / left / right / top / bottom

  ⚠️ **保留当前距离**（否则会突然拉到很远、用户会晕）
  ⚠️ 正上/正下用**略偏的方向**（纯垂直时轨道控制的 up 会退化 ⇒ 万向锁）

  ⚠️ 相机能被鼠标拖动 ⇒ 面板数字会过期 ⇒
     面板可见时 **2Hz 回读**（不是每帧）、而且**正在编辑的框不覆盖**。

### API

      viewer.getSceneHelpers() / setSceneHelpers({...})
      viewer.getLightState()  / setLightState({...})
      viewer.getCameraState() / setCameraState({ position, target, distance, fov })
      viewer.setViewPreset('front'|'back'|'left'|'right'|'top'|'bottom')

### ⚠️ 一个接线顺序的坑（踩到了）

  `#scenePanel` 的内容是**打开时**才 build 的、而 `ensurePanelTitle` /
  `makePanelDraggable` / `initFloatWin` 在本段代码**后面**才定义。

  ⇒ 直接调会 `is not defined`、而面板**还是会开** ⇒ 只是没接上拖动、很隐蔽。
  ⇒ 修法：在 `toggleScenePanel` 里用 `setTimeout(..., 0)` **延迟一帧**调。
     （那时脚本已执行完、函数都就位了）

  ⚠️ 标题文案走 `PANEL_TITLES` 映射表、**不要**去改 DOM。
     （`const txt = PANEL_TITLES[el.id] || el.id`）

---

# ★ 交互约定（改 UI 前先读这一节）

> 用户的原话：「**不要给人增加学习成本和让人感觉反直觉反人类**」
> ⇒ 这是本项目的**最高设计约束**、任何「技术上的优雅」都不许违反它。

## 一、对齐业界惯例 · 不自创

  | 东西 | 约定 |
  |---|---|
  | 快捷视角 Top / Bottom | **竖直**（正下方 / 正上方看）、不许搞斜的 |
  | 快捷视角 Front / Back / Left / Right | 相机落在**世界轴**上 |
  | 屏幕上方 | = **+Z = 角色正面**（和 Unity / Blender 一致） |
  | 俯视 / 仰视 | 相机低于地面时**自动隐藏网格**（模拟 Unity 的单面 Grid） |
  | 状态浮窗 | **右下角**（IDE / 引擎的信息位） |
  | 工具栏 | 左下角 · 启动器 |
  | 角色显示 | 左上角 · 画布主体 |

  ⚠️ 我之前在俯视 / 仰视上**连改三次**都是因为自创：
     ① 偏移 0.0001 想绕开万向锁 ⇒ 朝向退化
     ② 把仰视改成 **斜的** ⇒ 「你搞个斜的干嘛啊啊」
     ③ 俯视 `up=(0,0,-1)` ⇒ 画面里模型是**倒的**
     ✅ 正解：**正方向 + 换 up 向量**（技术问题用技术手段解）

## 二、不用内部名词当界面文案

  |、别用 |、用 |
  |---|---|
  | `pivot` / 取景中心偏移 | **修正模型位置 XYZ** |
  | `groundOffsetY` | 同上（它只是 `modelOffset.y` 的别名） |
  | `showGrid` / `showAxes` | 地面网格 / 原点坐标轴 |
  | `action` 模式 | **view**（用户叫它 view、内部值仍用 action） |

  ⚠️ 「按钮叫**场景** · 面板叫**场景参数**」这种区分要**有必要**才行。
     纯粹因为历史原因留两个名字 ⇒ 就是学习成本。

## 三、默认状态就是正确状态

  ⚠️⚠️ **不许出现「先点一下才生效」** ——

     我犯过：`buildShaderPanel()` 只在**点开面板**时调用 ⇒
     默认状态下工具栏还是满的 ⇒ 用户看到的和需求相反。
     而我的探针**先点了按钮再测** ⇒ 永远发现不了。

  ⇒ 规矩：**测默认状态就别做任何交互**、再接交互测试。
  ⇒ 规矩：装饰性 / 结构性元素**写进 HTML**、不要靠 JS 运行时塞。
     （`.fw` 那三个浮窗是写死的 ⇒ 从来没出过「被重建清掉」的问题。
       `partsPanel` / `lilPanel` 是运行时建的 ⇒ 标题 / [—] / 手柄**轮流消失**）

## 四、坐标系要自洽（一套心智模型）

      · 角色脚下的**中轴线** = 世界原点的竖直线
      · `modelOffset` 的用途 = **把模型摆到这条线上**（默认 0 ⇒ 已经在上面）
      · 自动贴地负责让脚落在 y=0
      · 快捷视角：相机在世界轴上、目标在中轴线上
      · 轨道旋转绕这条中轴线转 ⇒ **以角色为中心**

  ⚠️ 反例（已修）：`sample.json` 里留着老 `pivot.x = -0.1` ⇒
     它在老语义下是「只动相机对准点」、迁到新语义就变成
     **「把模型推离中轴线 0.1」** ⇒ 和整套心智模型**正相反**。

## 五、一个概念只能有一处真相

      ⚠️ 本会话踩过的同类：
        · `groundOffsetY` 与 `modelOffset.y` 并存 ⇒ 自动贴地「写了没人读」
        · 显示模式切换放在工具栏 + 面板两处 ⇒ 改成只用浮窗左上那一处
        · `pivot` 与 `modelOffset` 并存 ⇒ 已废弃 pivot

      ⇒ 合并概念时**必须把所有写入方一起改**、漏一个就静默失效。

---

## ★ 浮窗布局（Unity 风格）

> `index.html` 不再是「全屏场景 + 固定侧栏」、而是**若干个互不嵌套的浮窗**。
> 像 Unity 那样：场景一个窗口 · 参数面板另一个窗口 · 都能拖动和缩放。

### 为什么改

  ⚠️ `frameModel()` 是按 **`container.clientHeight`** 把模型缩放到固定像素高的。
     而场景原来是 `position: fixed; inset: 0`（铺满视口）⇒
     **浏览器窗口一变扁 ⇒ 模型跟着缩**、很意外。
  ⇒ 固定尺寸的浮窗 ⇒ `clientHeight` 恒定 ⇒ **模型大小恒定**。

  ⚠️ 用户**主动**缩放场景窗口时**仍会**重新取景 —— 这是预期行为。
     Unity 的 Scene 视图也是这样。

### 四个浮窗

  | id | 标题 | 内容 | 默认位置尺寸 |
  |---|---|---|---|
  | `#sceneWin` | 场景 | `#app`（three canvas）+ `#vignette` | 16,16 · 960×700 |
  | `#hudWin` | 工具栏 | `#hud`（按钮 + 动作/打光/亮度/阴影/分档色/夹取） | 16,bottom · 660×210 |
  | `#infoWin` | 状态 | `#info`（帧率 / 三角形数 / 材质数） | right,16,bottom · 300×130 |
  | `.lp` ×3 | 参数 / 导出 / 部件 | lilToon 面板 · 导出 JSON · 部件列表 | right,top · 400 宽 |
  | `#upload` | 自定义模型 | 上传 glb / 贴图 / 配置（用自己的 `.u-title` 当把手） | left,top · 288 宽 |

  ⚠️ `#loading` **不是**浮窗 —— 它是加载遮罩、仍是全屏覆盖。

### 通用操作

     拖动      按住**标题栏**拖（`#upload` 是按住它自己的 `.u-title`）
     缩放      拖**右下角小三角**（`.fw-grip`）
     层级      点哪个窗口哪个到最前（加 `.raised` ⇒ z-index:30）
     持久化    自动存进 localStorage 的 `ba3d-layout-v1`（键名故意不带点）
     └ 存的是   left / top / width / height / collapsed

  ⚠️ 键名**故意不带点** —— `check-panel.mjs` 会把源码里带点的字符串当成
     面板的「组.键」⇒ 带点的键名会被误判成组名（实测踩到）

### 重置布局

  **控制台里执行**：

      ba3dResetLayout()        // 清掉持久化 + 重新载入

  ⚠️ 也挂在 `window.ba3dResetLayout`。

### 窄屏兜底

  ⚠️ 浮窗在手机上不实用 ⇒ `@media (max-width: 820px), (max-height: 560px)` 下：

      #sceneWin   铺满视口 · 去掉边框圆角 · 隐藏标题栏与手柄
      .lp         全屏覆盖（内部本来就能滚）
      #hudWin     底部 34vh · #infoWin 底部 20vh
      #upload     全屏覆盖

  ⇒ 拖不动也没关系（标题栏和手柄都隐藏了）、CSS 就够、不用 JS 分支。

### 实现位置

  · CSS      `index.html` 的 `.fw` / `.fw-title` / `.fw-body` / `.fw-grip` 四条规则
  · 拖动     复用已有的 `makePanelDraggable(el, handleSel)`
             （把手链：`.fw-title` > `.lp-title` > `.u-title` > `h4`）
  · 缩放     `makePanelResizable(el)` —— 右下角手柄 · 最小 240×160 · 视口夹紧。
  · 持久化   `fwSave` / `fwRestore` / `fwClearAll` / `fwClampBox`
  · 汇总     `initFloatWin(el)` = 拖动 + 缩放 + 恢复 + 层级。
             `enableAllPanelDrag()` 对所有 `.fw` 和 `.lp` 调它。

  ⚠️ **零 DOM 重构**：`.lp-title` 本来就是 `position: sticky`、所以面板内部滚动时
     标题不会被滚走、不用动那 438 个控件的容器。

---

## ★ `modelOffset`（修正模型位置）· `pivot` 已废弃

  ### 控制什么

      renderer.modelOffset = { x, y, z }     // 世界单位

  ⇒ **移动的是模型本体** ⇒ 影子 / 描边 / 光照全都跟着动。
  ⇒ 相机对准点 = 模型的新中心 ⇒ **旋转天然以角色为中心**。

  ### ⚠️ 和已废弃的 `renderer.pivot` 的区别

      旧做法 pivot = { x, z }   只动**相机对准点**
        ⇒ 看起来模型移位了、但**模型和影子都没动** ⇒ 不直观。
        ⇒ 而且「旋转以角色为中心」是靠偏移对准点**凑**出来的。

      新做法 modelOffset = { x, y, z }   **真的移动模型**
        ⇒ 模型到了 000 ⇒ 旋转中心自然就是角色。

  ⇒ 用户的原话：

      「取景中心偏移本身就是为了实现旋转时角色在旋转中心设计的。
        我们实际需要的就是让人可以直观把模型移动到 000 位置。
        这样旋转就是角色为中心看、**不动旋转轴、动角色位置**」

  ### ⚠️ `pivot` 已废弃（但 API 还在）

      · `renderer.pivot` —— 默认配置里**已删除**、载入时不再读。
      · `viewer.getPivot()` / `setPivot()` —— 保留但**没人调了**、视为废弃。
      · 场景面板里的「取景中心」组 —— **已删**、只剩「修正模型位置」。

  ### 三个旧控件的默认值迁移

      工具栏原来的「落地微调 / 基准X / 基准Z」三个控件已删 ⇒ 合并成 modelOffset：

          落地微调（groundOffsetY） ⇒ **modelOffset.y**（`groundOffsetY` 保留为兼容别名）
          基准 X（pivotX）          ⇒ **modelOffset.x**
          基准 Z（pivotZ）          ⇒ **modelOffset.z**

      ⇒ `sample.json` / `fallback.json` 里原 `pivot.x = -0.1` 已迁成
         `renderer.modelOffset = { x: -0.1, y: 0, z: 0 }`（保住原观感）

  ⚠️ 还有个**坑**：`modelOffset` 必须放在 `renderer` 里。
     我第一次写到了 JSON **顶层** ⇒ 载入器不认 ⇒ 配置静默失效。

---

## ★ 取景垂直偏移默认 22（`framingOffsetY`）

  ⚠️ 这个默认值是**实测调出来的**、不是随手给的。

  ### 为什么不是 0

  `CH0155_Vital_Death`（倒地动作）在**第 4 秒**整体掉到画面下半 ⇒
  底部超出下边缘 **0.0934 NDC** ⇒ 被裁。

  ⚠️ 只采一个时刻**看不出来** —— 0.7 秒那帧完全正常。
     必须每个动作采多个时刻（0.4 / 1.0 / 1.8 / 2.8 / 4.0 / 6.0 秒）取最差值。
     （也可用 `viewer.frameFitReport()` 自查）

  ### 22 是怎么来的

      `framingReferenceHeight = 430` ⇒ 半高 215px
      0.0934 NDC × 215 ≈ 20px ⇒ 取 **22** 留一点余量。

  ### 实测效果（5 个最紧的动作 × 3 个时刻）

      动作                     改之前      改之后
      CH0155_Vital_Death      −0.0934、+0.0372。
      CH0155_Exs_Cutin        +0.0131      +0.1350    ← 原来贴在底边、一起救了
      CH0155_Vital_Dying_Ing   …           +0.1881。
      CH0155_Vital_Panic       …           +0.1937。
      被裁：1 个 ⇒ **0 个**。

  ### ⚠️⚠️ 这不是「抬高地面 / 抬高模型」

、抬模型  ⇒ 刚修好的踩地会坏掉、影子又会和脚分开
、动的是 **相机对准点**（`frameModel` 的 target.y）
        ⇒ 地面仍在 y=0、脚也仍在 y=0（`groundOffsetY` 的贴地还生效）

  ### 调法

      「正值 = 取景下移 ⇒ 画面内容**上移**」
      ⇒ 内容被**下边缘**裁 ⇒ 调**大**
      ⇒ 内容被**上边缘**裁 ⇒ 调**小**（或给负数）

  ⇒ 运行时也能改（不用刷新）：

      viewer.getFraming()                        // 看当前值
      viewer.setFraming({ framingOffsetY: 30 })  // 改
      viewer.frameFitReport()                    // 量有没有出画

  ⚠️ 换模型后建议跑一次 `probe-fit.mjs` 看新模型的动作有没有出画。

---

## ★ 接地：角色脚与地面（`groundOffsetY`）

### 问题

  「角色脚步没有接地、影子和身体是分开的」（长期反馈）

  ⚠️ 根因：`fitToView` 用 `measureContentBox(root)` 的 `min.y` 把模型落到 y=0。
     但**蒙皮网格的包围盒是绑定姿势（bind pose）的** ⇒
     动画一动、脚的真实高度就变了 ⇒ 影子（投在 y=0）和脚之间出现缝。

  ### 实测（无头浏览器量出来的）

      自动贴地前   minY = 0.0664   groundY = 0   gap = 0.0664   ← 悬空
      自动贴地后   minY = -0.00003 groundY = 0   gap = 0        ← 精确接地
      采样 9303 点 / 11 个网格

  ⇒ 模型总高 2 世界单位 ⇒ 悬空约 **3.3% 身高** ⇒ 正好是肉眼能看到的那条缝。

  ### 量法：`viewer.probeGround()`

  ⚠️ **必须对顶点做蒙皮变换**、不能读包围盒。
     用 `SkinnedMesh.applyBoneTransform(i, v)`（three r151+）。
     再 `applyMatrix4(o.matrixWorld)` 到世界空间。
     顶点有几十万 ⇒ 每个网格采样约 2000 点（脚部密度足够）

  ### 配置

  | 键 | 默认 | 说明 |
  |---|---|---|
  | `groundOffsetY` | 0 | 落地微调（世界单位）正数抬高 · 负数压下去 |
  | `autoGroundSnap` | true | 加载后**自动贴地一次** |

  ### ⚠️⚠️ 为什么只能贴**一次**

  跳跃 / 蹲下 / 抬腿这些动作**本身就是让脚离地的**。
  每帧贴会把它们压平 ⇒ 角色像被钉在地上。

  ⇒ 而且必须**等动画推进 12 帧**再量 ——
     刚 load 完姿势还是绑定姿势、那正是 fitToView 已经用过的 ⇒ 量出来 gap≈0 白贴。

  ⇒ 缝小于 `0.5% × 身高` 时不贴（蒙皮采样有噪声、贴了可能过冲）

  ### 面板

  工具栏里有：

      落地微调   滑杆 + 数字框（-0.5 ~ 0.5）
      自动贴地   按钮 ⇒ `viewer.snapToGround()`（量一次 · 自动补偿）

  ⚠️ 手动调过滑杆 ⇒ 自动贴地**让位**（`__autoSnapSkip`）、不覆盖用户的值。

  ### ★ 取景会跟着走（重要、用户提的隐患）

  ⚠️ `frameModel` 用的是 `fitToView` 时**缓存的 `contentBox`**。
     而贴地会把模型整体下移 `groundOffsetY` ⇒ 取景中心却还停在旧位置。

      偏移小（默认 −0.0666 = 身高的 3.3%）⇒ 看不出来
      滑杆能拖到 ±0.5（= 身高的 25%）⇒ 那时候就会顶出画面。

  ⇒ 修法：`frameModel` 的 `target.y` 加上 `groundOffsetY`。
     并且**只在落地微调变化时**重算（不是每帧）。

  ### 实测（24 个动作逐个量 NDC 余量）

      改之前   最紧动作  top=0.2133  bottom=0.1161
      改之后   最紧动作  top=0.1553  bottom=0.1745   ← 更均衡
      被裁动作数  0 / 24。

      极端偏移（滑杆两端 · 身高的 25%）：
        偏移 −0.5  ⇒ top=0.6734  bottom=0.2518。
        偏移 +0.5  ⇒ top=0.6751  bottom=0.2040。

  ⚠️ 量法：`viewer.frameFitReport()` 把当前姿势的**蒙皮包围盒**投到 NDC。
     `|ndc| <= 1` 在画面里、超出就是被裁。
     ⇒ 换模型 / 换动作后想确认「有没有出画」跑一次就知道。

  ### 地面本身不用动

  贴地是**把模型往下够地面**、不是把地面抬起来 ⇒
  地面仍在 `y=0`、脚也正好在 `y=0`、接触是准的。

  ### API

      viewer.probeGround()            → { minY, groundY, gap, sampled, meshes }
      viewer.frameFitReport()         → { ndcTop, ndcBottom, marginTop, marginBottom, clipped }
      viewer.getGroundOffset()        → 当前偏移
      viewer.setGroundOffset(y)       → 设置（会禁用自动贴地）
      viewer.snapToGround()           → 按当前姿势自动贴地
      viewer.onGroundOffsetChange(fn) → 自动贴地后同步面板滑杆

---

## ★ 日间模式（`body.light`）

  ### 做什么

  工具栏最左边一个「日间 / 夜间」按钮、切换整套配色。

  ### ⚠️ 做法是**增量覆盖**

  在 `index.html` 的 `</style>` 之前追加一组 `body.light …` 规则。
  **不动上面任何一条暗色规则** ⇒ 夜间模式零风险（一个字节都没变）

  ⇒ 想再加一处、就在那一组里补一条**同选择器**的规则（后写的赢）

  覆盖范围（约 40 条）：

      html/body 背景 · .fw / .fw-title / .fw-grip · #sceneWin 的 body
      #hud 的按钮 / 下拉 / 数字框 / 分隔线 / option
      .lp 面板 + 标题栏 + 按钮 + textarea + 输入
      #upload 上传面板 + .u-pick + .u-actions
      #info / #loading / #bar · #vignette（日间把暗角放松、否则四角发黑）

  ### 优先级

      localStorage('ba3d-theme')  >  系统 prefers-color-scheme  >  夜间

  ⚠️ 键名**不带点**（`check-panel.mjs` 会把带点字符串当成面板的「组.键」）

  ### 控制台

      ba3dSetTheme('light')     // 或 'dark'

  ### ⚠️ 场景背景也跟着变

  默认背景是「透明」⇒ 场景窗口 body 的 CSS 色透出来 ⇒
  日间模式下模型站在**浅色**底上、（这是有意的、和 Unity 一致）
  想要固定底色 ⇒ 用工具栏的「背景」下拉选一个具体颜色。

---

## ★ 2026-10-06 新增（对齐 lilToon 2.3.4）

> 这一批都是为了把基线从 lilToon 1.3.7 换到 **2.3.4** 之后补齐的东西。
> 版本对比与源码地图见 [`LILTOON2.x.md`](LILTOON2.x.md)。

### 1. 渲染状态（每材质）—— `_TransparentMode` / `_Cutoff` / `_Cull`

  **三个顶层键**、默认**全是 `-1 = 不改**（沿用模型自带的值）：

  | 键 | 默认 | 对应 | 说明 |
  |---|---|---|---|
  | `transparentMode` | -1 | `_TransparentMode` | -1不改 · 0=Opaque · 1=Cutout · 2=Transparent · 3~6（Refraction/Fur/FurCutout/Gem）降级成 Transparent 并打日志 |
  | `cutoff` | 0.5 | `_Cutoff` | 只在 Cutout 模式下有意义 |
  | `cull` | -1 | `_Cull` | -1不改 · 0=Off(双面) · 1=Front · 2=Back |

  ⚠️ **Unity 与 three 的 side 枚举顺序不同** ⇒ 不能直接对拷。

      _Cull 0（Off 双面）→ THREE.DoubleSide (2)
      _Cull 1（Front）    → THREE.FrontSide  (0)
      _Cull 2（Back）     → THREE.BackSide   (1)

  ### alphaTest 的**唯一权威**是 `syncDissolveAlphaTest`

  优先级（从高到低）：

      ① 溶解开着（lilToon 且 dissolve.mode > 0）⇒ max( 0.5, 原值 )
         （必须 ≥ 0.5 才会真正 discard）
      ② transparentMode = 1（Cutout）⇒ cutoff
      ③ transparentMode = 0 / ≥2（Opaque / Transparent）⇒ 0
      ④ 模式没改（-1）但单独给了 cutoff 且原本就是 Cutout ⇒ cutoff
      ⑤ 否则 ⇒ 还原成模型原值（userData.__ba3dOrigAlphaTest）

  ⚠️ `applyLilRenderState` **不碰** alphaTest、只设 transparent / depthWrite / side。
     两者分工是为了避免重复施加、（踩过一次）

  ⚠️ 改 alphaTest 会影响 three 的 `USE_ALPHATEST` 宏 ⇒ 必须 `needsUpdate = true`。

  ### 同步链（顺序要紧）

      syncDissolveAlphaTest();   // ① alphaTest（唯一权威）
      syncRenderState();         // ② transparent / depthWrite / side
      syncLayerDoubleSide();     // ③ 主色层的剔除（显式 _Cull 优先 · 会跳过）
      syncStencil();             // ④ 模板参数
      applyOutlineParams();      // ⑤ 重新评估描边的跳过规则

  ⚠️ 前四个函数都必须在**每次配置变更**时整体遍历一遍。
     因为**材质会被复用** ⇒ `patchToonMaterial` 不会再跑 ⇒ 只改配置不会生效。

### 2. 主色 UV / 色调 —— `_MainTexHSVG` / `_MainTex_ScrollRotate`

  | 键 | 默认 | 对应 |
  |---|---|---|
  | `mainTexHSVG` | `[0,1,1,1]` | `_MainTexHSVG`：(色相偏移, 饱和度倍率, 明度倍率, Gamma) |
  | `mainTexScrollRotate` | `[0,0,0,0]` | `_MainTex_ScrollRotate`：(滚动X, 滚动Y, 旋转角, 旋转角速度) |

  公式照抄（`lil_common_frag.hlsl:263 / :317`）：

      fd.uvMain = lilCalcUV( fd.uvMain, _MainTex_ST, _MainTex_ScrollRotate );
      fd.col.rgb = lilToneCorrection( fd.col.rgb, _MainTexHSVG );

  ⇒ 实现方式：**替换 `#include <common>`（加 uniform + 两个 helper）
     与 **`#include <map_fragment>`**（换成打过补丁的采样）。

  ⚠️ **不再乘 `_MainTex_ST`** —— three 的 `vMapUv` 已经含 ST 了。
  ⚠️ **GLSL 没有函数提升** ⇒ 生成器里顺序必须是「旋转函数 → 滚动函数 → 调用」。
  ⚠️ 全默认时生成器返回 `null` ⇒ 两个 replace 都退化成原文 ⇒ **零副作用**。

  ### 时间 uniform（`uBa3dTime`）

  ⚠️ **无条件声明**（未使用的 uniform 会被 GLSL 优化掉 ⇒ 声明了不用没代价）
     因为在需要时才声明会漏 —— Decal 的图集动画也用它、（踩过一次）

  ⚠️ 所有 shader **共享同一个 uniform 对象**（`ba3dTimeUniform`）。
     不是「维护 shader 列表事后去改」（那样 three 处理过的 uniforms 改不到、踩过）

  ⚠️ **已知偏差**：lilToon 改的是**共享的 `fd.uvMain`** ⇒ 阴影/描边贴图也会跟着滚。
     我们只改主色贴图自己的 UV ⇒ 已在 `LILTOON2.x.md` 记为已知差异。

### 3. 层 Alpha 模式 —— `_Main2nd/3rdTexAlphaMode`

  `main2nd.alphaMode` / `main3rd.alphaMode`（Int · 默认 0）：

      0 = 不改变   1 = 用这一层的 alpha 替换   2 = 相乘
      3 = 相加（截断）   4 = 相减（截断）

  ⚠️ **只在 Cutout / Transparent 下生效** —— lilToon 里整块在
     `#if LIL_RENDER != 0` 里、three 里没有这个宏
     ⇒ 由 `mat.alphaTest > 0 || mat.transparent` 反推。
  ⚠️ 用完会把这一层的 alpha **置 1**（`lil_common_frag.hlsl:805`）
     ⇒ 紧接着的**颜色混合**按满强度算、（这一句很容易漏）

### 4. 抖动 Dither —— `_UseDither` / `_DitherTex` / `_DitherMaxValue`

  `dither: { use, url, maxValue }`、公式照抄（`lil_common_frag.hlsl:524-546`）：

      fd.col.a = fd.col.a >= ( 贴图值 * 255 + 1 ) / ( _DitherMaxValue + 2 ) ? 1 : 0;

  ⚠️ **GLSL ES 1.00 没有 `uint`** ⇒ `lilSamplePointRepeat` 的等价写法：

      vec2 cell = mod( floor( gl_FragCoord.xy ), size );
      vec2 uv   = ( cell + 0.5 ) / size;      // ★ 用纹素中心

  ⚠️ 用**纹素中心**而不是 lilToon 字面的 `uv/size`。
     因为 Unity 那边 `_DitherTex` 一般是 Point 过滤（角=中心 ⇒ 等价）
     而 **three 加载贴图默认是 LinearFilter** ⇒ 落在角上会混合 4 个纹素 ⇒ 点阵被糊掉。

  ⚠️ 贴图默认 white ⇒ 全 1 ⇒ 阈值 = 256/257 ≈ **0.996** ⇒ **几乎全丢**
     想要真正的点阵效果需要一张**有序抖动矩阵**贴图。
     内置两张可直接用：

         assets/test/dither-bayer4.png   4×4   16 个不同值
         assets/test/dither-bayer8.png   8×8   64 个不同值

### 5. Decal 贴花 —— `_Main2nd/3rdTexIsDecal`

  ⚠️ **Decal 不是独立层** ⇒ 它是 main2nd / main3rd 的一个**模式**。
     逻辑在 `lilGetSubTex`（`lil_common_functions.hlsl:719`）里。

  每层 7 个开关 + 2 个 vec4：

      isDecal / isLeftOnly / isRightOnly / shouldCopy / shouldFlipMirror / shouldFlipCopy
      decalAnimation (4)   // (列数, 行数, 固定帧, 帧率) 默认 (1,1,1,30)
      decalSubParam  (4)   // (宽, 高, 向中心吸附, 1)    默认 (1,1,0,1)

  三段公式（照抄）：

      lilCalcDecalUV（:473）：
          if(shouldCopy) outUV.x = abs(outUV.x - 0.5) + 0.5;
          outUV = outUV * uv_ST.xy + uv_ST.zw;
          if(shouldFlipCopy && uv.x < 0.5) outUV.x = 1.0 - outUV.x;
          if(shouldFlipMirror && isRightHand) outUV.x = 1.0 - outUV.x;
          if(isLeftOnly  &&  isRightHand) outUV.x = -1.0;
          if(isRightOnly && !isRightHand) outUV.x = -1.0;
          outUV = (outUV - uv_ST.zw) / uv_ST.xy;      // 旋转前先逆 ST
          outUV = lilRotateUV(outUV, angle);
          outUV = outUV * uv_ST.xy + uv_ST.zw;

      lilCalcAtlasAnimationAtAnimTime（:533）—— 图集帧动画
      边缘 AA（:748）：outCol.a *= lilIsIn0to1( uv2, saturate(nv - 0.05) )
          ⚠️ HLSL 把 float2 传给 float ⇒ **隐式截断成 .x** ⇒ **只判 x 方向**。

  ⚠️ `isRightHand` = **切线 W 的符号**（`lil_pass_forward_normal.hlsl:341`）
     没有切线的模型 ⇒ 恒为 1.0（= lilToon 的初值、`lil_common.hlsl:162`）
  ⚠️ `isDecal` 的边缘 AA 会清掉 `decalUv.x` 落在 [0,1] 之外的像素。
     用超出 [0,1] 的 UV 通道时必须设 `texST` 把范围压进来。

  ### ⚠️ 实用性说明（避免误会）

  **Decal 不是「把一张图贴到脸上某个位置」的工具**、它是给这一层的贴图
  **换一套采样规则**（换 UV / 镜像 / 单侧 / 图集动画 / 裁到 [0,1]）
  ⇒ 真正的「贴花」来自**模型/美术提供了一套为贴花准备的 UV**。
  ⇒ BA 系列的 uv1 是大范围重复的 ⇒ `texture2D(tex, uv1)` 只会得到**条纹**。
     （Unity 里用同样的 UV1 + 同样的 ST 会出现一模一样的条纹、不是 bug）

  ⇒ `texST` 在这里的实际用法是「**取贴图哪一块放大铺满**」、不是自由摆放。
  ⇒ 「★Decal 调试」= 2 可以把 decal UV 直接输出成颜色、用来确认 UV 落在哪。

### 6. 反射 / 镜面高光 —— `_UseReflection` / `_ApplySpecular`

  `reflection: { use, apply, toon, border, blur, normalStrength, smoothness,
                reflectance, metallic, color, blendMode, aaStrength }`

  ⚠️ **`_UseReflection` 默认 0** ⇒ lilToon 默认**不画高光**。
     19 个官方预设里只有 3 个开（Inorganic-Glass / LiteGlass / Metal）
     ⇒ 这是**金属 / 玻璃类**材质的功能、皮肤/衣服/头发都不开。

  公式照抄（`lil_common_frag.hlsl:1189-1208` / `:1348`）：

      N  = lerp( fd.origN, fd.N, _SpecularNormalStrength );
      H  = normalize( fd.V + L );
      nh = saturate( dot( N, H ) );
      if ( _SpecularToon )
          reflectCol = lilTooningScale( _AAStrength, pow( nh, 1.0/fd.roughness ),
                                        _SpecularBorder, _SpecularBlur );
      fd.col.rgb = lilBlendColor( fd.col.rgb, reflectionColor.rgb * lightColorSpc,
                                  reflectCol * reflectionColor.a, _ReflectionBlendMode );

  `roughness = (1 - _Smoothness)²`（`lil_common.hlsl:200` + `lil_common_frag.hlsl:1311-1312`）

  ⚠️ **`_Smoothness = 1`（默认）⇒ `roughness = 0` ⇒ `pow( nh, 1.0/0.0 )`**。
     HLSL：`pow(x, +INF)` 对 x<1 返回 0 · x>=1 返回 1
     GLSL：**指数为无穷是未定义行为** ⇒ 显式写成 `ba3dSpNH >= 1.0 ? 1.0 : 0.0`。

  ⚠️ 装饰层顺序（`lil_pass_forward_normal.hlsl:335-470`）。
     Reflection 在 **Backlight 之后 · MatCap 之前**。

  ⚠️ 有意未做：`_ReflectionCubeTex`（Unity 靠 Reflection Probe）· 非卡通的完整 GGX。

### 7. ★ 描边与透明材质（行为变更）

  **lilToon 没有「透明材质就跳过描边」这条规则**、它给透明材质也画描边。
  ⇒ 我们原来那条是自己加的近似 ⇒ **已去掉**。

  ### 现在的行为

      · 透明材质**照常画描边**
      · 描边材质 `transparent` 跟着源 ⇒ **`depthWrite = false`**
        （否则不透明的壳会把半透明本体**深度剔除**成实心、踩过一次）
      · 描边颜色 / alpha 来自 `_OutlineColor`（面板上的描边色 + 透明度）
        ⚠️ **不乘源材质的 alpha** —— lilToon 里 `fd.col.a *= _OutlineColor.a`。
           「跟着透明」的真正机制是**描边 pass 继承材质的 `_TransparentMode`**
           （混合 / 深度状态）、不是把 alpha 乘起来。

  ### ⚠️ 描边有**两套系统**、状态要共享

      ① three 的 OutlineEffect（非 lilToon 模式）
      ② `applyLilOutline()` 的独立反壳网格（lilToon 模式）

  ⇒ 两套各自有「跳过」规则、**改一处不会影响另一处**、（踩过一次）
  ⇒ 现在 `applyLilOutline` 也会读 `userData.outlineParameters.visible`。

  ### 相关配置

      outline.skipPattern      按**网格名**正则排除（默认 "Halo"、薄板会戳穿自身造成闪烁）
      outline.skipTransparent  【我们的开关】半透明材质要不要整个跳过描边
                               ⚠️ 默认 **false** = 画出来（= lilToon）
                               只有极端薄板情况才需要打开。
      （off = true 的地面 / 嘴部贴片 **始终**跳过、和透明无关）

### 8. ★ 布局：有贴图 ⇒ 这一层就算启用

  ⚠️ lilToon 的 `_UseMain2ndTex` 是**单独一个开关**、而用户的心智模型是
     「选了贴图 = 这层在用了」⇒ 不打开的话 `lilMainLayerGLSL` 第一行就
     `return null` ⇒ **面板上后面所有参数全部没反应**、但贴图那行明明显示了文件名。
     （踩了很久、用户原话：「我是用上传贴图当启用了」）

  ⇒ 三道保险：

      ① 面板 `mkTex`：给层的主贴图选文件时顺带 `use = true`
      ② `applyLilConfig`：`tex` 有值 ⇒ `G.use = true`（任何路径）
      ③ **读取路径** `normalizeLayerUse()`：`lilCfgFor` 的两个返回点都过一遍
         ⇒ 连**老配置**（贴图早选好了、不会再触发 onchange）也会被补上。

  ⚠️ 副作用：**不能**靠「启用 = 0」临时关掉一个已有贴图的层。
     想关掉请点贴图那行的「清除」、（符合直觉）

### 9. ★★ 一个**长期 bug** 的修复（影响面最大）

  ⚠️ three 的 toon 光照读的是 **`material.diffuseColor`**（那个 struct）。
     **不是**局部的 `diffuseColor`：

      lights_toon_pars_fragment：
          reflectedLight.directDiffuse   += irradiance * BRDF_Lambert( material.diffuseColor );
          reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );

  ⇒ 而我们一直写局部 `diffuseColor` ⇒ **对光照毫无影响**。
  ⇒ 而 `enableLighting = 1` 时 after 块又是 `srcA = a × (1-el) = 0` ⇒ **两边都不出力**。
  ⇒ ⇒ **「参与光照比例 = 1」（默认）时「主色层 2nd / 3rd」彻底不可见**。
     功能实际是**半废**的、潜伏了很久。

  ### ✅ 修法：额外产出一段 `afterMaterial`

      #include <lights_fragment_begin> 之前  ⇒ before        （算层色 · 写 diffuseColor）
      #include <lights_fragment_begin> 之后  ⇒ afterMaterial （喂 material.diffuseColor）★
      #include <dithering_fragment> 之前      ⇒ after         （未受光部分 / 溶解边缘）

      material.diffuseColor.rgb = mix( material.diffuseColor.rgb,
                                        ba3dColor2nd.rgb, ba3dColor2nd.a * el );

  ⚠️ **必须在 include 之后** —— `material` 是在**那个 include 里面**被赋值的。
  ⚠️⚠️ **不能引用 `ba3dLc`** —— 它是 before 那个 `{ }` 块里的局部变量。
     而 afterMaterial 在块外面 ⇒ GLSL 没有块外可见性 ⇒ 编译失败。
     ⇒ 用前导里声明过的 `ba3dColor2nd` / `ba3dColor3rd`。

### 9.5 补齐：层溶解 / Decal 调试 / MatCap / 描边模板


  #### 主色层 2nd / 3rd 的层溶解（`main2nd.dissolve*` / `main3rd.dissolve*`）

  | 键 | 默认 | 对应 |
  |---|---|---|
  | `dissolveThreshold` | 0 | `_Main2ndDissolveParams.x` 阈值（贴图模式的判据） |
  | `dissolveSoftness` | 0 | `..y` 羽化（边界柔化） |
  | `dissolveDir` | 0 | `..z` 方向：0=用顶点色 · 1=用贴图 |
  | `dissolveNoiseStrength` | 0 | `_Main2ndDissolveNoiseStrength` 噪声强度 |

  ⚠️ 层溶解的参数在 lilToon 里是打包进 **vec4** 的（`.x` 阈值 / `.y` 羽化 /
     `.z` 方向）、面板上拆成了三个滑杆。
  ⚠️ 溶解的 `alphaTest` 必须 ≥ 0.5 才会真正 discard。
     而 `alphaTest` 的**唯一权威**是 `syncDissolveAlphaTest`、（见第 1 节）

  #### Decal 调试开关（`main2nd.decalDebug` / `main3rd.decalDebug`）

  **我们额外做的**（lilToon 没有）、默认 0：

      0 = 正常
      1 = 跳过 Decal 的边缘 AA（保留贴图原 alpha）
      2 = 把 decal UV 输出成颜色（R=uv.x · G=uv.y · B=1 · a=1）
      3 = 强制 alpha = 1（保留 RGB）

  ⇒ 用来二分定位「开了 Decal 但画面没变化」：

      1 有变化 ⇒ 是**边缘 AA** 把 alpha 清成 0 了（decal UV 出了 [0,1]）
      2 有变化 ⇒ 采样在跑 ⇒ 问题在 alpha / 混合
      3 有变化 ⇒ 采样到了 ⇒ 问题在颜色 / 混合
      都没变化 ⇒ 这段 GLSL **根本没进着色器**（看 `[inject]` 日志）

  #### 层的 UV 旋转角（`main2nd.texAngle` / `main3rd.texAngle`）

  对应 `_Main2ndTexAngle`、默认 0、单位是弧度。
  ⚠️ 旋转围绕 **(0.5, 0.5)**、不是 UV 原点。
  ⚠️ 如果这一层的 UV 本身是一小块岛（脸部贴花常见）、旋转后可能整块
     跑出采样范围 ⇒ 看起来像「消失了」而不是「转了」。

  #### MatCap 的两个额外键（`matcap.*` / `matcap2nd.*`）

  | 键 | 默认 | 对应 |
  |---|---|---|
  | `customNormal` | 0 | `_MatCapNormalStrength` 的开关（是否用法线贴图扰动 MatCap 的 N） |
  | `vrParallax` | 1 | `_MatCapVRParallaxStrength` ⚠️ **非 VR 下是空操作**、见 `LILTOON2.x.md §7.1` |

  ⚠️ `vrParallax` 保留只是为了对齐 lilToon 的属性表、在 Web 里**永远没有效果**。
     （`lil_common_macro.hlsl:696`：`!USING_STEREO_MATRICES` 时直接返回 b）

  #### 描边的模板参数（`outline.stencilPass` / `outline.stencilReadMask`）

  | 键 | 默认 | 对应 |
  |---|---|---|
  | `stencilPass` | 0 | `_OutlineStencilPass`（描边自己的模板操作） |
  | `stencilReadMask` | 255 | `_OutlineStencilReadMask` |

  ⇒ 还有一组同族的 `outline.stencil*`（Ref / Comp / WriteMask / Fail / ZFail）
     见 `CONFIG.md` 的「模板模式下拉」一节。
  ⚠️ three 没有 Unity 那么完整的模板 API ⇒ 只映射了能做的那几个。
     做不了的（如 `_StencilFail` 的部分组合）落在已知偏差里。

### 10. 诊断日志一览（排查时先看这些）

      [layer] 2nd | use=… tex=… isDecal=… uvMode=… blendMode=… enableLighting=…
          ⇒ **无条件**打在 lilMainLayerGLSL 的 return null **之前**
             （打在分支里的话「没有日志」这件事本身无法区分原因）
      [inject] <材质> 层2nd | 命中 include=… | before 长度=… | 注入后含 ba3dLc=…
          ⇒ **注入时刻**的日志、区分「文本被生成」和「文本被插进着色器」。
      [decal] 2nd | … rawTexST=… rawAnim=… rawSub=…
          ⇒ 含**原始值**、一眼看出面板有没有写进来。
      [uv-check] <材质>：uv1 存在 · 跨度=… · 切线 有/没有
          ⇒ Decal / 单侧显示的前置体检。
      [lightClamp] / [reflection] / [mainTex] / [dither] / [renderState] / …

  ⚠️ 经验：**诊断要打在你怀疑的那个判定之前**、否则信息量不足。
