import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { arrangeLayout, defaultIterations, DEFAULT_VIEW_ASPECT, measureLayout, normalizeAspect } from './arrange'
import { parseBaseMap, parseLayout } from './io'
import type { Layout } from './types'

// Four 100x100 regions, each with one entrance in the middle.
const square = (name: string) => ({ Size: '100,100', Entrances: { [name]: { EnType: 0, FractionCoords: { X: 0.5, Y: 0.5 } } } })
const synthetic = parseBaseMap({ Segments: { A: square('a'), B: square('b'), C: square('c'), D: square('d') } })

// A-C and B-D cross like an X.
const crossed: Layout = {
  positions: { A: { x: 0, y: 0 }, B: { x: 300, y: 0 }, C: { x: 300, y: 300 }, D: { x: 0, y: 300 } },
  links: [
    { source: 'a', dest: 'c' },
    { source: 'b', dest: 'd' },
  ],
}

describe('measureLayout', () => {
  it('counts crossing links', () => {
    expect(measureLayout(synthetic, crossed).crossings).toBe(1)
  })

  it('measures a perpendicular crossing as 90 degrees and not shallow', () => {
    const stats = measureLayout(synthetic, crossed) // the two diagonals of a square
    expect(stats.meanCrossingAngle).toBeCloseTo(90, 5)
    expect(stats.shallowCrossings).toBe(0)
  })

  it('measures a shallow crossing by its acute angle', () => {
    // Links from (50,50) to (450,150) and from (50,150) to (450,50): slopes +/-0.25, about 28 degrees apart.
    const shallow: Layout = {
      positions: { A: { x: 0, y: 0 }, C: { x: 400, y: 100 }, B: { x: 0, y: 100 }, D: { x: 400, y: 0 } },
      links: [
        { source: 'a', dest: 'c' },
        { source: 'b', dest: 'd' },
      ],
    }
    const stats = measureLayout(synthetic, shallow)
    expect(stats.crossings).toBe(1)
    expect(stats.meanCrossingAngle).toBeCloseTo(28.07, 1)
    expect(stats.shallowCrossings).toBe(1)
  })

  it('reports no angle when nothing crosses', () => {
    const none: Layout = { positions: crossed.positions, links: [] }
    expect(measureLayout(synthetic, none).meanCrossingAngle).toBe(0)
  })

  it('does not count links that merely run side by side', () => {
    const parallel: Layout = { ...crossed, positions: { ...crossed.positions, C: { x: 0, y: 300 }, D: { x: 300, y: 300 } } }
    expect(measureLayout(synthetic, parallel).crossings).toBe(0)
  })

  it('counts a link drawn across an unrelated region, but not its own endpoints', () => {
    const inline: Layout = {
      positions: { A: { x: 0, y: 0 }, B: { x: 500, y: 0 }, C: { x: 250, y: 0 }, D: { x: 0, y: 500 } },
      links: [{ source: 'a', dest: 'b' }],
    }
    const stats = measureLayout(synthetic, inline)
    expect(stats.linkOverRegion).toBe(1) // C sits on the line
    expect(stats.crossings).toBe(0)
  })

  it('does not count a region the line only touches', () => {
    const touching: Layout = {
      positions: { A: { x: 0, y: 0 }, B: { x: 500, y: 0 }, C: { x: 250, y: 50 }, D: { x: 0, y: 500 } },
      links: [{ source: 'a', dest: 'b' }],
    }
    // The line runs along y = 50, exactly the top edge of C.
    expect(measureLayout(synthetic, touching).linkOverRegion).toBe(0)
  })

  it('counts overlapping regions', () => {
    const overlapping: Layout = { positions: { A: { x: 0, y: 0 }, B: { x: 50, y: 50 } }, links: [] }
    expect(measureLayout(synthetic, overlapping).overlaps).toBe(1)
  })
})

