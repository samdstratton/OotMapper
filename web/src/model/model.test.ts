import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { iconDrawSize, iconUrl } from './assets'
import { parseBaseMap, parseLayout, serializeLayout } from './io'
import { addSegment, emptyLayout, layoutBounds, linkColor, linkId, toggleLink } from './layout'
import { defaultViewport, fitViewport, modelToView, panBy, viewToModel, zoomAt, MAX_ZOOM, MIN_ZOOM } from './viewport'

const publicFile = (name: string): unknown =>
  JSON.parse(readFileSync(resolve(__dirname, '../../public', name), 'utf8'))

const baseMap = parseBaseMap(publicFile('oot.basemap.json'))

describe('basemap', () => {
  it('parses the shipped basemap', () => {
    expect(baseMap.segmentIds).toHaveLength(21)
    const kokiri = baseMap.segments['01_Kokiri']
    expect(kokiri.width).toBe(200)
    expect(kokiri.height).toBeCloseTo(165.947)
    expect(kokiri.entrances['Kokiri to Lost Woods'].frac).toEqual({ x: 0.425, y: 0 })
    expect(baseMap.entranceSegment.get('Kokiri to Lost Woods')).toBe('01_Kokiri')
  })

  it('has an image for every segment', () => {
    for (const id of baseMap.segmentIds) {
      expect(existsSync(resolve(__dirname, '../../public/Images', `${id}_L.webp`)), id).toBe(true)
    }
  })

  it('has a PNG for each entrance icon type', () => {
    for (const type of [0, 1, 2, 3, 4] as const) {
      const file = iconUrl(type).replace(import.meta.env.BASE_URL, '')
      expect(existsSync(resolve(__dirname, '../../public', file)), file).toBe(true)
    }
  })

  it('sizes icons like the WPF app did', () => {
    expect(iconDrawSize(0)).toEqual({ width: 15, height: 15 })
    const door = iconDrawSize(2)
    expect(door.height).toBeCloseTo(30)
    expect(door.width).toBeCloseTo(15.71, 1)
    const dungeon = iconDrawSize(4)
    expect(dungeon.width).toBeCloseTo(17.5)
    expect(dungeon.height).toBeCloseTo(15.31, 1)
    expect(iconDrawSize(0, 2)).toEqual({ width: 30, height: 30 })
  })

  it('rejects a malformed size', () => {
    expect(() => parseBaseMap({ Segments: { a: { Size: '5', Entrances: {} } } })).toThrow(/width,height/)
  })
})

describe('layout', () => {
  it('parses the shipped vanilla layout against the basemap', () => {
    const layout = parseLayout(publicFile('vanilla.layout.json'), baseMap)
    expect(Object.keys(layout.positions)).toHaveLength(21)
    expect(layout.links).toHaveLength(25)
  })

  it('round-trips through serialize/parse', () => {
    const layout = parseLayout(publicFile('vanilla.layout.json'), baseMap)
    expect(parseLayout(JSON.parse(serializeLayout(layout)), baseMap)).toEqual(layout)
  })

  it('serialises in the WPF-compatible shape', () => {
    const out = JSON.parse(serializeLayout({ positions: { a: { x: 1, y: 2 } }, links: [{ source: 's', dest: 'd' }] }))
    expect(out).toEqual({ Positions: { a: { X: 1, Y: 2 } }, Links: [{ Source: 's', Dest: 'd' }] })
  })

  it('rejects a layout that belongs to a different basemap', () => {
    expect(() => parseLayout({ Positions: { nope: { X: 0, Y: 0 } }, Links: [] }, baseMap)).toThrow(/not in the basemap/)
    expect(() =>
      parseLayout({ Positions: {}, Links: [{ Source: 'Kokiri to Lost Woods', Dest: 'Kokiri to Lost Woods' }] }, baseMap),
    ).toThrow(/not placed/)
  })

  it('addSegment ignores duplicates', () => {
    const once = addSegment(emptyLayout(), 'a', { x: 1, y: 1 })
    expect(addSegment(once, 'a', { x: 9, y: 9 })).toBe(once)
  })

  it('toggleLink adds, removes (either direction) and ignores self-links', () => {
    let l = toggleLink(emptyLayout(), 'a', 'b')
    expect(l.links).toHaveLength(1)
    expect(toggleLink(l, 'a', 'a')).toBe(l)
    l = toggleLink(l, 'b', 'a')
    expect(l.links).toHaveLength(0)
  })

  it('link ids and colours are direction-independent and stable', () => {
    expect(linkId('a', 'b')).toBe(linkId('b', 'a'))
    expect(linkColor(linkId('a', 'b'))).toBe(linkColor(linkId('b', 'a')))
    expect(linkColor('x')).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
  })
})

