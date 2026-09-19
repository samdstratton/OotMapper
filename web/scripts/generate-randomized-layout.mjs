// Generates a fully shuffled entrance layout (same JSON format as vanilla.layout.json).
// Usage: node scripts/generate-randomized-layout.mjs [seed] [outFile]
//
// Rules of the shuffle:
//  - Every ordinary exterior entrance is paired with exactly one other ordinary exterior entrance
//    (owls do not count as a partner). No pair joins two entrances of the same region, or repeats
//    a vanilla connection.
//  - Each owl drop links one-way to a random ordinary exterior entrance in a different region, so
//    that entrance ends up with two links. No two owls share a destination.
//  - The world is NOT required to be connected: groups of regions may form isolated "islands".
// Regions are then placed by a small spring/overlap simulation: linked regions end up near each other.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const seed = Number(process.argv[2] ?? 1)
const outFile = process.argv[3] ?? fileURLToPath(new URL('../public/randomized.layout.json', import.meta.url))
const publicFile = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url))

const baseMap = JSON.parse(readFileSync(publicFile('oot.basemap.json'), 'utf8'))
const vanilla = JSON.parse(readFileSync(publicFile('vanilla.layout.json'), 'utf8'))

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(seed)
const shuffle = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// --- Entrances and segments -------------------------------------------------------------------
const segments = {}
const entrances = [] // exterior only: Outdoor (0) and Owl (1)
for (const [segId, seg] of Object.entries(baseMap.Segments)) {
  const [w, h] = seg.Size.split(',').map(Number)
  segments[segId] = { w, h }
  for (const [id, en] of Object.entries(seg.Entrances)) {
    if (en.EnType <= 1) entrances.push({ id, seg: segId, owl: en.EnType === 1 })
  }
}
const byId = Object.fromEntries(entrances.map((e) => [e.id, e]))
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)
const vanillaPairs = new Set(vanilla.Links.map((l) => pairKey(l.Source, l.Dest)))
const outdoors = entrances.filter((e) => !e.owl)
const owls = entrances.filter((e) => e.owl)
if (outdoors.length % 2 !== 0) throw new Error('Odd number of ordinary exterior entrances')

// --- Random pairing -----------------------------------------------------------------------------
function randomPairs() {
  for (let attempt = 1; attempt <= 200000; attempt++) {
    const order = shuffle(outdoors)
    const pairs = []
    let ok = true
    for (let i = 0; i < order.length && ok; i += 2) {
      const a = order[i]
      const b = order[i + 1]
      ok = a.seg !== b.seg && !vanillaPairs.has(pairKey(a.id, b.id))
      pairs.push([a.id, b.id])
    }
    if (ok) return { pairs, attempt }
  }
  throw new Error('Could not find a valid pairing')
}
const { pairs: outdoorPairs, attempt } = randomPairs()

// Each owl flies one-way to its own randomly chosen ordinary entrance in another region.
const owlLinks = []
const owlDestinations = new Set()
for (const owl of owls) {
  const dest = shuffle(outdoors).find((e) => e.seg !== owl.seg && !owlDestinations.has(e.id))
  if (!dest) throw new Error(`No available destination for ${owl.id}`)
  owlDestinations.add(dest.id)
  owlLinks.push([owl.id, dest.id])
}
const pairs = [...outdoorPairs, ...owlLinks]

// --- Placement ------------------------------------------------------------------------------------
const ids = Object.keys(segments)
const weight = new Map() // number of links between two segments
for (const [a, b] of pairs) {
  const k = pairKey(byId[a].seg, byId[b].seg)
  weight.set(k, (weight.get(k) ?? 0) + 1)
}

// Start on a ring, ordered by a breadth-first walk of each island in turn, so that linked regions
// begin close together.
const neighbours = Object.fromEntries(ids.map((s) => [s, []]))
for (const k of weight.keys()) {
  const [x, y] = k.split('|')
  neighbours[x].push(y)
  neighbours[y].push(x)
}
const ring = []
const queued = new Set()
for (const first of ids) {
  if (queued.has(first)) continue
  queued.add(first)
  for (const queue = [first]; queue.length; ) {
    const s = queue.shift()
    ring.push(s)
    for (const n of neighbours[s]) if (!queued.has(n)) (queued.add(n), queue.push(n))
  }
}
const c = {} // segment centres
ring.forEach((s, i) => {
  const angle = (i / ring.length) * Math.PI * 2
  c[s] = { x: Math.cos(angle) * 900, y: Math.sin(angle) * 900 }
})

