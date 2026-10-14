<script setup lang="ts">
// 베타: 몸 리깅 설정 (단계별)
import { defaultJoints } from '~/lib/model'
import { BONE, BONE_NAMES, PAIR } from '~/lib/skeleton'

const { model, preview, activeSlot } = useEditor()
const percent = (v: number) => Math.round(v * 100) + '%'
const strength = (v: number) => v + '%'

function resetPose(k: 'a' | 'b') {
  if (!confirm(`동작 ${k == 'a' ? 1 : 2}를 기본 자세로 되돌릴까요?`)) return
  model.value.body.poses[k] = new Array(12).fill(0)
  model.value.body.poses[k == 'a' ? 'aLen' : 'bLen'] = new Array(12).fill(1)
}

function editPose(k: null | 'a' | 'b') {
  preview.poseEdit = k
  if (k) preview.playTest = false
}

function resetJoints() {
  if (confirm('관절 위치를 기본값으로 되돌릴까요?')) model.value.body.joints = defaultJoints()
}

// 몸 레이어마다 자동으로 붙은 뼈
const bodyLayers = computed(() => model.value.layers.filter(l => l.part == 'body'))

// 연주 포즈에서 돌렸는데 그 뼈에 붙은 레이어가 없는 뼈 (돌려도 화면에 안 보인다)
const PAIR_BONES: Record<string, number[]> = {
  [BONE_NAMES[PAIR.arms]!]: [BONE.upperArmL, BONE.foreArmL, BONE.upperArmR, BONE.foreArmR],
  [BONE_NAMES[PAIR.legs]!]: [BONE.thighL, BONE.shinL, BONE.thighR, BONE.shinR],
}
const missingBones = computed(() => {
  const { a, b, aLen, bLen } = model.value.body.poses
  const covered = new Set<number>()
  for (const name of Object.values(preview.layerBones)) {
    for (const id of PAIR_BONES[name] || []) covered.add(id)
    const id = Object.entries(BONE_NAMES).find(([, n]) => n == name)?.[0]
    if (id != null) covered.add(+id)
  }
  const used = (i: number) => a[i] || b[i] || (aLen[i] ?? 1) != 1 || (bLen[i] ?? 1) != 1
  return a.map((_, i) => used(i) && !covered.has(i) ? BONE_NAMES[i] : null).filter(Boolean) as string[]
})
</script>

