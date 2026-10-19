# lilToon 2.3.4 → Web (three.js) 이식 기준선

[简体中文](LILTOON2.x.md) ｜ [繁體中文](LILTOON2.x.zh-TW.md) ｜ [English](LILTOON2.x.en.md) ｜ [日本語](LILTOON2.x.ja.md) ｜ **한국어**

> **이 문서가 현재 유효한 기준선입니다.**
> 구 기준선(**1.3.7**)의 대조표와 점검 기록은 [`LILTOON1.x.ko.md`](LILTOON1.x.ko.md) 를 보세요.
> 구현 세부와 모든 설정 키는 [`CONFIG.ko.md`](CONFIG.ko.md) 에 있습니다.

---

## 零. 기준선의 정의

| 항목 | 값 |
|---|---|
| **기준선 버전** | **lilToon 2.3.4** |
| **소스 경로** | `develop_res/liltoon-2.3.4/` (구 기준선은 `develop_res/lilToon/`, 대조용으로 보존) |
| **대조 파일** | `Shader/lts.shader` — 불투명 완전판 |
| **속성 총수** | **517** (1.3.x 는 483) |
| **코드 내 행 번호 인용** | **93 곳**, 전부 2.3.4 로 이전 완료 (§5 참고) |

### 왜 `lts.shader` 를 대조 대상으로 삼는가

`lilToon/Shader/` 아래에는 **셰이더 파일이 61 개** 있지만, 그것들은 같은 로직의 **배리언트**입니다:

```
lts.shader          불투명 완전판        ← 이것을 대조 대상으로
lts_cutout / _trans / _trans_oo …       렌더 모드별 배리언트
ltsl_*                                  lite 판 (속성이 절반)
ltsmulti_*                              멀티 머티리얼 배리언트
lts_fur / _gem / _tess / _ref           독립 기능 (Fur / Gem / 테셀레이션 / 굴절)
ltspass_*                               각 pass 를 따로 떼어낸 것
```

⇒ 나머지 배리언트의 속성은 `lts.shader` 의 부분집합이거나 **독립 기능**(Fur/Gem/Tess/Ref 는 다른 셰이더이며 lts 의 속성이 아님)입니다.

---

## 一. 기준선을 바꿔도 되는 이유: 대조 결론

두 버전을 항목별로 비교한 결론은 — **하위 호환되며 거의 재작업이 필요 없음** 입니다.

| 비교 항목 | 결과 |
|---|---|
| **속성 기본값** | 공통 483 개 중 **`_lilToonVersion` 만 변경**(33 → 45), 나머지는 **하나도 바뀌지 않음** |
| **공식 프리셋 19 개** | **항목별 수치 완전 일치**(차이 0) |
| **우리가 이식한 수식** | **완전 일치** |

### 함수별 점검 (중괄호 짝으로 함수 본문을 추출해 행 단위 비교)

| 함수 | 결과 |
|---|---|
| `lilBlendNormal` | 완전 일치 |
| `lilBlendColor` | 완전 일치 |
| `lilTooningNoSaturateScale` | 완전 일치 |
| `lilToneCorrection` | 완전 일치 |
| `lilCalcSpecular` | 완전 일치 |
| `lilCalcMatCapUV` | ⚠️ 유일한 차이: `lerp(uvMat, `**`saturate(uv1)`**`*2-1, matcapBlendUV1)` — **우리는 `_MatCapBlendUV1` 을 구현하지 않음** ⇒ 해당 없음 |

⇒ **우리의 `LIL_PRESETS` 데이터(`Presets/*.asset` 에서 변환)는 여전히 유효**하며 재생성할 필요가 없습니다.

---

## 二. 비교 중 발견해 이미 수정한 1 곳

### `dissolveParams.xy = round(...)`

**2.3.4 신규**(`lil_common_functions.hlsl:638` 와 `:684`):

```hlsl
dissolveParams.xy = round(dissolveParams.xy);   // mode, shape
```

⇒ **mode 와 shape 모두 정수화** (1.3.x 에는 이 줄이 없음)

우리 상황:

| 파라미터 | 2.3.4 이전 | 2.3.4 |
|---|---|---|
| `mode` | 이미 `Math.round` | — |
| `shape`(`_DissolveParams.g` / 우리의 `linear` 키) | `!== 0`, **정수화 안 함** | `round()` |

