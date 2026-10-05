// 편집기 전체가 함께 쓰는 상태 (모델, 선택한 레이어, 미리보기 상태)
import {
  loadModel, saveModel, newLayer, defaultModel, cleanupFiles, putFile, exportJSON, importJSON,
  type Layer, type LayerSource, type Model, type PresetKey,
} from '~/lib/model'

export type MotionMode = 'mouse' | 'auto' | 'still'
export type Handle = 'center' | 'radius' | 'anchor'

function createEditor() {
  const model = ref<Model>(loadModel())
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
  })

  // ---- 저장 ----

  let saveTimer: ReturnType<typeof setTimeout> | undefined
  watch(model, () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveModel(toRaw(model.value)), 300)
  }, { deep: true })

  // '라이브 시작'처럼 페이지를 떠날 때 저장 대기 중인 변경이 사라지지 않도록
  window.addEventListener('pagehide', () => {
    clearTimeout(saveTimer)
    saveModel(toRaw(model.value))
  })

  // 파일이 바뀌거나 레이어가 지워질 땐 바로 저장하고 안 쓰는 파일을 정리
  function saveNow() {
    clearTimeout(saveTimer)
    saveModel(toRaw(model.value))
    cleanupFiles(toRaw(model.value)).catch(e => console.error(e))
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
    model.value = m
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
    ensureVisible, selectLayer, addLayer, removeLayer, moveLayer, setSource, uploadFile,
    reset, exportBackup, importBackup,
  }
}

let editor: ReturnType<typeof createEditor> | null = null

export function useEditor() {
  if (!editor) editor = createEditor()
  return editor
}
