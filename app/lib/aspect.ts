// 그림 비율(세로 ÷ 가로) 정하기: 레이어들이 가장 많이 쓰는 비율로 (같으면 큰 이미지 쪽).
// 파츠는 모두 같은 크기 캔버스라서, 따로 만든 장식 이미지나 정사각형 기본 이미지가
// 늦게 불러와져도 비율이 바뀌지 않는다.
import type { Layer } from './model'

export function createAspectTracker() {
  const sizes = new Map<string, { w: number; h: number }>()
  return {
    // 이미지 하나가 불러와질 때마다 부르고, 지금 레이어 목록 기준의 비율을 돌려준다
    add(layer: Layer, w: number, h: number, layers: Layer[]): number | null {
      sizes.set(layer.id, { w, h })
      const groups = new Map<number, { count: number; area: number }>()
      for (const l of layers) {
        const s = sizes.get(l.id)
        if (!s) continue
        const a = Math.round(s.h / s.w * 100) / 100
        const g = groups.get(a) || { count: 0, area: 0 }
        g.count++
        g.area = Math.max(g.area, s.w * s.h)
        groups.set(a, g)
      }
      let best: number | null = null, bestG = { count: 0, area: 0 }
      for (const [a, g] of groups) {
        if (g.count > bestG.count || (g.count == bestG.count && g.area > bestG.area)) {
          best = a
          bestG = g
        }
      }
      return best
    },
  }
}
