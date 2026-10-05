<script setup lang="ts">
// 라이브 화면 (OBS 등에서 캡처)
import { loadModel, resolveSrc } from '~/lib/model'
import { createRenderer, type Renderer } from '~/lib/renderer'
import { Head, HairSystem, Wander, breath, headTarget, lookAt } from '~/lib/physics'

// ---- 설정 (기존과 같은 localStorage 키) ----

function stored(key: string, fallback: number) {
  const v = parseInt(localStorage.getItem(key) || '')
  return isNaN(v) ? fallback : v
}

const thres = ref(stored('ftThres', 30))
const rig = ref(stored('ftRig', 100))
const motionRange = ref(stored('ftMotionRange', 70)) // 자동 모션 범위 (%)
const fps = ref(stored('ftFps', 60)) // 30이면 CPU/GPU 사용량이 절반 가까이
const color = ref(localStorage.getItem('ftColor') || '#00ff00')

watch(thres, v => localStorage.setItem('ftThres', String(v)))
watch(rig, v => localStorage.setItem('ftRig', String(v)))
watch(motionRange, v => localStorage.setItem('ftMotionRange', String(v)))
watch(fps, v => localStorage.setItem('ftFps', String(v)))
watch(color, v => localStorage.setItem('ftColor', v))

const idle = ref(false)
const talking = ref(false)

useHead({
  bodyAttrs: {
    class: computed(() => 'live' + (idle.value ? ' idle' : '')),
    style: computed(() => `background-color: ${color.value}`),
  },
})

// ---- 모델 ----

const stage = ref<HTMLCanvasElement>()
const noGL = ref(false)
const model = loadModel()
let renderer: Renderer | null = null
let raf = 0

// ---- 표정 (숫자키 1~0) ----

let expression = 0
function onKey(e: KeyboardEvent) {
  if (/^[0-9]$/.test(e.key)) expression = (parseInt(e.key) + 9) % 10
}

// ---- 마우스 / 자동 모션 ----

let target = { x: 0, y: 0 } // -1 ~ 1
let lastMouse = -Infinity
let auto = false
const wander = new Wander()
let idleTimer: ReturnType<typeof setTimeout> | undefined

function onMouseMove(e: MouseEvent) {
  if (renderer && stage.value) {
    // 캐릭터 얼굴 중심을 기준으로 커서 쪽을 바라본다
    const r = stage.value.getBoundingClientRect()
    const [x, y, S] = renderer.cssRect()
    target = lookAt(e.clientX, e.clientY, r.left + x + model.center.x * S, r.top + y + model.center.y * S, S)
  }
  lastMouse = performance.now()
  auto = false
  // 마우스가 2초 동안 멈추면 컨트롤을 숨긴다
  idle.value = false
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => idle.value = true, 2000)
}

// 마우스가 1.5초 동안 멈추면, 마지막 마우스 위치에서부터 천천히 둘러보기 시작한다
function autoMotion(now: number) {
  if (now - lastMouse < 1500) return
  if (!auto) {
    auto = true
    wander.reset(target)
  }
  target = wander.update(now, motionRange.value / 100)
}

// ---- 마이크 (입) ----

let volume = 0
let micTimer: ReturnType<typeof setInterval> | undefined
let audio: { ctx: AudioContext; stream: MediaStream } | null = null

async function startMic() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } })
    const ctx = new AudioContext()
    audio = { ctx, stream }
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.minDecibels = -127
    analyser.maxDecibels = 0
    analyser.smoothingTimeConstant = 0.4
    ctx.createMediaStreamSource(stream).connect(analyser)
    const volumes = new Uint8Array(analyser.frequencyBinCount)
    micTimer = setInterval(() => {
      analyser.getByteFrequencyData(volumes)
      volume = volumes.reduce((a, b) => a + b, 0) / volumes.length
    }, 50)
    // 브라우저가 자동재생을 막았으면 첫 클릭 때 다시 켠다
    document.addEventListener('click', () => ctx.resume(), { once: true })
  } catch (e) {
    console.error('마이크를 사용할 수 없어요', e)
  }
}

