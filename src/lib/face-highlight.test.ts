import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildFaceAdjacency, floodFillCoplanar, MAX_ADJACENCY_TRIANGLES } from './face-highlight'

function cubeGeometry(size = 10): THREE.BufferGeometry {
  // BoxGeometry is indexed by default; STLLoader output never is, so
  // de-index it to match what the app actually hands to buildFaceAdjacency.
  return new THREE.BoxGeometry(size, size, size).toNonIndexed()
}

describe('buildFaceAdjacency', () => {
  it('returns one normal per triangle and a manifold cube has every edge shared by exactly 2', () => {
    const geo = cubeGeometry()
    const adj = buildFaceAdjacency(geo)
    expect(adj).not.toBeNull()
    // BoxGeometry: 6 faces * 2 triangles = 12
    expect(adj?.triCount).toBe(12)
    // Every triangle has exactly 3 edges, each shared with exactly one other
    // triangle on a closed box, so every triangle has exactly 3 neighbours.
    for (let t = 0; t < (adj?.triCount ?? 0); t++) {
      expect(adj?.neighbors[t].length).toBe(3)
    }
  })

  it('bails out above the triangle cap instead of doing unbounded work', () => {
    const geo = cubeGeometry()
    expect(buildFaceAdjacency(geo, 5)).toBeNull()
    expect(buildFaceAdjacency(geo, 12)).not.toBeNull()
  })

  it('the default cap comfortably covers the anchor STL used to test this (6182 triangles)', () => {
    expect(MAX_ADJACENCY_TRIANGLES).toBeGreaterThan(6182)
  })
})

describe('floodFillCoplanar', () => {
  it('groups both triangles of one cube face and stops at the 90° edge to the next face', () => {
    const geo = cubeGeometry()
    const adj = buildFaceAdjacency(geo)
    if (!adj) throw new Error('adjacency build failed')
    // Triangle 0 is on the +X face (BoxGeometry's first face). Its face pairs
    // with triangle 1 on the same plane.
    const patch = floodFillCoplanar(adj, 0)
    expect(patch).toContain(0)
    expect(patch).toContain(1)
    expect(patch.length).toBe(2) // exactly this one face's 2 triangles, not the whole cube
    // None of the other 10 triangles (the other 5 faces) should be included —
    // a 12° tolerance must not cross a 90° edge.
    for (const t of patch) expect(t).toBeLessThan(2)
  })

  it('every cube face flood-fills to exactly 2 triangles', () => {
    const geo = cubeGeometry()
    const adj = buildFaceAdjacency(geo)
    if (!adj) throw new Error('adjacency build failed')
    for (let face = 0; face < 6; face++) {
      const seed = face * 2
      const patch = floodFillCoplanar(adj, seed)
      expect(patch.sort()).toEqual([seed, seed + 1])
    }
  })

  it('a wide angle tolerance can bridge across an edge; a tight one cannot', () => {
    const geo = cubeGeometry()
    const adj = buildFaceAdjacency(geo)
    if (!adj) throw new Error('adjacency build failed')
    expect(floodFillCoplanar(adj, 0, 5).length).toBe(2) // tight: stays on one face
    expect(floodFillCoplanar(adj, 0, 100).length).toBeGreaterThan(2) // loose: crosses the 90° edge
  })

  it('always includes the seed, and excludes a neighbour that is not actually coplanar', () => {
    // Two triangles sharing an edge but folded to a right angle, like an open
    // book — a real "these are different faces" case, unlike two triangles
    // making up one flat cube face (which are exactly coplanar at 0°).
    const geo = new THREE.BufferGeometry()
    // prettier-ignore
    const positions = new Float32Array([
      0, 0, 0,  1, 0, 0,  0, 1, 0, // seed triangle, lies in the XY plane (normal +Z)
      0, 0, 0,  1, 0, 0,  0, 0, 1, // folded 90° along the shared edge (0,0,0)-(1,0,0), normal -Y
    ])
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const adj = buildFaceAdjacency(geo)
    if (!adj) throw new Error('adjacency build failed')
    expect(adj.neighbors[0]).toContain(1)
    expect(floodFillCoplanar(adj, 0, 0)).toEqual([0])
    expect(floodFillCoplanar(adj, 0, 100)).toEqual(expect.arrayContaining([0, 1]))
  })

  it('respects the patch size cap', () => {
    const geo = cubeGeometry()
    const adj = buildFaceAdjacency(geo)
    if (!adj) throw new Error('adjacency build failed')
    expect(floodFillCoplanar(adj, 0, 100, 1)).toEqual([0])
  })

  it('returns nothing for a seed outside the triangle range', () => {
    const geo = cubeGeometry()
    const adj = buildFaceAdjacency(geo)
    if (!adj) throw new Error('adjacency build failed')
    expect(floodFillCoplanar(adj, -1)).toEqual([])
    expect(floodFillCoplanar(adj, adj.triCount)).toEqual([])
  })
})
