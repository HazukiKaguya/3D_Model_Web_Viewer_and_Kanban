# 3D 캐릭터 모델 뷰어 (3D 모델 웹 내장 마스코트)

[简体中文](../README.md) ｜ [繁體中文](README.zh-TW.md) ｜ [English](README.en.md) ｜ [日本語](README.ja.md) ｜ **한국어**

three.js 캐릭터 뷰어: **설정 가능**(모델 / 입가 텍스처 / 기준 JSON) · **임베드 가능**(자체 완결 단일 파일 판) · **배포 가능**(순수 정적).

셰이딩 백엔드 (**「툰 머티리얼」에서만 사용 가능**):
**Cel 밴딩**(BA 모델 특화 간이 셰이더) · **lilToon 스타일**(자체 이식 구현) · **three-liltoon**(업스트림이 실제 lilToon 소스를 번역한 산출물을 그대로 사용, 필요할 때만 로드) · **주입 안 함(기본)**.

- 머티리얼 모델은 세 단계: 원본(PBR) / **툰 머티리얼(Toon)** / 무광(Unlit). 셰이딩 백엔드는 **툰 머티리얼**에 붙습니다(PBR / Unlit 은 three 내장 머티리얼이라 주입 지점이 없음). 기본값은 **툰 머티리얼 + Cel 밴딩**.
- **three-liltoon 은 「lilToon 스타일」의 변형**입니다: 표면 머티리얼만 업스트림 `LilToonMaterial` 로 교체하고, **외곽선은 여전히 자체 구현**을 씁니다(0.1.9 부터 업스트림 외곽선은 `shaderVariant` 로 `Hidden/lilToonOutline` 을 명시해야 함. 실측: 스킨 메시는 가는 선이 나오지만 ✓ 정적 소품은 면 전체가 채워짐 ✗).
- lilToon 은 툰(NPR) 셰이더 계열입니다 — 「lilToon 을 PBR 머티리얼에 쓴다」는 접근은 존재하지 않습니다.

【[이 도구 배포하기](DEPLOY.ko.md)】  【[모델 JSON 설정](CONFIG.ko.md)】  【[서드파티 라이선스 고지](../THIRD-PARTY-NOTICES.md)】

## 빠른 시작

이 디렉터리가 곧 완전한 사이트입니다: **`index.html` 을 바로 열면** 되고, 디렉터리 전체를 임의의 정적 서버(Nginx / Apache / Netlify / Cloudflare Pages / OSS 모두 가능)에 넣어도 됩니다.

| 페이지 | 진입점 |
|---|---|
| 전체 화면 뷰어 (플로팅 콘솔 UI) | `index.html` |
| **3D 모델 웹 내장 마스코트 데모** | `embed-demo.html` |

## 파일

| 파일 | 역할 |
|---|---|
| [index.html](../index.html) | 전체 화면 뷰어 (플로팅 콘솔 UI) |
| [embed-demo.html](../embed-demo.html) | 3D 모델 웹 내장 마스코트 데모 |
| [viewer.js](../viewer.js) | 뷰어 코어 (`createViewer` / `autoMount`) |
| [assets/sample.json](../assets/sample.json) | **CH0155 설정** (모델 + 입가 텍스처 + 기준 + 렌더/라이팅/배경) |
| [assets/sample.glb](../assets/sample.glb) | 모델 (= CH0155, 애니메이션 24 개) |
| [assets/mouth/](../assets/mouth/) | 입가 보정 아틀라스 (kivo: `Character_Mouth_2` / `_Black` / `_High`) |
| [dist/3d-viewer.js](../dist/3d-viewer.js) | **자체 완결 단일 파일 판** (1.94 MB, three 전부 인라인, 임베드용, 베어 import 없음) |
| [dist/3d-viewer.min.js](../dist/3d-viewer.min.js) | 위의 압축판 (944 KB, 배포용) |
| [liltoon-bridge.js](../liltoon-bridge.js) | 4 번째 셰이딩 백엔드 어댑터 (lilCfg / Unity 머티리얼을 three-liltoon 에 전달) |
| [vendor/three/](../vendor/three/) | 로컬 three.js r185.1 + addons (`effects/OutlineEffect.js` 포함) |
| [vendor/three-liltoon/](../vendor/three-liltoon/) | three-liltoon 런타임 + 컴파일된 lilToon GLSL (2.2 MB, 4 번째 백엔드는 필요할 때만 로드) |
| [CONFIG.md](CONFIG.ko.md) | 설정 필드 전체 레퍼런스 |
| [README.en.md](README.en.md) · [README.ja.md](README.ja.md) · [README.zh-TW.md](README.zh-TW.md) · [README.ko.md](README.ko.md) | 이 설명의 다른 언어판 (`CONFIG` / `DEPLOY` / `LILTOON` 도 있습니다) |
| [DEPLOY.md](DEPLOY.ko.md) | 배포와 패키징 안내 |
| [LICENSE](../LICENSE) | 프로젝트 라이선스 (MIT) |
| [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) | 서드파티 고지 (three.js / lilToon / three-liltoon) |

