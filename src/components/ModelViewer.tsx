import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { ViewHelper } from 'three/addons/helpers/ViewHelper.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { buildFaceAdjacency, floodFillCoplanar, type FaceAdjacency } from '../lib/face-highlight'
import { buildAxisTickGeometry, createAxisTickLines } from '../lib/rotate-gizmo-ticks'
import { isWebGLAvailable } from '../lib/webgl'
import type { ObjectTransform } from '../types'

/**
 * Camera position/target survives across tabs, not just across one
 * instance's own re-renders. The Model, Settings, and Slice tabs each mount
 * their own separate ModelViewer instance — a plain useRef would only
 * remember the view within a single instance's lifetime, so switching tabs
 * (or opening the result card, which mounts its own fresh viewer) would
 * still reset the camera even though a transform commit alone would not.
 * Keyed by the same model-set+bed key used below, so different plates don't
 * share a view that makes no sense for them.
 */
const sharedCameraMemory = new Map<string, { position: THREE.Vector3; target: THREE.Vector3 }>()

export interface ModelPreview {
  id: string
  file: File
  transform?: ObjectTransform
}

interface Props {
  /** One or more STL files to preview together. */
  files: File[]
  /** Optional stable IDs and engine-side transforms for the current plate. */
  models?: ModelPreview[]
  /** Bed width (X axis) in mm — default 256 */
  bedX?: number
  /** Bed depth (Y axis) in mm — default 256 */
  bedY?: number
  /** Bed shape — 'circle' for delta/round printers, default 'rectangle' */
  bedShape?: 'rectangle' | 'circle'
  /** Model id currently waiting for a face pick, or null/undefined for normal orbit behaviour.
   *  Hover highlighting and click-to-pick are both restricted to this model. */
  pickTargetId?: string | null
  /** Picked face: model id and the face's outward normal in world space. */
  onPickFace?: (id: string, normal: [number, number, number]) => void
  /** Transformed size (mm) of every rendered model, keyed by model id. */
  onBounds?: (sizes: Record<string, [number, number, number]>) => void
  /** Model id currently attached to the on-model rotate gizmo, or null/undefined. */
  rotateTargetId?: string | null
  /** Rotation snap for the gizmo, in degrees. 0/undefined means free (unsnapped) rotation. */
  rotationSnapDeg?: number
  /** Fired once a rotate-gizmo drag finishes, with the model's resulting Euler XYZ rotation
   *  in radians — a full replacement for that model's ObjectTransform.rotation, in the same
   *  convention plate-tools.ts's own rotate functions use. Not fired continuously during the
   *  drag: committing to React state on every frame would rebuild this whole WebGL scene
   *  (and the gizmo along with it) mid-gesture, since ObjectTransform flows back in as a prop. */
  onRotateEnd?: (id: string, rotation: [number, number, number]) => void
  /** Model id currently attached to the move (translate) gizmo, or null/undefined. */
  moveTargetId?: string | null
  /** Fired once a move-gizmo drag finishes, with the model's resulting X/Y position in mm
   *  (bed-relative, matching ObjectTransform.offset's convention directly — the mesh's own
   *  position already lives in that space). Not continuous, for the same reason as onRotateEnd. */
  onMoveEnd?: (id: string, offset: [number, number]) => void
  /** Lets this component's own quick-toggle buttons (bottom-left overlay) drive the same
   *  pick/rotate/move state that TransformPanel's per-model buttons do, so either can be used
   *  interchangeably and turning one on always turns the other two off. */
  onSetInteractionMode?: (mode: 'pick' | 'rotate' | 'move' | null, id: string | null) => void
  /** Which model the quick-toggle buttons (and an active mode) apply to, independent of
   *  whether any mode is currently on — the fallback before anything's been clicked. */
  selectedModelId?: string | null
  /** Fired when a plain click (no mode active, not a drag, not the gizmo) lands on a
   *  model's surface — lets the view itself drive selection, not just TransformPanel. */
  onSelectModel?: (id: string) => void
  /** Whether "click a point to drop a pillar there" is the currently active mode. */
  pillarPickOn?: boolean
  /** Fired with the world-space (x, y, z) of a click on any model's surface while
   *  pillarPickOn is active — z is the pillar's required height, since it always
   *  stands on the bed at z=0. */
  onPillarPick?: (point: [number, number, number]) => void
  /** Toggles pillarPickOn — wired to the "Add pillar" quick-toggle button in the view. */
  onTogglePillarPick?: () => void
}

