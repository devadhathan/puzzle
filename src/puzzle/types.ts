export type Edge = 0 | 1 | -1 // flat | tab | blank
/** Degrees clockwise; may exceed 360 so CSS can animate forward smoothly */
export type Rotation = number

export interface PieceEdges {
  top: Edge
  right: Edge
  bottom: Edge
  left: Edge
}

export interface PuzzlePiece {
  id: string
  row: number
  col: number
  edges: PieceEdges
  /** Board position of piece top-left (puzzle-local coords) */
  x: number
  y: number
  groupId: string
  imageDataUrl: string
  backDataUrl: string
  /** Degrees clockwise (accumulates for smooth spin) */
  rotation: Rotation
  flipped: boolean
}

export interface PuzzleConfig {
  rows: number
  cols: number
  pieceSize: number
  tabSize: number
}

export interface DragState {
  groupId: string
  startPointerX: number
  startPointerY: number
  originPositions: Map<string, { x: number; y: number }>
}

export function nextRotation(r: Rotation): Rotation {
  return r + 90
}

export function isOriented(p: PuzzlePiece): boolean {
  return ((p.rotation % 360) + 360) % 360 === 0 && !p.flipped
}
