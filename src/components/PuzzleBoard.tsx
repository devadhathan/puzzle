import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import confetti from 'canvas-confetti'
import {
  ArrowClockwise,
  CaretDown,
  CirclesFour,
  Clock,
  GridFour,
  List,
  Moon,
  Info,
  Shuffle,
  Square,
  Waves,
} from '@phosphor-icons/react'
import type { PuzzleConfig, PuzzlePiece } from '../puzzle/types'
import {
  createPuzzleFromImage,
  dealPieces,
  flipPiece,
  groupCount,
  isComplete,
  shufflePieces,
  rotateGroup,
  tryJoinGroups,
} from '../puzzle/engine'
import { playJoinClick, playMoveSound, unlockAudio } from '../puzzle/sound'
import { formatTimer, type Surface } from '../puzzle/theme'
import './PuzzleBoard.css'

const PIECE_SIZE = 120
const SNAP_THRESHOLD = 34
const MIN_ZOOM = 0.35
const MAX_ZOOM = 2.5
/** Higher = snappier wheel zoom */
const ZOOM_SENSITIVITY = 0.0014
const ZOOM_LERP = 0.14
const INTRO_ZOOM = 0.68
const INTRO_ZOOM_LERP = 0.07

interface PuzzleBoardProps {
  imageUrl: string
  rows: number
  cols: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  onOpenMenu?: () => void
  menuOpen?: boolean
  menuButtonRef?: RefObject<HTMLButtonElement | null>
}

interface JoinBurst {
  id: number
  x: number
  y: number
}

interface Camera {
  x: number
  y: number
  zoom: number
}

interface SafeZone {
  x: number
  y: number
  w: number
  h: number
}

interface Marquee {
  x0: number
  y0: number
  x1: number
  y1: number
}

const SURFACES: { id: Surface; label: string }[] = [
  { id: 'grid', label: 'Grid' },
  { id: 'cloth', label: 'Cloth' },
  { id: 'dark', label: 'Dark' },
  { id: 'polka', label: 'Polka' },
]

