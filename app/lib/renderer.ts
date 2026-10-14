// WebGL 렌더러: 레이어마다 격자(메시)를 휘어서 입체감/볼록·오목/머리카락 흔들림을 표현한다.
import { BLINK_SWAP, isVisible, type FaceState, type Layer, type Model } from './model'
import type { BreathState, HairOutput, HeadState } from './physics'
import { BONE, BONE_COUNT, UPPER_FIRST, boneForPart, pairSkin, poseBones, type ArmAngles } from './skeleton'

const GRID = 64 // 눈 깜빡임처럼 좁은 영역도 부드럽게 휘도록 촘촘하게

const VERT = `
attribute vec2 aPos;
attribute float aBone;   // 몸 리깅: 따라갈 뼈 번호 (보통 레이어 전체가 같은 값, 양팔/양다리 레이어는 점마다)
uniform vec2 uRes;
uniform vec3 uRect;      // 그림의 화면 위치 (x, y, 가로 길이), px
uniform float uAspect;   // 그림 세로 ÷ 가로. 아래 좌표는 모두 '가로 = 1' 단위 (세로는 0 ~ uAspect)
uniform vec3 uCenter;    // 얼굴 중심 x, y, 반지름
uniform vec3 uHead;      // yaw, pitch, roll (rad)
uniform vec2 uSquash;
uniform vec2 uBreath;    // 몸 늘어남, 머리 오르내림
uniform float uSeg;      // 0: 머리, 1: 몸
uniform float uRig;      // 몸 리깅을 켰으면 1
uniform vec2 uWaist;     // 허리 관절 (몸통 원기둥 중심선)
uniform float uBodyR;    // 몸통 원기둥 반지름
uniform vec3 uBodyAng;   // 상체 yaw, 상체 pitch, 하체 yaw
uniform vec4 uBoneM[${BONE_COUNT}]; // 뼈마다 회전·크기 (a, b, c, d)
uniform vec2 uBoneT[${BONE_COUNT}]; // 뼈마다 이동
uniform float uBoneZ[${BONE_COUNT}]; // 뼈마다 카메라 쪽으로 나온 정도 (양다리 레이어 안에서 앞뒤 정하기)
uniform float uDepth;
uniform float uCurve;
uniform float uHairOn;
uniform float uAnchorY;
uniform float uHairDir;  // 1: 고정선 아래가 흔들림, -1: 위가 흔들림
uniform float uHairEnd;  // 흔들림이 가장 커지는 끝 (아래로면 그림 아래 끝, 위로면 위 끝)
uniform vec2 uHairOffset;
uniform float uHairAngle;
uniform vec3 uEyeBand;   // 눈 영역 가운데 높이, 반높이, 눌림 정도(1이면 그대로)
uniform float uPop;      // 눈동자 통통: 눈 높이를 축으로 한 세로 배율 (1이면 그대로)
uniform vec4 uMouth;     // 입 벌림: 입 그림 가운데 x, y, 가로 배율, 세로 배율 (1이면 그대로)
varying vec2 vUv;

vec2 rot(vec2 v, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

vec2 bone(float i, vec2 p) {
  int k = int(i + 0.5);
  vec4 M = uBoneM[k];
  return vec2(M.x * p.x + M.z * p.y, M.y * p.x + M.w * p.y) + uBoneT[k];
}

void main() {
  vUv = aPos;
  float A = uAspect;
  vec2 m = vec2(aPos.x, aPos.y * A);

  // 깜빡임: 눈 영역 띠 안쪽만 세로로 누른다 (띠 밖의 코·볼터치는 그대로).
  // 위 눈꺼풀이 더 많이 내려오도록 띠 가운데보다 살짝 아래로 모은다.
  if (uEyeBand.z < 0.999) {
    float c = uEyeBand.x + uEyeBand.y * 0.3;
    float w = 1.0 - smoothstep(uEyeBand.y, uEyeBand.y * 1.5, abs(m.y - uEyeBand.x));
    m.y = c + (m.y - c) * mix(1.0, uEyeBand.z, w);
  }
  if (uPop != 1.0) m.y = uEyeBand.x + (m.y - uEyeBand.x) * uPop;
  // 입: 입 그림의 가운데를 축으로, 작게 벌릴수록 세로는 많이·가로는 조금 줄어든다
  if (uMouth.w != 1.0) m = uMouth.xy + (m - uMouth.xy) * uMouth.zw;

  // 머리카락/장식: 고정선에서 멀어질수록(아래 또는 위로) 크게 휘고 밀린다
  if (uHairOn > 0.5) {
    float t = uHairDir > 0.0
      ? (m.y - uAnchorY) / max(uHairEnd - uAnchorY, 0.001)
      : (uAnchorY - m.y) / max(uAnchorY - uHairEnd, 0.001);
    float w = pow(smoothstep(0.0, 1.0, t), 1.5);
    vec2 a = vec2(m.x, uAnchorY);
    m = a + rot(m - a, uHairAngle * w) + uHairOffset * w;
  }

  if (uSeg < 0.5) {
    // 머리: 얼굴 중심을 기준으로 한 구 모양 곡면 위에 있다고 보고 회전
    vec2 p = m - uCenter.xy;
    float r2 = clamp(dot(p, p) / (uCenter.z * uCenter.z), 0.0, 1.0);
    float z = uDepth + uCurve * (1.0 - r2);
    p.x = p.x * cos(uHead.x) + z * sin(uHead.x);
    p.y = p.y * cos(uHead.y) + z * sin(uHead.y);
    m = uCenter.xy + p;
  } else if (uRig > 0.5) {
    // 몸: 허리를 지나는 세로 원기둥 곡면 위에 있다고 보고, 얼굴 각도를 따라 조금 회전.
    // 상체 뼈에 붙은 파츠는 상체 비율로, 하체 뼈에 붙은 파츠는 하체 비율로 돈다.
    float upperW = aBone > ${UPPER_FIRST - 0.5} ? 1.0 : 0.0;
    float dx = m.x - uWaist.x;
    float r2 = clamp(dx * dx / (uBodyR * uBodyR), 0.0, 1.0);
    float z = uDepth + uCurve * (1.0 - r2);
    float yaw = mix(uBodyAng.z, uBodyAng.x, upperW);
    m.x = uWaist.x + dx * cos(yaw) + z * sin(yaw);
    float dy = m.y - uWaist.y;
    m.y = uWaist.y + dy * cos(uBodyAng.y * upperW) + z * sin(uBodyAng.y * upperW);
  }

  if (uRig > 0.5) {
    // 뼈대를 따라 움직인다 (기울기, 호흡, 팔 흔들림은 뼈 변환에 들어 있다)
    if (uSeg < 0.5) m = bone(${BONE.head}.0, m);
    else m = bone(aBone, m);
  } else {
    // 호흡: 몸은 발끝 기준으로 늘어나고, 머리는 목을 따라 오르내린다
    if (uSeg < 0.5) m.y += uBreath.y;
    else m.y = A + (m.y - A) * (1.0 + uBreath.x);
    // 캐릭터 전체: 아래쪽 가운데를 축으로 기울기 + 늘어남/납작해짐
    vec2 feet = vec2(0.5, A);
    m = feet + rot((m - feet) * uSquash, uHead.z);
  }

  vec2 px = uRect.xy + m * uRect.z;
  float z = uRig > 0.5 && uSeg > 0.5 ? -uBoneZ[int(aBone + 0.5)] : 0.0;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, z, 1.0);
}`

