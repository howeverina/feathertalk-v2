<script setup lang="ts">
import { resolveSrc, type Layer } from '~/lib/model'
import { createRenderer, type Renderer } from '~/lib/renderer'
import { Blinker, Head, pupilPop, HairSystem, Wander, breath, headTarget, lookAt } from '~/lib/physics'
import type { Handle, MotionMode } from '~/composables/useEditor'

const ed = useEditor()
const { model, selected, preview } = ed

const stage = ref<HTMLCanvasElement>()
const overlay = ref<HTMLCanvasElement>()
const noGL = ref(false)
let renderer: Renderer | null = null
let raf = 0

const MODES: [MotionMode, string, string][] = [
  ['mouse', '마우스 따라보기', '미리보기 위에서 마우스를 움직이면 따라 봐요'],
  ['auto', '자동 흔들기', '라이브처럼 알아서 두리번거려요'],
  ['still', '정면 고정', '정면을 봐요'],
]

const wander = new Wander()
const blinker = new Blinker()

function blinkOnce() {
  preview.eyesClosed = false
  blinker.trigger(performance.now())
}

function setMode(mode: MotionMode) {
  preview.mode = mode
  preview.target = { x: 0, y: 0 }
  if (mode == 'auto') wander.reset(preview.target)
}

// ---- 핸들 (얼굴 중심, 얼굴 크기, 머리카락 고정선) ----

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const CURSOR: Record<Handle, string> = { center: 'move', radius: 'nwse-resize', anchor: 'ns-resize', eyes: 'ns-resize', eyesSize: 'ns-resize' }

// 눈 레이어를 골랐을 때 깜빡임 영역을 보여준다
function eyeLayer(): Layer | null {
  const l = selected.value
  return model.value.eyes.squash && l && (l.show == 'eyesOpen' || l.show == 'eyesClosed') ? l : null
}

function anchorLayer(): Layer | null {
  const l = selected.value
  return l && l.hair.enabled && l.part != 'body' ? l : null
}

function pointer(e: PointerEvent) {
  const r = overlay.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }
}

function hitTest(p: { x: number; y: number }): Handle | null {
  if (!renderer) return null
  const [x, y, S] = renderer.cssRect()
  const c = model.value.center
  const d = Math.hypot(p.x - (x + c.x * S), p.y - (y + c.y * S))
  if (d < 14) return 'center'
  if (Math.abs(d - c.r * S) < 8) return 'radius'
  const l = anchorLayer()
  if (l && Math.abs(p.y - (y + l.hair.anchorY * S)) < 8 && p.x > x && p.x < x + S) return 'anchor'
  if (eyeLayer() && p.x > x && p.x < x + S) {
    const e = model.value.eyes
    if (Math.abs(p.y - (y + e.y * S)) < 8) return 'eyes'
    if (Math.abs(Math.abs(p.y - (y + e.y * S)) - e.h * S) < 6) return 'eyesSize'
  }
  return null
}

function onPointerDown(e: PointerEvent) {
  const h = hitTest(pointer(e))
  if (!h) return
  preview.drag = h
  overlay.value!.setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  const p = pointer(e)
  if (preview.drag && renderer) {
    const [x, y, S] = renderer.cssRect()
    const mx = (p.x - x) / S, my = (p.y - y) / S
    const round = (v: number) => Math.round(v * 200) / 200
    const c = model.value.center
    if (preview.drag == 'center') {
      c.x = round(clamp(mx, 0, 1))
      c.y = round(clamp(my, 0, 1))
    } else if (preview.drag == 'radius') {
      c.r = round(clamp(Math.hypot(mx - c.x, my - c.y), 0.05, 0.6))
    } else if (preview.drag == 'anchor') {
      const l = anchorLayer()
      if (l) l.hair.anchorY = Math.round(clamp(my, 0, 0.95) * 100) / 100
    } else if (preview.drag == 'eyes') {
      model.value.eyes.y = round(clamp(my, 0, 1))
    } else if (preview.drag == 'eyesSize') {
      model.value.eyes.h = round(clamp(Math.abs(my - model.value.eyes.y), 0.01, 0.2))
    }
    return
  }
  preview.hover = hitTest(p)
  overlay.value!.style.cursor = preview.hover ? CURSOR[preview.hover] : 'default'
  if (preview.mode == 'mouse' && renderer) {
    const [x, y, S] = renderer.cssRect()
    const c = model.value.center
    preview.target = lookAt(p.x, p.y, x + c.x * S, y + c.y * S, S)
  }
}

