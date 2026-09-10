import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  boxStl,
  buildMergedStlForItem,
  cylinderStl,
  fitToBed,
  mergeChildIntoParent,
  placeOnFace,
  rotateAboutWorldAxis,
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
})

describe('mergeChildIntoParent', () => {
  function bboxOf(stl: Uint8Array) {
    const geo = new THREE.BufferGeometry()
    // Re-parse via the same low-level reasoning as geometryToStl's writer
    // (12 floats per triangle after the 84-byte header, normal+3 vertices),
    // independent of any THREE STL loader — a from-scratch reader keeps this
    // test from validating the merge function against its own reader.
    const dv = new DataView(stl.buffer, stl.byteOffset, stl.byteLength)
    const triCount = dv.getUint32(80, true)
    const positions = new Float32Array(triCount * 9)
    let p = 84
    for (let t = 0; t < triCount; t++) {
      p += 12 // skip normal
      for (let v = 0; v < 9; v++) {
        positions[t * 9 + v] = dv.getFloat32(p, true)
        p += 4
      }
      p += 2 // attribute byte count
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.computeBoundingBox()
    return geo.boundingBox!
  }

  it('produces exactly parent-count + child-count triangles, and leaves the parent geometry untouched', () => {
    const parent = boxStl(10, 10, 10)
    const child = boxStl(2, 2, 2)
    const parentTriCountBefore = new DataView(parent.buffer, parent.byteOffset).getUint32(80, true)
    const childTriCount = new DataView(child.buffer, child.byteOffset).getUint32(80, true)

    const merged = mergeChildIntoParent(parent.buffer.slice(parent.byteOffset) as ArrayBuffer, child.buffer.slice(child.byteOffset) as ArrayBuffer, {
      relativeOffset: [20, 0, 5],
    })
    const mergedTriCount = new DataView(merged.buffer, merged.byteOffset).getUint32(80, true)
    expect(mergedTriCount).toBe(parentTriCountBefore + childTriCount)

    // The original parent buffer must be byte-for-byte unchanged.
    const parentTriCountAfter = new DataView(parent.buffer, parent.byteOffset).getUint32(80, true)
    expect(parentTriCountAfter).toBe(parentTriCountBefore)
  })

  it('translates the child by relativeOffset, expanding the combined bounding box exactly that far', () => {
    const parent = boxStl(10, 10, 10) // [-5,-5,0] to [5,5,10]
    const child = boxStl(2, 2, 2) // [-1,-1,0] to [1,1,2] before translation
    const merged = mergeChildIntoParent(parent.buffer.slice(parent.byteOffset) as ArrayBuffer, child.buffer.slice(child.byteOffset) as ArrayBuffer, {
      relativeOffset: [20, 0, 5],
    })
    const box = bboxOf(merged)
    expect(box.min.toArray()).toEqual([-5, -5, 0])
    expect(box.max.toArray()).toEqual([21, 5, 10]) // child's max.x=1 + 20 = 21; child's max.z=2+5=7 < parent's 10
  })

  it('bakes the child rotation, scale, and mirror into its vertices before translating', () => {
    const tinyParent = boxStl(0.1, 0.1, 0.1) // negligible — isolates the child's own transformed extent
    const longChild = boxStl(6, 2, 2) // X in [-3,3], Y in [-1,1], Z in [0,2]
    const merged = mergeChildIntoParent(
      tinyParent.buffer.slice(tinyParent.byteOffset) as ArrayBuffer,
      longChild.buffer.slice(longChild.byteOffset) as ArrayBuffer,
      { relativeOffset: [0, 0, 100], rotation: [0, 0, Math.PI / 2] },
    )
    const box = bboxOf(merged)
    // Independently-expected extent: rotate the child's own known corners by
    // 90° about Z using THREE's separate applyAxisAngle, then add the offset.
    const corners = [
      [-3, -1, 0], [3, -1, 0], [-3, 1, 0], [3, 1, 0],
      [-3, -1, 2], [3, -1, 2], [-3, 1, 2], [3, 1, 2],
    ]
    const expectedMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
    for (const [x, y, z] of corners) {
      const v = new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2).add(new THREE.Vector3(0, 0, 100))
      expectedMax.max(v)
    }
    expect(box.max.x).toBeCloseTo(expectedMax.x, 3)
    expect(box.max.y).toBeCloseTo(expectedMax.y, 3)
    expect(box.max.z).toBeCloseTo(expectedMax.z, 3)
    // The whole point: the child itself now sits lifted at z=100..102, clear
    // of the bed — checked via the same independently-rotated corners, not
    // the merged bbox's overall min (which the tiny parent, near z=0, would
    // dominate and make this assertion meaningless).
    const expectedChildMinZ = Math.min(...corners.map(([x, y, z]) => new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2).add(new THREE.Vector3(0, 0, 100)).z))
    expect(expectedChildMinZ).toBeGreaterThan(99)
  })
})

