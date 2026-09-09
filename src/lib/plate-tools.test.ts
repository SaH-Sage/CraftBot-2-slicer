import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  boxStl,
  cylinderStl,
  fitToBed,
  keepingAssociatedItemPosition,
  placeOnFace,
  rotateAboutWorldAxis,
  setUniformScale,
  sphereStl,
  supportPillarStl,
  toggleMirror,
} from './plate-tools'
import { identityObjectTransform } from './model-transforms'

// 'ZYX', matching plate-tools.ts's own decomposition order — see the comment
// on withRotation there for why this specific order matters: it's what the
// slicing engine's own Transformation class uses to reconstruct a rotation
// matrix from separate x/y/z angles (R = Rz*Ry*Rx), confirmed by slicing a
// distinctly-sized test box through the real engine under a known combined
// rotation and comparing its actual output dimensions against both
// conventions. Three.js's default 'XYZ' only agrees with it for a
// single-axis rotation, which is why isolated tests of one operation at a
// time never caught this — every prior test here, and every prior
// hand-check, happened to use just one axis.
function worldNormal(t: ReturnType<typeof identityObjectTransform>, local: [number, number, number]) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(t.rotation[0], t.rotation[1], t.rotation[2], 'ZYX'))
  return new THREE.Vector3(...local).applyQuaternion(q)
}

// Rebuilds a rotation matrix the same way the slicing engine does (R =
// Rz*Ry*Rx applied to separate x/y/z angles), independent of worldNormal
// above or of any three.js Euler order string — so this check can't pass by
// having the same mistaken assumption on both sides of a comparison.
function engineRotationMatrix(rotation: [number, number, number]): THREE.Matrix4 {
  const rx = new THREE.Matrix4().makeRotationX(rotation[0])
  const ry = new THREE.Matrix4().makeRotationY(rotation[1])
  const rz = new THREE.Matrix4().makeRotationZ(rotation[2])
  return rz.multiply(ry).multiply(rx)
}

describe('plate tools', () => {
  it('composing rotations about two different world axes reconstructs correctly under the engine convention', () => {
    // Exactly what "Free rotate about X" then "Free rotate about Z" (or Free
    // rotate then Place on face) produces: a second world-axis rotation
    // composed on top of a transform that already has one. A single-axis
    // rotation can't expose an Euler-order mismatch — this needs two.
    let t = rotateAboutWorldAxis(undefined, 'x', 90)
    t = rotateAboutWorldAxis(t, 'z', 90)

    // Confirm this test case actually exercises multiple axes at once —
    // otherwise it would silently degrade into the same blind spot as the
    // single-axis tests above.
    const nonZeroAxes = t.rotation.filter((r) => Math.abs(r) > 1e-6).length
    expect(nonZeroAxes).toBeGreaterThan(1)

    // The intended orientation, independent of any stored/decomposed numbers:
    // rotate 90° about world X, then 90° about world Z on top, composed directly
    // as quaternions.
    const intended = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2))
    const intendedMatrix = new THREE.Matrix4().makeRotationFromQuaternion(intended)

    // What the engine will actually reconstruct from the stored numbers.
    const engineMatrix = engineRotationMatrix(t.rotation)

    for (let i = 0; i < 16; i++) expect(engineMatrix.elements[i]).toBeCloseTo(intendedMatrix.elements[i], 6)
  })

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
    for (const stl of [boxStl(20, 30, 10), cylinderStl(20, 30, 24), sphereStl(20), supportPillarStl(4, 1.5, 20)]) {
      const dv = new DataView(stl.buffer)
      const n = dv.getUint32(80, true)
      expect(84 + n * 50).toBe(stl.byteLength)
      let minZ = Infinity
      for (let i = 0; i < n; i++) for (let v = 0; v < 3; v++) minZ = Math.min(minZ, dv.getFloat32(84 + i * 50 + 12 + v * 12 + 8, true))
      expect(minZ).toBeCloseTo(0, 5)
    }
  })

  it('tapers the support pillar from base to top diameter', () => {
    const stl = supportPillarStl(6, 2, 15)
    const dv = new DataView(stl.buffer)
    const n = dv.getUint32(80, true)
    let maxR = 0
    let minZ = Infinity
    let maxZ = -Infinity
    let rAtMinZ = 0
    let rAtMaxZ = 0
    for (let i = 0; i < n; i++) {
      for (let v = 0; v < 3; v++) {
        const base = 84 + i * 50 + 12 + v * 12
        const x = dv.getFloat32(base, true)
        const y = dv.getFloat32(base + 4, true)
        const z = dv.getFloat32(base + 8, true)
        const r = Math.hypot(x, y)
        maxR = Math.max(maxR, r)
        if (z < minZ) { minZ = z; rAtMinZ = r }
        if (z > maxZ) { maxZ = z; rAtMaxZ = r }
      }
    }
    // Base (bottom, Z=0) should be the wide end; top (Z=height) the narrow one.
    expect(rAtMinZ).toBeGreaterThan(rAtMaxZ)
    expect(rAtMinZ).toBeCloseTo(3, 1) // base diameter 6 -> radius 3
    expect(rAtMaxZ).toBeCloseTo(1, 1) // top diameter 2 -> radius 1
    expect(maxZ - minZ).toBeCloseTo(15, 5)
  })

  describe('keepingAssociatedItemPosition', () => {
    // Regression test for a reported bug: rotating (or scaling, or
    // mirroring) a click-placed support pillar reset its offset to null,
    // which handed its position to ModelViewer's shared grid layout — a
    // calculation driven by every offset-null item's size and count
    // together, not just the one that was actually edited. The pillar would
    // then jump to wherever that shared grid put it, with no visible
    // relationship to what was actually clicked.
    const pillar = { parentId: 'main', transform: { ...identityObjectTransform(), offset: [32, 17] as [number, number] } }
    const ordinaryModel = { transform: { ...identityObjectTransform(), offset: [10, 5] as [number, number] } }

    it('preserves a pillar\'s offset through rotation', () => {
      const rotated = rotateAboutWorldAxis(pillar.transform, 'z', 90)
      expect(rotated.offset).toBeNull() // confirms rotateAboutWorldAxis itself still resets it...
      const result = keepingAssociatedItemPosition(pillar, rotated)
      expect(result.offset).toEqual([32, 17]) // ...and the wrapper restores it.
    })

    it('preserves a pillar\'s offset through scale and mirror', () => {
      expect(keepingAssociatedItemPosition(pillar, setUniformScale(pillar.transform, 1.5)).offset).toEqual([32, 17])
      expect(keepingAssociatedItemPosition(pillar, toggleMirror(pillar.transform, 'x')).offset).toEqual([32, 17])
    })

    it('does not change the existing reset-on-edit behavior for an ordinary model', () => {
      const rotated = rotateAboutWorldAxis(ordinaryModel.transform, 'z', 90)
      expect(keepingAssociatedItemPosition(ordinaryModel, rotated).offset).toBeNull()
      expect(keepingAssociatedItemPosition(ordinaryModel, setUniformScale(ordinaryModel.transform, 2)).offset).toBeNull()
    })
  })
})
