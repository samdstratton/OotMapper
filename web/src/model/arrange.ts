// Automatic layout arrangement: moves regions around to improve readability.
//
// Uses simulated annealing over region positions, minimising a weighted cost. Links are straight
// lines between the actual entrance points, so everything is computed from those points (not from
// region centres). In rough order of importance the cost penalises:
//   1. links passing over an entrance that is not their own start or end   (very high)
//   2. links crossing each other, less so the closer to perpendicular       (high)
//   3. links drawn across a region they do not connect                      (medium)
//   4. links running across their own start/end regions                     (low-medium)
//   5. overlapping regions                                                  (hard-ish constraint)
//   6. long links, and a map that needs zooming out to fit the viewport     (low)
//   (an optional penalty for moving regions away from where they started exists, but is off by default)
import type { BaseMap, Coord, Layout } from './types'

export interface ArrangeWeights {
  /** Per (link, entrance) pair where the link runs over an entrance that isn't its own end. */
  entranceHit: number
  /**
   * Per link, at most this much for having an unrelated entrance close by: it falls off smoothly
   * with the distance to that link's nearest unrelated entrance, out to ENTRANCE_TAIL_RANGE.
   * Deliberately tiny, so it only breaks ties: it adds breathing room where nothing else objects.
   */
  entranceClearance: number
  /** Per pair of links that cross. */
  crossing: number
  /** Per link drawn across a region it does not connect to. */
  regionHit: number
  /** Per model pixel a link runs across its own start/end region, beyond the unavoidable part. */
  ownRegion: number
  /** Per pixel of overlap penetration between two regions (beyond the margin). */
  overlap: number
  /** Per pixel of total link length. */
  length: number
  /** Per pixel each region has moved from where it started. */
  displacement: number
  /**
   * Per pixel of "fit width": the width of the smallest viewport (of the target aspect ratio) that
   * shows every region. Minimising it means needing the least zoom-out to see the whole map.
   */
  fit: number
  /**
   * Per pixel of map width plus aspect-scaled map height. Unlike `fit` (which only cares about the
   * binding side), this stops the map spreading into the spare room on the other side.
   */
  extent: number
}

export const DEFAULT_WEIGHTS: ArrangeWeights = {
  entranceHit: 300,
  // Tuned on shuffled layouts (6 seeds): 0 -> mean gap 44, 15 -> 50 with 38% fewer near misses for
  // ~3% longer links; 40 gained little more but grew the hull ~9%. Weights of 1-6 were within noise.
  entranceClearance: 15,
  crossing: 100,
  regionHit: 60,
  ownRegion: 0.25,
  overlap: 5,
  length: 0.02,
  // Off by default: a better map matters more than resembling the previous one. Note this term was
  // also acting as an implicit compactness anchor, so removing it required a much stronger
  // compactness weight to stop the map sprawling.
  displacement: 0,
  // Tuned on shuffled layouts (6 seeds, 16:10 viewport). Stronger fit gave a tighter map but more
  // crossings and links over regions (fit 0.6 / extent 0.3: 7.0 crossings, 3.2 over regions);
  // weaker left it sprawling (fit 0.15: map 29% wider, links 16% longer).
  fit: 0.3,
  extent: 0.1,
}

/**
 * Default search effort: `restarts` independent runs, each of `defaultIterations(regions)` annealing
 * steps. The step count depends only on the number of regions (never on the clock or the machine),
 * so the result is still fully determined by the layout and the viewport shape.
 */
const DEFAULT_RESTARTS = 2
const ITERATIONS_PER_REGION = 1900 // 21 regions -> ~40000 steps, the full map's old fixed setting
const MIN_ITERATIONS = 3000

/**
 * Annealing steps per restart for a layout with this many regions. Linear in the region count:
 * on 6-, 10- and 14-region sub-maps this matched the old fixed 40000 steps for crossings, gaps and
 * links over regions while running about 3.6x, 2x and 1.5x faster. A steeper curve (n^1.5) lost
 * more quality at 14 regions.
 */
export function defaultIterations(regionCount: number): number {
  return Math.max(MIN_ITERATIONS, Math.round(ITERATIONS_PER_REGION * regionCount))
}

/** Aspect ratio (width / height) used when the caller does not supply one. */
export const DEFAULT_VIEW_ASPECT = 1.6
const MIN_VIEW_ASPECT = 0.25 // 1:4
const MAX_VIEW_ASPECT = 4 // 4:1

