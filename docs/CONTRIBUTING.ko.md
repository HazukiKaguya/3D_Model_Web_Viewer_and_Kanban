# 기여 가이드

[简体中文](../CONTRIBUTING.md) ｜ [繁體中文](CONTRIBUTING.zh-TW.md) ｜ [English](CONTRIBUTING.en.md) ｜ [日本語](CONTRIBUTING.ja.md) ｜ **한국어**

버그 보고, 최소 재현, 렌더링 개선을 환영합니다. 시작 전에 [lilToon 이식 기준선](LILTOON2.x.ko.md), [설정과 구현 세부](CONFIG.ko.md), [배포 안내](DEPLOY.ko.md)를 먼저 읽어 주세요.

## 소스에서 빌드

Node.js 20 이상이 필요합니다.

```bash
npm install                       # 최초 1회
node scripts/serve.mjs            # UI 조정용 정적 서버
node scripts/build.mjs            # dist/3d-viewer.js (비압축)
node scripts/build.mjs --minify   # dist/3d-viewer.min.js (배포용)
```

제품 코드는 `viewer.js`, `index.html`, `unity-anim.js`, `unity-scene.js`, `liltoon-bridge.js`입니다. 업스트림 런타임은 `vendor/three-liltoon`에 있으며 패키지에 포함됩니다. 그 소스는 버전 비교용으로 연구 디렉터리에 보관되어 있고, 업그레이드 시 `scripts/make-deploy.mjs`의 목록도 함께 갱신해야 합니다.

제출 전에 세 가지 검사기를 반드시 실행합니다.

```bash
node scripts/check-deploy.mjs            # 배포 산출물 로드: 실패한 요청 없음 · 페이지 오류 없음 · 패널과 내보내기 영역 존재
node scripts/check-release-safety.mjs    # 포함 문서에 내부 경로·죽은 링크 없음 / 포함 모델은 assets/sample.glb 뿐
node scripts/check-lilsrc.mjs            # 4번째 백엔드 배포 점검: 외곽선 · 잔여 머티리얼 · 픽셀 잔차
```

전용 검사기(`check-docs`, `check-glsl`, `check-panel`, `check-assets`, `check-scope`)는 변경 범위에 따라 사용합니다. 릴리스 순서는 `scripts/make-devpack.mjs` 상단의 릴리스 체크리스트를 따릅니다: 문서 → 세 패키지 → 세 검사기.

## 소스 맵

| 위치 | 역할 |
| --- | --- |
| `viewer.js`, `index.html` | 뷰어 본체, UI, lilToon 파라미터 패널 |
| `unity-anim.js`, `unity-scene.js` | Unity 애니메이션과 씬 가져오기 |
| `liltoon-bridge.js` | 우리 설정과 업스트림 런타임 사이의 어댑터 |
| `vendor/three-liltoon` | 업스트림 런타임 (0.1.9, 패키지 포함) |
| `assets`, `vendor/three` | 포함 리소스와 three 의존성 |
| `docs` | 메인 README와 서드파티 고지를 제외한 모든 문서 (5개 언어) |
| `scripts` | 빌드와 검사 스크립트 |
| 연구 디렉터리 | 업스트림 소스, 실험, 내부 문서, 아카이브 (배포물 미포함) |
| `models` | 테스트 모델과 텍스처 픽스처 · **수정하지 마세요** |

## 렌더링 문제 보고

모델과 텍스처 출처, 브라우저와 GPU, 셰이딩 모드, 관련 lilToon 파라미터와 텍스처, 콘솔 경고, 재현 절차를 포함해 주세요. 최소한의 절차적 씬이나 재배포 가능한 모델이 있으면 조사가 쉬워집니다.

Unity와의 차이는 lilToon 버전과 일치시킨 카메라·조명·색 공간 설정도 함께 알려 주세요 (이 프로젝트의 참조 환경: Built-in 파이프라인, Linear 색 공간, 포스트 프로세스 없음).

수치 주장에는 픽스처, 측정 기준, 판정 조건을 명시해 주세요. WebGL 스크린샷 한 장만으로는 Unity와 일치한다는 근거가 되지 않습니다. 같은 씬·같은 파라미터로 비교해야 합니다.

## 제출 규칙

- `README.md`와 `THIRD-PARTY-NOTICES.md`를 제외한 모든 문서는 `docs` 디렉터리에 두며, 배포 패키지도 같은 구조를 유지합니다
- 다국어 문서(`X.md`, `X.en.md`, `X.ja.md`, `X.zh-TW.md`, `X.ko.md`)는 가능한 한 같은 변경에서 함께 갱신합니다
- 포함 문서에 리포지터리 내부 경로를 쓰지 마세요 (`check-release-safety`가 차단합니다)
- 패키지에 추가하는 파일 이름은 ASCII로: 내장 패커가 비ASCII 파일 이름을 지원하지 않아 조용히 누락됩니다
- 재배포 권한이 없는 서드파티素材는 제출하지 마세요
