// 웹캠으로 얼굴 각도(좌우·상하·기울기)만 추적한다. MediaPipe FaceLandmarker 사용.
// 라이브러리와 모델은 웹캠을 켰을 때만 불러오고, 영상은 화면에 띄우거나 어디로 보내지 않는다.
import type { FaceLandmarker } from '@mediapipe/tasks-vision'

// package.json의 @mediapipe/tasks-vision 버전과 맞춘다 (wasm 파일을 같은 버전으로 받아야 함)
const VERSION = '1.0.1'
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

const DETECT_INTERVAL = 66 // ms, 1초에 15번 정도면 충분 (나머지는 머리 스프링이 부드럽게 채운다)
const LOST_AFTER = 1000 // ms, 이만큼 얼굴이 안 보이면 놓친 것으로
const SMOOTH = 0.5 // 떨림 줄이기 (0~1, 클수록 새 값을 많이 반영)

export interface FacePose { yaw: number; pitch: number; roll: number } // rad

// 얼굴 점(478개) 중 눈꺼풀과 눈꼬리 번호
const EYES = [
  { top: 159, bottom: 145, outer: 33, inner: 133 },
  { top: 386, bottom: 374, outer: 263, inner: 362 },
]

type Point3 = { x: number; y: number; z: number }

// 두 눈의 (눈꺼풀 사이 거리 ÷ 눈 너비) 평균. 고개를 돌려도 덜 변하도록 깊이(z)까지 넣은 3D 거리로 잰다.
// w, h: 영상 크기 (좌표가 가로/세로 따로 0~1로 정규화돼 있어서 비율을 맞춘다)
function eyeOpenness(lm: Point3[], w: number, h: number): number {
  const d = (a: Point3, b: Point3) => Math.hypot((a.x - b.x) * w, (a.y - b.y) * h, (a.z - b.z) * w)
  let sum = 0
  for (const e of EYES) sum += d(lm[e.top]!, lm[e.bottom]!) / Math.max(1e-6, d(lm[e.outer]!, lm[e.inner]!))
  return sum / EYES.length
}

const EYE_RECENT = 8 // 정면 맞추기 때 평균 낼 최근 기록 (약 0.5초)
export type WebcamStatus = 'off' | 'loading' | 'tracking' | 'searching' | 'error'

// 얼굴 변환 행렬(열 우선 4x4, 카메라 기준 x 오른쪽 / y 위 / z 카메라 쪽)에서 각도를 뽑는다.
// 반환값은 카메라 영상 기준: yaw +는 얼굴이 영상 오른쪽을 봄, pitch +는 아래를 봄, roll +는 정수리가 영상 오른쪽으로 기움.
function poseFromMatrix(d: number[]): FacePose {
  const r = (row: number, col: number) => d[col * 4 + row]!
  return {
    yaw: Math.atan2(r(0, 2), r(2, 2)),
    pitch: -Math.asin(Math.max(-1, Math.min(1, r(1, 2)))),
    roll: Math.atan2(r(0, 1), r(1, 1)),
  }
}

export class WebcamTracker {
  status: WebcamStatus = 'off'
  error = ''
  zero: FacePose = { yaw: 0, pitch: 0, roll: 0 } // '정면 맞추기'로 잡은 기준 자세
  onStatus?: (status: WebcamStatus) => void

  private video: HTMLVideoElement | null = null
  private stream: MediaStream | null = null
  private landmarker: FaceLandmarker | null = null
  private timer: ReturnType<typeof setInterval> | undefined
  private raw: FacePose | null = null
  private eyeRecent: number[] = [] // 최근 눈 뜬 정도 (정면 맞추기 때 기준으로 쓴다)
  eyeBase = 0 // 평소 뜬 눈 기준. '정면 맞추기'로 정하고, 0이면 아직 안 맞춘 것
  closed = false // 확실히 감고 있는 상태일 때만 true
  private closedCount = 0
  private lastSeen = -Infinity
  private running = false

  private setStatus(s: WebcamStatus) {
    if (this.status == s) return
    this.status = s
    this.onStatus?.(s)
  }