## 설정 (JSON)

`createViewer` 는 `config`(객체) 또는 `configUrl`(JSON 주소)을 받습니다. 모든 필드는 선택 사항입니다:

```jsonc
{
  "model": {
    "url": "./assets/sample.glb",                             // 모델 파일
    "mouthAtlas": "./assets/mouth/Character_Mouth_2.png"      // 입가 보정 텍스처 (kivo 아틀라스)
  },
  "pivot": { "x": 0.25, "z": 0.30 },                          // 회전 기준 조정
  "renderer": {
    "render": "toon",                                         // 머티리얼 모델: "pbr" | "toon" | "unlit"
    "shader": "cel",                                          // 셰이딩 백엔드 (render:"toon" 에서만 유효):
                                                              //   "none" | "cel" | "lilToon" | "liltoon-src"
    "outline": true, "outlineThickness": 0.002,
    "outlineColor": [0.10, 0.07, 0.11], "outlineAlpha": 1.0,
    "targetHeight": 2.0, "fov": 30, "shadows": true
  },
  "lighting": { "preset": "day", "exposure": 1.0 },           // "day" | "golden" | "night"
  "background": { "transparent": true, "color": null },       // 기본은 투명
  "animation": { "name": "CH0155_Normal_Idle" }
}
```

> 예전 키 `"shading"`(`"pbr"` / `"cel"` / `"unlit"`)도 계속 동작하며, `render` + `shader` 의 단축 조합과 같습니다.
>
> **상대 경로는 설정 파일이 있는 디렉터리 기준으로 해석됩니다.** 그래서 설정을 사이트 루트에 두면
> `"./assets/sample.glb"` 가 항상 올바르게 해석되고, 다른 사이트에 임베드될 때도 모델을 찾을 수 있습니다.
>
> 바로 쓸 수 있는 CH0155 설정은 [assets/sample.json](../assets/sample.json) (기준 X = +0.25, Z = +0.30),
> 「복사해서 세 군데만 고치는」 템플릿으로 [assets/fallback.json](../assets/fallback.json) 도 있습니다.

전체 필드(`data-*` 속성, 이벤트, 전역 훅 포함)는 [CONFIG.md](CONFIG.ko.md) 를 보세요.

## 세 가지 사용 방법

### 1. index 를 직접 열기 (URL 파라미터 사용 가능)

```
index.html?config=./assets/sample.json
index.html?model=./assets/sample.glb&mouth=./assets/mouth/Character_Mouth_2.png&config=./assets/sample.json
```

### 2. 타사 사이트에 임베드 (권장: 자체 완결 단일 파일 판, **importmap 불필요**)

```html
<!-- 1. 컨테이너를 두고 data-ba3d-* 로 설정 선언 -->
<div data-ba3d data-ba3d-config="./assets/sample.json"
     style="width:480px;height:640px"></div>

<!-- 2. 자체 완결 단일 파일 판을 불러와 자동 마운트 -->
<script type="module">
  import { autoMount } from 'https://내도메인/ba3d/dist/3d-viewer.min.js';
  autoMount();
</script>
```

컨테이너에서 쓸 수 있는 속성:

| 속성 | 설명 |
|---|---|
| `data-ba3d` | 이 컨테이너에 뷰어를 마운트하라는 표시 (값은 비워도 됨) |
| `data-ba3d-model` | 모델 파일 URL (`.glb`) |
| `data-ba3d-mouth` | 입가 보정 텍스처 URL (kivo 아틀라스 `.png`) |
| `data-ba3d-config` | 설정 JSON 의 URL (기준 + 렌더 + 라이팅 + 배경) |
| `data-ba3d-auto-rotate` | `true` 이면 자동 회전 |

### 3. JS 로 생성 (동등)

```js
import { createViewer } from './dist/3d-viewer.min.js';

const viewer = createViewer(document.getElementById('stage'), {
  modelUrl: 'https://내도메인/ba3d/assets/sample.glb',
  mouthAtlasUrl: 'https://내도메인/ba3d/assets/mouth/Character_Mouth_2.png',
  configUrl: 'https://내도메인/ba3d/assets/sample.json',   // 객체를 직접 넘겨도 됨: config: {...}
  backgroundTransparent: true,
});
await viewer.load();
```

