// 머리 움직임과 머리카락 흔들림 시뮬레이션
import type { HairParams, Layer, Model } from './model'

const STEP = 1 / 120 // 고정 timestep: 프레임레이트와 상관없이 같은 움직임

interface Spring { x: number; v: number }

export interface HeadState { yaw: number; pitch: number; roll: number }
export interface HairOutput { offset: [number, number]; angle: number }

// 스프링-댐퍼 하나 (목표값을 따라가며 출렁임)
function spring(s: Spring, target: number, k: number, c: number, dt: number) {
  const a = k * (target - s.x) - c * s.v
  s.v += a * dt
  s.x += s.v * dt
}

// 마우스/자동 모션 목표를 부드럽게 따라가는 머리
export class Head {
  yaw: Spring = { x: 0, v: 0 }
  pitch: Spring = { x: 0, v: 0 }
  roll: Spring = { x: 0, v: 0 }
  acc = 0
  bounce = 50

  // bounce(탄력, 0~100): 0이면 반동 없이 차분하게, 높을수록 통통 튀고 많이 늘어난다. 50이 기본.
  update(dt: number, target: HeadState, bounce = 50) {
    this.bounce = bounce
    // ω≈8, 감쇠비 1.0(0) ~ 0.55(50) ~ 0.2(100)
    const zeta = bounce <= 50 ? 1 - bounce * 0.009 : 0.55 - (bounce - 50) * 0.007
    const c = 2 * zeta * 8
    this.acc += Math.min(dt, 0.1)
    while (this.acc >= STEP) {
      this.acc -= STEP
      spring(this.yaw, target.yaw, 64, c, STEP)
      spring(this.pitch, target.pitch, 64, c, STEP)
      spring(this.roll, target.roll, 64, c, STEP)
    }
  }

  get state(): HeadState {
    return { yaw: this.yaw.x, pitch: this.pitch.x, roll: this.roll.x }
  }

  // 빠르게 움직일 때 살짝 늘어나고 납작해지는 느낌 (탄력이 클수록 많이)
  get squash(): [number, number] {
    const k = this.bounce / 50
    const s = Math.min(Math.abs(this.yaw.v) * 0.02 * k, 0.03 * k)
    return [1 + s, 1 - s * 0.5]
  }
}

// 머리카락 레이어 하나. 뿌리(머리)를 끝부분이 스프링으로 뒤따라간다.
export class Hair {
  x: Spring = { x: 0, v: 0 }
  y: Spring = { x: 0, v: 0 }
  a: Spring = { x: 0, v: 0 }
  acc = 0
  phase = Math.random() * 10
  rootX = 0
  rootY = 0
  t = 0

  update(dt: number, params: HairParams, head: HeadState, t: number) {
    // 탄성 0~100 → k 20~220, 출렁임 0~100 → 감쇠비 1.0~0.06
    const k = 20 + params.stiffness * 2
    const zeta = Math.max(0.06, 1 - params.bounce * 0.014)
    const c = 2 * zeta * Math.sqrt(k)
    // 머리가 돌아가면 뿌리가 이만큼 움직인다
    const rootX = Math.sin(head.yaw) * 0.3
    const rootY = Math.sin(head.pitch) * 0.3
    this.acc += Math.min(dt, 0.1)
    while (this.acc >= STEP) {
      this.acc -= STEP
      spring(this.x, rootX, k, c, STEP)
      spring(this.y, rootY, k, c, STEP)
      // 중력: 머리가 기울어도 머리카락은 아래로 늘어지려 한다
      spring(this.a, -head.roll * 0.8, k, c, STEP)
    }
    this.rootX = rootX
    this.rootY = rootY
    this.t = t
  }

  // breathLag: 호흡보다 반 박자 늦은 값 (-2 ~ 2), 머리카락 끝이 호흡을 따라 살짝 출렁인다
  output(params: HairParams, breathLag = 0): HairOutput {
    const gain = params.sway / 50
    const wind = Math.sin(this.t * 1.7 + this.phase) * 0.004 + Math.sin(this.t * 0.9 + this.phase * 2) * 0.003
    const clamp = (v: number) => Math.max(-0.15, Math.min(0.15, v))
    return {
      offset: [
        clamp((this.x.x - this.rootX) * gain + wind * gain),
        clamp((this.y.x - this.rootY) * gain * 0.5 + breathLag * 0.016 * gain),
      ],
      angle: this.a.x * Math.min(gain, 1.5) + breathLag * 0.04 * gain,
    }
  }
}

// 모델의 모든 머리카락 레이어를 관리
export class HairSystem {
  sims = new Map<string, Hair>()
  out = new Map<string, HairOutput>()

  update(dt: number, layers: Layer[], head: HeadState, t: number, breathLag = 0) {
    const ids = new Set<string>()
    for (const l of layers) {
      if (!l.hair.enabled || l.part == 'body') continue
      ids.add(l.id)
      let sim = this.sims.get(l.id)
      if (!sim) {
        sim = new Hair()
        this.sims.set(l.id, sim)
      }
      sim.update(dt, l.hair, head, t)
      this.out.set(l.id, sim.output(l.hair, breathLag))
    }
    for (const id of [...this.sims.keys()]) {
      if (!ids.has(id)) {
        this.sims.delete(id)
        this.out.delete(id)
      }
    }
    return this.out
  }
}

