# lilToon 1.3.7 → Web (three.js) 旧ベースライン対照（アーカイブ済み）

[简体中文](LILTOON1.x.md) ｜ [繁體中文](LILTOON1.x.zh-TW.md) ｜ [English](LILTOON1.x.en.md) ｜ **日本語** ｜ [한국어](LILTOON1.x.ko.md)

> ⚠️ **本ドキュメントはアーカイブ済みです** —— これは**旧ベースライン lilToon 1.3.7** の対照と照合を記録したものです。
> **現在有効なベースラインは 2.3.4** です。[`LILTOON2.x.ja.md`](LILTOON2.x.ja.md) を参照してください。
>
> 本ドキュメントを残している理由：
>   · フェーズ 1〜3 の**完成度の記録**と当時の判断過程
>   · **アウトライン（Outline）の完全仕様**（ソースコードレベル、依然有効）
>   · **プリセットのマテリアル単位**のアーキテクチャ改造案（依然有効）
>   · 多くの「なぜこうしたのか」という導出は、移行時に書き直していません。
>
> ⚠️ 中の**行番号参照は 1.3.7 のもの**です。ソースを調べる場合は LILTOON2.x.md §4 のソースマップを使ってください。
# lilToon → Web (three.js) 対照表

> 目的：lilToon のどの効果が本ビューア（three.js r160）で再現でき、どのような入力が必要かを判断すること。
>
> **実ソースまで照合済み**：`lilToon/`（ワークスペース、`jp.lilxyzw.liltoon` **v1.3.7**、Unity 2018.1+）。
> 第 2 節の項目ごとの判断はソースの通読によるもので、第 6 節に**正確な式とファイル行番号**を示します。
> パネル項目名は 1.3.7 の `Editor/` と `lts.shader` に基づいて整理しています。あなたの Unity で一致しない場合は、実際に見えているものを優先してください。

---

## 一、結論から先に

| 問い | 結論 |
|---|---|
| lilToon を**丸ごと移植**できますか | ❌ **できません**。Unity ShaderLab + HLSL であり、1 万行以上・数十個の `.cginc` に分割されており、Unity ランタイムに深く依存しています（マルチパス、`UNITY_LIGHT_ATTENUATION`、Lightmap、Light Probe、スクリーンスペースシャドウ、MaterialPropertyBlock）。既成の three.js 移植版はありません。 |
| その**見た目の主体**を書き直せますか | ✅ **できます**。核心は「多段 ramp + 境界色 + Rim + MatCap + マテリアル単位の自発光/逆光 + 反転ハル法アウトライン」——これらの項目が lilToon の描画効果の大部分を占めます。 |
| 最大の障害は何ですか | ⚠️ **技術ではなくパラメータです**。GLB/FBX には「影の境界 = 0.5、リムライト強度 = 0.3、MatCap = `xxx.png`」といった設定は含まれません。見た目は「あなたが書き写してくれたパラメータ」か「汎用の既定値一式」からしか得られません。 |
| テクスチャは入手できますか | ✅ 大部分は可能です：`MainColor` / `NormalMap` / `EmissionMap` / アウトライン用テクスチャは、モデルの隣にテクスチャファイルとして存在するか、GLB に埋め込まれています。 |

---

## 二、Unity から書き写してもらう必要のあるパラメータ

> パネル項目名は lilToon 1.7.x に基づいて整理しています。一致しない場合は実際に見えているものをそのまま書き写してください。
> 判断に迷う項目は**空欄**にしてください。こちらで既定値で補います。

### 基本情報

```
lilToon バージョン：      （1.7.x / 2.0.x / その他）
Unity バージョン：
これは：                  （VRChat アバター / 通常モデル / シーンオブジェクト）
モデルのエクスポート形式：（FBX / GLB）
現在 Web 上で見えている効果：（スクリーンショットがあると尚可）
Unity での参考効果：      （スクリーンショットがあると尚可）
```

### 基本設定

