export type Orientation = 'portrait' | 'landscape'

export interface PuzzleImage {
  id: string
  title: string
  artist: string
  src: string
  /** Matching piece grid aspect so art isn’t center-cropped into the wrong frame */
  orientation: Orientation
}

export interface PiecePreset {
  pieces: number
  cols: number
  rows: number
}

export const PUZZLES: PuzzleImage[] = [
  {
    id: 'mona',
    title: 'Mona Lisa',
    artist: 'Leonardo da Vinci',
    src: '/mona.png',
    orientation: 'portrait',
  },
  {
    id: 'pearl',
    title: 'Girl with a Pearl Earring',
    artist: 'Johannes Vermeer',
    src: '/pearl.png',
    orientation: 'portrait',
  },
  {
    id: 'starry',
    title: 'The Starry Night',
    artist: 'Vincent van Gogh',
    src: '/starry.jpg',
    orientation: 'landscape',
  },
  {
    id: 'sunflowers',
    title: 'Sunflowers',
    artist: 'Vincent van Gogh',
    src: '/sunflowers.jpg',
    orientation: 'portrait',
  },
  {
    id: 'nightcafe',
    title: 'Café Terrace at Night',
    artist: 'Vincent van Gogh',
    src: '/nightcafe.jpg',
    orientation: 'portrait',
  },
  {
    id: 'wave',
    title: 'The Great Wave',
    artist: 'Hokusai',
    src: '/wave.jpg',
    orientation: 'landscape',
  },
  {
    id: 'kiss',
    title: 'The Kiss',
    artist: 'Gustav Klimt',
    src: '/kiss.jpg',
    orientation: 'portrait',
  },
  {
    id: 'venus',
    title: 'The Birth of Venus',
    artist: 'Sandro Botticelli',
    src: '/venus.jpg',
    orientation: 'landscape',
  },
]

/** Portrait-friendly grids (taller than wide) */
export const PORTRAIT_PRESETS: PiecePreset[] = [
  { pieces: 12, cols: 3, rows: 4 },
  { pieces: 20, cols: 4, rows: 5 },
  { pieces: 24, cols: 4, rows: 6 },
  { pieces: 35, cols: 5, rows: 7 },
  { pieces: 48, cols: 6, rows: 8 },
  { pieces: 63, cols: 7, rows: 9 },
]

/** Landscape-friendly grids (wider than tall) */
export const LANDSCAPE_PRESETS: PiecePreset[] = [
  { pieces: 12, cols: 4, rows: 3 },
  { pieces: 20, cols: 5, rows: 4 },
  { pieces: 24, cols: 6, rows: 4 },
  { pieces: 35, cols: 7, rows: 5 },
  { pieces: 48, cols: 8, rows: 6 },
  { pieces: 63, cols: 9, rows: 7 },
]

/** @deprecated Prefer presetsFor(orientation) */
export const PIECE_PRESETS = PORTRAIT_PRESETS

export function presetsFor(orientation: Orientation): PiecePreset[] {
  return orientation === 'landscape' ? LANDSCAPE_PRESETS : PORTRAIT_PRESETS
}

export function presetAt(index: number, orientation: Orientation = 'portrait'): PiecePreset {
  const list = presetsFor(orientation)
  const i = Math.max(0, Math.min(list.length - 1, index))
  return list[i]
}
