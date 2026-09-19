import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseBaseMap, parseLayout } from './io'
import { linkId } from './layout'
import { EntranceType } from './types'

const publicFile = (name: string): unknown =>
  JSON.parse(readFileSync(resolve(__dirname, '../../public', name), 'utf8'))

const baseMap = parseBaseMap(publicFile('oot.basemap.json'))
const layout = parseLayout(publicFile('randomized.layout.json'), baseMap)
const vanilla = parseLayout(publicFile('vanilla.layout.json'), baseMap)

const exterior = Object.values(baseMap.segments).flatMap((seg) =>
  Object.entries(seg.entrances)
    .filter(([, e]) => e.type === EntranceType.Outdoor || e.type === EntranceType.Owl)
    .map(([id, e]) => ({ id, owl: e.type === EntranceType.Owl })),
)
const outdoorIds = exterior.filter((e) => !e.owl).map((e) => e.id)
const owlIds = exterior.filter((e) => e.owl).map((e) => e.id)
const isOwl = new Set(owlIds)
const segOf = (enId: string) => baseMap.entranceSegment.get(enId)!

// Owl links are the ones with an owl as the source; everything else is an ordinary pairing.
const owlLinks = layout.links.filter((l) => isOwl.has(l.source))
const pairLinks = layout.links.filter((l) => !isOwl.has(l.source))

describe('randomized layout', () => {
  it('places every region', () => {
    expect(Object.keys(layout.positions).sort()).toEqual([...baseMap.segmentIds].sort())
  })

  it('pairs every ordinary exterior entrance with exactly one other ordinary entrance', () => {
    const paired = pairLinks.flatMap((l) => [l.source, l.dest]).sort()
    expect(paired).toEqual([...outdoorIds].sort())
    expect(pairLinks).toHaveLength(outdoorIds.length / 2)
  })

  it('never pairs an entrance with an owl in the ordinary pairing', () => {
    for (const l of pairLinks) {
      expect(isOwl.has(l.dest), `${l.source} <=> ${l.dest}`).toBe(false)
    }
  })

  it('gives each owl exactly one one-way link, with the owl as source', () => {
    expect(owlLinks.map((l) => l.source).sort()).toEqual([...owlIds].sort())
    // No link has an owl as its destination.
    expect(layout.links.filter((l) => isOwl.has(l.dest))).toHaveLength(0)
  })

  it('sends owls to ordinary entrances in a different region, never to the same one', () => {
    for (const l of owlLinks) {
      expect(isOwl.has(l.dest)).toBe(false)
      expect(segOf(l.source), `${l.source} -> ${l.dest}`).not.toBe(segOf(l.dest))
    }
    expect(new Set(owlLinks.map((l) => l.dest)).size).toBe(owlLinks.length)
  })

  it('gives owl destinations exactly two links and every other entrance exactly one', () => {
    const degree = new Map<string, number>()
    for (const l of layout.links) {
      for (const id of [l.source, l.dest]) degree.set(id, (degree.get(id) ?? 0) + 1)
    }
    const owlDests = new Set(owlLinks.map((l) => l.dest))
    for (const id of outdoorIds) {
      expect(degree.get(id), id).toBe(owlDests.has(id) ? 2 : 1)
    }
    for (const id of owlIds) expect(degree.get(id), id).toBe(1)
  })

  it('never links a region to itself or repeats a vanilla connection', () => {
    const vanillaIds = new Set(vanilla.links.map((l) => linkId(l.source, l.dest)))
    for (const l of pairLinks) {
      expect(segOf(l.source), `${l.source} <=> ${l.dest}`).not.toBe(segOf(l.dest))
      expect(vanillaIds.has(linkId(l.source, l.dest)), `${l.source} <=> ${l.dest}`).toBe(false)
    }
  })

  it('has no overlapping regions', () => {
    const ids = baseMap.segmentIds
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = [ids[i], ids[j]]
        const pa = layout.positions[a]
        const pb = layout.positions[b]
        const sa = baseMap.segments[a]
        const sb = baseMap.segments[b]
        const overlap =
          pa.x < pb.x + sb.width && pb.x < pa.x + sa.width && pa.y < pb.y + sb.height && pb.y < pa.y + sa.height
        expect(overlap, `${a} overlaps ${b}`).toBe(false)
      }
    }
  })
})