export interface BreathState {
  bodyStretch: number // 몸 세로 늘어남 비율
  headBob: number // 머리 세로 이동 (이미지 기준)
  hairLag: number // 머리카락용, 호흡보다 반 박자 늦은 값
}

const BREATH_PERIOD = 4 // 초

// 호흡: strength 0~100 (50이 기본). 몸은 발끝 기준으로 살짝 늘어나고, 머리는 목 높이에 맞춰 같이 오르내린다.
export function breath(t: number, strength: number, center: Model['center']): BreathState {
  const s = strength / 50
  const phase = t * Math.PI * 2 / BREATH_PERIOD
  const e = Math.sin(phase) * 0.006 * s
  const neck = Math.min(1, center.y + center.r)
  return { bodyStretch: e, headBob: (neck - 1) * e, hairLag: Math.sin(phase - 0.9) * s }
}

interface Point { x: number; y: number }

// 자동 모션: 보이지 않는 마우스 커서가 랜덤 지점들 사이를 일정한 속도로 천천히 옮겨 다닌다
export class Wander {
  pos: Point = { x: 0, y: 0 }
  to: Point = { x: 0, y: 0 }
  last = -1

  // 지금 위치(보통 마지막 마우스 위치)에서 이어서 시작
  reset(pos: Point) {
    this.pos = { ...pos }
    this.to = { ...pos }
    this.last = -1
  }

  // range: 둘러보는 범위 (0~1, 1이면 화면 끝까지), speed: 1초에 움직이는 거리 (화면 가로 전체가 2)
  update(now: number, range = 0.7, speed = range * 0.95): Point {
    const dt = this.last < 0 ? 0 : Math.min((now - this.last) / 1000, 0.1)
    this.last = now
    let dx = this.to.x - this.pos.x, dy = this.to.y - this.pos.y
    let dist = Math.hypot(dx, dy)
    if (dist < 1e-3) {
      // 다음 목적지: 너무 가까우면 다시 고른다
      do {
        // 원 안에서 고르게
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * range
        this.to = { x: Math.cos(a) * r, y: Math.sin(a) * r }
      } while (Math.hypot(this.to.x - this.pos.x, this.to.y - this.pos.y) < range * 0.4)
      dx = this.to.x - this.pos.x
      dy = this.to.y - this.pos.y
      dist = Math.hypot(dx, dy)
    }
    const step = Math.min(dist, speed * dt)
    this.pos = { x: this.pos.x + dx / dist * step, y: this.pos.y + dy / dist * step }
    return this.pos
  }
}

// nx, ny: -1 ~ 1 (화면 가운데가 0), strength: 0~200 (100이 기본)
// 얼굴 중심을 둘러싼 원이 움직임의 한계. 구석(대각선)에서 과하게 돌지 않고, 원 가장자리에선 부드럽게 멈춘다.
export function limitToCircle(nx: number, ny: number): Point {
  const l = Math.hypot(nx, ny)
  if (l <= 0.8) return { x: nx, y: ny }
  const k = (0.8 + 0.2 * Math.tanh((l - 0.8) / 0.2)) / l
  return { x: nx * k, y: ny * k }
}

// 화면 좌표를 얼굴 중심 기준 -1 ~ 1로 (face: 얼굴 중심의 화면 위치, S: 캐릭터 정사각형 한 변)
export function lookAt(px: number, py: number, fx: number, fy: number, S: number): Point {
  const R = S * 0.6 // 얼굴 중심에서 이만큼 떨어지면 최대로 돌아간다
  return { x: (px - fx) / R, y: (py - fy) / R }
}

// rollN: 기울기 (-1 ~ 1). 생략하면 좌우 위치를 따라 기운다 (마우스/자동 모션), 웹캠은 실제 기울기를 넘긴다.
export function headTarget(nx: number, ny: number, rig: Model['rig'], strength = 100, rollN?: number): HeadState {
  const s = strength / 100
  ;({ x: nx, y: ny } = limitToCircle(nx, ny))
  const r = rollN === undefined ? nx : Math.max(-1, Math.min(1, rollN))
  return {
    yaw: nx * 0.35 * rig.yaw / 100 * s,
    pitch: ny * 0.25 * rig.pitch / 100 * s,
    roll: r * 0.13 * rig.roll / 100 * s,
  }
}

// 웹캠 각도(rad)를 headTarget 입력(-1 ~ 1)으로. 고개를 이만큼 돌리면 최대로 움직인다.
export function cameraToTarget(pose: { yaw: number; pitch: number; roll: number }) {
  return {
    x: pose.yaw / 0.5, // 약 30°
    y: pose.pitch / 0.35, // 약 20°
    roll: pose.roll / 0.35, // 약 20°
  }
}
