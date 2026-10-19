# lilToon 2.3.4 → Web (three.js) 移植ベースライン

[简体中文](LILTOON2.x.md) ｜ [繁體中文](LILTOON2.x.zh-TW.md) ｜ [English](LILTOON2.x.en.md) ｜ **日本語** ｜ [한국어](LILTOON2.x.ko.md)

> **本ドキュメントは現在有効なベースラインです**。
> 旧ベースライン（**1.3.7**）の対照表と照合記録は [`LILTOON1.x.ja.md`](LILTOON1.x.ja.md) を参照してください。
> 実装の詳細とすべての設定キーは [`CONFIG.ja.md`](CONFIG.ja.md) を参照してください。

---

## 零、ベースラインの定義

| 項目 | 値 |
|---|---|
| **ベースラインのバージョン** | **lilToon 2.3.4** |
| **ソースパス** | `develop_res/liltoon-2.3.4/`（旧ベースラインは `develop_res/lilToon/`、対照用に保持）|
| **対照ファイル** | `Shader/lts.shader` —— 不透明の完全版 |
| **プロパティ総数** | **517**（1.3.x は 483）|
| **コード内の行番号参照** | **93 箇所**、すべて 2.3.4 へ移行済み（§5 参照） |

### なぜ他でもなく `lts.shader` を対照にするのか

`lilToon/Shader/` の下には **61 個の shader ファイル**がありますが、それらは同一のロジックの**バリエーション**です：

```
lts.shader          不透明の完全版        ← 私たちはこれに対照する
lts_cutout / _trans / _trans_oo …       レンダリングモードごとに切ったバリエーション
ltsl_*                                  lite 版（プロパティが半分）
ltsmulti_*                              マルチマテリアルのバリエーション
lts_fur / _gem / _tess / _ref           独立機能（Fur / Gem / 曲面分割 / 屈折）
ltspass_*                               各 pass を個別に切り出したもの
```

⇒ 残りのバリエーションのプロパティは `lts.shader` の部分集合か、**独立機能**に属する（Fur/Gem/Tess/Ref は別の shader であり、lts のプロパティではない）。

---

## 一、なぜベースラインを差し替えられるのか：比較の結論

2 つのバージョンを項目ごとに比較した結論は —— **後方互換であり、ほぼ手戻りは不要**。

| 比較項目 | 結果 |
|---|---|
| **プロパティの既定値** | 483 個の共通プロパティのうち、**変わったのは `_lilToonVersion` だけ**（33 → 45）で、残りは**1 つも変わっていない** |
| **19 個の公式プリセット** | **項目ごとの数値が完全に一致**（差異 0 箇所） |
| **私たちが移植した数式** | **完全に一致** |

### 関数ごとの照合（波括弧の対応で関数本体を抽出し、行単位で比較）

| 関数 | 結果 |
|---|---|
| `lilBlendNormal` |、完全に一致 |
| `lilBlendColor` |、完全に一致 |
| `lilTooningNoSaturateScale` |、完全に一致 |
| `lilToneCorrection` |、完全に一致 |
| `lilCalcSpecular` |、完全に一致 |
| `lilCalcMatCapUV` | ⚠️ 唯一の差異：`lerp(uvMat, `**`saturate(uv1)`**`*2-1, matcapBlendUV1)` —— **私たちは `_MatCapBlendUV1` を実装していない** ⇒ 該当しない |

⇒ **私たちの `LIL_PRESETS` データ（`Presets/*.asset` から変換したもの）は引き続き有効**で、再生成は不要。

---

## 二、比較の途中で見つけて修正済みの 1 箇所

### `dissolveParams.xy = round(...)`

**2.3.4 で新規追加**（`lil_common_functions.hlsl:638` と `:684`）：

```hlsl
dissolveParams.xy = round(dissolveParams.xy);   // mode, shape
```

⇒ **mode と shape の両方を整数化する必要がある**（1.3.x にはこの行がない）

私たちの状況：

