import type { BaseMap, Coord, Layout, Link } from './types'
import type { Bounds } from './viewport'

export function emptyLayout(): Layout {
  return { positions: {}, links: [] }
}

/** The box around every placed region, or null if nothing is placed. */
export function layoutBounds(baseMap: BaseMap, layout: Layout): Bounds | null {
  const ids = Object.keys(layout.positions)
  if (ids.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const id of ids) {
    const p = layout.positions[id]
    const seg = baseMap.segments[id]
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + seg.width)
    maxY = Math.max(maxY, p.y + seg.height)
  }
  return { minX, minY, maxX, maxY }
}

/** Links are undirected, so the id is the same whichever end is the source. */
export function linkId(a: string, b: string): string {
  return a < b ? `${a} <=> ${b}` : `${b} <=> ${a}`
}

/** Adds a segment; returns the layout unchanged if it is already placed. */
export function addSegment(layout: Layout, id: string, pos: Coord): Layout {
  if (id in layout.positions) return layout
  return { ...layout, positions: { ...layout.positions, [id]: pos } }
}

export function setSegmentPos(layout: Layout, id: string, pos: Coord): Layout {
  return { ...layout, positions: { ...layout.positions, [id]: pos } }
}

/** Creates the link, or removes it if it already exists. Self-links are ignored. */
export function toggleLink(layout: Layout, source: string, dest: string): Layout {
  if (source === dest) return layout
  const id = linkId(source, dest)
  if (layout.links.some((l) => linkId(l.source, l.dest) === id)) {
    return { ...layout, links: layout.links.filter((l) => linkId(l.source, l.dest) !== id) }
  }
  const link: Link = { source, dest }
  return { ...layout, links: [...layout.links, link] }
}

/** A stable, bright-ish colour derived from the link id (FNV-1a hash into a small PRNG). */
export function linkColor(id: string): string {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let state = h >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const channel = () => 50 + Math.floor(next() * 206)
  return `rgb(${channel()}, ${channel()}, ${channel()})`
}
