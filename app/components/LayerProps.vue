<script setup lang="ts">
import { SHOW_OPTIONS } from '~/lib/model'

const ed = useEditor()
const { selected, imageErrors } = ed

const signed = (v: number) => (v > 0 ? '+' : '') + v
const percent = (v: number) => Math.round(v * 100) + '%'

// 볼록/오목 아이콘: 값에 따라 휘는 곡선
const curvePath = computed(() => {
  const c = 10 - (selected.value?.curve ?? 0) / 100 * 8
  return `M2 10 Q20 ${c * 2 - 10} 38 10`
})

// ---- 이미지 ----

const urlDraft = ref('')
const hasImage = ref(false)
const dragOver = ref(false)
const fileInput = ref<HTMLInputElement>()

watch(() => selected.value && [selected.value.id, selected.value.src.type, selected.value.src.value], () => {
  const l = selected.value
  urlDraft.value = l && l.src.type == 'url' ? l.src.value : ''
}, { immediate: true })

let urlTimer: ReturnType<typeof setTimeout> | undefined
function onUrlInput() {
  clearTimeout(urlTimer)
  const l = selected.value
  urlTimer = setTimeout(() => {
    if (l) ed.setSource(l, { type: 'url', value: urlDraft.value.trim() })
  }, 500)
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  ed.uploadFile(input.files?.[0])
  input.value = ''
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  ed.uploadFile(e.dataTransfer?.files[0])
}

// ---- 표정 ----

function toggleExpression(i: number) {
  const l = selected.value!
  l.expressions[i] = !l.expressions[i]
}

const allOn = computed(() => !!selected.value?.expressions.every(Boolean))

function toggleAll() {
  selected.value!.expressions.fill(!allOn.value)
}
</script>

<template>
  <section class="panel">
    <p v-if="!selected" class="tip">위 목록에서 레이어를 골라 주세요.</p>
    <div v-else>
      <input v-model="selected.name" type="text" class="layer-name" placeholder="레이어 이름">

      <h4>이미지</h4>
      <div class="image-box">
        <div
          class="drop-zone"
          :class="{ over: dragOver, 'has-image': hasImage }"
          title="이미지 파일을 여기로 끌어다 놓아도 돼요"
          @dragover.prevent="dragOver = true"
          @dragleave="dragOver = false"
          @drop.prevent="onDrop"
        >
          <LayerImage :layer="selected" @loaded="hasImage = $event" />
          <span>파일을 끌어다 놓기</span>
        </div>
        <div class="image-inputs">
          <input v-model="urlDraft" type="text" placeholder="이미지 주소 (https://...)" @input="onUrlInput">
          <div>
            <button class="plain" @click="fileInput?.click()">내 PC에서 파일 선택</button>
            <input ref="fileInput" type="file" accept="image/*" hidden @change="onFileChange">
          </div>
          <p v-if="selected.src.type == 'file'" class="desc">
            업로드한 파일을 쓰고 있어요 (이 브라우저에만 저장돼요). 주소를 입력하면 주소로 바뀌어요.
          </p>
          <p v-if="imageErrors.has(selected.id)" class="error">
            이미지를 불러오지 못했어요. 주소가 맞는지 확인해 주세요. 주소가 맞다면 그 사이트가 외부 사용(CORS)을 막아 둔 것일 수 있어요.
            그럴 땐 이미지를 내려받아 <b>파일 선택</b>으로 올려 주세요.
          </p>
        </div>
      </div>

      <h4>언제 보일까요?</h4>
      <div class="row">
        <select v-model="selected.show" @change="ed.ensureVisible(selected)">
          <option v-for="[value, label] in SHOW_OPTIONS" :key="value" :value="value">{{ label }}</option>
        </select>
        <div class="seg">
          <button :class="{ on: selected.part == 'head' }" title="고개를 따라 돌아가요" @click="selected.part = 'head'">머리</button>
          <button :class="{ on: selected.part == 'body' }" title="고개를 돌려도 그대로 있어요 (기울기만 따라가요)" @click="selected.part = 'body'">몸</button>
        </div>
      </div>
      <label class="check-row">
        <input v-model="selected.clip" type="checkbox">
        <span><b>아래 레이어에 맞춰 자르기 (클리핑)</b></span>
      </label>
      <p class="desc">
        켜면 목록에서 바로 아래(뒤) 레이어의 그림 안쪽에만 보여요. 예: 눈동자를 흰자 레이어 바로 위에 두고 켜면 흰자 밖으로 안 나가요.
        눈동자는 '눈 뜰 때'로, 깊이는 흰자보다 높게 두면 고개를 돌릴 때 시선이 따라가는 느낌이 나요.
      </p>
      <label class="check-row">
        <input v-model="selected.pop" type="checkbox">
        <span><b>깜빡일 때 통통 (눈동자용)</b></span>
      </label>
      <p class="desc">켜면 눈을 감을 때 같이 눌렸다가, 뜰 때 탄성 있는 공처럼 살짝 길쭉하게 튀었다가 돌아와요. 미리보기의 '깜빡여 보기'로 확인할 수 있어요.</p>
      <p class="desc">
        표정 번호(숫자키)마다 보일지 골라요. 예를 들어 '웃는 눈' 레이어를 2번에서만 켜 두면, 라이브 중 2를 누를 때만 나타나요.
      </p>
      <div class="chips">
        <button
          v-for="(on, i) in selected.expressions"
          :key="i"
          :class="{ on }"
          :title="`${(i + 1) % 10}번 표정에서 보이기`"
          @click="toggleExpression(i)"
        >
          {{ (i + 1) % 10 }}
        </button>
        <button class="all" :class="{ on: allOn }" @click="toggleAll">전체</button>
      </div>

      <h4>입체감</h4>
      <RangeField
        v-model="selected.depth" label="깊이" left="뒤" right="앞" :min="-100" :max="100" :def="0" :snap="4" :format="signed"
        desc="고개를 돌릴 때 얼마나 움직일지 정해요. 앞쪽(앞머리, 눈)은 많이 움직이고, 뒤쪽(뒷머리)은 반대 방향으로 움직여요."
      />
      <RangeField
        v-model="selected.curve" label="볼록 / 오목" left="오목" right="볼록" :min="-100" :max="100" :def="0" :snap="4" :format="signed"
        desc="볼록하면 얼굴 중심 쪽이 가장자리보다 더 많이 움직여서 둥글게 보여요. 얼굴처럼 둥근 부위는 볼록하게 두면 좋아요."
      >
        <template #icon>
          <svg class="curve-icon" viewBox="0 0 40 20" width="40" height="20"><path :d="curvePath" /></svg>
        </template>
      </RangeField>

      <h4>머리카락 · 장식</h4>
      <label class="switch">
        <input v-model="selected.hair.enabled" type="checkbox">
        <span class="knob" />
        <span>흔들림 물리</span>
      </label>
      <p class="desc">켜면 고개를 움직일 때 끝부분이 관성으로 뒤따라 출렁이고, 고개를 기울여도 원래 방향(아래 또는 위)을 유지하려 해요.</p>
      <div v-if="selected.hair.enabled" class="hair-fields">
        <div class="row dir-row">
          <span class="dir-label">흔들리는 쪽</span>
          <div class="seg">
            <button :class="{ on: selected.hair.dir == 'down' }" title="머리카락처럼 고정선 아래로 늘어진 것" @click="selected.hair.dir = 'down'">고정선 아래 (머리카락)</button>
            <button :class="{ on: selected.hair.dir == 'up' }" title="리본·머리장식처럼 고정선 위로 솟은 것" @click="selected.hair.dir = 'up'">고정선 위 (리본·장식)</button>
          </div>
        </div>
        <RangeField
          v-model="selected.hair.anchorY" label="고정선 높이" left="위" right="아래" :min="0" :max="1" :step="0.01" :def="0.25" :format="percent"
          :desc="selected.hair.dir == 'up'
            ? '이 선보다 아래는 고정되고, 위로 갈수록 많이 흔들려요. 리본이 머리에 붙은 높이에 둬요. 미리보기의 분홍 점선을 끌어도 돼요.'
            : '이 선보다 위는 고정되고, 아래로 갈수록 많이 흔들려요. 보통 정수리나 가르마 높이에 둬요. 미리보기의 분홍 점선을 끌어도 돼요.'"
        />
        <RangeField v-model="selected.hair.sway" label="흔들림 세기" left="약하게" right="세게" :min="0" :max="100" :def="50" />
        <RangeField
          v-model="selected.hair.stiffness" label="탄성" left="느슨" right="탱탱" :min="0" :max="100" :def="50"
          desc="높을수록 빨리 제자리로 돌아와요. 짧은 머리는 높게, 긴 머리는 낮게."
        />
        <RangeField
          v-model="selected.hair.bounce" label="출렁임" left="차분" right="통통" :min="0" :max="100" :def="50"
          desc="높을수록 멈춘 뒤에도 여러 번 흔들려요."
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.layer-name {
  font-weight: 700;
}

