// 멀티: 베타의 1~0번 캐릭터 슬롯을 한 무대에 올리고, 화면 캡처(SYNCROOM / Discord)로 누가 말하는지 감지한다.
import { putFile, SLOT_COUNT } from './model'

export type DetectMode = 'syncroom' | 'discord' | 'color'

export interface Rect { x: number; y: number; w: number; h: number } // 캡처(자른) 화면 기준 0~1

export interface MultiChar {
  on: boolean // 무대에 올렸는지
  region: Rect | null // 감지 영역
  x: number; y: number; w: number // 무대 위치·크기 (무대 기준 %)
  motion: boolean // 자동 모션
}

export interface MultiObject {
  id: string
  name: string
  file: string // 업로드한 파일 키 (IndexedDB)
  x: number; y: number; w: number
}

export interface MultiSettings {
  detect: {
    mode: DetectMode
    color: string // 'color' 모드의 기준 색
    activity: number // 이 픽셀 수를 넘으면 말하는 중
    margin: number // 색 판정 여유값 (클수록 엄격)
    hold: number // ms, 짧은 끊김에 깜빡이지 않게
  }
  crop: Rect | null
  background: string // 배경색 (크로마키용 단색)
  chars: MultiChar[] // 슬롯 번호 순서 (0 = 1번)
  objects: MultiObject[]
  order: string[] // 그리는 순서 (뒤 → 앞). 'c0'~'c9' = 캐릭터, 'o:<id>' = 오브젝트
}

const KEY = 'ftMulti'

// 감지 방식별 기본값
export const DETECT_PRESETS: Record<DetectMode, { label: string; activity: number; margin: number; color: string }> = {
  syncroom: { label: 'SYNCROOM 레벨미터', activity: 6, margin: 25, color: '#2ecc40' },
  discord: { label: 'Discord 말하는 테두리', activity: 10, margin: 60, color: '#23a55a' },
  color: { label: '색 직접 고르기', activity: 10, margin: 60, color: '#23a55a' },
}

function defaultChar(i: number): MultiChar {
  return { on: i < 2, region: null, x: 10 + (i % 5) * 18, y: 30, w: 22, motion: true }
}

export function defaultMulti(): MultiSettings {
  return {
    detect: { mode: 'syncroom', activity: DETECT_PRESETS.syncroom.activity, margin: DETECT_PRESETS.syncroom.margin, color: DETECT_PRESETS.syncroom.color, hold: 350 },
    crop: null,
    background: '#00ff00',
    chars: Array.from({ length: SLOT_COUNT }, (_, i) => defaultChar(i)),
    objects: [],
    order: Array.from({ length: SLOT_COUNT }, (_, i) => 'c' + i),
  }
}

export function loadMulti(): MultiSettings {
  const base = defaultMulti()
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!raw) return base
    const m: MultiSettings = { ...base, ...raw, detect: { ...base.detect, ...raw.detect } }
    if (typeof m.background != 'string') m.background = base.background
    m.chars = base.chars.map((c, i) => ({ ...c, ...(raw.chars?.[i] || {}) }))
    m.objects = raw.objects || []
    // 순서 목록에 빠진 항목은 뒤에 붙이고, 없어진 오브젝트는 뺀다
    const ids = [...m.chars.map((_, i) => 'c' + i), ...m.objects.map(o => 'o:' + o.id)]
    m.order = [...(raw.order || []).filter((k: string) => ids.includes(k)), ...ids.filter(k => !(raw.order || []).includes(k))]
    return m
  } catch (e) {
    return base
  }
}

export function saveMulti(m: MultiSettings) {
  localStorage.setItem(KEY, JSON.stringify(m))
}

export async function newObject(file: File, name: string): Promise<MultiObject> {
  return { id: 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, file: await putFile(file), x: 5, y: 5, w: 25 }
}

// ---- 감지 ----

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
}