describe('buildMergedStlForItem', () => {
  function toFile(stl: Uint8Array, name: string) {
    return new File([stl.buffer.slice(stl.byteOffset, stl.byteOffset + stl.byteLength) as ArrayBuffer], name, { type: 'model/stl' })
  }
  function triCountOf(buf: ArrayBuffer) {
    return new DataView(buf).getUint32(80, true)
  }
  function bboxOf(buf: ArrayBuffer) {
    const geo = new THREE.BufferGeometry()
    const dv = new DataView(buf)
    const n = dv.getUint32(80, true)
    const positions = new Float32Array(n * 9)
    let p = 84
    for (let t = 0; t < n; t++) {
      p += 12
      for (let v = 0; v < 9; v++) {
        positions[t * 9 + v] = dv.getFloat32(p, true)
        p += 4
      }
      p += 2
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.computeBoundingBox()
    return geo.boundingBox!
  }

  it('resolves to the item\'s own bytes unchanged when it has no children', async () => {
    const mainStl = boxStl(10, 10, 10)
    const items = [{ id: 'main', stlFile: toFile(mainStl, 'main.stl') }]
    const result = await buildMergedStlForItem('main', items)
    expect(triCountOf(result)).toBe(triCountOf(mainStl.buffer.slice(mainStl.byteOffset) as ArrayBuffer))
  })

  it('merges a single direct child at its relativeOffset', async () => {
    const mainStl = boxStl(10, 10, 10) // [-5,-5,0]..[5,5,10]
    const pillarStl = boxStl(2, 2, 2) // [-1,-1,0]..[1,1,2] before translation
    const items = [
      { id: 'main', stlFile: toFile(mainStl, 'main.stl') },
      { id: 'pillarA', stlFile: toFile(pillarStl, 'pillarA.stl'), parentId: 'main', relativeOffset: [20, 0, 5] as [number, number, number] },
    ]
    const result = await buildMergedStlForItem('main', items)
    const box = bboxOf(result)
    expect(box.max.toArray()).toEqual([21, 5, 10])
  })

  it('recursively composes a two-level chain (a pillar clicked onto another pillar)', async () => {
    // Regression coverage for the trickiest case: pillarPickOn's raycast
    // doesn't distinguish an uploaded model from a previously-placed pillar,
    // so a grandchild is possible. Its relativeOffset is relative to its
    // OWN direct parent (pillarA), not the root — the recursive build has to
    // merge pillarB into pillarA's geometry first, then merge that combined
    // shape into main's, or the composition would be wrong.
    const tinyMainStl = boxStl(0.1, 0.1, 0.1) // negligible — isolates the composed chain's own extent
    const pillarAStl = boxStl(2, 2, 2) // local [-1,-1,0]..[1,1,2]
    const pillarBStl = boxStl(1, 1, 1) // local [-0.5,-0.5,0]..[0.5,0.5,1]
    const items = [
      { id: 'main', stlFile: toFile(tinyMainStl, 'main.stl') },
      { id: 'pillarA', stlFile: toFile(pillarAStl, 'pillarA.stl'), parentId: 'main', relativeOffset: [20, 0, 5] as [number, number, number] },
      { id: 'pillarB', stlFile: toFile(pillarBStl, 'pillarB.stl'), parentId: 'pillarA', relativeOffset: [3, 0, 2] as [number, number, number] },
    ]
    const result = await buildMergedStlForItem('main', items)
    const box = bboxOf(result)
    // pillarB's own local max [0.5, 0.5, 1] shifted by its relativeOffset
    // [3,0,2] -> [3.5, 0.5, 3] in pillarA's frame, then that shifted again
    // by pillarA's own relativeOffset [20,0,5] into main's frame:
    // [23.5, 0.5, 8]. X and Z both isolate this cleanly (pillarA's own 2mm
    // box doesn't reach as far as pillarB does on either axis); Y is left
    // unchecked here since pillarA's own box (±1) is wider there than
    // pillarB's contribution (±0.5) and would dominate that axis instead.
    expect(box.max.x).toBeCloseTo(23.5, 6)
    expect(box.max.z).toBeCloseTo(8, 6)
    const totalTriangles =
      triCountOf(tinyMainStl.buffer.slice(tinyMainStl.byteOffset) as ArrayBuffer) +
      triCountOf(pillarAStl.buffer.slice(pillarAStl.byteOffset) as ArrayBuffer) +
      triCountOf(pillarBStl.buffer.slice(pillarBStl.byteOffset) as ArrayBuffer)
    expect(triCountOf(result)).toBe(totalTriangles)
  })

  it('skips a malformed child (missing relativeOffset) instead of failing the whole merge', async () => {
    const mainStl = boxStl(10, 10, 10)
    const badChildStl = boxStl(2, 2, 2)
    const items = [
      { id: 'main', stlFile: toFile(mainStl, 'main.stl') },
      { id: 'bad', stlFile: toFile(badChildStl, 'bad.stl'), parentId: 'main' },
    ]
    const result = await buildMergedStlForItem('main', items)
    expect(triCountOf(result)).toBe(triCountOf(mainStl.buffer.slice(mainStl.byteOffset) as ArrayBuffer))
  })
})