describe('entrance hits', () => {
  // Link a-b runs along y = 50. Region C's entrance is at its centre.
  const layoutWithC = (cy: number): Layout => ({
    positions: { A: { x: 0, y: 0 }, B: { x: 500, y: 0 }, C: { x: 250, y: cy }, D: { x: 0, y: 500 } },
    links: [{ source: 'a', dest: 'b' }],
  })

  it('counts a link running over an entrance that is not its own', () => {
    expect(measureLayout(synthetic, layoutWithC(0)).entranceHits).toBe(1)
  })

  it('does not count an entrance that is clear of the link', () => {
    expect(measureLayout(synthetic, layoutWithC(100)).entranceHits).toBe(0)
  })

  it('reports a close pass as a near miss rather than a hit', () => {
    const close = measureLayout(synthetic, layoutWithC(15)) // entrance 15px from the line
    expect(close.entranceHits).toBe(0)
    expect(close.entranceNearMisses).toBe(1)
    expect(measureLayout(synthetic, layoutWithC(100)).entranceNearMisses).toBe(0)
  })

  it('penalises a near pass less than a hit, and a far pass not at all', () => {
    const weights = { entranceHit: 1000, crossing: 0, regionHit: 0, ownRegion: 0, overlap: 0, length: 0, fit: 0, extent: 0 }
    // With a single region free to move, the least-cost layout is the one with no entrance penalty.
    const tapered = arrangeLayout(synthetic, layoutWithC(15), { seed: 1, iterations: 4000, restarts: 2, weights })
    expect(tapered.after.entranceHits).toBe(0)
    expect(tapered.after.entranceNearMisses).toBe(0) // the taper pushes it clear of the band too
    const binary = arrangeLayout(synthetic, layoutWithC(15), { seed: 1, iterations: 4000, restarts: 2, weights, entranceFalloff: 0 })
    expect(binary.after.entranceHits).toBe(0) // the old rule saw nothing wrong with the 15px pass
  })

  it('reports the gap to the nearest unrelated entrance, capped at 70', () => {
    const close = measureLayout(synthetic, layoutWithC(15)) // C's entrance is 15px from the line
    expect(close.minEntranceGap).toBeCloseTo(15, 5)
    expect(close.meanEntranceGap).toBeCloseTo(15, 5)
    const far = measureLayout(synthetic, layoutWithC(100))
    expect(far.minEntranceGap).toBe(70)
    expect(far.meanEntranceGap).toBe(70)
  })

  it('reports no gap when there are no links', () => {
    const none = measureLayout(synthetic, { positions: crossed.positions, links: [] })
    expect(none.minEntranceGap).toBe(0)
    expect(none.meanEntranceGap).toBe(0)
  })

  it('the clearance term alone pushes links further from unrelated entrances', () => {
    const onlyClearance = {
      entranceHit: 0, entranceClearance: 10, crossing: 0, regionHit: 0, ownRegion: 0, overlap: 0,
      length: 0, displacement: 0, fit: 0, extent: 0,
    }
    const result = arrangeLayout(synthetic, layoutWithC(15), { seed: 1, iterations: 4000, restarts: 2, weights: onlyClearance })
    expect(result.before.minEntranceGap).toBeCloseTo(15, 5)
    expect(result.after.minEntranceGap).toBeGreaterThan(40)
  })

  it("does not count the link's own start and end entrances", () => {
    expect(measureLayout(synthetic, layoutWithC(400)).entranceHits).toBe(0)
  })

  it('arranging moves regions off entrances', () => {
    const result = arrangeLayout(synthetic, layoutWithC(0), { seed: 1, iterations: 5000, restarts: 2 })
    expect(result.before.entranceHits).toBe(1)
    expect(result.after.entranceHits).toBe(0)
  })
})

