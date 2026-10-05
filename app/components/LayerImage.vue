<script setup lang="ts">
// 레이어 이미지 (업로드한 파일이면 IndexedDB에서 꺼내서) 표시
import { resolveSrc, type Layer } from '~/lib/model'

const props = defineProps<{ layer: Layer }>()
const emit = defineEmits<{ loaded: [hasImage: boolean] }>()
const url = ref('')

watch(() => [props.layer.src.type, props.layer.src.value], async () => {
  const layer = props.layer
  const u = await resolveSrc(layer)
  if (layer != props.layer) return
  url.value = u || '/assets/transparent.png'
  emit('loaded', !!u)
}, { immediate: true })
</script>

<template>
  <img :src="url" alt="">
</template>