⇒ 결과: 설정에 `"linear": 0.5` 를 쓰면 우리는 **Line**, lilToon 은 `round(0.5) = 0` 즉 **Point** 로 해석.
⇒ 패널 슬라이더는 `step 1` 이라 평소엔 0/1 이고 **JSON 을 직접 쓸 때만 드러남**.
⇒ `Math.round(num(D.linear, 1)) === 1` 로 수정 완료.

---

## 三. 2.3.4 의 1.3.x 대비 차이

속성 **68 개 추가**, **34 개 제거**.

### 3.1 실제 신기능 (우리에게 없음)

| 기능 | 속성 수 | 기본값 | 설명 |
|---|---|---|---|
| **RimShade** | 7 | 0 | 새「가장자리 그림자」레이어, `_RimShadeColor` / `Mask` / `NormalStrength` / `Border` / `Blur` / `FresnelPower` |
| **IDMask** | 34 | 0 | ID 로 디졸브/파츠 숨김 제어, Unity 측 도구로 ID 를 버텍스나 텍스처에 굽는 방식 |
| **Dither** | 3 | 0 | 스크린 공간 순서 디더, `_DitherTex` / `_DitherMaxValue`, DistanceFade 와 함께 사용 |
| **DistanceFadeRim** | 3 | — | 거리 페이드 시 색이 있는 가장자리 광 추가, `_DistanceFadeRimColor` / `FresnelPower`, 별도로 `_DistanceFadeMode` |
| **Main2nd/3rdTexAlphaMode** | 2 | 0 | 메인 레이어 자체의 **alpha** 블렌드 모드 (기존엔 색 블렌드만) |

### 3.2 Unity 전용, 우리와 무관

```
UDIM Discard                      20 개    Unity UDIM
Motion vectors                    여러 개  TAA / 모션 벡터 (TransformPreviousObjectToWorld 등)
Probe Volumes L1/L2                       Unity APV
VRC Light Volumes / Udon Light Volume
  ├ _EnvRimBorder / _EnvRimBlur (2 개)
  └ _UdonLightVolumeEnabled
```

### 3.3 제거된 34 개

```
리소스 암호화: _IgnoreEncryption · _Keys · _BitKey0..31   ⇒ N/A (우리도 원래 안 함)
```

---

## 四. 2.3.4 소스 맵

> **모든 행 번호는 `liltoon-2.3.4/Shader/Includes/` 아래 기준입니다.**
> 우리 코드의 주석 인용이 이 행 번호들이며 전부 정렬되어 있습니다.

### 4.1 유틸 함수 (`lil_common_functions.hlsl`)

| 행 | 함수 | 우리가 쓰는 용도 |
|---|---|---|
| 11 | `lilIsIn0to1` | — |
| **26** | `lilTooningNoSaturateScale` | 툰화의 핵심 (3/4/5 인자 오버로드), 그림자 단계 / Rim / 하이라이트에 사용 |
| **135** | `lilBlendNormal` | Whiteout 블렌드 (2nd 노멀) |
| **325** | `lilBlendColor` | 모든 블렌드 모드 (Normal/Add/Screen/Multiply), 우리의 `ba3dBlend` |
| **347** | `lilToneCorrection` | 외곽선 텍스처의 HSV 보정 |
| **419** | `lilRotateUV` | 레이어 디졸브의 Line 형태 |
| **438** | `lilCalcUV` | UV 변환 (ST + 스크롤 회전) |
| **550** | `lilCalcMatCapUV` | MatCap 의 UV (ZRotCancel / Perspective 포함) |
| **626** | `lilCalcDissolve` | 디졸브 |
| **668** | `lilCalcDissolveWithNoise` | 디졸브 (노이즈 포함) |
| **638 / 684** | `dissolveParams.xy = round(...)` | ★ 2.3.4 신규, §2 참고 |

### 4.2 장식 레이어 (`lil_common_frag.hlsl`)

**⚠️ 대부분은 `#define OVERRIDE_*` 매크로이며 함수가 아닙니다.**

