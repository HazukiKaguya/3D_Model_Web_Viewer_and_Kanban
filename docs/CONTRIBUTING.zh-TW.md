# 貢献指南

[简体中文](../CONTRIBUTING.md) ｜ **繁體中文** ｜ [English](CONTRIBUTING.en.md) ｜ [日本語](CONTRIBUTING.ja.md) ｜ [한국어](CONTRIBUTING.ko.md)

欢迎問題報告、最小復现與渲染改進。開始前建議先讀 [lilToon 移植基線](LILTOON2.x.zh-TW.md)、[設定與實现細節](CONFIG.zh-TW.md) 和 [部署說明](DEPLOY.zh-TW.md)。

## 從源碼構建

需要 Node.js 20 或更高版本。

```bash
npm install                       # 僅首次
node scripts/serve.mjs            # 靜態服務器，用於調試界面
node scripts/build.mjs            # dist/3d-viewer.js（未壓縮）
node scripts/build.mjs --minify   # dist/3d-viewer.min.js（部署用）
```

產品程式碼是 `viewer.js`、`index.html`、`unity-anim.js`、`unity-scene.js`、`liltoon-bridge.js`；上游運行時在 `vendor/three-liltoon`（隨包分發）；它的源碼與上游版本對照保留在研究目錄，升級時需要同步 `scripts/make-deploy.mjs` 中的清單。

提交前必須運行三個檢查器：

```bash
node scripts/check-deploy.mjs            # 部署目錄可加載：無失敗請求、無頁面錯誤、面板與匯出区完整
node scripts/check-release-safety.mjs    # 隨包文檔無內部路徑、無死鏈；模型只有 assets/sample.glb
node scripts/check-lilsrc.mjs            # 第 4 後端部署檢查：描邊、材質残留、像素残留
```

專項檢查器（`check-docs`、`check-glsl`、`check-panel`、`check-assets`、`check-scope`）按改動面選用。發版順序見 `scripts/make-devpack.mjs` 頭部的發布檢查單：先文檔，再三個包，最後三個檢查器。

## 源碼地圖

| 位置 | 職責 |
| --- | --- |
| `viewer.js`、`index.html` | 查看器主體、界面與 lilToon 參數面板 |
| `unity-anim.js`、`unity-scene.js` | Unity 動畫與場景導入 |
| `liltoon-bridge.js` | 我們的設定與上游運行時之間的適配層 |
| `vendor/three-liltoon` | 上游運行時（0.1.9，隨包分發） |
| `assets`、`vendor/three` | 隨包資源、three 依賴 |
| `docs` | 除 README 與第三方聲明外的全部文檔（五種語言） |
| `scripts` | 構建與檢查腳本 |
| 研究目錄 | 上游源碼、實驗、內部文檔、歸檔；不進入任何包 |
| `models` | 測試模型與貼圖夾具；**不要修改** |

## 報告渲染問題

請附：模型與貼圖來源、瀏覽器與 GPU、著色模式、相關的 lilToon 參數與貼圖、控制台警告、復现步驟。有最小程序化場景或可分發模型時優先用它。

與 Unity 的差異請同時给出 lilToon 版本，以及一致的相機、光照與顏色空間設置（本項目參考工程為 Built-in 管線、Linear 顏色空間、無後處理）。

數字結論要寫清夾具、口徑與判據；僅憑一張 WebGL 截圖不足以說明與 Unity 一致，需要同場景同參數的對照。

## 提交約定

- 文檔除 `README.md` 與 `THIRD-PARTY-NOTICES.md` 外一律放在 `docs` 目錄，部署包保持同樣的布局
- 五種語言同一次改動裡一起更新
- 隨包文檔不寫倉庫內部路徑（`check-release-safety` 會攔截）
- 包內新增檔案名使用 ASCII：自制打包器不支持非 ASCII 檔案名，會靜默丟檔案
- 不提交無權限再分發的第三方素材
