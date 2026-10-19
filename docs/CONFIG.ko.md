# BA3D 설정 JSON 필드 설명

[简体中文](CONFIG.md) ｜ [繁體中文](CONFIG.zh-TW.md) ｜ [English](CONFIG.en.md) ｜ [日本語](CONFIG.ja.md) ｜ **한국어**

> **lilToon 기준선: 2.3.4**
> 이 문서의 **UI 레이블은 뷰어의 현재 표시 언어를 따릅니다**(이 문서는 한국어판이므로 UI 도 「머티리얼 / 텍스처 / 외곽선」으로 표시됩니다).
>   · 소스 맵(2.3.4 행 번호), 버전 차이 목록 ⇒ [`LILTOON2.x.ko.md`](LILTOON2.x.ko.md)
>   · 구 기준선(1.3.7)의 대조와 점검 기록 ⇒ [`LILTOON1.x.ko.md`](LILTOON1.x.ko.md) (아카이브, 행 번호는 1.3.7 기준)
>
> 이 문서의 `lil_*.hlsl:NNN` 행 번호 인용은 **모두 2.3.4 로 정렬**되어 있습니다.

설정 하나 `assets/<캐릭터>.json` 가 「모델 + 입가 보정 텍스처 + 스케일/프레이밍 + 렌더/라이팅/배경 + 기본 모션」을 기술합니다.

**상대 경로는 항상 이 JSON 이 있는 디렉터리 기준으로 해석**됩니다 — 그래서 json 과 glb 를 같은 폴더에 두면
사이트가 어디에 배포되든, 누가 임베드하든 경로가 성립합니다. 절대 URL(`http(s):` / `data:` / `blob:`)은 그대로 사용합니다.

전체 예는 `assets/sample.json`(예제 모델 CH0155)과 `assets/fallback.json`(같은 모델의 다른 설정 템플릿)을 보세요.

---

## 一. 최상위 필드

```jsonc
{
  "_comment":   "아무 메모, 렌더에 참여하지 않음",
  "model":      { ... },   // 모델 파일과 입가 텍스처
  "pivot":      { ... },   // 회전 기준 오프셋
  "renderer":   { ... },   // 스케일 / 프레이밍 / 렌더 / 외곽선
  "lighting":   { ... },   // 라이팅
  "background": { ... },   // 배경
  "animation":  { ... },   // 기본 모션과 외부 Unity .anim
  "camera":     { ... }    // 선언적 카메라 (Unity 단위로 입력해 Unity 구도를 재현)
}
```

---

## 二. `model` —— 모델과 입가 텍스처

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `url` | string | `./assets/sample.glb` | 모델 파일. **`.glb`(자체 완결) 권장**; `.gltf` 는 텍스처/`.bin` 이 외부 파일이면 로드 실패 |
| `mouthAtlas` | string \| `null` | `null` | 입가 보정용 아틀라스(kivo 방식). **설정하지 않으면 입가 보정 없음** — 구형이 원래 별도 메시나 morph target 으로 구동되는 모델에 적합 |

**입가 보정에 대해**: 원본 모델의 입가 UV 가 텍스처의 순수 검정 자리표시 영역에 있어 입이 검게 나옵니다.
뷰어는 「머티리얼 이름에 `EyeMouth` 포함」으로 그 얼굴 텍스처 메시를 찾고, **UV 아일랜드 중 z 가 가장 낮은 것**으로 입가를 잘라
아틀라스의 대응 구형으로 바꿉니다. CH0155 와 CH0273 은 실측상 입가 UV 가 완전히 동일하여
(`u[0.0086,0.2413] v[0.7926,0.9574]`) 셀 배치가 호환됩니다.

> 같은 머티리얼을 공유하는 메시가 여러 개일 수 있으며(CH0155 는 Body+Star, CH0167 은 입+얼굴 외곽선+눈),
> 「어느 것이 입인가」는 **선택된 아일랜드의 UV 가 입가 영역에 있는지**(이 세대 BA 모델은 일치:
> u≈[0.009,0.241] v≈[0.793,0.957])로 판정하며, `renderer.mouthUv` 로 덮어쓸 수 있습니다.
> 단순히 「z 가 가장 낮은 것」으로는 안 됩니다 — CH0155 의 Star(눈 하이라이트)가 입보다 z 가 낮습니다.

> **`model.mouthAtlas` 를 설정하지 않으면 입가 보정을 하지 않습니다**(기본 동작). 보정은 「입이 EyeMouth 메시에 섞여
> 검은 덩어리로 렌더되는」 모델용이고, BA 계열처럼 구형마다 **별도 메시 + morph target** 으로 구동되는 경우
> (실측: morph 가중치 1 이면 구형이 자기 크기의 17 배 밖으로 밀려나 숨겨지고, 애니메이션이 0 이어야 보임)
> 억지로 보정을 적용하면 눈을 입으로 잘라내게 됩니다. 그래서:
>
> - 보정이 필요 → json 에 `"model": { "mouthAtlas": "./mouth/xxx.png" }` (또는 컨테이너에 `data-ba3d-mouth`)
> - 보정이 불필요 → **아무것도 쓰지 않음**, 로드 시 `[fixMouth] 未指定嘴部图集 … → 跳过嘴部修复` 를 출력

아틀라스 요건: 정사각형, **8 × 8 그리드**(`Character_Mouth_2.png` 는 1024², `Character_Mouth_High.png` 는 2048²).

> **사용 가능한 칸 수는 아틀라스마다 다릅니다**(칸별 샘플링 실측 결론):
>
> | 아틀라스 | 크기 | 실제 입 모양 칸 | 나머지 |
> |---|---|---|---|
> | `Character_Mouth_High.png` | 2048² | **#0 ~ #63 (전체 64 칸)** | — |
> | `Character_Mouth_2.png` | 1024² | #0 ~ #17 | #18 부터는 순수 청록 (0,198,188) 자리표시 |
> | `Character_Mouth_Black.png` | 1024² | #0 ~ #50 | #51 부터 청록 자리표시 |
>
> 인덱스 이미지(8×8 번호 포함, 칸을 골라볼 때 사용):
> `assets/mouth/_cells-preview-high.png`, `assets/mouth/_cells-preview-2.png`.
> 규칙: **왼쪽에서 오른쪽으로 벌어짐이 커지며**, 0 번째 열은 거의 닫힌 가는 선입니다.

---

## 三. `pivot` —— 회전 기준 (수평 오프셋, 월드 단위)

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `x` | number | `0` | 회전축 좌우 오프셋 |
| `z` | number | `0` | 회전축 전후 오프셋 |

캐릭터는 **실제 내용 기준으로 자동 중앙 정렬 + 발이 지면에 닿도록** 처리되므로 정상적으로는 `0` 을 유지합니다.
무게 중심이 유난히 치우친 모델(예: 아주 큰 무기를 든 경우)에만 미세 조정이 필요합니다.

---

## 四. `renderer` —— 스케일 / 프레이밍 / 렌더

### FBX 텍스처 (`textureBase` / `textureMap`) ★

**FBX 는 텍스처 경로를 파일 안에 저장합니다** — 흔히 제작자 컴퓨터의 절대 경로(`C:/art/tex/body.png`)이고
**Windows 역슬래시**를 쓰며(브라우저가 `%5C` 로 인코딩), 텍스처가 전부 404 나기 쉽습니다.

우리는 `LoadingManager.setURLModifier()` 로 모든 텍스처 요청을 가로채(`TextureLoader` 는 결국 `manager.resolveURL()` 를 통과) 다음을 순서대로 처리합니다:

1. **역슬래시 → 슬래시** (필수, 그렇지 않으면 경로 자체가 틀림)
2. **드라이브 문자 제거** (`C:/art/tex/body.png` → `art/tex/body.png`)
3. **`textureMap` 3 단계 매칭**: 전체 URL → 쿼리 제거 → **파일명만**
4. **`textureBase` 폴백**: 기준 디렉터리 + 파일명 (경로가 외부 절대 경로처럼 보일 때만 사용해 정상 상대 경로를 망가뜨리지 않음)
5. 모두 실패하면 **그대로 반환**해 기본 로직에 맡김 (URL 로드 시 상대 경로는 원래 해석됨)

#### 세 가지 사용법

**① 서버에 Texture 하위 디렉터리가 있음** (URL 로드)

```jsonc
"renderer": { "textureBase": "./Texture/" }
```

**② 텍스처가 다른 디렉터리에 있거나 이름이 바뀜**

```jsonc
"renderer": {
  "textureMap": {
    "body.png": "./Texture/body_diffuse.png",
    "C:/artist/tex/hair.png": "./Texture/hair.png"
  }
}
```

**③ 로컬에서 끌어다 놓기(업로드)**

「사용자 모델」패널에 **「텍스처 선택 (다중 선택 가능)」**과 **「텍스처 폴더 통째로 선택」**이 추가되었습니다 —
선택한 파일은 **파일명**으로 매핑이 만들어지고(`body.png → blob:…`) FBX 에 어떤 경로가 저장되어 있든 파일명만으로 인식합니다.

> 경로는 모두 **설정 파일이 있는 디렉터리 기준**으로 해석되며 `model.url` 과 동일합니다.

### 동명 설정 자동 로드 (`autoConfig`)

모델을 로드할 때 **설정을 명시하지 않으면**(`configUrl` 도 `config` 도 없음),
**같은 디렉터리의 동명 .json** 을 자동으로 찾습니다:

```
assets/sample.glb   →   assets/sample.json     찾으면 사용.
assets/Natsu.glb    →   assets/Natsu.json      없으면 → 조용히 건너뜀 (404 한 번, 로드에는 영향 없음)
로컬 파일 드롭      →   탐색 안 함 (blob: 에는 「같은 디렉터리」 개념이 없음)
```

우선순위(`resolveConfig()`):

1. `configUrl` — 명시 지정, 읽지 못하면 **오류**
2. `config` — 객체 직접 전달
3. **동명 JSON 자동 발견** — 읽기 실패/파싱 실패 모두 **조용히** 넘어가며 로드를 막지 않음

설정 안의 상대 경로는 항상 **설정 파일이 있는 디렉터리** 기준으로 해석되므로 `sample.json` 의 `./sample.glb`, `./mouth/xxx.png` 가 정확히 해석됩니다.

자동 발견 끄기:

```js
createViewer(el, { autoConfig: false })
```

> 적중 시 콘솔에 `[autoConfig] 已自动加载同名配置：<url>` 를 출력합니다.
> 동명 JSON 의 `model.url` 이 호출자가 준 모델 주소를 **덮어쓴다**는 점에 주의하세요 — 기존 동작(명시 설정 우선)이며,
> 그래서 `sample.json` 에 `./sample.glb` 를 써도 같은 모델을 로드할 뿐 **중복 로드하지 않습니다**.

### 4.1 스케일과 프레이밍 (핵심)

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `targetHeight` | number | `2.0` | **캐릭터 실제 높이(월드 단위)**. 정규화 기준 |
| `modelHeightPx` | number | `360` | **화면상 캐릭터 높이(CSS 픽셀)** ← 이것이 「기본 스케일」 |
| `framing` | `"tight"` \| `"auto"` | `"auto"` | 프레이밍 모드, 아래 참고 |
| `modelRotation` | `[x,y,z]` \| `null` | `null` | 로드 후 모델에 회전 추가(**도** 단위). **FBX 는 Z-up 이 흔해 필요**, 예: `[-90,0,0]`; GLB 는 보통 불필요 |
| `textureBase` | string \| `null` | `null` | **FBX 텍스처 기준 디렉터리**, 예: `"./Texture/"`. `fbxLoader.setResourcePath()` 와 동등 |
| `textureMap` | object \| `null` | `null` | **FBX 텍스처 정밀 매핑** `{ "파일명 또는 원래 경로": "실제 URL" }`. FBX 에 제작자 컴퓨터 절대 경로가 흔해 **파일명 매칭이 가장 안전** |
| `framingReferenceHeight` | number | `0` | 참조 캔버스 높이. `>0` 이면 카메라 파라미터를 그 높이 기준 고정 월드량으로 계산 |
| `framingOffsetY` | number | **`22`** | 프레이밍 수직 오프셋(CSS 픽셀, 양수 = 구도를 아래로 ⇒ **화면 내용은 위로**) ⚠️ 기본값이 **0 이 아님**, 아래 참고 |
| `fov` | number | `30` | 수직 시야각 |

**두 높이 필드의 차이**(헷갈리기 쉬움):

- `targetHeight` 는 **3D 세계에서의 모델 높이**만 담당하며, 서로 다른 모델을 같은 크기로 정규화하는 데 씁니다.
  **화면 크기에는 영향이 없습니다** — 카메라 거리가 비례해 조정되기 때문입니다.
- `modelHeightPx` 가 **화면 크기**입니다: 캐릭터 실제 내용이 참조 캔버스에서 몇 픽셀을 차지하는지.
  정규화가 바운딩 박스가 아니라 「실제 스킨 내용」을 쓰므로 **같은 `modelHeightPx` 는 어떤 모델에서도
  같은 화면 크기**가 됩니다.

```jsonc
"targetHeight": 2.0,        // 캐릭터가 세계에서 2 단위 높이
"modelHeightPx": 360,       // 화면에서 360 픽셀 높이
```

**모델을 바꿀 때 조정법**: 먼저 같은 설정을 씁니다. 모션 폭이 큰 모델(무릎 꿇기, 쓰러짐 등)이면
캐릭터가 패널을 넘치는데, 이때는 **`modelHeightPx` 만 줄이면** 됩니다(휠 확대/축소는 임시이며 저장되지 않음).

> 실측 참고(패널 420×430, 흔한 모션 전부 잘리지 않게):
> - CH0155: `modelHeightPx: 360` → 308×405 필요.
> - CH0273: `modelHeightPx: 275` → 309×394 필요.

**`framing` 두 모드**:

- `"auto"`(기본) — 기준선 구도. 캐릭터가 화면 높이의 약 85 % 를 차지하며 컨테이너 크기에 따라 변합니다.
- `"tight"` — **실제 스킨 내용**으로 중앙 정렬(전체 박스 바운딩은 스킨 메시에서 신뢰할 수 없어 캐릭터가 치우치고
  떠 보임), `framingReferenceHeight` 와 함께 카메라 파라미터를 고정 월드량으로 만듭니다.

**`framingReferenceHeight` 의 역할**:

| 값 | 동작 |
|---|---|
| `0` (미설정) | 카메라 거리가 캔버스 높이에 비례 → 캐릭터 픽셀 크기 일정(픽셀 고정, 컨테이너가 바뀌어도 크기 유지) |
| `>0` (예: `430`) | 카메라 파라미터를 그 높이 기준 **고정 월드량**으로 계산 → **패널을 % 로 확대/축소하면 화면 전체가 비례해 확대/축소** |

패널 크기를 % 로 바꾸는 것(`420×430` → `630×645` → `252×258`)은 다른 설정을 건드릴 필요가 없습니다.

### 4.2 근본 이동 (캐릭터가 「화면을 벗어나는」 문제)

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `stripRootMotion` | `"compensate"` \| `"root"` \| `"xyz"` \| `"xz"` \| `false` | `"compensate"` | 근본 이동 처리: **`"compensate"` 는 오브젝트 수준 상쇄(기본값, 애니메이션 트랙을 건드리지 않음)**; `"root"`/`"xyz"` 는 트랙을 다시 씀(소품이 흩어짐, 특수 모델 전용); `"xz"` 는 점프 유지; `false` 는 끔 |
| `pressHoldMs` | number | `200` | 모델 위에서 왼쪽 버튼을 몇 ms 눌러야 「누름」으로 볼지 (아니면 클릭, 九 장 참고) |
| `mouthUv` | `[u0,u1,v0,v1]` | 내장값 | 아틀라스 안에서 입의 UV 영역. 「여러 메시가 EyeMouth 머티리얼을 공유」할 때 어느 것이 입인지 판정하는 데만 사용 |
| `mouthCell` | number \| `null` | `null` | **기본 구형**(아틀라스 칸 0~63): 모션이 입 본을 구동하지 않을 때 어느 칸을 쓸지, `null` = 첫 구형 |
| `visibilityRules` | array | `null` | **툰(Cel / Toon) 셰이딩 조정 항목**: 툰 모드는 `MeshToonMaterial` + `onBeforeCompile` 주입이며 **전체 파이프라인을 다시 쓰지 않음**(텍스처 / 스키닝 / morph / 그림자 / 버텍스 컬러 모두 유지). 주입 지점은 두 곳:

1. **`getGradientIrradiance` 교체** — 이 함수의 반환값이 **광색에 곱해지므로**, 단계 수와 어두운 톤을 여기서 계산합니다
   (더 이상 DataTexture 그라디언트 맵이 필요 없음):
   ```glsl
   float q = floor( t * 4.0 ) / max( 4.0 - 1.0, 1.0 );   // 4 단계 하드 엣지
   float v = 0.5500 + 0.4500 * q;                          // 최소 0.55
   return mix( vec3(1.0), vec3(1.0), v );                  // 어두운 톤 (null 이면 흰색)
   ```
   **기본값은 구 구현과 수학적으로 동등**(구 DataTexture 가 생성하던 값이 정확히 0.55 / 0.70 / 0.85 / 1.00)하므로 기본 외형 변화는 0.

   ### 단계 색 + 전환 구간 (`celBandRamp` / `celBandSoft`)

   **기본은 비활성** — `celBandRamp = null` 이면 위의 옛 공식을 그대로 쓰며 **생성되는 GLSL 이 바이트 단위로 동일**해,
   「cel 모드는 변하지 않았다」는 회귀 보장이 유지됩니다. 패널의 「그림자 색」을 켜야 아래 버전으로 전환됩니다.

   기존에는 「가장 어두운 단계 밝기 + 어두운 톤」뿐이고, 밝고 어두움 사이는 **선형** 전환이며 단계마다 같은 색조만 쓸 수 있었습니다.
   이제 **색 표시 4 개에 각각 색을 지정**할 수 있고(가장 어두운 단계 → 가장 밝은 단계), 각 단계가 자기 색을 가집니다:

```glsl
vec3 ba3dRamp4( float u ) {              // 색 표시 4 개 룩업 (최상위 함수 — GLSL 은 중첩 정의 불가)
  float x = clamp( u, 0.0, 1.0 ) * 3.0;
  vec3 a = mix( C0, C1, clamp( x,       0.0, 1.0 ) );
  vec3 b = mix( C1, C2, clamp( x - 1.0, 0.0, 1.0 ) );
  vec3 c = mix( C2, C3, clamp( x - 2.0, 0.0, 1.0 ) );
  return mix( mix( a, b, step( 1.0, x ) ), c, step( 2.0, x ) );
}
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
  ...
  float x  = t * 3.0;                  // = STEPS-1
  float bi = floor( x );               // 단계 번호
  float bf = x - bi;                   // 단계 내 위치
  float s  = SOFT > 0.0005 ? smoothstep( 0.0, SOFT, bf ) : 0.0;   // 전환 구간
  float d  = max( 3.0, 1.0 );
  float u0 = bi / d, u1 = min( u0 + 1.0 / d, 1.0 );
  return mix( ba3dRamp4( u0 ), ba3dRamp4( u1 ), s );
}
```

   | 키 | 타입 | 기본값 | 설명 |
   |---|---|---|---|
   | `celBandRamp` | 4×`[r,g,b]` 또는 `null` | `null` | 색 표시 4 개, **가장 어두운 단계 → 가장 밝은 단계**. `null` = 옛 공식 |
   | `celBandSoft` | number | `0` | 단계 사이 **전환 구간 폭** 0~1. 0 = 하드 엣지(`floor`, 옛 공식과 동일) · 0.5 = 각 단계 뒤쪽 절반 부드럽게 · 1 = 단계 전체가 전환. `celBandRamp` 에만 적용 |

   ⚠️ 각 단계가 받는 것은 **색 표시 보간 결과**이며(`bandSoft = 0` 이면 하드 엣지 전환),
   「단계마다 독립 슬라이더」가 아닙니다. 색 표시 4 개면 차갑/따뜻한 단계를 표현하기 충분하고 패널이 폭발하지 않습니다.

   ⚠️ 패널에서 「그림자 색」을 **끄면** `bandRamp` 는 `null`, `bandSoft` 는 `0` 이 전달됩니다 —— 한 번도 켠 적 없는 상태와 완전히 같습니다.

```jsonc
"celBandRamp": [                 // 청보라 어두운 부분 → 흰 밝은 부분, 네 가지 색조
  [0.16, 0.14, 0.25],
  [0.42, 0.39, 0.53],
  [0.66, 0.63, 0.75],
  [1.0,  1.0,  1.0 ]
],
"celBandSoft": 0.25              // 단계 사이 1/4 구간을 부드럽게
```

```js
viewer.setCel({ bandRamp: [[0.2,0.1,0.3],[0.5,0.4,0.6],[0.8,0.75,0.9],[1,1,1]] });
viewer.setCel({ bandSoft: 0.4 });
viewer.setCel({ bandRamp: null });          // 옛 공식으로 복귀
```

2. **`vNormal` 덮어쓰기 (얼굴/눈/눈썹만)** — 노멀을 카메라 방향(view space 의 `+z`)으로 강제합니다.
   그렇지 않으면 고개를 돌릴 때 얼굴의 수광이 노멀을 따라 변해 얼룩진 그림자가 생깁니다; 애니메 렌더의 표준 기법입니다.
   **BA 계열 모델은 `"celFaceLight": true` 를 켜길 권합니다.**

```jsonc
"renderer": {
  "shading": "cel",
  "celSteps": 2,                              // 하드 엣지 2 단계, 더 「종이 같게」
  "celDark": 0.62,                            // 어두운 부분을 조금 더 밝게
  "celShadowTint": [0.72, 0.62, 0.85],        // 어두운 부분을 검게가 아니라 보라 쪽으로
  "celFaceLight": true                        // 얼굴 조명 보정
}
```

런타임에서도 변경 가능(콘솔에서 바로 시도, 즉시 머티리얼 재생성):

```js
viewer.getCel();                                  // 현재 파라미터 보기
viewer.setCel({ steps: 2 });                      // 하드 엣지 2 단계로
viewer.setCel({ faceLight: true });               // 얼굴 보정 켜기
viewer.setCel({ shadowTint: [0.72, 0.62, 0.85] });// 어두운 부분 보라
viewer.setCel({ shadowTint: null });              // 복원
```

**얼굴이 그림자를 받지 않게 (`faceNoShadow`)**: 낮 빛에서 머리카락이 얼굴에 뚜렷한 그림자를 드리우지만, 공식 렌더에서는 얼굴이 대체로 「깨끗」합니다.
켜면 얼굴 메시의 `receiveShadow` 를 끕니다 — 그림자 맵이 얼굴에 적용되지 않지만 **머리카락이 몸에 드리우는 그림자는 영향을 받지 않습니다**.
판정은 `facePattern` 을 재사용하므로 툰 모드의 `_Toon` 머티리얼도 그대로 매칭됩니다.

실측 매칭 결과:

| 모델 | 그림자 끔(얼굴) | 그림자 유지 |
|---|---|---|
| `sample.glb` | 4 개 (Face / Eyebrow / EyeMouth / Star) | 7 개 (Hair / Body / Weapon / Milk / Pie …) |
| BA `Hoshino.glb` | 19 개 (16 개 Mouth_* + Face + Eyebrow + EyeMouth) | 5 개 (Hair / Body / Shield / Weapon / Halo) |

```jsonc
"renderer": { "faceNoShadow": true }
```

런타임 스위치:

