// WebGL 렌더러: 레이어마다 격자(메시)를 휘어서 입체감/볼록·오목/머리카락 흔들림을 표현한다.
import { isVisible, type FaceState, type Layer, type Model } from './model'
import type { BreathState, HairOutput, HeadState } from './physics'

const GRID = 32

const VERT = `
attribute vec2 aPos;
uniform vec2 uRes;
uniform vec3 uRect;      // 모델 정사각형의 화면 위치 (x, y, 한 변 길이), px
uniform vec3 uCenter;    // 얼굴 중심 x, y, 반지름
uniform vec3 uHead;      // yaw, pitch, roll (rad)
uniform vec2 uSquash;
uniform vec2 uBreath;    // 몸 늘어남, 머리 오르내림
uniform float uIsHead;
uniform float uDepth;
uniform float uCurve;
uniform float uHairOn;
uniform float uAnchorY;
uniform vec2 uHairOffset;
uniform float uHairAngle;
varying vec2 vUv;

vec2 rot(vec2 v, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

void main() {
  vUv = aPos;
  vec2 m = aPos;

  // 머리카락: 고정선 아래로 갈수록 크게 휘고 밀린다
  if (uHairOn > 0.5) {
    float w = pow(smoothstep(uAnchorY, 1.0, m.y), 1.5);
    vec2 a = vec2(m.x, uAnchorY);
    m = a + rot(m - a, uHairAngle * w) + uHairOffset * w;
  }

  // 머리: 얼굴 중심을 기준으로 한 곡면 위에 있다고 보고 회전
  if (uIsHead > 0.5) {
    vec2 p = m - uCenter.xy;
    float r2 = clamp(dot(p, p) / (uCenter.z * uCenter.z), 0.0, 1.0);
    float z = uDepth + uCurve * (1.0 - r2);
    p.x = p.x * cos(uHead.x) + z * sin(uHead.x);
    p.y = p.y * cos(uHead.y) + z * sin(uHead.y);
    m = uCenter.xy + p;
  }

  // 호흡: 몸은 발끝 기준으로 늘어나고, 머리는 목을 따라 오르내린다
  if (uIsHead > 0.5) m.y += uBreath.y;
  else m.y = 1.0 + (m.y - 1.0) * (1.0 + uBreath.x);

  // 캐릭터 전체: 아래쪽 가운데를 축으로 기울기 + 늘어남/납작해짐
  vec2 pivot = vec2(0.5, 1.0);
  m = pivot + rot((m - pivot) * uSquash, uHead.z);

  vec2 px = uRect.xy + m * uRect.z;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
}`

const FRAG = `
precision mediump float;
uniform sampler2D uTex;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(uTex, vUv) * uAlpha;
}`

export interface RenderState extends FaceState {
  center: Model['center']
  head: HeadState
  squash?: [number, number]
  breath?: BreathState
  hair?: Map<string, HairOutput>
  focusId?: string | null
}

