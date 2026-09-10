import * as THREE from 'three'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import type { ObjectTransform } from '../types'
import { identityObjectTransform } from './model-transforms'

/**
 * Manual plate tools. All rotations compose in world space on top of the
 * object's current transform, using the same Euler convention the preview
 * (ModelViewer.applyTransform) and the engine use: X/Y/Z order, radians.
 * Every tool clears the arranged offset so the object is re-placed.
 */

type Axis = 'x' | 'y' | 'z'
const AXES: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
}

function quaternionOf(t: ObjectTransform): THREE.Quaternion {
  // Matches withRotation's decomposition order below — must reconstruct with
  // the same convention the stored numbers were produced under, or composing
  // a second rotation on top of an existing one starts from the wrong quaternion.
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(t.rotation[0], t.rotation[1], t.rotation[2], 'ZYX'))
}

function withRotation(t: ObjectTransform, q: THREE.Quaternion): ObjectTransform {
  // 'ZYX', not three.js's default 'XYZ': the slicing engine reconstructs a
  // rotation from these three numbers as R = Rz*Ry*Rx (confirmed by slicing
  // a distinctly-sized test box through the real engine and comparing its
  // actual output height against both conventions). The two conventions only
  // agree for a single-axis rotation — exactly why an isolated Free Rotate or
  // Place on Face looked correct, and only combining two of them (a second
  // operation composing on top of a first that already has rotation) exposed
  // a real mismatch between the preview and the sliced result.
  const e = new THREE.Euler().setFromQuaternion(q, 'ZYX')
  const clean = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v)
  return { ...t, rotation: [clean(e.x), clean(e.y), clean(e.z)], offset: null }
}

export function current(t: ObjectTransform | undefined): ObjectTransform {
  return t ?? identityObjectTransform()
}

/**
 * Converts a world-space point (e.g. where a pillar was clicked) into a
 * vector relative to the parent's own origin, expressed in the parent's
 * *unrotated* local frame — independent of whatever the parent's rotation
 * happens to be at that moment. Used once, at creation time, to compute the
 * permanent offset that mergeChildIntoParent (below) later bakes directly
 * into the child's geometry — the child's position is never recomputed
 * after that; the parent's own transform carries it from then on, since
 * it's now part of the same mesh.
 */
export function relativeOffsetFromParent(
  parentTransform: ObjectTransform | undefined,
  worldPoint: [number, number, number],
): [number, number, number] {
  const p = current(parentTransform)
  const parentOrigin = new THREE.Vector3(p.offset?.[0] ?? 0, p.offset?.[1] ?? 0, 0)
  const local = new THREE.Vector3(...worldPoint).sub(parentOrigin).applyQuaternion(quaternionOf(p).invert())
  return [local.x, local.y, local.z]
}

/** Rotate about a world axis by `degrees`, on top of the current rotation. */
export function rotateAboutWorldAxis(t: ObjectTransform | undefined, axis: Axis, degrees: number): ObjectTransform {
  const cur = current(t)
  const q = new THREE.Quaternion().setFromAxisAngle(AXES[axis], (degrees * Math.PI) / 180)
  return withRotation(cur, q.multiply(quaternionOf(cur)))
}

/**
 * Place on face: the picked face's outward normal (in world space, i.e. after
 * the current rotation) is turned to point straight down, so that face
 * becomes the bottom.
 */
export function placeOnFace(t: ObjectTransform | undefined, worldNormal: [number, number, number]): ObjectTransform {
  const cur = current(t)
  const n = new THREE.Vector3(...worldNormal).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(n, new THREE.Vector3(0, 0, -1))
  return withRotation(cur, q.multiply(quaternionOf(cur)))
}

/** Uniform scale as a factor of the original model (1 = 100 %). */
export function setUniformScale(t: ObjectTransform | undefined, factor: number): ObjectTransform {
  const cur = current(t)
  const f = Number.isFinite(factor) && factor > 0 ? factor : 1
  return { ...cur, scale: [f, f, f], offset: null }
}

/**
 * Scale so the object fits the bed with a margin. `size` is the object's
 * current transformed size in mm (as reported by the viewer).
 */
export function fitToBed(
  t: ObjectTransform | undefined,
  size: [number, number, number],
  bed: { x: number; y: number; z: number },
  margin = 5,
): ObjectTransform {
  const cur = current(t)
  const [sx, sy, sz] = size
  if (!(sx > 0 && sy > 0 && sz > 0)) return cur
  const factor = Math.min((bed.x - 2 * margin) / sx, (bed.y - 2 * margin) / sy, (bed.z - 1) / sz)
  return { ...cur, scale: [cur.scale[0] * factor, cur.scale[1] * factor, cur.scale[2] * factor], offset: null }
}

export function toggleMirror(t: ObjectTransform | undefined, axis: Axis): ObjectTransform {
  const cur = current(t)
  const i = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
  const mirror: [number, number, number] = [...cur.mirror] as [number, number, number]
  mirror[i] = mirror[i] === -1 ? 1 : -1
  return { ...cur, mirror, offset: null }
}

export function resetTransform(): ObjectTransform {
  return identityObjectTransform()
}

