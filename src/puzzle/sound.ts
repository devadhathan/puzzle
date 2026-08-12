import { play } from 'cuelume'

let unlocked = false
let moveBuffer: AudioBuffer | null = null
let moveCtx: AudioContext | null = null
let moveSource: AudioBufferSourceNode | null = null
let loadingMove: Promise<void> | null = null

function getMoveContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (moveCtx) return moveCtx
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    moveCtx = new Ctor()
  } catch {
    return null
  }
  return moveCtx
}

async function ensureMoveBuffer() {
  if (moveBuffer || loadingMove) return loadingMove
  const ctx = getMoveContext()
  if (!ctx) return

  loadingMove = (async () => {
    try {
      const res = await fetch('/move.mp3')
      const raw = await res.arrayBuffer()
      moveBuffer = await ctx.decodeAudioData(raw.slice(0))
    } catch {
      moveBuffer = null
    }
  })()

  return loadingMove
}

function resumeContext(ctx: AudioContext) {
  if (ctx.state === 'suspended') {
    void ctx.resume()
  }
}

/** Call from the first real user gesture (touch/click) on mobile. */
export function unlockAudio() {
  if (unlocked) {
    const ctx = getMoveContext()
    if (ctx) resumeContext(ctx)
    return
  }
  unlocked = true

  try {
    // Wake cuelume's shared context during the gesture
    play('toggle', { volume: 0.001 })
  } catch {
    // optional
  }

  const ctx = getMoveContext()
  if (ctx) {
    resumeContext(ctx)
    void ensureMoveBuffer()
  }
}

/** Pieces snapped together — cuelume mechanical toggle */
export function playJoinClick() {
  unlockAudio()
  play('toggle', { volume: 1 })
}

/** Cloth rustle — decoded into Web Audio so iOS can play mid-drag */
export function playMoveSound() {
  unlockAudio()
  const ctx = getMoveContext()
  if (!ctx) return

  const start = () => {
    if (!moveBuffer || ctx.state !== 'running') return
    try {
      if (moveSource) {
        try {
          moveSource.stop()
        } catch {
          // already stopped
        }
        moveSource.disconnect()
        moveSource = null
      }
      const src = ctx.createBufferSource()
      const gain = ctx.createGain()
      gain.gain.value = 0.55
      src.buffer = moveBuffer
      src.connect(gain).connect(ctx.destination)
      src.start(0)
      moveSource = src
      src.onended = () => {
        if (moveSource === src) moveSource = null
      }
    } catch {
      // optional
    }
  }

  if (moveBuffer && ctx.state === 'running') {
    start()
    return
  }

  void (async () => {
    await ensureMoveBuffer()
    resumeContext(ctx)
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch {
        return
      }
    }
    start()
  })()
}
