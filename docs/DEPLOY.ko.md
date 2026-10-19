# 3D 캐릭터 모델 웹 내장 마스코트 배포 안내

[简体中文](DEPLOY.md) ｜ [繁體中文](DEPLOY.zh-TW.md) ｜ [English](DEPLOY.en.md) ｜ [日本語](DEPLOY.ja.md) ｜ **한국어**

순수 정적 사이트이며 **빌드 단계도, CDN 의존도, Node 도 필요 없습니다**. 모든 경로가 상대 경로라 루트 배포든 하위 경로 배포든 설정을 바꾸지 않아도 됩니다.
`dist/` 는 미리 패키징되어 있으므로 이 디렉터리의 **모든 파일을 그대로 웹사이트 루트**(또는 임의의 하위 디렉터리)에 업로드하면 정적 호스팅만으로 동작합니다 (Nginx / Apache / Netlify / Cloudflare Pages / OSS / COS 모두 가능).

> 로컬에서 먼저 보고 싶다면 **개발 리포지터리**에서 `node scripts/serve.mjs 5199` 를 실행한 뒤 <http://127.0.0.1:5199/> 를 열면 됩니다.
> (순수 정적 사이트이므로 Node 는 필수가 아닙니다. 브라우저로 직접 열거나 아무 정적 서버에 올려도 됩니다.)

| 플랫폼 | 처리 |
|---|---|
| Netlify / Cloudflare Pages | `_headers` (배포 패키지 루트에 포함) |
| Apache | `.htaccess` (배포 패키지 루트에 포함) |
| GitHub Pages | `.nojekyll` 첨부됨 |
| Nginx | `mime.types` 에 `model/gltf-binary glb;` 를 추가하는 편이 좋음 |

## 一. 반드시 업로드해야 하는 파일

| 경로 | 설명 |
|---|---|
| `index.html` | 3D 모델 뷰어 (전체 화면, 콘솔 UI) |
| `viewer.js` | 뷰어 코어 (`createViewer` / `autoMount`, ES module, index.html 이 직접 참조) |
| `unity-anim.js` | **Unity `.anim` 변환** (AnimationClip → three AnimationClip): 표정(blendShape) / 의상 표시·숨김(`m_IsActive`) / 일반 변환 커브 |
| `vendor/three/three.module.js` | three.js r185.1 본체 (importmap 의 `"three"` 가 이것을 가리킴) |
| `vendor/three/three.core.js` | ↑ r185 부터 분리된 코어, `three.module.js` 가 상대 import 로 참조하므로 **빠뜨리면 안 됨** |
| `vendor/three/controls/OrbitControls.js` | 카메라 조작 (회전 / 확대·축소) |
| `vendor/three/loaders/GLTFLoader.js` | 모델 로드 (`.glb` / `.gltf`) |
| `vendor/three/loaders/FBXLoader.js` | 모델 로드 (`.fbx`) |
| `vendor/three/libs/fflate.module.js` | ↑ FBXLoader 의 전이 의존 (바이너리 FBX 압축 해제), **빠뜨리면 안 됨** |
| `vendor/three/curves/NURBSCurve.js` | ↑ FBXLoader 의 전이 의존, **빠뜨리면 안 됨** |
| `vendor/three/curves/NURBSUtils.js` | ↑ NURBSCurve 의 전이 의존, **빠뜨리면 안 됨** |
| `vendor/three/environments/RoomEnvironment.js` | PBR 환경용 베이크 텍스처 |
| `vendor/three/effects/OutlineEffect.js` | 외곽선 |
| `vendor/three/utils/BufferGeometryUtils.js` | ↑ GLTFLoader 의 전이 의존, **빠뜨리면 안 됨** |
| `vendor/three/utils/SkeletonUtils.js` | ↑ 위와 동일 (의존 사슬의 한 고리) |
| `liltoon-bridge.js` | **4 번째 셰이딩 백엔드**의 어댑터 (우리 lilCfg / Unity 머티리얼을 three-liltoon 에 전달) |
| `vendor/three-liltoon/index.js` | ↑ three-liltoon 런타임 (MIT) |
| `vendor/three-liltoon/chunk-KNGRDLOZ.js` | ↑ 컴파일된 lilToon GLSL (1.9 MB, **생략 불가**) |
| `vendor/three-liltoon/chunk-WFYRXLGW.js` | ↑ 런타임의 작은 chunk |
| `vendor/three-liltoon/gltf.js` · `vrm.js` | ↑ 선택 확장 (glTF 의 `MOCHIYA_materials_liltoon` / VRM) |
| `vendor/three-liltoon/schema/*.json` | ↑ 머티리얼 확장의 JSON schema |
| `vendor/three-liltoon/THIRD_PARTY_NOTICES.md` | ↑ 서드파티 고지 (MIT 는 패키지 동봉 요구) |
| `assets/sample.glb` | 모델 파일 (데모용, 자기 모델로 바꾸려면 그대로 교체) |
| `assets/sample.json` | 해당 모델의 설정: 모델 / 입가 텍스처 / 스케일 / 프레이밍 / 렌더 / 라이팅 / 배경 |
| `assets/fallback.json` | 위와 동일하며 같은 모델을 가리킴. 「복사해서 세 군데만 고치는」 템플릿 용도 |
| `assets/mouth/*.png` | 입가 아틀라스 텍스처 (`sample.json` 은 `Character_Mouth_High.png` 사용) |
| `.htaccess` | Apache 용: `.glb` MIME + 캐시 정책 |
| `_headers` | Netlify / Cloudflare Pages 용: 위와 동일 |
| `.nojekyll` | GitHub Pages 용: 0 바이트 마커로 Jekyll 처리를 막음 (**비어 있는 것이 정상**) |
| `nginx-3d-viewer.conf` | nginx 용: 설정 템플릿, `server { }` 에 그대로 복사 (三 장 참고) |
| `DEPLOY.md` | 이 문서 |