/**
 * Rounds a viewport aspect ratio to one decimal and clamps it to between 1:4 and 4:1. Rounding
 * means tiny window-size changes give the same arrangement; clamping keeps extreme windows sane.
 */
export function normalizeAspect(aspect: number | undefined): number {
  if (aspect === undefined || !Number.isFinite(aspect) || aspect <= 0) return DEFAULT_VIEW_ASPECT
  // Clamp first: 0.25 (exactly 1:4) is not a one-decimal value and would otherwise round up to 0.3.
  if (aspect <= MIN_VIEW_ASPECT) return MIN_VIEW_ASPECT
  if (aspect >= MAX_VIEW_ASPECT) return MAX_VIEW_ASPECT
  return Math.round(aspect * 10) / 10
}

export interface ArrangeOptions {
  seed?: number
  /** Annealing steps per restart. */
  iterations?: number
  /** Independent runs; the best is kept. */
  restarts?: number
  weights?: Partial<ArrangeWeights>
  /**
   * Width (model pixels) of the band beyond the clearance distance over which the entrance penalty
   * tapers from full to zero. 0 makes it a hard yes/no at the clearance distance.
   */
  entranceFalloff?: number
  /**
   * How much cheaper a perpendicular crossing is than a shallow one, from 0 (all crossings cost the
   * same) to 1 (perpendicular crossings are free). A crossing's cost is scaled by
   * 1 - discount * sin(angle between the links): near-parallel crossings are hard to read because
   * the links overlap for a long stretch, right-angle crossings are easy.
   */
  crossingAngleDiscount?: number
  /**
   * Aspect ratio (width / height) of the viewport the map will be viewed in. The arrangement aims to
   * need the least zoom-out to fit that shape. Rounded to one decimal and clamped to 1:4 - 4:1, so
   * the same layout gives the same result for the same (rounded) viewport shape.
   */
  viewAspect?: number
}

export interface LayoutStats {
  /** Pairs of links that cross each other. */
  crossings: number
  /** Average acute angle between crossing links, in degrees (90 = perpendicular); 0 if none cross. */
  meanCrossingAngle: number
  /** Crossings at an angle under 30 degrees, the hardest kind to read. */
  shallowCrossings: number
  /** (link, entrance) pairs where a link runs over an entrance other than its own start or end. */
  entranceHits: number
  /** (link, entrance) pairs where a link passes close to, but not over, an unrelated entrance. */
  entranceNearMisses: number
  /**
   * Smallest distance from any link to an entrance that is not its own, in model pixels (capped at
   * ENTRANCE_TAIL_RANGE; 0 if there are no links).
   */
  minEntranceGap: number
  /** Average, over all links, of the distance to that link's nearest unrelated entrance (same cap). */
  meanEntranceGap: number
  /** (link, region) pairs where a link is drawn across a region it does not connect. */
  linkOverRegion: number
  /** Total model pixels that links run across their own start/end regions (beyond the minimum). */
  ownRegionOverlap: number
  /** Pairs of regions that overlap. */
  overlaps: number
  /** Sum of link lengths, in model pixels. */
  totalLength: number
  /**
   * Width, in model pixels, of the smallest viewport of the target aspect ratio that shows every
   * region. Smaller means less zooming out is needed to see the whole map.
   */
  fitWidth: number
}

export interface ArrangeResult {
  layout: Layout
  before: LayoutStats
  after: LayoutStats
}

/** Minimum gap the search tries to keep between regions. */
const MARGIN = 30
/** A link closer than this (model pixels) to another entrance is treated as running over it. */
const ENTRANCE_CLEARANCE = 9
/** Passing an unrelated entrance closer than this (but not over it) is reported as a near miss. */
const ENTRANCE_NEAR = 30
/** Distance at which the (tiny) per-link entrance clearance term reaches zero. */
const ENTRANCE_TAIL_RANGE = 70
/**
 * Default width of the taper beyond ENTRANCE_CLEARANCE, so the penalty reaches zero at 20 units
 * (about 30 screen pixels at the default zoom). Chosen by comparing widths on shuffled layouts:
 * wider bands (to 30) cut near misses further but cost extra crossings for distances that already
 * look clear; narrower ones removed fewer near misses.
 */