```
色：                      R__ G__ B__  /  #______
影の色：                  R__ G__ B__  /  #______
影の境界：                0.__
影のぼかし：              0.__
2nd 影 有効：             はい / いいえ     色：____  境界：0.__
3rd 影 有効：             はい / いいえ     色：____  境界：0.__
バックライト：            色：____  強度：0.__
```

### メインカラー

```
テクスチャ：              （ファイル名）
色：                      #______
ブレンドモード：          Normal / Add / Screen / Multiply / …
アルファマスク：          （ファイル名、なければ空欄）
カットオフ：              0.__
```

### ノーマルマップ

```
1st：                     （ファイル名）  スケール：0.__
2nd / 3rd：               （ファイル名、なければ空欄）
```

### リムライト

```
有効：                    はい / いいえ
色：                      #______
境界：                    0.__        ぼかし：0.__
方向：                    ライト方向 / 視点方向
マスク：                  （ファイル名、なければ空欄）
```

### マットキャップ

```
1st：                     （ファイル名）  ブレンドモード：____
2nd / 3rd：               （ファイル名、なければ空欄）
```

### エミッション

```
1st：                     （ファイル名）  色：#______  強度：0.__
2nd：                     （ファイル名、なければ空欄）
```

### アウトライン

```
有効：                    はい / いいえ
色：                      #______
太さ：                    0.___
基準：                    法線 / 位置
テクスチャ：              （ファイル名、なければ空欄）
```

---

## 三、推奨する実装順序

「視覚的な効果 ÷ 作業量」で並べたもので、**3 フェーズに分けます**。各フェーズを終えるたびに直接効果を確認できます：

### フェーズ 1 —— 見た目の向上が最も大きい 4 項目

1. **多段 ramp + 境界色**：現在の `celSteps/celDark` を「N 段 + 各段それぞれの色 + 遷移帯の幅」にアップグレードします
2. **Rim Light**：視点エッジライト + 色 + 境界 + マスク
3. **MatCap**：1st スロット（ビュー空間の球面サンプリング）
4. **Emission**：マテリアル単位の自発光 + 強度（2 枚目は今回は行わない）

> これら 4 項目はすべて `onBeforeCompile` の注入範囲内で、レンダリング構成に手を入れないため、リスクが最も低くなります

### フェーズ 2 —— より lilToon に近づける

5. **アウトラインのアップグレード**：`OutlineEffect` から自作の反転ハル法 pass に置き換え → **アウトライン幅テクスチャ**と**頂点カラー制御**に対応
6. **Main Color のブレンドモード**（Add / Screen / Multiply）
7. **Backlight / 逆光**
8. **ディゾルブ**

### フェーズ 3 —— 完了

当初の計画は 2 項目でしたが、実際の実行時には**あなたの要望で法線マップの経路を先にスキップ**し（コストが最大のため）、代わりに「その他」を行いました：

**9. 2nd / 3rd メインカラー層 + 2nd MatCap** —— ✅ 完了
- 2nd / 3rd メインカラー層が各 8 項目（★ `_Main2ndEnableLighting` は「ライティングに参加する**割合**」であり、2 か所への注入が必要）
- MatCap 1st / 2nd が各 11 項目（ついでに 1st に完全版だけにある color / backfaceMask / mainStrength を補完）
- マスク系テクスチャ **3 枚**（`_MatCapBlendMask` / `_MatCap2ndBlendMask` は `.rgb` を取得、`_EmissionBlendMask` は RGBA を取得）
  ⚠️ `_RimBlendMask` / `_BacklightBlendMask` は**存在しません**（Rim は頂点カラーの G を使用）
- ⏸ **2nd / 3rd ノーマルマップ** は自主的に保留
- ❌ 未実施：Decal デカール（7 項目/層）、距離フェードアウト、レイヤー溶解（3 項目/層）