| 행 | 매크로 / 함수 | 우리 대응 |
|---|---|---|
| 395 | `OVERRIDE_OUTLINE_COLOR` | 외곽선의 수광 |
| 488 / 506 | `OVERRIDE_DISSOLVE` | 디졸브 |
| 527 / 534 | `OVERRIDE_DITHER` | ★ 2.3.4 신규 |
| 566 / 573 | `OVERRIDE_NORMAL_1ST` | 1st 노멀 |
| 585 / 598 | `OVERRIDE_NORMAL_2ND` | 2nd 노멀 (Whiteout) |
| 617 | `OVERRIDE_ANISOTROPY` | ❌ 미구현 |
| 814 | `OVERRIDE_MAIN2ND` | 메인 컬러 2nd |
| 910 | `OVERRIDE_MAIN3RD` | 메인 컬러 3rd |
| 1192 | `OVERRIDE_SHADOW` (단계) | 그림자 단계 + 3 층 노멀 강도 |
| 1222 / 1225 | `OVERRIDE_RIMSHADE` | ★ 2.3.4 신규 |
| **1267** | `OVERRIDE_BACKLIGHT` | 역광 |
| **1315** | `float3 lilCalcSpecular` | ★ 스페큘러 하이라이트 |
| **1437** | `perceptualRoughness - fd.smoothness` | ★ `roughness = (1 - _Smoothness)²` |
| **1510** | `OVERRIDE_REFLECTION` | ★ 반사 (하이라이트 혼합 포함) |
| **1578** | `OVERRIDE_MATCAP` | MatCap 1st |
| **1636** | `OVERRIDE_MATCAP_2ND` | MatCap 2nd |
| **1747 / 1750** | `OVERRIDE_RIMLIGHT` | Rim |
| **1888 / 1891** | `OVERRIDE_EMISSION_1ST` | 발광 1st |
| **1955** | `OVERRIDE_EMISSION_2ND` | 발광 2nd |
| **2057** | `OVERRIDE_DISTANCE_FADE` | 거리 페이드 |

### 4.3 매크로와 조명 (`lil_common_macro.hlsl`)

| 행 | 내용 | 설명 |
|---|---|---|
| **621** | `lilHeadDirection` | 머리 방향 (MatCap 시차용, 비 VR 에서 무효) |
| **696** | `lilBlendVRParallax` | ⚠️ 비 VR 에서 **b 를 그대로 반환**, 파라미터 무효 |
| **2079** | `LIL_CORRECT_LIGHTCOLOR_VS` | 광량 클램프 매크로 |
| **2081 / 2086** | `lightColor = clamp(lightColor, _LightMinLimit, _LightMaxLimit)` | ★ 광량 클램프 본체 |

### 4.4 장식 레이어의 **순서** (`lil_pass_forward_normal.hlsl`)

```
행 219 / 386   Dither            ★ 2.3.4 신규
행 251 / 446   Lighting
행 339         Layer Color (Main2nd / Main3rd)
행 446         Shadow
행 492         Backlight
행 520         **Reflection**    ★ 최근에 보강
행 527         MatCap
행 539         Rim light
             (RimShade, 2.3.4 신규, Rim 뒤)
행 554 / 560   Emission 1st / 2nd
```

전체 순서:

```
Anisotropy → AudioLink → Main2nd → Main3rd → Shadow → Backlight → 【Reflection】
→ MatCap → MatCap2nd → Rim → 【RimShade】→ Glitter → Emission1st → Emission2nd
(Dither 는 가장 바깥에서 fd.col.a 에 작용)
```

### 4.5 그 밖의 주요 위치

| 행 | 파일 | 내용 |
|---|---|---|
| **206** | `lil_common.hlsl` | `fd.perceptualRoughness = 1.0` (초기값) |
| 1438 | `lil_common_frag.hlsl` | `fd.roughness = fd.perceptualRoughness * fd.perceptualRoughness` |

---

## 五. 미리 알아야 할 것들

### 7.1 `_MatCapVRParallaxStrength` 는 비 VR 에서 무효

`lil_common_macro.hlsl:696`:

```hlsl
float3 lilBlendVRParallax(float3 a, float3 b, float c) {
    #if defined(USING_STEREO_MATRICES)
        return lerp(a, b, c);
    #else
        return b;          // ← 비 VR 은 시선 방향을 그대로 반환 · 강도 파라미터 미사용
    #endif
}
```

