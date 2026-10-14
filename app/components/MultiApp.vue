<script setup lang="ts">
// 멀티 설정: 화면 캡처로 누가 말하는지 감지하고, 베타의 1~0번 캐릭터를 한 무대에 올린다.
import { ChevronDown, ChevronUp, Crop, MonitorUp, Pipette, Play, Trash2 } from '@lucide/vue'
import { loadSlots, selectStorage, type Model } from '~/lib/model'
import { DETECT_PRESETS, ScreenWatcher, loadMulti, newObject, saveMulti, type DetectMode, type Rect } from '~/lib/multi'

useHead({ bodyAttrs: { class: 'editor' } })

selectStorage(true)
const models = shallowRef<Model[]>(loadSlots().slots)
const settings = reactive(loadMulti())
let saveTimer: ReturnType<typeof setTimeout> | undefined
watch(settings, () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => saveMulti(toRaw(settings)), 300)
}, { deep: true })
window.addEventListener('pagehide', () => saveMulti(toRaw(settings)))

// ---- 화면 캡처 ----

const watcher = new ScreenWatcher()
const capturing = ref(false)
const talking = reactive<boolean[]>(new Array(10).fill(false))
const scores = reactive<number[]>(new Array(10).fill(0))
// 미리보기에서 하는 일: 자르기 영역 / N번 감지 영역 / 기준 색 고르기
const mode = ref<'none' | 'crop' | 'pick' | number>('none')
const preview = ref<HTMLCanvasElement>()

async function toggleCapture() {
  if (watcher.running) {
    watcher.stop()
    return
  }
  try {
    await watcher.start()
  } catch (e: any) {
    alert('화면 캡처를 시작하지 못했어요: ' + (e?.message || e))
    return
  }
  capturing.value = true
  watcher.run(() => settings, () => mode.value == 'crop')
}
watcher.onStop = () => {
  capturing.value = false
  mode.value = 'none'
  talking.fill(false)
  scores.fill(0)
}
watcher.onFrame = () => {
  for (let i = 0; i < 10; i++) {
    if (talking[i] != watcher.talking[i]) talking[i] = watcher.talking[i]!
    scores[i] = watcher.scores[i]!
  }
  drawPreview()
}

const drag = reactive({ active: false, sx: 0, sy: 0, x: 0, y: 0, w: 0, h: 0 })

function drawPreview() {
  const el = preview.value, src = watcher.canvas
  if (!el || !src.width) return
  if (el.width != src.width || el.height != src.height) {
    el.width = src.width
    el.height = src.height
  }
  const ctx = el.getContext('2d')!
  ctx.drawImage(src, 0, 0)
  const W = el.width, H = el.height
  const lw = Math.max(2, W / 400)
  ctx.lineWidth = lw
  ctx.font = `${Math.max(12, W / 60)}px sans-serif`
  if (mode.value != 'crop') {
    settings.chars.forEach((c, i) => {
      if (!c.on || !c.region) return
      const r = c.region
      ctx.strokeStyle = mode.value === i ? '#3b6dd8' : talking[i] ? '#2ecc71' : '#999'
      ctx.strokeRect(r.x * W, r.y * H, r.w * W, r.h * H)
      ctx.fillStyle = ctx.strokeStyle
      ctx.fillText(`${(i + 1) % 10}번`, r.x * W + 2, Math.max(14, r.y * H - 4))
    })
  }
  if (drag.active) {
    ctx.strokeStyle = mode.value == 'crop' ? '#e8a33b' : '#3b6dd8'
    ctx.setLineDash([lw * 3, lw * 2])
    ctx.strokeRect(drag.x * W, drag.y * H, drag.w * W, drag.h * H)
    ctx.setLineDash([])
  }
}

function pos(e: PointerEvent) {
  const r = preview.value!.getBoundingClientRect()
  return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
}

function onPreviewDown(e: PointerEvent) {
  if (mode.value == 'pick') {
    // 기준 색 고르기: 누른 곳의 색
    const el = preview.value!, p = pos(e)
    const d = el.getContext('2d')!.getImageData(Math.floor(p.x * (el.width - 1)), Math.floor(p.y * (el.height - 1)), 1, 1).data
    settings.detect.color = '#' + [d[0], d[1], d[2]].map(v => v!.toString(16).padStart(2, '0')).join('')
    mode.value = 'none'
    return
  }
  if (mode.value == 'none') return
  const p = pos(e)
  Object.assign(drag, { active: true, sx: p.x, sy: p.y, x: p.x, y: p.y, w: 0, h: 0 })
  preview.value!.setPointerCapture(e.pointerId)
}

