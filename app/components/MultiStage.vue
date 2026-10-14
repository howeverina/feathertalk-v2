<script setup lang="ts">
// 멀티 무대 (16:9). 편집 화면에서는 캐릭터·오브젝트를 끌어서 옮기고, 오른쪽 아래 점을 끌어 크기를 바꾼다.
import { getFile, type Model } from '~/lib/model'
import type { MultiSettings } from '~/lib/multi'

const props = defineProps<{
  settings: MultiSettings
  models: Model[]
  talking: boolean[]
  editable?: boolean
}>()

const stage = ref<HTMLDivElement>()

// 업로드한 오브젝트 이미지 주소
const urls = reactive<Record<string, string>>({})
watchEffect(async () => {
  const keys = props.settings.objects.map(o => o.file).filter(Boolean)
  for (const k of keys) {
    if (urls[k]) continue
    const blob = await getFile(k)
    if (blob) urls[k] = URL.createObjectURL(blob)
  }
})

const items = computed(() => props.settings.order.map(key => {
  if (key.startsWith('c')) {
    const i = +key.slice(1)
    const c = props.settings.chars[i]
    return c && c.on ? { key, kind: 'char' as const, i, o: c } : null
  }
  const o = props.settings.objects.find(x => 'o:' + x.id == key)
  return o ? { key, kind: 'obj' as const, i: -1, o } : null
}).filter(Boolean) as { key: string; kind: 'char' | 'obj'; i: number; o: { x: number; y: number; w: number } }[])

const bgStyle = computed(() => ({ background: props.settings.background }))

// ---- 끌어서 옮기기 / 크기 바꾸기 ----

let drag: { o: { x: number; y: number; w: number }; resize: boolean; sx: number; sy: number; x: number; y: number; w: number; W: number; H: number } | null = null

function onDown(e: PointerEvent, o: { x: number; y: number; w: number }) {
  if (!props.editable) return
  const r = stage.value!.getBoundingClientRect()
  drag = { o, resize: !!(e.target as HTMLElement).closest('.handle'), sx: e.clientX, sy: e.clientY, x: o.x, y: o.y, w: o.w, W: r.width, H: r.height }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  e.preventDefault()
}

function onMove(e: PointerEvent) {
  if (!drag) return
  const dx = (e.clientX - drag.sx) / drag.W * 100, dy = (e.clientY - drag.sy) / drag.H * 100
  if (drag.resize) drag.o.w = Math.max(3, Math.round((drag.w + dx) * 10) / 10)
  else {
    drag.o.x = Math.round((drag.x + dx) * 10) / 10
    drag.o.y = Math.round((drag.y + dy) * 10) / 10
  }
}

function onUp() {
  drag = null
}
</script>

<template>
  <div ref="stage" class="stage" :class="{ editable }" :style="bgStyle">
    <div
      v-for="(it, z) in items"
      :key="it.key"
      class="item"
      :class="{ talking: it.kind == 'char' && talking[it.i] }"
      :style="{
        left: it.o.x + '%', top: it.o.y + '%', width: it.o.w + '%', zIndex: z,
        aspectRatio: it.kind == 'char' ? `1 / ${models[it.i]?.aspect || 1}` : undefined,
      }"
      @pointerdown="onDown($event, it.o)"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <MultiCharacter v-if="it.kind == 'char' && models[it.i]" :model="models[it.i]!" :talking="talking[it.i]!" :motion="settings.chars[it.i]!.motion" />
      <img v-else-if="it.kind == 'obj'" :src="urls[(it.o as any).file]" alt="" draggable="false">
      <template v-if="editable">
        <span class="tag">{{ it.kind == 'char' ? `${(it.i + 1) % 10}번` : (it.o as any).name || '오브젝트' }}</span>
        <span class="handle" title="끌어서 크기 바꾸기" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
}

.item {
  position: absolute;
}

.item img {
  display: block;
  width: 100%;
  height: auto;
  user-select: none;
}

.editable .item {
  cursor: move;
  outline: 1px dashed rgba(63, 181, 238, 0.6);
  touch-action: none;
}

.editable .item.talking {
  outline: 2px solid #2ecc71;
}

.tag {
  position: absolute;
  left: 0;
  top: 0;
  padding: 0 6px;
  font-size: 0.7rem;
  color: white;
  background: rgba(63, 181, 238, 0.85);
  border-radius: 0 0 6px 0;
  pointer-events: none;
}

.talking .tag {
  background: #2ecc71;
}

.handle {
  position: absolute;
  right: -6px;
  bottom: -6px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #3fb5ee;
  border: 2px solid white;
  cursor: nwse-resize;
}
</style>