function onPointerLeave() {
  preview.hover = null
  if (preview.mode == 'mouse') preview.target = { x: 0, y: 0 }
}

function drawOverlay() {
  const el = overlay.value
  if (!el) return
  const ctx = el.getContext('2d')!
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = el.clientWidth, h = el.clientHeight
  if (el.width != Math.round(w * dpr) || el.height != Math.round(h * dpr)) {
    el.width = Math.round(w * dpr)
    el.height = Math.round(h * dpr)
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  if (!renderer) return
  const [x, y, S] = renderer.cssRect()
  const c = toRaw(model.value).center
  const active = (handle: Handle) => preview.hover == handle || preview.drag == handle
  ctx.font = '12px Pretendard, sans-serif'

  // 머리카락 고정선 + 아래로 갈수록 많이 흔들린다는 표시
  const l = anchorLayer()
  if (l) {
    const ay = y + l.hair.anchorY * S
    const g = ctx.createLinearGradient(0, ay, 0, y + S)
    g.addColorStop(0, 'rgba(255,107,138,0)')
    g.addColorStop(1, 'rgba(255,107,138,0.15)')
    ctx.fillStyle = g
    ctx.fillRect(x, ay, S, y + S - ay)
    ctx.strokeStyle = '#ff6b8a'
    ctx.lineWidth = active('anchor') ? 3 : 2
    ctx.setLineDash([8, 6])
    ctx.beginPath()
    ctx.moveTo(x, ay)
    ctx.lineTo(x + S, ay)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#ff6b8a'
    ctx.fillText(`머리카락 고정선 (${l.name})`, x + 6, ay - 6)
  }

  // 깜빡임 때 눌리는 눈 영역
  if (eyeLayer()) {
    const e = toRaw(model.value).eyes
    const ey = y + e.y * S, eh = e.h * S
    ctx.fillStyle = 'rgba(46, 204, 113, 0.08)'
    ctx.fillRect(x, ey - eh, S, eh * 2)
    ctx.strokeStyle = '#2ecc71'
    ctx.setLineDash([6, 5])
    ctx.lineWidth = active('eyesSize') ? 2.5 : 1.5
    ctx.beginPath()
    ctx.moveTo(x, ey - eh)
    ctx.lineTo(x + S, ey - eh)
    ctx.moveTo(x, ey + eh)
    ctx.lineTo(x + S, ey + eh)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.lineWidth = active('eyes') ? 3 : 2
    ctx.beginPath()
    ctx.moveTo(x, ey)
    ctx.lineTo(x + S, ey)
    ctx.stroke()
    ctx.fillStyle = '#27ae60'
    ctx.fillText('눈 깜빡임 영역 (이 띠 안쪽만 눌려요)', x + 6, ey - eh - 6)
  }

  // 얼굴 중심과 크기
  const cx = x + c.x * S, cy = y + c.y * S
  ctx.strokeStyle = '#3fb5ee'
  ctx.lineWidth = active('radius') ? 2.5 : 1.5
  ctx.setLineDash([5, 5])
  ctx.beginPath()
  ctx.arc(cx, cy, c.r * S, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.lineWidth = active('center') ? 3 : 2
  ctx.beginPath()
  ctx.moveTo(cx - 12, cy)
  ctx.lineTo(cx + 12, cy)
  ctx.moveTo(cx, cy - 12)
  ctx.lineTo(cx, cy + 12)
  ctx.stroke()
  ctx.fillStyle = '#3fb5ee'
  ctx.fillText('얼굴 중심', cx + 10, cy - 8)
}

// ---- 렌더링 루프 ----

onMounted(() => {
  renderer = createRenderer(stage.value!, {
    layout: 'center',
    onImageError: l => ed.imageErrors.add(l.id),
  })
  if (!renderer) noGL.value = true

  // 레이어 구성/이미지가 바뀌면 렌더러에 알린다 (렌더러는 매 프레임 원본 객체를 읽는다)
  watch(model, () => renderer?.setLayers(toRaw(model.value).layers, resolveSrc), { deep: true, immediate: true })

  // 라이브 화면의 '리깅 강도'와 같은 값으로 미리보기 (기본 60)
  const storedRig = parseInt(localStorage.getItem('ftRig') || '')
  const rigStrength = isNaN(storedRig) ? 60 : storedRig
  const head = new Head()
  const hair = new HairSystem()
  let last = performance.now()

  function frame(now: number) {
    const dt = (now - last) / 1000
    last = now
    const m = toRaw(model.value)

    if (preview.mode == 'auto') preview.target = wander.update(now)
    // 핸들을 끄는 동안이나 정면 고정일 땐 정면을 본다
    const t = preview.drag || preview.mode == 'still' ? { x: 0, y: 0 } : preview.target
    head.update(dt, headTarget(t.x, t.y, m.rig, rigStrength), m.rig.bounce)
    const h = head.state
    const b = breath(now / 1000, m.rig.breath, m.center)

    renderer?.render({
      center: m.center,
      head: h,
      squash: head.squash,
      breath: b,
      expression: preview.expression,
      eyesClosed: preview.eyesClosed,
      blink: preview.eyesClosed ? 1 : blinker.update(now, false),
      pop: pupilPop(blinker, now),
      eyes: m.eyes,
      mouthOpen: preview.mouthOpen,
      hair: hair.update(dt, m.layers, h, now / 1000, b.hairLag),
      focusId: preview.focus ? selected.value?.id : null,
    })
    drawOverlay()
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  renderer?.destroy()
})
</script>

<template>
  <section class="panel preview">
    <div class="stage-wrap">
      <canvas ref="stage" />
      <canvas
        ref="overlay"
        class="overlay"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="preview.drag = null"
        @pointerleave="onPointerLeave"
      />
      <div v-if="noGL" class="nogl">
        이 브라우저는 WebGL을 지원하지 않아요. <a href="/legacy/index.html">이전 버전 사용하기</a>
      </div>
    </div>

    <div class="toolbar">
      <span class="label">고개</span>
      <div class="seg">
        <button v-for="[mode, label, title] in MODES" :key="mode" :class="{ on: preview.mode == mode }" :title @click="setMode(mode)">
          {{ label }}
        </button>
      </div>
      <label class="check"><input v-model="preview.focus" type="checkbox"> 선택한 레이어만 진하게</label>
    </div>
    <div class="toolbar">
      <span class="label">표정</span>
      <div class="seg small">
        <button
          v-for="i in 10"
          :key="i"
          :class="{ on: preview.expression == i - 1 }"
          :title="`${i % 10}번 표정 미리보기`"
          @click="preview.expression = i - 1"
        >
          {{ i % 10 }}
        </button>
      </div>
    </div>
    <div class="toolbar">
      <span class="label">상태</span>
      <button class="toggle" :class="{ on: preview.eyesClosed }" @click="preview.eyesClosed = !preview.eyesClosed">눈 감기</button>
      <button class="toggle" title="한 번 깜빡여요. 라이브에선 2~6초마다 불규칙하게 깜빡여요." @click="blinkOnce">깜빡여 보기</button>
      <button class="toggle" :class="{ on: preview.mouthOpen }" @click="preview.mouthOpen = !preview.mouthOpen">입 열기</button>
      <span class="tip">라이브에선 눈은 자동으로 깜빡이고, 입은 마이크 소리에 맞춰 움직여요.</span>
    </div>
    <p class="tip">
      <b>+</b> 얼굴 중심 · <b>점선 원</b> 얼굴 크기 · <b>분홍 점선</b> 머리카락 고정선 · <b>초록 띠</b> 눈 깜빡임 영역(눌림 효과를 켰을 때) — 모두 끌어서 옮길 수 있어요.
    </p>
  </section>
</template>

<style scoped>
.preview {
  position: sticky;
  top: 4.2rem;
}

@media (max-width: 860px) {
  .preview {
    position: static;
  }
}

.stage-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  max-height: 68vh;
  margin: 0 auto;
  border-radius: 10px;
  background: repeating-conic-gradient(#f4f6f8 0% 25%, #fff 0% 50%) 50% / 24px 24px;
  overflow: hidden;
}

canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.overlay {
  touch-action: none;
}

.nogl {
  position: absolute;
  inset: 40% 10px auto;
  text-align: center;
}

.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-top: 10px;
}

.toolbar .label {
  font-weight: 700;
  font-size: 0.85rem;
  min-width: 2.5em;
}

.toggle {
  border: 1px solid var(--line);
  background: white;
  border-radius: 10px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 0.85rem;
}

.toggle.on {
  background: var(--main);
  border-color: var(--main);
  color: white;
}

.check {
  font-size: 0.85rem;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
</style>
