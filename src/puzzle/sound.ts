import { play } from 'cuelume'

let moveAudio: HTMLAudioElement | null = null

function getMove() {
  if (!moveAudio) {
    moveAudio = new Audio('/move.mp3')
    moveAudio.preload = 'auto'
    moveAudio.volume = 0.55
  }
  return moveAudio
}

/** Pieces snapped together — cuelume mechanical toggle */
export function playJoinClick() {
  play('toggle', { volume: 1 })
}

/** Cloth rustle — 3–4s of freesound_community-cloth-6857 */
export function playMoveSound() {
  try {
    const a = getMove()
    a.pause()
    a.currentTime = 0
    void a.play()
  } catch {
    // optional
  }
}

export function unlockAudio() {
  try {
    // Prime cuelume's AudioContext during a real user gesture
    play('toggle', { volume: 0.001 })
    const a = getMove()
    a.muted = true
    void a.play().then(() => {
      a.pause()
      a.currentTime = 0
      a.muted = false
    })
  } catch {
    // optional
  }
}
