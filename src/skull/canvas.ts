import { SkullRenderer, RGB } from './renderer'
import { EffectsEngine } from './effects'
import { SkullParams } from '../skullParams'
import { EffectToggles, ModelData } from '../types'

export interface CanvasCallbacks {
  onFrame?: (bitmap: ImageBitmap) => void
}

interface Layout {
  fontSize: number
  cellW: number
  cellH: number
  startX: number
  startY: number
  width: number
  height: number
  ox: number
  oy: number
}

const CHAR_W = 1.0
const LINE_H = 1.0
const DENSITY = 1.0

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
  private videoFade = 0
  private videoFadeTarget = 0
  colorEffect = false
  private cb: CanvasCallbacks = {}
  private dpr = 1
  private frameCounter = 0
  private displayCb: (() => void) | null = null
  private staticCache: HTMLCanvasElement | null = null
  private staticDirty = true

  constructor(canvas: HTMLCanvasElement, params: SkullParams, cb: CanvasCallbacks = {}) {
    this.canvas = canvas
    this.cb = cb
    this.ctx = canvas.getContext('2d')!
    this.renderer = new SkullRenderer(params)
    this.applyIntensities(params)
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
    this.staticDirty = true
  }

  setVideoSource(video: HTMLVideoElement | null) {
    this.video = video
    this.videoVisible = !!video
    this.videoFadeTarget = video ? 1 : 0
  }

  clearVideo() {
    this.video = null
    this.videoVisible = false
    this.videoFadeTarget = 0
  }

  setVideoVisible(v: boolean) {
    this.videoVisible = v
    this.videoFadeTarget = v ? 1 : 0
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
    this.renderer.refreshPupils()
    this.staticDirty = true
    this.applyIntensities(params)
    this.syncColorFromParams(params)
  }

  setModel(model: ModelData | null) {
    if (model) this.renderer.loadModel(model)
    else this.renderer.clearModel()
    this.staticDirty = true
  }

  private applyIntensities(params: SkullParams) {
    const d = params.data
    this.renderer.setErosionIntensity(d.erosion_intensity)
    this.effects.setIntensity('visualizer', d.visualizer_intensity)
    this.effects.setIntensity('particles', d.particles_intensity)
    this.effects.setIntensity('waves', d.waves_intensity)
    this.effects.setIntensity('glitch', d.glitch_intensity)
    this.effects.setIntensity('alarm', d.alarm_intensity)
    this.effects.setIntensity('terminal', d.terminal_intensity)
    this.effects.setIntensity('matrix', d.matrix_intensity)
    this.effects.setIntensity('shatter', d.shatter_intensity)
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

  setEffectIntensity(key: string, value: number) {
    if (key === 'erosion') {
      this.renderer.setErosionIntensity(value)
    } else {
      this.effects.setIntensity(key, value)
    }
  }

  applyScriptToggles(t: EffectToggles) {
    for (const key of Object.keys(t) as Array<keyof EffectToggles>) {
      this.setEffect(key, t[key])
    }
  }

  setColorEffect(color: 'red' | 'white' | 'reset') {
    const p = this.renderer.params.data
    const target = color === 'reset' ? 'green' : color
    if (p.color_effect_active && p.color_effect_target === target) return
    p.previous_color = p.color_effect && p.color_effect_target !== 'green' ? p.color_effect_target : 'green'
    p.color_effect_target = target
    p.color_effect_progress = 0
    p.color_effect_active = true
    p.color_effect = true
    this.colorEffect = true
  }

  private syncColorFromParams(params: SkullParams) {
    this.colorEffect = !!params.data.color_effect
  }

  private updateColor(dt: number) {
    const p = this.renderer.params.data
    if (!p.color_effect_active) return
    p.color_effect_progress = Math.min(1, p.color_effect_progress + dt * 1.2)
    if (p.color_effect_progress >= 1) {
      p.color_effect_progress = 1
      p.color_effect_active = false
      if (p.color_effect_target === 'green') {
        p.color_effect = false
        this.colorEffect = false
      } else {
        this.colorEffect = true
      }
    }
  }

  private updateVideoFade(dt: number) {
    if (Math.abs(this.videoFadeTarget - this.videoFade) < 0.001) {
      this.videoFade = this.videoFadeTarget
      return
    }
    const rate = 3
    this.videoFade = this.videoFadeTarget > this.videoFade
      ? Math.min(this.videoFadeTarget, this.videoFade + dt * rate)
      : Math.max(this.videoFadeTarget, this.videoFade - dt * rate)
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
    this.renderer.updateFrame(dt)
    this.updateColor(dt)
    this.updateVideoFade(dt)
    this.effects.update(dt, this.canvas.clientWidth || 1920, this.canvas.clientHeight || 1080, this.renderer, this.amplitude)
    if (!this.isPlaying) {
      this.renderer.updateFromAudio(false, 0, dt)
    }
  }

  private layout(): Layout {
    const width = this.canvas.clientWidth || 1920
    const height = this.canvas.clientHeight || 1080
    const r = this.renderer
    const scale = this.renderer.params.data.head_scale || 1
    const fitW = width / r.cols
    const fitH = height / r.rows
    const fontFloor = r.modelMode && r.cols > 200 ? 1 : 3
    const fontSize = Math.max(fontFloor, Math.floor(Math.min(fitW / CHAR_W, fitH / LINE_H) * DENSITY * scale))
    const cellW = fontSize * CHAR_W
    const cellH = fontSize * LINE_H
    const totalW = r.cols * cellW
    const totalH = r.rows * cellH
    const ox = Math.floor(r.offset_x * cellW * 0.1)
    const oy = Math.floor(r.offset_y * cellH * 0.1)
    return {
      fontSize,
      cellW,
      cellH,
      startX: (width - totalW) / 2,
      startY: (height - totalH) / 2,
      width,
      height,
      ox,
      oy,
    }
  }

  private computeMouth(r: SkullRenderer, mouthArea: Set<string>, mouthNear: Set<string>) {
    const add = (set: Set<string>, x: number, y: number) => {
      if (x >= 0 && x < r.cols && y >= 0 && y < r.rows) set.add(`${x},${y}`)
    }
    const w = r.mouth_w
    const cx = r.mouth_cx
    if (r.mouth_open < 0.05) {
      const halfH = Math.max(1, Math.floor(r.mouth_h / 2))
      for (let y = r.mouth_y - halfH; y <= r.mouth_y + halfH; y++) {
        for (let x = cx - Math.floor(w / 2); x < cx + Math.floor(w / 2); x++) add(mouthArea, x, y)
      }
      for (let y = r.mouth_y - halfH - 1; y <= r.mouth_y + halfH + 1; y++) {
        for (let x = cx - Math.floor(w / 2) - 1; x < cx + Math.floor(w / 2) + 1; x++) {
          if (!mouthArea.has(`${x},${y}`)) add(mouthNear, x, y)
        }
      }
    } else {
      const openH = Math.floor(2 + r.mouth_open * 1.5)
      if (openH > 0) {
        for (let y = r.mouth_y; y < Math.min(r.rows, r.mouth_y + openH); y++) {
          const yOff = (y - r.mouth_y) / Math.max(1, openH)
          const mw = Math.floor(w * (1 - yOff * 0.15))
          for (let x = cx - Math.floor(mw / 2); x < cx + Math.floor(mw / 2); x++) add(mouthArea, x, y)
        }
      }
    }
  }

  private buildStaticCache(L: Layout, mouthArea: Set<string>, mouthNear: Set<string>) {
    const r = this.renderer
    const off = document.createElement('canvas')
    const totalW = Math.ceil(r.cols * L.cellW)
    const totalH = Math.ceil(r.rows * L.cellH)
    off.width = totalW
    off.height = totalH
    const c = off.getContext('2d')!
    c.font = `${L.fontSize}px Consolas, monospace`
    c.textAlign = 'center'
    c.textBaseline = 'top'
    for (let y = 0; y < r.rows; y++) {
      for (let x = 0; x < r.cols; x++) {
        if (!r.mask[y][x]) continue
        if (r.isEroded(x, y)) continue
        if (this.effects.isShattered(x, y)) continue
        if (r.isEye(x, y)) continue
        if (mouthArea.has(`${x},${y}`) || mouthNear.has(`${x},${y}`)) continue
        const dist = Math.abs(x - r.cx) / r.cols
        let b: number
        if (r.modelBrightness) {
          b = Math.max(0, Math.min(255, Math.round(r.modelBrightness[y][x])))
        } else {
          b = r.isBorder(x, y) ? 255 : Math.floor(80 + 60 * (1 - dist))
        }
        c.fillStyle = `rgb(0,${b},0)`
        c.fillText(r.grid[y][x], x * L.cellW + L.cellW / 2, y * L.cellH)
      }
    }
    this.staticCache = off
    this.staticDirty = false
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

    if (this.video && this.video.readyState >= 2 && this.videoFade > 0.005) {
      const vw = this.video.videoWidth
      const vh = this.video.videoHeight
      if (vw > 0) {
        const scale = Math.min(width / vw, height / vh)
        const dw = vw * scale
        const dh = vh * scale
        const dx = (width - dw) / 2
        const dy = (height - dh) / 2
        ctx.save()
        ctx.globalAlpha = this.videoFade
        ctx.drawImage(this.video, dx, dy, dw, dh)
        ctx.restore()
      }
      ctx.save()
      ctx.globalAlpha = 0.6 * this.videoFade
      this.effects.drawVisualizerPublic(ctx, width, height, colorActive, target)
      ctx.restore()
    } else {
      this.effects.drawVisualizerPublic(ctx, width, height, colorActive, target)
    }

    this.effects.drawBackgroundEffects(ctx, width, height, colorActive, target)
    this.drawSkull(ctx, width, height, colorActive, target)
    this.effects.drawShatterFallingChars(ctx, width, height, this.renderer, colorActive, target)
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
    const L = this.layout()
    const { fontSize, cellW, cellH, startX, startY, ox, oy } = L
    ctx.font = `${fontSize}px Consolas, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    const mouthArea = new Set<string>()
    const mouthNear = new Set<string>()
    this.computeMouth(r, mouthArea, mouthNear)

    const drawCell = (x: number, y: number, char: string, color: string) => {
      ctx.fillStyle = color
      ctx.fillText(char, startX + ox + x * cellW + cellW / 2, startY + oy + y * cellH)
    }

    const disruptive = this.colorEffect || r.erosion_active || this.effects.shatter_active

    if (disruptive) {
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
          if (isMouth) continue
          let base: RGB
          if (isMouthNear) base = [0, 150, 0]
          else if (isEye) base = colorActive && target === 'red' ? [255, 140, 0] : [0, 255, 255]
          else if (r.modelBrightness) {
            const mb = Math.max(0, Math.min(255, Math.round(r.modelBrightness[y][x])))
            base = [0, mb, 0]
          } else if (isBorder) base = [0, 255, 0]
          else {
            const dist = Math.abs(x - r.cx) / r.cols
            const b = Math.floor(80 + 60 * (1 - dist))
            base = [0, b, 0]
          }
          if (colorActive) {
            const color = r.getColorForCell(x, y, base)
            drawCell(x, y, char, `rgb(${color[0]},${color[1]},${color[2]})`)
            continue
          }
          drawCell(x, y, char, `rgb(${base[0]},${base[1]},${base[2]})`)
        }
      }
    } else {
      if (r.mouth_open > 0.02) this.staticDirty = true
      if (this.staticDirty || !this.staticCache) {
        this.buildStaticCache(L, mouthArea, mouthNear)
      }
      ctx.drawImage(this.staticCache!, startX + ox, startY + oy)
      for (const k of mouthNear) {
        const [x, y] = k.split(',').map(Number)
        drawCell(x, y, r.grid[y][x], 'rgb(0,150,0)')
      }
    }

    // falling chars (erosion)
    for (const fc of r.falling_chars) {
      const px = startX + ox + fc.x * cellW + cellW / 2
      const py = startY + oy + fc.y * cellH
      const alpha = Math.floor(255 * fc.alpha)
      let color: RGB = [0, 255, 0]
      if (colorActive) color = r.getColorForCell(Math.floor(fc.x), Math.floor(fc.y), [0, 255, 0])
      ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha})`
      ctx.fillText(fc.char, px, py)
    }

    // eyebrows (parametric only — model has its own)
    if (!r.modelMode) {
    for (const eb of r.eyebrows) {
      const halfW = Math.floor(eb.width / 2)
      const ebBase: RGB = [150, 255, 150]
      const ebColor = colorActive ? r.getColorForCell(eb.x, eb.y, ebBase) : ebBase
      const ebStyle = `rgb(${ebColor[0]},${ebColor[1]},${ebColor[2]})`
      for (let y = eb.y - Math.floor(eb.height / 2); y <= eb.y + Math.floor(eb.height / 2); y++) {
        for (let x = eb.x - halfW; x <= eb.x; x++) {
          if (x < 0 || x >= r.cols || y < 0 || y >= r.rows) continue
          if (!r.mask[y][x]) continue
          if (r.isEroded(x, y) || this.effects.isShattered(x, y)) continue
          const offset = Math.floor(eb.left_offset * (1 - (x - (eb.x - halfW)) / Math.max(1, halfW)))
          const drawY = y - offset
          if (drawY < 0 || drawY >= r.rows || !r.mask[drawY][x]) continue
          drawCell(x, drawY, r.grid[drawY][x], ebStyle)
        }
        for (let x = eb.x + 1; x < eb.x + halfW; x++) {
          if (x < 0 || x >= r.cols || y < 0 || y >= r.rows) continue
          if (!r.mask[y][x]) continue
          if (r.isEroded(x, y) || this.effects.isShattered(x, y)) continue
          const offset = Math.floor(eb.right_offset * (1 - (x - eb.x) / Math.max(1, halfW)))
          const drawY = y - offset
          if (drawY < 0 || drawY >= r.rows || !r.mask[drawY][x]) continue
          drawCell(x, drawY, r.grid[drawY][x], ebStyle)
        }
      }
    }
    }

    // pupils (parametric only — model has its own eyes)
    if (!r.modelMode) {
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
    }

    // eyes (outline 'O'), skipped while blinking (parametric only)
    if (!r.modelMode && r.blink_state < 0.5) {
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

      // model mouth overlay
      if (r.modelMode && r.mouth_w > 0) {
        const mc = colorActive && target === 'red' ? 'rgba(255,140,0,0.9)' : 'rgba(0,255,0,0.95)'
        const halfW = Math.max(1, Math.floor(r.mouth_w / 2))
        
        if (r.mouth_open <= 0.04) {
          for (let x = r.mouth_cx - halfW; x <= r.mouth_cx + halfW; x++) {
            if (x >= 0 && x < r.cols) drawCell(x, r.mouth_y, '─', mc)
          }
        } else {
          const rowsCount = Math.max(1, Math.ceil(r.mouth_open * 4)) // spans up to 4 rows
          for (let dy = 0; dy < rowsCount; dy++) {
            let glyph = '█'
            if (dy === rowsCount - 1) {
              const fraction = (r.mouth_open * 4) - dy
              if (fraction < 0.3) glyph = '▂'
              else if (fraction < 0.7) glyph = '▄'
            }
            for (let x = r.mouth_cx - halfW; x <= r.mouth_cx + halfW; x++) {
              if (x >= 0 && x < r.cols && (r.mouth_y + dy) < r.rows) {
                drawCell(x, r.mouth_y + dy, glyph, mc)
              }
            }
          }
        }
      }

    // model eyes: blink overlay ('=' over eye cells while blinking)
    if (r.modelMode && r.is_blinking) {
      const ec = colorActive && target === 'red' ? 'rgba(255,140,0,0.85)' : 'rgba(0,230,200,0.85)'
      for (let y = 0; y < r.rows; y++) {
        for (let x = 0; x < r.cols; x++) {
          if (!r.isEye(x, y)) continue
          if (r.isEroded(x, y) || this.effects.isShattered(x, y)) continue
          drawCell(x, y, '=', ec)
        }
      }
    }
  }
}