const DEFAULT_ENTRANCE_FALLOFF = 11
/**
 * Default for ArrangeOptions.crossingAngleDiscount: a perpendicular crossing costs 70% of a shallow
 * one. Compared on shuffled layouts (6 seeds): 0.15 changed almost nothing; 0.3 raised the mean
 * crossing angle from 55 to 63 degrees and halved shallow crossings for about one extra crossing;
 * 0.6 doubled the crossings and, on inspection, produced busier maps for little further gain.
 */
const DEFAULT_CROSSING_ANGLE_DISCOUNT = 0.3

interface LinkGeom {
  a: number // region index at each end
  b: number
  ax: number // entrance offset from its region's top-left
  ay: number
  bx: number
  by: number
  ea: number // entrance indices, to detect shared entrances and own endpoints
  eb: number
  /** Shortest distance from each entrance to the edge of its own region. */
  edgeA: number
  edgeB: number
}

interface Problem {
  ids: string[]
  w: number[]
  h: number[]
  links: LinkGeom[]
  /** Every entrance of every placed region, as parallel arrays. */
  entRegion: Int32Array
  entX: Float64Array // offset from region top-left
  entY: Float64Array
  entIndex: Int32Array
  /** Connected groups of regions ("islands"), as lists of region indices, and each region's group. */
  groups: number[][]
  groupOf: Int32Array
  startX: Float64Array
  startY: Float64Array
  /** Width of the entrance-penalty taper beyond ENTRANCE_CLEARANCE. */
  entranceFalloff: number
  /** See ArrangeOptions.crossingAngleDiscount. */
  crossingAngleDiscount: number
  /** Normalised viewport aspect ratio (width / height); see ArrangeOptions.viewAspect. */
  aspect: number
  /** Whether evaluate() measures how far regions have moved; skipped when that weight is zero. */
  trackDisplacement: boolean
}

interface Tuning {
  entranceFalloff?: number
  crossingAngleDiscount?: number
  viewAspect?: number
}

function buildProblem(baseMap: BaseMap, layout: Layout, tuning: Tuning = {}): Problem {
  const ids = Object.keys(layout.positions)
  const index = new Map(ids.map((id, i) => [id, i]))
  const entranceIndex = new Map<string, number>()
  const entranceId = (id: string) => {
    if (!entranceIndex.has(id)) entranceIndex.set(id, entranceIndex.size)
    return entranceIndex.get(id)!
  }

  const entRegion: number[] = []
  const entX: number[] = []
  const entY: number[] = []
  const entIndex: number[] = []
  ids.forEach((segId, r) => {
    const seg = baseMap.segments[segId]
    for (const [enId, en] of Object.entries(seg.entrances)) {
      entRegion.push(r)
      entX.push(seg.width * en.frac.x)
      entY.push(seg.height * en.frac.y)
      entIndex.push(entranceId(enId))
    }
  })

  const links: LinkGeom[] = []
  for (const link of layout.links) {
    const sa = baseMap.entranceSegment.get(link.source)
    const sb = baseMap.entranceSegment.get(link.dest)
    if (sa === undefined || sb === undefined || !index.has(sa) || !index.has(sb)) continue
    const ea = baseMap.segments[sa].entrances[link.source].frac
    const eb = baseMap.segments[sb].entrances[link.dest].frac
    const wa = baseMap.segments[sa].width, ha = baseMap.segments[sa].height
    const wb = baseMap.segments[sb].width, hb = baseMap.segments[sb].height
    const ax = wa * ea.x, ay = ha * ea.y
    const bx = wb * eb.x, by = hb * eb.y
    links.push({
      a: index.get(sa)!,
      b: index.get(sb)!,
      ax, ay, bx, by,
      ea: entranceId(link.source),
      eb: entranceId(link.dest),
      edgeA: Math.max(0, Math.min(ax, wa - ax, ay, ha - ay)),
      edgeB: Math.max(0, Math.min(bx, wb - bx, by, hb - by)),
    })
  }
  // Connected groups of regions (union-find over the links).
  const parent = ids.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (const l of links) parent[find(l.a)] = find(l.b)
  const groupIndex = new Map<number, number>()
  const groups: number[][] = []
  const groupOf = new Int32Array(ids.length)
  ids.forEach((_, i) => {
    const root = find(i)
    if (!groupIndex.has(root)) groupIndex.set(root, groups.push([]) - 1)
    groups[groupIndex.get(root)!].push(i)
    groupOf[i] = groupIndex.get(root)!
  })

  return {
    ids,
    w: ids.map((id) => baseMap.segments[id].width),
    h: ids.map((id) => baseMap.segments[id].height),
    links,
    groups,
    groupOf,
    entRegion: Int32Array.from(entRegion),
    entX: Float64Array.from(entX),
    entY: Float64Array.from(entY),
    entIndex: Int32Array.from(entIndex),
    startX: Float64Array.from(ids, (id) => layout.positions[id].x),
    startY: Float64Array.from(ids, (id) => layout.positions[id].y),
    entranceFalloff: Math.max(0, tuning.entranceFalloff ?? DEFAULT_ENTRANCE_FALLOFF),
    crossingAngleDiscount: Math.min(1, Math.max(0, tuning.crossingAngleDiscount ?? DEFAULT_CROSSING_ANGLE_DISCOUNT)),
    aspect: normalizeAspect(tuning.viewAspect),
    trackDisplacement: false,
  }
}

