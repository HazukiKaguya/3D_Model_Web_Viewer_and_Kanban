# 3D 角色模型网页内嵌看板娘 部署说明

纯静态站点，**无构建步骤、无 CDN 依赖、无需 Node**，全部使用相对路径（根路径/子路径部署都不用改配置）。
`dist/` 已预打包好，直接把本目录里的**全部文件按原样上传到网站根目录**（或任意子目录）即可，静态托管即可运行（Nginx / Apache / Netlify / Cloudflare Pages / OSS / COS 都行）。

> 想本地先看一眼：在**开发仓库**里执行 `node scripts/serve.mjs 5199`，然后打开 <http://127.0.0.1:5199/>。
> （部署包里不含 `scripts/`，也不需要 Node —— 直接用浏览器打开或随便一个静态服务器都行。）

| 平台 | 处理 |
|---|---|
| Netlify / Cloudflare Pages | 仓库内 `_headers` 已配好 |
| Apache | 仓库内 `.htaccess` 已配好 |
| GitHub Pages | 已附 `.nojekyll` |
| Nginx | `mime.types` 最好加上 `model/gltf-binary glb;` |

## 一、必须上传的文件

| 路径 | 说明 |
|---|---|
| `index.html` | 3D 模型查看器（全屏、控制台 UI） |
| `viewer.js` | 查看器核心（`createViewer` / `autoMount`，ES module，被 index.html 直接引用） |
| `vendor/three/three.module.js` | three.js r185.1 本体（importmap 里 `"three"` 指向它） |
| `vendor/three/three.core.js` | ↑ r185 起拆出的核心，`three.module.js` 用相对 import 引用它，**不能漏** |
| `vendor/three/controls/OrbitControls.js` | 相机交互（旋转 / 缩放） |
| `vendor/three/loaders/GLTFLoader.js` | 模型加载（`.glb` / `.gltf`）|
| `vendor/three/loaders/FBXLoader.js` | 模型加载（`.fbx`）|
| `vendor/three/libs/fflate.module.js` | ↑ FBXLoader 的传递依赖（二进制 FBX 解压），**不能漏** |
| `vendor/three/curves/NURBSCurve.js` | ↑ FBXLoader 的传递依赖，**不能漏** |
| `vendor/three/curves/NURBSUtils.js` | ↑ NURBSCurve 的传递依赖，**不能漏** |
| `vendor/three/environments/RoomEnvironment.js` | PBR 环境的烘焙贴图 |
| `vendor/three/effects/OutlineEffect.js` | 描边 |
| `vendor/three/utils/BufferGeometryUtils.js` | ↑ GLTFLoader 的传递依赖，**不能漏** |
| `vendor/three/utils/SkeletonUtils.js` | ↑ 同上（依赖链的一环）|
| `assets/sample.glb` | 模型文件（演示用，换自己的模型直接替换即可） |
| `assets/sample.json` | 该模型的配置：模型 / 嘴部贴图 / 缩放 / 取景 / 渲染 / 打光 / 背景 |
| `assets/fallback.json` | 同上，指向同一个模型；留作"复制一份改三处"的模板 |
| `assets/mouth/*.png` | 嘴部图集贴图（`sample.json` 用的是 `Character_Mouth_High.png`） |
| `.htaccess` | Apache 用：`.glb` 的 MIME + 缓存策略 |
| `_headers` | Netlify / Cloudflare Pages 用：同上 |
| `.nojekyll` | GitHub Pages 用：0 字节标记文件，阻止 Jekyll 处理（**空的就是对的**） |
| `nginx-3d-viewer.conf` | nginx 用：配置模板，照抄到 `server { }` 里（见第三节） |
| `DEPLOY.md` | 本文件 |

> `viewer.js` 只依赖上表里的 5 个 vendor 文件。整个 `vendor/` 目录一共 1.4 MB。