⇒ 브라우저에서 이 값을 조정해도 **아무 효과가 없습니다**. lilToon 의 설계이며 우리 결함이 아닙니다.
⇒ 패널에 남겨둔 이유는 lilToon 파라미터 표와 1:1 대응을 유지하기 위함입니다(「(비VR无效)」 표기).

### 7.2 마스크 기본값은 **버텍스 컬러**에서 옴

lilToon 의 `triMask`:

| 채널 | 용도 |
|---|---|
| R | MatCap 가중치 |
| G | Rim 가중치 |
| B | 발광 가중치 |

⇒ **모델에 버텍스 컬러가 없으면 자동으로 「가중치 1 고정」으로 폴백**되며, 효과가 사라지지 않습니다.
⇒ 패널에는 「버텍스 컬러」미리보기 버튼이 있어 버텍스 컬러를 색으로 그려 마스크 구역을 확인할 수 있습니다.

### 7.3 `_Smoothness = 1` ⇒ `roughness = 0` ⇒ `pow(nh, +INF)`

```
perceptualRoughness = 1 - _Smoothness        (lil_common.hlsl:206 초기값 1.0)
roughness           = perceptualRoughness²    (lil_common_frag.hlsl:1438)
```

**HLSL**: `1.0/0.0 = +INF`, `pow(nh, +INF)` 는 `nh<1` 에서 0, `nh>=1` 에서 1.
**GLSL**: **지수가 무한인 것은 미정의 동작**입니다.

⇒ 우리는 명시적으로 `nh >= 1.0 ? 1.0 : 0.0` 으로 씁니다.

### 7.4 GLSL 과 HLSL 의 행렬 방향이 다름

```
HLSL  mul(float3x3(a,b,c), v)  는 **행 점곱**  ⇒ (dot(a,v), dot(b,v), dot(c,v))
GLSL  mat3(a,b,c) * v          는 **열 조합**  ⇒ 둘은 다름
```

⇒ 이식할 때는 `dot` 을 직접 쓰는 편이 가장 실수가 적습니다(`lilCalcMatCapUV` 가 그 예).

### 7.5 ★★ three 의 toon 조명은 `material.diffuseColor` 를 읽음 (로컬 `diffuseColor` 아님)

  ⚠️⚠️ **수광 결과**를 바꾸려면 반드시 **`material.diffuseColor`**(struct 의 필드)를 바꿔야 합니다.
     로컬 `diffuseColor` 를 바꾸면 **이후 단계**(alpha / emissive / fog)에만 영향이 있고 조명에는 없습니다.

      lights_toon_pars_fragment:
          reflectedLight.directDiffuse   += irradiance * BRDF_Lambert( material.diffuseColor );
          reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );

  ⚠️ 게다가 `material` 은 **`#include <lights_fragment_begin>` 안에서** 대입되므로,
     그것을 바꾸려면 그 include **이후**에 써야 합니다.
  ⚠️ include 이후에 붙인 코드는 **모든 블록 바깥**이라 블록 내부 지역 변수(예: `ba3dLc`)를 참조할 수 없습니다.
     파일 스코프/전처리에서 선언한 변수(예: `ba3dColor2nd`)를 써야 합니다.

  ⇒ 이 함정 때문에 「메인 컬러 2nd / 3rd」가 기본 설정에서 **완전히 보이지 않는** 상태로 오래 잠복했습니다.
     B5 기간에 사용자의 「enableLighting 을 0 으로 해야 보인다」는 실험으로 찾아냈습니다.