> `viewer.js` 는 위 표의 vendor 파일 5 개에만 의존합니다. `vendor/three/` 디렉터리 전체는 1.4 MB 입니다.
>
> **4 번째 셰이딩 백엔드는 반드시 패키지에 포함**해야 합니다 (`liltoon-bridge.js` + `vendor/three-liltoon/`, 원본 2.2 MB,
> 압축 후 약 0.35 MB). 빠뜨리면 「lilToon 소스」로 전환할 때 404 가 납니다.
>
> ⚠️ 두 가지를 구분하세요:
> - **패키징**: 이 파일들은 배포 패키지에 **반드시 있어야** 합니다(선택 사항 아님).
> - **런타임**: 브라우저가 **필요할 때 내려받습니다** — viewer.js 가 `new URL(...)` 로 동적 import 하므로
>   사용자가 그 모드를 켜지 않으면 1 바이트도 요청되지 않습니다. 그래서 **빌드 산출물에서는 보이지 않습니다**
>   (그렇지 않으면 esbuild 가 1.9 MB GLSL chunk 를 dist 단일 파일에 넣게 됩니다).
>
> ⚠️ **단일 파일 임베드 판(`dist/3d-viewer.min.js`)은 이 백엔드를 쓸 수 없습니다**(실측):
> 그쪽 `index.js` 는 `three` 를 **베어 모듈로 참조**(`import ... from "three"`)하는데,
> 단일 파일 판은 three 를 패키지에 넣어 importmap 이 없습니다 ⇒ `Failed to resolve module specifier "three"` 오류가 납니다.
> 브리지 계층과 `vendor/three-liltoon/` 을 dist 옆에 두어도 소용없습니다(실측).
> 실패는 **우아하게** 처리됩니다: 콘솔에 오류 한 줄을 남기고 자동으로 `lilToon 스타일` 모드로 돌아가며 다른 기능은 전혀 영향받지 않습니다.
> ⇒ 이 백엔드를 쓰려면 **표준 배포**(`index.html` + `vendor/three/` + importmap)로 가야 합니다.
>
> 검증: `node scripts/check-lilsrc.mjs` (실제로 그 모드로 전환해 라이브러리 파일 전부 200,
> 잔여 머티리얼 없음, 메시/삼각형 수 복원을 단언).

