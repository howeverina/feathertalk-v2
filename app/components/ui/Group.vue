<script setup lang="ts">
// 설정 묶음. 베타에서는 접고 펼 수 있고, 접혀 있으면 지금 상태를 한 줄로 보여준다.
// 정식판에서는 예전처럼 제목만 보여준다.
import { ChevronRight } from '@lucide/vue'

const props = withDefaults(defineProps<{
  title: string
  id: string // 펼침 상태를 기억할 이름
  summary?: string // 접혀 있을 때 오른쪽에 보이는 요약
  help?: string // 제목 옆 ⓘ 설명
  open?: boolean // 처음 펼쳐 둘지
}>(), { open: false })

const beta = useBeta()
const KEY = 'ftGroupOpen'
function load(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch (e) {
    return {}
  }
}
const isOpen = ref(load()[props.id] ?? props.open)
watch(isOpen, v => {
  const all = load()
  all[props.id] = v
  localStorage.setItem(KEY, JSON.stringify(all))
})
</script>

<template>
  <div v-if="beta" class="group" :class="{ open: isOpen }">
    <button type="button" class="group-head" :aria-expanded="isOpen" @click="isOpen = !isOpen">
      <ChevronRight class="chev" :size="16" />
      <span class="group-title">{{ title }}</span>
      <UiInfoTip v-if="help" :text="help" />
      <span v-if="summary && !isOpen" class="group-summary">{{ summary }}</span>
    </button>
    <div v-show="isOpen" class="group-body">
      <slot />
    </div>
  </div>
  <template v-else>
    <h4>{{ title }}</h4>
    <slot />
  </template>
</template>

<style scoped>
.group {
  border-top: 1px solid var(--line);
}

.group:first-child {
  border-top: 0;
}

.group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  border: 0;
  background: none;
  padding: 10px 2px;
  cursor: pointer;
  text-align: left;
}

.chev {
  flex: none;
  color: var(--muted);
  transition: transform 0.15s;
}

.open .chev {
  transform: rotate(90deg);
}

.group-title {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text);
}

.group-summary {
  margin-left: auto;
  font-size: 0.78rem;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 55%;
}

.group-body {
  padding: 0 2px 12px 24px;
}
</style>