### 7.5.5 ★ 외곽선에 **두 시스템**이 있고 상태를 공유해야 함

  ⚠️ lilToon 모드에서는 **`applyLilOutline()` 의 독립 역확장 메시**를 씁니다.
     three 의 `OutlineEffect` 가 아니며, 둘은 각자 「건너뛰기」 규칙을 가집니다:

      applyOutlineParams()  ⇒ userData.outlineParameters.visible 기록
                              (투명 / 바닥 / 입가 장식 ⇒ false)
      applyLilOutline()     ⇒ 원래 **설정의 o.skipPattern 만 인식**, visible 은 전혀 보지 않음

  ⇒ 결과: 「투명 머티리얼은 자동으로 외곽선 끔」이 three 의 OutlineEffect 에만 적용되고,
     lilToon 역확장 외곽선에는 **완전히 무효**였습니다.
  ⇒ 증상: lilToon 스타일로 전환 · 기본 외곽선 상태에서 아무것도 건드리지 않으면
     **투명 머티리얼이 그 불투명 뒷면 껍질에 덮여 불투명해집니다**.

  ### 참고: 외곽선 껍질은 **깊이를 쓸 수 없음**

  기존 외곽선 머티리얼은 `depthWrite = true`, `renderOrder = -1`(먼저 그림)
  ⇒ 깊이가 먼저 깔려 뒤의 반투명 판이 **깊이 컬링**됨 ⇒ 그 영역이 「불투명」해 보입니다.

  ⇒ 올바른 처리: 소스 머티리얼이 투명하면 외곽선 머티리얼도 `transparent` + **`depthWrite = false`**.
     (lilToon 은 외곽선을 독립 pass 로 두고 머티리얼의 `_TransparentMode` 를 상속)

  ### ⚠️ 그리고 외곽선 alpha 는 **머티리얼에서 오지 않음**

      lil_common_frag.hlsl:389     fd.col.a *= **_OutlineColor.a**;

  ⇒ 외곽선 색 자체가 alpha 를 가집니다(패널의 「외곽선 투명도」). 본체 머티리얼과 무관합니다.
  ⇒ 「투명을 따라간다」는 것은 **블렌드/깊이 상태**에서 구현되며 alpha 를 곱하는 것이 아닙니다.

### 7.5.6 ★ 검사기도 「인덱스 어긋남」을 겪을 수 있음

  ⚠️ `check-panel.mjs` 는 **인라인 스크립트**를 `codeLines` 로 뽑으면서 전체 `html` 의 `L` 도 유지합니다.
     두 배열은 **`base` 행만큼 인덱스가 어긋납니다**.

  기존 ⑧번 검사는 `L[i]` 로 작성되어 「스크립트가 파일 앞부분에 있다」는 우연에 기대고 있었습니다.
  ⇒ 스크립트 **앞에** 무언가 삽입되면(예: 주간 테마 CSS) 오프셋이 바뀌어
     주석 판정이 다른 행을 읽고 ⇒ **정상 호출을 주석 처리된 것으로 오판**하여
     「groupifyLilPanel() 이 0 곳에서 호출됨」으로 보고했지만 코드는 정상이었습니다.

  ⇒ 수정법: 원문을 읽어야 하는 판정은 모두 `L[i + base]` 를 씁니다.

---

  ⚠️ 교훈: **검사기에 버그가 있으면 없는 문제를 보고하므로, 보고하지 않는 것보다 시간을 더 낭비합니다.**
     「멀쩡하던 것이 갑자기 오류를 낸다」 싶으면 먼저 검사기를 의심하고, 그다음 코드를 의심하세요.

### 7.6 `onBeforeCompile` 이 받는 것은 **`#include` 가 확장되기 전 원문**

three 는 `onBeforeCompile` **이후**에 `resolveIncludes` 를 수행합니다.

⇒ three 내장 chunk 안의 코드(예: `RE_Direct_Toon`)를 바꾸려면
   **`#include <xxx>` 지시자 자체를 교체**하고 패치한 chunk 텍스트를 붙여야 합니다.
⇒ `shader.fragmentShader` 에서 chunk 안의 그 행을 직접 찾는 방식으로는 **절대 찾을 수 없습니다**.

### 7.7 프리셋은 **머티리얼 단위**

lilToon 의 프리셋은 원래 머티리얼마다 한 벌이고, 우리 구조는 「전역 기본 + 머티리얼별 희소 덮어쓰기」입니다.
자세한 내용은 [`CONFIG.ko.md`](CONFIG.ko.md) 와 `LILTOON1.x.md` 9 장을 참고하세요.

---

## 六. 비교 방법 (재현 가능)

### 8.1 속성 수준

양쪽 `lts.shader` 를 `[attr] _Name ("Label", Type) = default` 로 파싱합니다.

