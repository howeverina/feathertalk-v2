<script setup lang="ts">
import { JOINTS, resolveSrc, type JointName, type Layer } from '~/lib/model'
import { createRenderer, type Renderer } from '~/lib/renderer'
import { Arms, Blinker, Head, Mouth, mouthState, pupilPop, HairSystem, Wander, breath, headTarget, lookAt } from '~/lib/physics'
import { BONE_LINES, BONE_NAMES, mirrorOf } from '~/lib/skeleton'
import { createPinch } from '~/lib/gesture'
import type { Handle, MotionMode } from '~/composables/useEditor'

const ed = useEditor()
const { model, selected, preview } = ed
const beta = useBeta()

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
const mouth = new Mouth()
const arms = new Arms()
let talkUntil = 0

// 마이크 없이 말하는 모습 미리보기: 2.5초 동안 라이브처럼 뻐끔뻐끔
function talkOnce() {
  preview.mouthOpen = false
  talkUntil = performance.now() + 2500
}

function blinkOnce() {
  preview.eyesClosed = false
  blinker.trigger(performance.now())
}

function setMode(mode: MotionMode) {
  preview.mode = mode
  preview.target = { x: 0, y: 0 }
  if (mode == 'auto') wander.reset(preview.target)
}

// 몸 리깅 관절을 보여줄지 (베타)
const rigOn = () => beta && model.value.body.enabled && preview.showJoints

// ---- 핸들 (얼굴 중심, 얼굴 크기, 머리카락 고정선, 눈 영역, 관절) ----

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const cursorOf = (h: Handle) => h.startsWith('joint:') ? 'move'
  : ({ center: 'move', radius: 'nwse-resize', anchor: 'ns-resize', eyes: 'ns-resize', eyesSize: 'ns-resize', bodyR: 'ew-resize' } as Record<string, string>)[h] || 'default'

// 눈 레이어를 골랐을 때 깜빡임 영역을 보여준다
function eyeLayer(): Layer | null {
  const l = selected.value
  return model.value.eyes.squash && l && (l.show == 'eyesOpen' || l.show == 'eyesClosed') ? l : null
}

function anchorLayer(): Layer | null {
  const l = selected.value
  return l && l.hair.enabled && l.part != 'body' ? l : null
}

function pointer(e: PointerEvent | WheelEvent) {
  const r = overlay.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }
}

function hitTest(p: { x: number; y: number }): Handle | null {
  if (!renderer) return null
  // x, y: 그림 왼쪽 위, S: 그림 가로 길이, SH: 세로 길이 (CSS px)
  const [x, y, S, SH] = renderer.cssRect()
  if (rigOn()) {
    const body = model.value.body
    for (const name of Object.keys(JOINTS) as JointName[]) {
      const j = body.joints[name]
      if (Math.hypot(p.x - (x + j.x * S), p.y - (y + j.y * SH)) < 9) return `joint:${name}`
    }
    const w = body.joints.waist
    if (Math.abs(Math.abs(p.x - (x + w.x * S)) - body.radius * S) < 6 && Math.abs(p.y - (y + w.y * SH)) < 40) return 'bodyR'
  }
  const c = model.value.center
  const d = Math.hypot(p.x - (x + c.x * S), p.y - (y + c.y * SH))
  if (d < 14) return 'center'
  if (Math.abs(d - c.r * S) < 8) return 'radius'
  const l = anchorLayer()
  if (l && Math.abs(p.y - (y + l.hair.anchorY * SH)) < 8 && p.x > x && p.x < x + S) return 'anchor'
  if (eyeLayer() && p.x > x && p.x < x + S) {
    const e = model.value.eyes
    if (Math.abs(p.y - (y + e.y * SH)) < 8) return 'eyes'
    if (Math.abs(Math.abs(p.y - (y + e.y * SH)) - e.h * SH) < 6) return 'eyesSize'
  }
  return null
}

let panning = false
// 베타: 터치 화면에서 두 손가락으로 확대·이동
const pinch = createPinch(() => overlay.value!.getBoundingClientRect(), preview.view)

function onPointerDown(e: PointerEvent) {
  if (beta && pinch.down(e)) {
    preview.drag = null
    return
  }
  // 베타: 우클릭 드래그로 화면 이동
  if (beta && e.button == 2) {
    panning = true
    overlay.value!.setPointerCapture(e.pointerId)
    return
  }
  const h = hitTest(pointer(e))
  if (!h) return
  preview.drag = h
  overlay.value!.setPointerCapture(e.pointerId)
}

function onPointerUp(e: PointerEvent) {
  pinch.up(e)
  preview.drag = null
  panning = false
}