export function uniformScalePercent(t: ObjectTransform | undefined): number {
  return Math.round(current(t).scale[0] * 1000) / 10
}

// ---------------------------------------------------------------------------
// Primitives: generated in the browser as binary STL files, sitting on Z = 0.

function geometryToStl(geometry: THREE.BufferGeometry, header: string): Uint8Array {
  const g = geometry.index ? geometry.toNonIndexed() : geometry
  const pos = g.getAttribute('position')
  const triCount = pos.count / 3
  const buf = new ArrayBuffer(84 + triCount * 50)
  const dv = new DataView(buf)
  for (let i = 0; i < 80 && i < header.length; i++) dv.setUint8(i, header.charCodeAt(i))
  dv.setUint32(80, triCount, true)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const n = new THREE.Vector3()
  let p = 84
  for (let i = 0; i < triCount; i++) {
    a.fromBufferAttribute(pos, i * 3)
    b.fromBufferAttribute(pos, i * 3 + 1)
    c.fromBufferAttribute(pos, i * 3 + 2)
    n.copy(b).sub(a).cross(c.clone().sub(a)).normalize()
    for (const v of [n, a, b, c]) {
      dv.setFloat32(p, v.x, true)
      dv.setFloat32(p + 4, v.y, true)
      dv.setFloat32(p + 8, v.z, true)
      p += 12
    }
    dv.setUint16(p, 0, true)
    p += 2
  }
  if (g !== geometry) g.dispose()
  return new Uint8Array(buf)
}

/**
 * Welds a child's STL geometry directly into its parent's, baking the
 * child's relativeOffset (and its own scale/mirror/rotation, if any) into
 * its vertex positions before concatenating the two triangle lists into one
 * binary STL. The result is a single combined shape with no remaining
 * distinction between "parent" and "child" at the geometry level — exactly
 * what a support pillar sculpted directly into the model would produce.
 *
 * This replaces trying to keep a pillar positioned via its own separate
 * instance transform (translation/rotation/mirror sent to the engine
 * alongside the parent's). That approach hit a real, confirmed wall: the
 * slicing engine's transform protocol has no per-object Z offset, and
 * unconditionally calls ensure_on_bed() on every independent object, so a
 * pillar could never actually rise off the bed in the sliced output no
 * matter what the preview showed. Welding the geometry together sidesteps
 * that entirely — there is only ever one object, one instance transform
 * (the parent's), and ensure_on_bed() naturally drops the combined rigid
 * shape onto whichever point is now lowest, precisely like a real object
 * with an integral protrusion. Preview and slice are then guaranteed to
 * agree, since both apply the same single transform to the same geometry.
 */
export function mergeChildIntoParent(
  parentStl: ArrayBuffer,
  childStl: ArrayBuffer,
  child: { relativeOffset: [number, number, number]; scale?: [number, number, number]; mirror?: [number, number, number]; rotation?: [number, number, number] },
): Uint8Array {
  const loader = new STLLoader()
  const parentGeo = loader.parse(parentStl)
  const childGeo = loader.parse(childStl)

  const { relativeOffset, scale = [1, 1, 1], mirror = [1, 1, 1], rotation = [0, 0, 0] } = child
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2], 'ZYX'))
  const s = new THREE.Vector3(scale[0] * mirror[0], scale[1] * mirror[1], scale[2] * mirror[2])
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...relativeOffset), q, s)
  childGeo.applyMatrix4(m)

  // Both are STLLoader output, which is always non-indexed (binary STL has
  // no indexing concept — just a flat triangle list) — a plain concat of the
  // position arrays is a valid combined triangle soup with no further work.
  const pPos = parentGeo.getAttribute('position') as THREE.BufferAttribute
  const cPos = childGeo.getAttribute('position') as THREE.BufferAttribute
  const combinedArray = new Float32Array(pPos.array.length + cPos.array.length)
  combinedArray.set(pPos.array as Float32Array, 0)
  combinedArray.set(cPos.array as Float32Array, pPos.array.length)
  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.BufferAttribute(combinedArray, 3))

  const result = geometryToStl(merged, 'merged')
  parentGeo.dispose()
  childGeo.dispose()
  merged.dispose()
  return result
}

/** The subset of QueueItem that buildMergedStlForItem needs — kept minimal
 *  and structural (rather than importing QueueItem itself) so this stays
 *  usable from a plain array of preview models too, not just the queue. */
export interface MergeableItem {
  id: string
  stlFile: File | null
  parentId?: string
  relativeOffset?: [number, number, number]
  transform?: ObjectTransform
}

/**
 * Builds the fully-merged STL bytes for one item, welding in every
 * descendant's geometry (see mergeChildIntoParent's own comment for why) —
 * recursively, so a pillar clicked onto another pillar (pillarPickOn's
 * raycast allows this; it doesn't distinguish an uploaded model from a
 * previously-placed pillar) still ends up correctly nested: each level's
 * children are merged into its own geometry first, so by the time that
 * level itself gets merged into *its* parent, its already-attached
 * grandchildren travel with it for free — one recursive pass handles any
 * depth without needing a separate multi-pass cascade the way the
 * old (now-removed) transform-based approach did.
 *
 * Safe to call for an item with no children at all — it just resolves to
 * that item's own STL bytes unchanged, so callers don't need a separate
 * "does this item have children" branch before deciding whether to merge.
 */