⚠️ **타입에 `Range(0, 1)` 처럼 괄호가 올 수 있으므로** 정규식은 **탐욕적 `(.*)`** 를 써야 합니다.
   그렇지 않으면 `_AsUnlit ("As Unlit", Range(0, 1)) = 0` 이 매칭에 실패합니다(오른쪽 괄호가 하나 더 붙음).

### 8.2 프리셋 수준

`.asset` 의 `m_Floats` 구간을 파싱합니다:

```
- name: _UseReflection
    value: 1
```

(`- name:` 과 `value:` 는 **인접한 두 행**)

### 8.3 수식 수준

함수 시그니처로 본문을 추출(중괄호 짝)해 행 단위 비교(주석과 빈 행 무시)

### 8.4 행 번호 매핑

§5 의 방법을 참고하세요.

---

## 七. 알려진 편차 목록 (정직한 기록)

| 항목 | 상황 |
|---|---|
| `_MatCapVRParallaxStrength` | 비 VR 에서 무효, lilToon 자체가 그러함 |
| UV1 / UV2 / UV3 | 미지원, 패널 드롭다운은 `uv0` 와 「시점 구면」만 제공하며 옵션에 명시 |
| 레이어 디졸브 「UV」모드 | **메시 UV0**(= 아틀라스) 사용, 캐릭터에서는 조각나 보이며 **Unity 와 동일한 표현** |
| **Decal 의 실용성** | ⚠️ 수식 / 주입 / 가장자리 AA / 미러 / 단면 / 아틀라스 애니메이션 **모두 lilToon 대로 충실히 구현**했지만 **이 모델에 Decal 용 UV 배치가 없음** ⇒ 실제로는 줄무늬만 나옴, 아래 참고 |
| `_ReflectionCubeTex` | 미구현, Unity 는 Reflection Probe 에 의존하며 뷰어에는 없음 ⇒ 스페큘러 하이라이트 경로만 구현 |
| 비툰 경로의 완전한 GGX | 미구현, `_SpecularToon` 기본값이 1 ⇒ 프리셋은 모두 툰 경로 ⇒ 충분히 근사 |
| 광량 클램프와 lilToon 의 차이 | lilToon 은 간접광에도 같은 `lightColor` 를 곱해 그림자 속 환경광이 눌리지만, three 의 환경광은 **독립적으로 더해짐** ⇒ 하한을 크게 올리면 lilToon 보다 약간 밝음. 광원 구조 차이이며 억지로 흉내내지 않음 |
| cel 모드 | cel 과 lilToon 은 **직교하는 두 축**, 매 차수 lilToon 측 변경이 cel 을 오염시키지 않았는지 검증 |

### ★ B5 Decal 의 실용성에 대해 (오해 방지용 별도 설명)

  **Decal 은 「그림 한 장을 얼굴 어딘가에 붙이는」 도구가 아니라, 그 레이어 텍스처의 샘플링 규칙을 바꾸는 기능**입니다:

      ① UV 채널 교체(보통 uv1)
      ② 반대쪽으로 미러 복사 / 한쪽만 표시(탄젠트 w 의 부호로 구역 분할)
      ③ 아틀라스 프레임 애니메이션(_Main2ndTexDecalAnimation)
      ④ decalUv.x 가 [0,1] 을 벗어난 픽셀 제거(가장자리 안티에일리어싱 포함)

  ⇒ 진짜 「데칼」효과는 **모델/아트가 데칼용 UV 를 준비해 둔 것**에서 나오며, 임의의 이미지로는 되지 않습니다.

  ### 이 모델에서 줄무늬만 보이는 이유

      CH0155_Face   uv1.x ∈ [-0.53, 1.00]   uv1.y ∈ [-0.998, 1.00]
      CH0155_Body   uv1.x ∈ [-11.65, 12.10]
      CH0155_Hair   uv1.x ∈ [-13.27, 14.46]

  ⇒ `texture2D(tex, uv1)` 이 UV 공간에서 **반복 샘플링**됨 ⇒ 줄무늬 / 띠 모양.
  ⇒ Decal 의 AA 가 `x ∈ [0,1]` 한 줄만 남기므로 ⇒ 지금 보이는 모습이 됩니다.
  ⇒ **Unity 에서 같은 UV1 + 같은 ST 를 쓰면 완전히 동일한 줄무늬가 나타납니다.** 우리 버그가 아닙니다.

  ### 「ST 스케일 / 오프셋」의 실제 용도

      ST 스케일 = (0.1, 0.1)  ⇒ 텍스처의 1/10 만 잘라 10 배로 확대해 모델에 깔기
      ST 오프셋 = (0.3, 0.5)  ⇒ 어느 부분을 자를지

  ⇒ 「텍스처 한쪽 구석을 잘라 채우기」에는 쓸 수 있지만 **자유 배치는 불가**.
  ⇒ 「★Decal 디버그 = 2」로 decal UV 를 색으로 출력해 UV 가 어디에 놓이는지 확인할 수 있습니다.

  ### 진짜로 「얼굴에 작은 그림 붙이기」를 하려면

      · 모델에 **데칼용으로 배치된 UV 채널**이 있어야 함(아트가 모델링 시 남겨둔 것)
        예: 얼굴의 장식 가능한 위치들을 「데칼 아틀라스」한 장으로 정리
      · 각 위치가 아틀라스의 한 구역 [u0,u1] × [v0,v1] 을 차지
      · 그리고 _Main2ndTex_ST 로 그 구역을 [0,1] 로 확대
      · _Main2ndTexDecalAnimation 으로 프레임 선택

  ⇒ BA 시리즈의 uv1 은 그렇게 배치되어 있지 않음 ⇒ 따라서 줄무늬만 나옵니다.