describe('fitting the viewport to the map', () => {
  const canvas = { width: 800, height: 600 }

  it('layoutBounds is the box around every placed region', () => {
    const layout = parseLayout(publicFile('vanilla.layout.json'), baseMap)
    const b = layoutBounds(baseMap, layout)!
    const xs = Object.entries(layout.positions).map(([id, p]) => [p.x, p.x + baseMap.segments[id].width])
    const ys = Object.entries(layout.positions).map(([id, p]) => [p.y, p.y + baseMap.segments[id].height])
    expect(b.minX).toBeCloseTo(Math.min(...xs.map((a) => a[0])))
    expect(b.maxX).toBeCloseTo(Math.max(...xs.map((a) => a[1])))
    expect(b.minY).toBeCloseTo(Math.min(...ys.map((a) => a[0])))
    expect(b.maxY).toBeCloseTo(Math.max(...ys.map((a) => a[1])))
  })

  it('layoutBounds is null for an empty layout', () => {
    expect(layoutBounds(baseMap, emptyLayout())).toBeNull()
  })

  it('shows the whole map, centred, with the padding to spare', () => {
    const bounds = { minX: -500, minY: -100, maxX: 1500, maxY: 900 } // 2000 x 1000
    const v = fitViewport(bounds, canvas, 20)
    const tl = modelToView(v, { x: bounds.minX, y: bounds.minY }, canvas)
    const br = modelToView(v, { x: bounds.maxX, y: bounds.maxY }, canvas)
    expect(tl.x).toBeGreaterThanOrEqual(20 - 1e-9)
    expect(tl.y).toBeGreaterThanOrEqual(20 - 1e-9)
    expect(br.x).toBeLessThanOrEqual(800 - 20 + 1e-9)
    expect(br.y).toBeLessThanOrEqual(600 - 20 + 1e-9)
    // The binding side (width here) touches the padding, and the map is centred.
    expect(tl.x).toBeCloseTo(20, 6)
    expect((tl.x + br.x) / 2).toBeCloseTo(400, 6)
    expect((tl.y + br.y) / 2).toBeCloseTo(300, 6)
  })

  it('binds on the height for a tall map', () => {
    const v = fitViewport({ minX: 0, minY: 0, maxX: 100, maxY: 2000 }, canvas, 20)
    expect(v.zoom).toBeCloseTo((600 - 40) / 2000, 9)
  })

  it('keeps the zoom within the normal limits', () => {
    expect(fitViewport({ minX: 0, minY: 0, maxX: 5, maxY: 5 }, canvas).zoom).toBe(MAX_ZOOM)
    expect(fitViewport({ minX: 0, minY: 0, maxX: 1e6, maxY: 1e6 }, canvas).zoom).toBe(MIN_ZOOM)
  })

  it('survives a degenerate box and a tiny canvas', () => {
    const v = fitViewport({ minX: 3, minY: 4, maxX: 3, maxY: 4 }, { width: 10, height: 10 })
    expect(Number.isFinite(v.zoom)).toBe(true)
    expect(v.viewPoint).toEqual({ x: 3, y: 4 })
  })
})

describe('viewport', () => {
  const canvas = { width: 800, height: 600 }

  it('model/view transforms are inverses', () => {
    const v = { zoom: 2.5, viewPoint: { x: 30, y: -40 } }
    const p = { x: 123, y: 456 }
    const back = viewToModel(v, modelToView(v, p, canvas), canvas)
    expect(back.x).toBeCloseTo(p.x)
    expect(back.y).toBeCloseTo(p.y)
  })

  it('the view point is drawn at the canvas centre', () => {
    const v = { zoom: 3, viewPoint: { x: 10, y: 20 } }
    expect(modelToView(v, v.viewPoint, canvas)).toEqual({ x: 400, y: 300 })
  })

  it('zoom keeps the point under the cursor fixed, in both directions', () => {
    const focus = { x: 650, y: 120 }
    for (const dir of [1, -1] as const) {
      const v = defaultViewport()
      const before = viewToModel(v, focus, canvas)
      const after = viewToModel(zoomAt(v, dir, focus, canvas), focus, canvas)
      expect(after.x).toBeCloseTo(before.x)
      expect(after.y).toBeCloseTo(before.y)
    }
  })

  it('zoom is clamped', () => {
    let v = defaultViewport()
    for (let i = 0; i < 100; i++) v = zoomAt(v, 1, { x: 0, y: 0 }, canvas)
    expect(v.zoom).toBe(MAX_ZOOM)
    for (let i = 0; i < 100; i++) v = zoomAt(v, -1, { x: 0, y: 0 }, canvas)
    expect(v.zoom).toBe(MIN_ZOOM)
  })

  it('panning drags the map with the cursor', () => {
    const v = { zoom: 2, viewPoint: { x: 0, y: 0 } }
    const p = { x: 50, y: 50 }
    const before = modelToView(v, p, canvas)
    const panned = panBy(v, { x: 30, y: -10 })
    const after = modelToView(panned, p, canvas)
    expect(after.x - before.x).toBeCloseTo(30)
    expect(after.y - before.y).toBeCloseTo(-10)
  })
})