export async function buildMergedStlForItem(rootId: string, items: MergeableItem[]): Promise<ArrayBuffer> {
  const byId = new Map(items.map((i) => [i.id, i]))
  const childrenByParent = new Map<string, MergeableItem[]>()
  for (const item of items) {
    if (!item.parentId) continue
    const list = childrenByParent.get(item.parentId)
    if (list) list.push(item)
    else childrenByParent.set(item.parentId, [item])
  }

  async function build(id: string): Promise<ArrayBuffer> {
    const item = byId.get(id)
    if (!item?.stlFile) throw new Error(`buildMergedStlForItem: no STL data for item ${id}`)
    let bytes: ArrayBuffer = await item.stlFile.arrayBuffer()
    for (const child of childrenByParent.get(id) ?? []) {
      if (!child.relativeOffset) continue // shouldn't happen for a real pillar, but never let a malformed child abort the whole merge
      const childBytes = await build(child.id)
      const merged = mergeChildIntoParent(bytes, childBytes, {
        relativeOffset: child.relativeOffset,
        scale: child.transform?.scale,
        mirror: child.transform?.mirror,
        rotation: child.transform?.rotation,
      })
      bytes = merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength) as ArrayBuffer
    }
    return bytes
  }

  return build(rootId)
}

export function boxStl(x: number, y: number, z: number): Uint8Array {
  const geometry = new THREE.BoxGeometry(x, y, z)
  geometry.translate(0, 0, z / 2)
  const stl = geometryToStl(geometry, `CraftBot 2 box ${x}x${y}x${z} mm`)
  geometry.dispose()
  return stl
}

export function cylinderStl(diameter: number, height: number, segments = 96): Uint8Array {
  const geometry = new THREE.CylinderGeometry(diameter / 2, diameter / 2, height, segments)
  geometry.rotateX(Math.PI / 2) // three.js cylinders are Y-up; the bed is Z-up
  geometry.translate(0, 0, height / 2)
  const stl = geometryToStl(geometry, `CraftBot 2 cylinder d${diameter} h${height} mm`)
  geometry.dispose()
  return stl
}

export function sphereStl(diameter: number, segments = 48): Uint8Array {
  const geometry = new THREE.SphereGeometry(diameter / 2, segments, Math.max(8, Math.round(segments / 2)))
  geometry.translate(0, 0, diameter / 2) // sits on Z = 0, matching the other primitives
  const stl = geometryToStl(geometry, `CraftBot 2 sphere d${diameter} mm`)
  geometry.dispose()
  return stl
}

/**
 * A tapered cone, wide at the base and narrow at the top — for use as a
 * manual, hand-placed support column under a specific overhang. The engine
 * bridge has no path for real support-blocker/enforcer *volumes* (confirmed
 * by reading orca-wasm/bridge/slicer.cpp: even its 3MF import merges every
 * volume into one flat mesh before any config or slicing step ever sees it —
 * volume-type metadata has nowhere to survive to). A pillar sidesteps that
 * entirely by being an ordinary, separate solid on the plate, printed
 * alongside the part exactly like any other object — the same technique
 * people use with any slicer when auto-support isn't the right tool for one
 * specific spot. The taper is deliberate: a narrow tip means less contact
 * area on the part, which snaps off after printing far more easily than a
 * uniform cylinder would.
 */
export function supportPillarStl(baseDiameter: number, topDiameter: number, height: number, segments = 48): Uint8Array {
  const geometry = new THREE.CylinderGeometry(topDiameter / 2, baseDiameter / 2, height, segments)
  geometry.rotateX(Math.PI / 2)
  geometry.translate(0, 0, height / 2)
  const stl = geometryToStl(geometry, `CraftBot 2 support pillar d${baseDiameter}-${topDiameter} h${height} mm`)
  geometry.dispose()
  return stl
}

export function primitiveFile(kind: 'box' | 'cylinder' | 'sphere' | 'pillar', dims: number[]): File {
  switch (kind) {
    case 'box':
      return new File(
        [boxStl(dims[0], dims[1], dims[2]).buffer as ArrayBuffer],
        `kube-${dims[0]}x${dims[1]}x${dims[2]}mm.stl`,
        { type: 'model/stl' },
      )
    case 'cylinder':
      return new File([cylinderStl(dims[0], dims[1]).buffer as ArrayBuffer], `sylinder-d${dims[0]}-h${dims[1]}mm.stl`, {
        type: 'model/stl',
      })
    case 'sphere':
      return new File([sphereStl(dims[0]).buffer as ArrayBuffer], `kule-d${dims[0]}mm.stl`, { type: 'model/stl' })
    case 'pillar':
      return new File(
        [supportPillarStl(dims[0], dims[1], dims[2]).buffer as ArrayBuffer],
        `stotte-d${dims[0]}-${dims[1]}-h${dims[2]}mm.stl`,
        { type: 'model/stl' },
      )
  }
}
