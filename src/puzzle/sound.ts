let joinAudio: HTMLAudioElement | null = null
let moveAudio: HTMLAudioElement | null = null
let musicAudio: HTMLAudioElement | null = null

function getJoin() {
  if (!joinAudio) {
    joinAudio = new Audio('/join.mp3')
    joinAudio.preload = 'auto'
    joinAudio.volume = 0.85
  }
  return joinAudio
}

function getMove() {
  if (!moveAudio) {
    moveAudio = new Audio('/move.mp3')
    moveAudio.preload = 'auto'
    moveAudio.volume = 0.55
  }
  return moveAudio
}

function getMusic() {
  if (!musicAudio) {
    musicAudio = new Audio('/music.mp3')
    musicAudio.preload = 'auto'
    musicAudio.loop = true
    musicAudio.volume = 0.35
  }
  return musicAudio
}

/** SoundShelf UI checkbox/toggle tick — join + UI click */
export function playJoinClick() {
  try {
    const a = getJoin()
    a.pause()
    a.currentTime = 0
    void a.play()
  } catch {
    // optional
  }
}

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

export function setMusicPlaying(playing: boolean) {
  try {
    const a = getMusic()
    if (playing) {
      void a.play()
    } else {
      a.pause()
    }
  } catch {
    // optional
  }
}

export function isMusicPlaying() {
  return !!musicAudio && !musicAudio.paused
}

export function unlockAudio() {
  try {
    for (const a of [getJoin(), getMove(), getMusic()]) {
      const wasLoop = a.loop
      a.muted = true
      void a.play().then(() => {
        a.pause()
        a.currentTime = 0
        a.muted = false
        a.loop = wasLoop
      })
    }
  } catch {
    // optional
  }
}