## 一·五. 이 배포 디렉터리는 어떻게 만들어지는가 (유지보수자용)

  ⚠️ `_deploy/3D_Model_Web_Viewer/` 는 **손으로 만든 것이 아니라** 스크립트가 **명시적 목록**에 따라 생성합니다:

      node scripts/make-deploy.mjs            # 재생성 (대상 디렉터리를 먼저 비움)
      node scripts/make-deploy.mjs --check    # 비교만 · 불일치면 exit=1 (CI 용)
      node scripts/check-release-safety.mjs   # 산출물 단언: 모델은 sample.glb 뿐 · 내부 문서/경로 없음 · 문서에 죽은 링크 없음

  ⇒ 목록의 **각 항목**은 리포지터리에서 원본을 찾을 수 있어야 합니다(아래 표 참고).
  ⇒ 배포 패키지에 무언가를 추가하려면 **반드시 스크립트의 `MANIFEST` 를 수정**하고 이 문서의 두 표도 함께 갱신해야 합니다.

  ### 왜 이런 제약이 필요한가

  과거에 손으로 만들다가 두 번 어긋났습니다:

      · **오래되고 인코딩이 깨진** `check-glsl.mjs`(6.6 KB, 아무도 참조하지 않음)가 남아 있었음
      · `scripts/` 전체를 복사해 넣어 배포 패키지에 **개발 도구 5 개**가 추가됨
        (배포 디렉터리에는 사이트 실행에 필요한 파일만 두어 개발 도구가 섞이지 않게 함)

  ### `develop_res/deploy-src/` 란

  **배포 패키지에만 속하고** 리포지터리 루트에 대응 원본이 없는 파일이 있습니다:

      develop_res/deploy-src/.htaccess              → .htaccess
      develop_res/deploy-src/_headers               → _headers
      develop_res/deploy-src/.nojekyll              → .nojekyll            (0 바이트)
      develop_res/deploy-src/nginx-3d-viewer.conf   → nginx-3d-viewer.conf
      develop_res/deploy-src/_lilpresets.json       → _lilpresets.json     (패널의 lilToon 프리셋 데이터)

  ⇒ `develop_res/deploy-src/` 에 모아 두어 배포 디렉터리 전체가 **완전히 재현 가능**합니다.

  ### 현재 총 **61 개 파일 (약 15.2 MB)**

      필수  index.html · viewer.js · liltoon-bridge.js · vendor/three 의 12 개 ·
            assets (sample.glb / json 2 개 / 입가 텍스처 3 장) ·
            .htaccess / _headers / .nojekyll / nginx-3d-viewer.conf
      선택  dist 2 개 · 데모 페이지 · vendor/three-liltoon 의 7 개 · _lilpresets.json ·
            입가 인덱스 이미지 2 장 · 테스트 텍스처 ·
            README / CONFIG / DEPLOY / LILTOON1.x / LILTOON2.x (각각 `.en` / `.ja` / `.zh-TW` / `.ko` 포함) ·
            LICENSE · THIRD-PARTY-NOTICES.md

> ℹ️ 개발 단계의 검사기(`scripts/check-*.mjs` · `make-deploy.mjs`)는 빌드·검증 흐름을 위한 것이며
> 정적 사이트 실행에는 필요 없습니다 — `check-layout.mjs` 는 헤드리스 브라우저로 플로팅 창 레이아웃
> (드래그 / 리사이즈 / 영속화)을 검증하므로, 배포 시에는 Node 도 브라우저 자동화도 필요 없습니다.
> 이 검사기들은 개발 리포지터리에서만 실행되며, 패키지에 포함된 `.md` 문서가 배포 절차를 온전히 설명합니다.

> ⚠️ **`index.html` 은 현재 플로팅 창 레이아웃**(Unity 스타일)이며 씬 / 툴바 / 상태 /
> 파라미터 패널이 모두 드래그·리사이즈 가능한 독립 창이고 위치·크기는 브라우저 localStorage 에 저장됩니다.
> ⇒ 배포와 무관한 순수 프런트엔드 사항이며, 자세한 내용은 `CONFIG.md` 의 「★ 플로팅 창 레이아웃」 절을 보세요.

## 二. 선택 파일 (실행에 영향 없음, 지워도 동작)

