import { useEffect, useRef, useState, type Dispatch, type PointerEvent, type SetStateAction } from 'react'
import { iconDrawSize, iconUrl, segmentImageUrl } from '../model/assets'
import { linkColor, linkId } from '../model/layout'
import { isExterior, type BaseMap, type Coord, type Layout } from '../model/types'
import { modelToView, panBy, viewToModel, zoomAt, type Size, type Viewport } from '../model/viewport'

const CANVAS_IDLE = 'papayawhip'
const CANVAS_LINKING = 'lightskyblue'

// Shape of the grey marker drawn at the model origin, in units of its 60x50 size.
const ORIGIN_SIZE = { width: 60, height: 50 }
const ORIGIN_POINTS: Coord[] = [
  { x: -0.5, y: -0.5 }, { x: 0, y: -0.5 }, { x: -0.25, y: 0 }, { x: 0.25, y: 0 },
  { x: 0, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0, y: 0.5 },
]

interface Props {
  baseMap: BaseMap
  layout: Layout
  viewport: Viewport
  setViewport: Dispatch<SetStateAction<Viewport>>
  /** The entrance a link is currently being drawn from, if any. */
  pendingSource: string | null
  onMoveSegment: (segmentId: string, pos: Coord) => void
  onEntranceClick: (entranceId: string) => void
  onCancelLink: () => void
  /** Called with the canvas's size in pixels at first and whenever it changes. */
  onSizeChange?: (size: Size) => void
  /** While true the layout cannot be edited (regions can't be dragged, links can't be made); the view still pans and zooms. */
  locked?: boolean
}

export default function MapCanvas({
  baseMap, layout, viewport, setViewport, pendingSource, onMoveSegment, onEntranceClick, onCancelLink, onSizeChange,
  locked = false,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const segmentDrag = useRef<{ id: string; offset: Coord } | null>(null)
  const panFrom = useRef<Coord | null>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const measure = () => {
      const next = { width: svg.clientWidth, height: svg.clientHeight }
      setSize(next)
      onSizeChange?.(next)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(svg)
    measure()
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set up once; onSizeChange only writes to a ref
  }, [])

  const canvasPos = (e: { clientX: number; clientY: number }): Coord => {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const toModel = (e: { clientX: number; clientY: number }) => viewToModel(viewport, canvasPos(e), size)
  const toView = (p: Coord) => modelToView(viewport, p, size)

  const entranceModelPos = (entranceId: string): Coord | null => {
    const segId = baseMap.entranceSegment.get(entranceId)
    const segPos = segId === undefined ? undefined : layout.positions[segId]
    if (segId === undefined || segPos === undefined) return null
    const seg = baseMap.segments[segId]
    const frac = seg.entrances[entranceId].frac
    return { x: segPos.x + seg.width * frac.x, y: segPos.y + seg.height * frac.y }
  }

  // Segment dragging (left button on a segment image).
  const segmentDown = (e: PointerEvent<SVGImageElement>, id: string) => {
    if (locked || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const m = toModel(e)
    const pos = layout.positions[id]
    segmentDrag.current = { id, offset: { x: m.x - pos.x, y: m.y - pos.y } }
  }
  const segmentMove = (e: PointerEvent<SVGImageElement>) => {
    const drag = segmentDrag.current
    if (!drag) return
    if (!(e.buttons & 1)) {
      segmentDrag.current = null
      return
    }
    const m = toModel(e)
    onMoveSegment(drag.id, { x: m.x - drag.offset.x, y: m.y - drag.offset.y })
  }
  const segmentUp = () => {
    segmentDrag.current = null
  }

  // Panning (middle button anywhere on the canvas).
  const canvasDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 1) return
    e.currentTarget.setPointerCapture(e.pointerId)
    panFrom.current = canvasPos(e)
  }
  const canvasMove = (e: PointerEvent<SVGSVGElement>) => {
    const from = panFrom.current
    if (!from) return
    if (!(e.buttons & 4)) {
      panFrom.current = null
      return
    }
    const to = canvasPos(e)
    panFrom.current = to
    setViewport((v) => panBy(v, { x: to.x - from.x, y: to.y - from.y }))
  }
  const canvasUp = () => {
    panFrom.current = null
  }

  const placedSegments = Object.keys(layout.positions)
  const originView = toView({ x: 0, y: 0 })
  const originPoints = ORIGIN_POINTS.map(
    (p) => `${originView.x + p.x * ORIGIN_SIZE.width * viewport.zoom},${originView.y - p.y * ORIGIN_SIZE.height * viewport.zoom}`,
  ).join(' ')

  const links = layout.links.flatMap((link) => {
    const a = entranceModelPos(link.source)
    const b = entranceModelPos(link.dest)
    if (!a || !b) return []
    const id = linkId(link.source, link.dest)
    const va = toView(a)
    const vb = toView(b)
    return [{ id, x1: va.x, y1: va.y, x2: vb.x, y2: vb.y }]
  })

  return (
    <svg
      ref={svgRef}
      className={locked ? 'map-canvas locked' : 'map-canvas'}
      style={{ background: pendingSource ? CANVAS_LINKING : CANVAS_IDLE }}
      onPointerDown={canvasDown}
      onPointerMove={canvasMove}
      onPointerUp={canvasUp}
      onPointerCancel={canvasUp}
      onMouseDown={(e) => e.button === 1 && e.preventDefault()}
      onWheel={(e) => {
        const focus = canvasPos(e)
        const direction = e.deltaY < 0 ? 1 : -1
        setViewport((v) => zoomAt(v, direction, focus, size))
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        onCancelLink()
      }}
    >
      <polygon points={originPoints} fill="gray" />

      {placedSegments.map((id) => {
        const seg = baseMap.segments[id]
        const p = toView(layout.positions[id])
        return (
          <image
            key={id}
            href={segmentImageUrl(id)}
            x={p.x}
            y={p.y}
            width={seg.width * viewport.zoom}
            height={seg.height * viewport.zoom}
            preserveAspectRatio="none"
            opacity={0.9} // slightly see-through so a region hidden under a larger one can still be found
            className="segment"
            onPointerDown={(e) => segmentDown(e, id)}
            onPointerMove={segmentMove}
            onPointerUp={segmentUp}
            onPointerCancel={segmentUp}
          />
        )
      })}

      {/* All outlines are drawn beneath all coloured lines, as in the WPF app. */}
      <g className="links" strokeLinecap="round" pointerEvents="none">
        {links.map((l) => (
          <line key={`o-${l.id}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="black" strokeWidth={9} />
        ))}
        {links.map((l) => (
          <line key={l.id} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={linkColor(l.id)} strokeWidth={5} />
        ))}
      </g>

      {placedSegments.flatMap((segId) =>
        Object.entries(baseMap.segments[segId].entrances).map(([enId, entrance]) => {
          const pos = toView(entranceModelPos(enId)!)
          const { width, height } = iconDrawSize(entrance.type, enId === 'Temple of Time' ? 2 : 1)
          const clickable = isExterior(entrance.type)
          return (
            <image
              key={enId}
              href={iconUrl(entrance.type)}
              x={pos.x - width / 2}
              y={pos.y - height / 2}
              width={width}
              height={height}
              className={clickable ? 'entrance clickable' : 'entrance'}
              onPointerDown={(e) => {
                if (clickable && !locked && e.button === 0) onEntranceClick(enId)
              }}
            >
              <title>{enId}</title>
            </image>
          )
        }),
      )}
    </svg>
  )
}
