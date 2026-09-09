import { useState } from 'react'
import type { ObjectTransform } from '../types'
import {
  fitToBed,
  keepingAssociatedItemPosition,
  placeOnFace,
  primitiveFile,
  resetTransform,
  rotateAboutWorldAxis,
  setUniformScale,
  toggleMirror,
  uniformScalePercent,
} from '../lib/plate-tools'

export interface TransformItem {
  id: string
  name: string
  transform?: ObjectTransform
  /** Current transformed size in mm, reported by the viewer. */
  size?: [number, number, number]
  /** The model this was generated from by clicking a point on it (a support
   *  pillar), or undefined for anything added independently. See the longer
   *  comment on QueueItem.parentId in src/types/index.ts for what this is
   *  and isn't used for. */
  parentId?: string
}

interface Props {
  items: TransformItem[]
  bed: { x: number; y: number; z: number }
  /** Model currently waiting for a face click, or null. */
  pickTarget: string | null
  onPickTarget: (id: string | null) => void
  /** Model currently attached to the free-rotate gizmo, or null. Mutually
   *  exclusive with pickTarget and moveTarget — activating one clears the
   *  other two. */
  rotateTarget: string | null
  onRotateTarget: (id: string | null) => void
  rotationSnapDeg: number
  onRotationSnapDeg: (deg: number) => void
  /** Model currently attached to the move (translate) gizmo, or null. */
  moveTarget: string | null
  onMoveTarget: (id: string | null) => void
  /** Support-pillar base/top diameter, shared between the manual "type dimensions"
   *  flow here and the "click a point in the view" flow the pillarPickOn button drives. */
  pillarBaseD: number
  onPillarBaseD: (mm: number) => void
  pillarTopD: number
  onPillarTopD: (mm: number) => void
  /** Whether "click a point to drop a pillar there" is the active mode. */
  pillarPickOn: boolean
  onTogglePillarPick: () => void
  onApply: (updates: { id: string; transform: ObjectTransform }[]) => void
  onAddFile: (file: File) => void
  /** Removes an item outright — used for the × on a collapsed associated-item
   *  row, so a pillar a reorient left standing in the wrong place doesn't
   *  require scrolling back up to the file list to clear out. */
  onRemoveItem: (id: string) => void
  disabled?: boolean
}

const btn = 'px-2 py-1 rounded-md border border-slate-200 bg-white text-xs text-slate-700 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed'
const btnOn = 'px-2 py-1 rounded-md border border-orca-500 bg-orca-500 text-white text-xs'
const num = 'w-16 px-1.5 py-1 rounded-md border border-slate-200 text-xs text-right'

export { placeOnFace }