function onPreviewMove(e: PointerEvent) {
  if (!drag.active) return
  const p = pos(e)
  Object.assign(drag, { x: Math.min(drag.sx, p.x), y: Math.min(drag.sy, p.y), w: Math.abs(p.x - drag.sx), h: Math.abs(p.y - drag.sy) })
}

function onPreviewUp() {
  if (!drag.active) return
  drag.active = false
  const r: Rect = { x: drag.x, y: drag.y, w: drag.w, h: drag.h }
  if (mode.value == 'crop') {
    if (r.w > 0.02 && r.h > 0.02) {
      settings.crop = r
      // 감지 영역은 자른 화면 기준이라 다시 지정해야 한다
      settings.chars.forEach(c => c.region = null)
    }
  } else if (typeof mode.value == 'number' && r.w > 0.003 && r.h > 0.003) {
    settings.chars[mode.value]!.region = r
  }
  mode.value = 'none'
}

function startCrop() {
  if (settings.chars.some(c => c.region) && !confirm('자르기를 다시 지정하면 캐릭터 감지 영역도 다시 지정해야 해요. 계속할까요?')) return
  mode.value = 'crop'
}

function resetCrop() {
  if (settings.chars.some(c => c.region) && !confirm('자르기를 없애면 캐릭터 감지 영역도 다시 지정해야 해요. 계속할까요?')) return
  settings.crop = null
  settings.chars.forEach(c => c.region = null)
}

function setDetectMode(m: DetectMode) {
  const p = DETECT_PRESETS[m]
  Object.assign(settings.detect, { mode: m, activity: p.activity, margin: p.margin, color: p.color })
}

onBeforeUnmount(() => watcher.stop())

// ---- 캐릭터·오브젝트·순서 ----

const objInput = ref<HTMLInputElement>()
async function addObject(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f || !f.type.startsWith('image/')) return
  const o = await newObject(f, f.name.replace(/\.[^.]+$/, ''))
  settings.objects.push(o)
  settings.order.push('o:' + o.id)
}

function removeObject(id: string) {
  if (!confirm('이 오브젝트를 지울까요?')) return
  settings.objects = settings.objects.filter(o => o.id != id)
  settings.order = settings.order.filter(k => k != 'o:' + id)
}

// 레이어 목록은 앞(위) → 뒤 순서로 보여준다
const orderView = computed(() => [...settings.order].reverse().filter(k => !k.startsWith('c') || settings.chars[+k.slice(1)]!.on))
function orderLabel(k: string) {
  if (k.startsWith('c')) return `${(+k.slice(1) + 1) % 10}번 캐릭터`
  return settings.objects.find(o => 'o:' + o.id == k)?.name || '오브젝트'
}
function moveOrder(k: string, dir: 1 | -1) {
  // dir 1: 앞으로 (그리는 순서에서 뒤로)
  const a = settings.order, i = a.indexOf(k), j = i + dir
  if (j < 0 || j >= a.length) return
  ;[a[i], a[j]] = [a[j]!, a[i]!]
}

const strictLabel = computed(() => settings.detect.mode == 'syncroom'
  ? { label: '초록 판정 여유값', left: '느슨', right: '엄격', desc: '높을수록 뚜렷한 초록만 인정해요. 연한 초록·노란빛까지 잡히면 높이세요.' }
  : { label: '색 허용 범위', left: '좁게', right: '넓게', desc: '기준 색과 얼마나 다른 색까지 인정할지예요. 테두리가 잘 안 잡히면 넓히세요.' })
</script>