describe('links across their own regions', () => {
  // Region A's entrance is 10px from its left edge; B's is in its centre.
  const offEdge = parseBaseMap({
    Segments: {
      A: { Size: '100,100', Entrances: { a: { EnType: 0, FractionCoords: { X: 0.1, Y: 0.5 } } } },
      B: square('b'),
    },
  })
  const link = [{ source: 'a', dest: 'b' }]

  it('counts the length a link runs across its own start region beyond the shortest way out', () => {
    // From (10, 50) rightwards across A (exits at x = 100): 90 inside, of which 10 was unavoidable? No:
    // the nearest edge is 10px away, so the excess is 90 - 10 = 80.
    const across: Layout = { positions: { A: { x: 0, y: 0 }, B: { x: 500, y: 0 } }, links: link }
    expect(measureLayout(offEdge, across).ownRegionOverlap).toBeCloseTo(80, 1)
  })

  it('counts nothing when the link leaves by the nearest edge', () => {
    // B to the left of A: the link heads out of A's left edge, 10px away.
    const outward: Layout = { positions: { A: { x: 500, y: 0 }, B: { x: 0, y: 0 } }, links: link }
    expect(measureLayout(offEdge, outward).ownRegionOverlap).toBeCloseTo(0, 1)
  })
})

describe('fit to the viewport', () => {
  // Two regions side by side: the map is 300 wide and 100 tall.
  const two: Layout = { positions: { A: { x: 0, y: 0 }, B: { x: 200, y: 0 } }, links: [] }

  it('measures the width of the smallest viewport of the target shape that shows every region', () => {
    expect(measureLayout(synthetic, two, { viewAspect: 1 }).fitWidth).toBe(300) // width is binding
    expect(measureLayout(synthetic, two, { viewAspect: 4 }).fitWidth).toBe(400) // a 4:1 viewport is 400 wide to be 100 tall
  })

  it('rounds the aspect ratio to one decimal and clamps it to between 1:4 and 4:1', () => {
    expect(normalizeAspect(1.66)).toBe(1.7)
    expect(normalizeAspect(1.6)).toBe(1.6)
    expect(normalizeAspect(0.1)).toBe(0.25)
    expect(normalizeAspect(0.25)).toBe(0.25)
    expect(normalizeAspect(10)).toBe(4)
    expect(normalizeAspect(undefined)).toBe(DEFAULT_VIEW_ASPECT)
    expect(normalizeAspect(NaN)).toBe(DEFAULT_VIEW_ASPECT)
    expect(normalizeAspect(-2)).toBe(DEFAULT_VIEW_ASPECT)
  })

  it('treats nearly equal window shapes as the same', () => {
    const a = measureLayout(synthetic, two, { viewAspect: 1.63 }).fitWidth
    const b = measureLayout(synthetic, two, { viewAspect: 1.58 }).fitWidth
    expect(a).toBe(b)
  })

  it('pulls a far-away region in when nothing else prevents it', () => {
    const far: Layout = { positions: { A: { x: 0, y: 0 }, B: { x: 3000, y: 0 } }, links: [] }
    const result = arrangeLayout(synthetic, far, { seed: 1, iterations: 5000, restarts: 2 })
    expect(result.after.fitWidth).toBeLessThan(result.before.fitWidth)
  })

  // Four unlinked squares, starting as a 2x2 block.
  const grid: Layout = {
    positions: { A: { x: 0, y: 0 }, B: { x: 130, y: 0 }, C: { x: 0, y: 130 }, D: { x: 130, y: 130 } },
    links: [],
  }
  const shapeOf = (layout: Layout) => {
    const xs = Object.values(layout.positions).map((p) => p.x)
    const ys = Object.values(layout.positions).map((p) => p.y)
    return (Math.max(...xs) + 100 - Math.min(...xs)) / (Math.max(...ys) + 100 - Math.min(...ys))
  }

  it('makes the map wide for a wide viewport', () => {
    const { layout } = arrangeLayout(synthetic, grid, { seed: 1, iterations: 8000, restarts: 2, viewAspect: 4 })
    expect(shapeOf(layout)).toBeGreaterThan(2)
  })

  it('makes the map tall for a tall viewport', () => {
    const { layout } = arrangeLayout(synthetic, grid, { seed: 1, iterations: 8000, restarts: 2, viewAspect: 0.25 })
    expect(shapeOf(layout)).toBeLessThan(0.5)
  })
})

