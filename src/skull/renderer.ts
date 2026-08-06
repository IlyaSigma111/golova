import { COLS, ROWS, HEAD_MASK, HEAD_CX, HEAD_CY, EYE_LEFT, EYE_RIGHT, MOUTH, buildEyeMask } from '../headMap'
import { SkullParams } from '../skullParams'

export interface EyeArea {
  x: number
  y: number
  w: number
  h: number
  eye_x: number
  eye_y: number
}

export interface Pupil {
  x: number
  y: number
  size: number
  char: string
  eye_x: number
  eye_y: number
  offset_x: number
  offset_y: number
}

export interface Eyebrow {
  x: number
  y: number
  width: number
  height: number
  left_offset: number
  right_offset: number
}

export interface FallingChar {
  x: number
  y: number
  char: string
  start_x: number
  start_y: number
  speed_y: number
  speed_x: number
  alpha: number
  progress: number
  life: number
}

export type RGB = [number, number, number]

const HEX = '0123456789ABCDEF'

function rnd(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

export class SkullRenderer {
  params: SkullParams
  cols = COLS
  rows = ROWS
  cx = HEAD_CX
  cy = HEAD_CY
  mask: boolean[][]
  eyeMask: boolean[][]
  grid: string[][]
  baseMask: boolean[][]

  eye_areas: EyeArea[] = []
  eyebrows: Eyebrow[] = []
  pupils: Pupil[] = []
  eyebrow_emotion = 0

  mouth_open = 0
  target_mouth_open = 0
  mouth_timer = 0
  mouth_target = 0
  mouth_interval = 0.15
  mouth_y = 0
  mouth_w = 0
  mouth_reset_needed = false
  is_playing = false
  current_amplitude = 0

  blink_state = 0
  blink_timer = 0
  is_blinking = false
  blink_interval = 3 + Math.random() * 2

  offset_x = 0
  offset_y = 0
  float_timer = 0

  pupil_timer = 0
  pupil_move_interval = 120
  global_target_x = rnd(-2, 2)
  global_target_y = rnd(-2, 2)
  global_offset_x = 0
  global_offset_y = 0

  frame_count = 0

  erosion_active = false
  erosion_cells: Map<string, { eroded: boolean; progress: number; timer: number }> = new Map()
  erosion_timer = 0
  erosion_interval = 0.8
  erosion_duration = 3
  erosion_max_cells = 20
  erosion_fade_speed = 0.3
  erosion_intensity = 1
  falling_chars: FallingChar[] = []
  face_cells: Array<[number, number]> = []

  setErosionIntensity(v: number) {
    this.erosion_intensity = Math.max(0.05, Math.min(1, v))
  }

  constructor(params: SkullParams) {
    this.params = params
    this.baseMask = HEAD_MASK.map((row) => row.slice())
    this.mask = HEAD_MASK.map((row) => row.slice())
    this.eyeMask = buildEyeMask()
    this.grid = Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => HEX[Math.floor(Math.random() * HEX.length)]),
    )
    this.mouth_y = MOUTH.cy
    this.mouth_w = MOUTH.w
    this.buildEyes()
    this.buildEyebrows()
    this.initFaceCells()
    this.initPupils()
  }

  private key(x: number, y: number): string {
    return `${x},${y}`
  }

  private initFaceCells() {
    this.face_cells = []
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (this.mask[y][x]) this.face_cells.push([x, y])
      }
    }
    for (const cell of this.face_cells) {
      const k = this.key(cell[0], cell[1])
      if (!this.erosion_cells.has(k)) {
        this.erosion_cells.set(k, { eroded: false, progress: 0, timer: 0 })
      }
    }
  }

  private buildEyes() {
    this.eye_areas = [
      { x: EYE_LEFT.cx, y: EYE_LEFT.cy, w: EYE_LEFT.w, h: EYE_LEFT.h, eye_x: EYE_LEFT.cx, eye_y: EYE_LEFT.cy },
      { x: EYE_RIGHT.cx, y: EYE_RIGHT.cy, w: EYE_RIGHT.w, h: EYE_RIGHT.h, eye_x: EYE_RIGHT.cx, eye_y: EYE_RIGHT.cy },
    ]
    this.initPupils()
  }

  private initPupils() {
    this.pupils = []
    for (const eye of this.eye_areas) {
      this.pupils.push({
        x: eye.eye_x,
        y: eye.eye_y,
        size: Math.max(2, Math.floor(Math.min(eye.w, eye.h) / 3)),
        char: '●',
        eye_x: eye.eye_x,
        eye_y: eye.eye_y,
        offset_x: 0,
        offset_y: 0,
      })
    }
  }

  buildEyebrows() {
    this.eyebrows = []
    if (!this.eye_areas.length) return
    let left_offset = 0
    let right_offset = 0
    if (this.eyebrow_emotion > 0.1) {
      left_offset = Math.floor(this.eyebrow_emotion * 2)
      right_offset = Math.floor(this.eyebrow_emotion * 0.5)
    } else if (this.eyebrow_emotion < -0.1) {
      left_offset = Math.floor(this.eyebrow_emotion * 0.5)
      right_offset = Math.floor(Math.abs(this.eyebrow_emotion) * 2)
    }
    for (const eye of this.eye_areas) {
      const eyebrowWidth = Math.floor(eye.w * 1.2)
      const eyebrowHeight = Math.max(1, Math.floor(eye.h * 0.5))
      const eyebrowY = eye.y - Math.floor(eye.h / 2) - 2
      const isLeft = eye.x < this.cx
      this.eyebrows.push({
        x: eye.x,
        y: eyebrowY,
        width: eyebrowWidth,
        height: eyebrowHeight,
        left_offset: isLeft ? right_offset : left_offset,
        right_offset: isLeft ? left_offset : right_offset,
      })
    }
  }

  set_emotion(emotion: number) {
    this.eyebrow_emotion = Math.max(-1, Math.min(1, emotion))
    this.buildEyebrows()
  }

  rebuildMask() {
    this.mask = this.baseMask.map((row) => row.slice())
    this.eyeMask = buildEyeMask()
    this.mouth_w = MOUTH.w
    this.mouth_y = MOUTH.cy
    this.initFaceCells()
  }

  resetMouth() {
    this.mouth_open = 0
    this.target_mouth_open = 0
    this.is_playing = false
    this.current_amplitude = 0
    this.mouth_timer = 0
    this.mouth_target = 0
    this.mouth_reset_needed = false
    this.rebuildMask()
  }

  private updatePupils() {
    this.pupil_timer += 1
    if (this.pupil_timer >= this.pupil_move_interval) {
      this.pupil_timer = 0
      this.global_target_x = rnd(-2, 2)
      this.global_target_y = rnd(-2, 2)
    }
    const speed = 0.015
    this.global_offset_x += (this.global_target_x - this.global_offset_x) * speed
    this.global_offset_y += (this.global_target_y - this.global_offset_y) * speed
    for (const p of this.pupils) {
      p.x = p.eye_x + this.global_offset_x
      p.y = p.eye_y + this.global_offset_y
    }
  }

  private updateBlink(dt: number) {
    if (!this.is_blinking) {
      this.blink_timer += dt
      if (this.blink_timer > this.blink_interval) {
        this.is_blinking = true
        this.blink_timer = 0
        this.blink_interval = 2 + Math.random() * 3
      }
    } else {
      this.blink_timer += dt
      if (this.blink_timer > 0.1) {
        this.is_blinking = false
        this.blink_timer = 0
      }
    }
    if (this.is_blinking) {
      const progress = this.blink_timer / 0.1
      this.blink_state = progress < 0.5 ? progress * 2 : 2 - progress * 2
    } else {
      this.blink_state = 0
    }
  }

  private updateMouth(dt: number) {
    if (this.mouth_reset_needed) {
      this.mouth_reset_needed = false
      this.mouth_open = 0
      this.target_mouth_open = 0
      this.rebuildMask()
    }
    const speed = 0.25
    if (this.is_playing && this.current_amplitude > 0.005) {
      this.mouth_timer += dt
      if (this.mouth_timer > this.mouth_interval) {
        this.mouth_timer = 0
        this.mouth_target = 0.3 + Math.random() * 0.7
        this.mouth_interval = 0.1 + Math.random() * 0.2
      }
      this.target_mouth_open = this.mouth_target
    } else {
      this.target_mouth_open = 0
      this.mouth_timer = 0
    }
    this.mouth_open += (this.target_mouth_open - this.mouth_open) * speed
    this.rebuildMask()
    if (this.mouth_open > 0.05) {
      const openH = Math.floor(2 + this.mouth_open * 1.5)
      if (openH > 0) {
        for (let y = this.mouth_y; y < Math.min(this.rows, this.mouth_y + openH); y++) {
          const yOffset = (y - this.mouth_y) / Math.max(1, openH)
          const widthFactor = 1 - yOffset * 0.15
          const mw = Math.floor(this.mouth_w * widthFactor)
          for (let x = this.cx - Math.floor(mw / 2); x < this.cx + Math.floor(mw / 2); x++) {
            if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) this.mask[y][x] = false
          }
        }
      }
    }
  }

  private updateFloat(dt: number) {
    this.float_timer += dt
    this.offset_x = Math.sin(this.float_timer * 0.15) * 3
    this.offset_y = Math.cos(this.float_timer * 0.12) * 2
  }

  updateFromAudio(isPlaying: boolean, amplitude = 0) {
    if (isPlaying && !this.is_playing) this.mouth_reset_needed = true
    this.is_playing = isPlaying
    this.current_amplitude = amplitude
    const dt = 0.016
    this.updateBlink(dt)
    this.updateFloat(dt)
    this.updateMouth(dt)
  }

  isBorder(x: number, y: number): boolean {
    if (y < 0 || y >= this.rows || x < 0 || x >= this.cols || !this.mask[y][x]) return false
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows && !this.mask[ny][nx]) return true
      }
    }
    return false
  }

  isEye(x: number, y: number): boolean {
    return !!this.eyeMask[y]?.[x]
  }

  getColorForCell(x: number, y: number, base: RGB): RGB {
    const p = this.params.data
    if (!p.color_effect || p.color_effect_progress <= 0) return base
    const stepSize = 3
    const groupY = Math.floor(y / stepSize)
    const rowProgress = groupY / Math.max(1, this.rows / stepSize)
    const progress = p.color_effect_progress
    const brightness = base[1] > 0 ? base[1] : 100
    if (rowProgress > progress) return base
    const b = Math.min(255, Math.max(0, brightness))
    if (p.color_effect_target === 'red') return [Math.floor((255 * b) / 255), 0, 0]
    if (p.color_effect_target === 'white') return [b, b, b]
    if (p.color_effect_target === 'reset') {
      if (p.previous_color === 'red') return [Math.floor((255 * b) / 255), 0, 0]
      if (p.previous_color === 'white') return [b, b, b]
      return base
    }
    return base
  }

  updateFrame() {
    this.frame_count++
    this.updateErosion()
    this.updateFallingChars()
    if (this.frame_count % 3 === 0) {
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          if (this.mask[y][x] && Math.random() < 0.05) {
            this.grid[y][x] = HEX[Math.floor(Math.random() * HEX.length)]
          }
        }
      }
    }
    this.updatePupils()
  }

  toggleErosion(active: boolean) {
    if (active && !this.erosion_active) {
      this.erosion_active = true
      this.erosion_timer = 0
      for (const cell of this.erosion_cells.values()) {
        cell.eroded = false
        cell.progress = 0
        cell.timer = 0
      }
      this.falling_chars = []
      for (let i = 0; i < Math.min(5, this.face_cells.length); i++) {
        const cell = this.face_cells[Math.floor(Math.random() * this.face_cells.length)]
        const d = this.erosion_cells.get(this.key(cell[0], cell[1]))
        if (d) {
          d.eroded = true
          d.progress = 0.5
          d.timer = rnd(0, this.erosion_duration)
        }
      }
    } else if (!active && this.erosion_active) {
      for (const cell of this.erosion_cells.values()) {
        cell.eroded = false
        cell.progress = 0
        cell.timer = 0
      }
      this.falling_chars = []
      this.erosion_active = false
    }
  }

  private updateErosion() {
    if (!this.erosion_active || !this.face_cells.length) return
    const dt = 0.016
    this.erosion_timer += dt
    if (this.erosion_timer >= this.erosion_interval / this.erosion_intensity) {
      this.erosion_timer = 0
      let erodedCount = 0
      for (const d of this.erosion_cells.values()) if (d.eroded) erodedCount++
      if (erodedCount < this.erosion_max_cells) {
        const available = this.face_cells.filter((c) => !this.erosion_cells.get(this.key(c[0], c[1]))!.eroded)
        if (available.length) {
          const numNew = Math.min(Math.floor(rnd(1, 3) * this.erosion_intensity), available.length, this.erosion_max_cells - erodedCount)
          for (let i = 0; i < numNew; i++) {
            const cell = available.splice(Math.floor(Math.random() * available.length), 1)[0]
            const d = this.erosion_cells.get(this.key(cell[0], cell[1]))!
            d.eroded = true
            d.progress = 0
            d.timer = 0
          }
        }
      }
    }
    for (const [cellStr, d] of this.erosion_cells) {
      if (!d.eroded) continue
      if (d.progress < 1) {
        const prev = d.progress
        d.progress = Math.min(1, d.progress + this.erosion_fade_speed * dt)
        if (d.progress >= 0.5 && prev < 0.5) {
          const [x, y] = cellStr.split(',').map(Number)
          if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) {
            this.falling_chars.push({
              x, y, char: this.grid[y][x], start_x: x, start_y: y,
              speed_y: 0.5 + Math.random() * 0.8,
              speed_x: rnd(-0.3, 0.3),
              alpha: 1, progress: 0, life: 0,
            })
          }
        }
      }
      d.timer += dt
      if (d.timer >= this.erosion_duration) {
        d.progress = Math.max(0, d.progress - this.erosion_fade_speed * dt * 1.5)
        if (d.progress <= 0) {
          d.eroded = false
          d.timer = 0
        }
      }
    }
    if (Math.random() < 0.03) {
      let erodedCount = 0
      for (const d of this.erosion_cells.values()) if (d.eroded) erodedCount++
      if (erodedCount < this.erosion_max_cells) {
        const available = this.face_cells.filter((c) => !this.erosion_cells.get(this.key(c[0], c[1]))!.eroded)
        if (available.length) {
          const cell = available[Math.floor(Math.random() * available.length)]
          const d = this.erosion_cells.get(this.key(cell[0], cell[1]))!
          d.eroded = true
          d.progress = rnd(0, 0.3)
          d.timer = 0
        }
      }
    }
  }

  private updateFallingChars() {
    const dt = 0.016
    for (let i = this.falling_chars.length - 1; i >= 0; i--) {
      const fc = this.falling_chars[i]
      fc.y += fc.speed_y
      fc.x += fc.speed_x
      fc.speed_y += 0.02
      fc.progress += dt
      fc.life += dt
      if (fc.life > 0.5) fc.alpha = Math.max(0, fc.alpha - 0.03)
      if (fc.y > this.rows + 10 || fc.alpha <= 0) this.falling_chars.splice(i, 1)
    }
  }

  isEroded(x: number, y: number): boolean {
    const d = this.erosion_cells.get(this.key(x, y))
    if (!d) return false
    return d.eroded && d.progress > 0.3
  }
}
