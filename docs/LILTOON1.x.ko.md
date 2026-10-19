# lilToon 1.3.7 → Web (three.js) 구 기준선 대조 (아카이브)

[简体中文](LILTOON1.x.md) ｜ [繁體中文](LILTOON1.x.zh-TW.md) ｜ [English](LILTOON1.x.en.md) ｜ [日本語](LILTOON1.x.ja.md) ｜ **한국어**

> ⚠️ **이 문서는 아카이브되었습니다** — **구 기준선 lilToon 1.3.7** 의 대조와 점검 기록입니다.
> **현재 유효한 기준선은 2.3.4** 이며 [`LILTOON2.x.ko.md`](LILTOON2.x.ko.md) 를 보세요.
>
> 이 문서를 남긴 이유:
>   · 1~3 단계의 **완료도 기록**과 당시의 판단 과정
>   · **외곽선(Outline) 전체 사양** (소스 수준, 여전히 유효)
>   · **프리셋의 머티리얼 단위** 구조 개편안 (여전히 유효)
>   · 「왜 이렇게 했는가」의 유도 과정 다수 — 이관 시 다시 쓰지 않았습니다.
>
> ⚠️ 안의 **행 번호는 1.3.7 기준**입니다. 소스를 확인하려면 LILTOON2.x.md §4 의 소스 맵을 쓰세요.

# lilToon → Web (three.js) 대조표

> 목적: lilToon 의 어떤 효과를 이 뷰어(three.js r160)에서 재현할 수 있는지, 어떤 입력이 필요한지 판단.
>
> **실제 소스로 확인 완료**: `lilToon/` (워크스페이스, `jp.lilxyzw.liltoon` **v1.3.7**, Unity 2018.1+).
> 二 장의 항목별 판단은 소스 통독에서 나왔고, 六 장에 **정확한 수식과 파일 행 번호**를 적었습니다.
> 패널 항목 이름은 1.3.7 의 `Editor/` 와 `lts.shader` 기준으로 정리했으며, Unity 에서 다르면 보이는 쪽이 정답입니다.

---

## 一. 결론 먼저

| 질문 | 결론 |
|---|---|
| lilToon 을 **통째로 이식**할 수 있나 | ❌ **불가**. Unity ShaderLab + HLSL 이며 수만 행, 수십 개의 `.cginc` 로 나뉘고 Unity 런타임에 깊이 의존(다중 Pass, `UNITY_LIGHT_ATTENUATION`, Lightmap, Light Probe, 스크린 공간 그림자, MaterialPropertyBlock). 완성된 three.js 이식판은 없습니다. |
| **보이는 느낌의 본체**를 다시 쓸 수 있나 | ✅ **가능**. 핵심은 「다단 ramp + 경계색 + Rim + MatCap + 머티리얼 단위 발광/역광 + 역확장 외곽선」이고, 이것들이 lilToon 결과의 대부분을 차지합니다. |
| 가장 큰 장애물은 | ⚠️ **기술이 아니라 파라미터**입니다. GLB/FBX 에는 「影の境界 = 0.5, リムライト強度 = 0.3, MatCap = `xxx.png`」같은 설정이 들어 있지 않습니다. 느낌은 「사용자가 알려준 값」이나 「범용 기본값」에서만 나옵니다. |
| 텍스처는 얻을 수 있나 | ✅ 대부분 가능: `MainColor` / `NormalMap` / `EmissionMap` / 외곽선 텍스처. 모델 옆 파일이거나 GLB 에 내장되어 있습니다. |

---

## 二. Unity 에서 알려 주셔야 하는 파라미터

> 패널 항목 이름은 lilToon 1.7.x 기준으로 정리했으며, 다르면 보이는 그대로 적어 주세요.
> 확실하지 않은 항목은 **비워 두시면** 기본값으로 채웁니다.

### 기본 정보

```
lilToon 버전:             (1.7.x / 2.0.x / 기타)
Unity 버전:
이것은:                   (VRChat アバター / 일반 모델 / 씬 오브젝트)
모델 내보내기 형식:       (FBX / GLB)
현재 Web 에서 보이는 모습: (스크린샷이면 더 좋음)
Unity 에서의 기준 모습:   (스크린샷이면 더 좋음)
```

