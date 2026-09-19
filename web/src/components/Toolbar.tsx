import { useRef } from 'react'

interface Props {
  segmentIds: string[]
  selected: string
  onSelect: (id: string) => void
  onAdd: () => void
  onClear: () => void
  onSave: () => void
  onLoadFile: (file: File) => void
  canArrange: boolean
  arranging: boolean
  onArrange: () => void
  canUndoArrange: boolean
  onUndoArrange: () => void
}

/**
 * While arranging, everything that edits or replaces the layout (and Save, for consistency) is
 * disabled, so the arrangement is always computed for the layout the user is looking at.
 *
 * Groups wrap as whole units when the window narrows. Nothing here changes size when the app's
 * state changes: Auto-arrange fits the map to the canvas's shape, so anything that resized the toolbar
 * (and with it the canvas) would change the arrangement.
 */
export default function Toolbar({
  segmentIds, selected, onSelect, onAdd, onClear, onSave, onLoadFile,
  canArrange, arranging, onArrange, canUndoArrange, onUndoArrange,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null)

  return (
    <div className="toolbar">
      <div className="toolbar-group toolbar-picker">
        <select value={selected} onChange={(e) => onSelect(e.target.value)} aria-label="Segment to add">
          <option value="">Select a segment…</option>
          {segmentIds.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
        <button onClick={onAdd} disabled={!selected || arranging}>Add</button>
      </div>

      <div className="toolbar-group">
        {/* One fixed-size slot: Undo takes the place of Auto-arrange while the layout is arranged. */}
        {canUndoArrange && !arranging ? (
          <button className="arrange-button" onClick={onUndoArrange} title="Restore the layout from before arranging">
            Undo arrange
          </button>
        ) : (
          <button
            className="arrange-button"
            onClick={onArrange}
            disabled={!canArrange || arranging}
            title="Move regions to reduce crossing links"
          >
            {arranging ? 'Arranging…' : 'Auto-arrange'}
          </button>
        )}
      </div>

      <div className="toolbar-group">
        <button onClick={onSave} disabled={arranging}>Save</button>
        <button onClick={() => fileInput.current?.click()} disabled={arranging}>Load</button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onLoadFile(file)
            e.target.value = '' // allow re-loading the same file
          }}
        />
      </div>

      {/* Kept apart from the other buttons, at the far end, so it is hard to hit by accident. */}
      <div className="toolbar-group toolbar-end">
        <button className="danger" onClick={onClear} disabled={arranging}>Clear</button>
      </div>
    </div>
  )
}