---

## 八. 참고

| 파일 | 내용 |
|---|---|
| [`LILTOON1.x.ko.md`](LILTOON1.x.ko.md) | 구 기준선(1.3.7)과 현재 기준선의 대조, 외곽선(Outline) 전체 사양, 프리셋의 머티리얼 단위 구조 |
| [`CONFIG.ko.md`](CONFIG.ko.md) | 모든 설정 키, 구현 세부, 차수별 함정과 교훈 |
| `viewer.js` | 93 곳의 행 번호 인용, 전부 2.3.4 로 정렬 |
| `develop_res/liltoon-2.3.4/` | 현재 기준선 소스 |
| `develop_res/lilToon/` | 구 기준선 소스(대조용 보존) |

---

## 九. 2026-10-10 차수: 스타일 백엔드 밝기 의미 정렬 (누적 기록)

「lilToon 스타일」백엔드와 대조 백엔드(lilToon 소스 이식) 사이에 눈에 보이는 밝기 편차가 두 군데 있었습니다.
이번 차수에서 스타일 측의 **조명 합성 / 출력 처리 / 기본색 출처**를 대조 측의 실제 의미에 맞췄습니다.

### 9.1 변경 요점

| 항목 | 이전 방식 | 현재 방식 |
|---|---|---|
| 직접광 | 광원별 Lambert 합산 후 경험 보정 곱 | **첫 방향광 사용**, `clamp(메인 + 환경, 하한, 상한)`, **1 회** `A × 광색 × R` 합성 |
| 경험 보정 | 합성에 `1.65` 계수 포함 | 해당 경로에서 **미사용**(기본값 자체는 변경 없음, 미변경 모드의 기존 경로는 유지) |
| 기본색 | 대조 측과 **비대칭**(한쪽만 머티리얼 기본색을 한 번 더 곱함) | 「유효 설정 → 설정 매핑 → vendor 실행 기본값」으로 유도해 메인 텍스처·메인 레이어와 함께 합성 |
| 출력 | 페이지 톤 매핑(`LinearToneMapping`, 노출 1.15) | 유지. 정렬 후 수광부의 대면적 근백색 클리핑이 사라짐 |
| 첫 로드 | 스타일 경로만 쓸 때는 브리지 모듈을 적재하지 않음 | 스타일 백엔드에 처음 진입할 때 **모듈도 함께 적재**(적재만 하고 렌더 백엔드는 전환하지 않음) |

### 9.2 실측 (검정 배경 α 합성, `L = .2126R + .7152G + .0722B`)

