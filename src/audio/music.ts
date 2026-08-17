export interface Track {
  path: string
  name: string
  buffer?: AudioBuffer
}

export class MusicPlayer {
  private ctx: AudioContext
  private masterGain: GainNode
  private source: AudioBufferSourceNode | null = null
  private sourceGain: GainNode | null = null
  tracks: Track[] = []
  currentIndex = -1
  isPlaying = false
  volume = 0.8
  private fadeMs = 500
  private fadeTimer: number | null = null
  onTrackChange: ((index: number) => void) | null = null
  onStateChange: ((playing: boolean) => void) | null = null

  constructor() {
    this.ctx = new AudioContext()
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = this.volume
    this.masterGain.connect(this.ctx.destination)
  }

  async ensureRunning() {
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume() } catch { /* ignore */ }
    }
  }

  async addTrack(path: string, name: string): Promise<boolean> {
    const bin = await (window as unknown as { onyx?: { readBinary: (p: string) => Promise<ArrayBuffer | null> } }).onyx?.readBinary(path)
    if (!bin) return false
    try {
      await this.ensureRunning()
      const buf = await this.ctx.decodeAudioData(bin.slice(0))
      this.tracks.push({ path, name, buffer: buf })
      return true
    } catch {
      return false
    }
  }

  clearTracks() {
    this.stop()
    this.tracks = []
    this.currentIndex = -1
  }

  async play(index: number) {
    if (index < 0 || index >= this.tracks.length) return
    await this.ensureRunning()
    this.currentIndex = index
    const track = this.tracks[index]
    if (!track.buffer) return
    const t0 = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = track.buffer
    const g = this.ctx.createGain()
    g.connect(this.masterGain)
    src.connect(g)
    src.onended = () => this.onSourceEnded(src)
    const old = this.source
    const oldGain = this.sourceGain
    if (old && oldGain) {
      try {
        old.onended = null
        oldGain.gain.cancelScheduledValues(t0)
        oldGain.gain.setValueAtTime(oldGain.gain.value, t0)
        oldGain.gain.linearRampToValueAtTime(0.0001, t0 + this.fadeMs / 1000)
        old.stop(t0 + this.fadeMs / 1000 + 0.05)
      } catch { /* ignore */ }
    }
    g.gain.cancelScheduledValues(t0)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(this.volume, t0 + this.fadeMs / 1000)
    src.start(t0)
    this.source = src
    this.sourceGain = g
    this.isPlaying = true
    if (this.onStateChange) this.onStateChange(true)
    if (this.onTrackChange) this.onTrackChange(index)
  }

  private onSourceEnded(src: AudioBufferSourceNode) {
    if (this.source !== src) return
    this.source = null
    this.sourceGain = null
    if (this.currentIndex >= 0 && this.currentIndex < this.tracks.length - 1) {
      this.play(this.currentIndex + 1)
    } else {
      this.isPlaying = false
      if (this.onStateChange) this.onStateChange(false)
    }
  }

  private fadeMaster(done: () => void) {
    if (this.fadeTimer) { clearTimeout(this.fadeTimer); this.fadeTimer = null }
    const t0 = this.ctx.currentTime
    this.masterGain.gain.cancelScheduledValues(t0)
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t0)
    this.masterGain.gain.linearRampToValueAtTime(0.0001, t0 + this.fadeMs / 1000)
    this.fadeTimer = window.setTimeout(done, this.fadeMs)
  }

  pause() {
    if (this.isPlaying) {
      this.fadeMaster(() => { this.ctx.suspend() })
      this.isPlaying = false
      if (this.onStateChange) this.onStateChange(false)
    }
  }

  async resume() {
    if (this.source && !this.isPlaying) {
      await this.ensureRunning()
      this.isPlaying = true
      const t0 = this.ctx.currentTime
      this.masterGain.gain.cancelScheduledValues(t0)
      this.masterGain.gain.setValueAtTime(0, t0)
      this.masterGain.gain.linearRampToValueAtTime(this.volume, t0 + this.fadeMs / 1000)
      if (this.onStateChange) this.onStateChange(true)
    }
  }

  stop() {
    if (this.fadeTimer) { clearTimeout(this.fadeTimer); this.fadeTimer = null }
    if (this.source) {
      try { this.source.onended = null; this.source.stop() } catch { /* ignore */ }
      this.source = null
      this.sourceGain = null
    }
    this.isPlaying = false
    if (this.onStateChange) this.onStateChange(false)
  }

  next() {
    if (this.tracks.length === 0) return
    const next = (this.currentIndex + 1) % this.tracks.length
    this.play(next)
  }

  prev() {
    if (this.tracks.length === 0) return
    const prev = (this.currentIndex - 1 + this.tracks.length) % this.tracks.length
    this.play(prev)
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v))
    if (this.isPlaying) {
      try { this.masterGain.gain.value = this.volume } catch { /* ignore */ }
    }
  }
}
