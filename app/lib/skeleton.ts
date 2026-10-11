// 몸 리깅 뼈대: 관절 위치로 뼈를 만들고, 파츠(레이어)마다 어느 뼈를 따라갈지 자동으로 정한다.
// 좌표는 모두 '그림 가로 = 1' 단위 (세로는 0 ~ aspect).
import type { BodyRig, JointName, Joints } from './model'
import type { HeadState } from './physics'

type P = { x: number; y: number }

// 뼈 번호 (셰이더의 uBone 배열 순서)
export const BONE = {
  root: 0, pelvis: 1, thighL: 2, shinL: 3, thighR: 4, shinR: 5,
  spine: 6, upperArmL: 7, foreArmL: 8, upperArmR: 9, foreArmR: 10, head: 11,
} as const
export const BONE_COUNT = 12
export const UPPER_FIRST = BONE.spine // 이 번호부터는 상체 (원기둥 회전을 상체 비율로)

// 2D 아핀 변환: x' = a x + c y + tx, y' = b x + d y + ty
export type Aff = [number, number, number, number, number, number]
const ID: Aff = [1, 0, 0, 1, 0, 0]

function mul(p: Aff, q: Aff): Aff {
  return [
    p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1],
    p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3],
    p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5],
  ]
}

function rotAbout(o: P, a: number): Aff {
  const c = Math.cos(a), s = Math.sin(a)
  return [c, s, -s, c, o.x - c * o.x + s * o.y, o.y - s * o.x - c * o.y]
}

function scaleAbout(o: P, sx: number, sy: number): Aff {
  return [sx, 0, 0, sy, o.x - sx * o.x, o.y - sy * o.y]
}

// 관절을 '가로 = 1' 단위로
function pts(j: Joints, aspect: number): Record<JointName, P> {
  const out = {} as Record<JointName, P>
  for (const k in j) out[k as JointName] = { x: j[k as JointName].x, y: j[k as JointName].y * aspect }
  return out
}

const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

function distToSegment(p: P, a: P, b: P) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy || 1e-9
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t)
}

// 뼈마다 선분과 굵기 (파츠 중심이 굵기 안쪽이면 그 뼈로)
function bones(j: Record<JointName, P>, radius: number, headR: number) {
  const hip = mid(j.hipL, j.hipR)
  const headTop = { x: j.neck.x, y: j.neck.y - headR * 2.2 }
  return [
    [BONE.pelvis, j.waist, hip, radius * 0.8],
    [BONE.thighL, j.hipL, j.kneeL, 0.04], [BONE.shinL, j.kneeL, j.ankleL, 0.035],
    [BONE.thighR, j.hipR, j.kneeR, 0.04], [BONE.shinR, j.kneeR, j.ankleR, 0.035],
    [BONE.spine, j.waist, j.neck, radius * 0.8],
    [BONE.upperArmL, j.shoulderL, j.elbowL, 0.03], [BONE.foreArmL, j.elbowL, j.wristL, 0.025],
    [BONE.upperArmR, j.shoulderR, j.elbowR, 0.03], [BONE.foreArmR, j.elbowR, j.wristR, 0.025],
    [BONE.head, j.neck, headTop, headR],
  ] as const
}

// 파츠(레이어) 하나를 통째로 붙일 뼈. 그림이 있는 점들(가로 = 1 단위)이 저마다 가장 가까운 뼈에 투표하고,
// 가장 많이 받은 뼈로 정한다. 단, 양쪽 다리(또는 양팔)에 걸친 파츠는 — 스커트처럼 — 공통 부모 뼈로.
const SIDES = [
  { left: [BONE.thighL, BONE.shinL], right: [BONE.thighR, BONE.shinR], parent: BONE.pelvis },
  { left: [BONE.upperArmL, BONE.foreArmL], right: [BONE.upperArmR, BONE.foreArmR], parent: BONE.spine },
]

