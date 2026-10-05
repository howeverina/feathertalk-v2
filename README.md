# feathertalk 2

저사양 유저를 겨냥한 움직이는 버츄얼 캐릭터. 서버 없이 브라우저만으로 동작하는 정적 사이트입니다 (Nuxt 4, SPA).

- 사이트: https://v2.feathertalk.live
- 버전 1: https://feathertalk.live ([howeverina/feathertalk](https://github.com/howeverina/feathertalk))

## 만든 사람

- 콘셉트와 초기 구현(버전 1): 연이나
- 버전 2 구현: [Claude](https://claude.ai)(Anthropic의 AI)로 제작

## 사용법

1. 편집기(`/`)에서 **+ 레이어 추가**로 부위를 고르고 이미지 주소를 넣거나 파일을 올립니다.
   이미지는 모두 같은 크기의 정사각형 투명 PNG여야 합니다.
2. 미리보기의 **+ 십자**를 끌어 얼굴 중심에, **점선 원**을 얼굴 크기에 맞춥니다.
3. 레이어마다 **깊이**(앞/뒤), **볼록/오목**을 조절하고 머리카락 레이어는 **머리카락 물리**를 켭니다.
4. **라이브 시작**을 누르면 `/live`로 이동합니다. 숫자키 1~0으로 표정을 바꿀 수 있습니다.

설정은 브라우저 localStorage(`ftModel`)와 IndexedDB(업로드한 파일)에 저장되고, **백업 내보내기/불러오기**로 옮길 수 있습니다.
아무 설정이 없으면 `public/assets`의 기본 캐릭터가 나옵니다.

## 개발

```sh
pnpm install
pnpm dev        # http://localhost:3000
pnpm generate   # 정적 빌드 → .output/public
```

`main`에 push하면 GitHub Actions(`.github/workflows/deploy.yml`)가 빌드해서 GitHub Pages에 배포합니다.
(저장소 Settings → Pages → Source가 **GitHub Actions**, 사용자 지정 도메인이 `v2.feathertalk.live`로 설정되어 있어야 합니다.)

## 구조

- `app/pages/index.vue`, `app/pages/live.vue`: 편집기 / 라이브 화면
- `app/components/`: 미리보기, 레이어 목록, 속성 패널 등
- `app/composables/useEditor.ts`: 편집기 상태 (모델, 선택, 미리보기)
- `app/lib/model.ts`: 레이어 데이터, 저장, 기존 데이터 변환, 백업
- `app/lib/renderer.ts`: WebGL 메시 변형 렌더러
- `app/lib/physics.ts`: 머리 움직임과 머리카락 스프링
- `public/legacy/`: 버전 1 화면 (8장 고정 레이어, `/legacy/index.html`). 같은 브라우저에서 이 화면에 저장한 설정은 편집기를 처음 열 때 새 레이어 구조로 변환됩니다. (feathertalk.live에 저장된 설정은 도메인이 달라 넘어오지 않습니다.)
