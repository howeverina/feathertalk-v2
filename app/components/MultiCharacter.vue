<script setup lang="ts">
// 멀티 무대 위 캐릭터 하나. 웹캠·마우스 없이 자동 모션으로 움직이고, 감지되면 말한다.
import { resolveSrc, type Model } from '~/lib/model'
import { createRenderer, type Renderer } from '~/lib/renderer'
import { Arms, Blinker, HairSystem, Head, PosePlayer, Mouth, Wander, breath, headTarget, mouthState, pupilPop } from '~/lib/physics'

const props = defineProps<{
  model: Model
  talking: boolean
  motion: boolean // 자동 모션 (끄면 정면을 보고 가만히, 깜빡임·호흡·입은 그대로)
  paused?: boolean // 안 보일 때(다른 탭) 그리기를 쉰다
}>()

const canvas = ref<HTMLCanvasElement>()
let renderer: Renderer | null = null
let raf = 0

onMounted(() => {
  renderer = createRenderer(canvas.value!, { layout: 'fill', maxTexture: 2048 })
  if (!renderer) return
  // '캐릭터 만들기' 탭에서 레이어나 이미지를 바꾸면 바로 반영
  watch(() => props.model, m => renderer?.setLayers(toRaw(m).layers, resolveSrc), { immediate: true, deep: true })

  const head = new Head()
  const hair = new HairSystem()
  const blinker = new Blinker()
  const mouth = new Mouth()
  const arms = new Arms()
  const wander = new Wander()
  const posePlayer = new PosePlayer()
  // 캐릭터마다 박자가 겹치지 않도록 시작 시간을 어긋나게
  const offset = Math.random() * 5000
  let last = performance.now()

  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    if (props.paused) {
      last = now // 다시 그릴 때 시간이 튀지 않게
      return
    }
    const dt = (now - last) / 1000
    last = now
    const m = toRaw(props.model) // 매 프레임 읽으니 반응형 감시 없이
    const t = props.motion ? wander.update(now + offset, 0.5) : { x: 0, y: 0 }
    head.update(dt, headTarget(t.x, t.y, m.rig, 60), m.rig.bounce)
    const h = head.state
    const b = breath((now + offset) / 1000, m.rig.breath, m.center)
    renderer!.render({
      aspect: m.aspect, body: m.body, arms: arms.update(dt, h.roll * 0.35, now / 1000), hairToContent: true,
      // 연주 포즈: 감지되면(연주 중) 동작 1·2를 오간다
      ...posePlayer.update(dt, props.talking, m.body.poses, m.body.playSpeed, (now + offset) / 1000),
      center: m.center,
      head: h,
      squash: head.squash,
      breath: b,
      expression: 0,
      eyesClosed: false,
      blink: blinker.update(now),
      pop: pupilPop(blinker, now),
      eyes: m.eyes,
      ...mouthState(mouth, dt, props.talking && now % 400 >= 200, m.mouth.animate),
      hair: hair.update(dt, m.layers, h, now / 1000, b.hairLag, true),
    })
  }
  raf = requestAnimationFrame(frame)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  renderer?.destroy()
})
</script>

<template>
  <canvas ref="canvas" class="char-canvas" />
</template>

<style scoped>
.char-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
