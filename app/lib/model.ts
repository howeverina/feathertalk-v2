// 페더톡 모델 데이터 (레이어 구성, 저장/불러오기, 기존 데이터 변환)

const KEY = 'ftModel'

export type ShowMode = 'always' | 'eyesOpen' | 'eyesClosed' | 'mouthClosed' | 'mouthOpen'

export interface HairParams {
  enabled: boolean
  anchorY: number
  sway: number
  stiffness: number
  bounce: number
}

export interface LayerSource {
  type: 'url' | 'file' | 'data'
  value: string
}

export interface Layer {
  id: string
  name: string
  src: LayerSource
  part: 'head' | 'body'
  show: ShowMode
  expressions: boolean[]
  visible: boolean
  depth: number
  curve: number
  hair: HairParams
  clip: boolean // 바로 뒤(아래) 레이어의 그림 안쪽에만 보이기 (클리핑 마스크)
  pop: boolean // 깜빡일 때 눌렸다가 통통 튀며 돌아오기 (눈동자용)
}

export interface Model {
  version: 2
  center: { x: number; y: number; r: number }
  rig: { yaw: number; pitch: number; roll: number; bounce: number; breath: number }
  eyes: { y: number; h: number } // 깜빡임 때 세로로 눌리는 눈 영역 (가운데 높이, 반높이)
  layers: Layer[]
}

export interface FaceState {
  expression: number
  eyesClosed: boolean
  mouthOpen: boolean
  blink?: number // 0(뜸) ~ 1(감음). 있으면 eyesClosed 대신 쓴다
}

// 깜빡임이 이만큼 진행되면 뜬 눈 → 감은 눈 그림으로 바꾼다 (그 전까지는 뜬 눈을 눌러서 감기는 느낌)
export const BLINK_SWAP = 0.9

export const SHOW_OPTIONS: [ShowMode, string][] = [
  ['always', '항상'],
  ['eyesOpen', '눈 뜰 때'],
  ['eyesClosed', '눈 감을 때'],
  ['mouthClosed', '입 다물 때'],
  ['mouthOpen', '입 열 때'],
]

const HAIR_OFF: HairParams = { enabled: false, anchorY: 0.25, sway: 50, stiffness: 50, bounce: 50 }

interface Preset {
  label: string
  name: string
  depth?: number
  curve?: number
  show?: ShowMode
  part?: 'head' | 'body'
  hair?: HairParams
}

// 레이어 추가 메뉴에 나오는 프리셋
export const PRESETS = {
  bang: { label: '앞머리', name: '앞머리', depth: 30, curve: 40, hair: { enabled: true, anchorY: 0.22, sway: 50, stiffness: 50, bounce: 50 } },
  eyes: { label: '눈 (뜬 눈)', name: '눈', depth: 25, curve: 30, show: 'eyesOpen' },
  eyesClosed: { label: '눈 (감은 눈)', name: '감은 눈', depth: 25, curve: 30, show: 'eyesClosed' },
  mouth: { label: '입 (다문 입)', name: '입', depth: 25, curve: 30, show: 'mouthClosed' },
  mouthOpen: { label: '입 (벌린 입)', name: '벌린 입', depth: 25, curve: 30, show: 'mouthOpen' },
  face: { label: '얼굴', name: '얼굴', depth: 0, curve: 40 },
  body: { label: '몸', name: '몸', part: 'body' },
  back: { label: '뒷머리', name: '뒷머리', depth: -12, curve: -20, hair: { enabled: true, anchorY: 0.3, sway: 40, stiffness: 40, bounce: 50 } },
  blank: { label: '빈 레이어', name: '새 레이어' },
} satisfies Record<string, Preset>

export type PresetKey = keyof typeof PRESETS

let idCounter = 0
function makeId() {
  return Date.now().toString(36) + (idCounter++).toString(36) + Math.random().toString(36).slice(2, 6)
}

export function newLayer(presetKey: PresetKey = 'blank', src = ''): Layer {
  const p: Preset = PRESETS[presetKey] || PRESETS.blank
  return {
    id: makeId(),
    name: p.name,
    src: { type: 'url', value: src },
    part: p.part || 'head',
    show: p.show || 'always',
    expressions: new Array(10).fill(true),
    visible: true,
    depth: p.depth || 0,
    curve: p.curve || 0,
    hair: { ...HAIR_OFF, ...(p.hair || {}) },
    clip: false,
    pop: false,
  }
}

// 레이어 복제: 이미지와 설정을 그대로 복사하고 id만 새로
export function duplicateLayer(l: Layer): Layer {
  const copy: Layer = JSON.parse(JSON.stringify(l))
  copy.id = makeId()
  copy.name = l.name + ' 복사본'
  return copy
}