// 영역 안에서 '말하는 중' 색으로 보이는 픽셀 수 (비율이 아니라 개수라서, 얇은 레벨미터나 테두리도 잡힌다)
export function activityScore(data: Uint8ClampedArray, d: MultiSettings['detect']): number {
  const step = 4 * Math.max(1, Math.floor(data.length / 4 / 4000))
  let lit = 0
  if (d.mode == 'syncroom') {
    // 초록이 빨강·파랑보다 확실히 강하고 어느 정도 밝은 픽셀
    for (let i = 0; i < data.length; i += step) {
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!
      if (g > 40 && g - r > d.margin && g - b > d.margin) lit++
    }
  } else {
    // 기준 색과 가까운 픽셀 (여유값이 클수록 멀리까지 인정)
    const [tr, tg, tb] = hexToRgb(d.color)
    const max2 = d.margin * d.margin
    for (let i = 0; i < data.length; i += step) {
      const dr = data[i]! - tr, dg = data[i + 1]! - tg, db = data[i + 2]! - tb
      if (dr * dr + dg * dg + db * db < max2) lit++
    }
  }
  return lit
}

// 화면 캡처를 받아 일정 간격(초당 15번)으로 각 캐릭터 영역을 검사한다
export class ScreenWatcher {
  video: HTMLVideoElement | null = null
  stream: MediaStream | null = null
  canvas = document.createElement('canvas')
  ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
  timer: ReturnType<typeof setInterval> | undefined
  lastActive = new Map<number, number>()
  scores: number[] = new Array(SLOT_COUNT).fill(0)
  talking: boolean[] = new Array(SLOT_COUNT).fill(false)
  onFrame?: () => void
  onStop?: () => void

  get running() {
    return !!this.stream
  }

  async start() {
    this.stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.srcObject = this.stream
    await v.play()
    this.video = v
    this.stream.getVideoTracks()[0]?.addEventListener('ended', () => this.stop())
  }

  // 자른 영역(0~1) → 실제 영상 픽셀
  sourceRect(crop: Rect | null) {
    const W = this.video?.videoWidth || 0, H = this.video?.videoHeight || 0
    const c = crop || { x: 0, y: 0, w: 1, h: 1 }
    return { x: Math.round(c.x * W), y: Math.round(c.y * H), w: Math.max(1, Math.round(c.w * W)), h: Math.max(1, Math.round(c.h * H)) }
  }

  // 지금 화면을 캔버스에 그리고 감지 (full: 자르기 지정 중이면 전체 화면)
  tick(m: MultiSettings, full = false) {
    const v = this.video
    if (!v || !v.videoWidth) return
    const s = this.sourceRect(full ? null : m.crop)
    if (this.canvas.width != s.w || this.canvas.height != s.h) {
      this.canvas.width = s.w
      this.canvas.height = s.h
    }
    this.ctx.drawImage(v, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h)
    if (full) return
    const now = performance.now()
    m.chars.forEach((c, i) => {
      if (!c.on || !c.region) {
        this.scores[i] = 0
        this.talking[i] = false
        return
      }
      const r = c.region
      const x = Math.round(r.x * s.w), y = Math.round(r.y * s.h)
      const w = Math.max(1, Math.round(r.w * s.w)), h = Math.max(1, Math.round(r.h * s.h))
      let score = 0
      try {
        score = activityScore(this.ctx.getImageData(x, y, w, h).data, m.detect)
      } catch (e) {}
      this.scores[i] = score
      if (score > m.detect.activity) this.lastActive.set(i, now)
      this.talking[i] = now - (this.lastActive.get(i) ?? -Infinity) < m.detect.hold
    })
  }

  // 화면 공유가 끝나면 모두 조용한 상태로
  stop() {
    clearInterval(this.timer)
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = null
    this.video = null
    this.talking.fill(false)
    this.scores.fill(0)
    this.onStop?.()
  }

  // 초당 15번 검사 시작 (skip이 참이면 그동안은 쉰다 — 캡처는 켜 둔 채로)
  run(get: () => MultiSettings, full: () => boolean = () => false, skip: () => boolean = () => false) {
    clearInterval(this.timer)
    this.timer = setInterval(() => {
      if (skip()) return
      this.tick(get(), full())
      this.onFrame?.()
    }, 66)
  }
}
