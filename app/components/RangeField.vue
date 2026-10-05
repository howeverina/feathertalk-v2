<script setup lang="ts">
// 이름, 양끝 설명, 값 표시, 한 줄 설명이 붙은 슬라이더. 더블클릭하면 기본값으로.
const props = withDefaults(defineProps<{
  label: string
  left: string
  right: string
  min: number
  max: number
  step?: number
  def?: number
  snap?: number // 0 근처(±snap)는 0으로 붙인다
  desc?: string
  format?: (v: number) => string
}>(), { step: 1 })

const value = defineModel<number>({ required: true })

function onInput(e: Event) {
  const el = e.target as HTMLInputElement
  let v = parseFloat(el.value)
  if (props.snap && Math.abs(v) <= props.snap) {
    v = 0
    el.value = '0'
  }
  value.value = v
}

function reset() {
  if (props.def !== undefined) value.value = props.def
}
</script>

<template>
  <div class="field">
    <div class="field-head">
      <b>{{ label }}</b>
      <slot name="icon" />
      <output>{{ format ? format(value) : value }}</output>
    </div>
    <div class="range">
      <span>{{ left }}</span>
      <input type="range" :min :max :step :value="value" @input="onInput" @dblclick="reset">
      <span>{{ right }}</span>
    </div>
    <p v-if="desc" class="desc">{{ desc }}</p>
  </div>
</template>

<style scoped>
.field {
  margin-top: 10px;
}

.field-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.field-head output {
  margin-left: auto;
  font-size: 0.8rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.range {
  display: flex;
  align-items: center;
  gap: 8px;
}

.range span {
  font-size: 0.75rem;
  color: var(--muted);
  width: 3em;
  flex: none;
  text-align: center;
}

.range input {
  flex: 1;
}
</style>