const FRAG = `
precision mediump float;
uniform sampler2D uTex;
uniform float uAlpha;
uniform float uAlphaTest; // 0보다 크면 이보다 투명한 곳은 버린다 (클리핑 영역 만들 때)
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uTex, vUv);
  if (uAlphaTest > 0.0 && c.a < uAlphaTest) discard;
  gl_FragColor = c * uAlpha;
}`

export interface RenderState extends FaceState {
  center: Model['center']
  head: HeadState
  squash?: [number, number]
  breath?: BreathState
  hair?: Map<string, HairOutput>
  focusId?: string | null
  eyes?: Model['eyes']
  pop?: number // 눈동자 통통 배율
  mouthAmount?: number // 0~1, 있으면 벌린 입 그림을 이만큼 벌린다 (0.5배 ~ 1배)
  aspect?: number // 그림 세로 ÷ 가로 (기본 1)
  body?: Model['body'] // 몸 리깅 (enabled일 때만)
  arms?: ArmAngles // 팔 흔들림
  hairToContent?: boolean // 흔들림 크기를 그림 끝이 아니라 그 레이어 그림의 끝 기준으로 (베타)
}

export interface View {
  zoom: number // 확대 배율 (1이면 화면에 맞춤)
  x: number // 이동 (CSS px)
  y: number
}

