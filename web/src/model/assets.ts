import { EntranceType } from './types'

/** Resolves a path under public/, respecting Vite's base URL (e.g. on GitHub Pages). */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`
}

export function segmentImageUrl(segmentId: string): string {
  return assetUrl(`Images/${segmentId}_L.webp`)
}

const ICON_NAME: Record<EntranceType, string> = {
  [EntranceType.Outdoor]: 'entrance',
  [EntranceType.Owl]: 'owl',
  [EntranceType.Indoor]: 'door',
  [EntranceType.Grotto]: 'grotto',
  [EntranceType.Dungeon]: 'dungeon',
}

export function iconUrl(type: EntranceType): string {
  return assetUrl(`Images/Icons/${ICON_NAME[type]}.png`)
}

/** Natural pixel sizes of the icon PNGs. */
const ICON_NATURAL: Record<EntranceType, { width: number; height: number }> = {
  [EntranceType.Outdoor]: { width: 40, height: 40 },
  [EntranceType.Owl]: { width: 100, height: 100 },
  [EntranceType.Indoor]: { width: 44, height: 84 },
  [EntranceType.Grotto]: { width: 40, height: 40 },
  [EntranceType.Dungeon]: { width: 40, height: 35 },
}

/** Nominal icon height in screen pixels. */
const ICON_SIZE: Record<EntranceType, number> = {
  [EntranceType.Outdoor]: 15,
  [EntranceType.Owl]: 30,
  [EntranceType.Indoor]: 30,
  [EntranceType.Grotto]: 15,
  [EntranceType.Dungeon]: 20,
}

/**
 * On-screen size of an entrance icon. This reproduces what the WPF app actually drew: it sized a
 * box of (height * naturalHeight/naturalWidth) x height and fitted the image uniformly inside it,
 * so non-square icons (door, dungeon) come out a little different from a plain "height = N".
 */
export function iconDrawSize(type: EntranceType, scale = 1): { width: number; height: number } {
  const nat = ICON_NATURAL[type]
  const boxH = ICON_SIZE[type] * scale
  const boxW = boxH * (nat.height / nat.width)
  const fit = Math.min(boxW / nat.width, boxH / nat.height)
  return { width: nat.width * fit, height: nat.height * fit }
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(assetUrl(path))
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`)
  return response.json()
}

export const loadDefaultBaseMap = () => fetchJson('oot.basemap.json')
export const loadDefaultLayout = () => fetchJson('vanilla.layout.json')