**10. Stencil などの周辺機能** —— ✅ 完了
- Stencil：本体 8 項目 + アウトライン 8 項目、Unity の列挙 → three の定数へのマッピング。
  ★ 前提：`renderer` は `stencil: true` が必須です（three r160 の既定は false で、後から追加することはできません）
  ★ パネル内では **「Stencil モデル」** と **「Stencil アウトライン」** の 2 グループに分けています。
  ★ 「ステンシルモード」ドロップダウンを併設（4 モード、lilInspector.cs から書き出し、うち 2 つの名前は直感と逆）
- アウトライン用テクスチャの `_OutlineTex_ST` / `_OutlineTex_ScrollRotate` / `_OutlineTexHSVG` —— ✅
- ❌ 未実施：自発光の第 2 層（Emission2nd、7 項目）、自発光の GradSpeed / ParallaxDepth / Fluorescence

**⚠️ 法線マップを保留したことによる波及コスト** —— 9 個のパラメータが「スイッチはあるが経路がない」状態で、調整しても効果がありません。
`_Main2ndNormalStrength` / `_Main3rdNormalStrength` / `_MatCapNormalStrength` / `_MatCap2ndNormalStrength` /
`_RimNormalStrength` / `_BacklightNormalStrength` / `_ShadowNormalStrength` /
`_Shadow2ndNormalStrength` / `_Shadow3rdNormalStrength`

**推奨する以降の順序**：① 自発光の第 2 層（低）② レイヤー溶解（低）③ 距離フェードアウト（中）④ Decal（中）⑤ 法線マップの経路（高、一度に 9+3 個のパラメータが解放される）

### 明確に対象外

Glitter、Audio Link、Fur / Gem / Tessellation、Lightmap / Light Probe、スクリーンスペースシャドウ、VRC Light Volumes

---

## 四、事前に必ず知っておくべき 2 つのこと

1. **あなたの Unity とまったく同じにはなりません**
   three.js のライティングモデル、トーンマッピング、影の扱いは Unity とは異なります。パラメータをどれだけ正確に書き写しても、最終的には目に見える差が出ます（特に**影の硬さ/柔らかさ**と**ハイライト**）。目標は「一目見て同じキャラクターの同じ画風」であって、ピクセル単位の一致ではありません。

2. **パラメータはマテリアルごとに書き写す必要があります**
   lilToon は**マテリアル単位**で設定します。1 体のキャラクターの顔、体、服、髪が 4 つのマテリアル、4 セットのパラメータになることもあります。
   マテリアルが多い場合は、**まず「肌」と「髪」の 2 セットだけを書き写す**ことを推奨します。この 2 つで見た目の 80% を占めます。

---

## 五、アウトライン（Outline）完全仕様 —— ソースコードレベル

> `Hidden/lilToonOutline` との関係：あれはエディタがメインシェーダから**生成**するバリエーションです（ソースに独立したファイルはありません）。
> アウトラインのすべてのプロパティは `lts.shader` 内にあり（474〜556 行）、レンダリング時は独立した 1 パスで処理されます。

### 8.1 頂点変位

経路：`lil_vert_outline.hlsl`（29 行、単なるディスパッチ）
     → `lil_common_functions.hlsl:279 lilCalcOutlinePosition`
     → `lil_common_functions.hlsl:254/265 lilGetOutlineWidth`