```js
viewer.getFaceNoShadow();          // { enabled, pattern, meshes }
viewer.setFaceNoShadow(true);      // 즉시 적용
viewer.setFaceNoShadow(false);     // 복원
```

**자체 그림자 vs 머리카락 투영 (`noCastPattern`)** — 중요한 제약:

**표준 그림자 맵은 「자체 그림자」와 「다른 물체의 투영」을 구분할 수 없습니다**. 그림자 맵은 픽셀이 어떤 깊이에 가려졌는지만
기록하며, 가리는 것이 자기 자신인지 알지 못합니다. 그래서:

| 원하는 것 | 방법 | 대가 |
|---|---|---|
| 얼굴에 그림자가 전혀 없음 | `"faceNoShadow": true` (기본) | 자체 그림자도 함께 사라짐 |
| **얼굴은 자체 그림자 유지, 앞머리는 투영 안 함** | `"faceNoShadow": false` + `"noCastPattern": "Hair"` | **머리카락이 몸/어깨에 그림자를 드리우지 않음** |
| 얼굴은 그림자 안 받고 머리카락은 정상 투영 | `"faceNoShadow": true` | 위와 동일(자체 그림자 사라짐) |

layers 로 얼굴 전용 비투영 조명을 주는 방법도 **해결되지 않습니다** — 그 조명 자체가 그림자가 없으므로 얼굴에 자체 그림자가 없습니다.

실측 `noCastPattern: "Hair"` 매칭(각 1 개 메시, 매우 정확):

| 모델 | 매칭 |
|---|---|
| `sample.glb` | `CH0155_Body_1 [CH0155_Hair]` |
| BA `Hoshino.glb` | `Hoshino_Original_Body_6 [Hoshino_Original_Hair]` |

```jsonc
"renderer": {
  "faceNoShadow": false,      // 얼굴이 다시 그림자를 받음(자체 그림자 복귀)
  "noCastPattern": "Hair"     // 하지만 머리카락은 그림자 맵에 안 들어감 → 앞머리가 얼굴에 드리우지 않음
}
```

> 주의: 얼굴에 자체 그림자가 보이는지는 얼굴 메시 자체의 **곡률**과 `castShadow` 에도 달려 있습니다.
> 평면 카드형 얼굴은 자체 그림자가 거의 보이지 않고, 콧대/턱 굴곡이 있는 경우에만 뚜렷합니다.

### 툰(Cel): 그림자를 제외하면 ≈ 무광 ★

**툰 경로에만 영향, PBR 은 전혀 바뀌지 않음**(배율은 `cel` 분기에만 쓰고, 낮 프리셋 값은 그대로).

#### 두 가지 핵심

1. **명암 단계**: `celSteps: 2`(「수광 / 그림자」두 단계만) + `celDark: 0.80`.
   단계화하면 **모든 수광면이 같은 밝기**가 됩니다 — 이것이 「그림자만 빼면 무광과 같다」의 근원입니다.
2. **톤 매핑**: 툰은 `LinearToneMapping`(수학적으로 `× toneMappingExposure` 와 동등)을 씁니다.
   ACES 는 두 단계를 함께 순백으로 밀어냅니다: 실측 수광 1.03 / 그림자 0.83 이 ACES 를 거치면
   **0.85 / 0.82, 대비가 19 % → 8.5 % 로 떨어져 그림자가 눈에 띄게 뭉개집니다**.
   등비 스케일 ⇒ **그림자 대비는 그대로 유지**되고, 노출 손잡이가 실제로 밝기 조정용이 됩니다.

   > ⚠️ 머티리얼 측은 **일律 tone mapping 에 참여하지 않습니다**(Unity 와 동일): 스타일 백엔드는 `#include <tonemapping_fragment>` 를 제거하고, 소스 백엔드는 `mat.toneMapped = false`; 페이지의 tone mapping 은 PBR / 네이티브 머티리얼에만 적용됩니다. 자세한 내용은 `LILTOON2.x.md` 十 장.

#### 툰 조명 보정 (`applyLightingPreset`)

MeshToonMaterial 은 **envMap 을 지원하지 않아** RoomEnvironment 의 환경 조명이 전부 버려지므로 보정이 필요합니다.
다만 **보정 방향이 결정적**입니다. 렌더식:

```
lit    = hemi×0.62 + key×1.0     + rim + fill
shadow = hemi×0.62 + key×celDark + rim + fill     ← 투영이 메인 라이트 전체를 막음
```

**hemi 가 양쪽 항에 동시에 있으므로 → 높을수록 그림자가 희석됩니다.**
구 코드는 hemi ×1.25(환경광 보충 의도)였고, 그래서 수광/그림자가 함께 순백으로 밀려 그림자가 사라졌습니다.
이제 반대로 **hemi 를 크게 낮추고 메인 라이트가 주도**하게 하며, 역광면은 단계의 `celDark` 로 받쳐 줍니다.

| 파라미터 | 원래 값 | 툰 배율 | 결과 | 역할 |
|---|---|---|---|---|
| `hemi.intensity` | 0.5 | **× 0.48** | 0.24 | 환경광이 수광/그림자 양쪽에 들어가므로 **낮을수록 그림자가 선명** |
| `key.intensity` | 2.0 | **× 1.22** | 2.44 | 주력: 수광 밝기 + 투영 대비 |
| `rim.intensity` | 1.2 | **× 0.15** | 0.18 | 거의 보이지 않게(투영 없음, 그림자만 희석) |
| `fill.intensity` | 0.4 | **× 0.15** | 0.06 | 위와 동일 |
| `exposure` | 1.0 | **× 1.15** | 1.15 | 툰의 유일한 밝기 총스위치 |

**배율은 실측으로 정량화**: 밝기 슬라이더 **2.1** 에서 무광과 같은 느낌이라 2.1 을 배율에 접어 넣었고, `lightingScale` 은 1.0 이면 기본이 정답이며 계속 조정 가능합니다.
그림자 대비는 약 **17 %**(`celDark: 0.80`, 최초 0.72 의 24 % 보다 옅게, 실측 피드백으로 조정).
역광면은 0.80 단계가 받쳐 주어 검게 되지 않습니다.

#### 투영 그림자 농도 (`celShadowMin`) ★ celDark 와는 다른 것

사용자 피드백 「몸에 지는 그림자가 여전히 진하다」 — 그것은 단계 문제가 아니라 **투영 그림자**입니다:

| | 원인 | 제어 주체 |
|---|---|---|
| **단계** | 노멀이 역광 → 메인 라이트가 감쇠 | `celDark` (0.80 = 한 단계 어둡게) |
| **투영 그림자** | 머리/몸에 **막힘** → 메인 라이트가 **통째로 잘림** | `celShadowMin` |

r160 에서 방향광 그림자는 `lights_fragment_begin` 에 **인라인**되어 있습니다:

```glsl
directLight.color *= ( directLight.visible && receiveShadow )
    ? getShadow( directionalShadowMap[i], … ) : 1.0;
```

그리고 `getShadow` 는 0 또는 1 만 반환합니다 — **전부 주거나 전혀 주지 않으므로** `celDark` 단계가 관여할 수 없습니다.
그래서 그림자 안에는 환경광만 남아 유난히 진하게 보입니다.

처리: 결과를 `mix( keep, 1.0, s )` 로 재매핑 — 수광(s=1)은 그대로, 투영(s=0)은 `keep` 배 메인 라이트 유지. **현재 기본 `0.3`**(실측: 0.5 는 옅고 0.3 이 적절).

> ⚠️ **구현상 반드시 주의할 함정**: three 의 호출 순서는
> `WebGLRenderer → material.onBeforeCompile(parameters, renderer)`(콜백),
> `WebGLProgram → resolveIncludes(fragmentShader)`(include 는 그때 확장)입니다.
> 즉 **콜백이 받는 것은 아직 `#include` 가 남은 원문**이라 `getShadow(…)` 그 행을 직접 찾을 수 없습니다
> (cel 그라디언트가 동작하는 것도 `#include` 자체를 교체했기 때문).
> 여기서는 `THREE.ShaderChunk.lights_fragment_begin` 원문을 가져와 부드럽게 만든 뒤 그 include 를 통째로 대체해, three 원판과 글자 단위로 같게 유지합니다.

#### ✅ 얼굴 그림자의 진실 (3 라운드 조사 후의 결론)

결론이 두 번 수정되었고, 최종적으로 **Raycaster 정밀 차폐 테스트**로 확정했습니다 — 얼굴 정점에서 메인 라이트 방향으로 광선을 쏘아 머리카락에 막히는지 확인:

```
메인 라이트 방향 (0.38, 0.77, 0.51)
sample.glb   266 개 얼굴 정점 → 229 개가 머리카락에 막힘 (86.1%)
Natsu.glb    288 개 얼굴 정점 → 148 개 막힘 (51.4%)
적중 거리 = 0.000 ~ 0.001        ← 핵심은 여기
```

**얼굴에 실제로 투영 그림자가 있고**, 그것도 **밀착**되어 있습니다(얼굴과 머리카락이 서로 파고듦).

진짜 범인은 `keyLight.shadow.normalBias = 0.02` 였습니다 — 그림자 샘플링을 노멀 방향으로 **밀어내는데**,
0.02 는 높이가 ~2 단위인 모델에서 **접촉 거리 0.001 의 20 배**라 얼굴의 투영이 통째로 지워집니다.
몸의 그림자는 남는 것은 간격이 훨씬 커서이며, 현상과 완전히 일치합니다.

> 앞 두 라운드의 판단은 모두 틀렸습니다: 처음엔 「단계 문제지 투영이 아니다」, 다음엔 「기하학적으로 투영될 수 없다」고 했습니다.
> 1 라운드는 이마의 어두운 띠만 유일한 가능성으로 본 것이, 2 라운드는 **모델 중심**을 얼굴로 샘플링한 것이 오류였습니다.

**시도했으나 무효**: `shadowNormalBias` 를 0.02 → 0 으로 바꿔도 실측 **얼굴 그림자는 여전히 나오지 않고 조명만 이상해져** 원값으로 롤백.
그래서 이 추론은 **성립하지 않으며**, 여기에는 조사 과정만 기록합니다. 다시 따라 하지 마세요.

> 두 값은 설정 항목으로 남아 있습니다(`shadowBias` / `shadowNormalBias`), 기본값은 viewer 가 계속 쓰던 원값.

#### 얼굴 그림자: **파라미터 하나만** (`celFaceShadowMin`)

농도 자체가 「있음/없음」을 표현합니다: **맨 오른쪽(≥0.95) = 얼굴 그림자 없음**, 그래서 별도 스위치가 필요 없습니다.

| `celFaceShadowMin` | number \| `null` | **`0.7`** | **얼굴 그림자의 유일한 파라미터**: `0` = 가장 진함, `>= 0.95` = 얼굴 그림자 없음, `null` = `celShadowMin` 을 따름 |

| 값 | 의미 |
|---|---|
| **`0.7`(기본)** | 얼굴이 몸(0.3)보다 **옅은** 투영 |
| `null` | 전역 `celShadowMin` 을 따름 |
| `0` | 얼굴에 원래 하드 그림자 유지(가장 진함) |
| `0.3` | 몸과 같은 단계(부드러움) |
| `>= 0.95` | **얼굴 그림자 없음** |

구현상 이 값이 두 가지를 동시에 구동하며, **파라미터 하나로 두 렌더 경로를 덮습니다**:

1. **툰**: `lights_fragment_begin` 의 `getShadow(...)` → `mix(keep, 1.0, s)` 로 투영 농도 제어
2. **양쪽 공통**: `>= 0.95` 이면 `faceNoShadow = true` 를 파생해 얼굴 메시의 `receiveShadow` 를 끔
   — `receiveShadow` 는 `lights_fragment_begin` 에서 **모든 머티리얼 타입**(toon / standard / lambert / phong)이 확인하므로
   PBR 경로도 함께 덮입니다(셰이더 소프트닝만으로는 PBR 에 무효)

UI: **「얼굴」슬라이더**(옆에 전역 「그림자 강도」). 건드리지 않으면 전역을 따르고 실시간 동기 표시되며, 움직이면 독립값이 됩니다.
따르게 되돌리려면 설정에 `null` 을 쓰거나 `viewer.setCel({ faceShadowMin: null })`.

> 제거된 것: 독립 「얼굴 그림자」스위치, `setFaceNoShadow()` API — 모두 이 하나의 파라미터로 통합.
> `renderer.faceNoShadow` 도 더 이상 읽지 않습니다(설정에 써도 무시).

인덱스 페이지 우하단에 **「그림자 강도」슬라이더**(0 ~ 0.95)로 실시간 조정할 수 있습니다. 설정 JSON 에도 쓸 수 있습니다:

```jsonc
"renderer": {
  "celShadowMin": 0.3,        // 전신 투영 그림자: 0 = 하드 섀도, 1 = 전혀 없음
  "celFaceShadowMin": null,   // 얼굴만 별도 단계; null = 위 값을 따름. 0 이면 얼굴 그림자 최대
  "celSteps": 2,              // 수광/그림자 두 단계만
  "celDark": 0.80,            // 역광면의 단계 농도
  "shadowNormalBias": 0.02,   // 그림자를 노멀 방향으로 밀어내는 거리(기본값, 미튜닝)
  "shadowBias": -0.0003
}
```

런타임 등가 표기: `viewer.setCel({ shadowMin: 0.3 })`

#### 미세 조정 (인덱스 페이지에 「밝기」슬라이더 + 숫자 입력 있음)

- **그림자가 너무 옅다** → `viewer.setCel({ dark: 0.68 })`(`celDark` 가 작을수록 그림자가 깊음; 현재 0.80)
- **전체가 어둡거나 밝다** → **UI 의 「밝기」슬라이더**(실시간; 두 경로 모두 적용, 1.0 = 프리셋 원값)
- 툰에는 총스위치 `toneMappingExposure × 1.15` 가 따로 있으며, 조정해도 등비라 그림자 대비는 손상되지 않음
- **더 「툰 같은」단계** → `viewer.setCel({ steps: 4 })`(4 단계 그라디언트로 복귀)

> `faceNoShadow` 기본값은 `false`(**얼굴 그림자 유지**). 단계화 + 직통 처리 후 투영이 깨끗해져
> 예전처럼 얼굴 그림자를 끄는 폴백이 필요 없습니다; `true` 로 두면 여전히 제거됩니다.

### 선택 파츠와 소품 (`hideOptional` / `hideParts`)

**이 모델들은 GLB 노드 자체에 표시가 있습니다**(lihaohong6/BlueArchiveModels, 295 개 중 44 개에 extras):

```json
"Hoshino_Original_Shield_Weapon": { "optional": true, "prop0": true }
"Juri_Original_Weapon":           { "optional": true, "prop0": true }
```

GLTFLoader 는 extras 를 `object.userData` 에 넣으므로 바로 읽을 수 있습니다. 의미는:
**`optional` 이 붙은 파츠는 기본 숨김이며, 현재 모션이 실제로 구동할 때만 표시** — 참조 뷰어의
`data-hide-parts="optional"` 에 대응합니다. 실측이 완전히 일치:

| 모델 | 파츠 | 표시되는 모션 |
|---|---|---|
| `Hoshino.glb` | 방패 | `Exs_Cutin` / `Exs` (2/36 구간) |
| `Juri.glb` | 무기 | `Formation_Idle` / `Tactical_Start` (2/8 구간) |

**기본 활성**, 설정 불필요. 이것이 예전에 손으로 쓰던 `visibilityRules` 를 자동화한 것이기도 합니다 — 같은 규칙은 이제 지워도 됩니다.

```js
viewer.getOptionalParts()
// [{ name: 'Hoshino_Original_Shield_Weapon_1', prop: true, usedBy: 2, visible: false }]
```

#### 「위치가 이상한 작은 소품」은?

일부 소품(계산기 / 드론 / 의상 액세서리)의 본은 **`Bip001_Pelvis` 와 같은 레벨의 독립 루트**이고,
위치는 게임 엔진이 정하는 것이라 GLB 에선 이미 틀려 있으며, **부모를 바꿔도 고쳐지지 않습니다**
(애니메이션의 로컬 값을 원래 부모 기준으로 썼기 때문. 실측 Yuuka 의 계산기를 오른손에 붙이면 손과의 거리가 오히려 0.29 → 0.69). 이런 것은 숨기는 수밖에 없습니다:

```jsonc
"hideParts": "Calculator|Dron"     // 정규식 조각, 메시 이름 또는 머티리얼 이름 매칭
```

> `bone_cos1_01..04` 같은 것은 **의상 액세서리**이며(44 구간 중 31~33 에서 구동) 원래 보여야 하니 잘못 숨기지 마세요.

### 골격 스케일 = 소품 숨김 (`hideByBoneScale`)

**이 모델들은 「구동 본을 아주 작게 스케일」해서 「이 소품은 지금 보이지 않음」을 표현**하는 경우가 흔한데, 0.3 으로 줄인 것이 0 이 아니라
축소판 소품이 제자리에 떠 있습니다(실측 Airi.glb 의 아이스크림이 이마에 붙어 있음).

판정: **그 메시 골격의 모든 본 스케일이 임계값 미만** (기본 0.5). 「모두」를 쓰고 「최소값」을 쓰지 않는 것은
캐릭터 본체를 잘못 처리하지 않기 위해서입니다 — 본체는 100+ 본 중 항상 1 에 가까운 것이 있어 전부 임계 미만이 될 수 없고,
소품은 1~2 본이라 쉽게 걸립니다. 매 프레임 판정(스케일은 모션에 따라 변함)하되 `hideOptional` 이 관리하는 메시는 건너뜁니다.

실측 효과(이 규칙은 **모델 제작자가 표현한 숨김 의도를 정확히 재현**합니다):

| 모델 | 메시 | 숨겨지는 모션 | 표시되는 모션 |
|---|---|---|---|
| `Airi.glb` | 아이스크림 | `Cafe_Reaction` / `Cafe_Idle` / `Cafe_Walk` (scale 0.315) | 나머지 4 구간 (0.761~1.0) |
| `Natsu.glb` | 파이 `CH0155_Pie01` | **모든 모션** | — |
| `Natsu.glb` | 우유팩 | `Formation_*` / `Normal_*` 등 | `Cafe_Idle` / `Cafe_Walk` / `Cafe_Reaction` |
| `Shiroko.glb` | 드론 로켓 / 날개 | **모든 모션** | — |

```jsonc
"hideByBoneScale": 0.5      // 기본 활성; 0 으로 끔
```

### 광배(링)가 PBR / Cel 에서 새까맣게 → 영 노멀 (자동 보정됨) ★

**증상**: 모델의 광배가 `unlit` 에서는 정상인데 **PBR / Cel 에서는 순수 검정**.

**원인**: 상당수 모델의 **광배 메시에 NORMAL 속성이 아예 없습니다**. glTF 규격상 GLTFLoader 는 노멀이 없으면
**영 벡터** 버퍼를 채우고, 영 노멀은 수광 머티리얼에서 조명이 항상 0 → 순수 검정.
반면 unlit 은 `MeshBasicMaterial` 이라 **노멀을 읽지 않아** 정상으로 보입니다.

**범위**(모델 60 개 스캔): 1078 메시 중 29 개가 영 노멀이고, **그중 28 개가 광배**
(`Airi_Original_Halo_1`, `Hoshino_Origina_Halo`, `Akari_Halo`, `Aris_Original_Halo_1` …).
정상 광배도 있습니다, 예: `CH0155_Halo_1`(Natsu.glb) 의 노멀은 1.000 — **이 결함은 모델별**입니다.

**처리**: 로드 시 모든 메시를 표본 검사해 **전체가 영/NaN 노멀**이면 `geometry.computeVertexNormals()` 로 재계산
(면 노멀이 나와 평면 셰이딩; 얇은 판인 광배에 적합). 표본 판정이라 정상 메시를 잘못 건드리지 않고 전수 비용도 치르지 않습니다.

실측:

| 모델 | 보정 전 | 보정 후 |
|---|---|---|
| `Airi.glb` | 333/333 정점 영 노멀 | 0/333, 평균 길이 1.000 |
| `Hoshino.glb` | 282/282 정점 영 노멀 | 0/282, 평균 길이 1.000 |
| `Natsu.glb` | 0/268 (원래 정상) | 미변경 |

> 광배는 기본적으로 여전히 **외곽선을 그리지 않습니다**(`outlineSkipPattern: "Halo"`) — 그것은 별개 문제입니다:
> 얇은 판 + DoubleSide 의 역확장이 자기 자신을 뚫어 깜빡이며, 노멀과 무관합니다.

### 근본 이동: 오브젝트 수준 상쇄, 애니메이션 트랙을 다시 쓰지 말 것 ★

**기본 `stripRootMotion: "compensate"`** — 근본 이동을 **오브젝트 계층**에서 상쇄합니다: 애니메이션은 그대로 재생하고,
매 프레임 루트 본의 `modelRoot` 대비 변위를 읽어 `modelRoot` 를 반대로 오프셋합니다.

#### 왜 애니메이션 트랙을 다시 쓰면 안 되는가

옛 방식(`Bip001` / `bone_root` 의 position 트랙을 눌러 평탄화)은 치명적 부작용이 있었습니다:
**모델 루트 아래에 있으면서 골격을 따라가지 않는** 소품이 몸과 분리됩니다. 실측:

| 모델 | 현상 |
|---|---|
| `Natsu.glb` 우유팩 | 입가(키의 57 %)에서 **머리 위**(90 %)로 이동 |
| `Airi.glb` 아이스크림 | 마찬가지로 머리로 이동 |

게다가 함정이 깊습니다: `Airi.glb` 의 체인에는 **`Bip001.position` 만** 있고(`bone_root` 없음)이라
「최외곽만 누른다」로도 해결되지 않습니다.

#### 새 방식 실측

| | 루트 본 월드 흔들림 | 손에서 소품까지 거리 |
|---|---|---|
| Natsu `Vital_Death` | 0.539 → **0.000** | 0.24 → **0.24**(불변) |
| Hoshino `Exs_Root` | 3.010 → **0.000** | 0.42 → **0.42**(불변) |
| Airi `Exs` | 0.392 → **0.000** | 0.43 → **0.43**(불변) |

**근본 이동이 완전히 사라지고 본은 하나도 건드리지 않음** — 소품은 애니메이션이 배치한 위치에 그대로 남습니다.

#### 구현 디테일 두 가지

1. **세계 좌표가 아니라 「modelRoot 기준 로컬 좌표」를 사용** — 세계 좌표에는 이전 프레임의 보정량이 섞여
   자기 되먹임이 생깁니다(올라감 → 불필요 판정 → 내려감 → 다시 올라감). `worldToLocal` 이 `modelRoot` 자체의
   이동을 깨끗이 나누므로 자연히 되먹임이 없습니다.
2. **로컬 증분은 모델 스케일을 다시 곱해야 함** — `worldToLocal` 은 `modelRoot.scale` 로 **나누는데**
   (정규화 후 보통 1.3~1.8), 다시 곱하지 않으면 1/scale 만큼만 상쇄되어 실측 45~55 % 흔들림이 남습니다.

수평(X/Z)만 상쇄하고 **수직은 유지** — 점프/쓰러짐의 상하 이동은 동작이 표현하려는 것입니다.

> Hoshino 의 `Exs_Root` 원래 근본 이동은 **3.01 단위**(캐릭터가 2 단위 높이)로, 이 메커니즘이 가장 필요한 동작입니다.

**모션별 메시 표시·숨김 제어**: 방패/무기가 특정 모션에서만 나올 때 사용(아래 설명) |
| `mouthIdle` | boolean | `false` | **폴백 구형**: 모션이 입 본을 구동하지 않을 때 구형을 자체 순환(아래 설명) |
| `mouthIdleMs` | number | `180` | 폴백 구형이 칸마다 머무는 시간(ms), 최소 60 |