export function TransformPanel({
  items,
  bed,
  pickTarget,
  onPickTarget,
  rotateTarget,
  onRotateTarget,
  rotationSnapDeg,
  onRotationSnapDeg,
  moveTarget,
  onMoveTarget,
  pillarBaseD,
  onPillarBaseD,
  pillarTopD,
  onPillarTopD,
  pillarPickOn,
  onTogglePillarPick,
  onApply,
  onAddFile,
  onRemoveItem,
  disabled,
}: Props) {
  const [angle, setAngle] = useState(45)
  const [axis, setAxis] = useState<'x' | 'y' | 'z'>('z')
  const [cube, setCube] = useState(20)
  const [cylD, setCylD] = useState(20)
  const [cylH, setCylH] = useState(30)
  const [sphereD, setSphereD] = useState(20)
  const [pillarH, setPillarH] = useState(20)
  // Which individual associated items are expanded to their full controls
  // rather than a single summary line — the associated-items list itself is
  // always shown once a parent has any, per-item collapse is the only level.
  const [openChildren, setOpenChildren] = useState<Set<string>>(new Set())
  const toggleSet = (set: Set<string>, setSet: (s: Set<string>) => void, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSet(next)
  }

  const apply = (id: string, transform: ObjectTransform) => onApply([{ id, transform }])
  // See keepingAssociatedItemPosition's own comment in plate-tools.ts for why
  // this wrapping matters — needed here specifically because these buttons
  // call rotateAboutWorldAxis/setUniformScale/toggleMirror/fitToBed directly,
  // not through App.tsx's handleRotateEnd/handlePickFace.
  const applyKeepingPillarPosition = (item: TransformItem, t: ObjectTransform) =>
    apply(item.id, keepingAssociatedItemPosition(item, t, items.some((i) => i.parentId === item.id)))
  const rotate = (item: TransformItem, a: 'x' | 'y' | 'z', deg: number) =>
    applyKeepingPillarPosition(item, rotateAboutWorldAxis(item.transform, a, deg))
  const fmt = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(1))

  // A pillar's parentId only means something while that parent is still on
  // the plate — if it was removed, the pillar surfaces as its own top-level
  // item again rather than silently vanishing from the list.
  const idsPresent = new Set(items.map((i) => i.id))
  const topLevelItems = items.filter((i) => !i.parentId || !idsPresent.has(i.parentId))
  const childrenByParent = new Map<string, TransformItem[]>()
  for (const item of items) {
    if (item.parentId && idsPresent.has(item.parentId)) {
      const list = childrenByParent.get(item.parentId) ?? []
      list.push(item)
      childrenByParent.set(item.parentId, list)
    }
  }

  const renderControls = (item: TransformItem) => {
    const picking = pickTarget === item.id
    const rotating = rotateTarget === item.id
    const moving = moveTarget === item.id
    // An item with a parentId has its position derived from the parent (see
    // QueueItem.relativeOffset) — it isn't moved or rotated on its own, it
    // rides along with whatever the parent does. So the controls that would
    // set an independent position/orientation (rotate, place-on-face, move)
    // don't apply here and are replaced with a short note instead. Scale,
    // mirror, and reset stay available — they only affect this item's own
    // shape, not its plate position, so they don't conflict with following
    // the parent.
    const isChild = !!item.parentId
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-slate-800 truncate" title={item.name}>
            {item.name}
          </span>
          {item.size && (
            <span className="text-xs text-slate-400 tabular-nums shrink-0">
              {fmt(item.size[0])} × {fmt(item.size[1])} × {fmt(item.size[2])} mm
            </span>
          )}
        </div>

        {isChild ? (
          <p className="text-xs text-slate-400">Følger plasseringen til modellen den er festet til.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {(['x', 'y', 'z'] as const).map((a) => (
                <div key={a}>
                  <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Rotate {a.toUpperCase()}</div>
                  <div className="flex gap-1">
                    <button type="button" className={btn} disabled={disabled} onClick={() => rotate(item, a, -90)}>
                      −90°
                    </button>
                    <button type="button" className={btn} disabled={disabled} onClick={() => rotate(item, a, 90)}>
                      +90°
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input type="number" className={num} value={angle} step={1} onChange={(e) => setAngle(Number(e.target.value) || 0)} aria-label="Angle in degrees" />
              <span className="text-xs text-slate-500">° about</span>
              <select className="px-1.5 py-1 rounded-md border border-slate-200 text-xs" value={axis} onChange={(e) => setAxis(e.target.value as 'x' | 'y' | 'z')} aria-label="Axis">
                <option value="x">X</option>
                <option value="y">Y</option>
                <option value="z">Z</option>
              </select>
              <button type="button" className={btn} disabled={disabled} onClick={() => rotate(item, axis, angle)}>
                Rotate
              </button>
              <button
                type="button"
                className={picking ? btnOn : btn}
                disabled={disabled}
                // A single call: onPickTarget is wired (in App.tsx) to a setter
                // that already clears rotate/move atomically in one state
                // update. Also calling onRotateTarget(null)/onMoveTarget(null)
                // here would fire three separate updates to the same
                // underlying state and the last one would win, undoing
                // whichever mode this click just turned on.
                onClick={() => onPickTarget(picking ? null : item.id)}
                title="Click a face in the 3D view; that face becomes the bottom"
              >
                Place on face
              </button>
              <button
                type="button"
                className={rotating ? btnOn : btn}
                disabled={disabled}
                onClick={() => onRotateTarget(rotating ? null : item.id)}
                title="Drag the rings in the 3D view to spin the model freely, snapped to the chosen step"
              >
                Free rotate
              </button>
              <button
                type="button"
                className={moving ? btnOn : btn}
                disabled={disabled}
                onClick={() => onMoveTarget(moving ? null : item.id)}
                title="Drag the arrows or the square handle in the 3D view to slide the model across the bed"
              >
                Move
              </button>
            </div>
            {picking && <p className="text-xs text-orca-600">Klikk på flaten i 3D-visningen som skal ligge mot plata.</p>}
            {rotating && (
              <p className="text-xs text-orca-600">Dra i ringene i 3D-visningen for å rotere fritt.</p>
            )}
            {moving && (
              <p className="text-xs text-orca-600">Dra i pilene eller den firkantede haken i 3D-visningen for å flytte modellen.</p>
            )}
          </>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-slate-500">
            Scale
            <input
              type="number"
              className={num}
              value={uniformScalePercent(item.transform)}
              min={1}
              max={10000}
              step={1}
              disabled={disabled}
              onChange={(e) => applyKeepingPillarPosition(item, setUniformScale(item.transform, (Number(e.target.value) || 100) / 100))}
              aria-label="Scale percent"
            />
            %
          </label>
          <button type="button" className={btn} disabled={disabled || !item.size} onClick={() => item.size && applyKeepingPillarPosition(item, fitToBed(item.transform, item.size, bed))}>
            Fit to bed
          </button>
          <span className="text-xs text-slate-500 ml-1">Mirror</span>
          {(['x', 'y', 'z'] as const).map((a, i) => (
            <button
              key={a}
              type="button"
              className={item.transform?.mirror[i] === -1 ? btnOn : btn}
              disabled={disabled}
              onClick={() => applyKeepingPillarPosition(item, toggleMirror(item.transform, a))}
            >
              {a.toUpperCase()}
            </button>
          ))}
          <button type="button" className={`${btn} ml-auto`} disabled={disabled} onClick={() => apply(item.id, resetTransform())}>
            Reset
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>Snap</span>
        {[0, 5, 10, 15, 45].map((deg) => (
          <button
            key={deg}
            type="button"
            className={rotationSnapDeg === deg ? btnOn : btn}
            disabled={disabled}
            onClick={() => onRotationSnapDeg(deg)}
          >
            {deg === 0 ? 'Off' : `${deg}\u00b0`}
          </button>
        ))}
      </div>

      {topLevelItems.map((item) => {
        const children = childrenByParent.get(item.id) ?? []
        return (
          <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
            {renderControls(item)}

            {children.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <div className="mb-2 text-xs font-medium text-slate-400">
                  {children.length} {children.length === 1 ? 'tilknyttet element' : 'tilknyttede elementer'}
                </div>
                <div className="space-y-2 pl-4 border-l-2 border-slate-100">
                  {children.map((child) => {
                    const childOpen = openChildren.has(child.id)
                    return (
                      <div key={child.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                        {childOpen ? (
                          <>
                            <button
                              type="button"
                              onClick={() => toggleSet(openChildren, setOpenChildren, child.id)}
                              className="mb-2 flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-orca-600 transition-colors"
                            >
                              <span className="inline-block w-3">▾</span>
                              Skjul
                            </button>
                            {renderControls(child)}
                          </>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => toggleSet(openChildren, setOpenChildren, child.id)}
                              className="flex items-center gap-1.5 min-w-0 text-xs text-slate-700 hover:text-orca-600 transition-colors"
                            >
                              <span className="inline-block w-3 shrink-0">▸</span>
                              <span className="truncate" title={child.name}>{child.name}</span>
                              {child.size && (
                                <span className="text-slate-400 tabular-nums shrink-0">
                                  {fmt(child.size[0])}×{fmt(child.size[1])}×{fmt(child.size[2])}
                                </span>
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => onRemoveItem(child.id)}
                              title="Fjern"
                              className="shrink-0 text-slate-300 hover:text-red-400 transition-colors px-1 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
        <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">Legg til enkel form (til testutskrift)</div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="number" className={num} value={cube} min={1} max={200} onChange={(e) => setCube(Number(e.target.value) || 1)} aria-label="Cube size mm" />
          <button type="button" className={btn} disabled={disabled} onClick={() => onAddFile(primitiveFile('box', [Math.max(1, cube), Math.max(1, cube), Math.max(1, cube)]))}>
            Cube (mm)
          </button>
          <span className="mx-1 text-slate-300">|</span>
          <input type="number" className={num} value={cylD} min={1} max={200} onChange={(e) => setCylD(Number(e.target.value) || 1)} aria-label="Cylinder diameter mm" />
          <span className="text-xs text-slate-500">⌀ ×</span>
          <input type="number" className={num} value={cylH} min={1} max={200} onChange={(e) => setCylH(Number(e.target.value) || 1)} aria-label="Cylinder height mm" />
          <button type="button" className={btn} disabled={disabled} onClick={() => onAddFile(primitiveFile('cylinder', [Math.max(1, cylD), Math.max(1, cylH)]))}>
            Cylinder (mm)
          </button>
          <span className="mx-1 text-slate-300">|</span>
          <input type="number" className={num} value={sphereD} min={1} max={200} onChange={(e) => setSphereD(Number(e.target.value) || 1)} aria-label="Sphere diameter mm" />
          <button type="button" className={btn} disabled={disabled} onClick={() => onAddFile(primitiveFile('sphere', [Math.max(1, sphereD)]))}>
            Ball (mm)
          </button>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Manuell støttepilar</div>
          <p className="text-xs text-slate-500 mb-2">
            Motoren støtter ikke ekte støtte-modifikatorer (blokker/forsterker) i denne nettleser-varianten. En pilar er
            i stedet en egen, smal form som skrives ut ved siden av modellen — enten «Klikk og plasser» under, som
            setter høyden automatisk fra punktet du klikker, eller skriv inn mål selv og plasser den med «Move».
            Smalere topp gjør den lett å knekke av etterpå.
          </p>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <input type="number" className={num} value={pillarBaseD} min={0.5} max={50} step={0.5} onChange={(e) => onPillarBaseD(Number(e.target.value) || 0.5)} aria-label="Pillar base diameter mm" />
            <span className="text-xs text-slate-500">bunn ⌀</span>
            <input type="number" className={num} value={pillarTopD} min={0.5} max={50} step={0.5} onChange={(e) => onPillarTopD(Number(e.target.value) || 0.5)} aria-label="Pillar top diameter mm" />
            <span className="text-xs text-slate-500">topp ⌀</span>
            <button
              type="button"
              className={pillarPickOn ? btnOn : btn}
              disabled={disabled}
              onClick={onTogglePillarPick}
              title="Klikk et punkt på modellen i 3D-visningen; pilaren når fra plata og opp dit"
            >
              Klikk og plasser
            </button>
          </div>
          {pillarPickOn && (
            <p className="text-xs text-orca-600 mb-2">Klikk et punkt på modellen i 3D-visningen for å sette en pilar der.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">eller skriv inn høyde selv:</span>
            <input type="number" className={num} value={pillarH} min={1} max={200} onChange={(e) => setPillarH(Number(e.target.value) || 1)} aria-label="Pillar height mm" />
            <button
              type="button"
              className={btn}
              disabled={disabled}
              onClick={() =>
                onAddFile(primitiveFile('pillar', [Math.max(0.5, pillarBaseD), Math.max(0.5, pillarTopD), Math.max(1, pillarH)]))
              }
            >
              Støttepilar (mm)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
