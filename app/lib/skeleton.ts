// 몸 리깅 뼈대: 관절 위치로 뼈를 만들고, 그림의 각 점이 어느 뼈를 따라갈지 자동으로 정한다.
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

// 뼈마다 선분과 굵기. 굵기 안쪽은 그 뼈에 딱 붙는다 (몸통 가장자리가 팔에 붙지 않도록).
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

// 격자 점마다 (뼈1, 뼈2, 뼈1 비중). 가장 가까운 뼈 두 개를 거리에 따라 섞는다.
export function skinWeights(grid: number, rig: BodyRig, aspect: number, headR: number): Float32Array {
  const list = bones(pts(rig.joints, aspect), rig.radius, headR)
  const out = new Float32Array((grid + 1) * (grid + 1) * 3)
  let o = 0
  for (let jy = 0; jy <= grid; jy++) {
    for (let ix = 0; ix <= grid; ix++) {
      const p = { x: ix / grid, y: (jy / grid) * aspect }
      let b0 = 0, d0 = Infinity, b1 = 0, d1 = Infinity
      for (const [id, a, b, r] of list) {
        const d = Math.max(0, distToSegment(p, a, b) - r)
        if (d < d0) {
          b1 = b0; d1 = d0
          b0 = id; d0 = d
        } else if (d < d1) {
          b1 = id; d1 = d
        }
      }
      const f0 = 1 / (d0 + 0.01) ** 3, f1 = 1 / (d1 + 0.01) ** 3
      out[o++] = b0
      out[o++] = b1
      out[o++] = f0 / (f0 + f1)
    }
  }
  return out
}

export interface ArmAngles { upperL: number; foreL: number; upperR: number; foreR: number }

export interface PoseInput {
  head: HeadState
  squash?: [number, number]
  stretch?: number // 호흡: 몸 세로 늘어남
  arms?: ArmAngles
}

// 기울기를 관절마다 나눠 받는 비율: 하체(발끝), 상체(허리), 머리(목)
export const ROLL_SHARE = { lower: 0.1, upper: 0.35, head: 0.55 }

// 뼈마다 쉴 때 → 지금 자세로 옮기는 변환 (부모에서 자식 순서로 쌓는다)
export function poseBones(rig: BodyRig, aspect: number, input: PoseInput): Aff[] {
  const j = pts(rig.joints, aspect)
  const h = input.head, arms = input.arms
  const feet = mid(j.ankleL, j.ankleR)
  const [sx, sy] = input.squash || [1, 1]
  const out: Aff[] = new Array(BONE_COUNT).fill(ID)

  const root = mul(rotAbout(feet, h.roll * ROLL_SHARE.lower), scaleAbout(feet, sx, sy * (1 + (input.stretch || 0))))
  out[BONE.root] = root
  out[BONE.pelvis] = root
  out[BONE.thighL] = out[BONE.shinL] = root
  out[BONE.thighR] = out[BONE.shinR] = root
  const spine = mul(root, rotAbout(j.waist, h.roll * ROLL_SHARE.upper))
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
