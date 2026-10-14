<script setup lang="ts">
// 작은 ⓘ 아이콘: 마우스를 올리거나 누르면 설명이 뜬다 (긴 설명을 화면에 늘어놓지 않으려고)
import { Info } from '@lucide/vue'

defineProps<{ text?: string }>()
const open = ref(false)
</script>

<template>
  <span class="info" @mouseenter="open = true" @mouseleave="open = false">
    <button type="button" class="info-btn" aria-label="설명 보기" @click.stop="open = !open"><Info :size="14" /></button>
    <span v-if="open" class="info-pop" role="tooltip">{{ text }}<slot /></span>
  </span>
</template>

<style scoped>
.info {
  position: relative;
  display: inline-flex;
  vertical-align: middle;
}

.info-btn {
  display: inline-grid;
  place-items: center;
  border: 0;
  background: none;
  padding: 1px;
  color: #b8c2cc;
  cursor: help;
  border-radius: 50%;
}

.info-btn:hover,
.info-btn:focus-visible {
  color: var(--main-dark);
}

.info-pop {
  position: absolute;
  z-index: 30;
  top: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  width: max-content;
  max-width: 260px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #333;
  color: white;
  font-size: 0.78rem;
  font-weight: 400;
  line-height: 1.5;
  white-space: normal;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
}
</style>
