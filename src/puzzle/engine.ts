import type { Edge, PieceEdges, PuzzleConfig, PuzzlePiece, Rotation } from './types'
import { isOriented } from './types'

/** Deterministic pseudo-random from seed */
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

function buildEdges(rows: number, cols: number, seed = 42): PieceEdges[][] {
  const rand = seeded(seed)
  const grid: PieceEdges[][] = []

  for (let r = 0; r < rows; r++) {
    grid[r] = []
    for (let c = 0; c < cols; c++) {
      const top: Edge = r === 0 ? 0 : (-grid[r - 1][c].bottom as Edge)
      const left: Edge = c === 0 ? 0 : (-grid[r][c - 1].right as Edge)
      const right: Edge = c === cols - 1 ? 0 : rand() > 0.5 ? 1 : -1
      const bottom: Edge = r === rows - 1 ? 0 : rand() > 0.5 ? 1 : -1
      grid[r][c] = { top, right, bottom, left }
    }
  }
  return grid
}

/**
 * Build SVG path for a jigsaw piece in local coords.
 * Base square is [tab, tab] → [tab+size, tab+size], tabs extend outside.
 */
export function piecePath(
  edges: PieceEdges,
  size: number,
  tab: number,
): string {
  const s = size
  const t = tab
  const ox = t
  const oy = t

  const tabCurve = (side: 'top' | 'right' | 'bottom' | 'left', kind: Edge): string => {
    if (kind === 0) {
      if (side === 'top') return `L ${ox + s} ${oy}`
      if (side === 'right') return `L ${ox + s} ${oy + s}`
      if (side === 'bottom') return `L ${ox} ${oy + s}`
      return `L ${ox} ${oy}`
    }

    const out = kind === 1
    const mid = s * 0.5
    const neck = s * 0.18
    const bulge = t * 0.92

    if (side === 'top') {
      const y = oy
      const dir = out ? -1 : 1
      return [
        `L ${ox + mid - neck} ${y}`,
        `C ${ox + mid - neck} ${y + dir * bulge * 0.2}, ${ox + mid - neck * 1.6} ${y + dir * bulge}, ${ox + mid} ${y + dir * bulge}`,
        `C ${ox + mid + neck * 1.6} ${y + dir * bulge}, ${ox + mid + neck} ${y + dir * bulge * 0.2}, ${ox + mid + neck} ${y}`,
        `L ${ox + s} ${y}`,
      ].join(' ')
    }

    if (side === 'right') {
      const x = ox + s
      const dir = out ? 1 : -1
      return [
        `L ${x} ${oy + mid - neck}`,
        `C ${x + dir * bulge * 0.2} ${oy + mid - neck}, ${x + dir * bulge} ${oy + mid - neck * 1.6}, ${x + dir * bulge} ${oy + mid}`,
        `C ${x + dir * bulge} ${oy + mid + neck * 1.6}, ${x + dir * bulge * 0.2} ${oy + mid + neck}, ${x} ${oy + mid + neck}`,
        `L ${x} ${oy + s}`,
      ].join(' ')
    }

    if (side === 'bottom') {
      const y = oy + s
      const dir = out ? 1 : -1
      return [
        `L ${ox + mid + neck} ${y}`,
        `C ${ox + mid + neck} ${y + dir * bulge * 0.2}, ${ox + mid + neck * 1.6} ${y + dir * bulge}, ${ox + mid} ${y + dir * bulge}`,
        `C ${ox + mid - neck * 1.6} ${y + dir * bulge}, ${ox + mid - neck} ${y + dir * bulge * 0.2}, ${ox + mid - neck} ${y}`,
        `L ${ox} ${y}`,
      ].join(' ')
    }

    const x = ox
    const dir = out ? -1 : 1
    return [
      `L ${x} ${oy + mid + neck}`,
      `C ${x + dir * bulge * 0.2} ${oy + mid + neck}, ${x + dir * bulge} ${oy + mid + neck * 1.6}, ${x + dir * bulge} ${oy + mid}`,
      `C ${x + dir * bulge} ${oy + mid - neck * 1.6}, ${x + dir * bulge * 0.2} ${oy + mid - neck}, ${x} ${oy + mid - neck}`,
      `L ${x} ${oy}`,
    ].join(' ')
  }

  return [
    `M ${ox} ${oy}`,
    tabCurve('top', edges.top),
    tabCurve('right', edges.right),
    tabCurve('bottom', edges.bottom),
    tabCurve('left', edges.left),
    'Z',
  ].join(' ')
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load ${src}`))
    img.src = src
  })
}

function coverDraw(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
) {
  const ir = img.width / img.height
  const tr = w / h
  let dw = w
  let dh = h
  let dx = 0
  let dy = 0
  if (ir > tr) {
    dw = h * ir
    dx = (w - dw) / 2
  } else {
    dh = w / ir
    dy = (h - dh) / 2
  }
  ctx.drawImage(img, dx, dy, dw, dh)
}

function slicePieceImage(
  source: HTMLCanvasElement,
  col: number,
  row: number,
  config: PuzzleConfig,
  edges: PieceEdges,
): string {
  const { pieceSize: s, tabSize: t } = config
  const out = document.createElement('canvas')
  out.width = s + t * 2
  out.height = s + t * 2
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('Canvas unsupported')

  const path = new Path2D(piecePath(edges, s, t))
  ctx.save()
  ctx.clip(path)
  ctx.fillStyle = '#fff'
  ctx.fill(path)

  const sx = col * s - t
  const sy = row * s - t
  ctx.drawImage(source, sx, sy, s + t * 2, s + t * 2, 0, 0, s + t * 2, s + t * 2)

  // Soft directional light for a carved 3D face
  const glow = ctx.createLinearGradient(0, 0, out.width, out.height)
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.22)')
  glow.addColorStop(0.45, 'rgba(255, 255, 255, 0)')
  glow.addColorStop(1, 'rgba(0, 0, 0, 0.18)')
  ctx.fillStyle = glow
  ctx.fill(path)
  ctx.restore()

  // Bevel rim — light top-left, dark bottom-right (scale with texture size)
  const lw = Math.max(1, s / 72)
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.lineWidth = 2.25 * lw
  ctx.translate(-0.6 * lw, -0.6 * lw)
  ctx.stroke(path)
  ctx.restore()

  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.lineWidth = 2 * lw
  ctx.translate(0.7 * lw, 0.7 * lw)
  ctx.stroke(path)
  ctx.restore()

  ctx.strokeStyle = 'rgba(40, 30, 20, 0.22)'
  ctx.lineWidth = lw
  ctx.stroke(path)

  return out.toDataURL('image/png')
}

function makeCardboardBack(
  edges: PieceEdges,
  config: PuzzleConfig,
): string {
  const { pieceSize: s, tabSize: t } = config
  const out = document.createElement('canvas')
  out.width = s + t * 2
  out.height = s + t * 2
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('Canvas unsupported')

  const path = new Path2D(piecePath(edges, s, t))
  ctx.save()
  ctx.clip(path)

  const base = ctx.createLinearGradient(0, 0, out.width, out.height)
  base.addColorStop(0, '#d4c4a8')
  base.addColorStop(0.5, '#c4b396')
  base.addColorStop(1, '#b8a588')
  ctx.fillStyle = base
  ctx.fill(path)

  // fiber noise
  ctx.globalAlpha = 0.12
  for (let i = 0; i < 180; i++) {
    ctx.strokeStyle = Math.random() > 0.5 ? '#8a7a60' : '#efe6d4'
    ctx.lineWidth = 0.8
    const x = Math.random() * out.width
    const y = Math.random() * out.height
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + (Math.random() - 0.5) * 18, y + (Math.random() - 0.5) * 18)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // soft 3D wash
  const wash = ctx.createLinearGradient(0, 0, out.width, out.height)
  wash.addColorStop(0, 'rgba(255,255,255,0.2)')
  wash.addColorStop(1, 'rgba(0,0,0,0.16)')
  ctx.fillStyle = wash
  ctx.fill(path)
  ctx.restore()

  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.lineWidth = 2
  ctx.translate(-0.5, -0.5)
  ctx.stroke(path)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'
  ctx.lineWidth = 1.5
  ctx.translate(0.5, 0.5)
  ctx.stroke(path)
  ctx.setTransform(1, 0, 0, 1, 0, 0)

  return out.toDataURL('image/png')
}

function randomRotation(): Rotation {
  const opts: Rotation[] = [0, 90, 180, 270]
  return opts[Math.floor(Math.random() * opts.length)]
}

export async function createPuzzleFromImage(
  imageUrl: string,
  rows: number,
  cols: number,
  pieceSize: number,
): Promise<{ pieces: PuzzlePiece[]; config: PuzzleConfig; imageUrl: string }> {
  const tabSize = Math.round(pieceSize * 0.22)
  const config: PuzzleConfig = { rows, cols, pieceSize, tabSize }

  const img = await loadImage(imageUrl)

  // Slice at higher resolution than on-screen piece size so zoom/retina stay sharp.
  // Cap so hard puzzles (60+ pieces) don’t blow up memory with huge data URLs.
  const dpr =
    typeof window !== 'undefined'
      ? Math.min(3, Math.max(2, Math.round(window.devicePixelRatio || 2)))
      : 2
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  const fromSource = Math.floor(Math.min(srcW / cols, srcH / rows))
  const ideal = Math.round(pieceSize * dpr)
  const texPiece = Math.max(
    pieceSize,
    Math.min(ideal, fromSource || ideal, 256),
  )
  const texTab = Math.round(texPiece * 0.22)
  const texConfig: PuzzleConfig = {
    rows,
    cols,
    pieceSize: texPiece,
    tabSize: texTab,
  }

  const artW = texPiece * cols
  const artH = texPiece * rows

  const canvas = document.createElement('canvas')
  canvas.width = artW
  canvas.height = artH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unsupported')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  coverDraw(ctx, img, artW, artH)

  const edges = buildEdges(rows, cols)
  const pieces: PuzzlePiece[] = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = `p-${r}-${c}`
      pieces.push({
        id,
        row: r,
        col: c,
        edges: edges[r][c],
        x: c * pieceSize,
        y: r * pieceSize,
        groupId: id,
        imageDataUrl: slicePieceImage(canvas, c, r, texConfig, edges[r][c]),
        backDataUrl: makeCardboardBack(edges[r][c], texConfig),
        rotation: 0,
        flipped: false,
      })
    }
  }

  return {
    pieces,
    config,
    imageUrl: canvas.toDataURL('image/jpeg', 0.92),
  }
}

/**
 * Line pieces up on a single neat row (wraps if many),
 * in a random order — not the solved puzzle layout.
 * Pieces in `protectedIds` are left untouched.
 */
export function organizePieces(
  pieces: PuzzlePiece[],
  config: PuzzleConfig,
  protectedIds?: Set<string>,
): PuzzlePiece[] {
  const { pieceSize, tabSize } = config
  const gap = pieceSize + tabSize * 0.4
  const protect = protectedIds ?? new Set<string>()

  const movable = pieces.filter((p) => !protect.has(p.id))
  const locked = pieces.filter((p) => protect.has(p.id))
  if (!movable.length) return pieces

  let cx = 0
  let cy = 0
  for (const p of movable) {
    cx += p.x
    cy += p.y
  }
  cx /= movable.length
  cy /= movable.length

  const shuffled = [...movable].sort(() => Math.random() - 0.5)
  const perRow = shuffled.length <= 16 ? shuffled.length : Math.ceil(shuffled.length / 2)
  const rows = Math.ceil(shuffled.length / perRow)
  const startX = cx - (Math.min(perRow, shuffled.length) * gap) / 2
  const startY = cy - ((rows - 1) * gap) / 2

  const moved = shuffled.map((p, i) => {
    const c = i % perRow
    const r = Math.floor(i / perRow)
    return {
      ...p,
      groupId: p.id,
      x: startX + c * gap,
      y: startY + r * gap,
      rotation: 0 as const,
      flipped: false,
    }
  })

  const byId = new Map<string, PuzzlePiece>()
  for (const p of locked) byId.set(p.id, p)
  for (const p of moved) byId.set(p.id, p)
  return pieces.map((p) => byId.get(p.id) ?? p)
}

/**
 * Gather pieces close together in a random jumble (still nearby).
 * Joined groups stay together. Protected pieces are skipped.
 */
export function shufflePieces(
  pieces: PuzzlePiece[],
  config: PuzzleConfig,
  protectedIds?: Set<string>,
): PuzzlePiece[] {
  const { pieceSize, tabSize } = config
  const cell = pieceSize + tabSize * 0.15
  const protect = protectedIds ?? new Set<string>()

  const movable = pieces.filter((p) => !protect.has(p.id))
  if (!movable.length) return pieces

  let cx = 0
  let cy = 0
  for (const p of movable) {
    cx += p.x
    cy += p.y
  }
  cx /= movable.length
  cy /= movable.length

  const groupIds = [...new Set(movable.map((p) => p.groupId))]
  const slots = groupIds
    .map((id) => ({ id, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)

  const n = slots.length
  const cols = Math.ceil(Math.sqrt(n))
  const groupTarget = new Map<string, { x: number; y: number }>()

  slots.forEach((s, i) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    const jitterX = (Math.random() - 0.5) * cell * 0.35
    const jitterY = (Math.random() - 0.5) * cell * 0.35
    groupTarget.set(s.id, {
      x: cx - (cols * cell) / 2 + c * cell + jitterX,
      y: cy - (Math.ceil(n / cols) * cell) / 2 + r * cell + jitterY,
    })
  })

  const groupMembers = new Map<string, PuzzlePiece[]>()
  for (const p of movable) {
    const list = groupMembers.get(p.groupId) ?? []
    list.push(p)
    groupMembers.set(p.groupId, list)
  }

  const moved = movable.map((p) => {
    const members = groupMembers.get(p.groupId) ?? [p]
    const target = groupTarget.get(p.groupId) ?? { x: cx, y: cy }
    if (members.length === 1) {
      return { ...p, groupId: p.id, x: target.x, y: target.y }
    }
    let minX = Infinity
    let minY = Infinity
    for (const m of members) {
      minX = Math.min(minX, m.x)
      minY = Math.min(minY, m.y)
    }
    return {
      ...p,
      x: target.x + (p.x - minX),
      y: target.y + (p.y - minY),
    }
  })

  const byId = new Map<string, PuzzlePiece>()
  for (const p of pieces) {
    if (protect.has(p.id)) byId.set(p.id, p)
  }
  for (const p of moved) byId.set(p.id, p)
  return pieces.map((p) => byId.get(p.id) ?? p)
}

/** Full random deal across a region (initial deal only). */
export function dealPieces(
  pieces: PuzzlePiece[],
  boardW: number,
  boardH: number,
  pieceSize: number,
  tabSize: number,
): PuzzlePiece[] {
  const pad = tabSize
  const maxX = Math.max(pad, boardW - pieceSize - pad * 2)
  const maxY = Math.max(pad, boardH - pieceSize - pad * 2)

  return pieces.map((p) => ({
    ...p,
    groupId: p.id,
    x: pad + Math.random() * maxX,
    y: pad + Math.random() * maxY,
    rotation: randomRotation(),
    // ~35% start face-down
    flipped: Math.random() < 0.35,
  }))
}

export function areNeighbors(a: PuzzlePiece, b: PuzzlePiece): boolean {
  const dr = Math.abs(a.row - b.row)
  const dc = Math.abs(a.col - b.col)
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1)
}

export function correctOffset(
  a: PuzzlePiece,
  b: PuzzlePiece,
  pieceSize: number,
): { dx: number; dy: number } {
  return {
    dx: (b.col - a.col) * pieceSize,
    dy: (b.row - a.row) * pieceSize,
  }
}

export interface JoinResult {
  pieces: PuzzlePiece[]
  joined: boolean
  joinedPair?: [string, string]
  joinPoint?: { x: number; y: number }
}

export function tryJoinGroups(
  pieces: PuzzlePiece[],
  movedGroupId: string,
  pieceSize: number,
  threshold: number,
): JoinResult {
  const moved = pieces.filter((p) => p.groupId === movedGroupId)
  const others = pieces.filter((p) => p.groupId !== movedGroupId)

  let best: {
    a: PuzzlePiece
    b: PuzzlePiece
    err: number
    snapDx: number
    snapDy: number
  } | null = null

  for (const a of moved) {
    if (!isOriented(a)) continue
    for (const b of others) {
      if (!isOriented(b)) continue
      if (!areNeighbors(a, b)) continue
      const { dx, dy } = correctOffset(a, b, pieceSize)
      const actualDx = b.x - a.x
      const actualDy = b.y - a.y
      const err = Math.hypot(actualDx - dx, actualDy - dy)
      if (err <= threshold && (!best || err < best.err)) {
        best = {
          a,
          b,
          err,
          snapDx: b.x - dx - a.x,
          snapDy: b.y - dy - a.y,
        }
      }
    }
  }

  if (!best) return { pieces, joined: false }

  const { a, b, snapDx, snapDy } = best
  const targetGroup = b.groupId
  const next = pieces.map((p) => {
    if (p.groupId === movedGroupId) {
      return {
        ...p,
        x: p.x + snapDx,
        y: p.y + snapDy,
        groupId: targetGroup,
      }
    }
    return p
  })

  const snappedA = next.find((p) => p.id === a.id)!
  const joinPoint = {
    x: (snappedA.x + b.x) / 2 + pieceSize / 2,
    y: (snappedA.y + b.y) / 2 + pieceSize / 2,
  }

  return {
    pieces: next,
    joined: true,
    joinedPair: [a.id, b.id],
    joinPoint,
  }
}

export function groupCount(pieces: PuzzlePiece[]): number {
  return new Set(pieces.map((p) => p.groupId)).size
}

export function isComplete(pieces: PuzzlePiece[]): boolean {
  return groupCount(pieces) === 1 && pieces.every(isOriented)
}

/** Rotate a group 90° CW around its center; updates piece rotations too. */
export function rotateGroup(
  pieces: PuzzlePiece[],
  groupId: string,
  pieceSize: number,
): PuzzlePiece[] {
  const members = pieces.filter((p) => p.groupId === groupId)
  if (!members.length) return pieces

  let cx = 0
  let cy = 0
  for (const p of members) {
    cx += p.x + pieceSize / 2
    cy += p.y + pieceSize / 2
  }
  cx /= members.length
  cy /= members.length

  const memberIds = new Set(members.map((p) => p.id))

  return pieces.map((p) => {
    if (!memberIds.has(p.id)) return p
    const px = p.x + pieceSize / 2
    const py = p.y + pieceSize / 2
    const dx = px - cx
    const dy = py - cy
    // 90° CW: (x,y) -> (y, -x)
    const nx = cx + dy
    const ny = cy - dx
    return {
      ...p,
      x: nx - pieceSize / 2,
      y: ny - pieceSize / 2,
      rotation: p.rotation + 90,
    }
  })
}

export function flipPiece(pieces: PuzzlePiece[], pieceId: string): PuzzlePiece[] {
  return pieces.map((p) =>
    p.id === pieceId ? { ...p, flipped: !p.flipped } : p,
  )
}