export function boneForPart(points: P[], rig: BodyRig, aspect: number, headR: number): number {
  if (!points.length) return BONE.spine
  const list = bones(pts(rig.joints, aspect), rig.radius, headR)
  const votes = new Array(BONE_COUNT).fill(0)
  for (const p of points) {
    let best = 0, bestD = Infinity
    for (const [id, a, b, r] of list) {
      const d = Math.max(0, distToSegment(p, a, b) - r)
      if (d < bestD) {
        bestD = d
        best = id
      }
    }
    votes[best]++
  }
  const share = (ids: readonly number[]) => ids.reduce((s, i) => s + votes[i], 0) / points.length
  for (const s of SIDES) {
    if (share(s.left) >= 0.2 && share(s.right) >= 0.2) return s.parent
  }
  return votes.indexOf(Math.max(...votes))
}

// 레이어 목록에 보여줄 뼈 이름 (L/R은 화면 기준)
export const BONE_NAMES: Record<number, string> = {
  [BONE.pelvis]: '몸 아래쪽', [BONE.spine]: '몸 위쪽', [BONE.head]: '머리',
  [BONE.thighL]: '왼다리 위쪽', [BONE.shinL]: '왼다리 아래쪽', [BONE.thighR]: '오른다리 위쪽', [BONE.shinR]: '오른다리 아래쪽',
  [BONE.upperArmL]: '왼팔 위쪽', [BONE.foreArmL]: '왼팔 아래쪽', [BONE.upperArmR]: '오른팔 위쪽', [BONE.foreArmR]: '오른팔 아래쪽',
}

export interface ArmAngles { upperL: number; foreL: number; upperR: number; foreR: number }

export interface PoseInput {
  head: HeadState
  squash?: [number, number]
  stretch?: number // 호흡: 몸 세로 늘어남
  arms?: ArmAngles
}

// 기울기를 관절마다 나눠 받는 비율: 골반, 상체(허리), 머리(목)
export const ROLL_SHARE = { lower: 0.1, upper: 0.35, head: 0.55 }

const apply = (t: Aff, p: P): P => ({ x: t[0] * p.x + t[2] * p.y + t[4], y: t[1] * p.x + t[3] * p.y + t[5] })
const translate = (x: number, y: number): Aff => [1, 0, 0, 1, x, y]

// 쉴 때 선분(a→b)을 지금 선분(a2→b2)으로 옮기는 변환. 뼈 방향으로만 늘고 줄어든다
// (무릎이 카메라 쪽으로 굽으면 다리가 짧아 보이는 것처럼).
function segmentMap(a: P, b: P, a2: P, b2: P): Aff {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6
  const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L
  const L2 = Math.hypot(b2.x - a2.x, b2.y - a2.y) || 1e-6
  const vx = (b2.x - a2.x) / L2, vy = (b2.y - a2.y) / L2
  const k = L2 / L
  // M = k·v·uᵀ + n2·nᵀ  (n, n2는 각각 u, v에 수직)
  const m00 = k * vx * ux + vy * uy, m01 = k * vx * uy - vy * ux
  const m10 = k * vy * ux - vx * uy, m11 = k * vy * uy + vx * ux
  return [m00, m10, m01, m11, a2.x - (m00 * a.x + m01 * a.y), a2.y - (m10 * a.x + m11 * a.y)]
}

// 다리: 발목은 바닥에 그대로 두고, 엉덩이가 내려앉은 만큼 무릎이 굽는다.
// 쉴 때 무릎이 다리 선에서 벗어나 있던 만큼은 유지하고, 굽을수록 안쪽(다른 다리 쪽)으로 살짝 모인다.
function leg(hip: P, knee: P, ankle: P, hip2: P, inward: number): [Aff, Aff] {
  const v = { x: ankle.x - hip.x, y: ankle.y - hip.y }, D0 = Math.hypot(v.x, v.y) || 1e-6
  const u = { x: v.x / D0, y: v.y / D0 }, n = { x: -u.y, y: u.x }
  const tk = ((knee.x - hip.x) * u.x + (knee.y - hip.y) * u.y) / D0
  const ek = (knee.x - hip.x) * n.x + (knee.y - hip.y) * n.y

  const v2 = { x: ankle.x - hip2.x, y: ankle.y - hip2.y }, D = Math.hypot(v2.x, v2.y) || 1e-6
  const u2 = { x: v2.x / D, y: v2.y / D }, n2 = { x: -u2.y, y: u2.x }
  const bend = Math.max(0, Math.min(0.5, (D0 - D) / D0))
  const L1 = Math.hypot(knee.x - hip.x, knee.y - hip.y)
  const side = Math.sign(n2.x * inward) || 1
  const off = ek + side * bend * L1 * 1.2
  const knee2 = { x: hip2.x + u2.x * tk * D + n2.x * off, y: hip2.y + u2.y * tk * D + n2.y * off }
  return [segmentMap(hip, knee, hip2, knee2), segmentMap(knee, ankle, knee2, ankle)]
}