| パラメータ | 2.3.4 より前 | 2.3.4 |
|---|---|---|
| `mode` | 私たちは既に `Math.round` | — |
| `shape`（`_DissolveParams.g` / 私たちの `linear` キー）| `!== 0`、**整数化していない** | `round()` |

⇒ 結果：設定に `"linear": 0.5` と書いた場合、私たちは **Line** として扱うが、lilToon は `round(0.5) = 0` つまり **Point** とする。
⇒ パネルのスライダーは `step 1` で、普段は 0/1 しかなく、**JSON を手書きしたときにだけ露見する**。
⇒ `Math.round(num(D.linear, 1)) === 1` に修正済み。

---

## 三、2.3.4 と 1.3.x の差異

プロパティを **68** 個追加し、**34** 個を削除。

### 3.1 本当に新しい機能（私たちにはない）

| 機能 | プロパティ数 | 既定 | 説明 |
|---|---|---|---|
| **RimShade** | 7 | 0 | 新規の「エッジ影」レイヤー、`_RimShadeColor` / `Mask` / `NormalStrength` / `Border` / `Blur` / `FresnelPower` |
| **IDMask** | 34 | 0 | ID で溶解 / パーツ非表示を制御、Unity 側のツールで ID を頂点やテクスチャにベイクすることに依存 |
| **Dither** | 3 | 0 | スクリーン空間の順序付きディザリング、`_DitherTex` / `_DitherMaxValue`、DistanceFade と組み合わせて使う |
| **DistanceFadeRim** | 3 | — | 距離フェード時にカラーのリムライトを一圈加える、`_DistanceFadeRimColor` / `FresnelPower`、ほかに `_DistanceFadeMode` |
| **Main2nd/3rdTexAlphaMode** | 2 | 0 | メインカラーレイヤー自身の **alpha** ブレンドモード（従来はカラーの blend だけだった）|

### 3.2 Unity 専用で、私たちには無関係

```
UDIM Discard                      20 個    Unity UDIM
Motion vectors                    複数     TAA / モーションベクター（TransformPreviousObjectToWorld など）
Probe Volumes L1/L2                       Unity APV
VRC Light Volumes / Udon Light Volume
  ├ _EnvRimBorder / _EnvRimBlur（2 個）
  └ _UdonLightVolumeEnabled
```

### 3.3 削除された 34 個

```
リソース暗号化：_IgnoreEncryption · _Keys · _BitKey0..31      ⇒ N/A（そもそも私たちもやっていない）
```

---

## 四、2.3.4 のソースマップ

> **行番号はすべて `liltoon-2.3.4/Shader/Includes/` の下のものです**。
> 私たちのコード内のコメントの参照はまさにこれらの行番号で、すべて整合済みです。

### 4.1 ユーティリティ関数（`lil_common_functions.hlsl`）

| 行 | 関数 | 私たちが何に使うか |
|---|---|---|
| 11 | `lilIsIn0to1` | — |
| **26** | `lilTooningNoSaturateScale` | トゥーン化の中核（3/4/5 引数のオーバーロード）、影の段階分け / Rim / ハイライトがすべて使う |
| **135** | `lilBlendNormal` | Whiteout blend（2nd 法線）|
| **325** | `lilBlendColor` | すべてのブレンドモード（Normal/Add/Screen/Multiply）、私たちの `ba3dBlend` |
| **347** | `lilToneCorrection` | アウトライン用テクスチャの HSV 補正 |
| **419** | `lilRotateUV` | レイヤー溶解の Line 形状 |
| **438** | `lilCalcUV` | UV 変換（ST + スクロール回転）|
| **550** | `lilCalcMatCapUV` | MatCap の UV（ZRotCancel / Perspective を含む）|
| **626** | `lilCalcDissolve` | 溶解 |
| **668** | `lilCalcDissolveWithNoise` | 溶解（ノイズ付き）|
| **638 / 684** | `dissolveParams.xy = round(...)` | ★ 2.3.4 で新規追加、§2 参照 |