### 基本設定

```
色:                       R__ G__ B__  /  #______
影の色:                   R__ G__ B__  /  #______
影の境界:                 0.__
影のぼかし:               0.__
2nd 影 有効:              是 / 否     色: ____  境界: 0.__
3rd 影 有効:              是 / 否     色: ____  境界: 0.__
バックライト:             色: ____  強度: 0.__
```

### メインカラー

```
テクスチャ:               (파일명)
色:                       #______
ブレンドモード:           Normal / Add / Screen / Multiply / …
アルファマスク:           (파일명, 없으면 비움)
カットオフ:               0.__
```

### ノーマルマップ

```
1st:                      (파일명)  スケール: 0.__
2nd / 3rd:                (파일명, 없으면 비움)
```

### リムライト

```
有効:                     是 / 否
色:                       #______
境界:                     0.__        ぼかし: 0.__
方向:                     ライト方向 / 視点方向
マスク:                   (파일명, 없으면 비움)
```

### マットキャップ

```
1st:                      (파일명)  ブレンドモード: ____
2nd / 3rd:                (파일명, 없으면 비움)
```

### エミッション

```
1st:                      (파일명)  色: #______  強度: 0.__
2nd:                      (파일명, 없으면 비움)
```

### アウトライン

```
有効:                     是 / 否
色:                       #______
太さ:                     0.___
基準:                     法線 / 位置
テクスチャ:               (파일명, 없으면 비움)
```

---

## 三. 권장 구현 순서

「시각적 효과 ÷ 작업량」순으로 **세 단계**이며, 단계마다 끝나면 바로 결과를 볼 수 있습니다:

### 1 단계 — 체감이 가장 큰 네 가지

1. **다단 ramp + 경계색**: 현재의 `celSteps/celDark` 를 「N 단계 + 단계별 색 + 경계 폭」으로 업그레이드
2. **Rim Light**: 시점 가장자리 광 + 색 + 경계 + 마스크
3. **MatCap**: 1st 슬롯 (시점 공간 구면 샘플링)
4. **Emission**: 머티리얼 단위 발광 + 강도 (두 번째는 나중)

> 이 네 가지는 모두 `onBeforeCompile` 주입 범위 안이며 렌더 구조를 건드리지 않아 위험이 가장 낮습니다.

### 2 단계 — lilToon 에 더 가깝게

5. **외곽선 업그레이드**: `OutlineEffect` 대신 자체 역확장 pass → **외곽선 폭 텍스처**와 **버텍스 컬러 제어** 지원
6. **Main Color 의 ブレンドモード** (Add / Screen / Multiply)
7. **Backlight / 역광**
8. **디졸브**

### 3 단계 — 완료됨

원래 두 항목이었으나, 실행 시 **사용자가 노멀 맵 경로를 먼저 건너뛰도록** 요청(비용 최대)해 「다른 것」을 하기로:

**9. 2nd / 3rd 메인 레이어 + 2nd MatCap** — ✅ 완료
- 2nd / 3rd 메인 레이어 각 8 항목 (★ `_Main2ndEnableLighting` 은 「조명에 참여하는 **비율**」이며 두 곳에 주입 필요)
- MatCap 1st / 2nd 각 11 항목 (1st 에 완전판에만 있던 color / backfaceMask / mainStrength 도 보강)
- 마스크 텍스처 **3 개** (`_MatCapBlendMask` / `_MatCap2ndBlendMask` 는 `.rgb`, `_EmissionBlendMask` 는 RGBA)
  ⚠️ `_RimBlendMask` / `_BacklightBlendMask` 는 **존재하지 않음** (Rim 은 버텍스 컬러 G 사용)
- ⏸ **2nd / 3rd ノーマルマップ** 은 의도적으로 보류
- ❌ 미구현: Decal, 거리 페이드, 레이어 디졸브 (레이어당 3 항목)

