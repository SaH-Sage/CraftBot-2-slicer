import { useState } from 'react'
import type { ObjectTransform } from '../types'
import {
  fitToBed,
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
}

interface Props {
  items: TransformItem[]
  bed: { x: number; y: number; z: number }
  /** Model currently waiting for a face click, or null. */
  pickTarget: string | null
  onPickTarget: (id: string | null) => void
  onApply: (updates: { id: string; transform: ObjectTransform }[]) => void
  onAddFile: (file: File) => void
  disabled?: boolean
}

const btn = 'px-2 py-1 rounded-md border border-slate-200 bg-white text-xs text-slate-700 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed'
const btnOn = 'px-2 py-1 rounded-md border border-orca-500 bg-orca-500 text-white text-xs'
const num = 'w-16 px-1.5 py-1 rounded-md border border-slate-200 text-xs text-right'

export { placeOnFace }

export function TransformPanel({ items, bed, pickTarget, onPickTarget, onApply, onAddFile, disabled }: Props) {
  const [angle, setAngle] = useState(45)
  const [axis, setAxis] = useState<'x' | 'y' | 'z'>('z')
  const [cube, setCube] = useState(20)
  const [cylD, setCylD] = useState(20)
  const [cylH, setCylH] = useState(30)

  const apply = (id: string, transform: ObjectTransform) => onApply([{ id, transform }])
  const fmt = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(1))

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const picking = pickTarget === item.id
        return (
          <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
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

            <div className="grid grid-cols-3 gap-2">
              {(['x', 'y', 'z'] as const).map((a) => (
                <div key={a}>
                  <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Rotate {a.toUpperCase()}</div>
                  <div className="flex gap-1">
                    <button type="button" className={btn} disabled={disabled} onClick={() => apply(item.id, rotateAboutWorldAxis(item.transform, a, -90))}>
                      −90°
                    </button>
                    <button type="button" className={btn} disabled={disabled} onClick={() => apply(item.id, rotateAboutWorldAxis(item.transform, a, 90))}>
                      +90°
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input type="number" className={num} value={angle} step={1} onChange={(e) => setAngle(Number(e.target.value))} aria-label="Angle in degrees" />
              <span className="text-xs text-slate-500">° about</span>
              <select className="px-1.5 py-1 rounded-md border border-slate-200 text-xs" value={axis} onChange={(e) => setAxis(e.target.value as 'x' | 'y' | 'z')} aria-label="Axis">
                <option value="x">X</option>
                <option value="y">Y</option>
                <option value="z">Z</option>
              </select>
              <button type="button" className={btn} disabled={disabled} onClick={() => apply(item.id, rotateAboutWorldAxis(item.transform, axis, angle))}>
                Rotate
              </button>
              <button
                type="button"
                className={picking ? btnOn : btn}
                disabled={disabled}
                onClick={() => onPickTarget(picking ? null : item.id)}
                title="Click a face in the 3D view; that face becomes the bottom"
              >
                Place on face
              </button>
            </div>
            {picking && <p className="text-xs text-orca-600">Klikk på flaten i 3D-visningen som skal ligge mot plata.</p>}

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
                  onChange={(e) => apply(item.id, setUniformScale(item.transform, Number(e.target.value) / 100))}
                  aria-label="Scale percent"
                />
                %
              </label>
              <button type="button" className={btn} disabled={disabled || !item.size} onClick={() => item.size && apply(item.id, fitToBed(item.transform, item.size, bed))}>
                Fit to bed
              </button>
              <span className="text-xs text-slate-500 ml-1">Mirror</span>
              {(['x', 'y', 'z'] as const).map((a, i) => (
                <button
                  key={a}
                  type="button"
                  className={item.transform?.mirror[i] === -1 ? btnOn : btn}
                  disabled={disabled}
                  onClick={() => apply(item.id, toggleMirror(item.transform, a))}
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
      })}

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
        <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">Legg til enkel form (til testutskrift)</div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="number" className={num} value={cube} min={1} max={200} onChange={(e) => setCube(Number(e.target.value))} aria-label="Cube size mm" />
          <button type="button" className={btn} disabled={disabled} onClick={() => onAddFile(primitiveFile('box', [cube, cube, cube]))}>
            Cube (mm)
          </button>
          <span className="mx-1 text-slate-300">|</span>
          <input type="number" className={num} value={cylD} min={1} max={200} onChange={(e) => setCylD(Number(e.target.value))} aria-label="Cylinder diameter mm" />
          <span className="text-xs text-slate-500">⌀ ×</span>
          <input type="number" className={num} value={cylH} min={1} max={200} onChange={(e) => setCylH(Number(e.target.value))} aria-label="Cylinder height mm" />
          <button type="button" className={btn} disabled={disabled} onClick={() => onAddFile(primitiveFile('cylinder', [cylD, cylH]))}>
            Cylinder (mm)
          </button>
        </div>
      </div>
    </div>
  )
}