```hlsl
// lil_common_functions.hlsl:254
float lilGetOutlineWidth(uv, color, outlineWidth, outlineWidthMask, outlineVertexR2Width) {
    outlineWidth *= 0.01;                                   // ★ 1/100
    #if LIL_FEATURE_OutlineWidthMask
        outlineWidth *= SAMPLE(outlineWidthMask, uv).r;     // マスクは R チャンネルを取得
    #endif
    if (outlineVertexR2Width == 1) outlineWidth *= color.r; // 頂点カラーの R を幅として使用
    if (outlineVertexR2Width == 2) outlineWidth *= color.a; // 頂点カラーの A を幅として使用
    return outlineWidth;
}

// lil_common_functions.hlsl:265
float lilGetOutlineWidth(positionOS, positionWS, uv, color, ...outlineFixWidth) {
    outlineWidth = <上記のもの>;
    // ★ 重要：ワールド単位 ↔ 画面上で一定の太さのブレンド
    outlineWidth *= lerp(1.0, saturate(length(lilHeadDirection(positionWS))), outlineFixWidth);
    return outlineWidth;
}

// lil_common_functions.hlsl:279
void lilCalcOutlinePosition(inout positionOS, uvs, color, normalOS, tbnOS, ...) {
    float3 positionWS = <M 行列 × positionOS>;
    float width = lilGetOutlineWidth(...);
    float3 outlineN = normalOS;
    #if LIL_FEATURE_OutlineVectorTex
        outlineN = lilGetOutlineVector(tbnOS, uvs[outlineVectorUVMode], outlineVectorScale, outlineVectorTex);
    #endif
    if (outlineVertexR2Width == 2) outlineN = mul(color.rgb * 2.0 - 1.0, tbnOS);
    positionOS += outlineN * width;
    float3 V = <透視> ? lilViewDirectionOS(positionOS) : <正射>;
    positionOS -= normalize(V) * outlineZBias;
}
```

`lil_common_macro.hlsl`:
- `614 lilHeadDirection(positionWS) = _WorldSpaceCameraPos - positionWS`
  ⇒ `length(...)` は**頂点からカメラまでの距離**です。
- `646 lilViewDirectionOS(positionOS) = オブジェクト空間におけるカメラの位置 - positionOS`

**⇒ `_OutlineFixWidth` の意味**：
| 値 | factor | 効果 |
|---|---|---|
| 0 | 1.0 | 幅が**ワールド単位**（遠くでは細く見える） |
| 1 | saturate(距離) | 幅が**画面上で一定**（透視では距離を掛けることでちょうど相殺される） |
| 0.5（既定）| 両者の補間 | 折衷 |

### 8.2 フラグメントシェーディング

`lil_common_frag.hlsl:349-387`：

```hlsl
fd.col = SAMPLE(_OutlineTex, uv);                       // 有効なら、そうでなければ白
fd.col.rgb = lilToneCorrection(fd.col.rgb, _OutlineTexHSVG);   // 有効なら
float3 outlineLitColor  = _OutlineLitApplyTex ? fd.col.rgb * _OutlineLitColor.rgb : _OutlineLitColor.rgb;
float  outlineLitFactor = saturate(NdotL * _OutlineLitScale + _OutlineLitOffset) * _OutlineLitColor.a;
// _OutlineLitShadowReceive なら、さらに *= fd.attenuation
fd.col.rgb = lerp(fd.col.rgb * _OutlineColor.rgb, outlineLitColor, outlineLitFactor);
fd.col.a  *= _OutlineColor.a;
```

**既定では `_OutlineLitColor.a = 0`** ⇒ `outlineLitFactor = 0` ⇒ **つまり `テクスチャ × _OutlineColor`** です。
受光はオプションの高度な機能です。

### 8.3 すべてのプロパティと既定値（lts.shader:474-556）