**10. Stencil 등 가장자리 기능** — ✅ 완료
- Stencil: 본체 8 항목 + 외곽선 8 항목, Unity 열거형 → three 상수 매핑.
  ★ 전제: `renderer` 가 `stencil: true` 여야 함 (three r160 기본값 false, 나중에 추가 불가)
  ★ 패널에서는 **「Stencil 모델」**과 **「Stencil 외곽선」** 두 그룹으로 분리.
  ★ 「스텐실 모드」드롭다운 첨부 (4 모드, lilInspector.cs 에서 추출, 그중 2 개는 이름이 직관과 반대)
- 외곽선 텍스처의 `_OutlineTex_ST` / `_OutlineTex_ScrollRotate` / `_OutlineTexHSVG` — ✅
- ❌ 미구현: 발광 2 층(Emission2nd, 7 항목), 발광 GradSpeed / ParallaxDepth / Fluorescence

**⚠️ 노멀 맵 보류의 부수 비용** — 파라미터 9 개가 「스위치만 있고 경로가 없어」 조정해도 효과가 없습니다.
`_Main2ndNormalStrength` / `_Main3rdNormalStrength` / `_MatCapNormalStrength` / `_MatCap2ndNormalStrength` /
`_RimNormalStrength` / `_BacklightNormalStrength` / `_ShadowNormalStrength` /
`_Shadow2ndNormalStrength` / `_Shadow3rdNormalStrength`

**권장 후속 순서**: ① 발광 2 층(낮음) ② 레이어 디졸브(낮음) ③ 거리 페이드(중간) ④ Decal(중간) ⑤ 노멀 맵 경로(높음, 한 번에 9+3 개 파라미터 해금)

### 명확히 하지 않는 것

Glitter, Audio Link, Fur / Gem / Tessellation, Lightmap / Light Probe, 스크린 공간 그림자, VRC Light Volumes

---

## 四. 미리 알아야 할 두 가지

1. **Unity 와 똑같아지지는 않습니다**
   three.js 의 조명 모델, 톤 매핑, 그림자 처리가 Unity 와 다릅니다. 파라미터를 아무리 정확히 옮겨도 최종적으로는 눈에 보이는 차이가 남습니다(특히 **그림자의 강도**와 **하이라이트**). 목표는 「한눈에 같은 캐릭터의 같은 화풍」이지 픽셀 단위 일치가 아닙니다.

2. **파라미터는 머티리얼마다 따로 옮겨야 합니다**
   lilToon 은 **머티리얼 단위**로 설정합니다. 한 캐릭터의 얼굴, 몸, 옷, 머리가 4 개 머티리얼에 4 벌 설정일 수 있습니다.
   머티리얼이 많다면 **먼저 「피부」와 「머리」두 벌만** 옮기길 권합니다. 이 둘이 체감의 80 % 를 차지합니다.

---

## 五. 외곽선(Outline) 전체 사양 — 소스 수준

> `Hidden/lilToonOutline` 과의 관계: 그것은 에디터가 메인 셰이더에서 **생성**하는 배리언트입니다(소스에 독립 파일 없음).
> 외곽선의 모든 속성은 `lts.shader` 에 있으며(474~556 행), 렌더 시 독립 pass 로 실행됩니다.

### 8.1 정점 변위

경로: `lil_vert_outline.hlsl` (29 행, 디스패치만)
     → `lil_common_functions.hlsl:279 lilCalcOutlinePosition`
     → `lil_common_functions.hlsl:254/265 lilGetOutlineWidth`