function buildBed(scene: THREE.Scene, bedX: number, bedY: number, bedShape: 'rectangle' | 'circle'): THREE.Object3D[] {
  const disposables: THREE.Object3D[] = []

  if (bedShape === 'circle') {
    const radius = Math.min(bedX, bedY) / 2

    // CircleGeometry is in XY plane by default — correct for Z-up
    const bedGeo = new THREE.CircleGeometry(radius, 64)
    const bedMat = new THREE.MeshPhongMaterial({ color: 0xe2e8f0, side: THREE.DoubleSide })
    const bed = new THREE.Mesh(bedGeo, bedMat)
    bed.receiveShadow = true
    scene.add(bed)
    disposables.push(bed)

    const gridDiv = Math.max(4, Math.round((radius * 2) / 10))
    const grid = new THREE.GridHelper(radius * 2, gridDiv, 0xcccccc, 0xdde3ed)
    grid.rotateX(Math.PI / 2) // rotate from XZ plane to XY plane (Z-up floor)
    grid.position.z = 0.1
    scene.add(grid)
    disposables.push(grid)

    // Circle border in XY plane (Z-up)
    const points: THREE.Vector3[] = []
    const segs = 64
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2
      points.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0.2))
    }
    const borderGeo = new THREE.BufferGeometry().setFromPoints(points)
    const borderMat = new THREE.LineBasicMaterial({ color: 0xb0bec5 })
    const border = new THREE.Line(borderGeo, borderMat)
    scene.add(border)
    disposables.push(border)
  } else {
    // PlaneGeometry is in XY plane by default — correct for Z-up
    const bedGeo = new THREE.PlaneGeometry(bedX, bedY)
    const bedMat = new THREE.MeshPhongMaterial({ color: 0xe2e8f0, side: THREE.DoubleSide })
    const bed = new THREE.Mesh(bedGeo, bedMat)
    bed.receiveShadow = true
    scene.add(bed)
    disposables.push(bed)

    const gridDiv = Math.round(Math.max(bedX, bedY) / 10)
    const grid = new THREE.GridHelper(Math.max(bedX, bedY), gridDiv, 0xcccccc, 0xdde3ed)
    grid.scale.set(bedX / Math.max(bedX, bedY), 1, bedY / Math.max(bedX, bedY))
    grid.rotateX(Math.PI / 2) // rotate from XZ plane to XY plane (Z-up floor)
    grid.position.z = 0.1
    scene.add(grid)
    disposables.push(grid)

    const innerBoxGeo = new THREE.BoxGeometry(bedX, bedY, 0.5)
    const edgeGeo = new THREE.EdgesGeometry(innerBoxGeo)
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xb0bec5 })
    const border = new THREE.LineSegments(edgeGeo, edgeMat)
    scene.add(border)
    disposables.push(border)
  }

  return disposables
}

/**
 * Upper bound on how many models the preview will parse and draw at once.
 * Every file here is decoded by STLLoader on the main thread, so an unbounded
 * queue of large STLs would lock up the UI just to render a thumbnail-grade
 * preview; beyond a dozen or so objects the grid isn't legible anyway. The
 * excess is reported through the notice banner rather than dropped silently.
 */
const MAX_PREVIEW_MODELS = 12

function applyTransform(mesh: THREE.Mesh, transform: ObjectTransform | undefined): void {
  if (!transform) return
  mesh.scale.set(
    transform.scale[0] * transform.mirror[0],
    transform.scale[1] * transform.mirror[1],
    transform.scale[2] * transform.mirror[2],
  )
  // 'ZYX', not three.js's default 'XYZ': matches plate-tools.ts's decomposition
  // order, which in turn matches the slicing engine's own rotation convention
  // (R = Rz*Ry*Rx, confirmed empirically against the real engine — see the
  // comment on withRotation in plate-tools.ts). Setting .order here means every
  // later read of mesh.rotation — including the rotate gizmo's own live drag,
  // which writes mesh.quaternion directly — decomposes the same way too.
  mesh.rotation.order = 'ZYX'
  mesh.rotation.set(transform.rotation[0], transform.rotation[1], transform.rotation[2])
}

