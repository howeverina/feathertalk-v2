<script setup lang="ts">
// 편집기 본체: 왼쪽 미리보기 + 오른쪽 설정. 베타 편집기와 멀티의 '캐릭터 만들기' 탭이 함께 쓴다.
import { Bone, Layers, SlidersHorizontal } from '@lucide/vue'

export type EditorTab = 'layers' | 'character' | 'body'

const beta = useBeta()
// 베타: 오른쪽 설정을 탭으로 나눈다
const TABS: [EditorTab, string, any][] = [['layers', '레이어', Layers], ['character', '캐릭터', SlidersHorizontal], ['body', '몸 리깅', Bone]]
const tab = defineModel<EditorTab>('tab', { default: 'layers' })
</script>

<template>
  <div class="editor-grid">
    <PreviewStage />
    <div v-if="beta">
      <nav class="tabs" role="tablist">
        <button v-for="[id, label, icon] in TABS" :key="id" role="tab" :aria-selected="tab == id" :class="{ on: tab == id }" @click="tab = id">
          <component :is="icon" :size="16" /> {{ label }}
        </button>
      </nav>
      <template v-if="tab == 'layers'">
        <LayerList />
        <LayerProps />
      </template>
      <GlobalSettings v-else-if="tab == 'character'" />
      <BodyRigSettings v-else />
    </div>
    <div v-else>
      <LayerList />
      <LayerProps />
      <GlobalSettings />
    </div>
  </div>
</template>

<style scoped>
.editor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

@media (max-width: 860px) {
  .editor-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.tabs {
  position: sticky;
  top: 3.6rem;
  z-index: 10;
  display: flex;
  gap: 4px;
  padding: 4px;
  margin-bottom: 10px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 1px 0 var(--line);
}

.tabs button {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  background: none;
  border-radius: 9px;
  padding: 7px 6px;
  cursor: pointer;
  font-weight: 700;
  color: var(--muted);
}

.tabs button.on {
  background: var(--main);
  color: white;
}
</style>
