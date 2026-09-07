import * as THREE from 'three'

/**
 * Face adjacency for a non-indexed BufferGeometry (what STLLoader produces —
 * each triangle owns 3 unique vertices, so there is no shared index buffer).
 * Built once per loaded mesh; used to flood-fill the flat patch under the
 * cursor for "place on face" highlighting.
 *
 * A single hit triangle is often a bad thing to highlight on its own: a
 * real-world STL's triangle count is driven by curvature, not usefulness, so
 * a flat face can be one huge triangle or thousands of tiny ones sharing the
 * same plane. Highlighting only the one under the pointer would flicker
 * between "a whole face" and "an invisible sliver" depending on how that
 * particular area happened to be meshed.
 */
export interface FaceAdjacency {
  triCount: number
  /** 3 floats per triangle: the geometric face normal, object space. */
  normals: Float32Array
  /** Neighbour triangle indices per triangle, one per shared edge (max 3). */
  neighbors: number[][]
}

/** Triangles above this count skip adjacency (highlighting falls back to a single triangle). */
export const MAX_ADJACENCY_TRIANGLES = 60_000
/** Triangles a single flood-fill may include, so one hover can't stall the frame on a huge coplanar region. */
export const MAX_PATCH_TRIANGLES = 20_000
/** How far from the seed triangle's normal (degrees) a neighbour may be and still count as "the same face". */
export const DEFAULT_COPLANAR_ANGLE_DEG = 12

function edgeKey(a: THREE.Vector3, b: THREE.Vector3): string {
  const ak = `${a.x.toFixed(4)},${a.y.toFixed(4)},${a.z.toFixed(4)}`
  const bk = `${b.x.toFixed(4)},${b.y.toFixed(4)},${b.z.toFixed(4)}`
  return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`
}

export function buildFaceAdjacency(geometry: THREE.BufferGeometry, maxTriangles = MAX_ADJACENCY_TRIANGLES): FaceAdjacency | null {
  const pos = geometry.getAttribute('position')
  const triCount = pos.count / 3
  if (!Number.isInteger(triCount) || triCount === 0 || triCount > maxTriangles) return null

  const normals = new Float32Array(triCount * 3)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const n = new THREE.Vector3()
  const edgeMap = new Map<string, number[]>()

  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(pos, t * 3)
    b.fromBufferAttribute(pos, t * 3 + 1)
    c.fromBufferAttribute(pos, t * 3 + 2)
    n.subVectors(b, a).cross(c.clone().sub(a))
    if (n.lengthSq() > 0) n.normalize()
    normals[t * 3] = n.x
    normals[t * 3 + 1] = n.y
    normals[t * 3 + 2] = n.z
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = edgeKey(p, q)
      const list = edgeMap.get(key)
      if (list) list.push(t)
      else edgeMap.set(key, [t])
    }
  }

  const neighbors: number[][] = Array.from({ length: triCount }, () => [])
  for (const tris of edgeMap.values()) {
    // A well-formed manifold edge is shared by exactly 2 triangles; a
    // boundary edge (1) has no neighbour to add, and a non-manifold edge
    // (3+, rare but not impossible on a real upload) just links each pair —
    // still a reasonable adjacency for highlighting purposes.
    for (let i = 0; i < tris.length; i++) {
      for (let j = i + 1; j < tris.length; j++) {
        neighbors[tris[i]].push(tris[j])
        neighbors[tris[j]].push(tris[i])
      }
    }
  }

  return { triCount, normals, neighbors }
}

function faceNormal(adj: FaceAdjacency, t: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(adj.normals[t * 3], adj.normals[t * 3 + 1], adj.normals[t * 3 + 2])
}

/**
 * BFS outward from `seed`, keeping any connected triangle whose normal is
 * within `angleDeg` of the *seed's* normal (not its immediate neighbour's —
 * comparing to a fixed reference stops a gentle curve from drifting the
 * accepted angle all the way around a fillet). Always includes at least the
 * seed triangle itself.
 */
export function floodFillCoplanar(
  adj: FaceAdjacency,
  seed: number,
  angleDeg = DEFAULT_COPLANAR_ANGLE_DEG,
  maxTriangles = MAX_PATCH_TRIANGLES,
): number[] {
  if (seed < 0 || seed >= adj.triCount) return []
  const cosThreshold = Math.cos((angleDeg * Math.PI) / 180)
  const seedNormal = faceNormal(adj, seed, new THREE.Vector3())
  const visited = new Set<number>([seed])
  const result: number[] = [seed]
  const queue: number[] = [seed]
  const n = new THREE.Vector3()
  while (queue.length > 0 && result.length < maxTriangles) {
    const t = queue.pop() as number
    for (const nb of adj.neighbors[t]) {
      if (visited.has(nb)) continue
      visited.add(nb)
      faceNormal(adj, nb, n)
      if (n.dot(seedNormal) >= cosThreshold) {
        result.push(nb)
        queue.push(nb)
        if (result.length >= maxTriangles) break
      }
    }
  }
  return result
}
