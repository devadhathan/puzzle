export interface PuzzleImage {
  id: string
  title: string
  artist: string
  src: string
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
  },
  {
    id: 'pearl',
    title: 'Girl with a Pearl Earring',
    artist: 'Johannes Vermeer',
    src: '/pearl.png',
  },
  {
    id: 'starry',
    title: 'The Starry Night',
    artist: 'Vincent van Gogh',
    src: '/starry.jpg',
  },
  {
    id: 'sunflowers',
    title: 'Sunflowers',
    artist: 'Vincent van Gogh',
    src: '/sunflowers.jpg',
  },
  {
    id: 'nightcafe',
    title: 'Café Terrace at Night',
    artist: 'Vincent van Gogh',
    src: '/nightcafe.jpg',
  },
  {
    id: 'wave',
    title: 'The Great Wave',
    artist: 'Hokusai',
    src: '/wave.jpg',
  },
  {
    id: 'kiss',
    title: 'The Kiss',
    artist: 'Gustav Klimt',
    src: '/kiss.jpg',
  },
  {
    id: 'venus',
    title: 'The Birth of Venus',
    artist: 'Sandro Botticelli',
    src: '/venus.jpg',
  },
]

/** Portrait-friendly grids for the piece-count slider */
export const PIECE_PRESETS: PiecePreset[] = [
  { pieces: 12, cols: 3, rows: 4 },
  { pieces: 20, cols: 4, rows: 5 },
  { pieces: 24, cols: 4, rows: 6 },
  { pieces: 35, cols: 5, rows: 7 },
  { pieces: 48, cols: 6, rows: 8 },
  { pieces: 63, cols: 7, rows: 9 },
]

export function presetAt(index: number): PiecePreset {
  const i = Math.max(0, Math.min(PIECE_PRESETS.length - 1, index))
  return PIECE_PRESETS[i]
}