일부 모션(걷기 `Move_Ing`, 무대 연기)은 루트 노드를 평행 이동시키는데, 모델 정규화 때 전체가 수백 배 확대되어
(CH0273 은 150 배) 0.0126 의 원래 변위가 약 1.9 월드 단위가 됩니다 — 캐릭터가 화면 밖으로 걸어 나갑니다.

- `"xyz"` — 세 축 모두 제거, 캐릭터가 **항상** 화면 안에 있음. 대가: 점프 높이와 쓰러짐 낙하도 평탄화
- `"xz"` — 수평 변위만 제거, 점프 / 쓰러짐 유지
- `false` — 처리 안 함

구현에 **노드 이름을 하드코딩하지 않습니다**: 근본 이동의 매체는 CH0273 에서 Object3D `Bip001`(Bone 은 아니지만 하위에 141 본 전부 포함)입니다.
판정은 「최상위 본에서 위로, position 애니메이션이 있는 조상」입니다.

### 4.3 셰이딩과 외곽선

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `autoConfig` | boolean | `true` | 설정을 명시하지 않았을 때 모델과 동명 .json 자동 로드(「동명 설정 자동 로드」절 참고) |
| `shading` | `"pbr"` \| `"cel"` \| `"unlit"` | **`"cel"`** | `pbr`(원본) \| `cel`(툰, 기본) \| `unlit`(무광) |
| `celSteps` | number | `2` | 툰 명암 단계 수(**2 = 수광/그림자 두 단계** → 그림자만 빼면 평평; 4 이상이면 다단계 그라디언트) |
| `celDark` | number | `0.80` | 툰 최암 단계 밝기(1.0 = 전부 밝음); **작을수록 그림자가 깊음**, 0.80 = 한 단계만 옅게 |
| `celShadowMin` | number | `0.3` | **투영 그림자에 남기는 메인 라이트 양**: 0 = 기존 하드 섀도, 1 = 투영 그림자 전혀 없음(툰 모드만) |
| `shadowNormalBias` | number | `0.02` | 그림자 샘플링을 노멀 방향으로 밀어냄(원값 유지) |
| `shadowBias` | number | `-0.0003` | 그림자 깊이 오프셋(원값 유지) |
| `celFaceShadowMin` | number \| `null` | `null` | **얼굴 전용 투영 그림자 농도**(`null` = `celShadowMin` 을 따름). 전역보다 작으면 얼굴 그림자가 더 선명; `0` = 최대 하드 |
| `celShadowTint` | `[r,g,b]` \| `null` | `null` | 툰 어두운 톤(0~1), 예: `[0.72,0.62,0.85]`; `null` = 어둡게만, 색조 없음 |
| `celFaceLight` | boolean | `false` | **얼굴 조명 보정**: 얼굴/눈/눈썹 노멀을 카메라 방향으로 강제 |
| `celFacePattern` | string | `Face\|EyeMouth\|Eyebrow\|Mouth` | 어떤 머티리얼 이름을 「얼굴」로 볼지(정규식 조각) |
| ~~`faceNoShadow`~~ | — | 파생 | **파생 필드로 변경, 더 이상 개별 설정 아님**: `celFaceShadowMin`(미설정이면 `celShadowMin`)이 결정하며 **≥0.95 면 얼굴 그림자 없음** |
| `outlineSkipPattern` | string \| `null` | `"Halo"` | 이 머티리얼 이름들은 외곽선 없음(얇은 판 역확장이 자기 자신을 뚫어 깜빡임) |
| `hideOptional` | boolean | `true` | **GLB 에 `extras.optional` 이 붙은 파츠는 기본 숨김**, 모션이 실제 구동할 때만 표시 |
| `hideByBoneScale` | number | `0.5` | **본 스케일로 소품 숨김**: 메시 골격의 모든 본 스케일이 이 값 미만이면 숨김; `0` = 끔 |
| `lightingScale` | number | `1` | 라이팅 프리셋의 **전체 밝기 배율**(런타임에서 `viewer.setLightingScale(x)` 로 실시간 조정) |
| `hideParts` | string \| `null` | `null` | 매칭되는 메시를 직접 숨김(정규식 조각, 메시 이름 또는 머티리얼 이름) |
| `attachProps` | array \| `null` | `null` | 떨어진 소품 본을 캐릭터 본에 붙임 — **실측상 신뢰 불가**, hideParts 우선 |
| `noCastPattern` | string \| `null` | `null` | **투영하지 않는 머티리얼 이름**(정규식 조각), 예 `"Hair"`. `faceNoShadow: false` 와 함께 쓰면 「얼굴은 자체 그림자 유지, 앞머리는 얼굴에 투영 안 함」 |
| `outline` | boolean | `true` | 역확장 외곽선 스위치 |
| `outlineThickness` | number | `0.002` | 외곽선 두께 |
| `outlineColor` | `[r,g,b]` | `[0.10,0.07,0.11]` | 외곽선 색(리니어 0~1, 공식은 따뜻한 어두운 색이며 순수 검정 아님) |
| `outlineAlpha` | number | `1.0` | 외곽선 투명도 |
| `shadows` | boolean | `true` | 그림자(바닥 접촉 그림자 포함) |

> `cel` 모드에서 `MeshToonMaterial` 은 **envMap 을 지원하지 않아** 환경광 기여가 사라지므로, 프레이밍 시 조명을 보정합니다
> (반구광 ×1.25, 메인광 ×0.8, 노출 ×0.9). `pbr` 로 돌리면 자동 복원됩니다.

---

## 五. `lighting` —— 라이팅

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `preset` | `"day"` \| `"golden"` \| `"night"` | `"day"` | 낮 / 아침저녁 / 밤 |
| `exposure` | number | `1.0` | 렌더러 노출 |

라이팅은 조명만 바꾸고 **배경은 건드리지 않습니다** — 배경은 아래 필드로 따로 제어합니다.

## 六. `background` —— 배경

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `transparent` | boolean | `true` | `true` = 투명 배경(**임베드 시 아래 웹페이지 내용이 비침**) |
| `color` | string \| number \| `null` | `null` | 비투명일 때 사용; `#rrggbb` 또는 `0xRRGGBB` |

투명 배경은 렌더러 `alpha: true` + `scene.background = null` + `setClearAlpha(0)` 으로 구현하므로
canvas 가 실제로 투명하며, 「웹페이지와 같은 색을 칠한」 것이 아닙니다.

---

## 七. `animation` —— 기본 모션과 외부 애니메이션

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `name` | string | 미설정 → **이름에 `idle` 이 있는 모션 중 무작위** | 초기 모션 |
| `clips` | array | `[]` | **외부 Unity `.anim` 목록**(FBX 는 보통 애니메이션 미포함). 각 항목 `{ url, name?, group? }`, 상대 경로는 설정 파일 디렉터리 기준 |
| `axisFix` | boolean | `true` | 외부 `.anim` 의 좌표 변환(Unity 왼손 → three 오른손). 모델 축이 맞지 않으면 `false` |
| `humanoid` | string \| object | `null` | **Humanoid 근육 변환표**(URL 또는 인라인 객체): Unity 측 스크립트로 「근육마다 → 어느 본 · 어떤 축 · 단위당 몇 도」를 한 번 측정 ✓ 있으면 근육 커브만 있는 `.anim` 도 재생 가능 |
| `rootMotion` | bool | `true` | **루트 모션**(Humanoid 클립의 `RootT` / `RootQ`): 클립의 이동과 회전을 캐릭터에 합산 ✓ 끄면 본 동작만 재생하고 캐릭터는 제자리 |

매칭 규칙(차례로 시도): **정확한 이름 → 대소문자 무시 정확 → 이름 포함(대소문자 무시)**.
그래서 `"CH0273_Cafe_Idle"` 과 축약 `"Cafe_Idle"` 모두 매칭됩니다.

**Humanoid 모션에는 변환표가 필요**: 근육 값 해석은 Avatar 에 의존하는데 Avatar 는 **파일에 저장되지 않습니다**
(실측: melano.fbx.meta 에 어떤 매핑 필드도 없음)
⇒ Unity 측 스크립트로 한 번 측정: 캐릭터 선택 → `Tools ▸ BA3D ▸ 导出 Humanoid 肌肉换算表（JSON）`,
생성된 JSON 을 모델 디렉터리에 두고 여기에 `"humanoid": "./humanoid-muscles.json"` 을 채웁니다. 해석식은 「제로 포즈 × ∏ 단축 회전」이며
스크립트의 자체 점검 식과 **글자 단위로 동일** — 스크립트가 최대 각도 오차를 보고합니다(≈0 이면 정확).
표는 **캐릭터 단위**이므로 캐릭터를 바꾸면 다시 내보내야 합니다.

**댄스를 움직이게 하는 두 가지 방법**:
· **베이크**(가장 정확): Unity 에서 `Tools ▸ BA3D ▸ 把选中的 Humanoid .anim 烘成变换曲线` ⇒ `*_transform.anim` 생성,
  Unity 가 Avatar 로 정확히 해석(발 IK 포함)해 가져오면 프레임 단위로 일치; 스크립트가 자동으로 군살을 빼서 댄스 하나가 보통 수 MB(수백 MB 아님);
· **`.anim` 직접 읽기**(간편): `humanoid` 변환표만 붙이면 바로 재생되고,
  클립의 이동·회전(`RootT` / `RootQ`)도 자동 합산 ✓.

### 7.1 외부 Unity `.anim`

Unity 프로젝트의 FBX 는 보통 **애니메이션을 포함하지 않습니다** — 동작과 표정은 별도 `.anim`(AnimationClip, YAML 텍스트)입니다.
뷰어가 직접 읽고 커브 타입별로 분기합니다:

| `.anim` 의 내용 | 지원 | three 로의 매핑 |
|---|---|---|
| `blendShape.<이름>` | 예 | `morphTargetInfluences[i]` (표정) |
| `m_IsActive` / `m_Enabled` | 예 | `visible` (의상과 파츠 표시·숨김, 계단 보간) |
| `m_LocalPosition` / `m_LocalRotation` / `m_LocalScale` / `localEulerAnglesRaw` | 예 | `position` / `quaternion` / `scale` (골격 애니메이션) |
| **Humanoid 근육 커브**(`Chest Twist Left-Right` 등) | 아니오 | 없음 — 근육 값은 Avatar T-pose 기준이며 Avatar 매핑은 `.anim` 에 없음 |
| `RootT` / `RootQ` (Humanoid 루트 모션) | 아니오 | 없음 |
| `m_PPtrCurves` (텍스처·머티리얼 전환) | 아니오 | 없음 |

**지원하지 않는 커브가 든 클립은 통째로 건너뜁니다**(「부분 적용」을 하지 않음 — 그렇지 않으면 몸이 바인드 포즈에 멈춘 채
표정만 움직여 표현이 틀립니다). 건너뛸 때 콘솔에 어느 종류가 몇 개인지 기록됩니다.

전제 두 가지, 둘 다 필수:

- **표정은 모델에 blendShape 가 있어야**: GLB 는 가능; **FBX 는 불가** — three 의 FBXLoader 가 FBX 의
  BlendShape 구간을 해석하지 않으므로 FBX 모델에서는 「표시·숨김」과 「변환」 두 종류의 `.anim` 만 동작.
- **Humanoid 모션은 Avatar 가 필요**: `.anim` 에는 정규화된 근육 값만 있고 본 매핑은 Avatar(프로젝트 설정)에 있어
  브라우저에서는 얻을 수 없음 ⇒ 그런 클립은 해석 불가.

**Humanoid 모션의 정답**: Unity 에서 클립을 **변환 커브로 베이크**(매 프레임 각 본의 `local*` 샘플링, `<원래이름>_transform.anim` 으로 저장)
⇒ 그 클립은 뷰어가 **바로 재생**할 수 있습니다(`m_LocalRotation.x/y/z/w` 성분 표기도 ✓);
또는 FBX Exporter 를 써서 애니메이션을 FBX 와 함께 내보내도 됩니다(변환 0).
근육 값 자체는 브라우저에서 해결 불가 — 해석에는 Avatar 가 필요합니다.

```jsonc
"animation": {
  "name": "Melano_DefaultFace",                              // 초기 모션 (선택)
  "clips": [
    { "url": "./anim/Facial/Melano_smile.anim", "group": "face" },
    { "url": "./anim/Gimmick/shoes_ON.anim",    "group": "parts" }
  ]
}
```

`group` 은 호출자(메뉴, 임베드 페이지)가 분류에 쓰는 라벨일 뿐이며 뷰어는 의존하지 않습니다.
`getAnimations()` 는 각 클립의 `overlay` / `kind`(`body` / `face` / `parts`)/ `source` 를 추가로 반환합니다:
**표정과 의상은 overlay** — 그것을 재생해도 현재 몸 동작을 **방해하지 않습니다**(Unity 에서도 가산식).

### 7.2 선언적 카메라 (최상위 키 `camera`)

`?config=` 로 Unity 씬의 구도를 그대로 재현하고 싶을 때(뷰어 자동 프레이밍 대신) 사용합니다.
**각 항목을 Unity 단위로 채우면** 변환은 뷰어가 담당합니다:

```jsonc
"camera": {
  "position": [0, 1.1, 1],      // Unity 카메라 위치
  "target":   [0, 1.1, 0],      // 조준점
  "fov":      26.9914,          // 카메라 FOV (도)
  "unityModelHeight": 1.2477    // 이 모델의 Unity 실제 높이
}
```

`unityModelHeight` 가 변환의 열쇠입니다: 뷰어는 로드 시 모델을 `targetHeight`(기본 2)로 정규화하므로,
카메라 항목 전체에 `K = targetHeight / unityModelHeight` 를 곱합니다.
**등비 확대는 FOV 아래의 화면 구성를 바꾸지 않습니다** ⇒ 이렇게 얻은 것이 Unity 의 구도입니다.
채우지 않으면 `K = 1` 이며 카메라 값은 뷰어 현재 공간으로 해석됩니다.

---

## 八. HTML 쪽 사용법

**순수 HTML 임베드**(속성을 컨테이너에 작성):

```html
<div data-ba3d
     data-ba3d-config="./assets/sample.json"
     data-ba3d-drag
     style="width:420px;height:430px"></div>

<script type="module">
  import { autoMount } from './dist/3d-viewer.min.js';
  autoMount();           // [data-ba3d] 를 자동 스캔해 뷰어를 만들고 로드 시작
</script>
```

| 속성 | 설명 |
|---|---|
| `data-ba3d` | 이 컨테이너에 뷰어를 마운트한다는 표시 |
| `data-ba3d-config` | 설정 JSON 의 URL |
| `data-ba3d-model` | 모델 URL 직접 지정(config 없이 사용 가능) |
| `data-ba3d-mouth` | 입가 텍스처 URL 직접 지정 |
| `data-ba3d-drag` | 「모델 위에서 왼쪽 버튼으로 컨테이너 전체를 드래그」활성 |
| `data-ba3d-auto-rotate` | `true` 면 자동 회전 |

> ⚠️ **컨테이너에 불투명 배경을 주지 마세요.**
> 뷰어 canvas 는 실제로 투명하지만(`background.transparent: true` → `alpha: true` + `setClearAlpha(0)`),
> 컨테이너 div 에 실색이나 불투명 그라디언트를 주면 투명이 보이지 않습니다 — 뒤의 웹페이지 내용이 통째로 가려져
> 「투명 배경이 안 먹은」 것처럼 보입니다.
>
> ```css
> .panel {
>   background: transparent;          /* ✅ 뒤 내용이 완전히 비침 */
>   /* background: rgba(12,16,24,.2); /* ✅ 옅은 바탕을 원하면 반투명 */
>   /* background: linear-gradient(...#1a2233...#0a0d14); /* ❌ 불투명 → 투명 무효 */
> }
> ```
>
> `embed-demo.html` 에는 이를 눈으로 확인하려고 오버레이 뒤에 컬러 장식(`#showcase`)을 일부러 두었습니다.

**URL 파라미터**(독립 페이지):

```
index.html?config=./assets/sample.json
index.html?config=./assets/fallback.json
index.html?model=./assets/sample.glb&mouth=./assets/mouth/Character_Mouth_2.png
```

## 九. 페이지 이벤트와 액션 훅

뷰어는 컨테이너에 **버블링되는 CustomEvent** 를 발생시킵니다:

| 이벤트 | `detail` | 용도 |
|---|---|---|
| `ba3d:pointerdown` | `{ button, hit }` | 즉시 발생(임계값 미만); `hit` = 왼쪽 버튼이 모델 위였는지 |
| `ba3d:press` | `{ button, heldMs, thresholdMs, hit }` | **충분히 누른 뒤에야 「누름」**(기본 200ms), 그때 컨테이너 드래그 시작 |
| `ba3d:click` | `{ button, heldMs, thresholdMs, hit }` | 충분히 누르지 않고 놓으면 클릭으로 간주, 드래그 없음 |
| `ba3d:pointerup` | `{ button, hit, pressedOnModel, pressed }` | 놓기; `pressed` = 이번에 임계값을 넘었는지 |
| `ba3d:action` | `{ name }` | 모션 전환(메뉴 동기화용) |

**누름 임계값**은 `renderer.pressHoldMs`(기본 `200`)가 제어합니다. 모델 위에서 왼쪽 버튼을 누르면 먼저 대기 상태가 됩니다:

- ≥ 200ms 누르면 → `ba3d:press` 발생 + 컨테이너 드래그 시작
- 일찍 놓으면 → `ba3d:click` 발생, 드래그 **안 함**

이렇게 하면 「한 번 클릭해 모션을 발생시키려다 패널을 끌어 버리는」 일이 없습니다. 드래그 시작점은 **임계값을 넘은 순간의 포인터 위치**이므로,
누르는 동안 손이 흔들려도 패널이 튀지 않습니다.

**입 모양**: 아틀라스 칸은 기본적으로 `bone_mouth` 의 스케일이 구동합니다. 그러나 **일부 모델의 GLB 에는 입 애니메이션 데이터가 아예 없습니다**
(실측 CH0273 은 애니메이션 42 구간, 구간당 142 트랙인데 입과 관련된 트랙이 하나도 없음). 이때 입 모양이 저절로 변하지 않는 것은 구현 문제가 아니라
모델에 데이터가 없는 것입니다. 페이지에서 수동으로 구동할 수 있습니다:

```js
viewer.setMouthCell(10);              // 0~63, 8×8 아틀라스의 10 번째 칸
viewer.getMouthCell();                // 현재 칸
viewer.getMouthInfo();                // { mesh, cell, driver: {bone, scaleTrack, ...}, ... }
//   driver.scaleTrack === false → 이 모델의 입은 모션에 따라 변하지 않음(데이터 없음)
```

**모션별 메시 표시·숨김 `visibilityRules`**: 일부 모델의 방패/무기는 **특정 모션에서만 나타나는데**, GLB 애니메이션 데이터에는 「숨김」이라는 개념이 없습니다 —
실측 `Hoshino_Original` 의 방패는 `bone_shield_root` 에 묶여 있고 축소하면 사라지지만, 42 구간 중 scale 이 `[0.70, 1.00]` 범위일 뿐
**그것을 줄이는 구간이 하나도 없습니다**. 그것은 게임 엔진이 모션별로 설정한 표시·숨김이므로 규칙으로 보충할 수밖에 없습니다:

```jsonc
"renderer": {
  "visibilityRules": [
    // 세 가지 표기 중 하나:
    { "mesh": "Shield", "clipContains": "Shield" },              // 모션 이름에 Shield 가 있으면 표시
    { "mesh": "Shield", "clips": ["Hoshino_Original_Shield_A"] },  // 모션 이름 정확히 나열(**완전 일치**)
    { "mesh": "Shield", "always": true }                         // 항상 표시(강제 복원)
    // 모두 "invert": true 로 반전 가능
  ]
}
```

> 왜 「방패가 움직였는지」로 판정할 수 없는가(실측 데이터): `Hoshino_Original` 의 방패는 **항상 팔 본에 붙어 있어**
> 팔이 움직이면 캐릭터 기준으로 변위가 생깁니다 — 그런데 Shield 4 구간은 오히려 **변위가 정확히 0**(아주 안정적으로 들고 있음)이고
> `Exs_Cutin` 이 0.011 로 최대입니다. 변위로 판정하면 반대로 나오고, 본 스케일도 그 4 구간에서 1.0 으로 일정합니다.
> 데이터에 신뢰할 신호가 없으므로 명명 규칙이나 명시 목록에 의존할 수밖에 없습니다.

의미: 메시 이름이 `/Shield/i` 에 매칭되면 **모션 이름에** `Shield` 가 있을 때만 표시하고 나머지 모션에서는 숨깁니다.
`mesh` / `clipContains` 는 정규식 조각(`clipContains` 는 **부분 문자열** 매칭)이고, `clips` 는 **완전 일치**(모션 이름 전체가 목록의 한 항목과 같아야 하며 대소문자 무시)입니다; 선택적으로 `"invert": true` 로 반전(포함하지 않을 때만 표시).
설정하지 않으면 표시·숨김에 전혀 개입하지 않습니다(기본).

규칙이 없는데 「메시 이름과 일부 모션 이름이 shield/weapon 을 함께 포함」하는 것이 감지되면, 로드 시 콘솔에 그대로 복사할 수 있는 안내가 나옵니다.

**기본 구형 `mouthCell`**: 일부 모델의 GLB 에는 **입 애니메이션 데이터가 전혀 없어**(실측 CH0273: 42 구간 × 142 트랙, 입 관련 0)
입 모양이 계속 고정됩니다. `mouthCell` 로 그 순간 어느 구형을 쓸지 지정합니다(아틀라스 8×8, 유효값 0~63):

```jsonc
"renderer": {
  "mouthCell": 10        // 입 데이터가 없을 때 10 번째 칸 사용; null(기본) = 첫 구형
}
```

입 데이터가 있는 모션은 **영향받지 않고** 모션을 그대로 따릅니다 — `mouthCell` 은 「데이터가 없을 때」의 폴백입니다.

`viewer.setMouthCell(n)` 으로 콘솔에서 한 칸씩 시도하거나 `assets/mouth/_cells-preview-*.png` 를 보고 칸을 골라 설정에 넣으세요. (유효 범위는 항상 0~63 이지만 **그 아틀라스의 실제 입 모양 범위를 벗어난 칸은 청록 덩어리로 표시**됩니다.)

**폴백 구형 `mouthIdle`**(기본 꺼짐, `mouthCell` 보다 우선): 일부 모델의 GLB 에는 **입 애니메이션 데이터가 전혀 없어**(실측 CH0273: 42 구간 × 142 트랙, 입 관련 0)
입 모양이 계속 고정됩니다. 켜면 현재 모션이 입 본을 구동하지 않을 때 구형이 `mouthIdleMs` 리듬으로 한 바퀴 순환합니다
(순수 시각 효과, 모션 내용과 무관); 입 데이터가 있는 모션은 영향받지 않고 모션을 따릅니다.

```jsonc
"renderer": {
  "mouthIdle": true,      // 폴백 구형 켜기
  "mouthIdleMs": 180      // 칸마다 180ms (8 칸이면 약 1.44s 한 바퀴)
}
```

로드 시 `[fixMouth] 没有任何动作驱动「bone_mouth.scale」…` 로 그 모델에 입 데이터가 없음을 알려 줍니다;
`viewer.getMouthInfo().driverClips` 로 입을 실제로 움직이는 모션이 몇 개인지(0 = 데이터 전무) 확인할 수도 있습니다.