describe('search effort', () => {
  it('scales linearly with the number of regions, with a floor', () => {
    expect(defaultIterations(21)).toBeGreaterThan(39000) // the full map keeps roughly the old fixed effort
    expect(defaultIterations(21)).toBeLessThan(41000)
    expect(defaultIterations(10)).toBeCloseTo(defaultIterations(20) / 2, -1)
    expect(defaultIterations(1)).toBe(defaultIterations(0)) // the floor applies to tiny maps
    expect(defaultIterations(1)).toBeGreaterThan(0)
  })

  it('depends only on the layout: the same input always gives the same result', () => {
    const a = arrangeLayout(synthetic, crossed, { seed: 4 })
    const b = arrangeLayout(synthetic, crossed, { seed: 4 })
    expect(a.layout).toEqual(b.layout)
  })

  it('still respects an explicit iteration count', () => {
    // Zero steps means no search at all, so nothing moves (apart from re-centring on the same centre).
    const result = arrangeLayout(synthetic, crossed, { seed: 1, iterations: 0, restarts: 1 })
    expect(result.after.crossings).toBe(result.before.crossings)
  })
})

describe('arrangeLayout', () => {
  it('untangles a simple crossing without touching the links', () => {
    const result = arrangeLayout(synthetic, crossed, { seed: 1, iterations: 5000, restarts: 2 })
    expect(result.before.crossings).toBe(1)
    expect(result.after.crossings).toBe(0)
    expect(result.after.overlaps).toBe(0)
    expect(result.layout.links).toEqual(crossed.links)
    expect(Object.keys(result.layout.positions).sort()).toEqual(['A', 'B', 'C', 'D'])
  })

  it('is deterministic for a given seed and does not mutate its input', () => {
    const snapshot = JSON.stringify(crossed)
    const a = arrangeLayout(synthetic, crossed, { seed: 5, iterations: 2000, restarts: 1 })
    const b = arrangeLayout(synthetic, crossed, { seed: 5, iterations: 2000, restarts: 1 })
    expect(a.layout).toEqual(b.layout)
    expect(JSON.stringify(crossed)).toBe(snapshot)
  })

  it('leaves a single region alone', () => {
    const one: Layout = { positions: { A: { x: 10, y: 20 } }, links: [] }
    expect(arrangeLayout(synthetic, one).layout).toBe(one)
  })

  it('keeps the arrangement centred where it started', () => {
    const { layout } = arrangeLayout(synthetic, crossed, { seed: 3, iterations: 3000, restarts: 1 })
    const xs = Object.values(layout.positions).map((p) => p.x)
    const ys = Object.values(layout.positions).map((p) => p.y)
    const cx = (Math.min(...xs) + Math.max(...xs) + 100) / 2
    const cy = (Math.min(...ys) + Math.max(...ys) + 100) / 2
    expect(cx).toBeCloseTo(200, 0) // original bounding box: 0..400
    expect(cy).toBeCloseTo(200, 0)
  })
})

describe('arrangeLayout on the shuffled world', () => {
  const publicFile = (name: string): unknown =>
    JSON.parse(readFileSync(resolve(__dirname, '../../public', name), 'utf8'))
  const baseMap = parseBaseMap(publicFile('oot.basemap.json'))
  const randomized = parseLayout(publicFile('randomized.layout.json'), baseMap)
  // The search is the slow part of the suite, so run it once and let every test inspect the result.
  let cached: ReturnType<typeof arrangeLayout> | undefined
  const arranged = () => (cached ??= arrangeLayout(baseMap, randomized, { seed: 1, iterations: 20000, restarts: 2 }))

  it('removes crossings and overlaps from the randomized layout', () => {
    const result = arranged()
    expect(result.before.crossings).toBeGreaterThan(20)
    // Deliberately loose: the test uses a short search, and exact numbers depend on the cost weights.
    expect(result.after.crossings).toBeLessThan(result.before.crossings / 2)
    expect(result.after.linkOverRegion).toBeLessThan(result.before.linkOverRegion)
    expect(result.after.overlaps).toBe(0)
  })

  it('clears links running over unrelated entrances', () => {
    const result = arranged()
    expect(result.before.entranceHits).toBeGreaterThan(0)
    expect(result.after.entranceHits).toBe(0)
  })

  it('reduces links running across their own regions', () => {
    const result = arranged()
    expect(result.after.ownRegionOverlap).toBeLessThan(result.before.ownRegionOverlap)
  })
})