## 一·五、这个部署目录是怎么来的（给维护者）

  ⚠️ `_deploy/ba3d-viewer/` **不是手工攒的**、由脚本按**显式清单**生成：

      node scripts/make-deploy.mjs            # 重建（会先清空目标目录）
      node scripts/make-deploy.mjs --check    # 只比对 · 不一致 exit=1（CI 用）

  ⇒ 清单里**每一项**都必须能从仓库里找到源（见下表）
  ⇒ 想往部署包里加东西、**必须改脚本里的 `MANIFEST`**、并同步本文档的两张表。

  ### 为什么要有这个约束

  之前是手工攒的、于是飘过两次：

      · 留了一份**旧的 + 编码损坏**的 `check-glsl.mjs`（6.6 KB、无人引用）
      · 又把整个 `scripts/` 拷了进去 ⇒ 部署包里多了 5 个**开发工具**
        （而本文档第 7 行**明写着**「部署包里不含 `scripts/`」）

  ### `deploy-src/` 是什么

  有几个文件**只属于部署包**、仓库根目录里没有对应源：

      deploy-src/.htaccess              → .htaccess
      deploy-src/_headers               → _headers
      deploy-src/.nojekyll              → .nojekyll            （0 字节）
      deploy-src/nginx-3d-viewer.conf   → nginx-3d-viewer.conf
      deploy-src/_lilpresets.json       → _lilpresets.json     （面板的 lilToon 预设数据）

  ⇒ 集中放到 `deploy-src/`、这样整个部署目录就是**完全可重现**的。

  ### 现在一共 **38 个文件（10.50 MB）**、（`kanban-demo.html` 已删、功能被 `embed-demo.html` 完全覆盖）

      必需  index.html · viewer.js · vendor/three 的 12 个 ·
            assets（sample.glb / 2 个 json / 3 张嘴部贴图）·
            .htaccess / _headers / .nojekyll / nginx-3d-viewer.conf / DEPLOY.md
      可选  dist 两个 · 2 个演示页 · 4 份文档 · _lilpresets.json ·
            2 张嘴部索引图 · 4 张测试贴图

  ⚠️ **不含 `scripts/`**（开发工具、Node 脚本、静态站点用不到）
  ⚠️ **不含** `models/` · `archive/` · `liltoon-2.3.4/` · `assets/test/` 之外的东西。

> ⚠️ 开发期的 6 个检查器（`scripts/check-*.mjs` · `make-deploy.mjs`）**不在部署包里**。
> 其中 `check-layout.mjs` 会用**无头浏览器**验证浮窗布局（拖动/缩放/持久化）
> ⇒ 部署时不需要 Node、也不需要浏览器自动化。

> ⚠️ **`index.html` 现在是浮窗布局**（Unity 风格）、场景 / 工具栏 / 状态 /
> 参数面板都是可拖动可缩放的独立窗口、位置尺寸存在浏览器的 localStorage 里。
> ⇒ 与部署无关（纯前端）、详见 `CONFIG.md` 的「★ 浮窗布局」一节。

## 二、可选文件（不影响运行，删掉也能跑）

