<script setup lang="ts">
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, GripVertical, Plus, Trash2, TriangleAlert } from '@lucide/vue'
import { PRESETS, SHOW_OPTIONS, type Layer, type PresetKey } from '~/lib/model'

const ed = useEditor()
const { model, selectedId, selected, imageErrors } = ed
const menuOpen = ref(false)
const presets = Object.entries(PRESETS) as [PresetKey, (typeof PRESETS)[PresetKey]][]
const showLabel = Object.fromEntries(SHOW_OPTIONS)

function badges(l: Layer) {
  const out: [string, string][] = []
  if (imageErrors.has(l.id)) out.push(['이미지 오류', 'err'])
  else if (!l.src.value) out.push(['이미지 없음', ''])
  if (l.part == 'body') out.push(['몸', ''])
  if (l.show != 'always') out.push([showLabel[l.show]!, ''])
  if (l.hair.enabled && l.part != 'body') out.push(['머리카락', 'hair'])
  return out
}

function add(key: PresetKey) {
  ed.addLayer(key)
  menuOpen.value = false
}

function remove(l: Layer) {
  if (confirm(`'${l.name}' 레이어를 지울까요?`)) ed.removeLayer(l.id)
}

// 끌어서 순서 바꾸기
const dragId = ref<string | null>(null)
const overId = ref<string | null>(null)

function onDrop(target: Layer) {
  const layers = model.value.layers
  const from = layers.findIndex(l => l.id == dragId.value)
  let to = layers.findIndex(l => l.id == target.id)
  if (from < 0) return
  if (from < to) to--
  ed.moveLayer(from, to)
}

function onDragEnd() {
  dragId.value = null
  overId.value = null
}
</script>

<template>
  <section class="panel">
    <h3>레이어 <small>위에 있을수록 앞에 그려져요 · 끌어서 순서 변경</small></h3>
    <ul class="layers">
      <li
        v-for="(l, i) in model.layers"
        :key="l.id"
        draggable="true"
        :class="{ selected: l.id == selectedId, 'hidden-layer': !l.visible, 'drag-over': overId == l.id && dragId != l.id }"
        @click="ed.selectLayer(l.id)"
        @dragstart="dragId = l.id"
        @dragover.prevent="overId = l.id"
        @drop.prevent="onDrop(l)"
        @dragend="onDragEnd"
      >
        <GripVertical class="grip" :size="16" aria-label="끌어서 순서 변경" />
        <LayerImage :layer="l" class="thumb" />
        <span class="name">
          {{ l.name || '(이름 없음)' }}
          <span v-for="[text, cls] in badges(l)" :key="text" class="badge" :class="cls"><TriangleAlert v-if="cls == 'err'" :size="11" />{{ text }}</span>
        </span>
        <button class="icon" :title="l.visible ? '숨기기' : '보이기'" @click.stop="l.visible = !l.visible">
          <Eye v-if="l.visible" :size="17" />
          <EyeOff v-else :size="17" />
        </button>
        <button class="icon" title="한 칸 앞으로" @click.stop="ed.moveLayer(i, i - 1)"><ChevronUp :size="17" /></button>
        <button class="icon" title="한 칸 뒤로" @click.stop="ed.moveLayer(i, i + 1)"><ChevronDown :size="17" /></button>
        <button class="icon" title="삭제" @click.stop="remove(l)"><Trash2 :size="17" /></button>
      </li>
    </ul>
    <div class="actions">
      <button class="primary" @click="menuOpen = !menuOpen"><Plus :size="16" /> 레이어 추가</button>
      <button
        class="primary secondary"
        :disabled="!selected"
        :title="selected ? `'${selected.name}' 레이어를 이미지·설정까지 그대로 복제해요` : '복제할 레이어를 먼저 골라 주세요'"
        @click="ed.duplicateSelected()"
      >
        <Copy :size="15" /> 복제
      </button>
    </div>
    <div v-if="menuOpen" class="add-menu">
      <button v-for="[key, p] in presets" :key="key" @click="add(key)">{{ p.label }}</button>
    </div>
  </section>
</template>

<style scoped>
.layers {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 360px;
  overflow-y: auto;
}

li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border: 1px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
  background: white;
}

li.selected {
  border-color: var(--main);
  background: #f0faff;
}

li.hidden-layer .name,
li.hidden-layer .thumb {
  opacity: 0.35;
}

li.drag-over {
  box-shadow: 0 -3px 0 var(--main-dark);
}

.grip {
  cursor: grab;
  color: #ccc;
  flex: none;
}

.thumb {
  width: 40px;
  height: 40px;
  object-fit: contain;
  border-radius: 6px;
  background: repeating-conic-gradient(#f4f6f8 0% 25%, #fff 0% 50%) 50% / 10px 10px;
  flex: none;
}

.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  vertical-align: middle;
  font-size: 0.7rem;
  padding: 0 6px;
  border-radius: 6px;
  background: #eef2f5;
  color: #777;
  margin-left: 4px;
}

.badge.hair {
  background: #ffe8ee;
  color: var(--hair);
}

.badge.err {
  background: #fff0f0;
  color: #e5484d;
}

.icon {
  display: inline-grid;
  place-items: center;
  border: 0;
  background: none;
  cursor: pointer;
  padding: 2px 4px;
  color: #888;
  font-size: 0.95rem;
  border-radius: 6px;
}

.icon:hover {
  background: #eef2f5;
}

.actions {
  display: flex;
  gap: 6px;
}

.actions .secondary {
  width: auto;
  flex: none;
  background: white;
  color: var(--main-dark);
  border: 1px solid var(--main);
}

.actions .secondary:disabled {
  opacity: 0.4;
  cursor: default;
}

.add-menu {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 8px;
}

.add-menu button {
  border: 1px solid var(--line);
  background: white;
  border-radius: 10px;
  padding: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}

.add-menu button:hover {
  border-color: var(--main);
}
</style>