.image-box {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.drop-zone {
  position: relative;
  width: 96px;
  height: 96px;
  flex: none;
  border: 2px dashed var(--line);
  border-radius: 10px;
  background: repeating-conic-gradient(#f4f6f8 0% 25%, #fff 0% 50%) 50% / 12px 12px;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.drop-zone.over {
  border-color: var(--main-dark);
}

.drop-zone img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.drop-zone span {
  font-size: 0.7rem;
  color: var(--muted);
  text-align: center;
  padding: 4px;
}

.drop-zone.has-image span {
  display: none;
}

.image-inputs {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row select {
  width: auto;
  flex: 1;
}

.check-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  cursor: pointer;
}

.chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.chips button {
  width: 2.2em;
  border: 1px solid var(--line);
  background: white;
  border-radius: 8px;
  padding: 2px 0;
  cursor: pointer;
}

.chips button.on {
  background: var(--main);
  border-color: var(--main);
  color: white;
}

.chips button.all {
  width: auto;
  padding: 2px 8px;
}

.curve-icon path {
  fill: none;
  stroke: var(--main-dark);
  stroke-width: 2.5;
  stroke-linecap: round;
}

.switch {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 700;
}

.switch input {
  display: none;
}

.knob {
  position: relative;
  width: 38px;
  height: 22px;
  border-radius: 11px;
  background: #d6dde3;
  transition: background 0.2s;
  flex: none;
}

.knob::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
  transition: left 0.2s;
}

.switch input:checked + .knob {
  background: var(--hair);
}

.switch input:checked + .knob::after {
  left: 19px;
}

.dir-row {
  margin-top: 8px;
}

.dir-label {
  font-weight: 700;
  font-size: 0.9rem;
}

.hair-fields {
  border-left: 3px solid #ffe0e7;
  padding-left: 10px;
  margin-top: 6px;
}
</style>
