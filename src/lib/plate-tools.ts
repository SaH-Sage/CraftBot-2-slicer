import * as THREE from 'three'
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
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(t.rotation[0], t.rotation[1], t.rotation[2], 'XYZ'))
}

function withRotation(t: ObjectTransform, q: THREE.Quaternion): ObjectTransform {
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ')
  const clean = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v)
  return { ...t, rotation: [clean(e.x), clean(e.y), clean(e.z)], offset: null }
}

export function current(t: ObjectTransform | undefined): ObjectTransform {
  return t ?? identityObjectTransform()
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

export function primitiveFile(kind: 'box' | 'cylinder', dims: number[]): File {
  const bytes = kind === 'box' ? boxStl(dims[0], dims[1], dims[2]) : cylinderStl(dims[0], dims[1])
  const name = kind === 'box' ? `kube-${dims[0]}x${dims[1]}x${dims[2]}mm.stl` : `sylinder-d${dims[0]}-h${dims[1]}mm.stl`
  return new File([bytes.buffer as ArrayBuffer], name, { type: 'model/stl' })
}