function SurfaceIcon({ id, size = 18 }: { id: Surface; size?: number }) {
  const props = { size, weight: 'regular' as const, 'aria-hidden': true }
  if (id === 'grid') return <GridFour {...props} />
  if (id === 'cloth') return <Waves {...props} />
  if (id === 'dark') return <Moon {...props} />
  return <CirclesFour {...props} />
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function normalizeMarquee(m: Marquee) {
  return {
    x: Math.min(m.x0, m.x1),
    y: Math.min(m.y0, m.y1),
    w: Math.abs(m.x1 - m.x0),
    h: Math.abs(m.y1 - m.y0),
  }
}

export function PuzzleBoard({
  imageUrl,
  rows,
  cols,
  selectedId,
  onSelect,
  onOpenMenu,
  menuOpen = false,
  menuButtonRef,
}: PuzzleBoardProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [config, setConfig] = useState<PuzzleConfig | null>(null)
  const [pieces, setPieces] = useState<PuzzlePiece[]>([])
  const [zStack, setZStack] = useState<string[]>([])
  const [flashIds, setFlashIds] = useState<string[]>([])
  const [bursts, setBursts] = useState<JoinBurst[]>([])
  const [ready, setReady] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 })
  const [spaceDown, setSpaceDown] = useState(false)
  const [surface, setSurface] = useState<Surface>('grid')
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [hoverFlipId, setHoverFlipId] = useState<string | null>(null)
  const [flipReady, setFlipReady] = useState(false)
  const [flippingIds, setFlippingIds] = useState<Set<string>>(() => new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const [safeOn, setSafeOn] = useState(false)
  const [safeZone, setSafeZone] = useState<SafeZone | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [surfaceMenuOpen, setSurfaceMenuOpen] = useState(false)
  const surfaceMenuRef = useRef<HTMLDivElement>(null)
  const surfaceMenuPanelRef = useRef<HTMLDivElement>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const aboutRef = useRef<HTMLDivElement>(null)
  const aboutPanelRef = useRef<HTMLDivElement>(null)
  const refPanelRef = useRef<HTMLDivElement>(null)
  const [gridLines, setGridLines] = useState<{
    w: number
    h: number
    xs: number[]
    ys: number[]
    stroke: string
  } | null>(null)
  const animTimer = useRef<number | null>(null)
  const rotateTimer = useRef<number | null>(null)

  const runLayoutAnim = (next: PuzzlePiece[]) => {
    setAnimating(true)
    setPieces(next)
    if (animTimer.current) window.clearTimeout(animTimer.current)
    animTimer.current = window.setTimeout(() => {
      setAnimating(false)
      animTimer.current = null
    }, 780)
  }

  const dragRef = useRef<{
    mode: 'piece' | 'selection'
    groupId: string | null
    pointerId: number
    origin: Map<string, { x: number; y: number }>
    startWorldX: number
    startWorldY: number
    moved: boolean
  } | null>(null)

  const panRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  const marqueeRef = useRef<{
    pointerId: number
    x0: number
    y0: number
    x1: number
    y1: number
  } | null>(null)

  const safeDragRef = useRef<{
    pointerId: number
    startWorldX: number
    startWorldY: number
    originX: number
    originY: number
  } | null>(null)

  /** Touch: empty-canvas drag pans; tap (no move) deselects */
  const touchPanRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
    moved: boolean
  } | null>(null)

  const pinchRef = useRef<{
    pointerIds: [number, number]
    startDist: number
    startZoom: number
    mx: number
    my: number
  } | null>(null)
  const touchPointsRef = useRef<Map<number, { x: number; y: number }>>(new Map())

  const zoomAnimRef = useRef<{
    target: number
    mx: number
    my: number
    raf: number | null
    lerp: number
  }>({ target: 1, mx: 0, my: 0, raf: null, lerp: ZOOM_LERP })

  const startZoomAnimRef = useRef<(() => void) | null>(null)

  const cameraRef = useRef(camera)
  cameraRef.current = camera

  const piecesRef = useRef(pieces)
  piecesRef.current = pieces

  const pieceSizeRef = useRef(PIECE_SIZE)
  const burstId = useRef(0)
  const startedAt = useRef<number | null>(null)
  const accumulated = useRef(0)

  const tab = config?.tabSize ?? 20
  const pieceSize = config?.pieceSize ?? PIECE_SIZE
  pieceSizeRef.current = pieceSize

  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const vp = viewportRef.current
    if (!vp) return { x: 0, y: 0 }
    const rect = vp.getBoundingClientRect()
    const cam = cameraRef.current
    return {
      x: (clientX - rect.left - cam.x) / cam.zoom,
      y: (clientY - rect.top - cam.y) / cam.zoom,
    }
  }, [])

  const spawnBurst = useCallback((x: number, y: number) => {
    const id = ++burstId.current
    setBursts((prev) => [...prev, { id, x, y }])
    window.setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== id))
    }, 480)
  }, [])

  const startTimer = useCallback(() => {
    if (done) return
    if (!running) {
      startedAt.current = performance.now()
      setRunning(true)
    }
  }, [done, running])

  const init = useCallback(async () => {
    const vp = viewportRef.current
    const w = vp?.clientWidth ?? 900
    const h = vp?.clientHeight ?? 700

    const narrow = w < 640
    const maxPieceW = Math.floor((w * (narrow ? 0.78 : 0.55)) / cols)
    const maxPieceH = Math.floor((h * (narrow ? 0.52 : 0.7)) / rows)
    const cap = narrow ? 92 : PIECE_SIZE
    const floor = narrow ? 56 : 48
    const size = Math.max(floor, Math.min(cap, maxPieceW, maxPieceH))

    const { pieces: created, config: cfg, imageUrl: preview } = await createPuzzleFromImage(
      imageUrl,
      rows,
      cols,
      size,
    )

    const scatterW = Math.max(w / 0.9, cfg.pieceSize * cols * 2.2)
    const scatterH = Math.max(h / 0.9, cfg.pieceSize * rows * 2.2)
    const dealt = dealPieces(created, scatterW, scatterH, cfg.pieceSize, cfg.tabSize)

    const cx = scatterW / 2
    const cy = scatterH / 2
    const focusX = w / 2
    const focusY = h / 2
    const introZoom = narrow ? Math.min(INTRO_ZOOM, 0.58) : INTRO_ZOOM
    setCamera({
      x: focusX - cx * introZoom,
      y: focusY - cy * introZoom,
      zoom: introZoom,
    })
    zoomAnimRef.current.target = 1
    zoomAnimRef.current.mx = focusX
    zoomAnimRef.current.my = focusY
    zoomAnimRef.current.lerp = INTRO_ZOOM_LERP
    if (zoomAnimRef.current.raf != null) {
      cancelAnimationFrame(zoomAnimRef.current.raf)
      zoomAnimRef.current.raf = null
    }

    setConfig(cfg)
    setPieces(dealt)
    setZStack(dealt.map((p) => p.id))
    setPreviewUrl(preview)
    setSafeZone({
      x: cx - (cfg.cols * cfg.pieceSize) / 2,
      y: cy - (cfg.rows * cfg.pieceSize) / 2,
      w: cfg.cols * cfg.pieceSize,
      h: cfg.rows * cfg.pieceSize,
    })
    setSelectedIds(new Set())
    setReady(true)
    setFlipReady(false)
    setDone(false)
    setRunning(false)
    setElapsed(0)
    startedAt.current = null
    accumulated.current = 0
    // Enable flip transitions after first paint so dealt backs don't animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFlipReady(true)
        startZoomAnimRef.current?.()
      })
    })
  }, [imageUrl, rows, cols])

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void init()
    })
    return () => cancelAnimationFrame(id)
  }, [init])

  useEffect(() => {
    if (!running || done) return
    const id = window.setInterval(() => {
      if (startedAt.current == null) return
      setElapsed(accumulated.current + (performance.now() - startedAt.current))
    }, 200)
    return () => window.clearInterval(id)
  }, [running, done])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault()
        setSpaceDown(true)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp || !ready) return

    const tickZoom = () => {
      const anim = zoomAnimRef.current
      const cam = cameraRef.current
      const z = cam.zoom
      const lerp = anim.lerp
      const nextZoom = z + (anim.target - z) * lerp
      const settled = Math.abs(anim.target - nextZoom) < 0.00035

      const mx = anim.mx
      const my = anim.my
      const worldX = (mx - cam.x) / cam.zoom
      const worldY = (my - cam.y) / cam.zoom
      const applied = settled ? anim.target : nextZoom

      setCamera({
        zoom: applied,
        x: mx - worldX * applied,
        y: my - worldY * applied,
      })

      if (settled) {
        anim.raf = null
        anim.lerp = ZOOM_LERP
        return
      }
      anim.raf = requestAnimationFrame(tickZoom)
    }

    const startZoomAnim = () => {
      const anim = zoomAnimRef.current
      if (anim.raf == null) {
        anim.raf = requestAnimationFrame(tickZoom)
      }
    }
    startZoomAnimRef.current = startZoomAnim

    // Finish intro ease-in if still zoomed out
    if (Math.abs(zoomAnimRef.current.target - cameraRef.current.zoom) > 0.002) {
      startZoomAnim()
    }

    const onWheel = (e: WheelEvent) => {
      // Let the menu / dock / ref panel scroll natively
      const el = e.target as Element | null
      if (el?.closest?.('#puzzle-sidebar, .sidebar-inner, .bottom-dock, .ref-panel')) {
        return
      }

      e.preventDefault()
      e.stopPropagation()

      let dx = e.deltaX
      let dy = e.deltaY
      if (e.deltaMode === 1) {
        dx *= 16
        dy *= 16
      } else if (e.deltaMode === 2) {
        dx *= window.innerWidth
        dy *= window.innerHeight
      }

      // Pinch / ctrl|cmd+wheel → zoom; plain two-finger / wheel → pan
      const isZoom = e.ctrlKey || e.metaKey
      if (!isZoom) {
        setCamera((cam) => ({
          ...cam,
          x: cam.x - dx,
          y: cam.y - dy,
        }))
        return
      }

      const rect = vp.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      const cam = cameraRef.current
      const anim = zoomAnimRef.current
      const base = anim.raf != null ? anim.target : cam.zoom
      const next = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, base * Math.exp(-dy * ZOOM_SENSITIVITY)),
      )
      anim.target = next
      anim.mx = mx
      anim.my = my
      anim.lerp = ZOOM_LERP
      startZoomAnim()
    }

    // Listen on shell (capture) so zoom works over pieces, overlays, and empty canvas
    const shell = vp.parentElement ?? vp
    shell.addEventListener('wheel', onWheel, { passive: false, capture: true })

    const beginPinchIfReady = () => {
      if (touchPointsRef.current.size < 2 || pinchRef.current) return
      const ids = [...touchPointsRef.current.keys()] as [number, number]
      const a = touchPointsRef.current.get(ids[0])
      const b = touchPointsRef.current.get(ids[1])
      if (!a || !b) return
      const rect = vp.getBoundingClientRect()
      pinchRef.current = {
        pointerIds: ids,
        startDist: Math.hypot(a.x - b.x, a.y - b.y),
        startZoom: cameraRef.current.zoom,
        mx: (a.x + b.x) / 2 - rect.left,
        my: (a.y + b.y) / 2 - rect.top,
      }
      // Cancel piece / pan drags so pinch owns the gesture
      dragRef.current = null
      panRef.current = null
      touchPanRef.current = null
      setDragging(false)
    }

    const onTouchPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      if ((e.target as Element | null)?.closest?.('.bottom-dock, #puzzle-sidebar, .sidebar-inner, .ref-controls, .fig-about-panel, .fig-surface-menu, .piece-tool')) {
        return
      }
      touchPointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      beginPinchIfReady()
    }

    const onTouchPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      touchPointsRef.current.delete(e.pointerId)
      if (pinchRef.current?.pointerIds.includes(e.pointerId)) {
        pinchRef.current = null
      }
    }

    shell.addEventListener('pointerdown', onTouchPointerDown, { capture: true })
    shell.addEventListener('pointerup', onTouchPointerUp, { capture: true })
    shell.addEventListener('pointercancel', onTouchPointerUp, { capture: true })

    return () => {
      shell.removeEventListener('wheel', onWheel, { capture: true })
      shell.removeEventListener('pointerdown', onTouchPointerDown, { capture: true })
      shell.removeEventListener('pointerup', onTouchPointerUp, { capture: true })
      shell.removeEventListener('pointercancel', onTouchPointerUp, { capture: true })
      startZoomAnimRef.current = null
      if (zoomAnimRef.current.raf != null) {
        cancelAnimationFrame(zoomAnimRef.current.raf)
        zoomAnimRef.current.raf = null
      }
    }
  }, [ready])

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return

    const TARGET = 40
    const fitGrid = () => {
      const w = vp.clientWidth
      const h = vp.clientHeight
      if (w < 8 || h < 8) return
      const cols = Math.max(1, Math.round(w / TARGET))
      const rows = Math.max(1, Math.round(h / TARGET))
      // Internal lines only (no line on the border edges)
      const xs: number[] = []
      const ys: number[] = []
      for (let i = 1; i < cols; i++) xs.push(Math.round((w * i) / cols))
      for (let i = 1; i < rows; i++) ys.push(Math.round((h * i) / rows))
      const strokeEl = vp.querySelector('.viewport-canvas') ?? vp
      const stroke =
        getComputedStyle(strokeEl).getPropertyValue('--grid-line').trim() ||
        'rgba(0, 0, 0, 0.1)'
      setGridLines({ w, h, xs, ys, stroke })
    }

    fitGrid()
    const ro = new ResizeObserver(fitGrid)
    ro.observe(vp)
    return () => ro.disconnect()
  }, [ready, surface])

  const onViewportPointerDown = (e: React.PointerEvent) => {
    // Empty mouse click → deselect
    // Empty touch drag → pan (tap still deselects)
    // Space / middle mouse → pan
    // Shift + empty drag → marquee select
    if (e.button === 0 && e.target === e.currentTarget && !e.shiftKey && !spaceDown) {
      e.preventDefault()
      if (e.pointerType === 'touch') {
        touchPanRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          originX: camera.x,
          originY: camera.y,
          moved: false,
        }
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        return
      }
      setSelectedIds(new Set())
      onSelect(null)
      return
    }

    if (spaceDown || e.button === 1) {
      e.preventDefault()
      panRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: camera.x,
        originY: camera.y,
      }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      return
    }

    if (e.button === 0 && e.shiftKey && e.target === e.currentTarget) {
      e.preventDefault()
      const world = screenToWorld(e.clientX, e.clientY)
      marqueeRef.current = {
        pointerId: e.pointerId,
        x0: world.x,
        y0: world.y,
        x1: world.x,
        y1: world.y,
      }
      setMarquee({ x0: world.x, y0: world.y, x1: world.x, y1: world.y })
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
  }
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (touchPointsRef.current.has(e.pointerId)) {
        touchPointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      }

      const pinch = pinchRef.current
      if (pinch && pinch.pointerIds.includes(e.pointerId)) {
        const a = touchPointsRef.current.get(pinch.pointerIds[0])
        const b = touchPointsRef.current.get(pinch.pointerIds[1])
        if (a && b) {
          const dist = Math.hypot(a.x - b.x, a.y - b.y)
          if (pinch.startDist > 0) {
            const next = Math.min(
              MAX_ZOOM,
              Math.max(MIN_ZOOM, pinch.startZoom * (dist / pinch.startDist)),
            )
            const cam = cameraRef.current
            const worldX = (pinch.mx - cam.x) / cam.zoom
            const worldY = (pinch.my - cam.y) / cam.zoom
            setCamera({
              zoom: next,
              x: pinch.mx - worldX * next,
              y: pinch.my - worldY * next,
            })
            zoomAnimRef.current.target = next
            zoomAnimRef.current.mx = pinch.mx
            zoomAnimRef.current.my = pinch.my
          }
        }
        return
      }

      const world = screenToWorld(e.clientX, e.clientY)

      const safeDrag = safeDragRef.current
      if (safeDrag && safeDrag.pointerId === e.pointerId) {
        const dx = world.x - safeDrag.startWorldX
        const dy = world.y - safeDrag.startWorldY
        setSafeZone((z) =>
          z
            ? { ...z, x: safeDrag.originX + dx, y: safeDrag.originY + dy }
            : z,
        )
        return
      }

      const mq = marqueeRef.current
      if (mq && mq.pointerId === e.pointerId) {
        mq.x1 = world.x
        mq.y1 = world.y
        setMarquee({ x0: mq.x0, y0: mq.y0, x1: world.x, y1: world.y })
        return
      }

      const touchPan = touchPanRef.current
      if (touchPan && touchPan.pointerId === e.pointerId) {
        const dx = e.clientX - touchPan.startX
        const dy = e.clientY - touchPan.startY
        if (!touchPan.moved && Math.hypot(dx, dy) > 4) {
          touchPan.moved = true
          setSelectedIds(new Set())
          onSelect(null)
        }
        if (touchPan.moved) {
          setCamera((cam) => ({
            ...cam,
            x: touchPan.originX + dx,
            y: touchPan.originY + dy,
          }))
        }
        return
      }

      const pan = panRef.current
      if (pan && pan.pointerId === e.pointerId) {
        setCamera((cam) => ({
          ...cam,
          x: pan.originX + (e.clientX - pan.startX),
          y: pan.originY + (e.clientY - pan.startY),
        }))
        return
      }

      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return

      const dx = world.x - drag.startWorldX
      const dy = world.y - drag.startWorldY
      if (!drag.moved && Math.hypot(dx, dy) > 2) {
        drag.moved = true
        startTimer()
        playMoveSound()
      }

      setPieces((prev) =>
        prev.map((p) => {
          const o = drag.origin.get(p.id)
          if (!o) return p
          return { ...p, x: o.x + dx, y: o.y + dy }
        }),
      )
    }

    const finishIfComplete = (nextPieces: PuzzlePiece[]) => {
      if (!isComplete(nextPieces)) return nextPieces
      if (startedAt.current != null) {
        accumulated.current += performance.now() - startedAt.current
        startedAt.current = null
      }
      setElapsed(accumulated.current)
      setRunning(false)
      setDone(true)
      return nextPieces
    }

    const onUp = (e: PointerEvent) => {
      touchPointsRef.current.delete(e.pointerId)
      if (pinchRef.current?.pointerIds.includes(e.pointerId)) {
        pinchRef.current = null
      }

      if (safeDragRef.current?.pointerId === e.pointerId) {
        safeDragRef.current = null
        return
      }

      const touchPan = touchPanRef.current
      if (touchPan && touchPan.pointerId === e.pointerId) {
        touchPanRef.current = null
        if (!touchPan.moved) {
          setSelectedIds(new Set())
          onSelect(null)
        }
        return
      }

      const mq = marqueeRef.current
      if (mq && mq.pointerId === e.pointerId) {
        marqueeRef.current = null
        setMarquee(null)
        const rect = normalizeMarquee(mq)
        const size = pieceSizeRef.current
        if (rect.w < 4 && rect.h < 4) {
          setSelectedIds(new Set())
          onSelect(null)
          return
        }
        const current = piecesRef.current
        const hitGroups = new Set<string>()
        for (const p of current) {
          if (rectsOverlap({ x: p.x, y: p.y, w: size, h: size }, rect)) {
            hitGroups.add(p.groupId)
          }
        }
        const ids = current.filter((p) => hitGroups.has(p.groupId)).map((p) => p.id)
        setSelectedIds(new Set(ids))
        onSelect(ids[0] ?? null)
        return
      }

      if (panRef.current?.pointerId === e.pointerId) {
        panRef.current = null
      }

      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) {
        if (!dragRef.current) setDragging(false)
        return
      }
      dragRef.current = null
      setDragging(false)

      const size = pieceSizeRef.current
      if (drag.mode === 'piece' && drag.groupId) {
        // Join + sound outside setState so Web Audio stays in the user-gesture window
        const result = tryJoinGroups(piecesRef.current, drag.groupId, size, SNAP_THRESHOLD)
        if (result.joined && result.joinedPair) {
          playJoinClick()
          setFlashIds(result.joinedPair)
          window.setTimeout(() => setFlashIds([]), 420)
          if (result.joinPoint) spawnBurst(result.joinPoint.x, result.joinPoint.y)
        }
        setPieces(finishIfComplete(result.pieces))
        return
      }
      setPieces((prev) => finishIfComplete(prev))
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [onSelect, screenToWorld, spawnBurst, startTimer])

  const pieceById = useMemo(() => {
    const m = new Map<string, PuzzlePiece>()
    for (const p of pieces) m.set(p.id, p)
    return m
  }, [pieces])

  const groupsLeft = groupCount(pieces)
  const selectedPiece = selectedId ? pieceById.get(selectedId) ?? null : null
  const selectedGroupCount = useMemo(() => {
    const groups = new Set<string>()
    for (const p of pieces) {
      if (selectedIds.has(p.id)) groups.add(p.groupId)
    }
    return groups.size
  }, [pieces, selectedIds])
  const multiSelect = selectedGroupCount > 1
  const marqueeRect = marquee ? normalizeMarquee(marquee) : null

  const bringGroupToFront = (groupId: string) => {
    setZStack((prev) => {
      const groupIds = pieces.filter((p) => p.groupId === groupId).map((p) => p.id)
      const rest = prev.filter((id) => !groupIds.includes(id))
      return [...rest, ...groupIds]
    })
  }

  const bringIdsToFront = (ids: string[]) => {
    setZStack((prev) => {
      const idSet = new Set(ids)
      const rest = prev.filter((id) => !idSet.has(id))
      return [...rest, ...ids]
    })
  }

  const getProtectedIds = () => {
    const protectedIds = new Set<string>()
    const groupSizes = new Map<string, number>()
    for (const p of pieces) {
      groupSizes.set(p.groupId, (groupSizes.get(p.groupId) ?? 0) + 1)
    }
    for (const p of pieces) {
      if ((groupSizes.get(p.groupId) ?? 0) > 1) {
        protectedIds.add(p.id)
        continue
      }
      if (safeOn && safeZone) {
        const cx = p.x + pieceSize / 2
        const cy = p.y + pieceSize / 2
        if (
          cx >= safeZone.x &&
          cx <= safeZone.x + safeZone.w &&
          cy >= safeZone.y &&
          cy <= safeZone.y + safeZone.h
        ) {
          protectedIds.add(p.id)
        }
      }
    }
    return protectedIds
  }

  const ensureSafeZone = () => {
    setSafeZone((z) => {
      const cam = cameraRef.current
      const vp = viewportRef.current
      const vw = vp?.clientWidth ?? 900
      const vh = vp?.clientHeight ?? 700
      const worldCx = (vw / 2 - cam.x) / cam.zoom
      const worldCy = (vh / 2 - cam.y) / cam.zoom
      const cfg = config
      const boardW = cfg ? cfg.cols * cfg.pieceSize : pieceSizeRef.current * cols
      const boardH = cfg ? cfg.rows * cfg.pieceSize : pieceSizeRef.current * rows
      if (z) {
        // Keep center, refresh to exact puzzle image size/ratio
        const cx = z.x + z.w / 2
        const cy = z.y + z.h / 2
        return {
          x: cx - boardW / 2,
          y: cy - boardH / 2,
          w: boardW,
          h: boardH,
        }
      }
      return {
        x: worldCx - boardW / 2,
        y: worldCy - boardH / 2,
        w: boardW,
        h: boardH,
      }
    })
  }

  const toggleSafeZone = () => {
    if (!safeOn) {
      ensureSafeZone()
      setSafeOn(true)
    } else {
      setSafeOn(false)
    }
  }

  const selectionBounds = useMemo(() => {
    if (selectedGroupCount <= 1) return null
    const selected = pieces.filter((p) => selectedIds.has(p.id))
    if (!selected.length) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of selected) {
      minX = Math.min(minX, p.x - tab)
      minY = Math.min(minY, p.y - tab)
      maxX = Math.max(maxX, p.x + pieceSize + tab)
      maxY = Math.max(maxY, p.y + pieceSize + tab)
    }
    const pad = 6
    return {
      x: minX - pad,
      y: minY - pad,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2,
    }
  }, [pieces, selectedIds, selectedGroupCount, pieceSize, tab])

  const onPiecePointerDown = (e: React.PointerEvent, piece: PuzzlePiece) => {
    if (e.button !== 0 || spaceDown) return
    e.preventDefault()
    e.stopPropagation()
    unlockAudio()

    const world = screenToWorld(e.clientX, e.clientY)
    const origin = new Map<string, { x: number; y: number }>()

    if (selectedIds.has(piece.id)) {
      const selectedGroups = new Set<string>()
      for (const p of pieces) {
        if (selectedIds.has(p.id)) selectedGroups.add(p.groupId)
      }
      const dragIds: string[] = []
      for (const p of pieces) {
        if (selectedGroups.has(p.groupId)) {
          origin.set(p.id, { x: p.x, y: p.y })
          dragIds.push(p.id)
        }
      }
      bringIdsToFront(dragIds)
      const multi = selectedGroups.size > 1
      onSelect(piece.id)
      setDragging(true)
      dragRef.current = {
        mode: multi ? 'selection' : 'piece',
        groupId: multi ? null : piece.groupId,
        pointerId: e.pointerId,
        origin,
        startWorldX: world.x,
        startWorldY: world.y,
        moved: false,
      }
    } else {
      const groupIds = pieces.filter((p) => p.groupId === piece.groupId).map((p) => p.id)
      setSelectedIds(new Set(groupIds))
      onSelect(piece.id)
      bringGroupToFront(piece.groupId)
      for (const p of pieces) {
        if (p.groupId === piece.groupId) origin.set(p.id, { x: p.x, y: p.y })
      }
      setDragging(true)
      dragRef.current = {
        mode: 'piece',
        groupId: piece.groupId,
        pointerId: e.pointerId,
        origin,
        startWorldX: world.x,
        startWorldY: world.y,
        moved: false,
      }
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onSafeZonePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || spaceDown) return
    e.preventDefault()
    e.stopPropagation()
    if (!safeZone) return
    const world = screenToWorld(e.clientX, e.clientY)
    safeDragRef.current = {
      pointerId: e.pointerId,
      startWorldX: world.x,
      startWorldY: world.y,
      originX: safeZone.x,
      originY: safeZone.y,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handleShuffle = () => {
    if (!config) return
    runLayoutAnim(shufflePieces(pieces, config, getProtectedIds()))
    setSelectedIds(new Set())
    onSelect(null)
  }

  const handleReset = () => {
    onSelect(null)
    setSelectedIds(new Set())
    setShowPreview(false)
    setSafeOn(false)
    setReady(false)
    void init()
  }

  useEffect(() => {
    if (!done) return
    let alive = true
    const end = Date.now() + 1800
    const colors = ['#111111', '#f5c542', '#ffffff', '#4a90e2', '#e85d4c']

    confetti({
      particleCount: 90,
      spread: 70,
      origin: { y: 0.6 },
      colors,
    })

    const frame = () => {
      if (!alive) return
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.75 },
        colors,
      })
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.75 },
        colors,
      })
      if (Date.now() < end) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    return () => {
      alive = false
    }
  }, [done])

  const setSurfaceOnly = (next: Surface) => {
    // Background only — never touches piece positions / joins
    if (next !== surface) setSurface(next)
    setSurfaceMenuOpen(false)
  }

  useEffect(() => {
    if (!surfaceMenuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null
      if (!t) return
      if (surfaceMenuRef.current?.contains(t)) return
      if (surfaceMenuPanelRef.current?.contains(t)) return
      setSurfaceMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [surfaceMenuOpen])

  useEffect(() => {
    if (!aboutOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null
      if (!t) return
      if (aboutRef.current?.contains(t)) return
      if (aboutPanelRef.current?.contains(t)) return
      setAboutOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [aboutOpen])

  useEffect(() => {
    if (!showPreview) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null
      if (!t) return
      if (refPanelRef.current?.contains(t)) return
      if ((t as Element).closest?.('.ref-btn')) return
      setShowPreview(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [showPreview])

  const handleRotateSelected = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!selectedPiece || rotating || animating) return
    setRotating(true)
    setPieces((prev) => rotateGroup(prev, selectedPiece.groupId, pieceSize))
    if (rotateTimer.current) window.clearTimeout(rotateTimer.current)
    rotateTimer.current = window.setTimeout(() => {
      setRotating(false)
      rotateTimer.current = null
    }, 420)
  }

  const handleFlipPiece = (e: React.MouseEvent, pieceId: string) => {
    e.stopPropagation()
    e.preventDefault()
    setFlippingIds((prev) => new Set(prev).add(pieceId))
    setPieces((prev) => flipPiece(prev, pieceId))
    onSelect(pieceId)
    window.setTimeout(() => {
      setFlippingIds((prev) => {
        const next = new Set(prev)
        next.delete(pieceId)
        return next
      })
    }, 650)
  }

  const zIndexOf = (id: string) => {
    const i = zStack.indexOf(id)
    return i === -1 ? 1 : i + 1
  }

  return (
    <div
      className={`board-shell surface-${surface}`}
      data-theme={surface === 'dark' ? 'dark' : 'light'}
      onPointerDownCapture={() => unlockAudio()}
    >
      <div
        ref={viewportRef}
        className={`viewport ${ready ? 'is-ready' : ''} ${spaceDown ? 'is-panning' : ''} ${dragging ? 'is-dragging' : ''}`}
        onPointerDown={onViewportPointerDown}
      >
        {/* Canvas backdrop only — never moves/resets pieces */}
        <div className={`viewport-canvas canvas-${surface}`} aria-hidden>
          {(surface === 'grid' || surface === 'dark') && gridLines && (
            <svg
              className="viewport-grid"
              width={gridLines.w}
              height={gridLines.h}
              viewBox={`0 0 ${gridLines.w} ${gridLines.h}`}
            >
              {gridLines.xs.map((x) => (
                <line
                  key={`v-${x}`}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={gridLines.h}
                  stroke={gridLines.stroke}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
              ))}
              {gridLines.ys.map((y) => (
                <line
                  key={`h-${y}`}
                  x1={0}
                  y1={y}
                  x2={gridLines.w}
                  y2={y}
                  stroke={gridLines.stroke}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
              ))}
            </svg>
          )}
        </div>

        <div
          className="world"
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          }}
        >
          {safeOn && safeZone && (
            <div
              className="safe-zone"
              style={{
                left: safeZone.x,
                top: safeZone.y,
                width: safeZone.w,
                height: safeZone.h,
                ['--safe-cell' as string]: `${pieceSize}px`,
              }}
              onPointerDown={onSafeZonePointerDown}
            >
              <div className="safe-zone-board">
                <div className="safe-zone-grid" aria-hidden />
                <div className="safe-zone-label">SAFE</div>
              </div>
            </div>
          )}

          {pieces.map((piece) => {
            const selected = selectedId === piece.id || selectedIds.has(piece.id)
            const flashing = flashIds.includes(piece.id)
            const showFlipHover = piece.flipped && (hoverFlipId === piece.id || selected)
            const isFlipping = flippingIds.has(piece.id)
            const aloneSelected = selected && !multiSelect

            return (
              <div
                key={piece.id}
                className={[
                  'piece-wrap',
                  aloneSelected ? 'is-active' : '',
                  flashing ? 'is-join' : '',
                  animating ? 'is-gliding' : '',
                  rotating ? 'is-rotating' : '',
                  piece.flipped ? 'is-flipped' : '',
                  flipReady ? 'can-flip' : '',
                  isFlipping ? 'is-flipping' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  left: piece.x - tab,
                  top: piece.y - tab,
                  width: pieceSize + tab * 2,
                  height: pieceSize + tab * 2,
                  zIndex: isFlipping ? 2000 : zIndexOf(piece.id),
                }}
                onPointerEnter={() => {
                  if (piece.flipped) setHoverFlipId(piece.id)
                }}
                onPointerLeave={() => {
                  setHoverFlipId((id) => (id === piece.id ? null : id))
                }}
              >
                <button
                  type="button"
                  className="piece"
                  style={{
                    transform: `rotate(${piece.rotation}deg)`,
                  }}
                  onPointerDown={(e) => onPiecePointerDown(e, piece)}
                  aria-label={`Piece ${piece.row + 1}, ${piece.col + 1}`}
                >
                  <span className="piece-flip">
                    <span className="piece-face piece-front">
                      <img src={piece.imageDataUrl} alt="" draggable={false} />
                    </span>
                    <span className="piece-face piece-back">
                      <img src={piece.backDataUrl} alt="" draggable={false} />
                    </span>
                  </span>
                </button>

                {selected && !dragging && !multiSelect && (
                  <button
                    type="button"
                    className="piece-tool rotate-tool"
                    title="Rotate 90°"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={handleRotateSelected}
                  >
                    <ArrowClockwise size={16} weight="regular" aria-hidden />
                  </button>
                )}

                {showFlipHover && !dragging && !isFlipping && (
                  <button
                    type="button"
                    className="piece-tool flip-tool"
                    title="Flip to front"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => handleFlipPiece(e, piece.id)}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path
                        d="M3 4.5h7.5a2.5 2.5 0 0 1 0 5H8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                      <path
                        d="M5.5 7 3 4.5 5.5 2"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M13 11.5H5.5a2.5 2.5 0 0 1 0-5H8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                      <path
                        d="M10.5 9 13 11.5 10.5 14"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
              </div>
            )
          })}

          {selectionBounds && (
            <div
              className="selection-bounds"
              style={{
                left: selectionBounds.x,
                top: selectionBounds.y,
                width: selectionBounds.w,
                height: selectionBounds.h,
              }}
              aria-hidden
            />
          )}

          {marqueeRect && (marqueeRect.w > 0 || marqueeRect.h > 0) && (
            <div
              className="marquee"
              style={{
                left: marqueeRect.x,
                top: marqueeRect.y,
                width: marqueeRect.w,
                height: marqueeRect.h,
              }}
              aria-hidden
            />
          )}

          {bursts.map((burst) => (
            <div
              key={burst.id}
              className="join-burst"
              style={{ left: burst.x, top: burst.y }}
              aria-hidden
            >
              <span className="join-marks" />
            </div>
          ))}
        </div>
      </div>

      <div className="bottom-chrome">
      <div className="bottom-dock">
        <nav className="fig-bar" aria-label="Controls">
        <div className="fig-cluster">
          {onOpenMenu && (
            <div className="fig-menu-wrap">
              <button
                ref={menuButtonRef}
                type="button"
                className={`fig-btn ${menuOpen ? 'is-on' : ''}`}
                onClick={onOpenMenu}
                title="Puzzle menu"
                aria-expanded={menuOpen}
                data-cuelume-toggle
              >
                <List size={18} weight="regular" aria-hidden />
              </button>
            </div>
          )}
          <button
            type="button"
            className={`fig-btn ${safeOn ? 'is-on' : ''}`}
            onClick={toggleSafeZone}
            title={safeOn ? 'Hide safe zone' : 'Show safe zone'}
            data-cuelume-toggle
          >
            <Square size={18} weight="regular" aria-hidden />
          </button>
          <button type="button" className="fig-btn" onClick={handleShuffle} title="Shuffle" data-cuelume-press data-cuelume-release>
            <Shuffle size={18} weight="regular" aria-hidden />
          </button>
        </div>

        <span className="fig-sep" aria-hidden />

        <div className="fig-surface-wrap" ref={surfaceMenuRef}>
          <button
            type="button"
            className={`fig-btn fig-surface-trigger ${surfaceMenuOpen ? 'is-on' : ''}`}
            onClick={() => {
              setSurfaceMenuOpen((v) => !v)
              setAboutOpen(false)
              setShowPreview(false)
            }}
            title="Canvas background"
            aria-expanded={surfaceMenuOpen}
            aria-haspopup="listbox"
            data-cuelume-toggle
          >
            <SurfaceIcon id={surface} />
            <CaretDown className="fig-chevron" size={12} weight="bold" aria-hidden />
          </button>
        </div>

        {surfaceMenuOpen &&
          createPortal(
            <div
              ref={surfaceMenuPanelRef}
              className={`fig-surface-menu is-portal surface-menu-${surface}`}
              role="listbox"
              aria-label="Canvas background"
            >
              {SURFACES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={surface === s.id}
                  className={`fig-surface-option ${surface === s.id ? 'is-active' : ''}`}
                  onClick={() => setSurfaceOnly(s.id)}
                  data-cuelume-press
                  data-cuelume-release
                >
                  <SurfaceIcon id={s.id} />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )}

        <button type="button" className="fig-btn" onClick={handleReset} title="Reset" data-cuelume-press data-cuelume-release>
          <ArrowClockwise size={18} weight="regular" aria-hidden />
        </button>

        <span className="fig-sep" aria-hidden />

        <div className="fig-cluster fig-meta">
          <div className="fig-timer" title="Timer">
            <Clock size={14} weight="regular" aria-hidden />
            <span>{formatTimer(elapsed)}</span>
            {done && <span className="fig-done">done</span>}
          </div>
          <div className="fig-groups" title="Groups left">
            {groupsLeft}
          </div>
        </div>

        <span className="fig-sep" aria-hidden />

        <div className="fig-about-wrap" ref={aboutRef}>
          <button
            type="button"
            className={`fig-btn ${aboutOpen ? 'is-on' : ''}`}
            onClick={() => {
              setAboutOpen((v) => !v)
              setSurfaceMenuOpen(false)
              setShowPreview(false)
            }}
            title="About me"
            aria-expanded={aboutOpen}
            aria-haspopup="dialog"
            data-cuelume-toggle
          >
            <Info size={18} weight="regular" aria-hidden />
          </button>
        </div>
      </nav>
      </div>

      {previewUrl && (
        <div className="ref-controls">
          <button
            type="button"
            className={`ref-btn ${showPreview ? 'is-open' : ''}`}
            onClick={() => {
              setShowPreview((v) => !v)
              setSurfaceMenuOpen(false)
              setAboutOpen(false)
            }}
            title={showPreview ? 'Hide reference' : 'Show reference'}
            data-cuelume-toggle
          >
            <img src={previewUrl} alt="Puzzle reference" draggable={false} />
          </button>
        </div>
      )}
      </div>

      {aboutOpen &&
        createPortal(
          <div
            ref={aboutPanelRef}
            className={`fig-about-panel is-portal surface-menu-${surface}`}
            role="dialog"
            aria-label="About me"
          >
            <p className="fig-about-kicker">Made by</p>
            <p className="fig-about-name">Devadhathan</p>
            <p className="fig-about-bio">
              Product designer. Tiny details, calm interfaces, and the occasional puzzle.
            </p>
            <a
              className="fig-about-link"
              href="https://www.devadhathan.com"
              target="_blank"
              rel="noreferrer"
            >
              About me →
            </a>
          </div>,
          document.body,
        )}

      {showPreview &&
        previewUrl &&
        createPortal(
          <div
            ref={refPanelRef}
            className={`ref-panel is-portal surface-menu-${surface}`}
            role="dialog"
            aria-label="Reference image"
          >
            <img src={previewUrl} alt="Full puzzle preview" draggable={false} />
          </div>,
          document.body,
        )}

      {done && (
        <div className="complete-banner" role="status">
          <p className="complete-kicker">Complete</p>
          <p className="complete-time">{formatTimer(elapsed)}</p>
        </div>
      )}
    </div>
  )
}
