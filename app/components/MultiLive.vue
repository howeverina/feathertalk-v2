<script setup lang="ts">
// 멀티 라이브: 무대를 화면에 꽉 차게(16:9) 보여주고, 화면 캡처로 누가 말하는지 감지한다.
import { ArrowLeft, MonitorUp } from '@lucide/vue'
import { loadSlots, selectStorage, type Model } from '~/lib/model'
import { ScreenWatcher, loadMulti } from '~/lib/multi'

selectStorage(true)
const models = shallowRef<Model[]>(loadSlots().slots)
const settings = reactive(loadMulti())

// 마우스가 2초 동안 멈추면 컨트롤을 숨긴다 (캡처 중일 때만)
const idle = ref(false)

useHead({ bodyAttrs: { class: computed(() => 'multi-live' + (idle.value ? ' idle' : '')), style: computed(() => `background-color: ${settings.background}`) } })

const watcher = new ScreenWatcher()
const capturing = ref(false)
const talking = reactive<boolean[]>(new Array(10).fill(false))
watcher.onFrame = () => {
  for (let i = 0; i < 10; i++) if (talking[i] != watcher.talking[i]) talking[i] = watcher.talking[i]!
}
watcher.onStop = () => {
  capturing.value = false
  talking.fill(false)
}

async function toggleCapture() {
  if (watcher.running) return watcher.stop()
  try {
    await watcher.start()
  } catch (e: any) {
    alert('화면 캡처를 시작하지 못했어요: ' + (e?.message || e))
    return
  }
  capturing.value = true
  watcher.run(() => settings)
}

let idleTimer: ReturnType<typeof setTimeout> | undefined
function onMove() {
  idle.value = false
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => idle.value = capturing.value, 2000)
}
onMounted(() => document.addEventListener('mousemove', onMove))
onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onMove)
  clearTimeout(idleTimer)
  watcher.stop()
})

const regionsReady = computed(() => settings.chars.filter(c => c.on).every(c => c.region))
</script>

<template>
  <div class="live">
    <div class="controls">
      <a href="/multi" class="back"><ArrowLeft :size="15" /> 설정</a>
      <button class="cap" :class="{ on: capturing }" @click="toggleCapture"><MonitorUp :size="15" /> {{ capturing ? '화면 캡처 중지' : '화면 캡처 시작' }}</button>
      <span v-if="!capturing" class="hint">SYNCROOM이나 Discord 창을 공유하면 말하는 캐릭터의 입이 움직여요.</span>
      <span v-else-if="!regionsReady" class="hint warn">감지 영역을 지정하지 않은 캐릭터가 있어요 (설정에서 지정).</span>
    </div>
    <div class="stage-box">
      <MultiStage :settings="settings" :models="models" :talking="talking" />
    </div>
  </div>
</template>

<style>
body.multi-live {
  margin: 0;
  height: 100dvh;
  overflow: hidden;
}

body.multi-live.idle {
  cursor: none;
}
</style>

<style scoped>
.stage-box {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
}

.stage-box > * {
  width: min(100vw, calc(100dvh * 16 / 9));
}

.controls {
  position: fixed;
  z-index: 10;
  top: 6px;
  left: 6px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.88);
  border-radius: 10px;
  font-size: 14px;
  transition: opacity 0.4s;
}

.idle .controls {
  opacity: 0;
  pointer-events: none;
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-weight: 700;
}

.cap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 8px;
  padding: 3px 10px;
  cursor: pointer;
}

.cap.on {
  background: var(--main);
  border-color: var(--main);
  color: white;
}

.hint {
  font-size: 12px;
  color: var(--muted);
}

.hint.warn {
  color: #e5484d;
}
</style>
