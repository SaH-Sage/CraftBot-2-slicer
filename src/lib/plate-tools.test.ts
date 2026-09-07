import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { boxStl, cylinderStl, fitToBed, placeOnFace, rotateAboutWorldAxis, toggleMirror } from './plate-tools'
import { identityObjectTransform } from './model-transforms'

function worldNormal(t: ReturnType<typeof identityObjectTransform>, local: [number, number, number]) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(t.rotation[0], t.rotation[1], t.rotation[2], 'XYZ'))
  return new THREE.Vector3(...local).applyQuaternion(q)
}

describe('plate tools', () => {
  it('rotates about a world axis by the requested angle', () => {
    const t = rotateAboutWorldAxis(undefined, 'x', 90)
    // the +Z face normal should now point along -Y
    const n = worldNormal(t, [0, 0, 1])
    expect(n.x).toBeCloseTo(0, 6)
    expect(n.y).toBeCloseTo(-1, 6)
    expect(n.z).toBeCloseTo(0, 6)
    expect(t.offset).toBeNull()
  })

  it('places the picked face flat on the bed, composing with the current rotation', () => {
    const tilted = rotateAboutWorldAxis(undefined, 'y', 45)
    // pick the face whose local normal is +X; after the 45 deg tilt it points somewhere between +X and -Z
    const picked = worldNormal(tilted, [1, 0, 0])
    const placed = placeOnFace(tilted, [picked.x, picked.y, picked.z])
    const down = worldNormal(placed, [1, 0, 0])
    expect(down.z).toBeCloseTo(-1, 6)
  })

  it('fits an oversized model to the bed with a margin', () => {
    const t = fitToBed(undefined, [500, 100, 100], { x: 250, y: 200, z: 200 })
    expect(t.scale[0]).toBeCloseTo(240 / 500, 6)
    expect(t.scale[1]).toBeCloseTo(240 / 500, 6)
  })

  it('toggles mirror per axis', () => {
    const t = toggleMirror(toggleMirror(undefined, 'x'), 'x')
    expect(t.mirror).toEqual([1, 1, 1])
    expect(toggleMirror(undefined, 'z').mirror).toEqual([1, 1, -1])
  })

  it('writes well-formed binary STL primitives sitting on Z = 0', () => {
    for (const stl of [boxStl(20, 30, 10), cylinderStl(20, 30, 24)]) {
      const dv = new DataView(stl.buffer)
      const n = dv.getUint32(80, true)
      expect(84 + n * 50).toBe(stl.byteLength)
      let minZ = Infinity
      for (let i = 0; i < n; i++) for (let v = 0; v < 3; v++) minZ = Math.min(minZ, dv.getFloat32(84 + i * 50 + 12 + v * 12 + 8, true))
      expect(minZ).toBeCloseTo(0, 5)
    }
  })
})