<template>
  <div>
    <header class="navbar">
      <h2 class="logo">Feather-Talk 멀티 <span class="beta-badge">BETA</span></h2>
      <div class="nav-actions">
        <a class="ghost" href="/beta/" title="캐릭터 1~0번은 베타 편집기에서 만들어요">캐릭터 편집 (베타)</a>
        <a class="button" href="/multi/live">라이브 시작 <Play :size="14" /></a>
      </div>
    </header>

    <main class="wrapper">
      <div class="multi-grid">
        <div class="left">
          <section class="panel">
            <h3>무대 <UiInfoTip text="캐릭터와 오브젝트를 끌어서 옮기고, 오른쪽 아래 파란 점을 끌어 크기를 바꿔요. 말하는 캐릭터는 초록 테두리로 보여요." /></h3>
            <MultiStage :settings="settings" :models="models" :talking="talking" editable />
          </section>
          <section class="panel">
            <h3>레이어 순서 <small>위에 있을수록 앞에 그려져요</small></h3>
            <ul class="order">
              <li v-for="k in orderView" :key="k">
                <span>{{ orderLabel(k) }}</span>
                <button class="icon" title="앞으로" @click="moveOrder(k, 1)"><ChevronUp :size="16" /></button>
                <button class="icon" title="뒤로" @click="moveOrder(k, -1)"><ChevronDown :size="16" /></button>
              </li>
            </ul>
          </section>
        </div>

        <div class="right">
          <section class="panel">
            <h3>1. 화면 캡처 <UiInfoTip text="SYNCROOM이나 Discord 창을 공유하세요. 캐릭터마다 레벨미터나 말하는 테두리 부분을 감지 영역으로 지정하면, 그 영역에 색이 보일 때 말하는 걸로 봐요." /></h3>
            <div class="row">
              <button class="primary inline" @click="toggleCapture"><MonitorUp :size="16" /> {{ capturing ? '화면 캡처 중지' : '화면 캡처 시작' }}</button>
              <span class="status" :class="{ live: capturing }">{{ capturing ? '캡처 중' : '캡처 안 함' }}</span>
            </div>
            <div v-show="capturing" class="preview-wrap" :class="{ arming: mode != 'none' }">
              <canvas ref="preview" class="preview" @pointerdown="onPreviewDown" @pointermove="onPreviewMove" @pointerup="onPreviewUp" />
              <p v-if="mode == 'crop'" class="mode-tip">남길 부분을 드래그하세요 (사이드바 등을 빼고 확대하면 영역 지정이 쉬워요)</p>
              <p v-else-if="mode == 'pick'" class="mode-tip">기준으로 삼을 색을 누르세요</p>
              <p v-else-if="typeof mode == 'number'" class="mode-tip">{{ (mode + 1) % 10 }}번 캐릭터의 레벨미터·테두리 부분을 드래그하세요</p>
            </div>
            <div v-if="capturing" class="row">
              <button class="plain" @click="startCrop"><Crop :size="14" /> {{ settings.crop ? '자르기 다시 지정' : '자르기 영역 지정' }}</button>
              <button v-if="settings.crop" class="plain" @click="resetCrop">자르기 없애기</button>
            </div>

            <h4>감지 방식</h4>
            <div class="seg wrap">
              <button v-for="(p, m) in DETECT_PRESETS" :key="m" :class="{ on: settings.detect.mode == m }" @click="setDetectMode(m)">{{ p.label }}</button>
            </div>
            <div v-if="settings.detect.mode != 'syncroom'" class="row color-row">
              <span class="mini">기준 색</span>
              <input v-model="settings.detect.color" type="color">
              <button class="plain" :disabled="!capturing" @click="mode = 'pick'"><Pipette :size="14" /> 화면에서 고르기</button>
            </div>
            <RangeField v-model="settings.detect.activity" label="말하는 중 판정 픽셀 수" left="민감" right="둔감" :min="1" :max="200" :def="DETECT_PRESETS[settings.detect.mode].activity" :format="v => v + 'px'"
              desc="영역 안에서 이만큼 넘는 픽셀이 '말하는 색'이면 말하는 걸로 봐요. 레벨미터가 얇으면 낮추세요." />
            <RangeField v-model="settings.detect.margin" :label="strictLabel.label" :left="strictLabel.left" :right="strictLabel.right" :min="5" :max="150" :step="5"
              :def="DETECT_PRESETS[settings.detect.mode].margin" :desc="strictLabel.desc" />
            <RangeField v-model="settings.detect.hold" label="유지 시간" left="짧게" right="길게" :min="50" :max="1500" :step="50" :def="350" :format="v => v + 'ms'"
              desc="짧게 끊겨도 입이 바로 닫히지 않게 이만큼 유지해요." />
          </section>

          <section class="panel">
            <h3>2. 캐릭터 <UiInfoTip text="베타 편집기의 1~0번 캐릭터를 그대로 써요. 무대에 올릴 캐릭터를 켜고, 감지 영역을 지정하세요." /></h3>
            <ul class="chars">
              <li v-for="(c, i) in settings.chars" :key="i" :class="{ off: !c.on }">
                <label class="check"><input v-model="c.on" type="checkbox"> <b>{{ (i + 1) % 10 }}번</b></label>
                <span class="layers">레이어 {{ models[i]?.layers.length || 0 }}개</span>
                <template v-if="c.on">
                  <button class="plain small" :class="{ arming: mode === i }" :disabled="!capturing" :title="capturing ? '' : '먼저 화면 캡처를 시작하세요'" @click="mode = mode === i ? 'none' : i">
                    {{ c.region ? '영역 다시 지정' : '영역 지정' }}
                  </button>
                  <span class="meter" :title="`${Math.round(scores[i]!)}px`"><span :style="{ width: Math.min(100, scores[i]! / Math.max(1, settings.detect.activity) * 50) + '%' }" :class="{ on: talking[i] }" /></span>
                  <label class="check" title="끄면 정면을 보고 가만히 있어요 (깜빡임·호흡·입은 그대로)"><input v-model="c.motion" type="checkbox"> 움직임</label>
                  <span v-if="!c.region" class="warn">영역 필요</span>
                </template>
              </li>
            </ul>
          </section>

          <section class="panel">
            <h3>3. 오브젝트 <UiInfoTip text="말에 반응하지 않는 고정 이미지예요 (배경, 악기, 로고 등). 무대에서 끌어서 옮겨요." /></h3>
            <ul class="objs">
              <li v-for="o in settings.objects" :key="o.id">
                <input v-model="o.name" type="text" placeholder="이름">
                <button class="icon" title="삭제" @click="removeObject(o.id)"><Trash2 :size="16" /></button>
              </li>
            </ul>
            <button class="plain" @click="objInput?.click()">+ 오브젝트 추가</button>
            <input ref="objInput" type="file" accept="image/*" hidden @change="addObject">
          </section>

          <section class="panel">
            <h3>4. 배경</h3>
            <div class="row color-row">
              <span class="mini">배경색</span><input v-model="settings.background" type="color">
              <span class="tip">OBS에서 크로마키로 지울 색이에요. 보통 초록(#00ff00)을 써요.</span>
            </div>
          </section>
        </div>
      </div>
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

.beta-badge {
  display: inline-block;
  vertical-align: middle;
  margin-left: 6px;
  padding: 0 8px;
  border-radius: 8px;
  background: #ff6b8a;
  font-size: 0.75rem;
  line-height: 1.6;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ghost, .button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ghost {
  border: 1px solid rgba(255, 255, 255, 0.7);
  color: white;
  border-radius: 10px;
  padding: 5px 10px;
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
  max-width: 1300px;
}

.multi-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

.left {
  position: sticky;
  top: 4.2rem;
}

@media (max-width: 900px) {
  .multi-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .left {
    position: static;
  }
}

h3 small {
  font-weight: 400;
  color: var(--muted);
  font-size: 0.8rem;
}

button.primary.inline {
  width: auto;
}

.status {
  font-size: 0.85rem;
  color: var(--muted);
}

.status.live {
  color: #2ecc71;
  font-weight: 700;
}

.preview-wrap {
  margin-top: 10px;
}

.preview {
  display: block;
  width: 100%;
  border-radius: 8px;
  background: #222;
  touch-action: none;
}

.arming .preview {
  outline: 3px solid #3b6dd8;
  cursor: crosshair;
}

.mode-tip {
  font-size: 0.8rem;
  color: #3b6dd8;
  margin: 4px 0 0;
}

.row {
  margin-top: 8px;
}

.seg.wrap {
  flex-wrap: wrap;
}

.color-row input[type=color] {
  width: 44px;
  height: 30px;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: white;
}

.mini {
  font-size: 0.85rem;
  font-weight: 700;
}

.chars, .objs, .order {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chars li {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 10px;
}

.chars li.off {
  opacity: 0.55;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.85rem;
  cursor: pointer;
}

.layers {
  font-size: 0.75rem;
  color: var(--muted);
}

.small {
  padding: 2px 8px;
  font-size: 0.8rem;
}

.plain.arming {
  border-color: #3b6dd8;
  color: #3b6dd8;
}

.plain:disabled {
  opacity: 0.5;
  cursor: default;
}

.meter {
  flex: 1;
  min-width: 60px;
  height: 8px;
  border-radius: 4px;
  background: #eef2f5;
  overflow: hidden;
}

.meter span {
  display: block;
  height: 100%;
  background: #b8c2cc;
}

.meter span.on {
  background: #2ecc71;
}

.warn {
  font-size: 0.75rem;
  color: #e5484d;
}

.objs li, .order li {
  display: flex;
  align-items: center;
  gap: 6px;
}

.order li {
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 0.85rem;
}

.order li span {
  flex: 1;
}

.icon {
  display: inline-grid;
  place-items: center;
  border: 0;
  background: none;
  cursor: pointer;
  color: #888;
  border-radius: 6px;
  padding: 2px;
}

.icon:hover {
  background: #eef2f5;
}

.objs {
  margin-bottom: 8px;
}
</style>