// --- Geometry ---------------------------------------------------------------------------------

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

/** True if the two segments properly cross (touching or collinear overlap does not count). */
function segmentsCross(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number,
): boolean {
  const d1 = orient(x3, y3, x4, y4, x1, y1)
  const d2 = orient(x3, y3, x4, y4, x2, y2)
  const d3 = orient(x1, y1, x2, y2, x3, y3)
  const d4 = orient(x1, y1, x2, y2, x4, y4)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

const clipT = new Float64Array(2)

/**
 * Liang-Barsky clip of a segment against a rectangle. Returns the fraction (0-1) of the segment's
 * length that lies strictly inside the rectangle; 0 if it only touches or misses it.
 */
function insideFraction(
  x1: number, y1: number, x2: number, y2: number,
  minX: number, minY: number, maxX: number, maxY: number,
): number {
  clipT[0] = 0
  clipT[1] = 1
  const dx = x2 - x1
  const dy = y2 - y1
  if (clip(-dx, x1 - minX) && clip(dx, maxX - x1) && clip(-dy, y1 - minY) && clip(dy, maxY - y1)) {
    const f = clipT[1] - clipT[0]
    return f > 1e-6 ? f : 0
  }
  return 0
}

function clip(p: number, q: number): boolean {
  if (p === 0) return q > 0 // parallel to this edge: only strictly inside counts, so grazing a border is not a hit
  const t = q / p
  if (p < 0) {
    if (t > clipT[1]) return false
    if (t > clipT[0]) clipT[0] = t
  } else {
    if (t < clipT[0]) return false
    if (t < clipT[1]) clipT[1] = t
  }
  return true
}

// --- Cost -------------------------------------------------------------------------------------

interface Terms {
  crossings: number
  /** Sum of per-crossing penalty factors (1 for a shallow crossing, less for a steeper one). */
  crossingPenalty: number
  /** Sum of crossing angles in degrees, and how many are under 30 degrees. */
  crossingAngleSum: number
  shallowCrossings: number
  entranceHits: number
  /** Near misses (within ENTRANCE_NEAR but not over an entrance). */
  nearMisses: number
  /** Sum over links of the clearance factor: 0 when the nearest entrance is far, 1 when touching. */
  entranceTail: number
  /** Mean over links of the (capped) nearest-entrance gap, and the smallest such gap. */
  entranceGapMean: number
  entranceGapMin: number
  /** Sum of per-(link, entrance) penalty factors: 1 when over an entrance, tapering to 0. */
  entranceProximity: number
  hits: number
  ownRegion: number
  overlapPenetration: number
  overlappingPairs: number
  length: number
  displacement: number
  /** Width of the smallest viewport of the target aspect ratio that shows every region. */
  fitWidth: number
  /** Map width plus (aspect-scaled) map height: grows with total size, whichever side is binding. */
  extent: number
}

const newTerms = (): Terms => ({
  crossings: 0, crossingPenalty: 0, crossingAngleSum: 0, shallowCrossings: 0, entranceHits: 0, nearMisses: 0, entranceTail: 0, entranceGapMean: 0, entranceGapMin: 0, entranceProximity: 0, hits: 0, ownRegion: 0,
  overlapPenetration: 0, overlappingPairs: 0, length: 0, displacement: 0, fitWidth: 0, extent: 0,
})

/** Preallocated working memory for evaluate(), so the hot loop does not allocate. */
interface Scratch {
  ends: Float64Array
  /** Length of each link. */
  lens: Float64Array
  /** Bounding box of each link: minX, minY, maxX, maxY. */
  bb: Float64Array
  /** Absolute position of every entrance, computed once per evaluation. */
  entPx: Float64Array
  entPy: Float64Array
}

function newScratch(p: Problem): Scratch {
  return {
    ends: new Float64Array(p.links.length * 4),
    lens: new Float64Array(p.links.length),
    bb: new Float64Array(p.links.length * 4),
    entPx: new Float64Array(p.entIndex.length),
    entPy: new Float64Array(p.entIndex.length),
  }
}

function evaluate(p: Problem, x: Float64Array, y: Float64Array, out: Terms, s: Scratch): void {
  const { ends, bb, lens, entPx, entPy } = s
  const links = p.links
  const n = links.length
  for (let e = 0; e < entPx.length; e++) {
    entPx[e] = x[p.entRegion[e]] + p.entX[e]
    entPy[e] = y[p.entRegion[e]] + p.entY[e]
  }
  let length = 0
  for (let i = 0; i < n; i++) {
    const l = links[i]
    const k = i * 4
    const x1 = x[l.a] + l.ax, y1 = y[l.a] + l.ay, x2 = x[l.b] + l.bx, y2 = y[l.b] + l.by
    ends[k] = x1
    ends[k + 1] = y1
    ends[k + 2] = x2
    ends[k + 3] = y2
    bb[k] = x1 < x2 ? x1 : x2
    bb[k + 1] = y1 < y2 ? y1 : y2
    bb[k + 2] = x1 < x2 ? x2 : x1
    bb[k + 3] = y1 < y2 ? y2 : y1
    lens[i] = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)) // Math.hypot is much slower
    length += lens[i]
  }

  let crossings = 0
  let crossingPenalty = 0
  let crossingAngleSum = 0
  let shallowCrossings = 0
  const discount = p.crossingAngleDiscount
  for (let i = 0; i < n; i++) {
    const li = links[i]
    const ki = i * 4
    for (let j = i + 1; j < n; j++) {
      const kj = j * 4
      // Cheap reject: segments whose bounding boxes do not overlap cannot cross.
      if (bb[ki + 2] < bb[kj] || bb[kj + 2] < bb[ki] || bb[ki + 3] < bb[kj + 1] || bb[kj + 3] < bb[ki + 1]) continue
      const lj = links[j]
      if (li.ea === lj.ea || li.ea === lj.eb || li.eb === lj.ea || li.eb === lj.eb) continue
      if (segmentsCross(ends[ki], ends[ki + 1], ends[ki + 2], ends[ki + 3], ends[kj], ends[kj + 1], ends[kj + 2], ends[kj + 3])) {
        crossings++
        // sin(angle) between the links = |cross product| / (|a| |b|); 1 when perpendicular.
        const cross = (ends[ki + 2] - ends[ki]) * (ends[kj + 3] - ends[kj + 1]) - (ends[ki + 3] - ends[ki + 1]) * (ends[kj + 2] - ends[kj])
        const sinAngle = Math.min(1, Math.abs(cross) / (lens[i] * lens[j]))
        crossingPenalty += 1 - discount * sinAngle
        crossingAngleSum += (Math.asin(sinAngle) * 180) / Math.PI
        if (sinAngle < 0.5) shallowCrossings++ // under 30 degrees
      }
    }
  }

  const regions = p.ids.length
  const entCount = p.entIndex.length
  const clearance2 = ENTRANCE_CLEARANCE * ENTRANCE_CLEARANCE
  const near2 = ENTRANCE_NEAR * ENTRANCE_NEAR
  const falloff = p.entranceFalloff
  const costReach = ENTRANCE_CLEARANCE + falloff
  const tailRange2 = ENTRANCE_TAIL_RANGE * ENTRANCE_TAIL_RANGE
  // Anything farther than this cannot affect the cost or the statistics.
  const reach = Math.max(ENTRANCE_NEAR, costReach, ENTRANCE_TAIL_RANGE)
  let hits = 0
  let entranceHits = 0
  let nearMisses = 0
  let entranceProximity = 0
  let entranceTail = 0
  let gapSum = 0
  let gapMin = n === 0 ? 0 : ENTRANCE_TAIL_RANGE
  let ownRegion = 0
  for (let i = 0; i < n; i++) {
    const l = links[i]
    const k = i * 4
    const x1 = ends[k], y1 = ends[k + 1], x2 = ends[k + 2], y2 = ends[k + 3]
    const dx = x2 - x1
    const dy = y2 - y1
    const len2 = dx * dx + dy * dy
    const len = Math.sqrt(len2)

    const bMinX = bb[k], bMinY = bb[k + 1], bMaxX = bb[k + 2], bMaxY = bb[k + 3]

    // Regions the link is not attached to.
    for (let r = 0; r < regions; r++) {
      if (r === l.a || r === l.b) continue
      if (x[r] >= bMaxX || x[r] + p.w[r] <= bMinX || y[r] >= bMaxY || y[r] + p.h[r] <= bMinY) continue
      if (insideFraction(x1, y1, x2, y2, x[r], y[r], x[r] + p.w[r], y[r] + p.h[r]) > 0) hits++
    }

    // Entrances other than the link's own two.
    let nearest2 = tailRange2 // squared distance to this link's nearest unrelated entrance (capped)
    const loX = bMinX - reach, hiX = bMaxX + reach, loY = bMinY - reach, hiY = bMaxY + reach
    for (let e = 0; e < entCount; e++) {
      const px = entPx[e]
      if (px < loX || px > hiX) continue
      const py = entPy[e]
      if (py < loY || py > hiY) continue
      const idx = p.entIndex[e]
      if (idx === l.ea || idx === l.eb) continue
      let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const ddx = x1 + t * dx - px
      const ddy = y1 + t * dy - py
      const d2 = ddx * ddx + ddy * ddy
      if (d2 < nearest2) nearest2 = d2
      if (d2 < clearance2) {
        entranceHits++
        entranceProximity += 1
      } else {
        if (d2 < near2) nearMisses++
        // Full penalty over an entrance, then a smooth quadratic taper to zero at costReach.
        if (falloff > 0 && d2 < costReach * costReach) {
          const u = 1 - (Math.sqrt(d2) - ENTRANCE_CLEARANCE) / falloff
          entranceProximity += u * u
        }
      }
    }

    // One small term per link for how close its nearest unrelated entrance is (a tie-breaker).
    const gap = nearest2 < tailRange2 ? Math.sqrt(nearest2) : ENTRANCE_TAIL_RANGE
    gapSum += gap
    if (gap < gapMin) gapMin = gap
    if (gap < ENTRANCE_TAIL_RANGE) {
      const u = 1 - gap / ENTRANCE_TAIL_RANGE
      entranceTail += u * u
    }

    // The link's own start/end regions: only the part beyond the shortest way out counts.
    if (l.a === l.b) {
      const inside = insideFraction(x1, y1, x2, y2, x[l.a], y[l.a], x[l.a] + p.w[l.a], y[l.a] + p.h[l.a]) * len
      ownRegion += Math.max(0, inside - l.edgeA - l.edgeB)
    } else {
      const insideA = insideFraction(x1, y1, x2, y2, x[l.a], y[l.a], x[l.a] + p.w[l.a], y[l.a] + p.h[l.a]) * len
      const insideB = insideFraction(x1, y1, x2, y2, x[l.b], y[l.b], x[l.b] + p.w[l.b], y[l.b] + p.h[l.b]) * len
      ownRegion += Math.max(0, insideA - l.edgeA) + Math.max(0, insideB - l.edgeB)
    }
  }

  let penetration = 0
  let overlapping = 0
  let displacement = 0
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i < regions; i++) {
    if (p.trackDisplacement) {
      const mx = x[i] - p.startX[i]
      const my = y[i] - p.startY[i]
      displacement += Math.sqrt(mx * mx + my * my)
    }
    if (x[i] < minX) minX = x[i]
    if (y[i] < minY) minY = y[i]
    if (x[i] + p.w[i] > maxX) maxX = x[i] + p.w[i]
    if (y[i] + p.h[i] > maxY) maxY = y[i] + p.h[i]
    for (let j = i + 1; j < regions; j++) {
      const gapX = Math.abs(x[i] + p.w[i] / 2 - (x[j] + p.w[j] / 2)) - (p.w[i] + p.w[j]) / 2
      const gapY = Math.abs(y[i] + p.h[i] / 2 - (y[j] + p.h[j] / 2)) - (p.h[i] + p.h[j]) / 2
      // Overlap depth beyond the desired margin is the smaller of the two axis penetrations.
      const pen = Math.min(MARGIN - gapX, MARGIN - gapY)
      if (pen > 0) penetration += pen
      if (gapX < 0 && gapY < 0) overlapping++
    }
  }

  out.crossings = crossings
  out.crossingPenalty = crossingPenalty
  out.crossingAngleSum = crossingAngleSum
  out.shallowCrossings = shallowCrossings
  out.entranceHits = entranceHits
  out.nearMisses = nearMisses
  out.entranceProximity = entranceProximity
  out.entranceTail = entranceTail
  out.entranceGapMean = n === 0 ? 0 : gapSum / n
  out.entranceGapMin = gapMin
  out.hits = hits
  out.ownRegion = ownRegion
  out.overlapPenetration = penetration
  out.overlappingPairs = overlapping
  out.length = length
  out.displacement = displacement
  // How wide a viewport of the target aspect ratio must be to show the whole map. The map's height
  // is scaled by the aspect so both dimensions are in "viewport width" units.
  const boxW = regions === 0 ? 0 : maxX - minX
  const boxH = regions === 0 ? 0 : (maxY - minY) * p.aspect
  out.fitWidth = Math.max(boxW, boxH)
  out.extent = boxW + boxH
}