function onPointerMove(e: PointerEvent) {
  const p = pointer(e)
  if (beta && (pinch.move(e) || pinch.active)) return
  if (panning) {
    preview.view.x += e.movementX
    preview.view.y += e.movementY
    return
  }
  if (preview.drag && renderer) {
    const [x, y, S, SH] = renderer.cssRect()
    const mx = (p.x - x) / S, my = (p.y - y) / SH
    const round = (v: number) => Math.round(v * 200) / 200
    const c = model.value.center
    const drag = preview.drag
    if (drag.startsWith('joint:')) {
      // 관절: 좌우 대칭이면 짝 관절도 허리 기준으로 반대편에 같이 옮긴다
      const name = drag.slice(6) as JointName
      const body = model.value.body
      body.joints[name] = { x: round(clamp(mx, 0, 1)), y: round(clamp(my, 0, 1)) }
      const pair = mirrorOf(name)
      if (body.mirror && pair) body.joints[pair] = { x: round(clamp(2 * body.joints.waist.x - mx, 0, 1)), y: round(clamp(my, 0, 1)) }
    } else if (drag == 'bodyR') {
      model.value.body.radius = round(clamp(Math.abs(mx - model.value.body.joints.waist.x), 0.02, 0.5))
    } else if (drag == 'center') {
      c.x = round(clamp(mx, 0, 1))
      c.y = round(clamp(my, 0, 1))
    } else if (drag == 'radius') {
      c.r = round(clamp(Math.hypot(p.x - (x + c.x * S), p.y - (y + c.y * SH)) / S, 0.05, 0.6))
    } else if (drag == 'anchor') {
      const l = anchorLayer()
      if (l) l.hair.anchorY = Math.round(clamp(my, 0, 1) * 100) / 100
    } else if (drag == 'eyes') {
      model.value.eyes.y = round(clamp(my, 0, 1))
    } else if (drag == 'eyesSize') {
      model.value.eyes.h = round(clamp(Math.abs(my - model.value.eyes.y), 0.01, 0.2))
    }
    return
  }
  preview.hover = hitTest(p)
  overlay.value!.style.cursor = preview.hover ? cursorOf(preview.hover) : 'default'
  if (preview.mode == 'mouse' && renderer) {
    const [x, y, S, SH] = renderer.cssRect()
    const c = model.value.center
    preview.target = lookAt(p.x, p.y, x + c.x * S, y + c.y * SH, S)
  }
}

function onPointerLeave() {
  preview.hover = null
  if (preview.mode == 'mouse') preview.target = { x: 0, y: 0 }
}

// 베타: 휠로 커서 위치를 중심으로 확대/축소
function onWheel(e: WheelEvent) {
  if (!beta) return
  e.preventDefault()
  const p = pointer(e)
  const v = preview.view
  const z = clamp(v.zoom * Math.exp(-e.deltaY * 0.0015), 0.2, 8)
  const cx = p.x - p.w / 2, cy = p.y - p.h / 2
  v.x = cx - (cx - v.x) * z / v.zoom
  v.y = cy - (cy - v.y) * z / v.zoom
  v.zoom = z
}