```hlsl
// lil_common_functions.hlsl:254
float lilGetOutlineWidth(uv, color, outlineWidth, outlineWidthMask, outlineVertexR2Width) {
    outlineWidth *= 0.01;                                   // ★ 1/100
    #if LIL_FEATURE_OutlineWidthMask
        outlineWidth *= SAMPLE(outlineWidthMask, uv).r;     // 마스크는 R 채널
    #endif
    if (outlineVertexR2Width == 1) outlineWidth *= color.r; // 버텍스 컬러 R 을 폭으로
    if (outlineVertexR2Width == 2) outlineWidth *= color.a; // 버텍스 컬러 A 를 폭으로
    return outlineWidth;
}

// lil_common_functions.hlsl:265
float lilGetOutlineWidth(positionOS, positionWS, uv, color, ...outlineFixWidth) {
    outlineWidth = <위 함수 결과>;
    // ★ 핵심: 월드 단위 ↔ 화면 일정 두께의 혼합
    outlineWidth *= lerp(1.0, saturate(length(lilHeadDirection(positionWS))), outlineFixWidth);
    return outlineWidth;
}

// lil_common_functions.hlsl:279
void lilCalcOutlinePosition(inout positionOS, uvs, color, normalOS, tbnOS, ...) {
    float3 positionWS = <M 행렬 × positionOS>;
    float width = lilGetOutlineWidth(...);
    float3 outlineN = normalOS;
    #if LIL_FEATURE_OutlineVectorTex
        outlineN = lilGetOutlineVector(tbnOS, uvs[outlineVectorUVMode], outlineVectorScale, outlineVectorTex);
    #endif
    if (outlineVertexR2Width == 2) outlineN = mul(color.rgb * 2.0 - 1.0, tbnOS);
    positionOS += outlineN * width;
    float3 V = <원근> ? lilViewDirectionOS(positionOS) : <직교>;
    positionOS -= normalize(V) * outlineZBias;
}
```

`lil_common_macro.hlsl`:
- `614 lilHeadDirection(positionWS) = _WorldSpaceCameraPos - positionWS`
  ⇒ `length(...)` 는 **정점에서 카메라까지의 거리**입니다.
- `646 lilViewDirectionOS(positionOS) = 오브젝트 공간의 카메라 위치 - positionOS`

**⇒ `_OutlineFixWidth` 의 의미**:
| 값 | factor | 효과 |
|---|---|---|
| 0 | 1.0 | 폭이 **월드 단위** (멀리서 보면 더 얇음) |
| 1 | saturate(거리) | 폭이 **화면에서 일정** (원근에서 거리를 곱해 정확히 상쇄) |
| 0.5 (기본) | 두 값의 보간 | 절충 |

### 8.2 프래그먼트 셰이딩

`lil_common_frag.hlsl:349-387`:

```hlsl
fd.col = SAMPLE(_OutlineTex, uv);                       // 활성이면 텍스처, 아니면 흰색
fd.col.rgb = lilToneCorrection(fd.col.rgb, _OutlineTexHSVG);   // 활성 시
float3 outlineLitColor  = _OutlineLitApplyTex ? fd.col.rgb * _OutlineLitColor.rgb : _OutlineLitColor.rgb;
float  outlineLitFactor = saturate(NdotL * _OutlineLitScale + _OutlineLitOffset) * _OutlineLitColor.a;
// _OutlineLitShadowReceive 이면 이어서 *= fd.attenuation
fd.col.rgb = lerp(fd.col.rgb * _OutlineColor.rgb, outlineLitColor, outlineLitFactor);
fd.col.a  *= _OutlineColor.a;
```

**기본 `_OutlineLitColor.a = 0`** ⇒ `outlineLitFactor = 0` ⇒ **곧 `텍스처 × _OutlineColor`**.
수광은 선택적 고급 기능입니다.

### 8.3 전체 속성과 기본값 (lts.shader:474-556)

