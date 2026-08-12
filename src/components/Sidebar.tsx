import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { PIECE_PRESETS, PUZZLES, type PiecePreset } from '../puzzle/catalog'
import './Sidebar.css'

interface SidebarProps {
  puzzleId: string
  presetIndex: number
  onPuzzleChange: (id: string) => void
  onPresetChange: (index: number) => void
  open: boolean
  onToggle: () => void
  hideToggle?: boolean
  anchorRef?: RefObject<HTMLElement | null>
}

export function Sidebar({
  puzzleId,
  presetIndex,
  onPuzzleChange,
  onPresetChange,
  open,
  onToggle,
  hideToggle = false,
  anchorRef,
}: SidebarProps) {
  const preset: PiecePreset = PIECE_PRESETS[presetIndex]
  const max = PIECE_PRESETS.length - 1
  const fillPct = max === 0 ? 0 : (presetIndex / max) * 100
  const panelRef = useRef<HTMLElement>(null)
  const [pos, setPos] = useState({ left: 16, bottom: 80 })

  useLayoutEffect(() => {
    if (!open) return

    const update = () => {
      const el = anchorRef?.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setPos({
        left: Math.max(12, Math.min(r.left, window.innerWidth - 352)),
        bottom: Math.max(12, window.innerHeight - r.top + 10),
      })
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null
      if (!t) return
      if (panelRef.current?.contains(t)) return
      if (anchorRef?.current?.contains(t)) return
      onToggle()
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, onToggle, anchorRef])

  const panel = (
    <aside
      ref={panelRef}
      id="puzzle-sidebar"
      className={`sidebar ${open ? 'is-open' : ''}`}
      aria-hidden={!open}
      style={{ left: pos.left, bottom: pos.bottom }}
    >
      <div className="sidebar-inner">
        <div className="sidebar-top">
          <div>
            <p className="sidebar-kicker">Puzzle</p>
            <h2 className="sidebar-title">Choose image</h2>
          </div>
          <span className="piece-pill">{preset.pieces} pcs</span>
        </div>

        <div className="puzzle-list" role="listbox" aria-label="Puzzle images">
          {PUZZLES.map((p) => {
            const active = p.id === puzzleId
            return (
              <div key={p.id} className={`puzzle-item ${active ? 'is-active' : ''}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`puzzle-card ${active ? 'is-active' : ''}`}
                  onClick={() => onPuzzleChange(p.id)}
                >
                  <span className="puzzle-thumb">
                    <img src={p.src} alt="" />
                  </span>
                  <span className="puzzle-meta">
                    <span className="puzzle-name">{p.title}</span>
                    <span className="puzzle-artist">{p.artist}</span>
                  </span>
                </button>

                {active && (
                  <div
                    className="piece-block"
                    ref={(node) => {
                      node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
                    }}
                  >
                    <div className="slider-labels">
                      <span>Easy</span>
                      <span>Medium</span>
                      <span>Hard</span>
                    </div>

                    <div className="slider-shell">
                      <div className="slider-track" aria-hidden>
                        <div className="slider-fill" style={{ width: `${fillPct}%` }} />
                        <div className="slider-ticks">
                          {PIECE_PRESETS.map((_, i) => (
                            <span
                              key={i}
                              className={`slider-tick ${i <= presetIndex ? 'is-on' : ''}`}
                            />
                          ))}
                        </div>
                      </div>
                      <input
                        id="piece-slider"
                        className="piece-slider"
                        type="range"
                        min={0}
                        max={max}
                        step={1}
                        value={presetIndex}
                        onChange={(e) => onPresetChange(Number(e.target.value))}
                        aria-label="Number of pieces"
                      />
                    </div>

                    <p className="piece-grid">
                      {preset.cols} × {preset.rows} · {preset.pieces} pieces
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )

  return (
    <>
      {!hideToggle && (
        <button
          type="button"
          className={`sidebar-toggle ${open ? 'is-open' : ''}`}
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="puzzle-sidebar"
          title={open ? 'Close menu' : 'Open menu'}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            {open ? (
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            ) : (
              <>
                <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </>
            )}
          </svg>
        </button>
      )}
      {createPortal(panel, document.body)}
    </>
  )
}