### 4.2 装飾レイヤー（`lil_common_frag.hlsl`）

**⚠️ これらの大半は `#define OVERRIDE_*` マクロであり、関数ではない**。

| 行 | マクロ / 関数 | 私たちの対応物 |
|---|---|---|
| 395 | `OVERRIDE_OUTLINE_COLOR` | アウトラインの受光 |
| 488 / 506 | `OVERRIDE_DISSOLVE` | ディゾルブ |
| 527 / 534 | `OVERRIDE_DITHER` | ★ 2.3.4 で新規追加 |
| 566 / 573 | `OVERRIDE_NORMAL_1ST` | 1st 法線 |
| 585 / 598 | `OVERRIDE_NORMAL_2ND` | 2nd 法線（Whiteout）|
| 617 | `OVERRIDE_ANISOTROPY` | ❌ 未対応 |
| 814 | `OVERRIDE_MAIN2ND` | メインカラーレイヤー 2nd |
| 910 | `OVERRIDE_MAIN3RD` | メインカラーレイヤー 3rd |
| 1192 | `OVERRIDE_SHADOW`（分档）| 影の段階分け + 3 層の法線強度 |
| 1222 / 1225 | `OVERRIDE_RIMSHADE` | ★ 2.3.4 で新規追加 |
| **1267** | `OVERRIDE_BACKLIGHT` | バックライト |
| **1315** | `float3 lilCalcSpecular` | ★ 鏡面ハイライト |
| **1437** | `perceptualRoughness - fd.smoothness` | ★ `roughness = (1 - _Smoothness)²` |
| **1510** | `OVERRIDE_REFLECTION` | ★ 反射（ハイライトの混合を含む）|
| **1578** | `OVERRIDE_MATCAP` | MatCap 1st |
| **1636** | `OVERRIDE_MATCAP_2ND` | MatCap 2nd |
| **1747 / 1750** | `OVERRIDE_RIMLIGHT` | Rim |
| **1888 / 1891** | `OVERRIDE_EMISSION_1ST` | 自発光 1st |
| **1955** | `OVERRIDE_EMISSION_2ND` | 自発光 2nd |
| **2057** | `OVERRIDE_DISTANCE_FADE` | 距離フェード |

### 4.3 マクロとライティング（`lil_common_macro.hlsl`）

| 行 | 内容 | 説明 |
|---|---|---|
| **621** | `lilHeadDirection` | 頭の向き（MatCap の視差に使う、非 VR では無効）|
| **696** | `lilBlendVRParallax` | ⚠️ 非 VR では**そのまま b を返す**、引数は無効 |
| **2079** | `LIL_CORRECT_LIGHTCOLOR_VS` | ライティングをクランプするマクロ |
| **2081 / 2086** | `lightColor = clamp(lightColor, _LightMinLimit, _LightMaxLimit)` | ★ ライティングクランプ本体 |

### 4.4 装飾レイヤーの**順序**（`lil_pass_forward_normal.hlsl`）

```
行 219 / 386   Dither            ★ 2.3.4 で新規追加
行 251 / 446   Lighting
行 339         Layer Color（Main2nd / Main3rd）
行 446         Shadow
行 492         Backlight
行 520         **Reflection**    ★ 私たちが先ごろ補ったもの
行 527         MatCap
行 539         Rim light
             （RimShade、2.3.4 で新規追加、Rim の後）
行 554 / 560   Emission 1st / 2nd
```

完全な順序：

```
Anisotropy → AudioLink → Main2nd → Main3rd → Shadow → Backlight → 【Reflection】
→ MatCap → MatCap2nd → Rim → 【RimShade】→ Glitter → Emission1st → Emission2nd
（Dither は最も外側にあり、fd.col.a に作用する）
```

### 4.5 その他の重要な位置

| 行 | ファイル | 内容 |
|---|---|---|
| **206** | `lil_common.hlsl` | `fd.perceptualRoughness = 1.0`（初期値）|
| 1438 | `lil_common_frag.hlsl` | `fd.roughness = fd.perceptualRoughness * fd.perceptualRoughness` |

