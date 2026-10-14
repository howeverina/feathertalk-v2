// 편집기 전체가 함께 쓰는 상태 (모델, 선택한 레이어, 미리보기 상태)
import {
  loadModel, saveModel, newLayer, duplicateLayer, defaultModel, cleanupFiles, putFile, exportJSON, importJSON, selectStorage,
  loadSlots, saveSlots, normalizeModel, onSlotsChanged,
  type Layer, type LayerSource, type Model, type PresetKey,
} from '~/lib/model'

export type MotionMode = 'mouse' | 'auto' | 'still'
export type Handle = 'center' | 'radius' | 'anchor' | 'eyes' | 'eyesSize' | 'bodyR' | `joint:${string}`

function createEditor(beta: boolean) {
  selectStorage(beta)
  // 베타: 1~0번 캐릭터 슬롯. model은 지금 고른 슬롯을 가리킨다.
  const initial = beta ? loadSlots() : null
  const slots = reactive<Model[]>(initial ? initial.slots : [])
  const activeSlot = ref(initial ? initial.active : 0)
  const model = ref<Model>(beta ? slots[activeSlot.value]! : loadModel())
  // 다른 탭에서 캐릭터를 고치면 여기도 바로 반영
  if (beta) {
    onSlotsChanged(next => {
      next.forEach((m, i) => slots[i] = m)
      model.value = slots[activeSlot.value]!
    })
  }
  const selectedId = ref<string | null>(model.value.layers[0]?.id ?? null)
  const selected = computed(() => model.value.layers.find(l => l.id == selectedId.value) || null)
  const imageErrors = reactive(new Set<string>()) // 이미지를 못 불러온 레이어 id

  const preview = reactive({
    mode: 'mouse' as MotionMode,
    expression: 0,
    eyesClosed: false,
    mouthOpen: false,
    focus: false,
    target: { x: 0, y: 0 },
    drag: null as Handle | null,
    hover: null as Handle | null,
    view: { zoom: 1, x: 0, y: 0 }, // 베타: 미리보기 확대·이동
    showJoints: true, // 베타: 관절 표시
    layerBones: {} as Record<string, string>, // 베타: 몸 레이어가 자동으로 붙은 뼈 이름
    poseEdit: null as null | 'a' | 'b', // 베타: 연주 포즈 동작 1·2 편집 중
    poseMode: 'rotate' as 'rotate' | 'length', // 베타: 포즈 편집 때 관절을 끌면 회전 / 길이
    playTest: false, // 베타: 연주 미리보기
  })

  // ---- 저장 ----

  let saveTimer: ReturnType<typeof setTimeout> | undefined
  function save() {
    saveModel(toRaw(model.value))
    if (beta) saveSlots(toRaw(slots).map(s => toRaw(s)), activeSlot.value)
  }
  watch([model, slots], () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(save, 300)
  }, { deep: true })

  // '라이브 시작'처럼 페이지를 떠날 때 저장 대기 중인 변경이 사라지지 않도록
  window.addEventListener('pagehide', () => {
    clearTimeout(saveTimer)
    save()
  })

  // 파일이 바뀌거나 레이어가 지워질 땐 바로 저장하고 안 쓰는 파일을 정리
  function saveNow() {
    clearTimeout(saveTimer)
    save()
    cleanupFiles(toRaw(model.value)).catch(e => console.error(e))
  }

  // ---- 베타: 캐릭터 슬롯 ----

  const CLIP_KEY = 'ftSlotClipboardBeta'
  const clipboard = ref<{ from: number; json: string } | null>((() => {
    try {
      return JSON.parse(localStorage.getItem(CLIP_KEY) || 'null')
    } catch (e) {
      return null
    }
  })())

  function selectSlot(i: number) {
    activeSlot.value = i
    model.value = slots[i]!
    imageErrors.clear()
    if (!model.value.layers.some(l => l.id == selectedId.value)) selectLayer(model.value.layers[0]?.id ?? null)
    save()
  }

  function copySlot(i: number) {
    clipboard.value = { from: i, json: JSON.stringify(toRaw(slots[i])) }
    localStorage.setItem(CLIP_KEY, JSON.stringify(clipboard.value))
  }

  function pasteSlot(i: number) {
    if (!clipboard.value) return
    slots[i] = normalizeModel(JSON.parse(clipboard.value.json))
    if (i == activeSlot.value) selectSlot(i)
    saveNow()
  }

  // ---- 레이어 ----

  // 고른 레이어가 미리보기에서 보이도록 표정/상태를 맞춘다
  function ensureVisible(l: Layer) {
    if (!l.expressions[preview.expression]) {
      const i = l.expressions.indexOf(true)
      if (i >= 0) preview.expression = i
    }
    if (l.show == 'eyesClosed') preview.eyesClosed = true
    if (l.show == 'eyesOpen') preview.eyesClosed = false
    if (l.show == 'mouthOpen') preview.mouthOpen = true
    if (l.show == 'mouthClosed') preview.mouthOpen = false
  }

  function selectLayer(id: string | null) {
    selectedId.value = id
    if (selected.value) ensureVisible(selected.value)
  }

  function addLayer(key: PresetKey) {
    const layers = model.value.layers
    const l = newLayer(key)
    // 앞머리는 맨 앞, 뒷머리는 맨 뒤, 나머지는 선택한 레이어 바로 앞에
    let at = Math.max(0, layers.findIndex(x => x.id == selectedId.value))
    if (key == 'bang') at = 0
    if (key == 'back') at = layers.length
    layers.splice(at, 0, l)
    selectLayer(l.id)
  }

  // 선택한 레이어를 복제해서 원본 바로 앞에 넣는다
  function duplicateSelected() {
    const src = selected.value
    if (!src) return
    const layers = model.value.layers
    const copy = duplicateLayer(toRaw(src))
    layers.splice(layers.findIndex(l => l.id == src.id), 0, copy)
    selectLayer(copy.id)
  }

  function removeLayer(id: string) {
    const layers = model.value.layers
    const i = layers.findIndex(l => l.id == id)
    if (i < 0) return
    layers.splice(i, 1)
    if (id == selectedId.value) {
      const next = layers[Math.min(i, layers.length - 1)]
      selectLayer(next ? next.id : null)
    }
    imageErrors.delete(id)
    saveNow()
  }

  function moveLayer(from: number, to: number) {
    const layers = model.value.layers
    if (to < 0 || to >= layers.length || from == to) return
    const [l] = layers.splice(from, 1)
    layers.splice(to, 0, l!)
  }

  function setSource(l: Layer, src: LayerSource) {
    l.src = src
    imageErrors.delete(l.id)
    saveNow()
  }

  async function uploadFile(file: File | undefined) {
    const l = selected.value
    if (!l || !file || !file.type.startsWith('image/')) return
    setSource(l, { type: 'file', value: await putFile(file) })
  }

  // ---- 전체 ----

  function replaceModel(m: Model) {
    if (beta) slots[activeSlot.value] = m
    model.value = beta ? slots[activeSlot.value]! : m
    imageErrors.clear()
    selectLayer(m.layers[0]?.id ?? null)
    saveNow()
  }

  function reset() {
    replaceModel(defaultModel())
  }

  async function exportBackup() {
    const text = await exportJSON(toRaw(model.value))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    a.download = 'feathertalk-backup.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importBackup(file: File) {
    replaceModel(await importJSON(await file.text()))
  }

  if (selected.value) ensureVisible(selected.value)

  return {
    model, selectedId, selected, imageErrors, preview,
    slots, activeSlot, clipboard, selectSlot, copySlot, pasteSlot,
    ensureVisible, selectLayer, addLayer, duplicateSelected, removeLayer, moveLayer, setSource, uploadFile,
    reset, exportBackup, importBackup,
  }
}

const editors = new Map<boolean, ReturnType<typeof createEditor>>()

// 정식판(/)과 베타(/beta)는 저장 공간이 따로라 상태도 따로 만든다
export function useEditor() {
  const beta = useBeta()
  if (!editors.has(beta)) editors.set(beta, createEditor(beta))
  return editors.get(beta)!
}
