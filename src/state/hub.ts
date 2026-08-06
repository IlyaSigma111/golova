import { AudioPlayer } from '../audio/player'
import { MusicPlayer } from '../audio/music'
import { VideoPlayer } from '../video/videoPlayer'
import { ScriptManager } from '../scripts/manager'
import { SkullParams } from '../skullParams'
import { SkullCanvas } from '../skull/canvas'
import type { EffectToggles, ScriptData, SkullParamsData, StateMsg } from '../types'

const anyOnyx = () => (window as unknown as {
  onyx?: {
    sendState: (p: StateMsg) => void
    openViz: () => Promise<number>
    openPlayer: () => Promise<number>
    openAllDisplays: () => Promise<unknown>
    listDisplays: () => Promise<unknown>
    downloadSelf: () => Promise<string | null>
    openFile: (o: { title?: string; filters?: unknown[] }) => Promise<string | null>
    openFiles: (o: { title?: string; filters?: unknown[] }) => Promise<string[]>
    saveFile: (o: { title?: string; defaultPath?: string; filters?: unknown[] }) => Promise<string | null>
    readBinary: (p: string) => Promise<ArrayBuffer | null>
  }
}).onyx

export function DEFAULT_EFFECTS(): EffectToggles {
  return {
    visualizer: true,
    particles: true,
    waves: true,
    glitch: false,
    alarm: false,
    terminal: false,
    matrix: false,
    shatter: false,
    erosion: false,
  }
}

export const EMOTION_LABELS: Array<[number, string]> = [
  [0, 'Нейтрально'],
  [1, 'Доброта'],
  [-1, 'Злость'],
]

export function emotionLabel(emotion: number): string {
  for (const [v, l] of EMOTION_LABELS) if (v === emotion) return l
  return 'Нейтрально'
}

class AppHub {
  audio = new AudioPlayer()
  music = new MusicPlayer()
  video = new VideoPlayer()
  scripts = new ScriptManager()
  params = new SkullParams()
  effects: EffectToggles = DEFAULT_EFFECTS()
  emotion = 0

  preview: SkullCanvas | null = null
  currentScript: ScriptData | null = null
  isPlaying = false
  isAutoPlaying = false
  autoPlayEnabled = true

  onStatus: ((s: string) => void) | null = null
  onScriptsChange: (() => void) | null = null
  onPlayStateChange: ((playing: boolean) => void) | null = null
  onParamsChange: (() => void) | null = null

  private lastAmp = 0

  constructor() {
    this.audio.onAmplitude = (amp) => {
      this.lastAmp = amp
      this.pushAudio(true, amp)
    }
    this.audio.onEnded = () => {
      this.isPlaying = false
      if (this.onPlayStateChange) this.onPlayStateChange(false)
      this.status('[OK] Воспроизведение завершено')
      this.pushAudio(false, 0)
      if (this.autoPlayEnabled && !this.isAutoPlaying && this.scripts.scripts.length > 1) {
        this.isAutoPlaying = true
        setTimeout(() => this.playNextAuto(), 500)
      }
    }
  }

  get onyx() {
    return anyOnyx()
  }

  broadcast(msg: StateMsg) {
    try {
      this.onyx?.sendState(msg)
    } catch {
      // ignore
    }
  }

  syncBroadcast() {
    this.broadcast({
      kind: 'sync',
      params: this.params.toData(),
      toggles: this.effects,
      emotion: this.emotion,
      isPlaying: this.isPlaying,
      amplitude: this.lastAmp,
    })
  }

  status(s: string) {
    if (this.onStatus) this.onStatus(s)
  }

  // ---------- preview wiring ----------
  setPreview(skull: SkullCanvas | null) {
    this.preview = skull
    if (skull) {
      skull.updateParams(this.params)
      skull.applyScriptToggles(this.effects)
      skull.setEmotion(this.emotion)
      if (this.video.pathStr) {
        skull.setVideoSource(this.video.video)
        this.video.play()
      }
    }
  }

  pushAudio(isPlaying: boolean, amplitude: number) {
    this.lastAmp = amplitude
    this.preview?.setAudioData(isPlaying, amplitude)
    this.broadcast({ kind: 'audio', isPlaying, amplitude })
  }

  // ---------- avatar ----------
  async loadAvatar() {
    const path = await this.onyx?.openFile({
      title: 'Выберите файл аватара',
      filters: [{ name: 'Avatar files', extensions: ['json'] }],
    })
    if (!path) return false
    const raw = await (window as unknown as { onyx?: { readText: (p: string) => Promise<string | null> } }).onyx?.readText(path)
    if (!raw) {
      this.status('[ERR] Не удалось прочитать файл')
      return false
    }
    try {
      const data = JSON.parse(raw) as Record<string, unknown>
      this.params.fromData(data)
      this.paramsSave()
      this.preview?.updateParams(this.params)
      this.broadcast({ kind: 'params', data: this.params.toData() })
      this.status('[OK] Аватар загружен')
      if (this.onParamsChange) this.onParamsChange()
      return true
    } catch {
      this.status('[ERR] Ошибка в JSON аватара')
      return false
    }
  }

  paramsSave() {
    try {
      ;(window as unknown as { onyx?: { paramsSave: (d: string) => Promise<boolean> } }).onyx?.paramsSave(this.params.toJson())
    } catch {
      // ignore
    }
  }

  async loadParams() {
    try {
      const json = await (window as unknown as { onyx?: { paramsLoad: () => Promise<string | null> } }).onyx?.paramsLoad()
      this.params = SkullParams.fromJson(json ?? null)
    } catch {
      // ignore
    }
  }

