# 贡献指南

欢迎问题报告、最小复现与渲染改进。开始前建议先读 [lilToon 移植基线](docs/LILTOON2.x.md)、[配置与实现细节](docs/CONFIG.md) 和 [部署说明](docs/DEPLOY.md)。

## 从源码构建

需要 Node.js 20 或更高版本。

```bash
npm install                       # 仅首次
node scripts/serve.mjs            # 静态服务器，用于调试界面
node scripts/build.mjs            # dist/3d-viewer.js（未压缩）
node scripts/build.mjs --minify   # dist/3d-viewer.min.js（部署用）
```

产品代码是 `viewer.js`、`index.html`、`unity-anim.js`、`unity-scene.js`、`liltoon-bridge.js`；上游运行时在 `vendor/three-liltoon`（随包分发）；它的源码与上游版本对照保留在研究目录，升级时需要同步 `scripts/make-deploy.mjs` 中的清单。

提交前必须运行三个检查器：

```bash
node scripts/check-deploy.mjs            # 部署目录可加载：无失败请求、无页面错误、面板与导出区完整
node scripts/check-release-safety.mjs    # 随包文档无内部路径、无死链；模型只有 assets/sample.glb
node scripts/check-lilsrc.mjs            # 第 4 后端部署检查：描边、材质残留、像素残留
```

专项检查器（`check-docs`、`check-glsl`、`check-panel`、`check-assets`、`check-scope`）按改动面选用。发版顺序见 `scripts/make-devpack.mjs` 头部的发布检查单：先文档，再三个包，最后三个检查器。

## 源码地图

| 位置 | 职责 |
| --- | --- |
| `viewer.js`、`index.html` | 查看器主体、界面与 lilToon 参数面板 |
| `unity-anim.js`、`unity-scene.js` | Unity 动画与场景导入 |
| `liltoon-bridge.js` | 我们的配置与上游运行时之间的适配层 |
| `vendor/three-liltoon` | 上游运行时（0.1.9，随包分发） |
| `assets`、`vendor/three` | 随包资源、three 依赖 |
| `docs` | 除 README 与第三方声明外的全部文档（三种语言） |
| `scripts` | 构建与检查脚本 |
| 研究目录 | 上游源码、实验、内部文档、归档；不进入任何包 |
| `models` | 测试模型与贴图夹具；**不要修改** |

## 报告渲染问题

请附：模型与贴图来源、浏览器与 GPU、着色模式、相关的 lilToon 参数与贴图、控制台警告、复现步骤。有最小程序化场景或可分发模型时优先用它。

与 Unity 的差异请同时给出 lilToon 版本，以及一致的相机、光照与颜色空间设置（本项目参考工程为 Built-in 管线、Linear 颜色空间、无后处理）。

数字结论要写清夹具、口径与判据；仅凭一张 WebGL 截图不足以说明与 Unity 一致，需要同场景同参数的对照。

## 提交约定

- 文档除 `README.md` 与 `THIRD-PARTY-NOTICES.md` 外一律放在 `docs` 目录，部署包保持同样的布局
- 三种语言（`X.md`、`X.en.md`、`X.ja.md`）必须同一次改动里一起更新
- 随包文档不写仓库内部路径（`check-release-safety` 会拦截）
- 包内新增文件名使用 ASCII：自制打包器不支持非 ASCII 文件名，会静默丢文件
- 不提交无权限再分发的第三方素材