| 속성 | 의미 | 기본값 |
|---|---|---|
| `_OutlineColor` | 외곽선 색 | (0.6, 0.56, 0.73, 1) |
| `_OutlineTex` | 외곽선 텍스처 | white |
| `_OutlineTexHSVG` | 색상/채도/명도/Gamma | (0,1,1,1) |
| `_OutlineLitColor` | 수광 색 | (1.0, 0.2, 0, **0**) |
| `_OutlineLitApplyTex` | 수광 시 텍스처 곱 여부 | 0 |
| `_OutlineLitScale` | 수광 강도 | 10 |
| `_OutlineLitOffset` | 수광 오프셋 | -8 |
| `_OutlineLitShadowReceive` | 수광 시 그림자 받기 | 0 |
| `_OutlineWidth` | 폭 Range(0,1) ⚠️ [lilOLWidth] | 0.08 |
| `_OutlineWidthMask` | 폭 마스크 텍스처 | white |
| `_OutlineFixWidth` | 고정 폭 Range(0,1) | 0.5 |
| `_OutlineVertexR2Width` | 버텍스 컬러를 폭으로: 0 None / 1 R / 2 RGBA | 0 |
| `_OutlineVectorTex` | 노멀 벡터 텍스처 | bump |
| `_OutlineVectorUVMode` | UV0..UV3 | 0 |
| `_OutlineVectorScale` | -10~10 | 1 |
| `_OutlineEnableLighting` | Range(0,1) | 1 |
| `_OutlineZBias` | Z 오프셋 | 0 |
| `_OutlineDisableInVR` | | 0 |
| `_UseOutline` | 전체 스위치 | 0 |
| `_OutlineCull` | Cull: 0 Off / 1 Front / 2 Back | 1 |
| `_OutlineSrcBlend` / `DstBlend` / `SrcBlendAlpha` / `DstBlendAlpha` / `BlendOp` / `BlendOpAlpha` | 독립 블렌드 | 1/0/1/10/0/0 |

### 8.4 three.js 구현 경로 (우리 이식안)

```
① 매개체: 각 메시에 **복제 머티리얼**을 추가 (geometry 공유, side = THREE.BackSide)
   또는 두 번째 Mesh 자식 노드로 geometry 공유 + 머티리얼 복제.
   —— OutlineEffect 를 쓰지 않는 이유: 파라미터가 thickness/color/alpha 뿐이라
      폭 마스크 / 버텍스 컬러 폭 / 고정 폭 / Z Bias / 수광을 추가할 수 없습니다.

② 정점 변위: onBeforeCompile 로 #include <begin_vertex> 이후에 주입
   vec3 outlineN = objectNormal;                      // 정점 속성의 노멀
   float ow = uOutlineWidth * 0.01;
   ow *= <마스크 샘플 .r>;                             // 활성 시
   ow *= <color.r 또는 color.a>;                       // _OutlineVertexR2Width
   ow *= mix(1.0, saturate(dist), uOutlineFixWidth);  // dist = -mvPosition.z
   transformed += outlineN * ow;
   transformed -= normalize(cameraPosOS - transformed) * uOutlineZBias;

③ 프래그먼트: uOutlineColor × 텍스처 출력 (기본 경로)
   수광 부분은 8.2 의 수식대로, NdotL 이 필요 → toon 과 같은 조명 세트 사용.

④ 렌더 상태: side = BackSide, depthWrite = true.
   —— OutlineEffect 의 역확장 발상과 같지만 파라미터를 전부 직접 제어.

⑤ FBX 가 원래 잘못 나오던 이유 (후보 세 가지, 구현 시 하나씩 검증)
   · FBX 단위 스케일이 1 이 아님 → 월드 단위 확장이 무효 → _OutlineFixWidth 의미로 해결
   · FBX 하드 엣지 노멀 → 확장 시 갈라짐 → 스무스 노멀 필요
   · FBX 스키닝 → 역확장과 본 렌더가 불일치
```

### 8.5 할 일

- [ ] 외곽선 머티리얼과 정점 변위 구현
- [ ] lilToon 파라미터 패널 연결 (폭 / 마스크 / 버텍스 컬러 / 고정 폭 / Z Bias / 색 / 수광)
- [ ] 프리셋 연결 (프리셋의 `_OutlineWidth` 등 값을 LIL_PRESETS 에 채움)
- [ ] GLB 와 FBX 양쪽 검증
- [ ] 기존 OutlineEffect 경로를 대체할지 결정

---

## 六. 프리셋은 **머티리얼 단위** — 구조 개편안

> 관찰 (사용자 2026-10-05): lilToon 프리셋은 **머티리얼별로 선택**할 수 있고, 그래서
> 피부 / 머리 / 옷 / 무기 / 자연 같은 대분류가 있습니다. 쓰는 방식은:
>   · 피부 머티리얼 슬롯 → Skin-* 적용
>   · 옷 머티리얼 슬롯   → Cloth-* 적용
>   · 머리 머티리얼 슬롯 → Hair-* 적용
> (실제로 대부분은 하나씩 조정하지 않지만, 이것이 lilToon 프리셋의 원래 설계입니다)

