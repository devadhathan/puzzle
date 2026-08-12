import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { List, X } from '@phosphor-icons/react'
import { play } from 'cuelume'
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeItemRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 16, bottom: 80 })

  useLayoutEffect(() => {
    if (!open) return

    const update = () => {
      const el = anchorRef?.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const menuW = Math.min(340, window.innerWidth - 24)
      // Center on the menu icon, then nudge slightly left
      const iconCenter = r.left + r.width / 2
      const nudged = iconCenter - menuW / 2 - 18
      setPos({
        left: Math.max(12, Math.min(nudged, window.innerWidth - menuW - 12)),
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

  // Keep the selected puzzle in view when opening / changing image — once, not every render
  useEffect(() => {
    if (!open) return
    const id = window.requestAnimationFrame(() => {
      activeItemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
    return () => window.cancelAnimationFrame(id)
  }, [open, puzzleId])

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

  // Stop board zoom/pan from eating trackpad scrolls over the menu
  useEffect(() => {
    if (!open) return
    const node = scrollRef.current
    if (!node) return
    const onWheel = (e: WheelEvent) => {
      e.stopPropagation()
    }
    node.addEventListener('wheel', onWheel, { passive: true })
    return () => node.removeEventListener('wheel', onWheel)
  }, [open])

  const panel = (
    <aside
      ref={panelRef}
      id="puzzle-sidebar"
      className={`sidebar ${open ? 'is-open' : ''}`}
      aria-hidden={!open}
      style={{ left: pos.left, bottom: pos.bottom }}
    >
      <div className="sidebar-shell">
        <div className="sidebar-inner" ref={scrollRef}>
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
                <div
                  key={p.id}
                  ref={active ? activeItemRef : undefined}
                  className={`puzzle-item ${active ? 'is-active' : ''}`}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className="puzzle-card"
                    onClick={() => onPuzzleChange(p.id)}
                    data-cuelume-press
                    data-cuelume-release
                    data-cuelume-hover="tick"
                  >
                    <span className="puzzle-thumb">
                      <img src={p.src} alt="" />
                    </span>
                    <span className="puzzle-meta">
                      <span className="puzzle-name">{p.title}</span>
                      <span className="puzzle-artist">{p.artist}</span>
                    </span>
                  </button>

                  <div className="piece-expand" aria-hidden={!active}>
                    <div className="piece-expand-inner">
                      <div className="piece-block">
                        <div className="slider-labels">
                          <span>Easy</span>
                          <span>Medium</span>
                          <span>Hard</span>
                        </div>

                        <div className="slider-shell">
                          <div className="slider-track" aria-hidden>
                            <div
                              className="slider-fill"
                              style={{ width: active ? `${fillPct}%` : '0%' }}
                            />
                            <div className="slider-ticks">
                              {PIECE_PRESETS.map((_, i) => (
                                <span
                                  key={i}
                                  className={`slider-tick ${
                                    active && i <= presetIndex ? 'is-on' : ''
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                          <input
                            id={active ? 'piece-slider' : undefined}
                            className="piece-slider"
                            type="range"
                            min={0}
                            max={max}
                            step={1}
                            value={active ? presetIndex : 0}
                            disabled={!active}
                            tabIndex={active ? 0 : -1}
                            onChange={(e) => {
                              onPresetChange(Number(e.target.value))
                              play('tick')
                            }}
                            aria-label="Number of pieces"
                          />
                        </div>

                        <p className="piece-grid">
                          {active
                            ? `${preset.cols} × ${preset.rows} · ${preset.pieces} pieces`
                            : '\u00a0'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
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
          {open ? (
            <X size={18} weight="regular" aria-hidden />
          ) : (
            <List size={18} weight="regular" aria-hidden />
          )}
        </button>
      )}
      {createPortal(panel, document.body)}
    </>
  )
}