| プロパティ | 意味 | 既定 |
|---|---|---|
| `_OutlineColor` | アウトラインの色 | (0.6, 0.56, 0.73, 1) |
| `_OutlineTex` | アウトライン用テクスチャ | white |
| `_OutlineTexHSVG` | 色相/彩度/明度/Gamma | (0,1,1,1) |
| `_OutlineLitColor` | 明るい色 | (1.0, 0.2, 0, **0**) |
| `_OutlineLitApplyTex` | 受光時にテクスチャを掛けるか | 0 |
| `_OutlineLitScale` | 受光の強度 | 10 |
| `_OutlineLitOffset` | 受光のオフセット | -8 |
| `_OutlineLitShadowReceive` | 受光時に影を受け取るか | 0 |
| `_OutlineWidth` | 幅 Range(0,1) ⚠️ [lilOLWidth] | 0.08 |
| `_OutlineWidthMask` | 幅のマスクテクスチャ | white |
| `_OutlineFixWidth` | 固定幅 Range(0,1) | 0.5 |
| `_OutlineVertexR2Width` | 頂点カラーを幅として使用：0 None / 1 R / 2 RGBA | 0 |
| `_OutlineVectorTex` | 法線ベクトルテクスチャ | bump |
| `_OutlineVectorUVMode` | UV0..UV3 | 0 |
| `_OutlineVectorScale` | -10~10 | 1 |
| `_OutlineEnableLighting` | Range(0,1) | 1 |
| `_OutlineZBias` | Z オフセット | 0 |
| `_OutlineDisableInVR` | | 0 |
| `_UseOutline` | 全体スイッチ | 0 |
| `_OutlineCull` | Cull：0 Off / 1 Front / 2 Back | 1 |
| `_OutlineSrcBlend` / `DstBlend` / `SrcBlendAlpha` / `DstBlendAlpha` / `BlendOp` / `BlendOpAlpha` | 個別ブレンド | 1/0/1/10/0/0 |

### 8.4 three.js での実装経路（私たちの移植案）

```
① 载体：各メッシュに**クローンマテリアル**を 1 つ追加します（geometry を共有、side = THREE.BackSide）
   または 2 つ目の Mesh 子ノードを使い、geometry を共有し、マテリアルをクローンします。
   —— OutlineEffect を使わない理由：そのパラメータは thickness/color/alpha だけです。
      幅マスク / 頂点カラー幅 / 固定幅 / Z Bias / 受光を追加できません。

② 頂点変位：onBeforeCompile で #include <begin_vertex> の後に注入
   vec3 outlineN = objectNormal;                      // 頂点属性の法線
   float ow = uOutlineWidth * 0.01;
   ow *= <マスクのサンプル .r>;                        // 有効なら
   ow *= <color.r または color.a>;                    // _OutlineVertexR2Width
   ow *= mix(1.0, saturate(dist), uOutlineFixWidth);  // dist = -mvPosition.z
   transformed += outlineN * ow;
   transformed -= normalize(cameraPosOS - transformed) * uOutlineZBias;

③ フラグメント：uOutlineColor × テクスチャを出力（既定の経路）
   受光部分は 8.2 の式に従います。NdotL が必要 → toon と同じライティングを使用します。

④ レンダリング状態：side = BackSide、depthWrite = true。
   —— OutlineEffect の反転ハル法と同じ考え方ですが、パラメータは完全に自分で制御します。

⑤ FBX が元々正しくなかった理由（3 つの候補原因、実装時に 1 つずつ検証）
   · FBX の単位スケールが 1 ではない → ワールド単位の押し出しが無効になる → _OutlineFixWidth の意味で解決可能
   · FBX のハードエッジ法線 → 押し出しで裂け目が出る → スムーズ法線が必要
   · FBX のスキニング → 反転ハルとメインのレンダリングが一致しない
```

### 8.5 未対応項目

- [ ] アウトラインのマテリアルと頂点変位を実装
- [ ] lilToon のパラメータパネルに接続（幅 / マスク / 頂点カラー / 固定幅 / Z Bias / 色 / 受光）
- [ ] プリセットに接続（プリセット内の `_OutlineWidth` などの値を LIL_PRESETS に記入）
- [ ] GLB と FBX の両方で検証
- [ ] 既存の OutlineEffect 経路を置き換えるかどうかを決定

---

## 六、プリセットは**マテリアル単位** —— アーキテクチャ改造案

> 観察（ユーザー 2026-10-05）：lilToon のプリセットは**マテリアルごとに個別選択**に対応しており、だからこそ
> 肌 / 髪 / 服 / 無機 / 自然 という分類が存在します。使い方は：
>   · 肌のマテリアルスロット  → Skin-* を適用
>   · 服のマテリアルスロット  → Cloth-* を適用
>   · 髪のマテリアルスロット  → Hair-* を適用
> （実際にはほとんどの人は個別に調整しませんが、これが lilToon プリセット本来の設計です）