export function ModelViewer({
  files,
  models,
  bedX = 256,
  bedY = 256,
  bedShape = 'rectangle',
  pickTargetId,
  onPickFace,
  onBounds,
  rotateTargetId,
  rotationSnapDeg,
  onRotateEnd,
  moveTargetId,
  onMoveEnd,
  onSetInteractionMode,
  selectedModelId,
  onSelectModel,
  pillarPickOn,
  onPillarPick,
  onTogglePillarPick,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  // Read through a ref so toggling pick/rotate/move mode does not rebuild the scene.
  const pickRef = useRef({
    pickTargetId,
    onPickFace,
    onBounds,
    rotateTargetId,
    rotationSnapDeg,
    onRotateEnd,
    moveTargetId,
    onMoveEnd,
    selectedModelId,
    onSelectModel,
    pillarPickOn,
    onPillarPick,
  })
  pickRef.current = {
    pickTargetId,
    onPickFace,
    onBounds,
    rotateTargetId,
    rotationSnapDeg,
    onRotateEnd,
    moveTargetId,
    onMoveEnd,
    selectedModelId,
    onSelectModel,
    pillarPickOn,
    onPillarPick,
  }
  // Blocking: nothing could be drawn, so the overlay covering the canvas is
  // the whole content. Distinct from `notice` below, which annotates a
  // preview that did render and so must not hide it.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const fileModels = useMemo(() => files.map((file, index) => ({ id: `file-${index}`, file })), [files])
  const previewModels = models ?? fileModels

  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    if (!isWebGLAvailable()) {
      setLoadError('3D preview unavailable in this browser')
      return
    }
    setLoadError(null)
    setNotice(null)

    // Falls back to the viewer's own target aspect (1080x810 = 4:3) rather
    // than trusting clientWidth/Height to already be settled — on the very
    // first paint, especially now that this mounts before any file exists,
    // the container can still be mid-layout, and 0/0 here would hand three.js
    // a NaN aspect ratio and a dead canvas. The ResizeObserver below corrects
    // to the real size within a frame regardless; this only covers that gap.
    const w = el.clientWidth || 1080
    const h = el.clientHeight || 810

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf8fafc)

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 10000)
    camera.up.set(0, 0, 1) // Z-up to match engine coordinate system

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(w, h)
    renderer.shadowMap.enabled = true
    // ViewHelper draws itself with its own renderer.render() call, into a small
    // viewport in the corner (see its render() in the addon source). A clear
    // triggered by that second call ignores the viewport — it hits the whole
    // canvas, since nothing here enables the scissor test to restrict it — so
    // with the default autoClear=true it would wipe out the main scene this
    // renderer just drew, leaving only that corner widget behind. Clearing
    // exactly once per frame, ourselves, at the top of the loop avoids that.
    renderer.autoClear = false
    el.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(100, 100, 200) // Z-up: light comes from above (high Z)
    dirLight.castShadow = true
    scene.add(dirLight)
    const fillLight = new THREE.DirectionalLight(0x8ab4f8, 0.3)
    fillLight.position.set(-100, -100, -50)
    scene.add(fillLight)

    const bedObjects = buildBed(scene, bedX, bedY, bedShape)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 10
    controls.maxDistance = 5000

    // Computed here (not just below, next to the STL loading) so the very
    // first frame — before any file has even started parsing — already
    // shows a sensible view: the remembered one if this exact plate has been
    // seen before, otherwise the empty bed framed on its own size. Without
    // this, the camera would sit at Three's raw (0,0,0) default until the
    // loading promise resolves, which is what made the view feel like it
    // only "existed" once a model came in.
    const shown = previewModels.slice(0, MAX_PREVIEW_MODELS)
    const cameraMemoryKey = `${shown.map((m) => m.id).sort().join(',')}|${bedX}|${bedY}|${bedShape}`
    const remembered0 = sharedCameraMemory.get(cameraMemoryKey)
    if (remembered0) {
      camera.position.copy(remembered0.position)
      controls.target.copy(remembered0.target)
    } else {
      const bedMaxDim = Math.max(bedX, bedY, 10)
      const dist = (bedMaxDim * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 4)
      const viewDir = new THREE.Vector3(0.6, -1, 0.7).normalize()
      controls.target.set(0, 0, 0)
      camera.position.copy(controls.target).addScaledVector(viewDir, dist)
    }
    controls.update()

    // Orientation gizmo (top-right): shows current camera orientation, click an
    // axis to snap the view to it. three.js's own widget — same one used in the
    // three.js editor. It does not support dragging the widget itself to orbit;
    // that's already covered by dragging anywhere else in the viewport via
    // OrbitControls above.
    const viewHelper = new ViewHelper(camera, renderer.domElement)
    viewHelper.setLabels('X', 'Y', 'Z')
    viewHelper.location = { top: 12, right: 12, bottom: 0, left: null }

    // On-model rotate gizmo: three.js's own object-manipulation widget, the
    // same one DCC tools like Blender use. Rotates the attached mesh directly;
    // the resulting orientation is read back into ObjectTransform once the
    // drag ends (see onRotateEnd below), not continuously — see the prop doc.
    const rotateGizmo = new TransformControls(camera, renderer.domElement)
    rotateGizmo.setMode('rotate')
    rotateGizmo.setSpace('world') // matches plate-tools.ts's rotateAboutWorldAxis / the +-90 buttons
    rotateGizmo.setSize(1.5)
    const rotateHelper = rotateGizmo.getHelper()
    scene.add(rotateHelper)

    // Snap-degree tick marks on each ring. Reached only through public
    // Object3D APIs (getHelper()'s children + the documented
    // isTransformControlsGizmo flag) plus TransformControlsGizmo's own
    // publicly typed .gizmo.rotate group — no underscore-prefixed internals.
    // Added as siblings of the library's own X/Y/Z ring meshes, named to
    // match them, so TransformControlsGizmo's own per-frame update sweeps
    // these up too: same screen-space scaling, same show/hide and highlight-
    // on-hover behaviour the rings already get, for free.
    const gizmoObj = rotateHelper.children.find((c) => (c as { isTransformControlsGizmo?: boolean }).isTransformControlsGizmo) as
      | (THREE.Object3D & { gizmo: { rotate: THREE.Object3D } })
      | undefined
    const rotateRingGroup = gizmoObj?.gizmo.rotate
    const tickColors: Record<'X' | 'Y' | 'Z', number> = { X: 0xff2060, Y: 0x20e070, Z: 0x2090ff }
    const tickLines =
      rotateRingGroup &&
      (['X', 'Y', 'Z'] as const).map((axis) => {
        const lines = createAxisTickLines(axis, 0, tickColors[axis])
        rotateRingGroup.add(lines)
        return lines
      })
    let tickSnapDeg = 0

    let attachedRotateId: string | null = null
    rotateGizmo.addEventListener('dragging-changed', (event) => {
      // Exactly the same one-owner-per-frame handoff as the ViewHelper snap
      // animation above: while a rotate drag is live, OrbitControls must not
      // also try to interpret the same pointer events as an orbit.
      controls.enabled = !event.value
      if (event.value === false && attachedRotateId && pickRef.current.onRotateEnd) {
        const e = rotateGizmo.object!.rotation
        pickRef.current.onRotateEnd(attachedRotateId, [e.x, e.y, e.z])
      }
    })

    // Move gizmo: slides the attached mesh across the bed. World space (not
    // local) keeps the arrows aligned with the bed's own X/Y regardless of
    // whatever rotation the object currently has — "move along bed X" should
    // mean the same thing before and after a Free Rotate. Z, and the two
    // Z-involving plane handles, are hidden outright: lifting a print off the
    // bed isn't a placement this app supports, so the gizmo simply doesn't
    // offer it, rather than allowing a drag whose result would be discarded.
    const moveGizmo = new TransformControls(camera, renderer.domElement)
    moveGizmo.setMode('translate')
    moveGizmo.setSpace('world')
    moveGizmo.showZ = false
    moveGizmo.showYZ = false
    moveGizmo.showXZ = false
    scene.add(moveGizmo.getHelper())
    let attachedMoveId: string | null = null
    let highlightedSelectionId: string | null = null
    moveGizmo.addEventListener('dragging-changed', (event) => {
      controls.enabled = !event.value
      if (event.value === false && attachedMoveId && pickRef.current.onMoveEnd) {
        const p = moveGizmo.object!.position
        pickRef.current.onMoveEnd(attachedMoveId, [p.x, p.y])
      }
    })

    // Face picking (place-on-face). A click, not a drag, so orbiting still works.
    // A highlight overlay shows which face is under the cursor before the click commits it.
    const raycaster = new THREE.Raycaster()
    // Highlight overlay: the flat patch under the cursor (flood-filled from the
    // hit triangle out to its coplanar neighbours — see lib/face-highlight.ts),
    // plus a small fixed-size disc at the exact hit point. The patch alone
    // isn't enough on a real-world STL: a flat face reads clearly, but a
    // single triangle on fine, curved detail (e.g. a thread) can be a
    // fraction of a square micrometre — technically highlighted, invisibly
    // so. The disc guarantees a visible marker everywhere, and the patch
    // adds the true face outline whenever there is one worth showing.
    const highlightMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    })
    const patchGeometry = new THREE.BufferGeometry()
    const patchMesh = new THREE.Mesh(patchGeometry, highlightMat)
    patchMesh.visible = false
    patchMesh.renderOrder = 999
    scene.add(patchMesh)

    const cursorGeometry = new THREE.CircleGeometry(1.4, 24)
    const cursorMesh = new THREE.Mesh(cursorGeometry, highlightMat.clone())
    ;(cursorMesh.material as THREE.MeshBasicMaterial).opacity = 0.85
    cursorMesh.visible = false
    cursorMesh.renderOrder = 1000
    scene.add(cursorMesh)

    function pickableTarget(): THREE.Mesh[] {
      const id = pickRef.current.pickTargetId
      if (!id) return []
      return meshes.filter((m) => m.userData.modelId === id)
    }
    function raycastAt(clientX: number, clientY: number) {
      const rect = renderer.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      return raycaster.intersectObjects(pickableTarget(), false)[0]
    }
    // Unscoped version for pillar-picking and click-to-select: any model on
    // the plate is a valid hit, not just whichever one Place on face is
    // currently restricted to.
    function raycastAny(clientX: number, clientY: number) {
      const rect = renderer.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      return raycaster.intersectObjects(meshes, false)[0]
    }

    // Recomputing the flood-fill is the one non-trivial cost here; skip it
    // when the pointer is still over the same triangle it was last frame.
    let cachedMesh: THREE.Mesh | null = null
    let cachedSeed = -1
    let cachedPatch: number[] = []
    function updatePatchGeometry(hit: THREE.Intersection, worldNormal: THREE.Vector3) {
      const mesh = hit.object as THREE.Mesh
      const adjacency = mesh.userData.faceAdjacency as FaceAdjacency | null | undefined
      const seed = hit.faceIndex ?? -1
      let patch: number[]
      if (adjacency && mesh === cachedMesh && seed === cachedSeed) {
        patch = cachedPatch
      } else if (adjacency && seed >= 0) {
        patch = floodFillCoplanar(adjacency, seed)
        cachedMesh = mesh
        cachedSeed = seed
        cachedPatch = patch
      } else {
        patch = seed >= 0 ? [seed] : []
      }
      const pos = mesh.geometry.getAttribute('position')
      const arr = new Float32Array(patch.length * 9)
      const v = new THREE.Vector3()
      const n = new THREE.Vector3()
      patch.forEach((t, pi) => {
        for (let k = 0; k < 3; k++) {
          v.fromBufferAttribute(pos, t * 3 + k)
          n.set(0, 0, 1)
          if (adjacency) n.set(adjacency.normals[t * 3], adjacency.normals[t * 3 + 1], adjacency.normals[t * 3 + 2])
          n.transformDirection(mesh.matrixWorld).normalize()
          v.applyMatrix4(mesh.matrixWorld).addScaledVector(n, 0.05)
          arr[pi * 9 + k * 3] = v.x
          arr[pi * 9 + k * 3 + 1] = v.y
          arr[pi * 9 + k * 3 + 2] = v.z
        }
      })
      patchGeometry.setAttribute('position', new THREE.BufferAttribute(arr, 3))
      patchGeometry.attributes.position.needsUpdate = true
      patchGeometry.computeBoundingSphere()
      // Only worth drawing the patch shape when it covers more than the
      // cursor disc already does — otherwise it's the same single sliver
      // the disc is there to compensate for, doubled up for no benefit.
      patchMesh.visible = patch.length > 1
      // Point the disc's local +Z (its natural facing direction) along the
      // world hit normal, and sit it at the exact hit point.
      cursorMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldNormal)
      cursorMesh.position.copy(hit.point).addScaledVector(worldNormal, 0.06)
      cursorMesh.visible = true
    }

    let downAt: { x: number; y: number } | null = null
    const onPointerDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY }
    }
    const onPointerMove = (e: PointerEvent) => {
      if (rotateGizmo.dragging || moveGizmo.dragging) {
        if (patchMesh.visible || cursorMesh.visible) {
          patchMesh.visible = false
          cursorMesh.visible = false
        }
        return
      }
      if (pickRef.current.pillarPickOn) {
        // Same disc marker as Place on face, minus the flood-filled patch —
        // that's specifically for showing a flat face's extent, meaningless
        // for "here's the single point a pillar would rise from".
        const hit = raycastAny(e.clientX, e.clientY)
        renderer.domElement.style.cursor = hit ? 'pointer' : 'crosshair'
        patchMesh.visible = false
        if (hit && hit.face) {
          const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
          cursorMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldNormal)
          cursorMesh.position.copy(hit.point).addScaledVector(worldNormal, 0.06)
          cursorMesh.visible = true
        } else {
          cursorMesh.visible = false
        }
        return
      }
      if (!pickRef.current.pickTargetId) {
        if (patchMesh.visible || cursorMesh.visible) {
          patchMesh.visible = false
          cursorMesh.visible = false
        }
        return
      }
      const hit = raycastAt(e.clientX, e.clientY)
      renderer.domElement.style.cursor = hit ? 'pointer' : 'crosshair'
      if (!hit || !hit.face) {
        patchMesh.visible = false
        cursorMesh.visible = false
        return
      }
      const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
      updatePatchGeometry(hit, worldNormal)
    }
    const onPointerUp = (e: PointerEvent) => {
      const start = downAt
      downAt = null
      // Only a genuine click (not the release-point of a drag-orbit gesture that
      // happened to end up over the gizmo's corner) can trigger the gizmo,
      // pillar-picking, face picking, or selection — all four read a specific
      // point, and a drag's end point is incidental, not a choice.
      const wasClick = !!start && Math.hypot(e.clientX - start.x, e.clientY - start.y) <= 4
      if (rotateGizmo.dragging || moveGizmo.dragging) return
      if (wasClick && viewHelper.handleClick(e)) return
      if (!wasClick) return

      if (pickRef.current.pillarPickOn) {
        const hit = raycastAny(e.clientX, e.clientY)
        if (hit && pickRef.current.onPillarPick) pickRef.current.onPillarPick([hit.point.x, hit.point.y, hit.point.z])
        return
      }

      if (pickRef.current.pickTargetId && pickRef.current.onPickFace) {
        const hit = raycastAt(e.clientX, e.clientY)
        if (hit && hit.face) {
          const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
          const id = (hit.object as THREE.Mesh).userData.modelId as string | undefined
          if (id) pickRef.current.onPickFace(id, [normal.x, normal.y, normal.z])
        }
        return
      }

      // Fallback: no mode consumed the click, so it's a plain selection —
      // an already-active mode (rotate/move) follows the new pick via
      // onSelectModel's own logic in App.tsx, rather than being ignored.
      if (pickRef.current.onSelectModel) {
        const hit = raycastAny(e.clientX, e.clientY)
        const id = hit ? ((hit.object as THREE.Mesh).userData.modelId as string | undefined) : undefined
        if (id) pickRef.current.onSelectModel(id)
      }
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointerleave', () => {
      patchMesh.visible = false
      cursorMesh.visible = false
    })

    const loader = new STLLoader()
    const meshes: THREE.Mesh[] = []
    const material = new THREE.MeshPhongMaterial({
      color: 0x0a84ff,
      specular: 0x222222,
      shininess: 30,
      side: THREE.DoubleSide,
    })
    let cancelled = false

    const skippedCount = previewModels.length - shown.length

    void Promise.all(
      shown.map(async (model) => {
        try {
          const buffer = await model.file.arrayBuffer()
          const geometry = loader.parse(buffer)
          geometry.computeBoundingBox()
          const box = geometry.boundingBox
          if (!box) return null
          return { geometry, box, model }
        } catch {
          return null
        }
      }),
    ).then((results) => {
      const loaded = results.filter(
        (r): r is { geometry: THREE.BufferGeometry; box: THREE.Box3; model: ModelPreview } => r !== null,
      )
      if (cancelled) {
        // Unmounted (or the file set changed) while these were decoding —
        // none of them ever reached the scene, so nothing else will free them.
        for (const { geometry } of loaded) geometry.dispose()
        return
      }
      const failedCount = results.length - loaded.length
      if (loaded.length === 0) {
        setLoadError(failedCount > 0 ? 'Could not read this model file' : null)
        // Camera framing for this case (no models at all) is already handled
        // synchronously at effect setup, above — nothing further to do here.
        return
      }
      // Everything below this point renders, so any complaint has to be a
      // non-blocking notice — an overlay here would hide the models that did
      // load behind a message about the ones that didn't.
      const notices = [
        failedCount > 0 ? `${failedCount} of ${results.length} files could not be read` : null,
        skippedCount > 0 ? `showing the first ${shown.length} of ${previewModels.length} models` : null,
      ].filter((n): n is string => n !== null)
      if (notices.length > 0) setNotice(notices.join(' · '))

      // Centre every raw mesh like the bridge does before applying the
      // instance transform. Models without an explicit arranged offset still
      // use a small fallback grid so a freshly uploaded plate remains legible.
      const transformed = loaded.map(({ geometry, box, model }) => {
        const center = box.getCenter(new THREE.Vector3())
        geometry.translate(-center.x, -center.y, -box.min.z)
        // Its own material clone, not the shared instance — selection
        // highlighting (below) tints one mesh at a time via emissive color,
        // which would bleed onto every model at once if they shared one.
        const mesh = new THREE.Mesh(geometry, material.clone())
        mesh.castShadow = true
        mesh.userData.modelId = model.id
        mesh.userData.faceAdjacency = buildFaceAdjacency(geometry)
        applyTransform(mesh, model.transform)
        mesh.updateMatrixWorld(true)
        const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3())
        return { mesh, model, size }
      })

      const gridItems = transformed.filter(({ model }) => model.transform?.offset == null)
      const gap = 10
      const cellX = (gridItems.length > 0 ? Math.max(...gridItems.map(({ size }) => size.x)) : 0) + gap
      const cellY = (gridItems.length > 0 ? Math.max(...gridItems.map(({ size }) => size.y)) : 0) + gap
      const cols = Math.max(1, Math.ceil(Math.sqrt(gridItems.length)))
      const gridW = cols * cellX
      const gridH = Math.ceil(gridItems.length / cols) * cellY

      let gridIndex = 0
      const sceneBounds = new THREE.Box3()
      transformed.forEach(({ mesh, model }) => {
        if (model.transform?.offset) {
          mesh.position.x = model.transform.offset[0]
          mesh.position.y = model.transform.offset[1]
        } else {
          const col = gridIndex % cols
          const row = Math.floor(gridIndex / cols)
          mesh.position.x = -gridW / 2 + cellX * (col + 0.5)
          mesh.position.y = gridH / 2 - cellY * (row + 0.5)
          gridIndex++
        }
        // Engine ensure_on_bed() is applied after rotation and scaling. Do the
        // same for the visual model so an auto-oriented object never floats or
        // clips through the preview bed.
        mesh.updateMatrixWorld(true)
        const placedBounds = new THREE.Box3().setFromObject(mesh)
        mesh.position.z -= placedBounds.min.z
        mesh.updateMatrixWorld(true)
        scene.add(mesh)
        meshes.push(mesh)
        sceneBounds.union(new THREE.Box3().setFromObject(mesh))
      })
      const sizes: Record<string, [number, number, number]> = {}
      for (const { mesh, model, size } of transformed) {
        void mesh
        sizes[model.id] = [size.x, size.y, size.z]
      }
      pickRef.current.onBounds?.(sizes)

      // Camera framing. A rotate/place-on-face/scale commit rebuilds this
      // whole effect (the new transform arrives as a prop), so without this
      // check every such commit would silently reset the view — restoring
      // is what makes a commit feel like "the object moved", not "the
      // camera did". Only actually re-fit when the model set or bed changed.
      const remembered = sharedCameraMemory.get(cameraMemoryKey)
      if (remembered) {
        camera.position.copy(remembered.position)
        controls.target.copy(remembered.target)
      } else {
        // Framed on the model itself, not the bed: a 20 mm part on a 250 mm
        // bed should fill the view, the way a real slicer zooms to the part
        // rather than always showing the whole build plate.
        const modelSize = sceneBounds.getSize(new THREE.Vector3())
        const modelMaxDim = Math.max(modelSize.x, modelSize.y, modelSize.z, 10)
        const maxZ = Math.max(sceneBounds.max.z, 0)
        // Distance so the model's bounding size spans roughly half the
        // camera's vertical field of view: for a target angular size of
        // fov/2, dist = r / tan(fov/4), r = modelMaxDim/2.
        const dist = modelMaxDim * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 4)
        const viewDir = new THREE.Vector3(0.6, -1, 0.7).normalize()
        controls.target.set(0, 0, maxZ / 2)
        camera.position.copy(controls.target).addScaledVector(viewDir, dist)
      }
      controls.update()
    })

    let animId: number
    const clock = new THREE.Clock()
    const animate = () => {
      animId = requestAnimationFrame(animate)
      const delta = clock.getDelta()
      viewHelper.center.copy(controls.target)
      const wantRotateId = pickRef.current.rotateTargetId ?? null
      if (wantRotateId !== attachedRotateId) {
        const target = wantRotateId ? meshes.find((m) => m.userData.modelId === wantRotateId) : undefined
        if (target) rotateGizmo.attach(target)
        else rotateGizmo.detach()
        attachedRotateId = target ? wantRotateId : null
      }
      const snapDeg = pickRef.current.rotationSnapDeg ?? 0
      rotateGizmo.setRotationSnap(snapDeg ? THREE.MathUtils.degToRad(snapDeg) : null)
      if (tickLines && snapDeg !== tickSnapDeg) {
        for (const lines of tickLines) {
          lines.geometry.dispose()
          lines.geometry = buildAxisTickGeometry(lines.name as 'X' | 'Y' | 'Z', snapDeg)
        }
        tickSnapDeg = snapDeg
      }

      const wantMoveId = pickRef.current.moveTargetId ?? null
      if (wantMoveId !== attachedMoveId) {
        const target = wantMoveId ? meshes.find((m) => m.userData.modelId === wantMoveId) : undefined
        if (target) moveGizmo.attach(target)
        else moveGizmo.detach()
        attachedMoveId = target ? wantMoveId : null
      }

      const wantSelectedId = pickRef.current.selectedModelId ?? null
      if (wantSelectedId !== highlightedSelectionId) {
        for (const m of meshes) {
          const mat = m.material as THREE.MeshPhongMaterial
          mat.emissive.setHex(m.userData.modelId === wantSelectedId ? 0x1a3a5c : 0x000000)
        }
        highlightedSelectionId = wantSelectedId
      }

      // Exactly one of these may touch the camera on a given frame: OrbitControls
      // re-derives its own state from the camera's current position/rotation on
      // every call, so handing back to it the moment the gizmo's snap-animation
      // ends picks up cleanly with no fight or snap-back between the two.
      if (viewHelper.animating) {
        viewHelper.update(delta)
      } else {
        controls.update()
      }
      renderer.clear()
      renderer.render(scene, camera)
      viewHelper.render(renderer)
    }
    animate()

    const resizeObs = new ResizeObserver(() => {
      const nw = el.clientWidth
      const nh = el.clientHeight
      if (nw === 0 || nh === 0) return // mid-layout transient — next callback will have real numbers
      camera.aspect = nw / nh
      camera.updateProjectionMatrix()
      renderer.setSize(nw, nh)
    })
    resizeObs.observe(el)

    return () => {
      sharedCameraMemory.set(cameraMemoryKey, { position: camera.position.clone(), target: controls.target.clone() })
      cancelled = true
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.style.cursor = 'auto'
      patchGeometry.dispose()
      cursorGeometry.dispose()
      highlightMat.dispose()
      ;(cursorMesh.material as THREE.Material).dispose()
      cancelAnimationFrame(animId)
      resizeObs.disconnect()
      controls.dispose()
      viewHelper.dispose()
      if (tickLines) for (const lines of tickLines) { lines.geometry.dispose(); (lines.material as THREE.Material).dispose() }
      rotateGizmo.dispose()
      moveGizmo.dispose()
      renderer.dispose()
      for (const mesh of meshes) {
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose() // each mesh's own clone, not the shared template
      }
      material.dispose() // the template itself — never assigned to a mesh, but still allocated
      for (const obj of bedObjects) {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose()
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => {
              m.dispose()
            })
          } else {
            ;(obj.material as THREE.Material).dispose()
          }
        }
      }
      el.removeChild(renderer.domElement)
    }
  }, [previewModels, bedX, bedY, bedShape])

  return (
    <div className="relative w-full h-full min-h-48">
      <div ref={mountRef} className="w-full h-full rounded-xl overflow-hidden" style={{ touchAction: 'none' }} />
      {!loadError && onSetInteractionMode && (
        <div className="absolute left-2 bottom-9 flex items-center gap-1 rounded-lg bg-white/90 border border-slate-200 px-1.5 py-1 shadow-sm">
          {(() => {
            const targetId = selectedModelId ?? previewModels[0]?.id
            const noTarget = previewModels.length === 0 || !targetId
            const cls = (active: boolean) =>
              noTarget
                ? 'px-2 py-1 rounded-md text-slate-300 text-xs font-medium cursor-not-allowed'
                : active
                  ? 'px-2 py-1 rounded-md bg-orca-500 text-white text-xs font-medium'
                  : 'px-2 py-1 rounded-md text-slate-600 text-xs font-medium hover:bg-slate-100'
            return (
              <>
                <button
                  type="button"
                  disabled={noTarget}
                  onClick={() => targetId && onSetInteractionMode(pickTargetId === targetId ? null : 'pick', targetId)}
                  title={noTarget ? 'Load a model first' : 'Click a face in the 3D view; that face becomes the bottom'}
                  className={cls(pickTargetId === targetId)}
                >
                  Place on face
                </button>
                <button
                  type="button"
                  disabled={noTarget}
                  onClick={() => targetId && onSetInteractionMode(rotateTargetId === targetId ? null : 'rotate', targetId)}
                  title={noTarget ? 'Load a model first' : 'Drag the rings to spin the model freely, snapped to the chosen step'}
                  className={cls(rotateTargetId === targetId)}
                >
                  Free rotate
                </button>
                <button
                  type="button"
                  disabled={noTarget}
                  onClick={() => targetId && onSetInteractionMode(moveTargetId === targetId ? null : 'move', targetId)}
                  title={noTarget ? 'Load a model first' : 'Drag the arrows or the square handle to slide the model across the bed'}
                  className={cls(moveTargetId === targetId)}
                >
                  Move
                </button>
              </>
            )
          })()}
          {onPillarPick && (
            <button
              type="button"
              disabled={previewModels.length === 0}
              onClick={onTogglePillarPick}
              title={
                previewModels.length === 0
                  ? 'Load a model first'
                  : 'Click a point on the model; a support pillar rises from the bed to meet it'
              }
              className={
                previewModels.length === 0
                  ? 'px-2 py-1 rounded-md text-slate-300 text-xs font-medium cursor-not-allowed'
                  : pillarPickOn
                    ? 'px-2 py-1 rounded-md bg-orca-500 text-white text-xs font-medium'
                    : 'px-2 py-1 rounded-md text-slate-600 text-xs font-medium hover:bg-slate-100'
              }
            >
              Add pillar
            </button>
          )}
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 text-sm text-slate-500">
          {loadError}
        </div>
      )}
      {!loadError && notice && (
        <div className="absolute inset-x-0 bottom-0 px-3 py-1.5 bg-amber-50/90 border-t border-amber-200 text-xs text-amber-700 text-center">
          {notice}
        </div>
      )}
    </div>
  )
}