전역 액션 훅(페이지의 다른 js 에서 직접 호출):

```js
play3dmodelaction(['Formation_Pickup']);   // 매칭되는 첫 모션 재생
play3dmodelaction(['A', 'B']);             // 순서대로 찾아 존재하는 첫 것을 재생
play3dmodelaction([3]);                    // 인덱스
play3dmodelaction('Cafe_Idle');            // 단일 문자열
play3dmodelaction();                       // 인자 없음 → 기본 모션
```

상호작용 규칙: **모델 위에서 왼쪽 버튼 드래그 = 컨테이너 이동; 오른쪽 버튼 드래그 = 캐릭터 회전**(`dragContainer` 활성 시).

---

## lilToon 외곽선 (Outline)

셰이더 = `lilToon` 에 적용됩니다. lilToon 의 `_Outline*` 계열 파라미터에 대응합니다.

```jsonc
"lilToon": {
  "outline": {
    "enable": false,                  // _UseOutline —— 전체 스위치
    "color": [0.6, 0.56, 0.73, 1.0],  // _OutlineColor (4 번째가 투명도)
    "tex": null,                      // _OutlineTex (텍스처 URL, 로더 미연결)
    "width": 0.08,                    // _OutlineWidth (내부 ×0.01)
    "widthMask": null,                // _OutlineWidthMask (URL, .r 채널)
    "fixWidth": 0.5,                  // _OutlineFixWidth
    "fixWidthMode": "lilToon",        // 'lilToon' | 'screen' (아래 참고)
    "vertexR2Width": 0,               // _OutlineVertexR2Width: 0 안 씀 / 1 R 사용 / 2 A 사용 (RGB 를 노멀로)
    "zBias": 0.0,                     // _OutlineZBias
    "cull": "back",                   // 'back'(기본, 뒷면만 그림) | 'front'
    "skipPattern": "mouth",           // 외곽선을 그리지 않을 메시 이름(정규식, 대소문자 무시)
    "litColor": [1.0, 0.2, 0.0, 0.0], // _OutlineLitColor (alpha=0 이면 무광, 미구현)
    "litScale": 10.0,                 // _OutlineLitScale
    "litOffset": -8.0                 // _OutlineLitOffset
  }
}
```

### 폭의 의미

```
월드 외곽선 두께 = width × 0.01 ÷ 메시 월드 스케일 × 메시 월드 스케일 = width × 0.01
```

코드에서 **메시 월드 스케일로 정규화**하므로 `width` 의 물리적 의미는 모델 스케일과 무관합니다.
(Unity 에서 1 단위 = 1 미터, 캐릭터는 약 1.5 라서 width 0.08 은 약 0.8 mm 로 아주 얇음)

**⇒ 패널의 「폭」범위는 0 ~ 10, 스텝 0.01**.

### fixWidthMode

lilToon 원판은:

```hlsl
outlineWidth *= lerp(1.0, saturate(length(headDirection)), _OutlineFixWidth);
```

`saturate` 가 거리를 **1.0 으로 클램프**하는데 카메라 거리는 보통 1 보다 훨씬 큽니다.
**⇒ 원판에서는 `_OutlineFixWidth` 를 0 으로 해도 1 로 해도 결과가 같아 파라미터가 실질적으로 무효**입니다.

| 값 | 동작 |
|---|---|
| `'lilToon'`(기본) | saturate 유지, **lilToon 과 완전히 동일** |
| `'screen'` | saturate 제거, `fixWidth=1` 이면 **외곽선 두께가 화면에서 일정**(멀어져도 얇아지지 않음) |

패널의 「고정 폭 사용(saturate 제거)」체크박스에 해당합니다.

### skipPattern

**메시 이름만** 매칭하며 머티리얼 이름도 경로도 매칭하지 않습니다.

이유: 머티리얼은 여러 메시가 공유하는 경우가 많아 머티리얼로 매칭하면 한꺼번에 잘못 걸립니다.

```jsonc
"skipPattern": "mouth|eye"            // 이름에 mouth 또는 eye 가 든 메시는 외곽선 없음
"skipPattern": "^CH0155_Body_4_Mouth_Split$"   // 정확 일치
```

**「파츠」패널에서 각 메시의 실제 이름을 볼 수 있습니다**(호버 시 계층 경로와 머티리얼 이름 표시)

### 기존 외곽선과의 배타

lilToon 외곽선을 켜면 내장 `OutlineEffect`(HUD 의 「외곽선」버튼)가 **자동으로 양보**합니다.
둘은 겹치지 않습니다.

**FBX 모델**: 내장 외곽선은 FBX 에서 일律 동작하지 않습니다(역확장 구현이 그 좌표계에 민감).
다만 **lilToon 외곽선은 FBX 에서도 정상 동작**합니다.

---

## 파츠 패널

HUD 의 **[파츠]** 버튼은 모델의 모든 메시를 나열합니다.

| 요소 | 역할 |
|---|---|
| 체크박스 | 해당 파츠 표시 / 숨김 |
| 이름(클릭) | **이것만 표시**(다시 클릭하면 전체 복원) |
| 삼각형 수 | 그 메시의 면 수(k = 천) |
| 머티리얼 이름 | 어떤 파츠가 어디 있는지 판단에 도움 |
| 🔓 / 🔒 | 해당 파츠 가시성 **잠금** |

### 잠금 의미 (기억 ≠ 동결)

| 상태 | 사용자 체크/해제 | 자동 로직* |
|---|---|---|
| 🔓 미잠금 | 즉시 적용 | **되돌려질 수 있음** |
| 🔒 잠금됨 | 즉시 적용 **+ 잠금 값 갱신** | **건드리지 않음** |

\* 자동 로직에는 `hideParts`(정규식 숨김) `hideOptional`(모션별 선택 파츠 숨김)
`hideByBoneScale`(소품이 몸 안으로 축소되면 숨김)이 포함됩니다.

**[전체 표시] / [전체 숨김]은 모든 파츠를 동시에 잠급니다**, 그렇지 않으면 자동 로직이 일부 파츠를 다시 꺼내기 때문입니다.

### API

```js
viewer.listMeshes()                       // 목록 (path / material / triangles 포함)
viewer.setMeshVisible('CH0155_Body/CH0155_Body_4', false)
viewer.setAllMeshesVisible(true)
viewer.isolateMeshes(['CH0155_Hair'])     // 이것들만 표시, [] 를 넘기면 전체 복원
viewer.setMeshLocked('CH0155_Hair', true) // 표시로 잠금, null 을 넘기면 해제
viewer.getMeshLocks()
viewer.debugTree()                        // 전체 계층 (조사용)
```

---

## 텍스처 매칭 규칙

FBX 의 텍스처 경로는 실제 파일과 어긋나는 경우가 흔해 아래 순서로 매칭합니다.

1. **전체 URL 정확 일치** `textureMap`
2. **쿼리 문자열 제거 후 매칭**
3. **파일명 매칭**
4. **★ 주 파일명 매칭**(확장자 제거, 대소문자 무시)
   —— 예: FBX 가 `Body.psd` 를 요청하고 업로드한 것이 `Body.png` 라면 **매칭됩니다**.
5. **`.psd` 자동 재작성**: `../TEX/`, `TEX/`, `../Textures/`, `Textures/`, `./` 순으로 같은 이름의 `.png` 시도

**빈 텍스처는 `null` 로 설정**해 「순수 검정을 샘플링해 모델 전체가 검게」되는 것을 막습니다.

> ⚠️ 이 프로젝트는 `vendor/three/loaders/FBXLoader.js` 의 `.psd` 분기를 수정했습니다:
> 원판은 `new Texture()` 자리표시자를 만드는데, **빈 텍스처는 three 에서 순수 검정으로 샘플링**되어 모델 전체가 검게 됩니다.
> 일반 이미지 요청으로 바꿔 위의 URL 재작성에 맡겼습니다.

---

## lilToon 프리셋

패널(셰이더 = lilToon 일 때 사용 가능) 상단 드롭다운, 공식 프리셋 19 개.
데이터는 `lilToon/Presets/*.asset` 에서 가져와 `LIL_PRESETS` 로 인라인했습니다.

```js
viewer.getLilPresets()
viewer.applyLilPreset('Skin-Anime')   // 또는 'Hair-OutlineRimLight' / 'Inorganic-Metal (MatCap)'
```

**적용 시 자동으로**:
1. `shader = 'lilToon'` 으로 전환
2. **먼저 Rim / MatCap / 발광의 blend 를 0 으로** 만들어 이전 프리셋 특성이 남지 않게 함
3. 프리셋 필드를 적용하고 머티리얼 재생성

⚠️ 프리셋의 `outline.enable` 은 **일律 false** 입니다.
lilToon 공식 프리셋의 `_UseOutline` 은 모두 0 이며, 「외곽선 여부」는 아트가 머티리얼별로 직접 켜고 프리셋은 수치만 제공합니다.

⚠️ **공식 프리셋은 머티리얼별로 사용**합니다(피부 머티리얼에는 Skin-*, 머리에는 Hair-*).
현재 구현은 전역이며, 머티리얼별 덮어쓰기 방안은 `LILTOON1.x.md` 9 장을 참고하세요.

---

## 버텍스 컬러 도구

lilToon 의 마스크는 **버텍스 컬러의 RGB 세 채널**을 읽습니다.

```
R → MatCap 가중치
G → Rim 가중치
B → 발광 가중치
```

```js
viewer.showVertexColors(true)   // 버텍스 컬러를 색으로 렌더(무조명 무텍스처)
viewer.vertexColorInfo()        // 메시별 min/max/평균/전부 흰색인지
```

HUD 의 **[버텍스 컬러]** 버튼 = 전자를 실행하고 후자를 출력합니다.

**버텍스 컬러가 없는 모델**: 마스크가 항상 1 이 되어 세 효과가 전 영역에 적용됩니다(코드에서 `#ifdef USE_COLOR` 로 자동 폴백)

---

## 외곽선 수광 (_OutlineEnableLighting / _OutlineLitColor)

`lil_common_frag.hlsl:371-380` 을 엄격히 따릅니다:

    litCol  = _OutlineLitApplyTex ? col.rgb * _OutlineLitColor.rgb : _OutlineLitColor.rgb
    litF    = saturate( NdotL * _OutlineLitScale + _OutlineLitOffset ) * _OutlineLitColor.a
    col.rgb = mix( col.rgb * _OutlineColor.rgb, litCol, litF )

| 설정 | lilToon 파라미터 | 패널 컨트롤 |
|---|---|---|
| litEnable | _OutlineEnableLighting | 밝기 영향(체크박스) |
| litColor | _OutlineLitColor(RGB + alpha) | 밝은 색 + 밝기 |
| litScale | _OutlineLitScale | 명암 대비 |
| litOffset | _OutlineLitOffset | 밝기 임계값 |
| litApplyTex | _OutlineLitApplyTex | 밝은 색×외곽선 텍스처(체크박스) |

### 기본은 무광

_OutlineLitColor.a 의 기본값이 0 이라 litF = 0, 결과는 「텍스처 × 외곽선 색」입니다.
**이 기능은 기본적으로 표현에 전혀 영향을 주지 않으며**, 「밝기」를 올려야 적용됩니다.

### 광원 방향

매 프레임 **메인 라이트의 실제 월드 위치**에서 방향을 계산해 uOutlineLitDir 로 전달합니다.
그래서 라이팅 프리셋(낮 / 저녁 / 밤)을 바꾸면 외곽선의 수광 방향도 따라갑니다.

### 노멀 출처

정점 셰이더에서 objectNormal 을 쓰며, three 의 skinnormal_vertex 이후 **이미 스키닝된 상태**이므로
`mat3(modelMatrix)` 를 곱해 월드 공간 노멀을 얻습니다.

---

## 외곽선 텍스처 (_OutlineTex / _OutlineWidthMask)

| 설정 | lilToon 파라미터 | 설명 |
|---|---|---|
| tex | _OutlineTex | 외곽선 텍스처, 텍스처로 외곽선을 채색 |
| widthMask | _OutlineWidthMask | 폭 마스크, **R 채널 사용** |

패널에서는 「파일 선택」버튼을 씁니다(로컬 이미지는 blob URL, JSON 설정에서는 상대 경로도 가능).

### 폭 마스크 사용법

    흰색(R=1) -> 최대 폭 외곽선
    검정(R=0) -> 외곽선 없음

**이것이 「부분적으로 외곽선을 없애는」 lilToon 의 정통 방법입니다.**
예를 들어 입과 머리가 같은 메시를 공유하면 skipPattern(메시 이름 기준)으로는 대응할 수 없는데,
이때 마스크 이미지를 주고 입 부분을 검게 칠하면 픽셀 단위로 정확히 처리됩니다.

텍스처는 URL 로 캐시되며, 로드가 끝나면 자동으로 외곽선을 다시 적용합니다(수동 새로고침 불필요).
로드 실패 시 `[outline] 贴图加载失败：...` 를 출력합니다(warn 레벨, 항상 보임).

로드 실패 시 `[outline] 贴图加载失败：...` 를 출력합니다(warn 레벨, 항상 보임).

---

## 상세 로그 스위치

HUD 의 **상세 로그** 체크박스는 localStorage 에 저장되어 새로고침 후에도 유지됩니다.
window.__ba3dDebugUI 를 제어하며, 세 가지 진단 출력에 영향을 줍니다:

| 출력 | 이 스위치 제어 여부 |
|---|---|
| 그림자 자가 점검 표(로드 시 console.table 한 장) | 예 |
| syncRenderUI 의 판정 입력 출력 | 예 |
| [lilPanel] 已打开，控件 N 个 | 예 |
| viewer.js 안의 console.debug 21 곳 | **아니오** — DevTools 의 Verbose 레벨이 제어 |

평상시 콘솔에는 한 줄만 남아야 합니다:

    [viewer] 불러오기完成 | 모델=... | 网格=11 | 외곽선=true

console.warn / console.error 는 항상 보입니다(진짜 예외일 때만 출력).

---

## 설정 패널 덮어쓰기와 내보내기

패널에서 바꿀 수 있는 것(셰이더 = lilToon 일 때):

    프리셋    lilToon 공식 프리셋 19 개
    단계      농도 / 1st 경계·전환 / 2nd 경계·전환 / 3rd 경계·전환 / 3rd 스위치 / 색
    Rim       강도 / 경계 / 전환 / 프레넬 / 밝은 방향 / 색 / 역광 색
    MatCap    강도 / 텍스처 파일
    발광      강도 / 색
    역광      강도 / 지향성
    외곽선    사용 / 폭 / 고정 폭 / 버텍스 컬러를 폭으로 / Z 오프셋 / 고정 폭 사용 /
              외곽선 색 / 불투명도 / 밝은 색 / 밝기 / 명암 대비 / 밝기 임계값 /
              외곽선 텍스처 / 폭 마스크 / 밝기 영향 / 밝은 색×텍스처 / Cull 모드 / 건너뛸 파츠

**외곽선의 16 개 설정 필드 모두 컨트롤이 있습니다.**

HUD 의 **[JSON 내보내기]** 는 기본값과 다른 항목만 담은 설정을 생성합니다. 외곽선 파라미터는 lilToon.outline 아래에 있습니다.
내보내기는 재귀 diff 를 쓰므로 기본값과 같은 필드는 생략됩니다.

---

## 외곽선 확장 방향 텍스처 (_OutlineVectorTex)

텍스처로 외곽선의 확장 방향을 덮어씁니다(수작업 외곽선).

| 설정 | lilToon 파라미터 | 패널 컨트롤 |
|---|---|---|
| vectorTex | _OutlineVectorTex | 확장 방향(파일 선택) |
| vectorScale | _OutlineVectorScale | 방향 강도(-10 ~ 10) |
| vectorUVMode | _OutlineVectorUVMode | 방향 UV(UV0 ~ UV3) |

텍스처는 **탄젠트 공간** 노멀로 해석한 뒤 TBN 으로 오브젝트 공간으로 변환합니다(`lil_common_functions.hlsl:272`).

### Unity 와의 차이 (중요)

three 의 MeshBasicMaterial 은 지오메트리에 tangent 속성이 있을 때만 objectTangent 가 있습니다.
따라서:

    #ifdef USE_TANGENT   → 실제 TBN, Unity 와 일치
    #else                → 「노멀 + 임의 직교축」으로 근사, Unity 와 차이 발생

이 fallback 은 three 의 지오메트리 데이터 제약이며 우회할 수 없습니다.

---

## 외곽선 수광의 그림자 수신 (_OutlineLitShadowReceive)

외곽선이 밝아질 때 메인 라이트의 그림자에 가려지는지 여부.

| 설정 | lilToon 파라미터 | 패널 컨트롤 |
|---|---|---|
| litShadowReceive | _OutlineLitShadowReceive | 밝은 부분 그림자 받기(체크박스) |

### 왜 직접 계산하는가

lilToon 에서는 그냥 `outlineLitFactor *= fd.attenuation`(조명 감쇠 곱)입니다.
그런데 three 에서 MeshBasicMaterial 은 **그림자 데이터를 얻을 수 없습니다**:

    three 는 materialProperties.needsLights 가 참일 때만
    directionalShadowMap / directionalShadowMatrix 를 설정하며(three.module.js:30062~30088),
    materialNeedsLights() 의 화이트리스트에 MeshBasicMaterial 이 없습니다.

실측(프로브 로그): 외곽선 머티리얼에서 directionalShadowMatrix 는 항상 존재하지 않고,
vDirectionalShadowCoord 는 전부 0, getShadowMask() 는 항상 1 을 반환합니다.

그래서 **직접 계산**으로 바꿨습니다:

    매 프레임(updateLilOutlineCamera) keyLight.shadow 에서:
      biasM = 0.5 오프셋 + 0.5 스케일 행렬 (NDC 를 텍스처 공간 [0,1] 로)
      uOutlineShadowMatrix = biasM × shadow.camera.projectionMatrix × matrixWorldInverse
      uOutlineShadowMap    = keyLight.shadow.map.texture
      uOutlineShadowBias   = keyLight.shadow.bias
      uOutlineShadowMapSize= keyLight.shadow.mapSize

    정점: vOutlineShadowCoord = uOutlineShadowMatrix × modelMatrix × vec4(transformed, 1.0)
    프래그먼트: ba3dOutlineShadow() 가 PCF 4 회 샘플(unpackRGBAToDepth + step)
              1 = 수광, 0 = 완전 그림자 반환 후 ba3dLitF *= 그 값

three 의 머티리얼 시스템을 완전히 우회하며 어떤 three 그림자 chunk 에도 의존하지 않습니다.

### 패널의 진단 스위치

「그림자 마스크 미리보기(진단)」= litShadowDebug, 동작은 litShadowReceive 와 같지만
조사용입니다(그림자 마스크를 강제 적용해 파이프라인이 연결됐는지 보기 쉽게).

---

## 외곽선 색의 추가 곱셈 스위치

lilCfg.outline.shaderColorMult(기본 false):

    false → 외곽선 색은 mat.color 로 한 번만 곱함(정상, 밝은 색이 깨끗)
    true  → 셰이더에서 uOutlineColor 를 한 번 더 곱함(밝은 색이 외곽선 색으로 어두워짐, 예전 동작 대조용)

패널의 「셰이더에서 외곽선 색을 한 번 더 곱함」체크박스에 해당합니다.

---

## 머티리얼별 설정 (lilToonByMaterial)

lilToon 의 프리셋은 원래 **머티리얼 슬롯마다 하나씩** 고르는 것(피부는 Skin-*, 머리는 Hair-*)이라
설정도 머티리얼별로 나뉩니다. 설계는 LILTOON1.x.md 9 장 참고.

### 데이터 구조

    lilCfg                      전역 기본(패널에서 「전체(기본)」을 고를 때 이것을 수정)
    lilCfgByMaterial = {        머티리얼 이름별 덮어쓰기(희소, 바뀐 키만 저장)
      'CH0155_Hair_Toon': { shadowBorder: 0.05, rim: { blend: 1 } },
      'CH0155_Milk_Toon': { matcap: { url: 'blob:...' } },
    }

### 적용 방식

    function lilCfgFor(mat) {
      const nm = mat && mat.name;
      if (!nm || !lilCfgByMaterial[nm]) return lilCfg;
      return mergeLilCfg(lilCfg, lilCfgByMaterial[nm]);
    }

mergeLilCfg 는 **한 단계 깊은 병합**(outline / rim / matcap 같은 중첩 객체는 필드 단위로 병합)하고
나머지는 그대로 덮어씁니다.

### 적용 지점

    patchToonMaterial(mat) 안에서:
      const __cfgM = lilCfgFor(mat);
      celGradientGLSL(__cfgM, celCfgFor(mat))     // 단계
      lilShaderGLSL(__cfgM)                       // Rim / MatCap / 발광 / 역광
      resolveMatCapTexture(__cfgM.matcap.url)     // MatCap 텍스처

    applyLilOutline() 에서는 메시의 머티리얼 이름으로 외곽선 설정을 해석(캐시 사용):
      const o = _mn0 ? resolveFor(_mn0) : oGlobal;

### cacheKey (핵심)

    mat.customProgramCacheKey = () =>
      'ba3d-cel:' + celProgramVersion + ':' + shaderMode + ':' + (mat.name || '')
      + ':v' + lilMaterialVersion;

함정 두 가지:
  ① **머티리얼 이름**을 반드시 포함해야 합니다. 그렇지 않으면 서로 다른 머티리얼의 프로그램이 재사용되어 파라미터가 섞입니다.
  ② lilMaterialVersion 을 **무조건** 포함해야 합니다.
     한때 「덮어쓰기가 있을 때만 버전을 붙인다」로 작성했는데, 「덮어쓰기 유무」는 패치하는 순간의 판정이고
     나중에 어떤 머티리얼에 덮어쓰기를 추가하면 key 가 그대로라 → three 가 재컴파일도 재생성도 하지 않아
     「설정했는데 반응이 없다」로 나타납니다.

### 패널

    [● lilToon 파라미터]                    ← 제목 표시줄(드래그 손잡이)
    ─────────────────
    머티리얼 [ 전체(기본) ▾ ]  [덮어쓰기 지우기]

    머티리얼  [ 전체(기본) ▾ ]  [덮어쓰기 지우기]
               「전체」를 고르면 전역 수정; 특정 머티리얼을 고르면 그것만 덮어씀(● = 덮어쓰기 있음, 패널은 병합 후 값 표시)
    프리셋  [ (적용 안 함 ▾) ]                ← 위에서 선택한 머티리얼에 적용

패널의 40 여 곳 호출은 얇은 래퍼를 통해 현재 머티리얼을 자동으로 넘깁니다:

    const lilG  = (m) => viewer.getLilConfig(m === undefined ? lilCurMat() : m);
    const lilS  = (p, m) => viewer.setLilConfig(p, m === undefined ? lilCurMat() : m);
    const lilOG = (m) => viewer.getLilOutline(m === undefined ? lilCurMat() : m);
    const lilOS = (p, m) => viewer.setLilOutline(p, m === undefined ? lilCurMat() : m);

⚠️ 이 4 개 API 이름을 전역 치환하면 **래퍼 함수 자신도 치환되어** 자기 재귀가 됩니다
   (같은 함정을 lilApplyPreset 에서 또 겪었습니다). 수정 후에는 정의 자체를 확인하세요.

⚠️ lilCurMat() 은 window.__ba3dLilMat 로 폴백해야 합니다:
   buildLilPanel() 이 먼저 lilPanel.innerHTML = '' 로 패널을 비우므로,
   그 시점에는 선택기 요소가 아직 재생성되지 않아 DOM 만 보면 「전역」으로 읽힙니다.