---

## 五、事前に知っておくべきいくつかのこと

### 7.1 `_MatCapVRParallaxStrength` は非 VR では何もしない

`lil_common_macro.hlsl:696`：

```hlsl
float3 lilBlendVRParallax(float3 a, float3 b, float c) {
    #if defined(USING_STEREO_MATRICES)
        return lerp(a, b, c);
    #else
        return b;          // ← 非 VR では視線方向をそのまま返す · 強度パラメータは使われない
    #endif
}
```

⇒ ブラウザでこれを調整しても**何の効果もない**、これは lilToon の設計であり、私たちの不具合ではない。
⇒ パネルに残しているのは lilToon のパラメータ表と 1 対 1 に対応させるためだけ（「（非VR無効）」と注記済み）

### 7.2 マスクは既定で**頂点カラー**から来る

lilToon の `triMask`：

| チャンネル | 用途 |
|---|---|
| R | MatCap の重み |
| G | Rim の重み |
| B | 自発光の重み |

⇒ **モデルに頂点カラーがないときは自動的に「重みは常に 1」にフォールバックする**、効果が消えることはない。
⇒ パネルには「頂点カラー」のプレビューボタンがあり、頂点カラーをそのまま色として描画し、マスクの区分を確認するのに使う。

### 7.3 `_Smoothness = 1` ⇒ `roughness = 0` ⇒ `pow(nh, +INF)`

```
perceptualRoughness = 1 - _Smoothness        （lil_common.hlsl:206 初期値 1.0）
roughness           = perceptualRoughness²    （lil_common_frag.hlsl:1438）
```

**HLSL**：`1.0/0.0 = +INF`、`pow(nh, +INF)` は `nh<1` で 0、`nh>=1` で 1 を返す。
**GLSL**：**指数が無限大なのは未定義動作**。

⇒ 私たちは明示的に `nh >= 1.0 ? 1.0 : 0.0` と書いている。

### 7.4 GLSL と HLSL では行列の向きが違う

```
HLSL  mul(float3x3(a,b,c), v)  は**行の内積**  ⇒ (dot(a,v), dot(b,v), dot(c,v))
GLSL  mat3(a,b,c) * v          は**列の組み合わせ**  ⇒ 両者は異なる
```

⇒ 移植時は `dot` を直接書くのが最も取り違えにくい、（`lilCalcMatCapUV` がその一例）

### 7.5 ★★ three の toon ライティングは `material.diffuseColor` を読む（ローカルの `diffuseColor` ではない）

  ⚠️⚠️ **受光の結果**を変えたいなら、**`material.diffuseColor`**（あの struct のフィールド）を変えなければならない。
     ローカルの `diffuseColor` を変えても**後続の段階**（alpha / emissive / fog）にしか影響せず、ライティングには影響しない。

      lights_toon_pars_fragment：
          reflectedLight.directDiffuse   += irradiance * BRDF_Lambert( material.diffuseColor );
          reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );

  ⚠️ しかも `material` は **`#include <lights_fragment_begin>` の中で**代入される ⇒
     それを変えるにはあの include の**後**に書かなければならない。
  ⚠️ include の後にぶら下げたコードは**すべてのブロックの外**にある ⇒ ブロック内のローカル変数（`ba3dLc` など）を参照できない。
     ファイルスコープ / 前書きで宣言済みの変数（`ba3dColor2nd` など）に変える必要がある。

  ⇒ この落とし穴のせいで「メインカラーレイヤー 2nd / 3rd」は既定の設定では**完全に見えず**、長く潜伏していた。
     B5 の期間中に、ユーザーの「enableLighting を 0 にするとようやく見える」という実験でようやく掘り出された。