// 예전에 저장된 상대 경로(assets/…, ../assets/…)를 사이트 기준 절대 경로로
function fixAssetPath(v: string) {
  return v.replace(/^(\.\.\/|\.\/)?assets\//, '/assets/')
}

// 기존(8장 고정) 데이터의 파트 → 새 프리셋
const LEGACY_PARTS: [string, PresetKey, string][] = [
  ['ftBang', 'bang', '/assets/bang.png'],
  ['ftMouth', 'mouth', '/assets/mouth.png'],
  ['ftMouthOpen', 'mouthOpen', '/assets/mouthopen.png'],
  ['ftEyes', 'eyes', '/assets/eyes.png'],
  ['ftEyesClosed', 'eyesClosed', '/assets/eyesclosed.png'],
  ['ftFace', 'face', '/assets/face.png'],
  ['ftBody', 'body', '/assets/body.png'],
  ['ftBack', 'back', '/assets/back.png'],
]

function baseModel(): Model {
  return {
    version: 2,
    center: { x: 0.5, y: 0.4, r: 0.25 },
    rig: { yaw: 100, pitch: 100, roll: 100, bounce: 50, breath: 50 },
    eyes: { y: 0.4, h: 0.05 },
    layers: [],
  }
}

export function defaultModel(): Model {
  const m = baseModel()
  m.layers = LEGACY_PARTS.map(([, preset, src]) => newLayer(preset, src))
  return m
}

// 기존 localStorage(ftBang 등, 표정 10칸 배열)를 레이어 구조로 변환.
// 파트마다 서로 다른 이미지 주소 하나당 레이어 하나를 만들고, 그 주소를 쓰던 표정만 체크한다.
export function migrateLegacy(): Model | null {
  if (!LEGACY_PARTS.some(([key]) => localStorage.getItem(key))) return null
  const m = baseModel()
  for (const [key, preset, fallback] of LEGACY_PARTS) {
    let slots: string[] = new Array(10).fill(fallback)
    const raw = localStorage.getItem(key)
    if (raw) {
      try {
        slots = raw[0] == '[' ? JSON.parse(raw) : new Array(10).fill(raw)
      } catch (e) {}
    }
    slots = slots.map(fixAssetPath)
    const unique = [...new Set(slots)]
    unique.forEach((src, n) => {
      const layer = newLayer(preset, src)
      if (unique.length > 1) layer.name += ` ${n + 1}`
      layer.expressions = slots.map(s => s == src)
      m.layers.push(layer)
    })
  }
  return m
}

// 빠진 값을 채워서 항상 같은 모양의 데이터가 되도록
export function normalizeModel(raw: any): Model {
  const base = baseModel()
  const m: Model = { ...base, ...raw }
  m.center = { ...base.center, ...raw.center }
  m.rig = { ...base.rig, ...raw.rig }
  m.eyes = { ...base.eyes, ...raw.eyes }
  m.layers = (raw.layers || []).map((l: any) => {
    const d = newLayer('blank')
    const layer: Layer = {
      ...d, ...l,
      src: { ...d.src, ...l.src },
      hair: { ...d.hair, ...l.hair },
      expressions: Array.isArray(l.expressions) && l.expressions.length == 10 ? l.expressions : d.expressions,
    }
    if (layer.src.type == 'url') layer.src.value = fixAssetPath(layer.src.value)
    return layer
  })
  return m
}

export function loadModel(): Model {
  const raw = localStorage.getItem(KEY)
  let m: Model | null = null
  if (raw) {
    try {
      m = normalizeModel(JSON.parse(raw))
      // 레이어를 전부 지웠으면 기본 캐릭터로
      if (m.layers.length) return m
      m = defaultModel()
    } catch (e) {
      console.error('ftModel을 읽지 못했어요', e)
    }
  }
  m = m || migrateLegacy() || defaultModel()
  saveModel(m)
  return m
}

export function saveModel(m: Model) {
  localStorage.setItem(KEY, JSON.stringify(m))
}

export function isVisible(layer: Layer, { expression, eyesClosed, mouthOpen, blink }: FaceState) {
  if (!layer.visible || !layer.expressions[expression]) return false
  const b = blink ?? (eyesClosed ? 1 : 0)
  switch (layer.show) {
    case 'eyesOpen': return b < BLINK_SWAP
    case 'eyesClosed': return b >= BLINK_SWAP
    case 'mouthClosed': return !mouthOpen
    case 'mouthOpen': return mouthOpen
  }
  return true
}

// ---- 업로드한 파일은 IndexedDB에 저장 (localStorage는 용량이 작아서) ----

let dbPromise: Promise<IDBDatabase> | null = null
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('feathertalk', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('files')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction('files', mode)
    const req = fn(t.objectStore('files'))
    t.oncomplete = () => resolve(req.result)
    t.onerror = () => reject(t.error)
  }))
}

export async function putFile(blob: Blob) {
  const key = 'f_' + makeId()
  await tx('readwrite', s => s.put(blob, key))
  return key
}

export function getFile(key: string) {
  return tx<Blob | undefined>('readonly', s => s.get(key))
}

export function deleteFile(key: string) {
  return tx('readwrite', s => s.delete(key))
}

// 사용하지 않는 파일 정리
export async function cleanupFiles(model: Model) {
  const used = new Set(model.layers.filter(l => l.src.type == 'file').map(l => l.src.value))
  const keys = await tx('readonly', s => s.getAllKeys())
  await Promise.all(keys.map(String).filter(k => !used.has(k)).map(deleteFile))
}

const objectURLs = new Map<string, string>()

// 레이어 이미지를 <img>/WebGL에서 쓸 수 있는 주소로
export async function resolveSrc(layer: Layer) {
  const { type, value } = layer.src
  if (!value) return ''
  if (type != 'file') return value
  if (!objectURLs.has(value)) {
    const blob = await getFile(value)
    objectURLs.set(value, blob ? URL.createObjectURL(blob) : '')
  }
  return objectURLs.get(value)!
}

// ---- 백업 (업로드한 파일까지 포함) ----

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise(resolve => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.readAsDataURL(blob)
  })
}

export async function exportJSON(model: Model) {
  const copy: Model = JSON.parse(JSON.stringify(model))
  for (const l of copy.layers) {
    if (l.src.type == 'file') {
      const blob = await getFile(l.src.value)
      l.src = { type: 'data', value: blob ? await blobToDataURL(blob) : '' }
    }
  }
  return JSON.stringify(copy)
}

export async function importJSON(text: string) {
  const m = normalizeModel(JSON.parse(text))
  for (const l of m.layers) {
    if (l.src.type == 'data') {
      const blob = await (await fetch(l.src.value)).blob()
      l.src = { type: 'file', value: await putFile(blob) }
    }
  }
  return m
}