// 뼈마다 쉴 때 → 지금 자세로 옮기는 변환 (부모에서 자식 순서로 쌓는다)
export function poseBones(rig: BodyRig, aspect: number, input: PoseInput): Aff[] {
  const j = pts(rig.joints, aspect)
  const h = input.head, arms = input.arms
  const [sx, sy] = input.squash || [1, 1]
  const out: Aff[] = new Array(BONE_COUNT).fill(ID)
  const f = rig.follow / 100, sway = (rig.sway ?? 50) / 50
  const hipC = mid(j.hipL, j.hipR)

  // 골반: 고개를 돌리거나 기울인 반대쪽으로 살짝 밀리고, 그만큼(+ 고개를 숙이면 조금 더) 내려앉는다
  const dx = -(h.yaw * 0.5 + h.roll * 0.8) * f * 0.25 * sway
  const dy = Math.abs(dx) * 1.5 + Math.max(0, h.pitch) * f * 0.06 * sway
  const pelvis = mul(translate(dx, dy), rotAbout(hipC, h.roll * ROLL_SHARE.lower))
  out[BONE.root] = pelvis
  out[BONE.pelvis] = pelvis
  ;[out[BONE.thighL], out[BONE.shinL]] = leg(j.hipL, j.kneeL, j.ankleL, apply(pelvis, j.hipL), hipC.x - j.hipL.x || 1)
  ;[out[BONE.thighR], out[BONE.shinR]] = leg(j.hipR, j.kneeR, j.ankleR, apply(pelvis, j.hipR), hipC.x - j.hipR.x || -1)

  // 상체: 골반을 따라가고, 허리 기준으로 기울고, 숨 쉴 때 가슴이 부푼다
  const spine = mul(pelvis, mul(rotAbout(j.waist, h.roll * ROLL_SHARE.upper), scaleAbout(j.waist, sx, sy * (1 + (input.stretch || 0)))))
  out[BONE.spine] = spine
  out[BONE.upperArmL] = mul(spine, rotAbout(j.shoulderL, arms?.upperL || 0))
  out[BONE.foreArmL] = mul(out[BONE.upperArmL], rotAbout(j.elbowL, arms?.foreL || 0))
  out[BONE.upperArmR] = mul(spine, rotAbout(j.shoulderR, arms?.upperR || 0))
  out[BONE.foreArmR] = mul(out[BONE.upperArmR], rotAbout(j.elbowR, arms?.foreR || 0))
  out[BONE.head] = mul(spine, rotAbout(j.neck, h.roll * ROLL_SHARE.head))
  return out
}

// 편집기에서 뼈대를 그릴 때 쓰는 선 (관절 이름 쌍)
export const BONE_LINES: [JointName, JointName][] = [
  ['neck', 'waist'],
  ['neck', 'shoulderL'], ['shoulderL', 'elbowL'], ['elbowL', 'wristL'],
  ['neck', 'shoulderR'], ['shoulderR', 'elbowR'], ['elbowR', 'wristR'],
  ['waist', 'hipL'], ['hipL', 'kneeL'], ['kneeL', 'ankleL'],
  ['waist', 'hipR'], ['hipR', 'kneeR'], ['kneeR', 'ankleR'],
]

// 좌우 짝 관절 (대칭 이동용)
export function mirrorOf(name: JointName): JointName | null {
  if (name.endsWith('L')) return (name.slice(0, -1) + 'R') as JointName
  if (name.endsWith('R')) return (name.slice(0, -1) + 'L') as JointName
  return null
}
