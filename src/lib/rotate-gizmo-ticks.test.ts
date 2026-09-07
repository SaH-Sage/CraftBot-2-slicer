import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildAxisTickGeometry, createAxisTickLines, RING_RADIUS } from './rotate-gizmo-ticks'

function readPoints(geometry: THREE.BufferGeometry): THREE.Vector3[] {
  const pos = geometry.getAttribute('position')
  const out: THREE.Vector3[] = []
  for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i))
  return out
}

describe('buildAxisTickGeometry', () => {
  it('produces one tick (2 points) per step around the full circle', () => {
    for (const step of [5, 10, 15, 45]) {
      const g = buildAxisTickGeometry('X', step)
      const expectedTicks = 360 / step
      expect(g.getAttribute('position').count).toBe(expectedTicks * 2)
    }
  })

  it('is empty when snapping is off (0)', () => {
    const g = buildAxisTickGeometry('Z', 0)
    expect(g.getAttribute('position').count).toBe(0)
  })

  it('every inner point sits exactly on the ring radius', () => {
    for (const axis of ['X', 'Y', 'Z'] as const) {
      const g = buildAxisTickGeometry(axis, 15)
      const pts = readPoints(g)
      for (let i = 0; i < pts.length; i += 2) {
        expect(pts[i].length()).toBeCloseTo(RING_RADIUS, 6)
      }
    }
  })

  it('outer points extend further out than inner points, longer at cardinal angles', () => {
    const g = buildAxisTickGeometry('X', 15)
    const pts = readPoints(g)
    // angle 0 (index 0): cardinal, longest tier. angle 15 (index 2): neither
    // a multiple of 90 nor 45, shortest tier.
    const outerLenAt0 = pts[1].length() - pts[0].length()
    const outerLenAt15 = pts[3].length() - pts[2].length()
    expect(outerLenAt0).toBeGreaterThan(outerLenAt15)
  })

  it('accepts a custom radius', () => {
    const g = buildAxisTickGeometry('Y', 90, 2)
    const pts = readPoints(g)
    expect(pts[0].length()).toBeCloseTo(2, 6)
  })
})

describe('createAxisTickLines', () => {
  it('names the mesh to match the axis, for the gizmo update sweep to find it', () => {
    for (const axis of ['X', 'Y', 'Z'] as const) {
      const lines = createAxisTickLines(axis, 15, 0xff0000)
      expect(lines.name).toBe(axis)
      expect(lines.isLineSegments).toBe(true)
    }
  })

  it('gives each axis its own material instance (no shared-material cross-talk)', () => {
    const a = createAxisTickLines('X', 15, 0xff0000)
    const b = createAxisTickLines('Y', 15, 0x00ff00)
    expect(a.material).not.toBe(b.material)
  })
})
