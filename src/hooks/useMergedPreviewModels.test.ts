import { describe, expect, it } from 'vitest'
import { mergeSignature, selectTopLevelItems } from './useMergedPreviewModels'
import type { QueueItem } from '../types'

const stl = new File(['x'], 'x.stl', { type: 'model/stl' })

describe('selectTopLevelItems', () => {
  it('includes an item with no parentId', () => {
    const items = [{ id: 'main', stlFile: stl }] as unknown as QueueItem[]
    expect(selectTopLevelItems(items).map((i) => i.id)).toEqual(['main'])
  })

  it('excludes a child whose parent is present', () => {
    const items = [
      { id: 'main', stlFile: stl },
      { id: 'pillar', stlFile: stl, parentId: 'main' },
    ] as unknown as QueueItem[]
    expect(selectTopLevelItems(items).map((i) => i.id)).toEqual(['main'])
  })

  it('surfaces an orphaned child (parent removed) as top-level again', () => {
    const items = [{ id: 'pillar', stlFile: stl, parentId: 'gone' }] as unknown as QueueItem[]
    expect(selectTopLevelItems(items).map((i) => i.id)).toEqual(['pillar'])
  })

  it('excludes an item with no STL data yet', () => {
    const items = [{ id: 'converting', stlFile: null }] as unknown as QueueItem[]
    expect(selectTopLevelItems(items)).toEqual([])
  })

  it('handles a two-level chain: only the root is top-level', () => {
    const items = [
      { id: 'main', stlFile: stl },
      { id: 'pillarA', stlFile: stl, parentId: 'main' },
      { id: 'pillarB', stlFile: stl, parentId: 'pillarA' },
    ] as unknown as QueueItem[]
    expect(selectTopLevelItems(items).map((i) => i.id)).toEqual(['main'])
  })
})

describe('mergeSignature', () => {
  const identity = { scale: [1, 1, 1], rotation: [0, 0, 0], mirror: [1, 1, 1], offset: null }

  it('changes when a child is added', () => {
    const base = [{ id: 'main', stlFile: stl }] as unknown as QueueItem[]
    const withChild = [
      { id: 'main', stlFile: stl },
      { id: 'pillar', stlFile: stl, parentId: 'main', relativeOffset: [1, 2, 3] },
    ] as unknown as QueueItem[]
    const topA = selectTopLevelItems(base)
    const topB = selectTopLevelItems(withChild)
    expect(mergeSignature(topA, base)).not.toBe(mergeSignature(topB, withChild))
  })

  it('changes when a child relativeOffset changes', () => {
    const q1 = [
      { id: 'main', stlFile: stl },
      { id: 'pillar', stlFile: stl, parentId: 'main', relativeOffset: [1, 2, 3] },
    ] as unknown as QueueItem[]
    const q2 = [
      { id: 'main', stlFile: stl },
      { id: 'pillar', stlFile: stl, parentId: 'main', relativeOffset: [9, 9, 9] },
    ] as unknown as QueueItem[]
    expect(mergeSignature(selectTopLevelItems(q1), q1)).not.toBe(mergeSignature(selectTopLevelItems(q2), q2))
  })

  it('is stable when only unrelated fields (status, gcode, name) change', () => {
    const q1 = [{ id: 'main', stlFile: stl, transform: identity, status: 'ready', name: 'a.stl' }] as unknown as QueueItem[]
    const q2 = [{ id: 'main', stlFile: stl, transform: identity, status: 'done', name: 'renamed.stl', gcode: 'G1' }] as unknown as QueueItem[]
    expect(mergeSignature(selectTopLevelItems(q1), q1)).toBe(mergeSignature(selectTopLevelItems(q2), q2))
  })

  it('changes when the parent itself is rotated', () => {
    const q1 = [{ id: 'main', stlFile: stl, transform: identity }] as unknown as QueueItem[]
    const q2 = [{ id: 'main', stlFile: stl, transform: { ...identity, rotation: [0, 0, 1.2] } }] as unknown as QueueItem[]
    expect(mergeSignature(selectTopLevelItems(q1), q1)).not.toBe(mergeSignature(selectTopLevelItems(q2), q2))
  })
})
