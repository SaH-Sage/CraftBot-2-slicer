import { useEffect, useRef, useState } from 'react'
import type { ModelPreview } from '../components/ModelViewer'
import { buildMergedStlForItem } from '../lib/plate-tools'
import type { QueueItem } from '../types'

/**
 * The items that get their own entry in the preview (and, by the same rule
 * elsewhere, their own row in the slice queue): anything without a parentId,
 * or whose parent has been removed — the same "orphan surfaces as top-level"
 * rule TransformPanel and the slice-tab card list both already use. A child
 * whose parent is still present is deliberately excluded; its geometry
 * belongs welded into that parent instead of shown separately.
 */
export function selectTopLevelItems(queue: QueueItem[]): QueueItem[] {
  const idsPresent = new Set(queue.map((i) => i.id))
  return queue.filter((i) => i.stlFile != null && (!i.parentId || !idsPresent.has(i.parentId)))
}

/**
 * A string that changes exactly when the merged geometry for topLevel would
 * change — each item's own transform, plus every child's relativeOffset and
 * own scale/mirror/rotation. Deliberately excludes anything that doesn't
 * affect geometry (slice status, progress, names) so the expensive rebuild
 * in useMergedPreviewModels only fires when it actually needs to.
 */
export function mergeSignature(topLevel: QueueItem[], queue: QueueItem[]): string {
  return JSON.stringify(
    topLevel.map((item) => [
      item.id,
      item.transform ?? null,
      queue
        .filter((c) => c.parentId === item.id)
        .map((c) => [c.id, c.relativeOffset ?? null, c.transform?.scale ?? null, c.transform?.mirror ?? null, c.transform?.rotation ?? null]),
    ]),
  )
}

/**
 * Builds the same merged geometry buildMergedStlForItem produces for
 * slicing, but for the live 3D preview — so what's shown always matches
 * what will actually print. A child (parentId set, and its parent still
 * present) never gets its own entry here; its geometry is welded into
 * whichever top-level item it's attached to instead.
 *
 * The merge is async (STL parsing + geometry work), so this can't be a
 * plain useMemo. A generation counter discards any build that's still in
 * flight when a newer one starts, and the previously-built models stay on
 * screen until the new build finishes — briefly stale rather than flickering
 * to empty on every edit.
 */
export function useMergedPreviewModels(queue: QueueItem[]): ModelPreview[] {
  const topLevel = selectTopLevelItems(queue)
  const signature = mergeSignature(topLevel, queue)

  const [models, setModels] = useState<ModelPreview[]>([])
  const generationRef = useRef(0)

  useEffect(() => {
    const myGeneration = ++generationRef.current
    void (async () => {
      try {
        const built = await Promise.all(
          topLevel.map(async (item) => ({
            id: item.id,
            file: new File([await buildMergedStlForItem(item.id, queue)], item.name, { type: 'model/stl' }),
            transform: item.transform,
          })),
        )
        if (myGeneration !== generationRef.current) return // a newer build finished first, or started after this one — discard
        setModels(built)
      } catch (err) {
        // Leave the last-good models on screen rather than clearing the
        // viewer over a transient failure (e.g. a mid-edit STL read race).
        console.error('[preview] failed to build merged geometry:', err)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  return models
}

