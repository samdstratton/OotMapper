import type { Coord } from './types'

export const MIN_ZOOM = 0.15 // low enough for the whole vanilla map to fit, with padding, in a ~470px-wide canvas
export const DEFAULT_ZOOM = 1.5
export const MAX_ZOOM = 30
/** Each wheel tick scales the zoom by this factor (or its reciprocal-ish 1 - step). */
export const ZOOM_STEP = 0.2

export interface Viewport {
  zoom: number
  /** The model point shown at the centre of the canvas. */
  viewPoint: Coord
}

export interface Size {
  width: number
  height: number
}

export function defaultViewport(): Viewport {
  return { zoom: DEFAULT_ZOOM, viewPoint: { x: 0, y: 0 } }
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Screen pixels left clear around the map by fitViewport. */
export const FIT_PADDING = 24

/**
 * The viewport that shows all of `bounds` (in model coordinates) centred in the canvas, as large as
 * possible while leaving `padding` screen pixels around it. Zoom is kept within the normal limits,
 * so a huge map that cannot fit at MIN_ZOOM is centred but still overflows.
 */
export function fitViewport(bounds: Bounds, canvas: Size, padding = FIT_PADDING): Viewport {
  const width = Math.max(bounds.maxX - bounds.minX, 1)
  const height = Math.max(bounds.maxY - bounds.minY, 1)
  const availableW = Math.max(canvas.width - 2 * padding, 1)
  const availableH = Math.max(canvas.height - 2 * padding, 1)
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(availableW / width, availableH / height)))
  return { zoom, viewPoint: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 } }
}

function centre(canvas: Size): Coord {
  return { x: canvas.width / 2, y: canvas.height / 2 }
}

export function modelToView(v: Viewport, p: Coord, canvas: Size): Coord {
  const c = centre(canvas)
  return { x: (p.x - v.viewPoint.x) * v.zoom + c.x, y: (p.y - v.viewPoint.y) * v.zoom + c.y }
}

export function viewToModel(v: Viewport, p: Coord, canvas: Size): Coord {
  const c = centre(canvas)
  return { x: (p.x - c.x) / v.zoom + v.viewPoint.x, y: (p.y - c.y) / v.zoom + v.viewPoint.y }
}

/**
 * Zooms by `direction` (+1 in, -1 out), keeping the model point under `focus`
 * (a canvas-space position) fixed on screen.
 */
export function zoomAt(v: Viewport, direction: 1 | -1, focus: Coord, canvas: Size): Viewport {
  const factor = direction > 0 ? 1 + ZOOM_STEP : 1 - ZOOM_STEP
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor))
  if (zoom === v.zoom) return v
  const m = viewToModel(v, focus, canvas)
  const ratio = v.zoom / zoom
  return {
    zoom,
    viewPoint: { x: m.x - (m.x - v.viewPoint.x) * ratio, y: m.y - (m.y - v.viewPoint.y) * ratio },
  }
}

/** Drags the view by a canvas-space pixel delta. */
export function panBy(v: Viewport, deltaView: Coord): Viewport {
  return {
    ...v,
    viewPoint: { x: v.viewPoint.x - deltaView.x / v.zoom, y: v.viewPoint.y - deltaView.y / v.zoom },
  }
}
