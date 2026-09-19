import type { BaseMap, Coord, Entrance, EntranceType, Layout, Link, MapSegment } from './types'

type Json = Record<string, unknown>

function asObject(value: unknown, what: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Expected ${what} to be an object`)
  }
  return value as Json
}

function asNumber(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Expected ${what} to be a number`)
  }
  return value
}

function asString(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new Error(`Expected ${what} to be a string`)
  return value
}

function parseCoord(value: unknown, what: string): Coord {
  const o = asObject(value, what)
  return { x: asNumber(o.X, `${what}.X`), y: asNumber(o.Y, `${what}.Y`) }
}

/** The WPF app serialised System.Windows.Size as a "width,height" string. */
function parseSize(value: unknown, what: string): { width: number; height: number } {
  const parts = asString(value, what).split(',')
  const width = Number(parts[0])
  const height = Number(parts[1])
  if (parts.length !== 2 || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Expected ${what} to look like "width,height"`)
  }
  return { width, height }
}

export function parseBaseMap(json: unknown): BaseMap {
  const segmentsJson = asObject(asObject(json, 'basemap').Segments, 'Segments')
  const segments: Record<string, MapSegment> = {}
  const entranceSegment = new Map<string, string>()

  for (const [segId, segValue] of Object.entries(segmentsJson)) {
    const seg = asObject(segValue, `segment ${segId}`)
    const { width, height } = parseSize(seg.Size, `${segId}.Size`)
    const entrances: Record<string, Entrance> = {}
    for (const [enId, enValue] of Object.entries(asObject(seg.Entrances, `${segId}.Entrances`))) {
      const en = asObject(enValue, `entrance ${enId}`)
      const type = asNumber(en.EnType, `${enId}.EnType`)
      if (!Number.isInteger(type) || type < 0 || type > 4) {
        throw new Error(`Entrance '${enId}' has an unknown EnType ${type}`)
      }
      if (entranceSegment.has(enId)) {
        throw new Error(`Entrance '${enId}' is defined in more than one segment`)
      }
      entrances[enId] = {
        type: type as EntranceType,
        frac: parseCoord(en.FractionCoords, `${enId}.FractionCoords`),
      }
      entranceSegment.set(enId, segId)
    }
    segments[segId] = { width, height, entrances }
  }

  return { segments, segmentIds: Object.keys(segments), entranceSegment }
}

/** Parses a layout and checks it is consistent with the basemap it is being loaded against. */
export function parseLayout(json: unknown, baseMap: BaseMap): Layout {
  const root = asObject(json, 'layout')
  const positions: Record<string, Coord> = {}
  for (const [segId, value] of Object.entries(asObject(root.Positions, 'Positions'))) {
    if (!(segId in baseMap.segments)) {
      throw new Error(`Segment '${segId}' is not in the basemap`)
    }
    positions[segId] = parseCoord(value, `Positions.${segId}`)
  }

  if (!Array.isArray(root.Links)) throw new Error('Expected Links to be an array')
  const links: Link[] = root.Links.map((value, i) => {
    const o = asObject(value, `Links[${i}]`)
    const link = { source: asString(o.Source, `Links[${i}].Source`), dest: asString(o.Dest, `Links[${i}].Dest`) }
    for (const enId of [link.source, link.dest]) {
      const segId = baseMap.entranceSegment.get(enId)
      if (segId === undefined) throw new Error(`Entrance '${enId}' is not in the basemap`)
      if (!(segId in positions)) {
        throw new Error(`Entrance '${enId}' is linked but its segment '${segId}' is not placed`)
      }
    }
    return link
  })

  return { positions, links }
}

export function serializeLayout(layout: Layout): string {
  const positions: Record<string, { X: number; Y: number }> = {}
  for (const [id, p] of Object.entries(layout.positions)) positions[id] = { X: p.x, Y: p.y }
  const links = layout.links.map((l) => ({ Source: l.source, Dest: l.dest }))
  return JSON.stringify({ Positions: positions, Links: links }, null, 2)
}