### 9.1 현재의 문제

지금은 **전역 단일 `lilCfg`** 입니다:

```js
applyLilPreset('Skin-Anime')   // → 모델 전체(머리/옷 포함)가 피부 프리셋으로 덮임.
```

이것은 lilToon 의 의미와 맞지 않습니다.

### 9.2 개편안 (권장: 전역 기본 + 머티리얼별 덮어쓰기)

```js
lilCfg                       // 전역 기본 (기존 구조 그대로)
lilCfgByMaterial = {         // ★ 신규: 머티리얼 이름별 덮어쓰기
  'Melano_hair_MT_Toon': { shadowBorder: 0.05, rim: { blend: 1, ... } },
  'Melano_cloth_MT_Toon': { shadowBorder: 0.3 },
}
```

**적용 지점**: `patchToonMaterial(mat)` 안에서 `mat.name` 으로 덮어쓰기 표를 조회.
전역 위에 얕게 병합하므로:

```
최종 파라미터 = { ...lilCfg, ...lilCfgByMaterial[mat.name] }
```

**cacheKey 에 머티리얼 이름을 포함**해야 합니다. 그렇지 않으면 서로 다른 머티리얼의 프로그램이 재사용되어 파라미터가 섞입니다.
(현재 key 는 `ba3d-cel:<version>:<shaderMode>:...` 이며 `:<matName>` 을 추가)

### 9.3 UI 변경

패널 상단에 **머티리얼 선택기** 추가:

```
머티리얼 [ 전체(기본) ▾ ]     ← 기본: 전역 lilCfg 를 수정
        [ Melano_hair_MT_Toon ]
        [ Melano_cloth_MT_Toon ]
        [ Melano_Body_MT_Toon ]
        ...

프리셋  [ 머리 · 외곽선+Rim ▾ ]  ← **위에서 선택한 머티리얼**에 적용(전역 아님)
```

- 「전체」 선택 → `lilCfg` 수정 (현재 동작, 「전체를 한 번에 조정」에 적합)
- 특정 머티리얼 선택 → `lilCfgByMaterial[이름]` 수정, 패널 슬라이더는 **병합 후** 값을 표시
- 프리셋 드롭다운은 **머티리얼 이름으로 분류 자동 필터** 가능 (이름에 hair → 머리 계열만 표시)
  —— 다만 전체 옵션은 유지 (사용자가 직접 지정하고 싶을 수 있음)

### 9.4 설정 내보내기

```jsonc
"lilToon": { /* 전역 기본 */ },
"lilToonByMaterial": {
  "Melano_hair_MT_Toon": { "shadowBorder": 0.05 }
}
```

내보낼 때 기본값과 diff 해서 바뀐 항목만 기록 (기존 exportConfig 의미와 동일)

### 9.5 구현 순서 제안

1. `lilCfgByMaterial` 데이터 구조 + `patchToonMaterial` 의 병합 + cacheKey 에 머티리얼 이름
2. API: `getLilConfig(matName)` / `setLilConfig(obj, matName)`
3. 패널: 머티리얼 선택기 + 프리셋 적용 대상 연동
4. 내보내기 / 가져오기에 `lilToonByMaterial` 지원

### 9.6 부기

- 머티리얼 이름 매칭은 **파생 머티리얼 이름**(`Melano_hair_MT_Toon`, `_Toon` 접미사 포함)을 쓰거나
  접미사를 통일해 제거한 뒤 매칭해, 재생성 후 이름이 바뀌어도 어긋나지 않게 하세요.
- **메시 이름** 매칭(`melano_hair`)도 지원할 수 있습니다 — 일부 모델은 머티리얼 이름이 의미를 잘 담지 않습니다.
  둘 다 지원하는 편이 안정적이며 우선순위는 머티리얼 이름 > 메시 이름.