> 단일 파일 판 대신 `vendor/three/` + `viewer.js` 를 쓰는 경우, 호스트 페이지에 importmap 이 필요합니다:
> ```html
> <script type="importmap">
> { "imports": { "three": "https://내도메인/ba3d/vendor/three/three.module.js",
>                "three/addons/": "https://내도메인/ba3d/vendor/three/" } }
> </script>
> ```

## 기능

- **머티리얼 모델**: 원본(PBR) / **툰 머티리얼(Toon)** / 무광(Unlit)
- **셰이딩 백엔드** (툴바 「셰이더」드롭다운, 4 항목, **툰 머티리얼에서만 사용 가능**):
  - `주입 안 함(기본)` / **`Cel 밴딩`(기본값)** / `lilToon 스타일`(자체 이식 구현)
  - **`lilToon 소스`** — 표면 셰이딩을 [three-liltoon](https://www.npmjs.com/package/@mochiya/three-liltoon) 이
    **실제 lilToon 소스**를 번역한 산출물로 그대로 사용 (Unity 대조: 단순 경로 2.22 %, 그림자+림라이트 5.37 %, 밝기비 1.000).
    ⚠️ 이 백엔드는 **필요할 때만 로드**(2.2 MB, 전환하지 않으면 다운로드 없음)이며, **외곽선은 여전히 자체 구현**입니다
    (업스트림 배포판의 외곽선은 실측상 사용 불가).
    ⚠️ **단일 파일 판으로는 이 백엔드를 쓸 수 없습니다**(`dist/` 내부가 베어 `three` 지정자) — 쓰려면 `vendor/` + `viewer.js` 형태로 배포하세요.
- **외곽선**: 역확장 방식(three 의 `OutlineEffect`, 스키닝 지원), 두께와 색 조정 가능. lilToon 모드에서는 `setLilOutline` 이 담당
- **lilToon 파라미터 패널**: JSON 수정 없이 바로 조정, Unity 측에서 내보낸 `.lilToon.json` / `.mat` / `.asset` 가져오기 지원
- **설정 내보내기 / 가져오기**: 툴바 「JSON 내보내기」는 기본값과 다른 항목만 기록하며, 가져오면 UI 가 자동 동기화
- **파츠 패널**: 선택 가능한 파츠와 소품 숨김 / 표시
- **라이팅 프리셋**: 낮 / 아침·저녁 / 밤
- **배경**: 기본 **투명**(웹페이지 내용이 비침), 그 외 프리셋 색 4 개 + 색상 선택기
- **모션**: 애니메이션 24 개 전환, 기본은 idle 만 재생. Unity 의 `.anim` 도 바로 재생 가능(표정 blendShape / 의상 표시·숨김 / 일반 변환 커브, [CONFIG.md](CONFIG.ko.md) 참고). 의상 모션(`m_IsActive` 계열)은 툴바에서 **버튼**으로: 한 번 누르면 착용, 다시 누르면 해제(착용 전 상태로 복원, 반복 가능). 사용자 모델은 `.anim` 여러 개, lilToon `.mat` / `.asset`(머티리얼 이름별 대응), Unity `.prefab`(「어떤 파츠가 기본 숨김인지」 재현 — 이 상태는 prefab 에만 있고 FBX 와 .anim 에는 없음)을 **한 번에 여러 개 선택**할 수 있으며, **Unity 프로젝트 폴더 전체를 끌어다 놓아도** 모델 / prefab / `.anim` / `.mat` / 텍스처와 Humanoid 근육 변환표(`humanoid-muscles.json`)를 자동 인식해 로드합니다
- **시점**: 축 뷰(앞 / 뒤 / 왼쪽 / 오른쪽), **720° 무단 회전**, 회전 기준 위치를 X/Z 로 설정 가능(슬라이더 + 숫자 입력)
- **플로팅 창 레이아웃**: 위치·크기 자동 기억, 콘솔에서 `ba3dResetLayout()` 으로 기본값 복원
- **모바일**: 터치 지원
- **링(광배)** 은 머리 본 `Bip001_Head` 에 바인딩
- **입가**: kivo 방식으로 UV 아일랜드 분할 + 입가 아틀라스, `bone_mouth` 로 개폐 구동, 머티리얼은 렌더 모드를 따름

## 배포

순수 정적 사이트로 **빌드 단계도, CDN 의존도 없고** 모든 경로가 상대 경로입니다(루트/하위 경로 배포 모두 설정 변경 불필요).
`dist/` 는 미리 패키징되어 있어 그대로 업로드하면 됩니다. 전체 목록은 [DEPLOY.md](DEPLOY.ko.md) 참고.

`.glb` 의 MIME 은 `model/gltf-binary` 여야 합니다(`_headers` / `.htaccess` / `.nojekyll` 이 패키지에 포함되어 있음):

| 플랫폼 | 처리 |
|---|---|
| Netlify / Cloudflare Pages | `_headers` (배포 패키지에 포함) |
| Apache | `.htaccess` (배포 패키지에 포함) |
| GitHub Pages | `.nojekyll` (배포 패키지에 포함) |
| Nginx | `mime.types` 에 `model/gltf-binary glb;` 추가, 또는 `nginx-3d-viewer.conf` 사용 |

## 기술 요점

### 씬 파라미터 (기준선 그대로)

- 정규화: `targetHeight = 2.0`(최장 축 스케일), 발을 y=0 에 맞추고 수평 중앙 정렬
- 카메라: `PerspectiveCamera(fov=30, near=0.05, far=200)`
- 조명: 반구광 + 메인 방향광(그림자 포함) + 림라이트 + 보조광, `RoomEnvironment` PMREM
- 컨트롤러: `OrbitControls`(damping, 제한), 그림자 PCFSoft + `ShadowMaterial` 바닥

기준선과 의도적으로 다른 점: 로컬 `vendor/three` 로 CDN 대체, 쓰지 않는 DRACO/KTX2/Meshopt 로더 제거,
기본은 idle 만 재생(기준선 원본이 모든 애니메이션을 동시에 play 하는 것은 버그), 렌더 모드/외곽선/라이팅 프리셋/배경/기준/입가 보정 추가.

### 툰 렌더링

`MeshToonMaterial` 은 `envMap` 을 지원하지 않으므로 툰 모드에서는 조명을 자동 보정합니다(반구광 ×1.25, 메인광 ×0.8, 노출 ×0.9).
전환은 완전히 가역적이며 원래 머티리얼은 `userData.__src` 에 보관됩니다.

### 외곽선

역확장 방식: 모델을 한 번 더 그리되 정점을 **노멀** 방향으로 확장하고 **뒷면**만 그려 외곽선 색으로 채웁니다.
**투명 머티리얼은 외곽선을 그리지 않습니다** — 역확장은 「불투명 뒷면 껍질」이라 얇은 판(방패)에서는 실색이 덮여 반투명이 가려집니다.

### 입가 보정 (kivo.wiki 방식)

`CH0155_Body_4`(EyeMouth) 에서 「입」= **z 가 가장 낮은** UV 아일랜드(삼각형 38 개)이며,
그 UV 박스가 텍스처의 **순수 검정 자리표시 영역**에 놓여 원래 검은 입이었습니다. 보정법: UV 아일랜드로 메시를 분할하고,
입 삼각형을 별도 `SkinnedMesh` 로 분리해 입가 아틀라스를 쓰며, `repeat/offset` 으로 UV 박스를 아틀라스의 특정 칸에 매핑합니다.

### 가짜 BLEND 보정

GLB 에서 `CH0155_Weapon`(총) / `CH0155_Milk`(우유팩)이 `BLEND` 로 표시되어 있지만 텍스처는
「불투명 + 구멍/여백」형입니다. 판정 기준은 **중간값 alpha 비율**(`0 < a < 250`):
비율이 작으면 불투명으로 렌더, 비율이 크면(방패 alpha≈128) 투명 유지.

## 라이선스

이 프로젝트는 **MIT 라이선스**(© 2026 Hazuki Kaguya)입니다 — [LICENSE](../LICENSE) 참고.

패키지에 포함된 서드파티 구성 요소도 MIT 이며, 저작권과 라이선스 전문은 [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) 에 있습니다:

| 구성 요소 | 라이선스 | 사용 위치 |
|---|---|---|
| three.js 0.185.1 | MIT © 2010-2026 three.js authors | `vendor/three/`, 그리고 `dist/` 에 인라인 |
| lilToon 2.3.4 | MIT © 2020-present lilxyzw | 컴파일 산출물만: `assets/lilshaders.inline.js`, `vendor/three-liltoon/chunk-*.js` |
| @mochiya/three-liltoon 0.1.9 | MIT © 2026 Mochiya | `vendor/three-liltoon/` (4 번째 백엔드는 필요할 때만 로드) |

> **임베드 / 배포 시 `LICENSE` 와 `THIRD-PARTY-NOTICES.md` 를 함께 유지하세요** — MIT 는 저작권·라이선스 고지를 요구합니다.
> 이 디렉터리에 두 파일이 포함되어 있습니다.
>
> 리포지터리의 **예제 모델과 텍스처素材는 위 라이선스 범위에 포함되지 않습니다**(`assets/sample.glb`, `assets/mouth/*.png`,
> `assets/test/*.png`). 재배포 전에 사용 권한을 직접 확인하세요.
