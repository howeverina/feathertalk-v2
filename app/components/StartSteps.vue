<script setup lang="ts">
// 베타: 처음 쓰는 사람을 위한 할 일 목록. 해낸 단계는 저절로 체크된다.
import { Check, X } from '@lucide/vue'

const emit = defineEmits<{ close: []; go: [tab: 'layers' | 'character'] }>()
const { model } = useEditor()
const base = useBase()

const KEY = 'ftStepsBeta'
const done = reactive<Record<string, boolean>>((() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch (e) {
    return {}
  }
})())
watch(done, v => localStorage.setItem(KEY, JSON.stringify(v)))

// 내 그림을 넣었는지는 바로 알 수 있고, 나머지는 바꾼 적이 있는지 지켜본다
const hasOwnImage = computed(() => model.value.layers.some(l => l.src.value && !l.src.value.startsWith('/assets/')))
watch(() => ({ ...model.value.center }), () => done.center = true)
watch(() => model.value.layers.map(l => l.depth + ',' + l.curve).join(), () => done.depth = true)

const steps = computed(() => [
  { id: 'image', title: '내 그림 넣기', desc: '레이어를 고르고 이미지를 올려요', ok: hasOwnImage.value, tab: 'layers' as const },
  { id: 'center', title: '얼굴 중심 맞추기', desc: '미리보기의 + 와 점선 원을 얼굴에', ok: !!done.center, tab: 'character' as const },
  { id: 'depth', title: '입체감 조절', desc: '레이어마다 깊이·볼록을 조절해요', ok: !!done.depth, tab: 'layers' as const },
  { id: 'live', title: '라이브 시작', desc: 'OBS 등에서 캡처해요', ok: !!done.live, tab: null },
])
const count = computed(() => steps.value.filter(s => s.ok).length)

function click(s: { id: string; tab: 'layers' | 'character' | null }) {
  if (s.tab) emit('go', s.tab)
  else {
    done.live = true
    location.href = `${base}/live`
  }
}
</script>

<template>
  <section class="panel start">
    <button class="close" title="닫기 (상단의 '사용법'으로 다시 열 수 있어요)" @click="emit('close')"><X :size="18" /></button>
    <h3>시작하기 <small>{{ count }} / {{ steps.length }}</small></h3>
    <ol class="list">
      <li v-for="(s, i) in steps" :key="s.id" :class="{ ok: s.ok }">
        <button type="button" @click="click(s)">
          <span class="mark"><Check v-if="s.ok" :size="14" /><template v-else>{{ i + 1 }}</template></span>
          <span class="text"><b>{{ s.title }}</b><span>{{ s.desc }}</span></span>
        </button>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.start {
  border: 2px solid var(--main);
}

.close {
  position: absolute;
  top: 8px;
  right: 10px;
  border: 0;
  background: none;
  color: var(--muted);
  cursor: pointer;
  display: grid;
  place-items: center;
}

h3 small {
  color: var(--main-dark);
  font-weight: 700;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

@media (max-width: 860px) {
  .list {
    grid-template-columns: 1fr 1fr;
  }
}

.list button {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  height: 100%;
  text-align: left;
  border: 1px solid var(--line);
  background: #f9fcff;
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
}

.list button:hover {
  border-color: var(--main);
}

.mark {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 1.5em;
  height: 1.5em;
  border-radius: 50%;
  background: white;
  border: 2px solid var(--main);
  color: var(--main-dark);
  font-size: 0.8rem;
  font-weight: 700;
}

.ok .mark {
  background: var(--main);
  color: white;
}

.ok .text b {
  color: var(--muted);
  text-decoration: line-through;
}

.text {
  display: flex;
  flex-direction: column;
  font-size: 0.85rem;
  line-height: 1.4;
}

.text span {
  color: var(--muted);
  font-size: 0.75rem;
}
</style>