### 9.1 現状の問題

現在は**グローバルに 1 つだけ `lilCfg` を持つ**構成です：

```js
applyLilPreset('Skin-Anime')   // → モデル全体（髪/服を含む）がすべて肌プリセットにされます。
```

これは lilToon の意味づけと一致しません。

### 9.2 改造案（推奨：グローバル既定 + マテリアル単位の上書き）

```js
lilCfg                       // グローバル既定（既存の構造は変更しない）
lilCfgByMaterial = {         // ★ 新規追加：マテリアル名ごとの上書き
  'Melano_hair_MT_Toon': { shadowBorder: 0.05, rim: { blend: 1, ... } },
  'Melano_cloth_MT_Toon': { shadowBorder: 0.3 },
}
```

**適用箇所**：`patchToonMaterial(mat)` 内で `mat.name` により上書き表を引きます。
グローバルの上に浅いマージを行います。すると：

```
最終パラメータ = { ...lilCfg, ...lilCfgByMaterial[mat.name] }
```

**cacheKey にはマテリアル名を含める必要があります**。そうしないと異なるマテリアルのプログラムが再利用され、パラメータが混ざります。
（現在の key は `ba3d-cel:<version>:<shaderMode>:...` で、`:<matName>` を追加する必要があります）

### 9.3 UI の変更

パネルの先頭に**マテリアルセレクタ**を追加します：

```
マテリアル  [ 全部（默认） ▾ ]（すべて（既定））  ← 既定：変更されるのはグローバルの lilCfg
      [ Melano_hair_MT_Toon ]
      [ Melano_cloth_MT_Toon ]
      [ Melano_Body_MT_Toon ]
      ...

プリセット  [ 头发 · 描边+Rim ▾ ]（髪 · アウトライン+Rim）  ← **上で選択したマテリアル**に適用（グローバルではない）
```

- 「すべて（既定）」を選ぶ → `lilCfg` を変更（現在の動作、「全体をざっと調整したい」場合に適切）
- 特定のマテリアルを選ぶ → `lilCfgByMaterial[名前]` を変更し、パネルのスライダーには**マージ後**の値が表示されます。
- プリセットのドロップダウンの選択肢は**マテリアル名で自動的に分類を絞り込めます**（名前に hair を含む → 髪系のみ表示）
  —— ただしすべての選択肢は残します。ユーザーが手動で指定したい場合があるためです。

### 9.4 設定のエクスポート

```jsonc
"lilToon": { /* グローバル既定 */ },
"lilToonByMaterial": {
  "Melano_hair_MT_Toon": { "shadowBorder": 0.05 }
}
```

エクスポート時は既定値との差分を取り、変更された項目だけを書き出します（既存の exportConfig と同じ意味です）

### 9.5 実装順序の提案

1. `lilCfgByMaterial` のデータ構造 + `patchToonMaterial` 内のマージ + cacheKey へのマテリアル名追加
2. API：`getLilConfig(matName)` / `setLilConfig(obj, matName)`
3. パネル：マテリアルセレクタ + プリセットの適用先も連動して変わる
4. エクスポート / インポートが `lilToonByMaterial` に対応

### 9.6 補足

- マテリアル名のマッチングには**派生マテリアルの名前**を使うことを推奨します（`Melano_hair_MT_Toon`、`_Toon` サフィックス付き）
  または一律にサフィックスを剥がしてからマッチングし、再構築後に名前が変わって一致しなくなるのを避けます。
- **メッシュ名**でのマッチング（`melano_hair`）もサポート可能です —— 一部のモデルではマテリアル名が十分に意味を持たないためです。
  両方をサポートするとより堅牢です。優先順位：マテリアル名 > メッシュ名。