export interface RendererOptions {
  layout?: 'center' | 'bottom' // 편집기: 가운데 정렬, 라이브: 아래 정렬
  onImageError?: (layer: Layer) => void
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
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true })
  if (!gl) return null

  const prog = gl.createProgram()!
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog))
  gl.useProgram(prog)

  const u: Record<string, WebGLUniformLocation | null> = {}
  for (const name of ['uRes', 'uRect', 'uCenter', 'uHead', 'uSquash', 'uBreath', 'uIsHead', 'uDepth', 'uCurve',
    'uHairOn', 'uAnchorY', 'uHairOffset', 'uHairAngle', 'uTex', 'uAlpha']) {
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

  const textures = new Map<string, { key: string; tex: WebGLTexture | null; ready: boolean }>()
  let layers: Layer[] = []

  // 이 모니터에서 그려질 수 있는 최대 크기 (캐릭터 정사각형은 화면의 짧은 변을 넘지 않는다)
  function maxTextureSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
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

  function loadTexture(layer: Layer, resolveSrc: (l: Layer) => Promise<string>) {
    const key = layer.src.type + ':' + layer.src.value
    const cur = textures.get(layer.id)
    if (cur && cur.key == key) return
    if (cur && cur.tex) gl.deleteTexture(cur.tex)
    const entry = { key, tex: null as WebGLTexture | null, ready: false }
    textures.set(layer.id, entry)
    if (!layer.src.value) return
    resolveSrc(layer).then(url => {
      if (!url || textures.get(layer.id) !== entry) return
      const img = new Image()
      if (!url.startsWith('blob:') && !url.startsWith('data:')) img.crossOrigin = 'anonymous'
      img.onload = async () => {
        const source = await fitImage(img)
        if (textures.get(layer.id) !== entry) {
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

  // 화면 크기에 맞춰 모델 정사각형 위치 계산
  function rect(): [number, number, number] {
    const W = canvas.width, H = canvas.height
    if (options.layout == 'bottom') {
      const S = Math.min(W, H)
      return [(W - S) / 2, H - S, S]
    }
    const S = Math.min(W, H) * 0.92
    return [(W - S) / 2, (H - S) / 2, S]
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
    setLayers(next: Layer[], resolveSrc: (l: Layer) => Promise<string>) {
      layers = next
      const ids = new Set(next.map(l => l.id))
      for (const [id, t] of textures) {
        if (!ids.has(id)) {
          if (t.tex) gl.deleteTexture(t.tex)
          textures.delete(id)
        }
      }
      for (const l of next) loadTexture(l, resolveSrc)
    },

    isLoaded(layer: Layer) {
      const t = textures.get(layer.id)
      return !!(t && t.ready)
    },

    // CSS px 기준 모델 정사각형 위치 (편집기 오버레이용)
    cssRect(): [number, number, number] {
      const k = canvas.clientWidth / (canvas.width || 1)
      const [x, y, S] = rect()
      return [x * k, y * k, S * k]
    },

    render(state: RenderState) {
      resize()
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform2f(u.uRes, canvas.width, canvas.height)
      gl.uniform3f(u.uRect, ...rect())
      gl.uniform3f(u.uCenter, state.center.x, state.center.y, state.center.r)
      gl.uniform3f(u.uHead, state.head.yaw, state.head.pitch, state.head.roll)
      gl.uniform2f(u.uSquash, ...(state.squash || [1, 1] as [number, number]))
      gl.uniform2f(u.uBreath, state.breath ? state.breath.bodyStretch : 0, state.breath ? state.breath.headBob : 0)

      // 목록 위쪽이 앞이므로 뒤에서부터 그린다
      for (let i = layers.length - 1; i >= 0; i--) {
        const l = layers[i]
        const t = textures.get(l.id)
        if (!t || !t.ready || !isVisible(l, state)) continue
        const isHead = l.part != 'body'
        const hair = l.hair.enabled && isHead && state.hair && state.hair.get(l.id)
        gl.uniform1f(u.uIsHead, isHead ? 1 : 0)
        gl.uniform1f(u.uDepth, l.depth / 100 * 0.4)
        gl.uniform1f(u.uCurve, l.curve / 100 * 0.4)
        gl.uniform1f(u.uHairOn, hair ? 1 : 0)
        gl.uniform1f(u.uAnchorY, l.hair.anchorY)
        gl.uniform2f(u.uHairOffset, ...(hair ? hair.offset : [0, 0] as [number, number]))
        gl.uniform1f(u.uHairAngle, hair ? hair.angle : 0)
        gl.uniform1f(u.uAlpha, state.focusId && state.focusId != l.id ? 0.25 : 1)
        gl.bindTexture(gl.TEXTURE_2D, t.tex)
        gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0)
      }
    },

    destroy() {
      for (const t of textures.values()) if (t.tex) gl.deleteTexture(t.tex)
      textures.clear()
    },
  }
}