function cost(t: Terms, w: ArrangeWeights): number {
  return (
    t.entranceProximity * w.entranceHit +
    t.entranceTail * w.entranceClearance +
    t.crossingPenalty * w.crossing +
    t.hits * w.regionHit +
    t.ownRegion * w.ownRegion +
    t.overlapPenetration * w.overlap +
    t.length * w.length +
    t.displacement * w.displacement +
    t.fitWidth * w.fit +
    t.extent * w.extent
  )
}

function statsOf(t: Terms): LayoutStats {
  return {
    crossings: t.crossings,
    meanCrossingAngle: t.crossings > 0 ? t.crossingAngleSum / t.crossings : 0,
    shallowCrossings: t.shallowCrossings,
    entranceHits: t.entranceHits,
    entranceNearMisses: t.nearMisses,
    minEntranceGap: t.entranceGapMin,
    meanEntranceGap: t.entranceGapMean,
    linkOverRegion: t.hits,
    ownRegionOverlap: t.ownRegion,
    overlaps: t.overlappingPairs,
    totalLength: t.length,
    fitWidth: t.fitWidth,
  }
}

/** Measures a layout as it stands. `viewAspect` only affects the `fitWidth` figure. */
export function measureLayout(baseMap: BaseMap, layout: Layout, tuning: Tuning = {}): LayoutStats {
  const p = buildProblem(baseMap, layout, tuning)
  const t = newTerms()
  evaluate(p, p.startX, p.startY, t, newScratch(p))
  return statsOf(t)
}