  async start() {
    if (this.running) return
    this.running = true
    this.error = ''
    this.setStatus('loading')
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, frameRate: { ideal: 15, max: 30 }, facingMode: 'user' },
        audio: false,
      })
      if (!this.running) return this.stop()

      // 화면에는 안 보이지만, 브라우저가 영상 재생을 멈추지 않도록 문서에 붙여 둔다
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0'
      video.srcObject = this.stream
      document.body.append(video)
      await video.play()
      this.video = video

      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL)
      const options = (delegate: 'GPU' | 'CPU') => ({
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO' as const,
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
        outputFaceBlendshapes: false,
      })
      try {
        this.landmarker = await FaceLandmarker.createFromOptions(fileset, options('GPU'))
      } catch (e) {
        this.landmarker = await FaceLandmarker.createFromOptions(fileset, options('CPU'))
      }
      if (!this.running) return this.stop()

      this.setStatus('searching')
      this.timer = setInterval(() => this.detect(), DETECT_INTERVAL)
    } catch (e: any) {
      console.error('웹캠 추적을 시작하지 못했어요', e)
      this.error = e?.name == 'NotAllowedError' ? '카메라 권한이 거부됐어요' : '카메라를 쓸 수 없어요'
      this.stop()
      this.setStatus('error')
    }
  }

  private detect() {
    const v = this.video, lm = this.landmarker
    if (!v || !lm || v.readyState < 2) return
    const now = performance.now()
    const result = lm.detectForVideo(v, now)
    const m = result.facialTransformationMatrixes?.[0]
    const points = result.faceLandmarks?.[0]
    if (m) {
      const p = poseFromMatrix(m.data)
      const prev = this.raw
      this.raw = prev
        ? {
            yaw: prev.yaw + (p.yaw - prev.yaw) * SMOOTH,
            pitch: prev.pitch + (p.pitch - prev.pitch) * SMOOTH,
            roll: prev.roll + (p.roll - prev.roll) * SMOOTH,
          }
        : p
      this.lastSeen = now
      this.setStatus('tracking')
      if (points) this.updateEyes(eyeOpenness(points, v.videoWidth || 320, v.videoHeight || 240))
    } else if (now - this.lastSeen > LOST_AFTER) {
      this.raw = null
      this.setStatus('searching')
    }
  }

  private updateEyes(o: number) {
    this.eyeRecent.push(o)
    if (this.eyeRecent.length > EYE_RECENT) this.eyeRecent.shift()
    // 기준은 '정면 맞추기'로만 정한다. 아직 안 맞췄으면 눈 인식은 쉰다.
    const base = this.eyeBase
    if (!base) {
      this.closed = false
      return
    }
    // 확실히 감았을 때만 감음: 기준의 55% 아래로 연속 2번 내려가면 감음, 70% 위로 올라오면 뜸.
    // 기준을 둘로 나눠서 애매한 값에 눈이 깜빡거리지 않게 한다.
    const ratio = o / base
    this.closedCount = ratio < 0.55 ? this.closedCount + 1 : 0
    if (this.closedCount >= 2) this.closed = true
    else if (ratio > 0.7) this.closed = false
  }

  // 눈을 감고 있는지. 얼굴을 놓쳤거나 아직 정면 맞추기를 안 했으면 null.
  eyesClosed(): boolean | null {
    return this.status == 'tracking' && this.raw && this.eyeBase ? this.closed : null
  }

  // 지금 자세를 정면으로, 지금 눈 뜬 정도를 평소 뜬 눈으로 (정면을 보고 눈을 뜬 채로 누른다)
  calibrate() {
    if (this.raw) this.zero = { ...this.raw }
    if (this.eyeRecent.length) {
      this.eyeBase = this.eyeRecent.reduce((a, b) => a + b, 0) / this.eyeRecent.length
      this.closed = false
      this.closedCount = 0
    }
  }

  // 캐릭터 기준 각도. mirror면 거울처럼 (내가 왼쪽을 보면 캐릭터는 화면 왼쪽을 본다).
  // 얼굴을 놓쳤으면 null.
  pose(mirror: boolean): FacePose | null {
    if (!this.raw || this.status != 'tracking') return null
    const s = mirror ? -1 : 1
    return {
      yaw: (this.raw.yaw - this.zero.yaw) * s,
      pitch: this.raw.pitch - this.zero.pitch,
      roll: (this.raw.roll - this.zero.roll) * s,
    }
  }

  stop() {
    this.running = false
    clearInterval(this.timer)
    this.landmarker?.close()
    this.landmarker = null
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = null
    this.video?.remove()
    this.video = null
    this.raw = null
    this.eyeRecent = []
    this.closed = false
    this.closedCount = 0
    if (this.status != 'error') this.setStatus('off')
  }
}