| 경로 | 설명 |
|---|---|
| `embed-demo.html` | 3D 모델 웹 내장 마스코트 데모 페이지 (오버레이 + 모션 선택 + % 스케일) |
| `dist/3d-viewer.js` | **자체 완결 단일 파일 판**(약 1.94 MB). 다른 페이지에서 `<script type="module">` 로 쓰며 **importmap 도 vendor/ 도 불필요** |
| `dist/3d-viewer.min.js` | 위의 압축판(약 0.92 MB). `embed-demo.html` 이 이것을 사용 |
| `CONFIG.md` | 설정 필드 전체 레퍼런스 (`data-*` 속성, 이벤트, 전역 훅 포함) |
| `CONFIG.zh-TW.md` · `CONFIG.en.md` · `CONFIG.ja.md` · `CONFIG.ko.md` | 설정 레퍼런스의 번체 / 영어 / 일본어 / 한국어판 |
| `README.md` | 프로젝트 설명 |
| `docs/README.zh-TW.md` · `docs/README.en.md` · `docs/README.ja.md` · `docs/README.ko.md` | 프로젝트 설명의 번체 / 영어 / 일본어 / 한국어판 |
| `DEPLOY.zh-TW.md` · `DEPLOY.en.md` · `DEPLOY.ja.md` · `DEPLOY.ko.md` | 이 문서의 번체 / 영어 / 일본어 / 한국어판 |
| `LICENSE` | 프로젝트 라이선스 (MIT © 2026 Hazuki Kaguya) — **배포 시 반드시 유지** |
| `THIRD-PARTY-NOTICES.md` | 서드파티 고지 (three.js / lilToon / three-liltoon 의 MIT 전문) — **배포 시 반드시 유지** |
| `LILTOON1.x.md` · `LILTOON2.x.md` | lilToon 기준선 대조 (1.3.7 아카이브 / 2.3.4 현행). `.zh-TW` · `.en` · `.ja` · `.ko` 판 있음 |
| `assets/mouth/_cells-preview-*.png` | 입가 아틀라스 8×8 인덱스 이미지, `mouthCell` 을 고를 때 참고용 |

메인 페이지 실행에 실제로 필요한 것은 **`index.html` + `viewer.js` + `vendor/three/` 의 12 개 파일 + `assets/` 의 모델과 설정**뿐입니다.
표의 나머지는 플랫폼/용도에 따른 선택 사항입니다 (`.htaccess` / `_headers` / `.nojekyll` / `nginx-3d-viewer.conf` / `DEPLOY.md`).

## 三. 하위 디렉터리에 배포하기 (예: nginx 의 `api.sample.site/3d-viewer/`)

**파일은 하나도 바꿀 필요가 없습니다** — 페이지의 모든 참조가 상대 경로(`./viewer.js`, `./vendor/three/...`, `./assets/...`)이고
importmap 도 `./vendor/three/` 이므로, 디렉터리 전체를 임의의 하위 디렉터리에 넣어도 바로 동작합니다.

주의할 점은 두 가지입니다.

### 1. 반드시 끝에 슬래시를 붙여 접근

```
✅  https://api.sample.site/3d-viewer/
❌  https://api.sample.site/3d-viewer
```

끝 슬래시가 없으면 브라우저가 `3d-viewer` 를 **파일**로 간주해, 상대 경로 `./vendor/three/...` 가
사이트 루트 `/vendor/three/...` 로 해석되어 전부 404, 흰 화면이 됩니다. nginx 에서 강제 리다이렉트하면 됩니다:

```nginx
location = /3d-viewer {
    return 301 /3d-viewer/;
}
```

### 2. nginx 설정

`.htaccess` 는 Apache 용, `_headers` 는 Netlify / Cloudflare Pages 용이며 **nginx 는 둘 다 읽지 않습니다**.
MIME 과 캐시를 직접 설정해야 합니다. 그대로 복사할 수 있는 설정은 같은 디렉터리의 **`nginx-3d-viewer.conf`** 에 있고, 핵심은 다음과 같습니다:

```nginx
location /3d-viewer/ {
    index index.html;
    try_files $uri $uri/ =404;

    location ~* \.(glb|png|js|mjs)$ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
    location ~* \.json$ {
        add_header Cache-Control "no-cache";     # 설정을 올리면 즉시 반영
    }
}
```

`.glb` 의 MIME 은 전역 `/etc/nginx/mime.types` 에 한 줄 추가하는 편이 좋습니다:

```
model/gltf-binary  glb;
```

> ⚠️ location 안에 맨 `types { model/gltf-binary glb; }` 를 쓰지 마세요 — nginx 의 `types` 블록은
> 상속된 타입 표를 **통째로 덮어써서** `html` / `css` / `png` 이 전부
> `application/octet-stream` 이 됩니다(브라우저가 페이지를 표시하지 않고 다운로드).
> server 블록에 넣어야 한다면 먼저 `include mime.types;` 를 써야 합니다.

### 디렉터리 구조는 바꿀 수 없음