| 路径 | 说明 |
|---|---|
| `embed-demo.html` | 3D 模型网页内嵌看板娘演示页（浮层 + 动作选单 + 百分比缩放） |
| `dist/ba3d-viewer.js` | **自包含单文件版**（约 1.07 MB），给别的页面用 `<script type="module">` 引入，**不需要 importmap、不需要 vendor/** |
| `dist/ba3d-viewer.min.js` | 上者的压缩版（约 0.59 MB），`embed-demo.html` 用的就是它 |
| `CONFIG.md` | 配置字段完整参考（含 `data-*` 属性、事件、全局钩子） |
| `README.md` | 项目说明 |
| `assets/mouth/_cells-preview-*.png` | 嘴部图集 8×8 索引图，挑 `mouthCell` 时照着看用 |

跑主页面真正必需的就是：**`index.html` + `viewer.js` + `vendor/three/` 的 12 个文件 + `assets/` 里的模型与配置**。
表格里其余几项都是按平台/用途可选的（`.htaccess` / `_headers` / `.nojekyll` / `nginx-3d-viewer.conf` / `DEPLOY.md`）。

## 三、部署到子目录（例如 nginx 的 `api.sample.site/3d-viewer/`）

**文件一个都不用改** —— 页面里所有引用都是相对路径（`./viewer.js`、`./vendor/three/...`、`./assets/...`），
importmap 里也是 `./vendor/three/`，所以整目录放进任意子目录都能直接跑。

只需要注意两点：

### 1. 必须带结尾斜杠访问

```
✅  https://api.sample.site/3d-viewer/
❌  https://api.sample.site/3d-viewer
```

没有结尾斜杠时，浏览器会把 `3d-viewer` 当成**文件**，于是相对路径 `./vendor/three/...`
会解析到站点根目录 `/vendor/three/...` → 全部 404、白屏。用 nginx 强制跳转即可：

```nginx
location = /3d-viewer {
    return 301 /3d-viewer/;
}
```

### 2. nginx 配置

`.htaccess` 是 Apache 的、`_headers` 是 Netlify / Cloudflare Pages 的，**nginx 两个都不读**，
需要手动配 MIME 和缓存。完整可抄的配置见同目录 **`nginx-3d-viewer.conf`**，核心是：

```nginx
location /3d-viewer/ {
    index index.html;
    try_files $uri $uri/ =404;

    location ~* \.(glb|png|js|mjs)$ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
    location ~* \.json$ {
        add_header Cache-Control "no-cache";     # 配置改完上传即生效
    }
}
```

`.glb` 的 MIME 建议直接加到全局 `/etc/nginx/mime.types`（一行）：

```
model/gltf-binary  glb;
```

> ⚠️ 别在 location 里写裸的 `types { model/gltf-binary glb; }` —— nginx 的 `types` 块
> **会整体覆盖**继承来的类型表，`html` / `css` / `png` 会全变成
> `application/octet-stream`（浏览器变成下载而不是显示页面）。
> 非要在 server 块里补，就必须先 `include mime.types;`。

### 目录结构不能变

```
3d-viewer/
├── index.html
├── viewer.js
├── .htaccess           ← Apache 用
├── _headers            ← Netlify / Cloudflare Pages 用
├── .nojekyll           ← GitHub Pages 用（0 字节）
├── nginx-3d-viewer.conf← nginx 用
├── vendor/three/…      ← 必须和 index.html 同级（importmap 指向 ./vendor/three/）
│   ├── three.module.js
│   ├── three.core.js
│   ├── controls/OrbitControls.js
│   ├── loaders/GLTFLoader.js
│   ├── environments/RoomEnvironment.js
│   ├── effects/OutlineEffect.js
│   └── utils/BufferGeometryUtils.js   ← GLTFLoader 的传递依赖，不能漏
├── assets/
│   ├── sample.glb      ← 模型
│   ├── sample.json     ← 配置
│   ├── fallback.json
│   └── mouth/*.png     ← 嘴部图集
├── dist/…              ← 可选：给别人嵌入用的自包含单文件版
└── *.html / *.md       ← 可选：演示页和文档
```

### 顺手验证

```bash
curl -I https://api.sample.site/3d-viewer          # 期望 301 → …/3d-viewer/
curl -I https://api.sample.site/3d-viewer/         # 期望 200
curl -I https://api.sample.site/3d-viewer/vendor/three/three.module.js   # 期望 200
curl -I https://api.sample.site/3d-viewer/assets/sample.glb             # 期望 200
```

---

## 四、服务器要求

1. **`.glb` 要返回正确 MIME**
   没有的话浏览器仍能加载（GLTFLoader 不看 MIME），但部分 CDN / 中间层会拦。用 `.htaccess` 或 `_headers` 配好即可。

2. **`assets/*.json` 不要长缓存**
   配置文件是运行时读取的，改了要立刻生效。两个配置文件里都设了 `no-cache`。
   如果托管平台不认这两个文件（**nginx 两个都不读**，见第三节），手动加上：
   ```nginx
   location ~* \.json$ { add_header Cache-Control "no-cache"; }
   location ~* \.glb$  { default_type model/gltf-binary; }
   ```

3. **必需支持 ES module + importmap**
   现代浏览器都支持。`index.html` 里用的是：
   ```html
   <script type="importmap">
   { "imports": { "three": "./vendor/three/three.module.js", "three/addons/": "./vendor/three/" } }
   </script>
   ```
   **上传时目录结构不能改**，`vendor/three/` 必须和 `index.html` 同级。

4. **所有路径都是相对的**，所以放域名根目录或子目录（如 `/ba3d/`）都可以，不用改任何文件。

## 五、上传后可以打开的地址

| 地址 | 内容 |
|---|---|
| `/` | 全屏查看器（含"自定义模型"上传面板） |
| `/?config=./assets/sample.json` | 演示模型 |
| `/embed-demo.html` | 网页内嵌看板娘演示 |

## 六、想只部署一个模型

只传那一个 `.glb` + 它对应的 `.json` + 用到的 `assets/mouth/*.png` 即可。
当前部署包里就是这种形态：只有一个 `sample.glb`，配 `sample.json`（和指向同一模型的 `fallback.json`）。
`fallback.json` 只是留给你当模板用，删掉不影响运行。

## 七、换模型 / 加模型

1. 把 `.glb` 放进 `assets/`
2. 复制一份现成的 `.json`（`assets/fallback.json` 就是模板），改三处：
   - `model.url` → 指向新的 `.glb`（相对 json 自身所在目录）
   - `model.mouthAtlas` → 嘴部图集
   - `animation.name` → 想要的开场动作（也可留简写如 `"Cafe_Idle"`）
3. 访问 `/?config=./assets/你的.json` 验证

字段含义见 `CONFIG.md`。
