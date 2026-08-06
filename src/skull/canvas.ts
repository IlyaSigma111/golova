import { SkullRenderer, RGB } from './renderer'
import { EffectsEngine } from './effects'
import { SkullParams } from '../skullParams'
import { COLS, ROWS } from '../headMap'
import { EffectToggles } from '../types'

export interface CanvasCallbacks {
  onFrame?: (bitmap: ImageBitmap) => void
}

export class SkullCanvas {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  renderer: SkullRenderer
  effects = new EffectsEngine()
  private raf = 0
  private last = 0
  isPlaying = false
  amplitude = 0
  emotion = 0
  private video: HTMLVideoElement | null = null
  private videoVisible = false
  colorEffect = false
  private cb: CanvasCallbacks = {}
  private dpr = 1
  private frameCounter = 0
  private displayCb: (() => void) | null = null

  constructor(canvas: HTMLCanvasElement, params: SkullParams, cb: CanvasCallbacks = {}) {
    this.canvas = canvas
    this.cb = cb
    this.ctx = canvas.getContext('2d')!
    this.renderer = new SkullRenderer(params)
    this.setupResize()
  }

  private setupResize() {
    const ro = new ResizeObserver(() => this.handleResize())
    ro.observe(this.canvas)
    this.handleResize()
  }

  handleResize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (w <= 0 || h <= 0) return
    this.dpr = window.devicePixelRatio || 1
    this.canvas.width = Math.floor(w * this.dpr)
    this.canvas.height = Math.floor(h * this.dpr)
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  setVideoSource(video: HTMLVideoElement | null) {
    this.video = video
    this.videoVisible = !!video
  }

  clearVideo() {
    this.video = null
    this.videoVisible = false
  }

  setVideoVisible(v: boolean) {
    this.videoVisible = v
  }

  setAudioData(isPlaying: boolean, amplitude: number) {
    this.isPlaying = isPlaying
    this.amplitude = amplitude
    this.effects.setAudioData(isPlaying, amplitude)
    this.renderer.updateFromAudio(isPlaying, amplitude)
  }

  resetMouth() {
    this.renderer.resetMouth()
    this.isPlaying = false
    this.amplitude = 0
  }

  setEmotion(emotion: number) {
    this.emotion = emotion
    this.renderer.set_emotion(emotion)
  }

  updateParams(params: SkullParams) {
    this.renderer.params = params
    this.renderer.rebuildMask()
  }

  setEffect(key: keyof EffectToggles, active: boolean) {
    const W = this.canvas.clientWidth || 1920
    const H = this.canvas.clientHeight || 1080
    switch (key) {
      case 'visualizer': this.effects.setVisualizer(active); break
      case 'particles': this.effects.setCodeParticles(active); break
      case 'waves': this.effects.setWaves(active); break
      case 'glitch': this.effects.toggleGlitch(active, W, H); break
      case 'alarm': this.effects.toggleAlarm(active, W, H); break
      case 'terminal': this.effects.toggleTerminal(active, W, H); break
      case 'matrix': this.effects.toggleMatrix(active, W, H); break
      case 'shatter': this.effects.toggleShatter(active, this.renderer); break
      case 'erosion': this.renderer.toggleErosion(active); break
    }
  }

  setGlitchIntensity(i: number) {
    this.effects.setGlitchIntensity(i)
  }

  applyScriptToggles(t: EffectToggles) {
    for (const key of Object.keys(t) as Array<keyof EffectToggles>) {
      this.setEffect(key, t[key])
    }
  }

  setColorEffect(color: 'red' | 'white' | 'reset') {
    const p = this.renderer.params.data
    if (color === 'reset') {
      p.color_effect = false
      p.color_effect_progress = 0
      p.color_effect_target = 'red'
      p.previous_color = 'red'
      p.color_effect_active = false
      this.colorEffect = false
      return
    }
    p.color_effect = true
    p.color_effect_progress = 0
    p.color_effect_target = color
    p.previous_color = 'red'
    p.color_effect_active = true
    this.colorEffect = true
    this.animateColorEffect()
  }