```
3d-viewer/
├── index.html
├── viewer.js
├── .htaccess           ← Apache 용
├── _headers            ← Netlify / Cloudflare Pages 용
├── .nojekyll           ← GitHub Pages 용 (0 바이트)
├── nginx-3d-viewer.conf← nginx 용
├── vendor/three/…      ← index.html 과 같은 레벨이어야 함 (importmap 이 ./vendor/three/)
│   ├── three.module.js
│   ├── three.core.js
│   ├── controls/OrbitControls.js
│   ├── loaders/GLTFLoader.js
│   ├── environments/RoomEnvironment.js
│   ├── effects/OutlineEffect.js
│   └── utils/BufferGeometryUtils.js   ← GLTFLoader 의 전이 의존, 빠뜨리면 안 됨
├── assets/
│   ├── sample.glb      ← 모델
│   ├── sample.json     ← 설정
│   ├── fallback.json
│   └── mouth/*.png     ← 입가 아틀라스
├── dist/…              ← 선택: 다른 페이지에 임베드할 단일 파일 판
└── *.html / *.md       ← 선택: 데모 페이지와 문서
```

### 간단 확인

```bash
curl -I https://api.sample.site/3d-viewer          # 기대: 301 → …/3d-viewer/
curl -I https://api.sample.site/3d-viewer/         # 기대: 200
curl -I https://api.sample.site/3d-viewer/vendor/three/three.module.js   # 기대: 200
curl -I https://api.sample.site/3d-viewer/assets/sample.glb             # 기대: 200
```

---

## 四. 서버 요구 사항

1. **`.glb` 는 올바른 MIME 을 반환해야 함**
   없어도 브라우저는 로드합니다(GLTFLoader 는 MIME 을 보지 않음). 다만 일부 CDN / 중간 계층이 막을 수 있으니 `.htaccess` 나 `_headers` 로 설정하세요.

2. **`assets/*.json` 은 긴 캐시를 쓰면 안 됨**
   설정 파일은 런타임에 읽히므로 수정하면 즉시 반영되어야 합니다. 두 설정 파일 모두 `no-cache` 를 지정했습니다.
   호스팅 플랫폼이 이 파일들을 인식하지 못하면(**nginx 는 둘 다 읽지 않음**, 三 장 참고) 직접 추가하세요:
   ```nginx
   location ~* \.json$ { add_header Cache-Control "no-cache"; }
   location ~* \.glb$  { default_type model/gltf-binary; }
   ```

3. **ES module + importmap 지원 필요**
   최신 브라우저는 모두 지원합니다. `index.html` 에서 쓰는 형태는:
   ```html
   <script type="importmap">
   { "imports": { "three": "./vendor/three/three.module.js", "three/addons/": "./vendor/three/" } }
   </script>
   ```
   **업로드 시 디렉터리 구조를 바꿀 수 없으며**, `vendor/three/` 는 `index.html` 과 같은 레벨이어야 합니다.

4. **모든 경로가 상대 경로**이므로 도메인 루트에도, 하위 디렉터리(예: `/ba3d/`)에도 파일 수정 없이 배포할 수 있습니다.

## 五. 업로드 후 열 수 있는 주소

| 주소 | 내용 |
|---|---|
| `/` | 전체 화면 뷰어 (「사용자 모델」업로드 패널 포함) |
| `/?config=./assets/sample.json` | 데모 모델 |
| `/embed-demo.html` | 웹 내장 마스코트 데모 |

## 六. 모델 하나만 배포하고 싶을 때

그 `.glb` 하나 + 대응하는 `.json` + 사용한 `assets/mouth/*.png` 만 올리면 됩니다.
현재 배포 패키지가 바로 그 형태입니다: `sample.glb` 하나에 `sample.json`(그리고 같은 모델을 가리키는 `fallback.json`).
`fallback.json` 은 템플릿 용도일 뿐이며 지워도 실행에 영향이 없습니다.

## 七. 모델 교체 / 추가

1. `.glb` 를 `assets/` 에 넣기
2. 기존 `.json` 을 복사 (`assets/fallback.json` 이 템플릿) 후 세 군데 수정:
   - `model.url` → 새 `.glb` 를 가리키게 (json 자신의 디렉터리 기준 상대 경로)
   - `model.mouthAtlas` → 입가 아틀라스
   - `animation.name` → 원하는 시작 모션 (`"Cafe_Idle"` 같은 축약형도 가능)
3. `/?config=./assets/<내 파일>.json` 으로 접속해 확인

필드 의미는 `CONFIG.md` 를 참고하세요.