| 상태 | 전체 평균 절대차 | 밝기차 > 12 비율 |
|---|---|---|
| 홈 기본 모델, 순수 기본 | 0.029 | 0.076 % |
| 홈 기본 모델, 「피부 · 애니메이션」전역 프리셋 | 0.000074 | 0.00016 % |
| Melano(기준 포즈) | 0.050 | 0.122 % |
| Melano, 「피부 · 애니메이션」전역 프리셋 | 0.00067 | 0.0029 % |

판정: 핵심 영역(머리 / 얼굴 / 겉옷 / 양말) 평균 절대차 ≤ 3, 전체 밝기차 > 12 픽셀 비율 ≤ 1 %.

### 9.3 순서 (업스트림과 동일)

노멀 → receive → 일반 단계 `x/y/z` 와 경계 전환 단계 `w` → 강도 → 각 층 색 →
메인 강도 → 최소값 → 경계색 → 최종 블렌드. `_UseShadow = 0` 이면 구간 전체 생략.
그림자 노멀은 여전히 **무조건 대입**(기본 강도 1 도 기록), 층별 단계에 안티에일리어싱 포함.

### 9.4 아직 검증하지 않은 것 (정직한 기록)

- `_ShadowNormalStrength` 중간 강도: 슬라이더는 기록되지만 대응 셰이더 분기는 아직 적용되지 않음.
- 메인 컬러 2/3 층 사용 분기는 별도 검증하지 않음.
- 얼굴 그림자는 **밝기** 기준만 확인했고 **모양 / 전환**의 독립 검증은 하지 않음.
- 투명 배경 분기, 다른 모델, 「지정 머티리얼」프리셋 대상은 미검증.

---

## 十. 2026-10-18 관感 기준: Unity 측 조건 (확인 완료)

참조 프로젝트: Unity **2022.3.22f1** · 프로젝트 `Melano-Migrated` · 씬 `Melano_scene` (로컬 읽기 전용으로 확인).

| 항목 | 값 | 근거 |
|---|---|---|
| 렌더 파이프라인 | **Built-in** | `ProjectSettings/GraphicsSettings.asset`: `m_CustomRenderPipeline: {fileID: 0}` · `m_SRPDefaultSettings: {}` |
| 색 공간 | **Linear** | `ProjectSettings/ProjectSettings.asset`: `m_ActiveColorSpace: 1` |
| 포스트 프로세스 / 톤 매핑 | **없음** | 프로젝트 전체 grep: Assets/Scenes 에 `PostProcessVolume` / `Tonemapping` 0 개 (postprocessing 패키지는 설치되어 있으나 미사용) |
| lilToon | **2.3.4** | `Assets/lilToon/package.json` |

**결론**: Unity 측 lilToon 은 **머티리얼 수준 톤 매핑을 하지 않습니다**. 출력은 「**선형 셰이딩 + 표시 단계 sRGB 변환**」입니다.

이 리포지터리에 대응시키면:

- 소스 백엔드: `mat.toneMapped = false`(페이지 톤 매핑 미추종) + **sRGB 출력 유지** ⇒ Unity 의미와 일치.
- 우리 스타일 백엔드: 원래 `#include <tonemapping_fragment>` 를 제거 ⇒ 두 백엔드의 기준이 일치.
- 페이지 수준 ACES 는 **PBR / 네이티브 머티리얼**에만 작용해야 하며, 툰 두 경로에 영향을 주면 안 됩니다(업스트림 0.1.6+ 는 추종하므로 명시적으로 꺼야 함).

### 외곽선 (혼합 방식)

| 메시 종류 | 그리는 주체 | 설명 |
|---|---|---|
| 스킨 메시 | **업스트림**(`shaderVariant = Hidden/lilToonOutline` 등) | Unity 가 쓰는 것이 업스트림 외곽선 ⇒ 기준에 더 가까움 |
| 정적 메시 | **자체 역확장** | 업스트림의 정적 메시 표현은 미검증 |
| 이름에 `_Outline` 이 있는 껍질 메시 | **자체**(업스트림 미적용) | 그 자체가 확장 껍질이며, 업스트림을 겹치면 150× 축소에서 큰 덩어리로 부풀어 오름 |

⚠️ 실측: `_OutlineCull`, 강제 `side = FrontSide` 는 이 팽창에 **모두 무효**(픽셀 거의 불변) ⇒ 「껍질 메시 제외」한 가지에만 의존.
