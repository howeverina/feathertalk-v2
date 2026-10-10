// 두 손가락 제스처: 핀치로 확대/축소, 두 손가락 드래그로 이동 (터치 화면용)
import type { View } from './renderer'

type Pt = { x: number; y: number }

export function createPinch(getRect: () => DOMRect, view: View) {
  const touches = new Map<number, Pt>()
  let start: { d: number; c: Pt; view: View } | null = null

  const both = () => [...touches.values()] as [Pt, Pt]
  // 화면(요소) 가운데를 기준으로 한 좌표
  function centered(p: Pt): Pt {
    const r = getRect()
    return { x: p.x - r.left - r.width / 2, y: p.y - r.top - r.height / 2 }
  }

  return {
    // 터치가 두 개가 되면 true (그때부터는 핸들 끌기 대신 확대·이동)
    down(e: PointerEvent): boolean {
      if (e.pointerType != 'touch') return false
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (touches.size == 2) {
        const [a, b] = both()
        start = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, c: centered({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), view: { ...view } }
        return true
      }
      return false
    },
    // 확대·이동 중이면 true
    move(e: PointerEvent): boolean {
      if (!touches.has(e.pointerId)) return false
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (!start || touches.size < 2) return false
      const [a, b] = both()
      const z = Math.max(0.2, Math.min(8, start.view.zoom * Math.hypot(a.x - b.x, a.y - b.y) / start.d))
      const c = centered({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
      // 처음 두 손가락 가운데에 있던 지점이 지금 두 손가락 가운데로 따라오도록
      view.x = c.x - (start.c.x - start.view.x) * z / start.view.zoom
      view.y = c.y - (start.c.y - start.view.y) * z / start.view.zoom
      view.zoom = z
      return true
    },
    up(e: PointerEvent) {
      touches.delete(e.pointerId)
      if (touches.size < 2) start = null
    },
    get active() {
      return !!start
    },
  }
}