// --- Search -----------------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const T_START = 150
const T_END = 0.3

/**
 * The entrance/region penalties start at this fraction of their weight and ramp up to full over
 * the first RAMP_FRACTION of the run. Early on that lets regions pass through "forbidden"
 * arrangements on the way to better ones; by the end the full penalties apply. The best layout is
 * always chosen using the true weights.
 */
const RAMP_START = 0.15
const RAMP_FRACTION = 0.6

function anneal(p: Problem, weights: ArrangeWeights, iterations: number, rand: () => number) {
  const n = p.ids.length
  const x = Float64Array.from(p.startX)
  const y = Float64Array.from(p.startY)
  const scratch = newScratch(p)
  const terms = newTerms()
  evaluate(p, x, y, terms, scratch)
  const currentTerms: Terms = { ...terms } // terms of the accepted state
  let best = cost(terms, weights)
  const bestX = Float64Array.from(x)
  const bestY = Float64Array.from(y)
  const ramped: ArrangeWeights = { ...weights }
  const groupX = new Float64Array(n) // saved positions while a group move is being tried
  const groupY = new Float64Array(n)

  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())
  const cooling = Math.pow(T_END / T_START, 1 / Math.max(1, iterations))
  let temperature = T_START

  for (let it = 0; it < iterations; it++, temperature *= cooling) {
    const ramp = Math.min(1, RAMP_START + ((1 - RAMP_START) * it) / Math.max(1, iterations * RAMP_FRACTION))
    ramped.entranceHit = weights.entranceHit * ramp
    ramped.regionHit = weights.regionHit * ramp
    const current = cost(currentTerms, ramped)
    const move = rand()
    const i = Math.floor(rand() * n)
    let j = -1
    const oldXi = x[i], oldYi = y[i]
    let oldXj = 0, oldYj = 0
    let group: number[] | null = null

    if (move < 0.08 && p.groups[p.groupOf[i]].length > 1) {
      // Slide a whole connected group of regions (an "island") together, keeping its internal layout.
      group = p.groups[p.groupOf[i]]
      const step = 8 + 500 * (temperature / T_START)
      const dx = gauss() * step
      const dy = gauss() * step
      for (const m of group) {
        groupX[m] = x[m]
        groupY[m] = y[m]
        x[m] += dx
        y[m] += dy
      }
    } else if (move < 0.6) {
      // Nudge one region; big steps early, fine steps late.
      const step = 4 + 300 * (temperature / T_START)
      x[i] += gauss() * step
      y[i] += gauss() * step
    } else if (move < 0.85 && n > 1) {
      // Swap two regions' centres.
      j = Math.floor(rand() * (n - 1))
      if (j >= i) j++
      oldXj = x[j]
      oldYj = y[j]
      const cix = oldXi + p.w[i] / 2, ciy = oldYi + p.h[i] / 2
      const cjx = oldXj + p.w[j] / 2, cjy = oldYj + p.h[j] / 2
      x[i] = cjx - p.w[i] / 2
      y[i] = cjy - p.h[i] / 2
      x[j] = cix - p.w[j] / 2
      y[j] = ciy - p.h[j] / 2
    } else {
      // Jump to a random spot near the current arrangement.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (let k = 0; k < n; k++) {
        minX = Math.min(minX, x[k]); maxX = Math.max(maxX, x[k])
        minY = Math.min(minY, y[k]); maxY = Math.max(maxY, y[k])
      }
      x[i] = minX - 100 + rand() * (maxX - minX + 200)
      y[i] = minY - 100 + rand() * (maxY - minY + 200)
    }

    evaluate(p, x, y, terms, scratch)
    const delta = cost(terms, ramped) - current
    if (delta <= 0 || rand() < Math.exp(-delta / temperature)) {
      Object.assign(currentTerms, terms)
      const trueCost = cost(terms, weights)
      if (trueCost < best) {
        best = trueCost
        bestX.set(x)
        bestY.set(y)
      }
    } else if (group) {
      for (const m of group) {
        x[m] = groupX[m]
        y[m] = groupY[m]
      }
    } else {
      x[i] = oldXi
      y[i] = oldYi
      if (j >= 0) {
        x[j] = oldXj
        y[j] = oldYj
      }
    }
  }
  return { best, x: bestX, y: bestY }
}

