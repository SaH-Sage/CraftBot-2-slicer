import * as THREE from 'three'

/**
 * Tick marks for the rotate gizmo's rings, at every `stepDeg` around the
 * circle — the visual "snap lines" a ring alone doesn't have (three.js's
 * TransformControls snaps the drag to `rotationSnap` but draws a plain,
 * unmarked circle regardless).
 *
 * These are built to sit as extra children of the same internal group that
 * holds the real per-axis ring meshes (TransformControlsGizmo.gizmo.rotate),
 * baked with the identical transform recipe the library itself uses to lay
 * out each ring — see CircleGeometry() and the gizmoRotate map in
 * three/examples/jsm/controls/TransformControls.js. Doing it that way means
 * these ticks inherit the gizmo's own per-frame screen-space scaling,
 * repositioning and axis-highlight colouring for free, instead of tracking
 * the camera and the attached object ourselves.
 */

export const RING_RADIUS = 0.5

/** How far a tick extends past the ring, and which multiples get a longer one. */
const TICK_LENGTHS: { everyDeg: number; length: number }[] = [
  { everyDeg: 90, length: 0.16 }, // cardinal
  { everyDeg: 45, length: 0.11 }, // diagonal
  { everyDeg: 0, length: 0.07 }, // every remaining step (0 = "always matches")
]

function tickLengthFor(angleDeg: number): number {
  const norm = ((angleDeg % 360) + 360) % 360
  for (const { everyDeg, length } of TICK_LENGTHS) {
    if (everyDeg === 0) return length
    if (Math.abs(norm % everyDeg) < 1e-6) return length
  }
  return TICK_LENGTHS[TICK_LENGTHS.length - 1].length
}

/**
 * Builds tick-mark line geometry for one axis's ring. `stepDeg` of 0 (or
 * falsy) returns an empty geometry — nothing to mark when snapping is off —
 * rather than something callers must separately hide: TransformControls
 * force-sets `visible = true` on every child of its rotate group every
 * frame, so toggling `.visible` from outside would just be overwritten.
 */
export function buildAxisTickGeometry(axis: 'X' | 'Y' | 'Z', stepDeg: number, radius: number = RING_RADIUS): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  const step = Math.abs(stepDeg)
  if (!step || step >= 360) {
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))
    return geometry
  }

  const count = Math.round(360 / step)
  const positions = new Float32Array(count * 2 * 3) // 2 points (inner, outer) per tick, 3 floats each
  for (let i = 0; i < count; i++) {
    const angleDeg = i * step
    const len = tickLengthFor(angleDeg)
    const a = (angleDeg * Math.PI) / 180
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    const o = i * 6
    // Built in the XY plane first — the same starting point CircleGeometry's
    // own TorusGeometry(...) has before its two baked-in rotations below.
    positions[o] = cos * radius
    positions[o + 1] = sin * radius
    positions[o + 2] = 0
    positions[o + 3] = cos * (radius + len)
    positions[o + 4] = sin * (radius + len)
    positions[o + 5] = 0
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  // Exactly CircleGeometry()'s own bake (TransformControls.js): the ring
  // starts in the XY plane and is rotated into its true resting orientation
  // before any axis-specific placement.
  geometry.rotateY(Math.PI / 2)
  geometry.rotateX(Math.PI / 2)

  // Then the same per-axis extra rotation the library applies to X/Y/Z's
  // own ring mesh in the gizmoRotate map — X gets none, so it is omitted.
  if (axis === 'Y') geometry.rotateZ(-Math.PI / 2)
  if (axis === 'Z') geometry.rotateY(Math.PI / 2)

  return geometry
}

/**
 * A LineSegments mesh for one axis, named to match the library's own ring
 * ('X' | 'Y' | 'Z') so it is swept into the same per-frame position/scale
 * update, visibility rules (showX/showY/showZ, hide-while-a-different-axis-
 * is-active) and active-axis highlight colour as the real ring — see
 * TransformControlsGizmo.updateMatrixWorld. Each axis needs its own material
 * instance: that highlight logic caches and mutates `material.color`
 * directly, so a shared material would make every axis flash together.
 */
export function createAxisTickLines(axis: 'X' | 'Y' | 'Z', stepDeg: number, color: THREE.ColorRepresentation): THREE.LineSegments {
  const geometry = buildAxisTickGeometry(axis, stepDeg)
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false, depthTest: false })
  const lines = new THREE.LineSegments(geometry, material)
  lines.name = axis
  lines.renderOrder = Infinity
  return lines
}
