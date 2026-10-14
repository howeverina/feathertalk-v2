<script setup lang="ts">
// 베타: 몸 리깅 설정 (단계별)
import { defaultJoints } from '~/lib/model'

const { model, preview } = useEditor()
const percent = (v: number) => Math.round(v * 100) + '%'
const strength = (v: number) => v + '%'

function resetJoints() {
  if (confirm('관절 위치를 기본값으로 되돌릴까요?')) model.value.body.joints = defaultJoints()
}

// 몸 레이어마다 자동으로 붙은 뼈
const bodyLayers = computed(() => model.value.layers.filter(l => l.part == 'body'))
</script>

<template>
  <section class="panel">
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
      </ol>
    </template>
  </section>
</template>

<style scoped>
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