/**
 * Returns a copy of `layout` with regions moved to improve readability (see the cost terms at the
 * top of this file). Links are unchanged. Deterministic for a given seed.
 */
export function arrangeLayout(baseMap: BaseMap, layout: Layout, options: ArrangeOptions = {}): ArrangeResult {
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights }
  // "Good enough, quickly": on shuffled layouts (16 seeds) 2 restarts of ~40000 steps was ~2.8x
  // faster than the old 4 x 60000 for similar crossings, gaps and links over regions; the price was
  // ~20% longer links and a ~10% larger fit. Both are low-weight terms, so that is a fair trade.
  const p = buildProblem(baseMap, layout, options)
  p.trackDisplacement = weights.displacement !== 0
  const iterations = options.iterations ?? defaultIterations(p.ids.length)
  const restarts = options.restarts ?? DEFAULT_RESTARTS
  const seed = options.seed ?? 1

  const before = measureLayout(baseMap, layout, options)
  if (p.ids.length < 2) return { layout, before, after: before }

  let best: ReturnType<typeof anneal> | null = null
  for (let r = 0; r < restarts; r++) {
    const run = anneal(p, weights, iterations, mulberry32(seed * 1000003 + r))
    if (!best || run.best < best.best) best = run
  }

  // Keep the arrangement centred where the original was.
  const centre = (xs: ArrayLike<number>, ys: ArrayLike<number>): Coord => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (let i = 0; i < p.ids.length; i++) {
      minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i] + p.w[i])
      minY = Math.min(minY, ys[i]); maxY = Math.max(maxY, ys[i] + p.h[i])
    }
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  }
  const from = centre(p.startX, p.startY)
  const to = centre(best!.x, best!.y)
  const round = (v: number) => Math.round(v * 100) / 100

  const positions: Record<string, Coord> = {}
  p.ids.forEach((id, i) => {
    positions[id] = { x: round(best!.x[i] + from.x - to.x), y: round(best!.y[i] + from.y - to.y) }
  })
  const result: Layout = { positions, links: layout.links }
  return { layout: result, before, after: measureLayout(baseMap, result, options) }
}
