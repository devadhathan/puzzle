import { useEffect, useMemo, useRef, useState } from 'react'
import { bind } from 'cuelume'
import { PuzzleBoard } from './components/PuzzleBoard'
import { Sidebar } from './components/Sidebar'
import { presetsFor, PUZZLES } from './puzzle/catalog'
import './App.css'

function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [puzzleId, setPuzzleId] = useState(PUZZLES[0].id)
  const [presetIndex, setPresetIndex] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    bind()
  }, [])

  const puzzle = useMemo(
    () => PUZZLES.find((p) => p.id === puzzleId) ?? PUZZLES[0],
    [puzzleId],
  )
  const presets = presetsFor(puzzle.orientation)
  const preset = presets[Math.min(presetIndex, presets.length - 1)]

  return (
    <div className="app">
      <Sidebar
        puzzleId={puzzle.id}
        presetIndex={presetIndex}
        onPuzzleChange={(id) => {
          setPuzzleId(id)
          setSelectedId(null)
        }}
        onPresetChange={(index) => {
          setPresetIndex(index)
          setSelectedId(null)
        }}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        hideToggle
        anchorRef={menuButtonRef}
      />
      <PuzzleBoard
        key={`${puzzle.id}-${preset.pieces}`}
        imageUrl={puzzle.src}
        rows={preset.rows}
        cols={preset.cols}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onOpenMenu={() => setSidebarOpen((v) => !v)}
        menuOpen={sidebarOpen}
        menuButtonRef={menuButtonRef}
      />
    </div>
  )
}

export default App