### 7.5.5 ★ アウトラインには**2 系統**があり、状態を共有しなければならない

  ⚠️ lilToon モードでは **`applyLilOutline()` の独立した反転ハルメッシュ**を通る。
     three の `OutlineEffect` ではなく、両者はそれぞれ独自の「スキップ」規則を持っている：

      applyOutlineParams()  ⇒ userData.outlineParameters.visible を書く
                              （透明 / 地面 / 口元の貼り付けパッチ ⇒ false）
      applyLilOutline()     ⇒ 従来は**設定の o.skipPattern しか見ず**、visible をまったく見ていなかった

  ⇒ 結果：「透明マテリアルは自動でアウトラインを切る」は three の OutlineEffect にしか効かない。
     lilToon の反転ハルアウトラインには**まったく効かない**。
  ⇒ 現象：lilToon スタイルに切り替え · 既定でアウトライン付き、何も触らない ⇒
     **透明マテリアルがその不透明な背面ハルに覆われて不透明になってしまう**。

  ### もう 1 つ：アウトラインのハルは**深度を書いてはいけない**

  従来のアウトラインマテリアルは `depthWrite = true` で、しかも `renderOrder = -1`（先に描く）
  ⇒ 深度が先に敷かれる ⇒ 後ろの半透明の薄板が**深度で剔除される** ⇒ その領域が「実体」に見えてしまう。

  ⇒ 正しいやり方：元のマテリアルが透明なら ⇒ アウトラインマテリアルも `transparent` + **`depthWrite = false`**。
     （lilToon はアウトラインを独立した pass として扱い、マテリアルの `_TransparentMode` を継承する）

  ### ⚠️ そしてアウトラインの alpha は**マテリアルから来ない**

      lil_common_frag.hlsl:389     fd.col.a *= **_OutlineColor.a**;

  ⇒ アウトライン色は独自の alpha を持ち（パネルの「アウトライン透明度」）、本体のマテリアルとは無関係。
  ⇒ 「透明に追従する」は**ブレンド / 深度の状態**に現れるのであって、alpha を掛け合わせることではない。

### 7.5.6 ★ チェッカー自身も「添字のずれ」を踏む

  ⚠️ `check-panel.mjs` は**インラインスクリプト**を `codeLines` として抜き出し、同時に `html` 全体の `L` も保持する。
     両者は**添字が `base` 行ずれている**。

  元の ⑧ 番の検査は `L[i]` と書かれており、「スクリプトがちょうどファイルの先頭付近にある」ことで偶然一致していた。
  ⇒ スクリプトの**前**に内容を挿入すると（例えば日中テーマの CSS を足す）、ずれが生じて ⇒
     コメント判定が別の行を読む ⇒ **有効な呼び出しをコメントアウトされたものと誤判定する** ⇒
     「groupifyLilPanel() の有効な呼び出しが 0 箇所」と報告する、しかしコードは実際には正しい。

  ⇒ 修正方法：原文を読む判定はすべて `L[i + base]` を使う。

  ⚠️ 教訓：**チェッカーにバグがあると偽の問題を報告し、報告しないより時間を浪費する**。
     「本来は問題なかったものが急にエラーを出す」ときは、まずチェッカーを疑い、それからコードを疑う。

### 7.6 `onBeforeCompile` が受け取るのは**`#include` が展開されていない原文**

three は `onBeforeCompile` の**後**に `resolveIncludes` を行う。

⇒ three 組み込み chunk の中のコード（`RE_Direct_Toon` など）を変えたい場合は、
   **`#include <xxx>` 命令そのものを置き換え**、パッチを当てた chunk のテキストを連結しなければならない。
⇒ `shader.fragmentShader` から chunk 内のその行を直接探しても**永遠に見つからない**。

### 7.7 プリセットは**マテリアル単位**

lilToon のプリセットはもともとマテリアルごとに 1 つで、私たちのアーキテクチャは「グローバル既定 + マテリアル単位の疎な上書き」。
詳しくは [`CONFIG.ja.md`](CONFIG.ja.md) と `LILTOON1.x.md` の第 9 節を参照。

---

## 六、比較方法（再現可能）

### 8.1 プロパティのレベル

