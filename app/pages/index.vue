<script setup lang="ts">
// 편집기
import { CircleHelp, Play } from '@lucide/vue'

useHead({ bodyAttrs: { class: 'editor' } })

const ed = useEditor()
const guideOpen = ref(!localStorage.getItem('ftGuideDone'))
const importInput = ref<HTMLInputElement>()

function closeGuide() {
  guideOpen.value = false
  localStorage.setItem('ftGuideDone', '1')
}

function toggleGuide() {
  if (guideOpen.value) return closeGuide()
  guideOpen.value = true
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function onImport(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !confirm('지금 설정을 백업 파일 내용으로 바꿀까요?')) return
  try {
    await ed.importBackup(file)
  } catch (err) {
    alert('백업 파일을 읽지 못했어요.')
  }
}

function reset() {
  if (confirm('assets 폴더의 기본 캐릭터로 되돌릴까요?\n지금 레이어 설정과 업로드한 파일이 모두 지워져요. 필요하면 먼저 "백업 내보내기"를 해 두세요.')) {
    ed.reset()
  }
}
</script>

<template>
  <div>
    <header class="navbar">
      <h2 class="logo">Feather-Talk</h2>
      <div class="nav-actions">
        <button class="ghost" @click="toggleGuide"><CircleHelp :size="15" /> 사용법</button>
        <button class="ghost" title="레이어 설정과 업로드한 이미지를 파일 하나로 저장해요" @click="ed.exportBackup()">백업 내보내기</button>
        <button class="ghost" title="백업 파일에서 불러와요 (지금 설정은 덮어써져요)" @click="importInput?.click()">불러오기</button>
        <input ref="importInput" type="file" accept=".json,application/json" hidden @change="onImport">
        <button class="ghost" title="assets 폴더의 기본 그림으로 처음부터 시작해요" @click="reset">기본 캐릭터로 되돌리기</button>
        <a class="button" href="/live">라이브 시작 <Play :size="14" /></a>
      </div>
    </header>

    <main class="wrapper">
      <GuideCard v-if="guideOpen" @close="closeGuide" />

      <div class="editor-grid">
        <PreviewStage />
        <div>
          <LayerList />
          <LayerProps />
          <GlobalSettings />
        </div>
      </div>

      <section class="panel">
        <div><b>제작자: 연이나</b></div>
        <div class="small credit">
          콘셉트와 초기 구현(버전 1)은 연이나가 직접 만들었고, 버전 2의 구현은
          <a href="https://claude.ai">Claude</a>(Anthropic의 AI)로 제작했어요.
        </div>
        <div class="small">연로자 연소자 여러분 하이나!! 연이나라고 합니다.</div>
        <div class="small">제 개인 채널은 아래 링크에서 들어가보실 수 있어요. 원래 개발을 주력으로 하지는 않지만 잘 부탁드립니다.</div>
        <div class="small">
          <a href="https://youtube.com/@however_ina_main">유튜브</a> 그리고
          <a href="https://chzzk.naver.com/1bba9a34d4d2b8b998c36c5cdbc9f4fe/">치지직</a> 링크예요.
        </div>
        <div class="small">
          Feather-Talk는 별도의 서버를 운영하지 않아요. 이미지 제작 방법은 <a href="https://slashpage.com/feathertalk">가이드</a>를 참고하세요.
          예전 화면이 필요하면 <a href="/legacy/index.html">이전 버전 사용하기</a>
          (원래 사이트: <a href="https://feathertalk.live">feathertalk.live</a>).
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.navbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 16px;
  min-height: 3.2rem;
  background-color: var(--main);
  color: white;
}

.logo {
  margin: 0;
  font-size: 1.3rem;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.ghost, .button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.7);
  color: white;
  border-radius: 10px;
  padding: 5px 10px;
  cursor: pointer;
}

.button {
  padding: 6px 14px;
  background-color: white;
  color: var(--main-dark);
  border-radius: 10px;
  font-weight: 700;
}

.wrapper {
  margin: 1rem auto;
  padding: 0 16px;
  max-width: 1200px;
}

.editor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

@media (max-width: 860px) {
  .editor-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.small {
  color: #aaa;
}

.credit {
  color: var(--text);
}
</style>