function fitView() {
  Object.assign(preview.view, { zoom: 1, x: 0, y: 0 })
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
  const [x, y, S, SH] = renderer.cssRect()
  const m = toRaw(model.value)
  const c = m.center
  const active = (handle: Handle) => preview.hover == handle || preview.drag == handle
  ctx.font = '12px Pretendard, sans-serif'

  // 고정선 + 그 아래(또는 위)로 갈수록 많이 흔들린다는 표시
  const l = anchorLayer()
  if (l) {
    const ay = y + l.hair.anchorY * SH
    const end = l.hair.dir == 'up' ? y : y + SH
    const g = ctx.createLinearGradient(0, ay, 0, end)
    g.addColorStop(0, 'rgba(255,107,138,0)')
    g.addColorStop(1, 'rgba(255,107,138,0.15)')
    ctx.fillStyle = g
    ctx.fillRect(x, Math.min(ay, end), S, Math.abs(end - ay))
    ctx.strokeStyle = '#ff6b8a'
    ctx.lineWidth = active('anchor') ? 3 : 2
    ctx.setLineDash([8, 6])
    ctx.beginPath()
    ctx.moveTo(x, ay)
    ctx.lineTo(x + S, ay)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#ff6b8a'
    ctx.fillText(`${l.hair.dir == 'up' ? '장식' : '머리카락'} 고정선 (${l.name})`, x + 6, l.hair.dir == 'up' ? ay + 16 : ay - 6)
  }

  // 깜빡임 때 눌리는 눈 영역
  if (eyeLayer()) {
    const e = m.eyes
    const ey = y + e.y * SH, eh = e.h * SH
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

  // 몸 리깅 뼈대: 뼈 선, 몸통 두께, 관절점
  if (rigOn()) {
    const J = m.body.joints
    const at = (n: JointName) => [x + J[n].x * S, y + J[n].y * SH] as const
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.9)'
    ctx.lineWidth = 3
    ctx.beginPath()
    for (const [a, b] of BONE_LINES) {
      ctx.moveTo(...at(a))
      ctx.lineTo(...at(b))
    }
    ctx.stroke()
    // 몸통 두께: 허리 양옆 세로 점선
    const [wx, wy] = at('waist')
    const [, ny] = at('neck')
    ctx.setLineDash([5, 5])
    ctx.lineWidth = active('bodyR') ? 2.5 : 1.5
    ctx.beginPath()
    for (const s of [-1, 1]) {
      ctx.moveTo(wx + s * m.body.radius * S, ny)
      ctx.lineTo(wx + s * m.body.radius * S, wy + (wy - ny) * 0.4)
    }
    ctx.stroke()
    ctx.setLineDash([])
    for (const name of Object.keys(JOINTS) as JointName[]) {
      const [px, py] = at(name)
      const on = active(`joint:${name}`)
      ctx.fillStyle = name == 'neck' || name == 'waist' ? '#f59e0b' : '#fbbf24'
      ctx.beginPath()
      ctx.arc(px, py, on ? 8 : 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 2
      ctx.stroke()
      if (on || name == 'neck' || name == 'waist') {
        ctx.fillStyle = '#b45309'
        ctx.fillText(JOINTS[name], px + 10, py - 8)
      }
    }
  }

  // 얼굴 중심과 크기
  const cx = x + c.x * S, cy = y + c.y * SH
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
    // 베타: 그림 비율을 자동으로 읽는다 (세로로 긴 그림 지원), 확대해서 볼 수 있도록 이미지를 크게
    onImageSize: beta
      ? (_, w, h) => {
          const a = Math.round(h / w * 1000) / 1000
          if (Math.abs(a - model.value.aspect) > 0.01) model.value.aspect = a
        }
      : undefined,
    maxTexture: beta ? 4096 : undefined,
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
  let frameNo = 0

  // 베타: 몸 레이어가 어느 뼈에 붙었는지 레이어 목록에 보여준다 (가끔만 확인)
  function updateLayerBones() {
    const next: Record<string, string> = {}
    for (const l of toRaw(model.value).layers) {
      const b = renderer?.boneOf(l)
      if (b != null) next[l.id] = BONE_NAMES[b] || ''
    }
    if (JSON.stringify(next) != JSON.stringify(preview.layerBones)) preview.layerBones = next
  }

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

    if (beta) renderer?.setView(toRaw(preview.view))
    renderer?.render({
      ...(beta ? { aspect: m.aspect, body: m.body, arms: arms.update(dt, h.roll * 0.45, now / 1000) } : {}),
      center: m.center,
      head: h,
      squash: head.squash,
      breath: b,
      expression: preview.expression,
      eyesClosed: preview.eyesClosed,
      blink: preview.eyesClosed ? 1 : blinker.update(now, false),
      pop: pupilPop(blinker, now),
      eyes: m.eyes,
      ...mouthState(mouth, dt, preview.mouthOpen || (now < talkUntil && now % 400 >= 200), m.mouth.animate),
      hair: hair.update(dt, m.layers, h, now / 1000, b.hairLag),
      focusId: preview.focus ? selected.value?.id : null,
    })
    drawOverlay()
    if (beta && ++frameNo % 20 == 0) updateLayerBones()
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
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerleave="onPointerLeave"
        @wheel="onWheel"
        @contextmenu.prevent
      />
      <div v-if="noGL" class="nogl">
        이 브라우저는 WebGL을 지원하지 않아요. <a href="/legacy/index.html">이전 버전 사용하기</a>
      </div>
    </div>

    <div v-if="beta" class="toolbar">
      <span class="label">보기</span>
      <button class="toggle" title="휠로 확대/축소, 우클릭 드래그로 이동할 수 있어요" @click="fitView">화면 맞춤</button>
      <span class="tip">{{ Math.round(preview.view.zoom * 100) }}% · 휠/핀치: 확대·축소 · 우클릭/두 손가락 드래그: 이동</span>
      <label v-if="model.body.enabled" class="check"><input v-model="preview.showJoints" type="checkbox"> 관절 표시</label>
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
      <button class="toggle" title="마이크 없이 2.5초 동안 말하는 모습을 보여줘요" @click="talkOnce">말해 보기</button>
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