### API

    viewer.getLilConfig(matName)              // 병합 후 값
    viewer.setLilConfig(partial, matName)     // 전역 또는 특정 머티리얼에 기록
    viewer.getLilOutline(matName)
    viewer.setLilOutline(o, matName)
    viewer.applyLilPreset(name, matName)
    viewer.getLilMaterials()                  // 모델의 머티리얼 이름 목록
    viewer.getLilCfgByMaterial() / setLilCfgByMaterial(obj)
    viewer.clearLilMaterialOverride(matName)

### 내보내기

    {
      "lilToon": { /* 전역 기본 */ },
      "lilToonByMaterial": { "CH0155_Hair_Toon": { "shadowBorder": 0.05 } }
    }

내보내기는 여전히 기본값 기준 재귀 diff 로 바뀐 항목만 기록합니다.

### 머티리얼별 덮어쓰기 범위 (전부 지원)

    그림자 단계(농도 / 층별 경계·전환 / 층별 색 / 3 층 스위치)
    Rim(강도 / 경계 / 전환 / 프레넬 / 색 / 역광 색)
    MatCap(강도 / 경계 / **텍스처**)
    발광(강도 / 색)
    역광(강도 / 지향성)
    외곽선 20 개 파라미터(외곽선 텍스처 / 폭 마스크 / 확장 방향 포함)

MatCap 텍스처는 예전에 전역 한 장(lilMatCapTex 단일 변수)뿐이었는데, 이제
resolveMatCapTexture 가 URL 별 캐시 + 머티리얼별 uniform 으로 처리합니다.

---

## 플로팅 패널: 제목 표시줄과 드래그