両方の `lts.shader` を `[attr] _Name ("Label", Type) = default` として解析する。

⚠️ **型に `Range(0, 1)` のような括弧付きのものがある**、正規表現には**貪欲な `(.*)`** が必要。
   そうしないと `_AsUnlit ("As Unlit", Range(0, 1)) = 0` はマッチに失敗する（右括弧が 1 つ多い）

### 8.2 プリセットのレベル

`.asset` の `m_Floats` セクションを解析する：

```
- name: _UseReflection
    value: 1
```

（`- name:` と `value:` は**隣接する 2 行**）

### 8.3 数式のレベル

関数シグネチャで関数本体を抽出し（波括弧の対応）、行単位で比較する（コメントと空行は無視）

### 8.4 行番号のマッピング

§5 の方法を参照。

---

## 七、既知の偏差リスト（正直な記録）

| 項 | 状況 |
|---|---|
| `_MatCapVRParallaxStrength` | 非 VR では何もしない、lilToon 自身がそうなっている |
| UV1 / UV2 / UV3 | 未対応、パネルのドロップダウンは `uv0` と「視点球面」だけを出し、選択肢に注記している |
| レイヤー溶解の「UV」モード | **メッシュ UV0**（= アトラス）を使う、キャラクター上では断片が切り出され、**Unity の挙動と一致する** |
| **Decal の実用性** | ⚠️ 数式 / 注入 / エッジ AA / ミラー / 片側 / アトラスアニメーションは**すべて lilToon どおりに忠実に実装**したが、**このモデルには Decal が使う UV レイアウトが欠けている** ⇒ 実際には縞模様しか得られない、詳細は下記 || `_ReflectionCubeTex` | 未対応、Unity は Reflection Probe に頼っており、ビューアにはない ⇒ 鏡面ハイライトの経路だけを実装 |
| 非トゥーン経路の完全な GGX | 未対応、`_SpecularToon` の既定は 1 ⇒ プリセットはすべてトゥーン経路を通る ⇒ 十分近い近似を与えている |
| ライティングクランプと lilToon の差異 | lilToon の間接光も同じ `lightColor` を掛ける ⇒ 影の中の環境光が押し下げられる、一方 three の環境光は**独立に加算される** ⇒ 下限をとても高くすると lilToon よりやや明るくなる、これはライティング構造の差異であり、無理に模擬しない |
| cel モード | cel と lilToon は**2 本の直交する軸**であり、毎回 lilToon 側の変更が cel を汚染していないことを検証する |

### ★ B5 Decal の実用性について（誤解を避けるため個別に説明）

  **Decal は「ある画像を顔のどこかに貼る」ツールではない**、それは**このレイヤーのテクスチャに別のサンプリング規則を入れ替える**もの：

      ① UV チャンネルを変える（通常は uv1）
      ② もう半分へミラーコピー / 片側だけ表示（接線 w の符号による区分）
      ③ アトラスのフレームアニメーション（_Main2ndTexDecalAnimation）
      ④ decalUv.x が [0,1] の外に落ちるピクセルを切り取る（エッジのアンチエイリアス付き）

  ⇒ 本当の「デカール」効果は**モデル / アーティストがデカール用に用意した UV 一式**から来るのであり、任意の 1 枚の画像からではない。

  ### なぜこのモデルでは縞模様しか見えないのか

      CH0155_Face   uv1.x ∈ [-0.53, 1.00]   uv1.y ∈ [-0.998, 1.00]
      CH0155_Body   uv1.x ∈ [-11.65, 12.10]
      CH0155_Hair   uv1.x ∈ [-13.27, 14.46]

  ⇒ `texture2D(tex, uv1)` は UV 空間で**繰り返しサンプリングされる** ⇒ 縞 / 帯状になる。
  ⇒ さらに Decal の AA が `x ∈ [0,1]` の縦帯 1 本だけを残す ⇒ 見えているとおりになる。
  ⇒ **Unity でも同じ UV1 + 同じ ST を使えばまったく同じ縞模様が出る**、私たちのバグではない。

  ### 「ST のスケール / オフセット」のここでの実際の使い方

      ST スケール = (0.1, 0.1)  ⇒ テクスチャの 1/10 だけを取り出す ⇒ 10 倍に拡大してモデルに敷く
      ST オフセット = (0.3, 0.5)  ⇒ どの部分を取るか

  ⇒ 「テクスチャの一角を取って敷き詰める」ことはできるが、**自由な設定ではない**。
  ⇒ 「★Decal デバッグ = 2」で decal UV をそのまま色として出力でき、UV がどこに落ちるかの確認に使う。

  ### 本当に「顔に小さなテクスチャを描く」ために必要なもの

      · モデルに**デカール用にレイアウトされた UV チャンネル**が必要（モデリング時にアーティストが残したもの）
        例えば顔の貼れる装飾の位置をすべて 1 枚の「デカールアトラス」に並べる
      · 各位置はアトラス内の 1 ブロック [u0,u1] × [v0,v1] を占める
      · そして _Main2ndTex_ST でそのブロックを [0,1] に拡大する
      · _Main2ndTexDecalAnimation でフレームを選ぶ

  ⇒ BA シリーズの uv1 は明らかにこう並んでいない ⇒ だから縞模様しか得られない。