<template>
  <section class="panel">
    <p class="editing">{{ (activeSlot + 1) % 10 }}번 캐릭터 편집 중 <small>(미리보기 아래 '캐릭터' 탭에서 바꿔요)</small></p>
    <label class="switch big">
      <input v-model="model.body.enabled" type="checkbox">
      <span class="knob" />
      <span>몸 리깅</span>
      <UiInfoTip>
        전신 그림용이에요. 관절을 맞추면 몸 레이어가 가장 가까운 뼈를 자동으로 따라가요.
        몸은 얼굴 각도를 따라 원기둥처럼 돌고, 위아래 몸통은 S자로 반대로 기울고, 팔은 어깨에 매달려 흔들리고,
        다리는 발을 바닥에 붙인 채 무릎을 굽혀요. '머리' 레이어는 머리 뼈를 따라가요.
      </UiInfoTip>
    </label>
    <p class="desc">그림 비율은 자동으로 읽어요 (지금 {{ model.aspect }} : 1).</p>

    <template v-if="model.body.enabled">
      <ol class="steps">
        <li>
          <div class="step-head"><span class="num">1</span><b>관절 맞추기</b></div>
          <p class="desc">미리보기의 주황 점을 그림의 관절에 맞춰 끌어 주세요. 허리 양옆 점선은 몸통 두께예요.</p>
          <div class="row">
            <label class="check"><input v-model="model.body.mirror" type="checkbox"> 좌우 대칭으로 움직이기</label>
            <label class="check"><input v-model="preview.showJoints" type="checkbox"> 관절 표시</label>
            <button class="plain" @click="resetJoints">기본 위치로</button>
          </div>
        </li>
        <li>
          <div class="step-head">
            <span class="num">2</span><b>파츠 확인</b>
            <UiInfoTip>
              몸 레이어는 그림이 있는 부분에서 가장 가까운 뼈 하나에 통째로 붙어요. 몸 위쪽·팔·다리는 레이어를 나눠 주세요.
              양팔이나 양다리를 한 장에 그렸다면 반으로 잘라 좌우를 따로 움직여요. 스커트처럼 양다리에 걸친 건 몸 아래쪽에 붙어요.
            </UiInfoTip>
          </div>
          <ul v-if="bodyLayers.length" class="parts">
            <li v-for="l in bodyLayers" :key="l.id">
              <LayerImage :layer="l" class="thumb" />
              <span class="pname">{{ l.name }}</span>
              <span class="pbone">{{ preview.layerBones[l.id] || '…' }}</span>
            </li>
          </ul>
          <p v-else class="desc">아직 '몸' 레이어가 없어요. 레이어 탭에서 레이어의 부위를 '몸'으로 바꿔 주세요.</p>
        </li>
        <li>
          <div class="step-head"><span class="num">3</span><b>움직임 다듬기</b></div>
          <RangeField
            v-model="model.body.follow" label="몸이 얼굴을 따라가는 정도" left="조금" right="많이" :min="0" :max="100" :def="35" :format="strength"
            desc="고개를 돌리고 기울일 때 몸이 따라 도는 비율이에요. 라이브투디에서는 보통 3분의 1 정도예요."
          />
          <RangeField
            v-model="model.body.sway" label="골반·무릎 움직임" left="없음" right="크게" :min="0" :max="100" :def="50"
            desc="고개를 돌리거나 기울이면 골반이 반대로 기울며 밀리고, 발은 바닥에 붙은 채 무릎이 굽어요."
          />
          <RangeField
            v-model="model.body.radius" label="몸통 두께" left="얇게" right="두껍게" :min="0.02" :max="0.5" :step="0.005" :def="0.15" :format="percent"
            desc="몸통 원기둥의 반지름이에요. 미리보기에서 허리 양옆 점선을 끌어도 돼요."
          />
        </li>
        <li>
          <div class="step-head">
            <span class="num">4</span><b>연주 포즈</b> <small class="opt">선택 · {{ (activeSlot + 1) % 10 }}번 캐릭터</small>
            <UiInfoTip>
              악기를 연주할 때의 동작 1·2를 직접 만들어요. 동작을 고른 채 미리보기의 관절점을 끌면 그 뼈가 돌아가요
              (팔꿈치 → 팔 위쪽, 손목 → 팔 아래쪽, 무릎 → 다리 위쪽, 발목 → 다리 아래쪽, 목 → 몸 위쪽).
              연주 중(멀티에서는 감지될 때, 라이브에서는 마이크 소리가 날 때)에는 동작 1·2를 오가고, 끝나면 기본 자세로 돌아가요.
              드럼·피아노처럼 앞에 두는 악기는 레이어 부위를 '고정'으로 두면 움직이지 않아요.
            </UiInfoTip>
          </div>
          <div class="seg pose-seg">
            <button :class="{ on: !preview.poseEdit }" @click="editPose(null)">기본 자세 (관절 위치)</button>
            <button :class="{ on: preview.poseEdit == 'a' }" @click="editPose('a')">동작 1</button>
            <button :class="{ on: preview.poseEdit == 'b' }" @click="editPose('b')">동작 2</button>
          </div>
          <template v-if="preview.poseEdit">
            <div class="row">
              <span class="mini">끌면</span>
              <div class="seg">
                <button :class="{ on: preview.poseMode == 'rotate' }" @click="preview.poseMode = 'rotate'">회전</button>
                <button :class="{ on: preview.poseMode == 'length' }" title="팔·다리 뼈를 0.7~1.3배로 늘이거나 줄여요" @click="preview.poseMode = 'length'">길이</button>
              </div>
            </div>
            <p class="desc">
              관절점을 끌어 동작 {{ preview.poseEdit == 'a' ? 1 : 2 }}의 자세를 잡아요.
              <template v-if="preview.poseMode == 'length'">축 관절에서 멀리 끌면 뼈가 늘어나고, 가까이 끌면 줄어요 (팔·다리만).</template>
            </p>
          </template>
          <p v-if="missingBones.length" class="warn">
            {{ missingBones.join(', ') }} 뼈를 돌렸지만 그 뼈에 붙은 레이어가 없어서 화면에서는 안 움직여요.
            위 '파츠 확인'에서 그 부위 그림이 따로 레이어로 나뉘어 해당 뼈에 붙어 있는지 확인해 주세요.
          </p>
          <div class="row">
            <button class="plain" :class="{ on: preview.playTest }" @click="preview.playTest = !preview.playTest; preview.poseEdit = null">
              {{ preview.playTest ? '연주 미리보기 멈추기' : '연주 미리보기' }}
            </button>
            <button v-if="preview.poseEdit" class="plain" @click="resetPose(preview.poseEdit)">이 동작 초기화</button>
          </div>
          <RangeField
            v-model="model.body.playSpeed" label="연주 속도" left="느리게" right="빠르게" :min="0.1" :max="4" :step="0.1" :def="0.6" :format="v => v.toFixed(1) + '회/초'"
            desc="연주 중에 동작 1과 2를 1초에 몇 번 오갈지예요."
          />
        </li>
      </ol>
    </template>
  </section>
</template>

<style scoped>
.editing {
  margin: 0 0 10px;
  font-weight: 700;
  color: var(--main-dark);
}

.editing small {
  font-weight: 400;
  color: var(--muted);
}

.switch {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 700;
}

.switch.big {
  font-size: 1.05rem;
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
  background: #f59e0b;
}

.switch input:checked + .knob::after {
  left: 19px;
}

.steps {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.steps > li {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 12px;
}

.step-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.num {
  display: inline-grid;
  place-items: center;
  width: 1.5em;
  height: 1.5em;
  border-radius: 50%;
  background: #f59e0b;
  color: white;
  font-size: 0.8rem;
  font-weight: 700;
}

.check {
  font-size: 0.85rem;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.row {
  margin-top: 8px;
}

.warn {
  font-size: 0.8rem;
  color: #b45309;
  background: #fef3c7;
  border-radius: 8px;
  padding: 6px 8px;
  margin: 8px 0 0;
}

.mini {
  font-size: 0.85rem;
  font-weight: 700;
  margin-right: 6px;
}

.opt {
  color: var(--muted);
  font-weight: 400;
}

.pose-seg {
  margin-top: 8px;
  flex-wrap: wrap;
}

.plain.on {
  border-color: #f59e0b;
  color: #b45309;
}

.parts {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.parts li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
}

.thumb {
  width: 28px;
  height: 28px;
  object-fit: contain;
  border-radius: 6px;
  background: repeating-conic-gradient(#f4f6f8 0% 25%, #fff 0% 50%) 50% / 8px 8px;
}

.pname {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pbone {
  color: #b45309;
  background: #fef3c7;
  border-radius: 6px;
  padding: 0 6px;
  font-size: 0.75rem;
}
</style>