export interface RendererOptions {
  layout?: 'center' | 'bottom' // 편집기: 가운데 정렬, 라이브: 아래 정렬
  onImageError?: (layer: Layer) => void
  onImageSize?: (layer: Layer, width: number, height: number) => void
  maxTexture?: number // 이미지 최대 크기 (확대해서 볼 때는 크게)
}

export type Renderer = NonNullable<ReturnType<typeof createRenderer>>

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
  return s
}

export function createRenderer(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true, stencil: true, depth: true })
  if (!gl) return null

  const prog = gl.createProgram()!
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG))
  gl.bindAttribLocation(prog, 0, 'aPos') // 0번은 항상 켜진 격자 좌표로 (꺼 두면 느려지는 브라우저가 있다)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog))
  gl.useProgram(prog)

  const u: Record<string, WebGLUniformLocation | null> = {}
  for (const name of ['uRes', 'uRect', 'uAspect', 'uCenter', 'uHead', 'uSquash', 'uBreath', 'uSeg', 'uRig', 'uWaist',
    'uBodyR', 'uBodyAng', 'uBoneM', 'uBoneT', 'uBoneZ', 'uDepth', 'uCurve',
    'uHairOn', 'uAnchorY', 'uHairDir', 'uHairEnd', 'uHairOffset', 'uHairAngle', 'uTex', 'uAlpha', 'uAlphaTest', 'uEyeBand', 'uPop', 'uMouth']) {
    u[name] = gl.getUniformLocation(prog, name)
  }

  // 공용 격자 메시
  const verts: number[] = []
  for (let j = 0; j <= GRID; j++) for (let i = 0; i <= GRID; i++) verts.push(i / GRID, j / GRID)
  const idx: number[] = []
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const a = j * (GRID + 1) + i, b = a + 1, c = a + GRID + 1, d = c + 1
    idx.push(a, b, c, b, d, c)
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(prog, 'aPos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW)


  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
  gl.uniform1i(u.uTex, 0)

  const textures = new Map<string, { key: string; tex: WebGLTexture | null; ready: boolean; mid: [number, number]; top: number; bottom: number; points: [number, number][]; bone: { key: string; id: number; skin: WebGLBuffer | null } }>()

  // 그림에서 불투명한 부분의 가운데(위아래·좌우 끝의 중간, 0~1)와 듬성듬성 뽑은 점들.
  // 가운데는 입을 벌릴 때 축으로, 점들은 몸 리깅에서 붙을 뼈를 고를 때 쓴다.
  // 작게 줄여서 CPU 캔버스로 한 번만 계산한다.
  let probe: CanvasRenderingContext2D | null = null
  function opaqueInfo(img: HTMLImageElement): { mid: [number, number]; top: number; bottom: number; points: [number, number][] } {
    const N = 128
    if (!probe) {
      const c = document.createElement('canvas')
      c.width = c.height = N
      probe = c.getContext('2d', { willReadFrequently: true })
    }
    if (!probe) return { mid: [0.5, 0.5], top: 0, bottom: 1, points: [] }
    probe.clearRect(0, 0, N, N)
    probe.drawImage(img, 0, 0, N, N)
    const d = probe.getImageData(0, 0, N, N).data
    let x0 = N, y0 = N, x1 = -1, y1 = -1
    const points: [number, number][] = []
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (d[(y * N + x) * 4 + 3]! > 40) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          y1 = y
          if (x % 4 == 0 && y % 4 == 0) points.push([(x + 0.5) / N, (y + 0.5) / N])
        }
      }
    }
    if (x1 < 0) return { mid: [0.5, 0.5], top: 0, bottom: 1, points }
    return { mid: [(x0 + x1 + 1) / 2 / N, (y0 + y1 + 1) / 2 / N], top: y0 / N, bottom: (y1 + 1) / N, points }
  }
  let layers: Layer[] = []

  // 이 모니터에서 그려질 수 있는 최대 크기 (캐릭터 정사각형은 화면의 짧은 변을 넘지 않는다)
  function maxTextureSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    if (options.maxTexture) return Math.min(options.maxTexture, gl.getParameter(gl.MAX_TEXTURE_SIZE))
    return Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE), Math.ceil(Math.min(screen.width, screen.height) * dpr))
  }

  // 그보다 큰 이미지는 줄여서 올린다 (GPU 메모리 절약, 화질 차이 없음).
  // 줄이기를 지원하지 않는 브라우저에선 원본 그대로 쓴다.
  async function fitImage(img: HTMLImageElement): Promise<HTMLImageElement | ImageBitmap> {
    const max = maxTextureSize()
    const w = img.naturalWidth, h = img.naturalHeight
    if (Math.max(w, h) <= max || typeof createImageBitmap == 'undefined') return img
    const k = max / Math.max(w, h)
    try {
      return await createImageBitmap(img, {
        resizeWidth: Math.round(w * k),
        resizeHeight: Math.round(h * k),
        resizeQuality: 'high',
        premultiplyAlpha: 'premultiply',
      })
    } catch (e) {
      return img
    }
  }

  // 텍스처는 레이어 + 이미지 조합으로 구분 (캐릭터 슬롯끼리 같은 레이어를 다른 이미지로 쓸 수 있어서)
  const texKey = (l: Layer) => l.id + '|' + l.src.type + ':' + l.src.value

  function loadTexture(layer: Layer, resolveSrc: (l: Layer) => Promise<string>) {
    const key = texKey(layer)
    if (textures.has(key)) return
    const entry = { key, tex: null as WebGLTexture | null, ready: false, mid: [0.5, 0.5] as [number, number], top: 0, bottom: 1, points: [] as [number, number][], bone: { key: '', id: 0, skin: null as WebGLBuffer | null } }
    textures.set(key, entry)
    if (!layer.src.value) return
    resolveSrc(layer).then(url => {
      if (!url || textures.get(key) !== entry) return
      const img = new Image()
      if (!url.startsWith('blob:') && !url.startsWith('data:')) img.crossOrigin = 'anonymous'
      img.onload = async () => {
        try {
          Object.assign(entry, opaqueInfo(img))
        } catch (e) {}
        options.onImageSize?.(layer, img.naturalWidth, img.naturalHeight)
        const source = await fitImage(img)
        if (textures.get(key) !== entry) {
          if (source instanceof ImageBitmap) source.close()
          return
        }
        const tex = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
          if (source instanceof ImageBitmap) source.close() // 줄인 이미지 메모리 바로 해제
          entry.tex = tex
          entry.ready = true
        } catch (e) {
          gl.deleteTexture(tex)
          options.onImageError && options.onImageError(layer)
        }
      }
      img.onerror = () => options.onImageError && options.onImageError(layer)
      img.src = url
    })
  }

  let aspect = 1
  let lastBody: Model['body'] | null = null, lastHeadR = 0.25

  // 몸 레이어가 따라갈 뼈 (관절이 바뀔 때만 다시 고른다).
  // 양팔/양다리 레이어(음수 번호)는 점마다 뼈 번호를 담은 버퍼도 만든다.
  type BoneCache = { key: string; id: number; skin: WebGLBuffer | null }
  function boneOf(l: Layer, t: { points: [number, number][]; bone: BoneCache }) {
    if (!lastBody) return BONE.spine
    const key = JSON.stringify([lastBody.joints, lastBody.radius, aspect, lastHeadR])
    if (t.bone.key != key) {
      const id = boneForPart(t.points.map(([x, y]) => ({ x, y: y * aspect })), lastBody, aspect, lastHeadR)
      let skin = t.bone.skin
      if (id < 0) {
        skin = skin || gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, skin)
        gl.bufferData(gl.ARRAY_BUFFER, pairSkin(GRID, id, lastBody, aspect, lastHeadR), gl.STATIC_DRAW)
      }
      t.bone = { key, id, skin }
    }
    return t.bone.id
  }

  // 그릴 레이어의 뼈 번호를 셰이더에 넘긴다
  const aBone = gl.getAttribLocation(prog, 'aBone')
  function useBone(id: number, skin: WebGLBuffer | null) {
    if (id < 0 && skin) {
      gl.bindBuffer(gl.ARRAY_BUFFER, skin)
      gl.enableVertexAttribArray(aBone)
      gl.vertexAttribPointer(aBone, 1, gl.FLOAT, false, 0, 0)
    } else {
      gl.disableVertexAttribArray(aBone)
      gl.vertexAttrib1f(aBone, id < 0 ? BONE.spine : id)
    }
  }
  let view: View = { zoom: 1, x: 0, y: 0 }

  // 화면 크기에 맞춰 그림 위치 계산 (x, y, 가로 길이), 그다음 확대·이동
  function rect(): [number, number, number] {
    const W = canvas.width, H = canvas.height, A = aspect
    let x, y, S
    if (options.layout == 'bottom') {
      S = Math.min(W, H / A)
      x = (W - S) / 2
      y = H - S * A
    } else {
      S = Math.min(W, H / A) * 0.92
      x = (W - S) / 2
      y = (H - S * A) / 2
    }
    const k = canvas.width / (canvas.clientWidth || 1)
    const z = view.zoom
    return [W / 2 + (x - W / 2) * z + view.x * k, H / 2 + (y - H / 2) * z + view.y * k, S * z]
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr)
    if (canvas.width != w || canvas.height != h) {
      canvas.width = w
      canvas.height = h
    }
  }

  return {
    // next: 그릴 레이어. retain: 지금은 안 그리지만 미리 불러 둘 레이어 (다른 캐릭터 슬롯 — 바꿀 때 깜빡이지 않게)
    setLayers(next: Layer[], resolveSrc: (l: Layer) => Promise<string>, retain: Layer[] = []) {
      layers = next
      const all = [...next, ...retain]
      const keep = new Set(all.map(texKey))
      for (const [key, t] of textures) {
        if (!keep.has(key)) {
          if (t.tex) gl.deleteTexture(t.tex)
          if (t.bone.skin) gl.deleteBuffer(t.bone.skin)
          textures.delete(key)
        }
      }
      for (const l of all) loadTexture(l, resolveSrc)
    },

    isLoaded(layer: Layer) {
      const t = textures.get(texKey(layer))
      return !!(t && t.ready)
    },

    // CSS px 기준 그림 위치 (x, y, 가로 길이, 세로 길이) — 편집기 오버레이용
    cssRect(): [number, number, number, number] {
      const k = canvas.clientWidth / (canvas.width || 1)
      const [x, y, S] = rect()
      return [x * k, y * k, S * k, S * k * aspect]
    },

    // 몸 리깅: 레이어가 붙은 뼈 번호 (머리 레이어, 리깅 꺼짐, 아직 안 불러왔으면 null)
    boneOf(l: Layer): number | null {
      const t = textures.get(texKey(l))
      if (!lastBody || l.part == 'head' || !t || !t.ready) return null
      return boneOf(l, t)
    },

    setView(v: View) {
      view = v
    },

    render(state: RenderState) {
      aspect = state.aspect || 1
      const A = aspect
      resize()
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clearStencil(0)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT)
      gl.disable(gl.STENCIL_TEST)
      gl.uniform1f(u.uAlphaTest, 0)
      gl.uniform2f(u.uRes, canvas.width, canvas.height)
      gl.uniform3f(u.uRect, ...rect())
      gl.uniform1f(u.uAspect, A)
      gl.uniform3f(u.uCenter, state.center.x, state.center.y * A, state.center.r)
      gl.uniform3f(u.uHead, state.head.yaw, state.head.pitch, state.head.roll)
      gl.uniform2f(u.uSquash, ...(state.squash || [1, 1] as [number, number]))
      gl.uniform2f(u.uBreath, state.breath ? state.breath.bodyStretch : 0, state.breath ? state.breath.headBob * A : 0)

      // 몸 리깅: 몸은 얼굴 각도를 일정 비율로 따라가고, 기울기는 관절마다 나눠 받는다
      const body = state.body && state.body.enabled ? state.body : null
      lastBody = body
      lastHeadR = state.center.r
      gl.uniform1f(u.uRig, body ? 1 : 0)
      if (body) {
        const f = body.follow / 100, h = state.head
        gl.uniform2f(u.uWaist, body.joints.waist.x, body.joints.waist.y * A)
        gl.uniform1f(u.uBodyR, Math.max(0.01, body.radius))
        gl.uniform3f(u.uBodyAng, h.yaw * f * 1.4, h.pitch * f * 0.8, h.yaw * f * 0.4)
        const pose = poseBones(body, A, { head: h, squash: state.squash, stretch: state.breath?.bodyStretch, arms: state.arms })
        gl.uniform4fv(u.uBoneM, pose.bones.flatMap(t => [t[0], t[1], t[2], t[3]]))
        gl.uniform2fv(u.uBoneT, pose.bones.flatMap(t => [t[4], t[5]]))
        gl.uniform1fv(u.uBoneZ, pose.depth)
      }

      const blink = state.blink ?? (state.eyesClosed ? 1 : 0)
      const eyes = state.eyes || { squash: false, y: 0.4, h: 0.05 }

      // 목록 위쪽이 앞이므로 뒤에서부터 그린다
      for (let i = layers.length - 1; i >= 0; i--) {
        const l = layers[i]!
        // 클리핑: 클리핑 안 된 레이어가 기준이 되고, 바로 앞(목록 위)의 클리핑 레이어들은 그 안쪽에만 그린다
        const isMask = !l.clip && i > 0 && !!layers[i - 1]!.clip
        if (!l.clip) gl.clear(gl.STENCIL_BUFFER_BIT)
        const t = textures.get(texKey(l))
        if (!t || !t.ready || !isVisible(l, state)) continue
        const seg = l.part == 'head' ? 0 : 1
        if (body && seg) useBone(boneOf(l, t), t.bone.skin)
        else useBone(BONE.head, null)
        // 흔들림 물리는 HairSystem이 계산한 레이어만 (정식판은 머리 레이어만, 베타는 몸 레이어도)
        const hair = l.hair.enabled && state.hair && state.hair.get(l.id)
        gl.uniform1f(u.uSeg, seg)
        gl.uniform1f(u.uDepth, l.depth / 100 * 0.4)
        gl.uniform1f(u.uCurve, l.curve / 100 * 0.4)
        gl.uniform1f(u.uHairOn, hair ? 1 : 0)
        gl.uniform1f(u.uAnchorY, l.hair.anchorY * A)
        gl.uniform1f(u.uHairDir, l.hair.dir == 'up' ? -1 : 1)
        // 세로로 긴 그림에서도 머리카락·스커트 끝이 충분히 흔들리도록, 베타는 레이어 그림이 있는 끝까지를 기준으로
        gl.uniform1f(u.uHairEnd, l.hair.dir == 'up'
          ? (state.hairToContent ? t.top : 0) * A
          : (state.hairToContent ? t.bottom : 1) * A)
        gl.uniform2f(u.uHairOffset, ...(hair ? hair.offset : [0, 0] as [number, number]))
        gl.uniform1f(u.uHairAngle, hair ? hair.angle : 0)
        // 뜬 눈은 감은 눈으로 바뀌기 전까지 점점 눌린다
        const squash = eyes.squash && l.show == 'eyesOpen' ? 1 - 0.75 * Math.min(1, blink / BLINK_SWAP) : 1
        gl.uniform3f(u.uEyeBand, eyes.y * A, eyes.h * A, squash)
        gl.uniform1f(u.uPop, l.pop ? state.pop ?? 1 : 1)
        const a = l.show == 'mouthOpen' && state.mouthAmount !== undefined ? state.mouthAmount : 1
        gl.uniform4f(u.uMouth, t.mid[0], t.mid[1] * A, 0.8 + 0.2 * a, 0.5 + 0.5 * a)
        gl.uniform1f(u.uAlpha, state.focusId && state.focusId != l.id ? 0.25 : 1)
        gl.bindTexture(gl.TEXTURE_2D, t.tex)

        if (l.clip) {
          gl.enable(gl.STENCIL_TEST)
          gl.stencilFunc(gl.EQUAL, 1, 0xff)
          gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP)
        }
        // 양팔/양다리 레이어: 이 레이어 안에서만 깊이를 비교해 더 굽은 쪽이 앞에 오게.
        // 투명한 곳은 깊이를 남기지 않아서 앞쪽 빈 공간이 뒤를 가리지 않는다.
        const pair = !!body && seg == 1 && t.bone.id < 0
        if (pair) {
          gl.clear(gl.DEPTH_BUFFER_BIT)
          gl.enable(gl.DEPTH_TEST)
          gl.depthFunc(gl.LESS)
          gl.uniform1f(u.uAlphaTest, 0.02)
        }
        gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0)
        if (pair) {
          gl.disable(gl.DEPTH_TEST)
          gl.uniform1f(u.uAlphaTest, 0)
        }
        gl.disable(gl.STENCIL_TEST)

        // 기준 레이어의 그림 영역을 스텐실에 기록 (색은 안 그림)
        if (isMask) {
          gl.enable(gl.STENCIL_TEST)
          gl.stencilFunc(gl.ALWAYS, 1, 0xff)
          gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE)
          gl.colorMask(false, false, false, false)
          gl.uniform1f(u.uAlphaTest, 0.5)
          gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0)
          gl.uniform1f(u.uAlphaTest, 0)
          gl.colorMask(true, true, true, true)
          gl.disable(gl.STENCIL_TEST)
        }
      }
    },

    destroy() {
      for (const t of textures.values()) if (t.tex) gl.deleteTexture(t.tex)
      textures.clear()
    },
  }
}
