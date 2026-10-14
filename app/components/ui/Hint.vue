<script setup lang="ts">
// 긴 설명. 정식판은 문단으로, 베타는 ⓘ 안에 넣어 화면을 가볍게.
const beta = useBeta()
</script>

<template>
  <UiInfoTip v-if="beta"><slot /></UiInfoTip>
  <p v-else class="desc"><slot /></p>
</template>