  // ---------- effects ----------
  setEffect(key: keyof EffectToggles, active: boolean) {
    this.effects[key] = active
    this.preview?.setEffect(key, active)
    this.broadcast({ kind: 'effects', toggles: this.effects })
  }

  setColor(color: 'red' | 'white' | 'reset') {
    this.preview?.setColorEffect(color)
    this.broadcast({ kind: 'color', color })
    const map = { red: '[COLOR] Красный цвет применен', white: '[COLOR] Белый цвет применен', reset: '[COLOR] Цвет сброшен' }
    this.status(map[color])
  }

  setEmotion(emotion: number) {
    this.emotion = Math.max(-1, Math.min(1, emotion))
    this.preview?.setEmotion(this.emotion)
    this.broadcast({ kind: 'emotion', emotion: this.emotion })
  }

  setHeadScale(scale: number) {
    const s = Math.max(0.3, Math.min(3, scale))
    this.params.data.head_scale = s
    this.paramsSave()
    this.preview?.updateParams(this.params)
    this.broadcast({ kind: 'params', data: this.params.toData() })
  }

  setEffectIntensity(key: string, value: number) {
    const v = Math.max(0, Math.min(1, value))
    ;(this.params.data as unknown as Record<string, unknown>)[key + '_intensity'] = v
    this.paramsSave()
    this.preview?.setEffectIntensity(key, v)
    this.broadcast({ kind: 'params', data: this.params.toData() })
  }

  resetMouth() {
    this.preview?.resetMouth()
    this.broadcast({ kind: 'resetMouth' })
  }

  // ---------- scripts ----------
  async scriptsInit() {
    await this.scripts.load()
    if (this.onScriptsChange) this.onScriptsChange()
  }

  playScript(script: ScriptData) {
    const hasAudio = !!script.audio_path
    const hasVideo = !!script.video_path
    if (!hasAudio && !hasVideo) {
      this.status('[ERR] В сценарии нет аудио или видео файлов')
      return
    }
    this.currentScript = script
    this.applyScriptEffects(script)
    this.setEmotion(script.emotion)

    this.audio.stop()
    this.video.stop()
    this.preview?.clearVideo()

    if (hasAudio) {
      this.loadAudioFromScript(script.audio_path!)
    }
    if (hasVideo) {
      this.video.load(script.video_path!)
      if (this.preview) {
        this.preview.setVideoSource(this.video.video)
        this.video.play()
      }
      this.broadcast({ kind: 'video', playing: true, path: script.video_path })
      if (!hasAudio) this.status(`[PLAY] Видео: ${baseName(script.video_path!)}`)
    } else {
      this.broadcast({ kind: 'video', playing: false, path: null })
    }

    this.resetMouth()
    if (this.onScriptsChange) this.onScriptsChange()
  }

  private async loadAudioFromScript(path: string) {
    const bin = await this.onyx?.readBinary(path)
    if (!bin) {
      this.status('[ERR] Не удалось прочитать аудио')
      return
    }
    const ok = await this.audio.loadFromArrayBuffer(bin)
    if (!ok) {
      this.status('[ERR] Не удалось декодировать аудио')
      return
    }
    setTimeout(() => {
      this.audio.play()
      this.isPlaying = true
      if (this.onPlayStateChange) this.onPlayStateChange(true)
      this.status(`[PLAY] Воспроизведение: ${baseName(path)}`)
    }, 150)
  }

  stopScript() {
    this.audio.stop()
    this.isPlaying = false
    this.isAutoPlaying = false
    if (this.onPlayStateChange) this.onPlayStateChange(false)
    this.video.stop()
    this.preview?.clearVideo()
    this.broadcast({ kind: 'video', playing: false, path: null })
    this.status(this.currentScript ? `[STOP] Остановлен: ${this.currentScript.name}` : '[STOP] Остановлено')
    this.resetMouth()
    if (this.onScriptsChange) this.onScriptsChange()
  }

  applyScriptEffects(script: ScriptData) {
    const toggles: EffectToggles = {
      visualizer: script.visualizer_enabled,
      particles: script.particles_enabled,
      waves: script.waves_enabled,
      glitch: script.glitch_enabled,
      alarm: script.alarm_enabled,
      terminal: script.terminal_enabled,
      matrix: script.matrix_enabled,
      shatter: script.shatter_enabled,
      erosion: script.erosion_enabled,
    }
    this.effects = toggles
    this.preview?.applyScriptToggles(toggles)
    this.broadcast({ kind: 'effects', toggles })
    if (script.color_effect) this.setColor(script.color_effect)
    else this.setColor('reset')
  }

  playNextAuto() {
    this.isAutoPlaying = false
    if (!this.autoPlayEnabled) return
    const list = this.scripts.scripts
    if (list.length === 0) return
    const idx = list.findIndex((s) => s === this.currentScript)
    if (idx < 0) return
    const next = list[(idx + 1) % list.length]
    if (next && next !== this.currentScript) {
      this.currentScript = next
      this.playScript(next)
    }
  }

  selectScript(script: ScriptData) {
    this.currentScript = script
    if (this.onScriptsChange) this.onScriptsChange()
  }

  // ---------- windows ----------
  openViz() {
    return this.onyx?.openViz().then(() => {
      this.syncBroadcast()
    })
  }

  openPlayer() {
    return this.onyx?.openPlayer().then(() => {
      this.syncBroadcast()
    })
  }

  openAllDisplays() {
    return this.onyx?.openAllDisplays().then(() => {
      this.syncBroadcast()
    })
  }

  downloadSelf() {
    return this.onyx?.downloadSelf()
  }

  listDisplays() {
    return this.onyx?.listDisplays()
  }
}

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() || p
}

export const hub = new AppHub()