// ---- 메인 루프 ----

onMounted(() => {
  renderer = createRenderer(stage.value!, { layout: 'bottom' })
  if (!renderer) {
    noGL.value = true
    return
  }
  renderer.setLayers(model.layers, resolveSrc)
  window.addEventListener('keydown', onKey)
  document.addEventListener('mousemove', onMouseMove)
  startMic()

  const head = new Head()
  const hair = new HairSystem()
  let last = performance.now()

  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    // 30fps면 한 프레임 건너뛰고 그린다 (모니터 주사율 오차를 감안해 약간 여유)
    if (now - last < 1000 / fps.value - 4) return
    const dt = (now - last) / 1000
    last = now

    autoMotion(now)
    head.update(dt, headTarget(target.x, target.y, model.rig, rig.value), model.rig.bounce)
    const h = head.state
    const b = breath(now / 1000, model.rig.breath, model.center)
    const isTalking = volume >= thres.value
    if (talking.value != isTalking) talking.value = isTalking

    renderer!.render({
      center: model.center,
      head: h,
      squash: head.squash,
      breath: b,
      expression,
      eyesClosed: now % 3000 >= 2800,
      mouthOpen: isTalking && now % 400 >= 200,
      hair: hair.update(dt, model.layers, h, now / 1000, b.hairLag),
    })
  }
  raf = requestAnimationFrame(frame)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  clearInterval(micTimer)
  clearTimeout(idleTimer)
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('mousemove', onMouseMove)
  audio?.stream.getTracks().forEach(t => t.stop())
  audio?.ctx.close()
  renderer?.destroy()
})
</script>

<template>
  <div>
    <div class="controls">
      <a href="/" class="back" title="편집기로 돌아가기">← 편집</a>
      <label><span>마이크 민감도</span><input v-model.number="thres" class="reverse" type="range" min="0" max="100"></label>
      <label><span>리깅 강도</span><input v-model.number="rig" type="range" min="0" max="200"></label>
      <label title="마우스를 멈추면 캐릭터가 알아서 둘러봐요. 왼쪽은 정면 근처에서만, 오른쪽은 크게 왔다갔다해요."><span>자동 모션 범위</span><input v-model.number="motionRange" type="range" min="10" max="100"></label>
      <label title="30으로 낮추면 컴퓨터 사용량이 절반 가까이 줄어요. 대신 움직임이 조금 덜 부드러워요.">
        <span>프레임</span>
        <select v-model.number="fps"><option :value="60">60fps</option><option :value="30">30fps (가볍게)</option></select>
      </label>
      <label><span>배경색</span><input v-model="color" type="color"></label>
      <span class="hint">숫자키 1~0: 표정 전환 · 마이크 <b class="mic" :class="{ on: talking }">●</b></span>
    </div>
    <canvas ref="stage" class="stage" />
    <div v-if="noGL" class="nogl">
      이 브라우저는 WebGL을 지원하지 않아요. <a href="/legacy/live.html">이전 버전으로 열기</a>
    </div>
  </div>
</template>

<style>
body.live {
  height: 100dvh;
  width: 100vw;
  overflow: hidden;
}

body.live.idle {
  cursor: none;
}
</style>

<style scoped>
.stage {
  position: fixed;
  inset: 3rem 0 0 0;
  width: 100vw;
  height: calc(100dvh - 3rem);
}

.controls {
  position: relative;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 16px;
  padding: 8px 12px;
  margin: 6px;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 10px;
  font-size: 14px;
  width: fit-content;
  transition: opacity 0.4s;
}

.idle .controls {
  opacity: 0;
  pointer-events: none;
}

.controls label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.controls input[type=range] {
  width: 110px;
}

.back {
  font-weight: 700;
}

.hint {
  font-size: 12px;
  color: var(--muted);
}

.mic {
  color: #ccc;
}

.mic.on {
  color: var(--hair);
}

.reverse {
  transform: rotateY(180deg);
}

.nogl {
  position: fixed;
  inset: 40% 0 auto 0;
  text-align: center;
}
</style>