---

## 八、参考

| ファイル | 内容 |
|---|---|
| [`LILTOON1.x.ja.md`](LILTOON1.x.ja.md) | 旧ベースライン（1.3.7）と現行ベースラインの対照、アウトラインの完全仕様、プリセットのマテリアル単位アーキテクチャ |
| [`CONFIG.ja.md`](CONFIG.ja.md) | すべての設定キー、実装の詳細、各回の落とし穴と教訓 |
| `viewer.js` | 93 箇所の行番号参照、すべて 2.3.4 に整合済み |
| `develop_res/liltoon-2.3.4/` | 現在のベースラインのソース |
| `develop_res/lilToon/` | 旧ベースラインのソース（対照用に保持）|

---

## 九、2026-10-10 今回：スタイル後端の明るさセマンティクス整合（随時更新）

「lilToon スタイル」後端と対照後端（lilToon ソースの移植）には、以前から肉眼で分かる明るさの偏差が 2 箇所あった。
今回、スタイル側の**ライティング合成 / 出力処理 / ベースカラーの取得元**を、対照側の実際のセマンティクスに合わせた。

### 9.1 変更点

| 項 | 以前のやり方 | 現在のやり方 |
|---|---|---|
| 直接光 | ライトごとに合計した Lambert 項に、経験的な補正を掛ける | **先頭のディレクショナルライトを取る**、`clamp(メイン光 + 環境光, 下限, 上限)`、**1 回の** `A × lightColor × R` 合成 |
| 経験的な補正 | 合成に `1.65` の係数が入っていた | この経路では**もう使わない**（既定値自体は変えていない、未変更モードの旧経路は残している） |
| ベースカラー | 対照側と**非対称**（片側がマテリアルのベースカラーを余分に 1 回掛けていた） | 「有効な設定 → 設定マッピング → vendor の実行時既定」から導出し、メインテクスチャ / メインカラーレイヤーと一緒に合成する |
| 出力 | ページのトーンマッピング（`LinearToneMapping`、露出 1.15） | 維持。整合後は、受光領域にあった広範囲の白飛びが消える |
| 初回読み込み | スタイル経路だけを通る場合はブリッジモジュールを読み込まない | スタイル後端に初めて入るときに**ついでにモジュールを読み込む**（読み込むだけで、レンダリング後端は切り替えない） |

### 9.2 実測（黒背景 α 合成、`L = .2126R + .7152G + .0722B`）

