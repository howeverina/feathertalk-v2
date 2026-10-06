<script setup lang="ts">
const { model } = useEditor()
const percent = (v: number) => Math.round(v * 100) + '%'
const strength = (v: number) => v + '%'
</script>

<template>
  <section class="panel">
    <h3>전체 설정</h3>
    <RangeField v-model="model.center.x" label="얼굴 중심 (가로)" left="왼쪽" right="오른쪽" :min="0" :max="1" :step="0.005" :def="0.5" :format="percent" />
    <RangeField
      v-model="model.center.y" label="얼굴 중심 (세로)" left="위" right="아래" :min="0" :max="1" :step="0.005" :def="0.4" :format="percent"
      desc="위아래로 고개를 끄덕일 때 기준이 되는 높이예요. 코 근처에 두면 자연스러워요."
    />
    <RangeField
      v-model="model.center.r" label="얼굴 크기" left="작게" right="크게" :min="0.05" :max="0.6" :step="0.005" :def="0.25" :format="percent"
      desc="볼록/오목이 적용되는 범위예요. 점선 원이 얼굴을 감싸도록 맞춰 주세요."
    />
    <label class="check-row">
      <input v-model="model.mouth.animate" type="checkbox">
      <b>입이 열리고 닫힐 때 움직임</b>
    </label>
    <p class="desc">
      켜면 입이 열릴 때 벌린 입이 작은 크기에서 쑥 커지고, 닫힐 때 작아졌다가 다문 입으로 바뀌어요.
      벌린 입 그림의 위치는 자동으로 찾아서 입의 가운데를 축으로 움직여요. 끄면 그림만 바로 바뀌어요.
      미리보기의 '말해 보기'로 확인할 수 있어요.
    </p>
    <label class="check-row">
      <input v-model="model.eyes.squash" type="checkbox">
      <b>깜빡일 때 눈이 눌리며 감기는 효과</b>
    </label>
    <p class="desc">
      끄면 뜬 눈 → 감은 눈 그림이 바로 바뀌어요. 켜면 뜬 눈을 '눈 영역' 띠 안쪽만 눌러 감기는 과정을 보여 줘요.
      코·볼터치가 눈과 같은 그림에 있으면 띠에 걸리지 않게 맞춰 주세요.
    </p>
    <template v-if="model.eyes.squash">
      <RangeField
        v-model="model.eyes.y" label="눈 높이" left="위" right="아래" :min="0" :max="1" :step="0.005" :def="0.4" :format="percent"
        desc="이 높이의 띠 안쪽만 눌려요. 눈 레이어를 고르면 미리보기에 초록 띠로 보이고, 끌어서 옮길 수 있어요."
      />
      <RangeField v-model="model.eyes.h" label="눈 영역 크기" left="좁게" right="넓게" :min="0.01" :max="0.2" :step="0.005" :def="0.05" :format="percent" />
    </template>
    <RangeField v-model="model.rig.yaw" label="좌우 회전 강도" left="0" right="200" :min="0" :max="200" :def="100" :format="strength" />
    <RangeField v-model="model.rig.pitch" label="상하 회전 강도" left="0" right="200" :min="0" :max="200" :def="100" :format="strength" />
    <RangeField v-model="model.rig.roll" label="기울기 강도" left="0" right="200" :min="0" :max="200" :def="100" :format="strength" />
    <RangeField
      v-model="model.rig.bounce" label="움직임 탄력 (뽀용함)" left="차분" right="통통" :min="0" :max="100" :def="50"
      desc="고개가 멈출 때 살짝 지나쳤다 돌아오는 반동과, 빠르게 움직일 때 늘어나고 납작해지는 정도예요. 머리카락 흔들림과는 따로예요."
    />
    <RangeField
      v-model="model.rig.breath" label="호흡" left="없음" right="크게" :min="0" :max="100" :def="50"
      desc="4초 주기로 몸이 살짝 부풀고 머리가 오르내려요. 머리카락 물리를 켠 레이어는 호흡을 따라 살짝 출렁여요."
    />
    <p class="tip">슬라이더를 더블클릭하면 기본값으로 돌아가요. 모든 설정은 이 브라우저에 자동 저장돼요.</p>
  </section>
</template>

<style scoped>
.check-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  cursor: pointer;
}
</style>