세 패널(#lilPanel / #exportPanel / #partsPanel)은 .lp 요소이고, 사용자 모델(#upload)은 별도 컨테이너입니다. 각각 제목 표시줄이 있습니다:

    [● lilToon 파라미터]        ← 제목이 그것을 여는 버튼 문구와 동일
    [● JSON 내보내기]
    [● 파츠]
    [● 사용자 모델 (로컬 파일 · 서버로 전송되지 않습니다)]   ← .u-title 사용

### 드래그

제목 표시줄을 잡고 패널을 끕니다. 요점:

  · 리스너는 **패널 자체**에(이벤트 위임), 제목 요소에 달지 않습니다
    —— lilToon 패널은 열 때/프리셋 변경 때마다 innerHTML = '' 로 재생성되므로 제목에 달면 무효가 됩니다.
  · 손잡이 인식 순서: 지정 선택자 > .lp-title > .u-title > h4
  · 패널은 원래 right:16px + top:16px 로 배치되며, 드래그 시 left/top 으로 전환합니다.
  · 창 밖으로 나가면 클램프합니다(`Math.max(4, ...)` / `Math.min(innerWidth - w - 4, ...)`).
  · 창 resize 후 패널이 뷰포트 밖이면 자동으로 오른쪽 정렬로 되돌립니다.

### 제목 표시줄 스타일 통일

.lp-title 과 #upload .u-title 은 같은 시각 규칙을 씁니다:

    파란 점(7px, #3d6fe0) + 12.5px / 600 / #c3ccdd + 하단 구분선 rgba(255,255,255,.09)
    cursor: move(드래그 중 grabbing)

.lp-title 은 추가로 position: sticky(스크롤 시 상단 고정)와 음수 마진(패널 상단에 딱 붙임)이 있습니다.

### 패널 폭

    .lp        400px(원래 320px), overflow-x: hidden(가로 스크롤 없음)
    .lp.parts  340px(원래 300px)

---

## lilToon 그림자 시스템 (1 단계 범위 초과 + 표현 튜닝)

### 파라미터 총표

| 설정 | lilToon 파라미터 | 설명 |
|---|---|---|
| shadowStrength | _ShadowStrength | 단계 농도, **범위 0~2**, >1 은 mix 외삽으로 더 어둡게 |
| shadowBorder / shadowBlur | _ShadowBorder / _ShadowBlur | 1 층 경계 / 전환 |
| shadow2ndBorder / shadow2ndBlur | _Shadow2ndBorder / _Shadow2ndBlur | 2 층 |
| shadow3rdBorder / shadow3rdBlur | _Shadow3rdBorder / _Shadow3rdBlur | 3 층 |
| shadowBorderRange | _ShadowBorderRange | 전환 구간 아래쪽만 그림자 쪽으로 밀기(`lil_common_functions.hlsl:33`) |
| shadowMainStrength | _ShadowMainStrength | 그림자 쪽에 메인 컬러를 한 번 더 곱함(`lil_common_frag.hlsl:1024`) |
| shadowReceive / shadow2ndReceive / shadow3rdReceive | _ShadowReceive 등 | 층마다 **실시간 투영 그림자**를 받을지(`:872-876`) |
| shadowColor / shadow2ndColor / shadow3rdColor | _ShadowColor 등 | 층별 색 **+ alpha** |
| shadowAmbient | (three 전용, lilToon 에 없음) | 그림자 영역에 환경광을 얼마나 남길지 |

### ★ 3 층 색의 alpha 가 곧 「이 층의 세기」

lilToon: `lns.y = _Shadow2ndColor.a - lns.y * _Shadow2ndColor.a`(`:1013`)
따라서 alpha = 0 은 **그 층을 끔**을 뜻합니다.

⚠️ 겪은 함정: 첫 버전은 RGB 만 취하고 alpha 를 무시해서
     `"shadow2ndColor": [0, 0, 0, 0]`(공식 프리셋에서 「2 층 끔」을 뜻함)
   이 「순검정 최대 강도」로 해석되었고, 프리셋 19 개 중 11 개가 이 형태라 전부 어둡게 나왔습니다.

현재 구현:
    outCol = mix( outCol, shadowColor, s1 * alpha1 );
    outCol = mix( outCol, shadow2ndColor, s2 * alpha2 );
    outCol = mix( outCol, shadow3rdColor, s3 * alpha3 );

패널에는 행마다 컨트롤 세 개: 색 / alpha 슬라이더 / alpha 숫자 입력.

### ★ shadowAmbient(three 전용) —— 「환경광 바닥」

three 의 toon 은 환경광을 **단계 밖에서 따로** 더합니다:

    irradiance  = ambient + lightProbe + 단계 * directLight

반면 lilToon 의 indirectCol 은 **전체 대체**(환경광 포함)입니다.
그래서 우리 그림자에는 바닥이 생깁니다: 빛이 셀수록 수광면이 밝아지는데 그림자 영역은 따라가지 않아
상대 대비가 희석되고, 「빛이 강할 때 그림자가 오히려 덜 보인다」로 나타납니다.

해법: `lights_fragment_begin` **이후**(`lights_fragment_end` 이전)

    reflectedLight.indirectDiffuse *= mix( shadowAmbient, 1.0, ba3dShadowMaskG );

    shadowAmbient = 1.0 → 감쇠 없음(기본, 동작 불변)
    shadowAmbient = 0.0 → 그림자 영역에 환경광 전무(가장 깊음)

cel 모드(그림자 농도=0 / 얼굴=0)에 가까운 표현을 원하면 0~0.2 로 두세요.

### ★ 두 투영 경로의 차이 (_ShadowReceive 가 첫 버전에서 왜 무효였는가)

lilToon(Unity): 투영이 **단계 값에 접혀 들어가고** 직사광이 따로 곱해지지 않습니다:

    calculatedShadow = saturate( fd.attenuation + distance( fd.L, fd.origL ) );
    lns.x *= lerp( 1.0, calculatedShadow, _ShadowReceive );

three: 투영이 `lights_fragment_begin` 에서 **직사광을 바로 깎아냅니다**:

    directLight.color *= getShadow( directionalShadowMap[i], ... );

두 경로는 서로 무관하므로 그림자를 t1/t2/t3 에만 곱하는 것은 소용없습니다.

현재 방식: lilToon 모드에서 three 의 그 경로를 **무력화**합니다

    getShadow(...)  →  ( getShadow(...) * 0.0 + 1.0 )  =  1.0

투영이 **오직 ba3dShadowMaskG 를 통해** 단계로 들어가게 합니다.

### 3 층 중첩의 동작 (버그 아님)

3 층은 **순차 중첩**이며 뒤 층이 앞 층을 덮습니다:

    outCol = mix( outCol, 1 층 색, s1 );
    outCol = mix( outCol, 2 층 색, s2 );   // 덮음
    outCol = mix( outCol, 3 층 색, s3 );   // 다시 덮음

3 층 경계 기본값은 0.1 / 0.15 / 0.25 이며 뒤 층이 앞 층을 **감쌉니다**.
그래서 1 층의 _ShadowReceive 만 조정하면 2·3 층에 덮여 효과가 보이지 않습니다.
투영 그림자를 전체로 끄려면 셋 다 0 으로 해야 합니다.

### 농도는 1 을 넘을 수 있음

mix 의 t 가 1 을 넘으면 **외삽**입니다:

    mix( vec3(1.0), outCol, 1.5 ) = 1 + 1.5 * ( outCol - 1 )   ← 그림자 색보다 더 어둡게

위의 「환경광 바닥」을 우회하기 위한 것이며, 슬라이더 범위는 0~2 입니다.

### 「(기본값으로)」프리셋

### 「(기본값으로)」프리셋

프리셋 드롭다운의 특수 항목:

    「전체(기본)」선택 → lilCfg 전체를 LIL_DEFAULTS 로 복원
    특정 머티리얼 선택 → 그 머티리얼의 덮어쓰기 삭제(전역 기본으로 복귀)

---

## 디졸브 (2 단계)

### 2 단계 네 항목 중 셋은 이미 완료되어 있었음

| # | 항목 | 상태 |
|---|---|---|
| 5 | 외곽선 업그레이드(자체 역확장 + 폭 텍스처 + 버텍스 컬러 제어) | 이미 완료, `applyLilOutline()` |
| 6 | 장식 레이어 블렌드 모드(Normal/Add/Screen/Multiply) | 이미 완료, `ba3dBlend()` |
| 7 | Backlight / 역광 | 이미 완료 |
| 8 | 디졸브 | **이번 차수 구현** |

(6 에 대해: lilToon 1.3.7 의 `_MainColor` 자체에는 블렌드 모드가 없습니다.
  블렌드 모드는 장식 레이어에만 있고, 그것들은 이미 구현됨)

### 파라미터

| 설정 | lilToon | 설명 |
|---|---|---|
| dissolve.mode | _디졸브Params.r | 0=끔 1=텍스처 임계값 2=UV 3=오브젝트 공간 |
| dissolve.linear | _디졸브Params.g | 1=선형/평면 0=원형/구형 |
| dissolve.threshold | _디졸브Params.b | 임계값 |
| dissolve.softness | _디졸브Params.a | 가장자리 페더 폭(폴백 0.001, 아니면 0 나눗셈) |
| dissolve.pos | _디졸브Pos | 선형일 때 **방향**, 원형/구형일 때 **중심점**, w 는 모드 2 의 회전만 |
| dissolve.color | _디졸브Color.rgb | 가장자리 색(**가산**, `lil_common_frag.hlsl:1841`) |
| dissolve.maskTex | _디졸브Mask | 모드 1 의 마스크, .r 샘플 |
| dissolve.noiseTex / noiseStrength | _디졸브NoiseMask / _디졸브NoiseStrength | 노이즈 변동 |

### 주입 지점 (두 곳, lilToon 과 동일)

    (1) #include <alphatest_fragment> 이전
        마스크 계산 → diffuseColor.a *= maskVal
        그리고 가장자리 인자를 전역 ba3d디졸브Edge 에 저장
    (2) #include <dithering_fragment>
        gl_FragColor.rgb += _디졸브Color.rgb * ba3d디졸브Edge;

(확인됨: toon 프래그먼트에서 alphatest 는 37 행, dithering 은 53 행.
  opaque_fragment 이후에야 gl_FragColor 가 존재하므로 (2) 의 위치가 맞음)

### 좌표 정규화 (우리가 lilToon 대비 변경한 것)

lilToon 은 `_DissolvePos` 의 원래 오브젝트 공간 좌표를 그대로 씁니다. Unity 에서 캐릭터가 1~2 단위 높이이기 때문입니다.
이 뷰어가 로드하는 모델은 스케일이 제각각이라 정규화합니다:

    mode 3 의 평가 좌표 = ( vBa3dPositionWS - center ) * vec3( 1/sizeX, 1/sizeY, 1/sizeZ )

  · **축별** 정규화(최장변만이 아님), 모델이 단위 정육면체에 매핑됩니다.
    최장변만 쓰면 키 큰 캐릭터가 x/z 에서 ±0.15 만 차지해 구형 껍질이 닿지 않습니다.
  · 그래서 임계값 의미: 평면 ±0.5, 구형 0 ~ 0.87, 위치 (0,0,0) 이 곧 모델 중심.

### ⚠️ lilToon 의 모드 2 선형에는 구현이 두 벌 있음

    노이즈 없음(`lil_common_functions.hlsl:628`) → lilRotateUV( uv, _디졸브Pos.w ).x
    노이즈 있음(`:675`)                          → dot( uv, normalize(_디졸브Pos.xy) ) + noise

전자는 회전각 하나만 쓰고 xy 는 전혀 쓰지 않아 뷰어에서 추측할 수 없습니다.
후자는 원시 uv 를 dot 해서 방향이 음수면 결과가 [-1, 0] 에 떨어져 임계값 > 0 이 영원히 성립하지 않아
모델 전체가 사라집니다(실제로 겪은 함정).

**우리는 하나로 통일**:

    ba3d디졸브Alpha = dot( vBa3dUv - 0.5, normalize(pos.xy) ) + 0.5;   // 범위 0~1

중앙 정렬 후 임계값 0~1 이 텍스처 전체를 정확히 훑으며, 의미가 모드 3 의 평면과 일치합니다.

### ★ 이 기능에서 여섯 번 넘어졌다 (모두 「두 곳의 약속 불일치」유형)

1. **비동기 텍스처 vs 동기 컴파일**
   GLSL 의 `texture2D( ba3dDissolveMask, ... )` 는 동기로 생성됩니다.
   그런데 `uniform sampler2D ba3dDissolveMask;` 는 원래 텍스처가 **로드 성공**한 뒤에만 선언되었습니다.
   첫 프레임에는 반드시 null → undeclared identifier → 컴파일 실패.
   해결: uniform 을 **무조건 선언**하고 자리표시자 텍스처로 대체
     마스크 자리표시 = 순백(.r=1.0, 「마스크 미적용」과 동등, lilToon 의 마스크 비활성과 일치)
     노이즈 자리표시 = 중간 회색(.r=0.5, 0.5 를 빼면 0, 「노이즈 없음」과 동등)

2. **alphaTest 를 한 단계 늦게 설정**
   원래 `mat.onBeforeCompile` 콜백에서 대입했는데 그때는 WebGLProgram 이 이미 컴파일 중이었습니다.
   `USE_ALPHATEST` 매크로가 이미 정해져 `alphatest_fragment` 의 discard 가 **효력 없음**.
   증상: 「모델이 실루엣이 됨」 — alpha 는 작아지지만 버려지지 않고, 불투명 렌더에서는 alpha 가 무시됨.
   해결: `patchToonMaterial` 시작(콜백 이전)으로 옮기고 `mat.needsUpdate = true`
   추가로 `syncDissolveAlphaTest()` 를 매 `applyLilOutline()` 에 걸어 둠
     (머티리얼 재사용으로 patchToonMaterial 이 다시 돌지 않아 alphaTest 가 낡는 것 방지)

3. **외곽선 껍질도 함께 녹아야 함**
   디졸브는 지오메트리 자체에만 작용하고 외곽선은 **별도 역확장 메시**라 범위 밖입니다.
   그래서 본체가 녹은 뒤 어두운 윤곽이 남습니다.
   lilToon 은 외곽선이 같은 shader 를 쓰므로 함께 녹습니다.
   해결: `makeLilOutlineMaterial(o, srcMat)` 에서 같은 주입 수행.
   ⚠️ 반드시 수광 블록 **이전**에 주입해야 하며, 그 블록이 `'#include <common>'` 구간 전체를 교체합니다.

4. **lilToon 모드의 외곽선 양보**
   `outlineActive()` 는 원래 `lilCfg.outline.enable` 이 참일 때만 양보했습니다.
   그래서 「lilToon 으로 전환했지만 lilToon 외곽선은 아직 안 켠」구간에서
   cel 의 OutlineEffect 가 계속 그려지는데, 그것은 **후처리식**이라 디졸브에 전혀 참여하지 않습니다.
   → 다 녹아도 캐릭터 실루엣이 하나 남음(오래 헤맨 부분)
   해결: `if ( shaderActive() && shaderMode === 'lilToon' ) return false;` 무조건 양보.
        그리고 `applyShader('lilToon')` 시 cel 의 외곽선 파라미터를 자동 환산:
          width = thickness * 100 (ba3dOW = _OutlineWidth * 0.01 이므로)
          color / alpha 는 그대로 복사.

5. **TDZ: OUTLINE_DEFAULT 가 applyShader 이후에 정의됨**
   applyShader 안에서 참조해 초기화 시 ReferenceError.
   해결: 선언 블록을 applyShader 이전으로 이동.
   (이 프로젝트에서 3 번째 TDZ, 앞의 두 번은 hex / celShadow.
     공통점: **「초기에 실행되는 함수」가 파일 아래쪽에 정의된 const 를 참조**)

6. **오브젝트 공간 vs 월드 공간**
   바운딩 박스는 `Box3().setFromObject()`(**월드 공간**)
   셰이더에서는 `position`(**오브젝트 공간**)
   둘이 수백 배 차이 날 수 있어 「중심 빼기」가 거의 무효가 되어 정규화가 전부 틀어짐.
   콘솔의 k/center 는 정상으로 보이는데 셰이더에 넣으면 틀림.
   해결: `vBa3dPositionWS = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz` 추가
       (`project_vertex` 이후 주입, 이때 transformed 는 스키닝과 형태 타깃 완료)
       모드 3 은 이것을 쓰고 바운딩 박스와 공간을 통일.

### 가장자리 색은 「가산」

lilToon 에서 `_DissolveColor` 는 발광합니다:

    fd.col.rgb += _디졸브Color.rgb * dissolveAlpha;
    fd.emissionColor += _디졸브Color.rgb * dissolveAlpha;

그래서 기본 순백이면 디졸브 경계가 **밝아집니다** — 의도된 효과입니다.
흰 테두리가 싫으면 「가장자리 색」을 검정으로 두세요.
(기본 페더 폭도 0.1 → 0.03 으로 낮췄습니다. 그렇지 않으면 가장자리 띠가 너무 넓어 모델 전체가 하얘짐)

### 진단

**새로운 파라미터 조합**이 나올 때마다 한 줄 출력(같은 조합은 한 번만, 상세 로그 스위치와 무관):

    [dissolve] 生成 GLSL：모드=3 线性=1 임계값=0.200 羽化=0.030 위치/방향=(0,-1,0,0) 遮罩=无 噪声=无
    [dissolve] 世界空间归一化：k=(1.37118, 0.62073, 1.30632) 尺寸=(0.729, 1.611, 0.766) center=(-0.20, 0.87, 0.02)

이 두 줄로 「컴파일된 실제 파라미터」와 「정규화에 쓴 좌표계」를 바로 볼 수 있어, 이런 문제 조사에 매우 유용합니다.

### 검증된 동작

    모드 3, 선형 1, 위치 (0,-1,0,0), 임계값 0.2 → 수평 단면으로 하반신 유지.
    모드 3, 선형 1, 위치 (1,0,0,0), 임계값 0   → 왼쪽 절반 유지.
    모드 3, 선형 0, 위치 (0,0,0,0), 임계값 0→0.6 → 구형 단면이 점차 사라짐.
    모드 1(마스크 텍스처) / 모드 2(UV) 는 정상 동작.

---

## lilToon 1.3.7 파라미터 대조 (미구현 목록)

> 데이터 출처: `lilToon/Shader/lts.shader` 의 Properties 구간, 총 **182 개 파라미터**.
> 아래 표는 기능별 그룹이며 ✅ = 구현되어 패널에 연결, — = 미구현.
>
> ⚠️ 이 목록은 **소스에서 diff 한 것**이며 더 이상 기억으로 판단하지 않습니다.
>    (이전에 「1 단계에 마스크류 파라미터가 남았다」고 구두로 틀리게 말한 적이 있는데,
>      1/2 단계 계획에 그런 파라미터는 애초에 없었습니다. LILTOON1.x.md 참고)

> ⚠️ 이 표의 데이터 출처는 **1.3.7** 의 `lts.shader` 이고, 2.3.4 기준선으로 옮긴 뒤 한 묶음을 더 구현했습니다
>    (2nd/3rd 메인 레이어, 레이어 디졸브, 거리 페이드, 노멀 맵 경로, MatCap Lod 와 커스텀 노멀).
>    따라서 일부 행의 상태 열이 낡았을 수 있습니다 — UI 에서 실제 조정 가능 여부를 기준으로 보세요.

### 그림자 Shadow (22 중 15 구현)

| lilToon 파라미터 | 상태 | 우리 키 |
|---|---|---|
| `_ShadowStrength` | ✅ | `shadowStrength` |
| `_ShadowColor` | ✅ | `shadowColor` |
| `_ShadowNormalStrength` | — |  |
| `_ShadowBorder` | ✅ | `shadowBorder` |
| `_ShadowBlur` | ✅ | `shadowBlur` |

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

### Rim 림라이트 (12 중 11 구현)

| lilToon 파라미터 | 상태 | 우리 키 |
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

### MatCap (18 중 6 구현)

| lilToon 파라미터 | 상태 | 우리 키 |
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

### 발광 Emission (14 중 3 구현)

| lilToon 파라미터 | 상태 | 우리 키 |
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

### 역광 Backlight (6 중 4 구현)

| lilToon 파라미터 | 상태 | 우리 키 |
|---|---|---|
| `_BacklightMainStrength` | — |  |
| `_BacklightNormalStrength` | ✅ | `backlight.normalStrength` |
| `_BacklightBorder` | ✅ | `backlight.border` |
| `_BacklightBlur` | ✅ | `backlight.blur` |
| `_BacklightDirectivity` | ✅ | `backlight.directivity` |
| `_BacklightViewStrength` | ✅ | `backlight.viewStrength` |

### 디졸브 (3 중 3 구현)

| lilToon 파라미터 | 상태 | 우리 키 |
|---|---|---|
| `_DissolveMask` | ✅ | `dissolve.maskTex` |
| `_DissolveNoiseMask` | ✅ | `dissolve.noiseTex` |
| `_DissolveNoiseStrength` | ✅ | `dissolve.noiseStrength` |

### 정리

    위 여섯 묶음 총 75 개 파라미터 중 42 개 구현(56 %)

### 미구현 주요 범주 (왜 하지 않는가)

| 범주 | 예 | 이유 |
|---|---|---|
| **마스크류 텍스처** | `_ShadowBlurMask` `_ShadowBorderMask` `_RimBlendMask` `_MatCapBlendMask` `_EmissionBlendMask` `_BacklightBlendMask` | 추가 UV 변환과 샘플링이 필요하고 효과 대비 작업량이 큼, **어떤 단계 계획에도 없었음** |
| **그림자 색 텍스처** | `_ShadowColorTex` `_Shadow2ndColorTex` | 위와 같은 텍스처류 |
| **AO 오프셋** | `_ShadowAOShift` `_ShadowAOShift2` | AO Map 지원이 필요하고 three 의 toon 경로는 AO 를 받지 않음 |
| **그림자 노멀 강도** | `_ShadowNormalStrength` `_Shadow2ndNormalStrength` `_Shadow3rdNormalStrength` | 패널에 슬라이더는 있지만 three 의 명암 단계 계산을 대체해야 적용됨(다른 `*NormalStrength` 는 구현됨) |
| **2nd / 3rd 전체** | `_Main2nd*` `_Main3rd*` `_MatCap2nd*` `_Rim2nd*` `_Emission2nd*` | ✅ 구현됨(레이어 디졸브 / 거리 페이드 / 노멀 경로 포함); `_Emission2ndBlink` 깜빡임만 미구현 |
| **버텍스 컬러/UV 고급 변환** | `*_ScrollRotate` `*_UVMode` `*_Parallax*` | 뷰어에서 쓸 일 없음 |
| **명확히 안 함** | Glitter, AudioLink, Fur/Gem/Tessellation, Lightmap, 스크린 공간 그림자, VRC Light Volumes | LILTOON1.x.md 참고 |

### 우리가 **추가로** 한 것 (lilToon 에 없음)

| 우리 키 | 설명 |
|---|---|
| `shadowAmbient` | 그림자 영역에 환경광을 얼마나 남길지 — three 가 환경광을 단계 밖에서 따로 더하는 문제 보완 |
| `outline.litBlur`(`litShadowBlur`) | 외곽선 수광 그림자의 자체 계산 PCF 블러 반경 |
| `outline.vectorTex` / `vectorScale` / `vectorUVMode` | 외곽선 확장 방향 텍스처 |
| `outline.skipPattern` | 메시 이름으로 외곽선 건너뛰기(얇은 판 깜빡임 방지) |
| `outline.fixWidthMode` | 화면 두께 일정 모드(lilToon 의 fixWidth 는 일반 시거리에서 무효) |

---

## 3 단계 (2nd/3rd 레이어 + Stencil)

### 완료 상황

| # | 항목 | 상태 |
|---|---|---|
| 9 | 2nd / 3rd 메인 레이어 | ✅ 완료(각각의 blendMask 포함) |
| 9 | MatCap 2nd | ✅ 완료 |
| 9 | 2nd / 3rd ノーマルマップ | ⏸ **의도적 보류**(노멀 맵 경로를 먼저 만들어야 하며 비용 최대) |
| 10 | Stencil | ✅ 완료(본체 + 외곽선, 각 7 개 파라미터) |
| — | 마스크류 텍스처(BlendMask) | ✅ 완료(3 개) |
| — | 외곽선 텍스처 UV 변환 / 스크롤 / HSV | ✅ 완료 |

### 메인 컬러 레이어 2nd / 3rd (_Main2nd* / _Main3rd*)

**⇒ 「노멀 맵을 하나 더 추가」가 아니라 기본색을 한 층 더 추가**합니다(`lil_common_frag.hlsl:671 / :757`)

| 설정 | lilToon | 설명 |
|---|---|---|
| use | _UseMain2ndTex | 스위치 |
| color | _Color2nd | 색 + **alpha**(이 레이어의 불투명도) |
| tex | _Main2ndTex | 텍스처 |
| uvMode | _Main2ndTex_UVMode | 0=uv0, 4=시점 구면(1/2/3 은 uv1~3 필요, 미지원) |
| blendMode | _Main2ndTexBlendMode | Normal / Add / Screen / Multiply |
| enableLighting | _Main2ndEnableLighting | **조명에 참여하는 비율**(아래 참고) |
| blendMask | _Main2ndBlendMask | **R 채널**을 이 레이어 alpha 에 곱함 |
| cull | _Main2ndTex_Cull | 0=양면 1=뒷면만 2=앞면만 |

#### ★ _Main2ndEnableLighting 은 스위치가 아니라 「이 레이어가 조명에 참여하는 비율」

`lil_pass_forward_normal.hlsl` 에서 **두 번 섞습니다**:

    :352(조명 **이전**)
        fd.col.rgb = lilBlendColor( fd.col.rgb, color2nd.rgb,
                                    color2nd.a * _Main2ndEnableLighting, _Main2ndTexBlendMode );
    :386(조명 **이후**)
        fd.col.rgb = lilBlendColor( fd.col.rgb, color2nd.rgb,
                                    color2nd.a - color2nd.a * _Main2ndEnableLighting, ... );

  ⇒ 1.0 = 완전히 조명을 받음(명암 단계의 영향, 피부의 일부처럼)
    0.0 = 전혀 조명을 받지 않음(원색 유지, 스티커/발광처럼)
    중간값은 비율대로 혼합.

그래서 우리 구현도 **두 곳에 주입**:
  · before → `#include <lights_fragment_begin>` **이전**
    (그때 normal 이 이미 선언되어 있고 diffuseColor.rgb 도 바꿀 수 있음)
  · after  → `#include <dithering_fragment>`
    **⚠️ 나중에 추가한 .replace 가 먼저 적용**되므로 3rd 를 먼저 추가하고 2nd 를 추가.
        그래야 최종 실행 순서가 2nd → 3rd(lilToon 과 동일)

중간 결과는 전역 변수 두 개로 전달합니다: `vec4 ba3dColor2nd` / `vec4 ba3dColor3rd`.

#### ⚠️ 「컬링」에는 양면 렌더링이 필요

cull=1(뒷면만)은 **side=FrontSide** 머티리얼에서는 **프래그먼트가 영원히 없습니다**.

#### ⚠️ 「컬링」에는 양면 렌더링이 필요

cull=1(뒷면만)은 **side=FrontSide** 머티리얼에서 **프래그먼트가 영원히 없습니다**.
  뒷면은 래스터화 단계에서 컬링되고 프래그먼트의 gl_FrontFacing 은 항상 true.
  그래서 a 가 항상 0 이 되어 「겹침이 사라짐」 — 고장처럼 보입니다.
  cull=2(앞면만)는 전혀 변화가 없고 cull=0 과 같습니다.
⇒ 어느 한 레이어라도 컬링을 켜면 머티리얼을 DoubleSide 로 바꾸고, 끄면 복원.
   (`syncLayerDoubleSide()`, 매 `applyLilOutline()` 에 걸려 있음)

### MatCap 2nd (_MatCap2nd*)

파라미터는 1st 와 동형이며, 1st 에 완전판에만 있던 세 파라미터도 함께 보강했습니다.

⚠️ lilToon 의 MatCap 에는 **완전판**과 **lite 판** 두 가지가 있습니다:

    완전판(:1414-1436 / :1482-1504)
        float4 matCapColor = _MatCapColor;                    ← 틴트 있음
        matCapColor *= SAMPLE( _MatCapTex, matUV );
        matCapColor.rgb = lerp( rgb, rgb * fd.lightColor, _MatCapEnableLighting );
        matCapColor.a   = lerp( a, a * fd.shadowmix, _MatCapShadowMask );
        matCapColor.a   = fd.facing < ( _MatCapBackfaceMask - 1.0 ) ? 0.0 : a;   ← 뒷면 컬링
        matCapColor.rgb = lerp( rgb, rgb * fd.albedo, _MatCapMainStrength );     ← albedo 곱
        fd.col.rgb = lilBlendColor( ..., _MatCapBlend * a * mask, _MatCapBlendMode );

    lite 판(:1446)
        fd.col.rgb = lerp( fd.col.rgb,
                           _MatCapMul ? fd.col.rgb * matcap : fd.col.rgb + matcap,
                           fd.triMask.r );

우리는 **두 판 모두 지원**합니다: 기존 `mul` 스위치(lite 형식, 기본 꺼짐)를 유지하고,
color / backfaceMask / albedo 를 쓰는 mainStrength 를 보강했습니다.

공용 생성기: `lilMatCapGLSL( M, texUni, triCall, tag )`, 1st / 2nd 공유.

### 마스크류 텍스처(BlendMask) —— 단 3 개

⚠️ 처음에 「네 개의 장식 레이어 모두 있다」고 했는데 **틀렸습니다**. 소스를 하나씩 grep 한 결과:

| 파라미터 | lilToon 행 | 샘플링 | 상태 |
|---|---|---|---|
| _MatCapBlendMask | :1431 | `.rgb` → **채널별** 혼합 | ✅ |
| _MatCap2ndBlendMask | :1499 | 위와 동일 | ✅ |
| _EmissionBlendMask | :1715 | RGBA **전체 곱**(rgb 색조, a 강도) | ✅ |
| _Main2ndBlendMask | :697 | `.r` 을 alpha 에 곱 | ✅(메인 레이어에 구현) |
| _Main3rdBlendMask | :783 | 위와 동일 | ✅ |
| **_RimBlendMask** | — | **존재하지 않음**, Rim 은 `fd.triMask.g`(버텍스 컬러) 사용 | ✅ 오래전부터 있음 |
| **_BacklightBlendMask** | — | **존재하지 않음** | — |

#### ★ MatCap 의 마스크는 vec3 라서 ba3dBlend3 가 필요

    가중치 = _MatCapBlend * matCapColor.a * matCapMask      ← matCapMask 는 float3
    ⇒ mix( dstCol, outCol, srcA ) 의 srcA 도 vec3(채널별)

그래서 GLSL 에 vec3 alpha 판을 추가했습니다:

    vec3 ba3dBlend3( vec3 dstCol, vec3 srcCol, vec3 srcA, uint blendMode ) { ... }

마스크가 있으면 ba3dBlend3, 없으면 기존 ba3dBlend(float) — 오버헤드 0.

#### 텍스처 캐시

    resolveMaskTexture()  →  resolve디졸브Texture 재사용(**데이터 텍스처**, NoColorSpace)
    ⚠️ sRGB 를 타면 안 됩니다. 0~1 마스크 값이 gamma 로 왜곡되어 적용 영역이 전부 틀어집니다.
    ⚠️ 비동기 로드 시 null 이 반환되므로 uniform 을 **무조건 선언**하고 자리표시자로 대체.
       마스크 자리표시 = 순백(.r = 1.0, 「제한 없음」과 동등)

### 외곽선 텍스처의 UV 변환 / 스크롤 / HSV

새 파라미터 세 개(`lil_common_frag.hlsl:268-360`):

| 설정 | lilToon | 형식 |
|---|---|---|
| texST | _OutlineTex_ST | [tilingX, tilingY, offsetX, offsetY], 기본 [1,1,0,0] |
| texScrollRotate | _OutlineTex_ScrollRotate | [scrollX, scrollY, angle, angleSpeed], 기본 [0,0,0,0] |
| texHSVG | _OutlineTexHSVG | [색상 이동, 채도 배율, 명도 배율, gamma], 기본 [0,1,1,1] |

    lilCalcUV(`lil_common_functions.hlsl:436`):
        outuv = uv * ST.xy + ST.zw;
        outuv = lilRotateUV( outuv, SR.z + SR.w * _Time.y ) + frac( SR.xy * _Time.y );

    lilToneCorrection(`:328`): gamma → RGB→HSV → 조정 → HSV→RGB

**⇒ 세 값이 모두 기본이면 three 네이티브 `mat.map` 경로를 써서 오버헤드 0, 표현 불변**.
  기본이 아닐 때만 `mat.map` 을 비우고 프래그먼트에서 직접 샘플링합니다.
  시간은 `uBa3dTime` 을 쓰며 매 프레임 `updateLilOutlineCamera` 에서 갱신합니다.

(참고: `_OutlineOffsetFactor` / `_OutlineOffsetUnits` 는 1.3.7 의 hlsl 에서 **전혀 사용되지 않습니다**.
  남은 Properties 이며 할 일이 없습니다)

### Stencil (스텐실 버퍼)

lilToon 에는 **두 벌**이 있습니다(`lts.shader:535-541 / :566-572`):
본체 `_Stencil*`, 외곽선 `_OutlineStencil*`, 각 7 개.

#### ⚠️ 전제: renderer 가 스텐실 버퍼를 켜야 함

    const renderer = new THREE.WebGLRenderer({ ..., stencil: true });

three r160 기본값은 **false** 이고 스텐실 버퍼는 **context 생성 후 추가할 수 없습니다**.
이 항목을 바꾸지 않으면 Stencil 을 다 구현해도 「조정해도 반응 없음」으로 조용히 무효가 됩니다.

#### Unity 열거형 → three 상수 (두 번호 체계가 완전히 달라 직결 불가)

    Unity CompareFunction          three StencilFunc
      Disabled = 0                   Never = 512
      Never = 1                      Less = 513
      Less = 2                       Equal = 514
      Equal = 3                      LessEqual = 515
      LessEqual = 4          →       Greater = 516
      Greater = 5                    NotEqual = 517
      NotEqual = 6                   GreaterEqual = 518
      GreaterEqual = 7               Always = 519
      Always = 8  ← lilToon 기본

    Unity StencilOp                three StencilOp
      Keep = 0  ← lilToon 기본      Zero = 0
      Zero = 1                       Keep = 7680
      Replace = 2                    Replace = 7681
      IncrSat = 3            →       Increment = 7682
      DecrSat = 4                    Decrement = 7683
      Invert = 5                     Invert = 5386
      IncrWrap = 6                   IncrementWrap = 34055
      DecrWrap = 7                   DecrementWrap = 34056

#### 필드 대응

    _StencilRef        → stencilRef
    _StencilReadMask   → stencilFuncMask
    _StencilWriteMask  → stencilWriteMask
    _StencilComp       → stencilFunc
    _StencilPass       → stencilZPass     (Unity 의 Pass = 깊이와 스텐실 모두 통과)
    _StencilFail       → stencilFail
    _StencilZFail      → stencilZFail

three 는 **stencilWrite = true** 일 때만 이 설정을 쓰고, 끄면 원래 8 개 필드를 완전히 복원합니다.

#### ★ 올바른 사용법 (닭-달걀 문제)

    ⚠️ 전역을 Comp=Equal + Ref=1 로 두면 **모든** 것이 사라집니다.
       초기 스텐실 버퍼 = 0, 테스트 0 == 1 실패, 전부 폐기.
       폐기되면 스텐실을 쓰지 않아 항상 0, 영원히 실패.
       (실측 증상: 본체 사라지고 외곽선 색 실루엣만 남음)

    올바른 사용법은 **두 객체 분담**이 필요합니다:
      객체 A(표시자): Comp = Always(8), Pass = Replace(2), Ref = 1
      객체 B(수신자): Comp = Equal(3), Ref = 1
    ⇒ 뷰어에서는: 전역에 A 의 파라미터를 두고, **머티리얼 드롭다운에서 B 를 골라** B 의 파라미터를 따로 설정.

    실측 검증: 전역 Comp=8/Pass=2/Ref=1, CH0155_Shield_Toon 을 골라 Comp=3/Ref=1
      → 방패가 다른 파츠가 가린 위치에서만 표시됨(잘림)
      → 외곽선 8 항목도 Comp=3/Ref=1 로 두면 방패 외곽선도 함께 사라짐.

### 장식 레이어 실행 순서 (lilToon 정렬)

`lil_pass_forward_normal.hlsl:352 / 360 / 411 / 445 / 450 / 457 / 472 / 478`:

    Main2nd → Main3rd → Backlight → MatCap → MatCap2nd → Rim → Emission1st → Emission2nd
    (앞의 둘은 조명 전후에 반씩 있어 자연히 맨 앞)

우리는 원래 틀렸고(Rim → MatCap → Emission → Backlight), 이제
**Backlight → MatCap → MatCap2nd → Rim → Emission** 로 바꿨습니다.

순서가 틀리면 「같은 영역에 여러 효과가 겹칠 때」표현이 달라지며, 특히 Backlight 는 가산입니다.

---

## ★ 씬 뷰 3 종 세트 (Unity 스타일)

> 툴바의 「씬」버튼이 `#scenePanel` 플로팅 창을 열고, 세 그룹의 컨트롤이 있습니다.
> ⚠️ 그것은 평범한 `.lp` 플로팅 창이므로 드래그 / 리사이즈 / 위치 영속화는 플로팅 창 기반이 담당합니다.

### ⚠️⚠️ 보조 표시는 **기본 전부 꺼짐**, 메인 페이지가 명시적으로 켬

  ```
  메인 페이지 index.html        showGrid:true · showViewGizmo:true   (씬 뷰)
  임베드 마스코트 autoMount     showGrid:false · showViewGizmo:false  (웹페이지에 붙는 형태)
  ```

  ⚠️ 사용자 원문: 「그리드는 웹페이지 마스코트 쪽에서는 꺼져 있어야 한다」.

  ⇒ `viewer.js` 에서 `showGrid` / `showViewGizmo` **기본 false**.
     `index.html` 이 `createViewer(...)` 의 opts 에서 **명시적으로 켭니다**.

  ⇒ 임베드 측이 원하면 data 속성으로:

  ⇒ 임베드 측이 원하면 data 속성으로:

      <div data-ba3d
           data-ba3d-grid="true"
           data-ba3d-axes="true"
           data-ba3d-gizmo="true"
           data-ba3d-light-helper="true"></div>

  ⚠️ 판정 규칙은 모두 `!== 'false'` ⇒ `="true"` 로 쓰거나 `data-ba3d-grid` 만 써도 켜진 것으로 봅니다.

  ### 실측

      메인 페이지 index.html        {grid:true,  gizmo:true,  axes:false}
      임베드 embed-demo.html        {grid:false, gizmo:false, axes:false}

---

### ① 보조 표시

  | 키 | 기본값 | 설명 |
  |---|---|---|
  | `showGrid` | **false** | 바닥 그리드(`GridHelper`, y=0 에서 0.0005 살짝 위로 z-fighting 회피) |
  | `showAxes` | false | 원점 XYZ 축(빨강 X / 초록 Y / 파랑 Z, Unity 색상) |
  | `showLightHelper` | false | 메인 라이트 방향 표시(광원 위치에서 원점으로 가는 선 + 끝점 구슬) |
  | `showViewGizmo` | **false** | 우하단… 아니, **우상단** 시점 표시기 |
  | `gridSize` / `gridDivisions` | 8 / 16 | 그리드 크기와 분할 수 |
  | `axesLength` | 1.6 | 축 길이 |

  ⇒ 축의 양의 방향은 실선, 음의 방향은 반투명(Unity 도 같음)

  ### ⚠️ 시점 표시기가 왜 **우상단**인가

      우하단은 「상태」플로팅 창이 차지하고, 좌하단은 툴바 ⇒ 남는 것은 우상단뿐.
      (Unity 의 Scene 뷰도 우상단)

  ### ⚠️ 표시기는 **독립 2D canvas** 를 쓰고, 두 번째 WebGL 을 열지 않음

  두 번째 `WebGLRenderer` 는 context 를 빼앗고 비쌉니다.
  ⇒ 2D canvas 로 세 개의 월드 축을 **카메라 회전**으로 돌려 xy 투영을 취합니다.
  ⇒ z 로 정렬해 뒤쪽은 흐리게 ⇒ 앞뒤 가림 느낌.
  ⇒ 회전만 쓰고 위치는 쓰지 않음 ⇒ 「현재 시점 방향」을 나타내며 Unity 와 같습니다.

### ② 조명

  ⚠️ `keyLight` 는 **방향광**이라 `position` 은 **방향**만 나타냅니다(광원은 무한원점)
  ⇒ xyz 를 직접 채우게 하는 대신 **방위각 / 고도**를 제공합니다(Unity 도 방향을 돌립니다)

      azimuth   [0,360)  Y 축 회전, 0 = +Z(모델 정면), 시계 방향으로 증가
      elevation [-89,89] 고도, 0 = 지평선 · 90 = 바로 위

  변환(`anglesToPosition` / `positionToAngles`):

      x = r·cos(el)·sin(az)      y = r·sin(el)      z = r·cos(el)·cos(az)

  ⇒ 읽을 때는 **역해석**해 각도로 되돌림 ⇒ 세 프리셋과 수동 조정 값이 공존할 수 있습니다.

  조정 가능: 메인 라이트 방위각 / 고도 / 강도 / 색 · 환경광 강도 / 하늘색 / 지면색 ·
        림라이트 강도 · 보조광 강도 · 노출 · 프리셋 드롭다운(낮 / 아침저녁 / 밤)

  ⚠️⚠️ **수동으로 바꾸면 `cfg.lightingPreset` 을 비웁니다** ——
     그렇지 않으면 다음 `applyLighting()` 이 사용자가 바꾼 값을 전부 덮어씁니다.
     ⇒ 이때 패널의 프리셋 드롭다운은 「(사용자 지정)」을 표시합니다.

  ⚠️ 수동 입력은 **최종값**이며 `applyLighting` 의 툰 계수(`key ×1.22` · `rim/fill ×0.15`)를 거치지 않습니다
     ⇒ 그렇지 않으면 패널 표시와 실제가 어긋납니다.

### ③ 카메라

  읽고 쓰기: `position[3]` · `target[3]` · `distance` · `fov`

  ⚠️ `target` 만 전달하면 카메라가 **평행 이동**합니다(상대 방위 유지, Unity 의 「관찰점 이동」과 동일)

  축 정렬 빠른 시점(`setViewPreset`):

      front / back / left / right / top / bottom

  ⚠️ **현재 거리 유지**(그렇지 않으면 갑자기 아주 멀어져 어지러움)
  ⚠️ 정상/정하는 **살짝 기운 방향** 사용(완전 수직이면 궤도 제어의 up 이 퇴화 ⇒ 짐벌락)

  ⚠️ 카메라는 마우스로 움직일 수 있으므로 패널 숫자가 낡습니다 ⇒
     패널이 보일 때 **2Hz 재읽기**(매 프레임 아님), 그리고 **편집 중인 입력란은 덮어쓰지 않음**.

### API

      viewer.getSceneHelpers() / setSceneHelpers({...})
      viewer.getLightState()  / setLightState({...})
      viewer.getCameraState() / setCameraState({ position, target, distance, fov })
      viewer.setViewPreset('front'|'back'|'left'|'right'|'top'|'bottom')

### ⚠️ 배선 순서 함정 (실제로 겪음)

  `#scenePanel` 의 내용은 **열 때** 만들어지는데, `ensurePanelTitle` /
  `makePanelDraggable` / `initFloatWin` 은 이 코드 구간 **뒤에** 정의됩니다.

  ⇒ 바로 호출하면 `is not defined` 이지만 패널은 **여전히 열립니다** ⇒ 드래그만 연결되지 않아 매우 은밀합니다.
  ⇒ 해결: `toggleScenePanel` 안에서 `setTimeout(..., 0)` 으로 **한 프레임 지연**해 호출.
     (그때는 스크립트가 끝나 함수들이 준비됨)

  ⚠️ 제목 문구는 `PANEL_TITLES` 맵을 사용하고 **DOM 을 직접 고치지 않습니다**.
     (`const txt = PANEL_TITLES[el.id] || el.id`)

---

# ★ 상호작용 규약 (UI 를 고치기 전에 이 절을 먼저 읽으세요)

> 사용자 원문: 「**사람에게 학습 비용을 늘리거나, 직관에 반하고 인간에게 반하는 느낌을 주지 말 것**」
> ⇒ 이것이 이 프로젝트의 **최고 설계 제약**이며, 어떤 「기술적 우아함」도 이것을 위반할 수 없습니다.

## 一. 업계 관례에 맞출 것 · 자작하지 말 것

  | 것 | 약속 |
  |---|---|
  | 빠른 시점 Top / Bottom | **수직**(바로 아래 / 바로 위), 비스듬하게 만들지 말 것 |
  | 빠른 시점 Front / Back / Left / Right | 카메라가 **월드 축** 위에 |
  | 화면 위쪽 | = **+Z = 캐릭터 정면**(Unity / Blender 와 동일) |
  | 내려보기 / 올려보기 | 카메라가 지면 아래로 가면 **그리드 자동 숨김**(Unity 의 단면 Grid 모사) |
  | 상태 플로팅 창 | **우하단**(IDE / 엔진의 정보 위치) |
  | 툴바 | 좌하단 · 런처 |
  | 캐릭터 표시 | 좌상단 · 캔버스 본체 |

  ⚠️ 내가 내려보기 / 올려보기에서 **세 번 고친** 것은 모두 자작 때문:
     ① 0.0001 오프셋으로 짐벌락 회피 시도 ⇒ 방향 퇴화
     ② 올려보기를 **비스듬하게** 변경 ⇒ 「비스듬하게 왜 만들어요」
     ③ 내려보기 `up=(0,0,-1)` ⇒ 화면 속 모델이 **거꾸로**
     ✅ 정답: **정방향 + up 벡터 교체**(기술 문제는 기술로 해결)

## 二. 내부 용어를 UI 문구로 쓰지 말 것

  | 쓰지 말 것 | 쓸 것 |
  |---|---|
  | `pivot` / 프레이밍 중심 오프셋 | **모델 위치 XYZ 보정** |
  | `groundOffsetY` | 위와 동일(`modelOffset.y` 의 별칭일 뿐) |
  | `showGrid` / `showAxes` | 바닥 그리드 / 원점 축 |
  | `action` 모드 | **view**(사용자는 view 라 부르고 내부 값은 action 유지) |

  ⚠️ 「버튼은 **씬** · 패널은 **씬 파라미터**」같은 구분은 **필요해야** 합니다.
     역사적 이유만으로 두 이름을 남기면 ⇒ 그 자체가 학습 비용.

## 三. 기본 상태가 곧 올바른 상태

  ⚠️⚠️ **「먼저 눌러야 적용되는」 상태를 만들지 말 것** ——

     내가 저지른 실수: `buildShaderPanel()` 이 **패널을 열 때만** 호출되어 ⇒
     기본 상태에서 툴바가 그대로 차 있었음 ⇒ 사용자가 보는 것과 요구가 반대.
     그런데 내 프로브는 **버튼을 먼저 누르고 측정**했으므로 ⇒ 영원히 발견할 수 없었음.

  ⇒ 규칙: **기본 상태를 측정할 때는 아무 상호작용도 하지 말 것**, 그 다음 상호작용 테스트.
  ⇒ 규칙: 장식적 / 구조적 요소는 **HTML 에 작성**하고 JS 런타임에 넣지 말 것.
     (`.fw` 의 세 플로팅 창은 하드코딩 ⇒ 「재생성으로 사라지는」 문제가 없었음.
       `partsPanel` / `lilPanel` 은 런타임 생성 ⇒ 제목 / [—] / 손잡이가 **번갈아 사라짐**)

## 四. 좌표계가 일관될 것 (하나의 멘탈 모델)

      · 캐릭터 발밑의 **중심축** = 월드 원점의 수직선
      · `modelOffset` 의 용도 = **모델을 그 선 위에 놓기**(기본 0 ⇒ 이미 위에 있음)
      · 자동 접지가 발을 y=0 에 맞춤
      · 빠른 시점: 카메라가 월드 축 위, 목표가 중심축 위
      · 궤도 회전은 이 중심축을 돌기 ⇒ **캐릭터 중심**

  ⚠️ 반례(수정됨): `sample.json` 에 옛 `pivot.x = -0.1` 이 남아 있어 ⇒
     옛 의미로는 「카메라 조준점만 이동」이었는데 새 의미로 옮기면
     **「모델을 중심축에서 0.1 밀어냄」** ⇒ 전체 멘탈 모델과 **정반대**.

## 五. 하나의 개념에 진실은 한 곳만

      ⚠️ 이 세션에서 겪은 같은 유형:
        · `groundOffsetY` 와 `modelOffset.y` 공존 ⇒ 자동 접지가 「아무도 읽지 않게」 씀
        · 표시 모드 전환이 툴바 + 패널 두 곳 ⇒ 플로팅 창 좌상단 한 곳으로 변경
        · `pivot` 과 `modelOffset` 공존 ⇒ pivot 폐기

      ⇒ 개념을 합칠 때는 **모든 쓰는 쪽을 함께 고쳐야** 하며, 하나만 놓치면 조용히 무효가 됩니다.

## ★ 플로팅 창 레이아웃 (Unity 스타일)

> `index.html` 은 더 이상 「전체 화면 씬 + 고정 사이드바」가 아니라 **여러 개의 서로 중첩되지 않는 플로팅 창**입니다.
> Unity 처럼: 씬이 한 창 · 파라미터 패널이 다른 창 · 둘 다 드래그와 리사이즈 가능.

### 왜 바꿨는가

  ⚠️ `frameModel()` 은 **`container.clientHeight`** 로 모델을 고정 픽셀 높이로 스케일합니다.
     그런데 씬이 원래 `position: fixed; inset: 0`(뷰포트 전체)이어서 ⇒
     **브라우저 창이 낮아지면 ⇒ 모델도 줄어듦** ⇒ 의외였습니다.
  ⇒ 고정 크기 플로팅 창 ⇒ `clientHeight` 일정 ⇒ **모델 크기 일정**.

  ⚠️ 사용자가 **직접** 씬 창 크기를 바꾸면 **다시** 프레이밍합니다 —— 의도된 동작입니다.
     Unity 의 Scene 뷰도 그렇습니다.

### 네 개의 플로팅 창

  | id | 제목 | 내용 | 기본 위치·크기 |
  |---|---|---|---|
  | `#sceneWin` | 씬 | `#app`(three canvas) + `#vignette` | 16,16 · 960×700 |
  | `#hudWin` | 툴바 | `#hud`(버튼 + 모션/라이팅/밝기/그림자/그림자 색/클램프) | 16,bottom · 660×210 |
  | `#infoWin` | 상태 | `#info`(프레임레이트 / 삼각형 수 / 머티리얼 수) | right,16,bottom · 300×130 |
  | `.lp` ×3 | 파라미터 / 내보내기 / 파츠 | lilToon 패널 · JSON 내보내기 · 파츠 목록 | right,top · 폭 400 |
  | `#upload` | 사용자 모델 | glb / 텍스처 / 설정 업로드(자기 `.u-title` 을 손잡이로) | left,top · 폭 288 |

  ⚠️ `#loading` 은 플로팅 창이 **아닙니다** —— 로딩 오버레이이며 여전히 전체 화면을 덮습니다.

### 공통 조작

      드래그     **제목 표시줄**을 잡고 끌기(`#upload` 는 자체 `.u-title`)
      리사이즈   **우하단 작은 삼각형**(`.fw-grip`)을 끌기
      층위       클릭한 창이 맨 앞으로(`.raised` 추가 ⇒ z-index:30)
      영속화     localStorage `ba3d-layout-v1` 에 자동 저장(키 이름은 일부러 점 없이)
      └ 저장 값  left / top / width / height / collapsed

  ⚠️ 키 이름을 **일부러 점 없이** 둔 이유 —— `check-panel.mjs` 가 소스의 점 있는 문자열을
     패널의 「그룹.키」로 간주하므로 점 있는 키 이름은 그룹명으로 오판됩니다(실측으로 겪음)

### 레이아웃 리셋

  **콘솔에서 실행**:

      ba3dResetLayout()        // 영속화 삭제 + 다시 로드

  ⚠️ `window.ba3dResetLayout` 에도 걸려 있습니다.

### 좁은 화면 대응

  ⚠️ 플로팅 창은 모바일에서 실용적이지 않으므로 `@media (max-width: 820px), (max-height: 560px)` 에서:

      #sceneWin   뷰포트 채움 · 테두리 둥글기 제거 · 제목 표시줄과 손잡이 숨김
      .lp         전체 화면 덮음(내부는 원래 스크롤 가능)
      #hudWin     하단 34vh · #infoWin 하단 20vh
      #upload     전체 화면 덮음

  ⇒ 드래그가 안 되어도 문제 없음(제목 표시줄과 손잡이를 숨겼으므로), CSS 만으로 충분, JS 분기 불필요.

### 구현 위치

  · CSS      `index.html` 의 `.fw` / `.fw-title` / `.fw-body` / `.fw-grip` 네 규칙
  · 드래그   기존 `makePanelDraggable(el, handleSel)` 재사용
             (손잡이 체인: `.fw-title` > `.lp-title` > `.u-title` > `h4`)
  · 리사이즈 `makePanelResizable(el)` —— 우하단 손잡이 · 최소 240×160 · 뷰포트 클램프
  · 영속화   `fwSave` / `fwRestore` / `fwClearAll` / `fwClampBox`
  · 통합     `initFloatWin(el)` = 드래그 + 리사이즈 + 복원 + 층위
             `enableAllPanelDrag()` 가 모든 `.fw` 와 `.lp` 에 호출

  ⚠️ **DOM 재구성 0**: `.lp-title` 은 원래 `position: sticky` 라서 패널 내부를 스크롤해도
     제목이 밀려 올라가지 않으므로, 그 438 개 컨트롤 컨테이너를 건드릴 필요가 없습니다.

---

## ★ `modelOffset`(모델 위치 보정) · `pivot` 은 폐기

  ### 무엇을 제어하는가

      renderer.modelOffset = { x, y, z }     // 월드 단위

  ⇒ **모델 본체가 이동**합니다 ⇒ 그림자 / 외곽선 / 조명이 모두 따라갑니다.
  ⇒ 카메라 조준점 = 모델의 새 중심 ⇒ **회전이 자연히 캐릭터 중심**이 됩니다.

  ### ⚠️ 폐기된 `renderer.pivot` 과의 차이

      옛 방식 pivot = { x, z }   **카메라 조준점만** 이동
        ⇒ 모델이 옮겨진 것처럼 보이지만 **모델과 그림자는 그대로** ⇒ 직관에 반함.
        ⇒ 그리고 「회전이 캐릭터 중심」은 조준점을 어긋나게 해서 **맞춘** 것.

      새 방식 modelOffset = { x, y, z }   **실제로 모델을 이동**
        ⇒ 모델이 000 에 오면 회전 중심이 자연히 캐릭터.

  ⇒ 사용자 원문:

      「取景中心偏移本身就是为了实现旋转时角色在旋转中心设计的。
        我们实际需要的就是让人可以直观把模型移动到 000 位置。
        这样旋转就是角色为中心看、**不动旋转轴、动角色位置**」

  ### ⚠️ `pivot` 은 폐기(API 는 남아 있음)

      · `renderer.pivot` —— 기본 설정에서 **삭제**, 로드 시 더 읽지 않음.
      · `viewer.getPivot()` / `setPivot()` —— 남아 있지만 **아무도 호출하지 않음**, 폐기로 간주.
      · 씬 패널의 「프레이밍 중심」그룹 —— **삭제**, 「모델 위치 보정」만 남음.

  ### 옛 컨트롤 세 개의 기본값 이관

      툴바의 「접지 미세 조정 / 기준 X / 기준 Z」세 컨트롤을 삭제 ⇒ modelOffset 으로 통합:

          접지 미세 조정(groundOffsetY) ⇒ **modelOffset.y** (`groundOffsetY` 는 호환 별칭으로 유지)
          기준 X(pivotX)                ⇒ **modelOffset.x**
          기준 Z(pivotZ)                ⇒ **modelOffset.z**

      ⇒ `sample.json` / `fallback.json` 의 원래 `pivot.x = -0.1` 은
         `renderer.modelOffset = { x: -0.1, y: 0, z: 0 }` 으로 이관(원래 표현 유지)

  ⚠️ 함정 하나 더: `modelOffset` 은 반드시 `renderer` 안에 있어야 합니다.
     처음에 JSON **최상위**에 썼더니 ⇒ 로더가 인식하지 못해 ⇒ 설정이 조용히 무효가 되었습니다.

---

## ★ 프레이밍 수직 오프셋 기본값 22 (`framingOffsetY`)

  ⚠️ 이 기본값은 **실측으로 맞춘** 것이며 아무렇게나 정한 값이 아닙니다.

  ### 왜 0 이 아닌가

  `CH0155_Vital_Death`(쓰러짐 모션)가 **4 초**에 전체가 화면 아래쪽으로 내려가 ⇒
  하단이 아래 가장자리를 **0.0934 NDC** 넘어 ⇒ 잘립니다.

  ⚠️ 한 시점만 샘플링해서는 **알 수 없습니다** —— 0.7 초 프레임은 완전히 정상입니다.
     모션마다 여러 시점(0.4 / 1.0 / 1.8 / 2.8 / 4.0 / 6.0 초)을 샘플링해 최악값을 취해야 합니다.
     (`viewer.frameFitReport()` 로도 자체 점검 가능)

  ### 22 는 어떻게 나왔나

      `framingReferenceHeight = 430` ⇒ 반높이 215px
      0.0934 NDC × 215 ≈ 20px ⇒ 여유를 두고 **22**.

  ### 실측 효과(가장 빡빡한 모션 5 개 × 3 시점)

      모션                      변경 전     변경 후
      CH0155_Vital_Death      −0.0934、+0.0372。
      CH0155_Exs_Cutin        +0.0131      +0.1350    ← 원래 하단에 붙어 있던 것도 함께 해결
      CH0155_Vital_Dying_Ing   …           +0.1881。
      CH0155_Vital_Panic       …           +0.1937。
      잘림: 1 개 ⇒ **0 개**.

  ### ⚠️⚠️ 이것은 「지면을 올리거나 모델을 올리는」 것이 아님

  、모델을 올리면 ⇒ 방금 고친 접지가 망가지고 그림자가 다시 발과 분리됨
  、움직이는 것은 **카메라 조준점**(`frameModel` 의 target.y)
          ⇒ 지면은 여전히 y=0, 발도 여전히 y=0(`groundOffsetY` 의 접지도 유효)

  ### 조정법

      「양수 = 구도를 아래로 ⇒ 화면 내용이 **위로** 이동」
      ⇒ 내용이 **아래 가장자리**에서 잘리면 ⇒ **크게**
      ⇒ 내용이 **위 가장자리**에서 잘리면 ⇒ **작게**(또는 음수)

  ⇒ 런타임에서도 변경 가능(새로고침 불필요):

      viewer.getFraming()                        // 현재 값 보기
      viewer.setFraming({ framingOffsetY: 30 })  // 변경
      viewer.frameFitReport()                    // 이탈 여부 측정

  ⚠️ 모델을 바꾼 뒤에는 `probe-fit.mjs` 를 한 번 돌려 새 모델의 모션이 화면을 벗어나지 않는지 확인하세요.

---

## ★ 접지: 캐릭터 발과 지면 (`groundOffsetY`)

### 문제

  「캐릭터 발이 지면에 닿지 않고 그림자와 몸이 분리됨」(장기 피드백)

  ⚠️ 근본 원인: `fitToView` 가 `measureContentBox(root)` 의 `min.y` 로 모델을 y=0 에 맞춥니다.
     그런데 **스킨 메시의 바운딩 박스는 바인드 포즈 기준**이라 ⇒
     애니메이션이 움직이면 발의 실제 높이가 달라져 ⇒ 그림자(y=0 에 투영)와 발 사이에 틈이 생깁니다.

  ### 실측(헤드리스 브라우저로 측정)

      자동 접지 전   minY = 0.0664   groundY = 0   gap = 0.0664   ← 떠 있음
      자동 접지 후   minY = -0.00003 groundY = 0   gap = 0        ← 정확히 접지
      샘플 9303 점 / 11 메시

  ⇒ 모델 총높이 2 월드 단위 ⇒ 떠 있는 정도 약 **키의 3.3 %** ⇒ 눈에 보이는 그 틈과 정확히 일치.

  ### 측정법: `viewer.probeGround()`

  ⚠️ **정점에 스키닝 변환을 적용해야** 하며 바운딩 박스를 읽으면 안 됩니다.
     `SkinnedMesh.applyBoneTransform(i, v)` 사용(three r151+).
     그리고 `applyMatrix4(o.matrixWorld)` 로 월드 공간으로.
     정점이 수십만 개이므로 ⇒ 메시마다 약 2000 점 샘플(발 부분 밀도 충분)

  ### 설정

  | 키 | 기본값 | 설명 |
  |---|---|---|
  | `groundOffsetY` | 0 | 접지 미세 조정(월드 단위) 양수는 올림 · 음수는 내림 |
  | `autoGroundSnap` | true | 로드 후 **한 번 자동 접지** |

  ### ⚠️⚠️ 왜 **한 번만** 접지하는가

  점프 / 웅크리기 / 다리 들기 같은 모션은 **본질적으로 발을 띄우는** 것입니다.
  매 프레임 접지하면 그것을 눌러버려 ⇒ 캐릭터가 땅에 못 박힌 것처럼 됩니다.

  ⇒ 게다가 **애니메이션을 12 프레임 진행시킨 뒤** 측정해야 합니다 ——
     로드 직후에는 여전히 바인드 포즈이고, 그것은 fitToView 가 이미 쓴 값 ⇒ gap≈0 으로 헛접지.

  ⇒ 틈이 `0.5% × 키` 보다 작으면 접지하지 않음(스킨 샘플링에 노이즈가 있어 오버슈트 가능)

  ### 패널

  툴바에:

      접지 미세 조정   슬라이더 + 숫자 입력(-0.5 ~ 0.5)
      자동 접지        버튼 ⇒ `viewer.snapToGround()`(한 번 측정 · 자동 보정)

  ⚠️ 슬라이더를 수동으로 만지면 ⇒ 자동 접지가 **양보**(`__autoSnapSkip`)하고 사용자 값을 덮지 않습니다.

  ### ★ 프레이밍도 따라와야 함 (중요, 사용자가 지적한 위험)

  ⚠️ `frameModel` 은 `fitToView` 때 **캐시한 `contentBox`** 를 씁니다.
     그런데 접지는 모델 전체를 `groundOffsetY` 만큼 내리므로 ⇒ 구도 중심은 옛 위치에 남습니다.

      오프셋이 작으면(기본 −0.0666 = 키의 3.3 %) ⇒ 눈에 안 띄지만
      슬라이더는 ±0.5(= 키의 25 %)까지 가능 ⇒ 그때는 화면을 뚫습니다.

  ⇒ 해결: `frameModel` 의 `target.y` 에 `groundOffsetY` 를 더함.
     그리고 **접지 미세 조정이 바뀔 때만** 재계산(매 프레임 아님).

  ### 실측(모션 24 개의 NDC 여유를 개별 측정)

      변경 전   가장 빡빡한 모션  top=0.2133  bottom=0.1161
      변경 후   가장 빡빡한 모션  top=0.1553  bottom=0.1745   ← 더 균형
      잘린 모션 수  0 / 24.

      극단 오프셋(슬라이더 양끝 · 키의 25 %):
        오프셋 −0.5  ⇒ top=0.6734  bottom=0.2518.
        오프셋 +0.5  ⇒ top=0.6751  bottom=0.2040.

  ⚠️ 측정법: `viewer.frameFitReport()` 가 현재 포즈의 **스킨 바운딩 박스**를 NDC 로 투영합니다.
     `|ndc| <= 1` 이면 화면 안, 넘으면 잘림.

  ### 지면 자체는 건드리지 않음

  접지는 **모델을 지면 쪽으로 내리는** 것이지 지면을 올리는 것이 아니므로 ⇒
  지면은 여전히 `y=0`, 발도 정확히 `y=0`, 접촉이 정확합니다.

  ### API

      viewer.probeGround()            → { minY, groundY, gap, sampled, meshes }
      viewer.frameFitReport()         → { ndcTop, ndcBottom, marginTop, marginBottom, clipped }
      viewer.getGroundOffset()        → 현재 오프셋
      viewer.setGroundOffset(y)       → 설정(자동 접지 비활성)
      viewer.snapToGround()           → 현재 포즈 기준 자동 접지
      viewer.onGroundOffsetChange(fn) → 자동 접지 후 패널 슬라이더 동기화

## ★ 주간 모드 (`body.light`)

  ### 무엇을 하는가

  툴바 맨 왼쪽의 「낮 / 밤」버튼으로 전체 색 구성을 전환합니다.

  ### ⚠️ 방식은 **점진적 덮어쓰기**

  `index.html` 의 `</style>` 앞에 `body.light …` 규칙 묶음을 덧붙입니다.
  **위의 어두운 규칙은 하나도 건드리지 않음** ⇒ 야간 모드는 위험 0(바이트 하나도 안 바뀜)

  ⇒ 한 곳을 더 바꾸고 싶으면 그 묶음에 **같은 선택자** 규칙을 추가(뒤에 쓴 것이 이김)

  적용 범위(약 40 조항):

      html/body 배경 · .fw / .fw-title / .fw-grip · #sceneWin 의 body
      #hud 의 버튼 / 드롭다운 / 숫자 입력 / 구분선 / option
      .lp 패널 + 제목 표시줄 + 버튼 + textarea + 입력
      #upload 업로드 패널 + .u-pick + .u-actions
      #info / #loading / #bar · #vignette(주간에는 비네트를 풀어야 모서리가 검게 되지 않음)

  ### 우선순위

      localStorage('ba3d-theme')  >  시스템 prefers-color-scheme  >  야간

  ⚠️ 키 이름은 **점 없이**(`check-panel.mjs` 가 점 있는 문자열을 패널의 「그룹.키」로 간주)

  ### 콘솔

      ba3dSetTheme('light')     // 또는 'dark'

  ### ⚠️ 씬 배경도 함께 변함

  기본 배경이 「투명」이라 ⇒ 씬 창 body 의 CSS 색이 비칩니다 ⇒
  주간 모드에서는 모델이 **밝은** 바탕 위에 서게 됩니다(의도된 것으로 Unity 와 동일).
  고정 배경색을 원하면 ⇒ 툴바의 「배경」드롭다운에서 구체적인 색을 고르세요.

---

## ★ 2026-10-06 신규 (lilToon 2.3.4 정렬)

> 이 묶음은 기준선을 lilToon 1.3.7 에서 **2.3.4** 로 바꾼 뒤 보충한 것들입니다.
> 버전 비교와 소스 맵은 [`LILTOON2.x.ko.md`](LILTOON2.x.ko.md) 참고.

### 1. 렌더 상태(머티리얼별) —— `_TransparentMode` / `_Cutoff` / `_Cull`

  **최상위 키 세 개**, 기본값은 **모두 `-1 = 변경 안 함`**(모델自带 값 유지):

  | 키 | 기본값 | 대응 | 설명 |
  |---|---|---|---|
  | `transparentMode` | -1 | `_TransparentMode` | -1 변경 안 함 · 0=Opaque · 1=Cutout · 2=Transparent · 3~6(Refraction/Fur/FurCutout/Gem)은 Transparent 로 강등하고 로그 출력 |
  | `cutoff` | 0.5 | `_Cutoff` | Cutout 모드에서만 의미 있음 |
  | `cull` | -1 | `_Cull` | -1 변경 안 함 · 0=Off(양면) · 1=Front · 2=Back |

  ⚠️ **Unity 와 three 의 side 열거 순서가 다름** ⇒ 그대로 복사할 수 없습니다.

      _Cull 0(Off 양면) → THREE.DoubleSide (2)
      _Cull 1(Front)     → THREE.FrontSide  (0)
      _Cull 2(Back)      → THREE.BackSide   (1)

  ### alphaTest 의 **유일한 권위**는 `syncDissolveAlphaTest`

  우선순위(높음 → 낮음):

      ① 디졸브가 켜짐(lilToon 이고 dissolve.mode > 0) ⇒ max( 0.5, 원값 )
         (≥ 0.5 여야 실제로 discard 됨)
      ② transparentMode = 1(Cutout) ⇒ cutoff
      ③ transparentMode = 0 / ≥2(Opaque / Transparent) ⇒ 0
      ④ 모드 미변경(-1)이지만 cutoff 만 주어졌고 원래 Cutout ⇒ cutoff
      ⑤ 그 외 ⇒ 모델 원값으로 복원(userData.__ba3dOrigAlphaTest)

  ⚠️ `applyLilRenderState` 는 alphaTest 를 **건드리지 않고** transparent / depthWrite / side 만 설정합니다.
     둘을 나눈 것은 중복 적용을 피하기 위해서입니다(한 번 겪음).

  ⚠️ alphaTest 를 바꾸면 three 의 `USE_ALPHATEST` 매크로에 영향 ⇒ 반드시 `needsUpdate = true`.

  ### 동기화 체인(순서 중요)

      syncDissolveAlphaTest();   // ① alphaTest(유일한 권위)
      syncRenderState();         // ② transparent / depthWrite / side
      syncLayerDoubleSide();     // ③ 메인 레이어의 컬링(명시적 _Cull 우선 · 건너뜀)
      syncStencil();             // ④ 스텐실 파라미터
      applyOutlineParams();      // ⑤ 외곽선 건너뛰기 규칙 재평가

  ⚠️ 앞의 네 함수는 **설정이 바뀔 때마다** 전체를 한 바퀴 돌아야 합니다.
     **머티리얼이 재사용**되어 `patchToonMaterial` 이 다시 돌지 않으므로, 설정만 바꾸면 적용되지 않습니다.

### 2. 메인 UV / 색조 —— `_MainTexHSVG` / `_MainTex_ScrollRotate`

  | 키 | 기본값 | 대응 |
  |---|---|---|
  | `mainTexHSVG` | `[0,1,1,1]` | `_MainTexHSVG`：(색상 이동, 채도 배율, 명도 배율, Gamma) |
  | `mainTexScrollRotate` | `[0,0,0,0]` | `_MainTex_ScrollRotate`：(스크롤X, 스크롤Y, 회전각, 회전 속도) |

  수식 그대로(`lil_common_frag.hlsl:263 / :317`):

      fd.uvMain = lilCalcUV( fd.uvMain, _MainTex_ST, _MainTex_ScrollRotate );
      fd.col.rgb = lilToneCorrection( fd.col.rgb, _MainTexHSVG );

  ⇒ 구현 방식: **`#include <common>` 교체**(uniform + helper 두 개 추가)
     그리고 **`#include <map_fragment>`** 교체(패치된 샘플링으로).

  ⚠️ **`_MainTex_ST` 를 다시 곱하지 않음** —— three 의 `vMapUv` 에 이미 ST 가 반영됨.
  ⚠️ **GLSL 에는 함수 호이스팅이 없음** ⇒ 생성기 순서는 「회전 함수 → 스크롤 함수 → 호출」이어야 함.
  ⚠️ 모두 기본값이면 생성기가 `null` 반환 ⇒ 두 replace 모두 원문으로 퇴화 ⇒ **부작용 0**.

  ### 시간 uniform (`uBa3dTime`)

  ⚠️ **무조건 선언**(사용되지 않는 uniform 은 GLSL 이 최적화로 제거 ⇒ 선언만 하고 안 써도 비용 없음)
     필요할 때만 선언하면 누락되기 때문 —— Decal 의 아틀라스 애니메이션도 이것을 씀(한 번 겪음)

  ⚠️ 모든 shader 가 **같은 uniform 객체**(`ba3dTimeUniform`)를 공유합니다.
     「shader 목록을 유지하며 나중에 수정」하는 방식은 three 가 처리한 uniforms 를 못 고쳐 실패한 적 있음.

  ⚠️ **알려진 편차**: lilToon 은 **공유 `fd.uvMain`** 을 바꾸므로 ⇒ 그림자/외곽선 텍스처도 함께 흐릅니다.
     우리는 메인 텍스처 자신의 UV 만 바꿈 ⇒ `LILTOON2.x.ko.md` 에 알려진 차이로 기록.

### 3. 레이어 Alpha 모드 —— `_Main2nd/3rdTexAlphaMode`

  `main2nd.alphaMode` / `main3rd.alphaMode`(Int · 기본 0):

      0 = 변경 안 함   1 = 이 레이어의 alpha 로 교체   2 = 곱하기
      3 = 더하기(클램프)   4 = 빼기(클램프)

  ⚠️ **Cutout / Transparent 에서만 유효** —— lilToon 에서는 이 블록 전체가
     `#if LIL_RENDER != 0` 안에 있고 three 에는 그런 매크로가 없음
     ⇒ `mat.alphaTest > 0 || mat.transparent` 로 역추정.
  ⚠️ 사용 후 이 레이어의 alpha 를 **1 로 설정**(`lil_common_frag.hlsl:805`)
     ⇒ 바로 이어지는 **색 혼합**이 최대 강도로 계산됩니다(이 문장은 놓치기 쉽습니다)

### 4. 디더 Dither —— `_UseDither` / `_DitherTex` / `_DitherMaxValue`

  `dither: { use, url, maxValue }`, 수식 그대로(`lil_common_frag.hlsl:524-546`):

      fd.col.a = fd.col.a >= ( 텍스처값 * 255 + 1 ) / ( _DitherMaxValue + 2 ) ? 1 : 0;

  ⚠️ **GLSL ES 1.00 에는 `uint` 가 없음** ⇒ `lilSamplePointRepeat` 등가 표기:

      vec2 cell = mod( floor( gl_FragCoord.xy ), size );
      vec2 uv   = ( cell + 0.5 ) / size;      // ★ 텍셀 중심 사용

  ⚠️ lilToon 의 문자 그대로인 `uv/size` 가 아니라 **텍셀 중심**을 씁니다.
     Unity 쪽 `_DitherTex` 는 보통 Point 필터(모서리=중심 ⇒ 등가)인데,
     **three 는 텍스처 기본이 LinearFilter** 라서 모서리에 걸리면 4 텍셀이 섞여 점阵이 뭉개지기 때문.

  ⚠️ 텍스처 기본값이 white ⇒ 전부 1 ⇒ 임계값 = 256/257 ≈ **0.996** ⇒ **거의 전부 폐기**
     진짜 점阵 효과를 원하면 **순서 디더 행렬** 텍스처가 필요합니다.
     기본 내장 두 장을 그대로 쓸 수 있습니다:

         assets/test/dither-bayer4.png   4×4   16 개의 서로 다른 값
         assets/test/dither-bayer8.png   8×8   64 개의 서로 다른 값

### 5. Decal —— `_Main2nd/3rdTexIsDecal`

  ⚠️ **Decal 은 독립 레이어가 아니라** main2nd / main3rd 의 한 **모드**입니다.
     로직은 `lilGetSubTex`(`lil_common_functions.hlsl:719`) 안에 있습니다.

  레이어마다 스위치 7 개 + vec4 2 개:

      isDecal / isLeftOnly / isRightOnly / shouldCopy / shouldFlipMirror / shouldFlipCopy
      decalAnimation (4)   // (열 수, 행 수, 고정 프레임, 프레임레이트) 기본 (1,1,1,30)
      decalSubParam  (4)   // (폭, 높이, 중심 스냅, 1)     기본 (1,1,0,1)

  세 단계 수식(그대로):

      lilCalcDecalUV(`:473`):
          if(shouldCopy) outUV.x = abs(outUV.x - 0.5) + 0.5;
          outUV = outUV * uv_ST.xy + uv_ST.zw;
          if(shouldFlipCopy && uv.x < 0.5) outUV.x = 1.0 - outUV.x;
          if(shouldFlipMirror && isRightHand) outUV.x = 1.0 - outUV.x;
          if(isLeftOnly  &&  isRightHand) outUV.x = -1.0;
          if(isRightOnly && !isRightHand) outUV.x = -1.0;
          outUV = (outUV - uv_ST.zw) / uv_ST.xy;      // 회전 전에 ST 역변환
          outUV = lilRotateUV(outUV, angle);
          outUV = outUV * uv_ST.xy + uv_ST.zw;

      lilCalcAtlasAnimationAtAnimTime(`:533`) —— 아틀라스 프레임 애니메이션
      가장자리 AA(`:748`): outCol.a *= lilIsIn0to1( uv2, saturate(nv - 0.05) )
          ⚠️ HLSL 은 float2 를 float 로 넘기면 **암묵적으로 .x 로 절단** ⇒ **x 방향만 판정**.

  ⚠️ `isRightHand` = **탄젠트 W 의 부호**(`lil_pass_forward_normal.hlsl:341`)
     탄젠트가 없는 모델 ⇒ 항상 1.0(= lilToon 초기값, `lil_common.hlsl:162`)
  ⚠️ `isDecal` 의 가장자리 AA 는 `decalUv.x` 가 [0,1] 을 벗어난 픽셀을 지웁니다.
     [0,1] 을 넘는 UV 채널을 쓸 때는 반드시 `texST` 로 범위를 안으로 압축해야 합니다.

  ### ⚠️ 실용성 설명(오해 방지)

  **Decal 은 「그림 한 장을 얼굴 어딘가에 붙이는」 도구가 아니라**, 이 레이어의 텍스처에
  **샘플링 규칙을 바꾸는** 기능입니다(UV 교체 / 미러 / 단면 / 아틀라스 애니메이션 / [0,1] 로 자르기)
  ⇒ 진짜 「데칼」은 **모델/아트가 데칼용 UV 를 준비해 둔 것**에서 나옵니다.
  ⇒ BA 시리즈의 uv1 은 큰 범위로 반복되어 ⇒ `texture2D(tex, uv1)` 은 **줄무늬**만 나옵니다.
     (Unity 에서 같은 UV1 + 같은 ST 를 쓰면 완전히 동일한 줄무늬가 나옵니다 — 버그 아님)

  ⇒ 여기서 `texST` 의 실제 용도는 「**텍스처의 어느 부분을 확대해 깔지**」이며 자유 배치가 아닙니다.
  ⇒ 「★Decal 디버그」= 2 로 decal UV 를 색으로 출력해 UV 가 어디에 놓이는지 확인할 수 있습니다.

### 6. 반사 / 스페큘러 하이라이트 —— `_UseReflection` / `_ApplySpecular`

  `reflection: { use, apply, toon, border, blur, normalStrength, smoothness,
                reflectance, metallic, color, blendMode, aaStrength }`

  ⚠️ **`_UseReflection` 기본값 0** ⇒ lilToon 은 기본적으로 **하이라이트를 그리지 않습니다**.
     공식 프리셋 19 개 중 3 개만 켜져 있습니다(Inorganic-Glass / LiteGlass / Metal)
     ⇒ **금속 / 유리류** 머티리얼용 기능이며 피부/옷/머리에는 켜지 않습니다.

  수식 그대로(`lil_common_frag.hlsl:1189-1208` / `:1348`):

      N  = lerp( fd.origN, fd.N, _SpecularNormalStrength );
      H  = normalize( fd.V + L );
      nh = saturate( dot( N, H ) );
      if ( _SpecularToon )
          reflectCol = lilTooningScale( _AAStrength, pow( nh, 1.0/fd.roughness ),
                                        _SpecularBorder, _SpecularBlur );
      fd.col.rgb = lilBlendColor( fd.col.rgb, reflectionColor.rgb * lightColorSpc,
                                  reflectCol * reflectionColor.a, _ReflectionBlendMode );

  `roughness = (1 - _Smoothness)²`(`lil_common.hlsl:200` + `lil_common_frag.hlsl:1311-1312`)

  ⚠️ **`_Smoothness = 1`(기본) ⇒ `roughness = 0` ⇒ `pow( nh, 1.0/0.0 )`**.
     HLSL: `pow(x, +INF)` 는 x<1 에서 0 · x>=1 에서 1
     GLSL: **지수가 무한이면 미정의 동작** ⇒ 명시적으로 `ba3dSpNH >= 1.0 ? 1.0 : 0.0`.

  ⚠️ 장식 레이어 순서(`lil_pass_forward_normal.hlsl:335-470`).
     Reflection 은 **Backlight 이후 · MatCap 이전**입니다.

  ⚠️ 의도적 미구현: `_ReflectionCubeTex`(Unity 는 Reflection Probe 의존) · 비툰 경로의 완전한 GGX.

### 7. ★ 외곽선과 투명 머티리얼 (동작 변경)

  **lilToon 에는 「투명 머티리얼이면 외곽선 건너뛰기」규칙이 없고**, 투명 머티리얼에도 외곽선을 그립니다.
  ⇒ 우리가 원래 넣었던 근사 규칙을 ⇒ **제거했습니다**.

  ### 현재 동작

      · 투명 머티리얼도 **외곽선을 정상적으로 그림**
      · 외곽선 머티리얼의 `transparent` 는 소스를 따르고 ⇒ **`depthWrite = false`**
        (그렇지 않으면 불투명 껍질이 반투명 본체를 **깊이 컬링**해 실색으로 만들어 버림, 한 번 겪음)
      · 외곽선 색 / alpha 는 `_OutlineColor` 에서 옴(패널의 외곽선 색 + 투명도)
        ⚠️ **소스 머티리얼의 alpha 를 곱하지 않음** —— lilToon 은 `fd.col.a *= _OutlineColor.a`.
           「투명을 따라간다」의 진짜 메커니즘은 **외곽선 pass 가 머티리얼의 `_TransparentMode`** 를
           상속하는 것(블렌드 / 깊이 상태)이며 alpha 를 곱하는 것이 아닙니다.

  ### ⚠️ 외곽선에는 **두 시스템**이 있고 상태를 공유해야 함

      ① three 의 OutlineEffect(lilToon 이 아닌 모드)
      ② `applyLilOutline()` 의 독립 역확장 메시(lilToon 모드)

  ⇒ 둘은 각자 「건너뛰기」규칙을 가지며 **한쪽을 고쳐도 다른 쪽에 영향이 없습니다**(한 번 겪음)
  ⇒ 이제 `applyLilOutline` 도 `userData.outlineParameters.visible` 을 읽습니다.

  ### 관련 설정

      outline.skipPattern      **메시 이름** 정규식으로 제외(기본 "Halo", 얇은 판이 자기 자신을 뚫어 깜빡임)
      outline.skipTransparent  【우리 스위치】반투명 머티리얼을 통째로 외곽선에서 건너뛸지
                               ⚠️ 기본 **false** = 그대로 그림(= lilToon)
                               극단적인 얇은 판 상황에서만 켜면 됩니다.
      (off = true 인 바닥 / 입가 장식은 **항상** 건너뛰며 투명과 무관)

### 8. ★ 레이아웃: 텍스처가 있으면 ⇒ 이 레이어는 켜진 것으로 간주

  ⚠️ lilToon 의 `_UseMain2ndTex` 는 **별도 스위치**인데, 사용자의 멘탈 모델은
     「텍스처를 골랐다 = 이 레이어를 쓰고 있다」⇒ 켜지 않으면 `lilMainLayerGLSL` 첫 줄이
     `return null` ⇒ **패널의 뒤따르는 모든 파라미터가 무반응**, 그런데 텍스처 줄에는 파일명이 표시됨.
     (오래 헤맸고, 사용자 원문: 「나는 텍스처 업로드를 켜기로 쓴다」)

  ⇒ 세 겹의 안전장치:

      ① 패널 `mkTex`: 레이어의 메인 텍스처 파일을 고르면 `use = true` 도 함께
      ② `applyLilConfig`: `tex` 가 있으면 ⇒ `G.use = true`(모든 경로)
      ③ **읽기 경로** `normalizeLayerUse()`: `lilCfgFor` 의 두 반환 지점을 모두 통과
         ⇒ **오래된 설정**(텍스처가 이미 선택되어 onchange 가 다시 발생하지 않음)도 보정됨.

  ⚠️ 부작용: 「사용 = 0」으로 텍스처가 이미 있는 레이어를 잠시 끄는 것은 **불가**.
     끄려면 텍스처 줄의 「지우기」를 누르세요(직관과 일치)

### 9. ★★ **장기 버그** 하나의 수정 (영향 범위 최대)

  ⚠️ three 의 toon 조명은 **`material.diffuseColor`**(그 struct)를 읽습니다.
     **국소** `diffuseColor` 가 아닙니다:

      lights_toon_pars_fragment:
          reflectedLight.directDiffuse   += irradiance * BRDF_Lambert( material.diffuseColor );
          reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );

  ⇒ 그런데 우리는 계속 국소 `diffuseColor` 에 썼으므로 ⇒ **조명에 전혀 영향이 없었습니다**.
  ⇒ 그리고 `enableLighting = 1` 이면 after 블록의 `srcA = a × (1-el) = 0` ⇒ **양쪽 모두 무력**.
  ⇒ ⇒ **「조명 참여 비율 = 1」(기본)일 때 「메인 컬러 2nd / 3rd」가 완전히 보이지 않음**.
     기능이 사실상 **반쯤 폐기 상태**로 오래 잠복했습니다.

  ### ✅ 해결: `afterMaterial` 구간을 추가로 생성

      #include <lights_fragment_begin> 이전  ⇒ before        (레이어 색 계산 · diffuseColor 기록)
      #include <lights_fragment_begin> 이후  ⇒ afterMaterial (material.diffuseColor 에 전달) ★
      #include <dithering_fragment> 이전      ⇒ after         (미수광 부분 / 디졸브 가장자리)

      material.diffuseColor.rgb = mix( material.diffuseColor.rgb,
                                        ba3dColor2nd.rgb, ba3dColor2nd.a * el );

  ⚠️ **반드시 include 이후** —— `material` 은 **그 include 안에서** 대입됩니다.
  ⚠️⚠️ **`ba3dLc` 를 참조할 수 없음** —— before 의 `{ }` 블록 안 지역 변수입니다.
     afterMaterial 은 블록 바깥 ⇒ GLSL 에는 블록 외 가시성이 없음 ⇒ 컴파일 실패.
     ⇒ 서두에서 선언한 `ba3dColor2nd` / `ba3dColor3rd` 를 사용하세요.

### 9.5 보충: 레이어 디졸브 / Decal 디버그 / MatCap / 외곽선 스텐실

  #### 메인 컬러 레이어 2nd / 3rd 의 레이어 디졸브 (`main2nd.dissolve*` / `main3rd.dissolve*`)

  | 키 | 기본값 | 대응 |
  |---|---|---|
  | `dissolveThreshold` | 0 | `_Main2ndDissolveParams.x` 임계값(텍스처 모드의 판정 기준) |
  | `dissolveSoftness` | 0 | `..y` 페더(경계 부드럽게) |
  | `dissolveDir` | 0 | `..z` 방향: 0=버텍스 컬러 사용 · 1=텍스처 사용 |
  | `dissolveNoiseStrength` | 0 | `_Main2ndDissolveNoiseStrength` 노이즈 강도 |

  ⚠️ 레이어 디졸브 파라미터는 lilToon 에서 **vec4** 로 묶여 있고(`.x` 임계값 / `.y` 페더 /
     `.z` 방향), 패널에서는 슬라이더 세 개로 나뉘어 있습니다.
  ⚠️ 디졸브의 `alphaTest` 는 ≥ 0.5 여야 실제로 discard 됩니다.
     그리고 `alphaTest` 의 **유일한 권위**는 `syncDissolveAlphaTest`(1 장 참고)

  #### Decal 디버그 스위치 (`main2nd.decalDebug` / `main3rd.decalDebug`)

  **우리가 추가한 것**(lilToon 에는 없음), 기본 0:

      0 = 정상
      1 = Decal 의 가장자리 AA 건너뛰기(텍스처 원래 alpha 유지)
      2 = decal UV 를 색으로 출력(R=uv.x · G=uv.y · B=1 · a=1)
      3 = alpha 를 1 로 강제(RGB 유지)

  ⇒ 「Decal 을 켰는데 화면이 안 변한다」를 이분 탐색으로 좁힐 때:

      1 에서 변함 ⇒ **가장자리 AA** 가 alpha 를 0 으로 지운 것(decal UV 가 [0,1] 을 벗어남)
      2 에서 변함 ⇒ 샘플링은 동작 ⇒ 문제는 alpha / 블렌드
      3 에서 변함 ⇒ 샘플링됨 ⇒ 문제는 색 / 블렌드
      모두 안 변함 ⇒ 이 GLSL 이 **셰이더에 전혀 들어가지 않음**(`[inject]` 로그 확인)

  #### 레이어 UV 회전각 (`main2nd.texAngle` / `main3rd.texAngle`)

  `_Main2ndTexAngle` 대응, 기본 0, 단위는 라디안.
  ⚠️ 회전 중심은 **(0.5, 0.5)** 이며 UV 원점이 아닙니다.
  ⚠️ 이 레이어의 UV 가 작은 아일랜드(얼굴 데칼에 흔함)라면, 회전 후 통째로
     샘플 범위를 벗어날 수 있음 ⇒ 「돌아간」 것이 아니라 「사라진」 것처럼 보입니다.

  #### MatCap 의 두 가지 추가 키 (`matcap.*` / `matcap2nd.*`)

  | 키 | 기본값 | 대응 |
  |---|---|---|
  | `customNormal` | 0 | `_MatCapNormalStrength` 의 스위치(노멀 맵으로 MatCap N 을 교란할지) |
  | `vrParallax` | 1 | `_MatCapVRParallaxStrength` ⚠️ **비 VR 에서 무효**, `LILTOON2.x.ko.md §7.1` 참고 |

  ⚠️ `vrParallax` 를 남긴 것은 lilToon 속성 표와 정렬을 위해서뿐이며 Web 에서는 **영원히 효과가 없습니다**.
     (`lil_common_macro.hlsl:696`: `!USING_STEREO_MATRICES` 이면 b 를 그대로 반환)

  #### 외곽선의 스텐실 파라미터 (`outline.stencilPass` / `outline.stencilReadMask`)

  | 키 | 기본값 | 대응 |
  |---|---|---|
  | `stencilPass` | 0 | `_OutlineStencilPass`(외곽선 자체의 스텐실 조작) |
  | `stencilReadMask` | 255 | `_OutlineStencilReadMask` |

  ⇒ 같은 계열의 `outline.stencil*`(Ref / Comp / WriteMask / Fail / ZFail)도 있으며
     「스텐실 모드 드롭다운」절을 참고.
  ⚠️ three 는 Unity 만큼 완전한 스텐실 API 를 제공하지 않아 ⇒ 가능한 것만 매핑했습니다.
     불가능한 것(예: `_StencilFail` 의 일부 조합)은 알려진 편차에 속합니다.

### 10. 진단 로그 일람 (조사할 때 이것부터)

      [layer] 2nd | use=… tex=… isDecal=… uvMode=… blendMode=… enableLighting=…
          ⇒ lilMainLayerGLSL 의 return null **이전**에 **무조건** 출력
      [inject] <머티리얼> 레이어2nd | 매칭 include=… | before 길이=… | 주입 후 ba3dLc 포함=…
          ⇒ **주입 시점**의 로그, 「텍스트가 생성됨」과 「텍스트가 셰이더에 삽입됨」을 구분.
      [decal] 2nd | … rawTexST=… rawAnim=… rawSub=…
          ⇒ **원시값** 포함, 패널 입력이 들어왔는지 한눈에.
      [uv-check] <머티리얼>: uv1 존재 · 범위=… · 탄젠트 있음/없음
          ⇒ Decal / 단면 표시의 사전 점검.
      [lightClamp] / [reflection] / [mainTex] / [dither] / [renderState] / …

  ⚠️ 경험: **진단 로그는 의심하는 판정 바로 앞에 찍어야** 하며, 그렇지 않으면 정보량이 부족합니다.



