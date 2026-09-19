import { useEffect, useRef, useState } from 'react'
import MapCanvas from './components/MapCanvas'
import Toolbar from './components/Toolbar'
import { startArrange, type ArrangeJob } from './model/arrangeClient'
import { loadDefaultBaseMap } from './model/assets'
import { parseBaseMap, parseLayout, serializeLayout } from './model/io'
import { addSegment, emptyLayout, layoutBounds, setSegmentPos, toggleLink } from './model/layout'
import type { BaseMap, Coord, Layout } from './model/types'
import { defaultViewport, fitViewport, type Viewport } from './model/viewport'

const failedMessage = (e: unknown) => `Auto-arrange failed: ${e instanceof Error ? e.message : String(e)}`

export default function App() {
  const [baseMap, setBaseMap] = useState<BaseMap | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [layout, setLayout] = useState<Layout>(emptyLayout)
  const [viewport, setViewport] = useState<Viewport>(defaultViewport)
  const [pendingSource, setPendingSource] = useState<string | null>(null)
  const [selected, setSelected] = useState('')

  const [arranging, setArranging] = useState(false)
  // Undo is offered only while the layout is still exactly what the arranger produced.
  // It also remembers the view from before the arranged map was brought into frame.
  const [arrangeUndo, setArrangeUndo] = useState<{ before: Layout; after: Layout; viewBefore: Viewport } | null>(null)
  // A message tied to the layout it describes, so it disappears as soon as the layout changes.
  const [note, setNote] = useState<{ text: string; layout: Layout } | null>(null)
  const job = useRef<ArrangeJob | null>(null)
  const canvasSize = useRef({ width: 0, height: 0 }) // the map viewport's shape, used when arranging
  const latestLayout = useRef(layout)
  useEffect(() => {
    latestLayout.current = layout
  }, [layout])
  const latestViewport = useRef(viewport)
  useEffect(() => {
    latestViewport.current = viewport
  }, [viewport])
  useEffect(() => () => job.current?.cancel(), [])

  useEffect(() => {
    loadDefaultBaseMap()
      .then((json) => setBaseMap(parseBaseMap(json)))
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)))
  }, [])

  if (loadError) return <p className="status">Could not load the basemap: {loadError}</p>
  if (!baseMap) return <p className="status">Loading…</p>

  const cancelArrange = () => {
    job.current?.cancel()
    job.current = null
    setArranging(false)
  }

  /** The view that shows all of `target` in the canvas, or null if there is nothing to fit or no canvas yet. */
  const fitOf = (target: Layout): Viewport | null => {
    const bounds = layoutBounds(baseMap, target)
    const size = canvasSize.current
    return bounds && size.width > 0 && size.height > 0 ? fitViewport(bounds, size) : null
  }

  /** Replaces the whole layout (Load, Clear). Loaded maps come into view; an empty one gets the default view. */
  const restart = (next: Layout, view: Viewport = defaultViewport()) => {
    cancelArrange()
    setLayout(next)
    setViewport(view)
    setPendingSource(null)
  }

  const handleEntranceClick = (entranceId: string) => {
    if (pendingSource === null) {
      setPendingSource(entranceId)
    } else {
      setLayout((l) => toggleLink(l, pendingSource, entranceId))
      setPendingSource(null)
    }
  }

  const handleSave = () => {
    const blob = new Blob([serializeLayout(layout)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'map.layout.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleLoadFile = async (file: File) => {
    try {
      const loaded = parseLayout(JSON.parse(await file.text()), baseMap)
      restart(loaded, fitOf(loaded) ?? defaultViewport())
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      window.alert(
        `An error occurred while loading this layout. Are you using the right basemap?\n\n${err.name}:\n${err.message}`,
      )
    }
  }

  const handleArrange = () => {
    const snapshot = layout
    // A fixed seed (the default), so the same layout in the same-shaped window always arranges the
    // same way. The window's shape (rounded and clamped inside the arranger) lets the map fit it.
    const { width, height } = canvasSize.current
    let thisJob: ArrangeJob
    try {
      thisJob = startArrange(baseMap, snapshot, { viewAspect: height > 0 ? width / height : undefined })
    } catch (e) {
      // The browser refused to create the worker at all (e.g. blocked by a security policy).
      setNote({ text: failedMessage(e), layout: snapshot })
      return
    }
    job.current = thisJob
    setArranging(true)
    setPendingSource(null) // a half-made link would be stranded while the map is locked
    thisJob.promise
      .then((result) => {
        if (job.current !== thisJob) return // cancelled or superseded
        job.current = null
        setArranging(false)
        // Editing is locked while arranging, so this should not happen; it is a safety net so that a
        // result computed for an old layout can never overwrite a newer one.
        if (latestLayout.current !== snapshot) {
          setNote({ text: 'Layout changed while arranging; result discarded.', layout: latestLayout.current })
          return
        }
        setLayout(result.layout)
        setArrangeUndo({ before: snapshot, after: result.layout, viewBefore: latestViewport.current })
        // Bring the whole arranged map into view, sized for the canvas it was arranged for.
        const fitted = fitOf(result.layout)
        if (fitted) setViewport(fitted)
      })
      .catch((e: unknown) => {
        if (job.current !== thisJob) return
        job.current = null
        setArranging(false)
        setNote({ text: failedMessage(e), layout: latestLayout.current })
      })
  }

  const canUndoArrange = arrangeUndo !== null && arrangeUndo.after === layout
  const handleUndoArrange = () => {
    if (!arrangeUndo || arrangeUndo.after !== layout) return
    setLayout(arrangeUndo.before)
    setViewport(arrangeUndo.viewBefore)
    setNote({ text: 'Undone', layout: arrangeUndo.before })
    setArrangeUndo(null)
  }

  // Shown only while it still describes the current layout, and never while arranging.
  const noteText = !arranging && note !== null && note.layout === layout ? note.text : null

  return (
    <div className="app">
      <div className="canvas-frame">
        <MapCanvas
          baseMap={baseMap}
          layout={layout}
          viewport={viewport}
          setViewport={setViewport}
          pendingSource={pendingSource}
          onMoveSegment={(id: string, pos: Coord) => setLayout((l) => setSegmentPos(l, id, pos))}
          onEntranceClick={handleEntranceClick}
          onCancelLink={() => setPendingSource(null)}
          onSizeChange={(size) => {
            canvasSize.current = size
          }}
          locked={arranging}
        />
        {noteText && (
          <div className="canvas-note" role="status">
            {noteText}
          </div>
        )}
      </div>
      <Toolbar
        segmentIds={baseMap.segmentIds}
        selected={selected}
        onSelect={setSelected}
        onAdd={() => selected && setLayout((l) => addSegment(l, selected, viewport.viewPoint))}
        onClear={() => window.confirm('Clear all?') && restart(emptyLayout())}
        onSave={handleSave}
        onLoadFile={handleLoadFile}
        canArrange={Object.keys(layout.positions).length >= 2}
        arranging={arranging}
        onArrange={handleArrange}
        canUndoArrange={canUndoArrange}
        onUndoArrange={handleUndoArrange}
      />
    </div>
  )
}
