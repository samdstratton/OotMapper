export interface Coord {
  x: number
  y: number
}

// Numeric values match the EnType values in the basemap JSON.
export const EntranceType = {
  Outdoor: 0,
  Owl: 1,
  Indoor: 2,
  Grotto: 3,
  Dungeon: 4,
} as const
export type EntranceType = (typeof EntranceType)[keyof typeof EntranceType]

export function isExterior(type: EntranceType): boolean {
  return type === EntranceType.Outdoor || type === EntranceType.Owl
}

export interface Entrance {
  type: EntranceType
  /** Position within the segment as a fraction (0-1) of its width/height. */
  frac: Coord
}

export interface MapSegment {
  width: number
  height: number
  entrances: Record<string, Entrance>
}

export interface BaseMap {
  segments: Record<string, MapSegment>
  segmentIds: string[]
  /** Entrance id -> id of the segment that contains it. */
  entranceSegment: ReadonlyMap<string, string>
}

export interface Link {
  source: string
  dest: string
}

export interface Layout {
  /** Segment id -> top-left corner in model coordinates. */
  positions: Record<string, Coord>
  links: Link[]
}