  private animateColorEffect() {
    const p = this.renderer.params.data
    const step = () => {
      if (!p.color_effect_active) return
      p.color_effect_progress = Math.min(1, p.color_effect_progress + 0.04)
      if (p.color_effect_progress >= 1) {
        p.color_effect_progress = 1
        p.color_effect_active = false
        this.colorEffect = true
        return
      }
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  start() {
    this.last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000)
      this.last = now
      this.update(dt)
      this.draw()
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop() {
    cancelAnimationFrame(this.raf)
    if (this.displayCb) this.displayCb()
  }

  private update(dt: number) {
    this.renderer.updateFrame()
    this.effects.update(dt, this.canvas.clientWidth || 1920, this.canvas.clientHeight || 1080, this.renderer, this.amplitude)
    if (!this.isPlaying) {
      // keep mouth closed when idle
      this.renderer.updateFromAudio(false, 0)
    }
  }

  private draw() {
    const ctx = this.ctx
    const width = this.canvas.clientWidth || 1920
    const height = this.canvas.clientHeight || 1080
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, width, height)

    const colorActive = this.colorEffect || this.renderer.params.data.color_effect_progress > 0
    const target = this.renderer.params.data.color_effect_target

    if (this.videoVisible && this.video && this.video.readyState >= 2) {
      const vw = this.video.videoWidth
      const vh = this.video.videoHeight
      if (vw > 0) {
        const scale = Math.min(width / vw, height / vh)
        const dw = vw * scale
        const dh = vh * scale
        const dx = (width - dw) / 2
        const dy = (height - dh) / 2
        ctx.drawImage(this.video, dx, dy, dw, dh)
      }
      ctx.save()
      ctx.globalAlpha = 0.6
      this.effects.drawVisualizerPublic(ctx, width, height)
      ctx.restore()
    } else {
      this.effects.drawVisualizerPublic(ctx, width, height)
    }

    this.effects.drawBackgroundEffects(ctx, width, height, colorActive, target)
    this.drawSkull(ctx, width, height, colorActive, target)
    this.effects.drawShatterFallingChars(ctx, width, height, this.renderer)
    this.effects.drawForeground(ctx, width, height, colorActive, target)

    this.frameCounter++
    if (this.cb.onFrame && this.frameCounter % 5 === 0) {
      try {
        const bmp = (this.canvas as unknown as OffscreenCanvas).transferToImageBitmap()
        this.cb.onFrame(bmp)
      } catch {
        // ignore
      }
    }
  }

  private drawSkull(ctx: CanvasRenderingContext2D, width: number, height: number, colorActive: boolean, target: string) {
    const r = this.renderer
    const cellX = width / r.cols
    const cellY = height / r.rows
    const cellSize = Math.min(cellX, cellY) * 0.85
    const fontSize = Math.max(7, Math.floor(cellSize * 0.85))
    ctx.font = `${fontSize}px Consolas, monospace`
    ctx.textBaseline = 'alphabetic'
    const offsetX = Math.floor(r.offset_x * cellSize / 10)
    const offsetY = Math.floor(r.offset_y * cellSize / 10)
    const totalW = r.cols * cellSize
    const totalH = r.rows * cellSize
    const startX = (width - totalW) / 2
    const startY = (height - totalH) / 2

    const mouthArea = new Set<string>()
    const mouthNear = new Set<string>()
    if (r.mouth_open < 0.05) {
      for (let y = r.mouth_y - 1; y <= r.mouth_y + 1; y++) {
        for (let x = r.cx - Math.floor(r.mouth_w / 2); x < r.cx + Math.floor(r.mouth_w / 2); x++) {
          if (x >= 0 && x < r.cols && y >= 0 && y < r.rows) mouthArea.add(`${x},${y}`)
        }
      }
      for (let y = r.mouth_y - 2; y <= r.mouth_y + 2; y++) {
        for (let x = r.cx - Math.floor(r.mouth_w / 2) - 1; x < r.cx + Math.floor(r.mouth_w / 2) + 1; x++) {
          if (x >= 0 && x < r.cols && y >= 0 && y < r.rows) {
            if (!mouthArea.has(`${x},${y}`)) mouthNear.add(`${x},${y}`)
          }
        }
      }
    } else {
      const openH = Math.floor(r.mouth_open * 2)
      if (openH > 0) {
        for (let y = r.mouth_y; y < Math.min(r.rows, r.mouth_y + openH); y++) {
          const yOff = (y - r.mouth_y) / Math.max(1, openH)
          const mw = Math.floor(r.mouth_w * (1 - yOff * 0.15))
          for (let x = r.cx - Math.floor(mw / 2); x < r.cx + Math.floor(mw / 2); x++) {
            if (x >= 0 && x < r.cols && y >= 0 && y < r.rows) mouthArea.add(`${x},${y}`)
          }
        }
      }
    }

    const drawCell = (x: number, y: number, char: string, color: string) => {
      const px = startX + x * cellSize + cellSize / 2 - fontSize / 3 + offsetX
      const py = startY + y * cellSize + cellSize / 2 + fontSize / 3 + offsetY
      ctx.fillStyle = color
      ctx.fillText(char, px, py)
    }

    for (let y = 0; y < r.rows; y++) {
      for (let x = 0; x < r.cols; x++) {
        if (!r.mask[y][x]) continue
        if (r.isEroded(x, y)) continue
        if (this.effects.isShattered(x, y)) continue
        const char = r.grid[y][x]
        const isBorder = r.isBorder(x, y)
        const isMouth = mouthArea.has(`${x},${y}`)
        const isMouthNear = mouthNear.has(`${x},${y}`)
        const isEye = r.isEye(x, y)
        let base: RGB
        if (isMouth) base = [0, 255, 0]
        else if (isMouthNear) base = [0, 180, 0]
        else if (isBorder) base = [0, 255, 0]
        else if (isEye) base = colorActive && target === 'red' ? [255, 140, 0] : [0, 255, 255]
        else {
          const dist = Math.abs(x - r.cx) / r.cols
          const b = Math.floor(80 + 60 * (1 - dist))
          base = [0, b, 0]
        }
        if (colorActive) {
          const rowProgress = y / r.rows
          if (rowProgress <= r.params.data.color_effect_progress) {
            const color = r.getColorForCell(x, y, base)
            drawCell(x, y, char, `rgb(${color[0]},${color[1]},${color[2]})`)
            continue
          }
        }
        drawCell(x, y, char, `rgb(${base[0]},${base[1]},${base[2]})`)
      }
    }

    // falling chars (erosion)
    for (const fc of r.falling_chars) {
      const px = startX + fc.x * cellSize + cellSize / 2 - fontSize / 3 + offsetX
      const py = startY + fc.y * cellSize + cellSize / 2 + fontSize / 3 + offsetY
      const alpha = Math.floor(255 * fc.alpha)
      let color: RGB = [0, 255, 0]
      if (colorActive) color = r.getColorForCell(Math.floor(fc.x), Math.floor(fc.y), [0, 255, 0])
      ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha})`
      ctx.fillText(fc.char, px, py)
    }

    // eyebrows
    for (const eb of r.eyebrows) {
      const halfW = Math.floor(eb.width / 2)
      for (let y = eb.y - Math.floor(eb.height / 2); y <= eb.y + Math.floor(eb.height / 2); y++) {
        for (let x = eb.x - halfW; x <= eb.x; x++) {
          if (x < 0 || x >= r.cols || y < 0 || y >= r.rows) continue
          if (!r.mask[y][x]) continue
          if (r.isEroded(x, y) || this.effects.isShattered(x, y)) continue
          const offset = Math.floor(eb.left_offset * (1 - (x - (eb.x - halfW)) / Math.max(1, halfW)))
          const drawY = y - offset
          if (drawY < 0 || drawY >= r.rows || !r.mask[drawY][x]) continue
          drawCell(x, drawY, r.grid[drawY][x], '#00ff00')
        }
        for (let x = eb.x + 1; x < eb.x + halfW; x++) {
          if (x < 0 || x >= r.cols || y < 0 || y >= r.rows) continue
          if (!r.mask[y][x]) continue
          if (r.isEroded(x, y) || this.effects.isShattered(x, y)) continue
          const offset = Math.floor(eb.right_offset * (1 - (x - eb.x) / Math.max(1, halfW)))
          const drawY = y - offset
          if (drawY < 0 || drawY >= r.rows || !r.mask[drawY][x]) continue
          drawCell(x, drawY, r.grid[drawY][x], '#00ff00')
        }
      }
    }

    // pupils
    for (const pupil of r.pupils) {
      const px = Math.round(pupil.x)
      const py = Math.round(pupil.y)
      const size = Math.round(pupil.size)
      for (let y = py - size; y <= py + size; y++) {
        for (let x = px - size; x <= px + size; x++) {
          if (x < 0 || x >= r.cols || y < 0 || y >= r.rows) continue
          const dx = x - px
          const dy = y - py
          if (dx * dx + dy * dy <= size * size) {
            if (r.eyeMask[y][x]) {
              const pcolor = colorActive && target === 'red' ? 'rgba(255,200,50,0.86)' : 'rgba(0,255,255,0.78)'
              drawCell(x, y, pupil.char, pcolor)
            }
          }
        }
      }
    }

    // eyes (outline 'O'), skipped while blinking
    if (r.blink_state < 0.5) {
      for (const eye of r.eye_areas) {
        const halfW = Math.max(2, Math.floor(eye.w / 2))
        const halfH = Math.max(2, Math.floor(eye.h / 2))
        for (let y = eye.y - halfH; y < eye.y + halfH; y++) {
          for (let x = eye.x - halfW; x < eye.x + halfW; x++) {
            if (x < 0 || x >= r.cols || y < 0 || y >= r.rows) continue
            if (r.isEroded(x, y) || this.effects.isShattered(x, y)) continue
            const dx = x - eye.x
            const dy = y - eye.y
            if (dx * dx / (halfW * halfW) + dy * dy / (halfH * halfH) >= 1) continue
            let isEdge = false
            outer:
            for (let ddy = -1; ddy <= 1; ddy++) {
              for (let ddx = -1; ddx <= 1; ddx++) {
                if (ddx === 0 && ddy === 0) continue
                const nx = x + ddx
                const ny = y + ddy
                if (nx < 0 || nx >= r.cols || ny < 0 || ny >= r.rows) continue
                if (r.isEroded(nx, ny) || this.effects.isShattered(nx, ny)) continue
                const dx2 = nx - eye.x
                const dy2 = ny - eye.y
                if (dx2 * dx2 / (halfW * halfW) + dy2 * dy2 / (halfH * halfH) >= 1) {
                  isEdge = true
                  break outer
                }
              }
            }
            if (isEdge) {
              const base: RGB = colorActive && target === 'red' ? [255, 140, 0] : [0, 255, 0]
              const color = colorActive ? r.getColorForCell(x, y, base) : base
              drawCell(x, y, 'O', `rgb(${color[0]},${color[1]},${color[2]})`)
            }
          }
        }
      }
    }
  }
}
