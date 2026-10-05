<script setup lang="ts">
defineEmits<{ close: [] }>()
</script>

<template>
  <section class="panel guide">
    <button class="close" title="닫기" @click="$emit('close')">×</button>
    <h3>처음 오셨나요? 세 단계면 충분해요</h3>
    <ol class="steps">
      <li>
        <b>레이어 넣기</b>
        <span>
          오른쪽 <em>+ 레이어 추가</em>로 부위를 고르고, 이미지 주소를 붙여넣거나 파일을 끌어다 놓으세요.
          모든 이미지는 같은 크기의 정사각형 PNG(투명 배경)로, 캐릭터 전체 그림에서 해당 부위만 남긴 형태여야 해요.
        </span>
      </li>
      <li>
        <b>얼굴 중심 맞추기</b>
        <span>
          미리보기의 <em>+ 십자 표시</em>를 끌어 얼굴 한가운데(코 근처)에 두고, 점선 원을 끌어 얼굴 크기에 맞추세요.
          고개를 위아래·좌우로 돌릴 때 이 점이 기준이 돼요.
        </span>
      </li>
      <li>
        <b>입체감과 머리카락</b>
        <span>
          레이어를 골라 <em>깊이</em>와 <em>볼록/오목</em>을 조절하고, 머리카락 레이어는 <em>머리카락 물리</em>를 켜 주세요.
          미리보기 위에서 마우스를 움직이면 바로 확인할 수 있어요.
        </span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.guide {
  border: 2px solid var(--main);
}

.close {
  position: absolute;
  top: 6px;
  right: 10px;
  border: 0;
  background: none;
  font-size: 1.4rem;
  color: var(--muted);
  cursor: pointer;
}

.steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
  counter-reset: step;
}

.steps li {
  counter-increment: step;
  background: #f5fbff;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 0.85rem;
}

.steps b {
  display: block;
  margin-bottom: 4px;
}

.steps b::before {
  content: counter(step);
  display: inline-grid;
  place-items: center;
  width: 1.5em;
  height: 1.5em;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--main);
  color: white;
}

.steps em {
  font-style: normal;
  font-weight: 700;
  color: var(--main-dark);
}

@media (max-width: 860px) {
  .steps {
    grid-template-columns: 1fr;
  }
}
</style>