| 状態 | 画面全体の平均絶対差 | 明るさ差 > 12 の割合 |
|---|---|---|
| ホーム画面の既定モデル、既定のまま | 0.029 | 0.076 % |
| ホーム画面の既定モデル、「スキン · アニメーション」グローバルプリセット | 0.000074 | 0.00016 % |
| Melano（基準ポーズ） | 0.050 | 0.122 % |
| Melano、「スキン · アニメーション」グローバルプリセット | 0.00067 | 0.0029 % |

判定基準：主要領域（髪 / 顔 / コート / 靴下）の平均絶対差 ≤ 3、画面全体の明るさ差が 12 を超えるピクセルの割合 ≤ 1 %。

### 9.3 順序（上流と一致）

法線 → 受信（receive）→ 通常の段階 `x/y/z` と境界の遷移段階 `w` → 強度 → 各レイヤーの色 →
メイン強度 → 小さい方を取る → 境界色 → 最終ブレンド。`_UseShadow = 0` のときはこの部分を丸ごとスキップする。
影の法線は引き続き**無条件に代入**する（既定の強度 1 でも書く必要がある）。レイヤーごとの段階分けにはアンチエイリアスが含まれる。

### 9.4 まだ検証していないこと（正直な記録）

- `_ShadowNormalStrength` の中間強度：スライダーには書けるが、対応するシェーダー分岐はまだ効いていない。
- メインカラーレイヤー 2nd / 3rd の有効化分岐は個別に検証していない。
- 顔の影は**明るさ**の基準でしか確認しておらず、**形状 / 遷移**の独立した確認は行っていない。
- 透明背景の分岐、その他のモデル、「マテリアル指定」のプリセット対象は未テスト。

---

## 十、2026-10-18 見た目の基準：Unity 側の条件（実機で確認済み）

参考プロジェクト：Unity **2022.3.22f1** · プロジェクト `Melano-Migrated` · シーン `Melano_scene`（本機で読み取り専用に確認）。

| 項目 | 値 | 根拠 |
|---|---|---|
| レンダーパイプライン | **Built-in** | `ProjectSettings/GraphicsSettings.asset`: `m_CustomRenderPipeline: {fileID: 0}` · `m_SRPDefaultSettings: {}` |
| カラースペース | **Linear** | `ProjectSettings/ProjectSettings.asset`: `m_ActiveColorSpace: 1` |
| ポストプロセス / トーンマッピング | **なし** | プロジェクト全体を grep：Assets/Scenes に `PostProcessVolume` / `Tonemapping` は 0 件（postprocessing パッケージは導入済みだが未使用） |
| lilToon | **2.3.4** | `Assets/lilToon/package.json` |

**結論**：Unity 側の lilToon は**マテリアル単位のトーンマッピングを行わない**。出力は「**リニアでシェーディング + 表示時の sRGB 変換**」。

本リポジトリ側：

- ソース後端：`mat.toneMapped = false`（ページのトーンマッピングに追従しない）＋ **sRGB 出力は維持** ⇒ Unity のセマンティクスと一致。
- 自前のスタイル後端：もともと `#include <tonemapping_fragment>` を削除している ⇒ 両後端の口径が一致。
- ページ側の ACES は **PBR / ネイティブ材質のみ**に作用させる。カートゥーンの 2 経路には入れない（上流 0.1.6+ は追従するので明示的に切る必要がある）。

### アウトライン（ハイブリッド方式）

| メッシュ種別 | 描画元 | 備考 |
|---|---|---|
| スキンメッシュ | **上流**（`shaderVariant = Hidden/lilToonOutline` など） | Unity 自身も上流のアウトラインを使う ⇒ 基準に近い |
| 静的メッシュ | **自前の反殻** | 静的メッシュでの上流の見え方は未検証 |
| `*_Outline` 名の殻メッシュ（モデル同梱） | **自前**（上流には渡さない） | すでに外側へ拡張された殻。上流を重ねると 150× の世界スケールで大きな塊になる |

⚠️ 実測：`_OutlineCull` も `side = FrontSide` 強制も、この膨張には**効かない**（ピクセルはほぼ不変）⇒ 殻メッシュを除外するのが唯一効く規則。