const MARGIN = 40
function separate(iterations) {
  for (let it = 0; it < iterations; it++) {
    let moved = false
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]
        const b = ids[j]
        const dx = c[b].x - c[a].x
        const dy = c[b].y - c[a].y
        const px = (segments[a].w + segments[b].w) / 2 + MARGIN - Math.abs(dx)
        const py = (segments[a].h + segments[b].h) / 2 + MARGIN - Math.abs(dy)
        if (px > 0 && py > 0) {
          moved = true
          if (px < py) {
            const push = px / 2 + 0.5
            const dir = dx >= 0 ? 1 : -1
            c[a].x -= dir * push
            c[b].x += dir * push
          } else {
            const push = py / 2 + 0.5
            const dir = dy >= 0 ? 1 : -1
            c[a].y -= dir * push
            c[b].y += dir * push
          }
        }
      }
    }
    if (!moved) return true
  }
  return false
}

for (let step = 0; step < 600; step++) {
  const cooling = 1 - step / 600
  // Springs along links.
  for (const [k, w] of weight) {
    const [a, b] = k.split('|')
    const dx = c[b].x - c[a].x
    const dy = c[b].y - c[a].y
    const d = Math.hypot(dx, dy) || 1
    const rest = (Math.hypot(segments[a].w, segments[a].h) + Math.hypot(segments[b].w, segments[b].h)) / 2 * 0.9 + MARGIN
    const f = (d - rest) * 0.02 * Math.min(w, 2) * cooling
    c[a].x += (dx / d) * f
    c[a].y += (dy / d) * f
    c[b].x -= (dx / d) * f
    c[b].y -= (dy / d) * f
  }
  // Soft global repulsion so unlinked regions do not pile up.
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]
      const b = ids[j]
      const dx = c[b].x - c[a].x
      const dy = c[b].y - c[a].y
      const d2 = dx * dx + dy * dy || 1
      const f = (60000 / d2) * cooling
      const d = Math.sqrt(d2)
      c[a].x -= (dx / d) * f
      c[a].y -= (dy / d) * f
      c[b].x += (dx / d) * f
      c[b].y += (dy / d) * f
    }
  }
  separate(3)
}
if (!separate(5000)) throw new Error('Could not separate overlapping regions')

// Centre the whole arrangement on the origin (the default view centre).
const minX = Math.min(...ids.map((s) => c[s].x - segments[s].w / 2))
const maxX = Math.max(...ids.map((s) => c[s].x + segments[s].w / 2))
const minY = Math.min(...ids.map((s) => c[s].y - segments[s].h / 2))
const maxY = Math.max(...ids.map((s) => c[s].y + segments[s].h / 2))
const ox = (minX + maxX) / 2
const oy = (minY + maxY) / 2

// --- Output -----------------------------------------------------------------------------------------
const Positions = {}
for (const s of ids) {
  Positions[s] = {
    X: Math.round((c[s].x - segments[s].w / 2 - ox) * 100) / 100,
    Y: Math.round((c[s].y - segments[s].h / 2 - oy) * 100) / 100,
  }
}
const Links = pairs.map(([a, b]) => ({ Source: a, Dest: b })) // owl links have the owl as Source
writeFileSync(outFile, JSON.stringify({ Positions, Links }, null, 2) + '\n')

// Report the islands (connected groups of regions, ignoring link direction).
const parent = Object.fromEntries(ids.map((s) => [s, s]))
const find = (s) => (parent[s] === s ? s : (parent[s] = find(parent[s])))
for (const [a, b] of pairs) parent[find(byId[a].seg)] = find(byId[b].seg)
const islands = {}
for (const s of ids) (islands[find(s)] ??= []).push(s)
const groups = Object.values(islands).sort((a, b) => b.length - a.length)

console.log(`seed ${seed}: ${Links.length} links (found on attempt ${attempt}), ${ids.length} regions -> ${outFile}`)
console.log(`islands: ${groups.length} (sizes ${groups.map((g) => g.length).join(', ')})`)
console.log(`extent ${Math.round(maxX - minX)} x ${Math.round(maxY - minY)}`)
