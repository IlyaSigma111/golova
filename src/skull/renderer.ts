import { SkullParams } from '../skullParams'
import { ModelData } from '../types'

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
  cols = 80
  rows = 45
  cx = 40
  cy = 22
  mask: boolean[][]
  eyeMask: boolean[][]
  grid: string[][]
  mouth_h = 0

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
  mouth_cx = 0
  mouth_reset_needed = false
  mouthWasOpen = false
  is_playing = false
  current_amplitude = 0

  blink_state = 0
  blink_timer = 0
  is_blinking = false
  blink_interval = 3 + Math.random() * 2
  blink_duration = 0.1

  modelMode = false
  modelBrightness: number[][] | null = null
  private modelGrid: string[][] | null = null
  private modelEye: boolean[][] | null = null

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
    this.mask = Array.from({ length: this.rows }, () => Array(this.cols).fill(false))
    this.eyeMask = Array.from({ length: this.rows }, () => Array(this.cols).fill(false))
    this.grid = Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => HEX[Math.floor(Math.random() * HEX.length)]),
    )
    this.buildMask()
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

  private drawZone(yStart: number, yEnd: number, width: number) {
    const halfW = Math.floor(width / 2)
    for (let y = Math.max(0, yStart); y < Math.min(this.rows, yEnd); y++) {
      for (let x = Math.max(0, this.cx - halfW); x <= Math.min(this.cols - 1, this.cx + halfW); x++) {
        this.mask[y][x] = true
      }
    }
  }

  private cutEye(ex: number, ey: number, w: number, h: number) {
    const halfW = Math.max(1, Math.floor(w / 2))
    const halfH = Math.max(1, Math.floor(h / 2))
    for (let y = Math.max(0, ey - halfH); y < Math.min(this.rows, ey + halfH); y++) {
      for (let x = Math.max(0, ex - halfW); x < Math.min(this.cols, ex + halfW); x++) {
        const dx = x - ex
        const dy = y - ey
        if ((dx * dx) / (halfW * halfW) + (dy * dy) / (halfH * halfH) < 1) {
          this.mask[y][x] = false
          this.eyeMask[y][x] = true
        }
      }
    }
  }

  private drawZoneWithEyes(yStart: number, yEnd: number, width: number) {
    this.drawZone(yStart, yEnd, width)
    const p = this.params.data
    const headH = this.rows * (p.head_height / 100)
    let eyeW = Math.floor(headH * (p.eye_width / 100))
    let eyeH = Math.floor(headH * (p.eye_height / 100))
    const eyeSpacing = Math.floor(headH * (p.eye_spacing / 100))
    if (eyeW < 2) eyeW = 2
    if (eyeH < 2) eyeH = 2
    const eyeY = Math.floor((yStart + yEnd) / 2)
    const eyeXLeft = this.cx - Math.floor(eyeSpacing / 2)
    const eyeXRight = this.cx + Math.floor(eyeSpacing / 2)
    this.cutEye(eyeXLeft, eyeY, eyeW, eyeH)
    this.cutEye(eyeXRight, eyeY, eyeW, eyeH)
    this.eye_areas = []
    for (const [ex, ey] of [
      [eyeXLeft, eyeY],
      [eyeXRight, eyeY],
    ] as const) {
      this.eye_areas.push({ x: ex, y: ey, w: eyeW, h: eyeH, eye_x: ex, eye_y: ey })
    }
  }

  private cutNose(nx: number, ny: number, w: number, h: number) {
    const halfW = Math.max(1, Math.floor(w / 2))
    const halfH = Math.max(1, Math.floor(h / 2))
    for (let y = Math.max(0, ny - halfH); y < Math.min(this.rows, ny + halfH); y++) {
      for (let x = Math.max(0, nx - halfW); x < Math.min(this.cols, nx + halfW); x++) {
        const dx = Math.abs(x - nx)
        const dy = y - ny
        if (dy < 0) {
          if (dx < halfW * (0.3 + 0.7 * (1 + dy / Math.max(1, halfH)))) {
            this.mask[y][x] = false
          }
        } else if (dx < halfW * (1 - (dy / Math.max(1, halfH)) * 0.5)) {
          this.mask[y][x] = false
        }
      }
    }
  }

  private drawZoneWithNose(yStart: number, yEnd: number, width: number) {
    this.drawZone(yStart, yEnd, width)
    const p = this.params.data
    const headH = this.rows * (p.head_height / 100)
    let noseW = Math.floor(headH * (p.nose_width / 100))
    let noseH = Math.floor(headH * (p.nose_height / 100))
    if (noseW < 2) noseW = 2
    if (noseH < 2) noseH = 2
    const noseY = Math.floor((yStart + yEnd) / 2)
    this.cutNose(this.cx, noseY, noseW, noseH)
  }

  private drawZoneWithMouth(yStart: number, yEnd: number, width: number) {
    this.drawZone(yStart, yEnd, width)
    const p = this.params.data
    const headH = this.rows * (p.head_height / 100)
    this.mouth_w = Math.max(2, Math.floor(headH * (p.mouth_width / 100)))
    this.mouth_h = Math.max(1, Math.floor(headH * (p.mouth_height / 100)))
    this.mouth_y = Math.floor((yStart + yEnd) / 2)
  }

  private buildMask() {
    const p = this.params.data
    const w = this.cols
    const h = this.rows
    const headH = Math.floor((h * p.head_height) / 100)

    const zoneTopH = Math.floor((headH * p.zone_top) / 100)
    const zoneForeheadH = Math.floor((headH * p.zone_forehead) / 100)
    const zoneEyesH = Math.floor((headH * p.zone_eyes) / 100)
    const zoneNoseH = Math.floor((headH * p.zone_nose) / 100)
    const zoneMouthH = Math.floor((headH * p.zone_mouth) / 100)
    const zoneChinH = Math.floor((headH * p.zone_chin) / 100)

    const yTop = this.cy - Math.floor(headH / 2)
    const yForehead = yTop + zoneTopH
    const yEyes = yForehead + zoneForeheadH
    const yNose = yEyes + zoneEyesH
    const yMouth = yNose + zoneNoseH
    const yChin = yMouth + zoneMouthH
    const yBottom = yChin + zoneChinH

    const wTop = Math.floor((w * p.width_top) / 100)
    const wForehead = Math.floor((w * p.width_forehead) / 100)
    const wEyes = Math.floor((w * p.width_eyes) / 100)
    const wNose = Math.floor((w * p.width_nose) / 100)
    const wMouth = Math.floor((w * p.width_mouth) / 100)
    const wChin = Math.floor((w * p.width_chin) / 100)

    this.mask = Array.from({ length: this.rows }, () => Array(this.cols).fill(false))
    this.eyeMask = Array.from({ length: this.rows }, () => Array(this.cols).fill(false))
    this.eye_areas = []
    this.mouth_cx = this.cx

    this.drawZone(yTop, yForehead, wTop)
    this.drawZone(yForehead, yEyes, wForehead)
    this.drawZoneWithEyes(yEyes, yNose, wEyes)
    this.drawZoneWithNose(yNose, yMouth, wNose)
    this.drawZoneWithMouth(yMouth, yChin, wMouth)
    this.drawZone(yChin, yBottom, wChin)

    this.initPupils()
    this.buildEyebrows()
    this.initFaceCells()
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
    if (this.modelMode) this.reapplyModelMask()
    else this.buildMask()
  }

  /** Base mask derived from the loaded model (does not touch eyes/pupils/brows). */
  private reapplyModelMask() {
    if (!this.modelGrid || !this.modelBrightness) return
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        this.mask[y][x] = !!(
          this.modelGrid[y]?.[x] !== undefined &&
          this.modelGrid[y][x] !== ' ' &&
          this.modelBrightness[y][x] > 0
        )
      }
    }
  }

  loadModel(model: ModelData) {
    const rows = Math.max(1, Math.min(1500, model.rows))
    const cols = Math.max(1, Math.min(1500, model.cols))
    this.rows = rows
    this.cols = cols
    this.cx = Math.floor(cols / 2)
    this.cy = Math.floor(rows / 2)
    this.modelMode = true
    this.modelGrid = model.grid_char.map((r) => r.slice())
    this.modelEye = model.is_eye.map((r) => r.slice())
    this.modelBrightness = model.grid_brightness.map((r) => r.slice())
    this.grid = this.modelGrid.map((r) => r.slice())
    this.mask = Array.from({ length: rows }, () => Array(cols).fill(false))
    this.eyeMask = Array.from({ length: rows }, () => Array(cols).fill(false))
    this.reapplyModelMask()

    const eyes = this.detectModelEyes()
    this.eyeMask = eyes.eyeMask
    this.eye_areas = eyes.eye_areas

    const mouth = this.detectModelMouth()
    this.mouth_y = mouth.y
    this.mouth_w = mouth.w
    this.mouth_cx = mouth.cx

    this.initPupils()
    this.buildEyebrows()
    this.initFaceCells()

    this.mouth_open = 0
    this.target_mouth_open = 0
    this.mouth_timer = 0
    this.mouth_reset_needed = false
    this.mouthWasOpen = false
    this.is_playing = false
    this.current_amplitude = 0
    this.blink_timer = 0
    this.is_blinking = false
    this.blink_interval = 2 + Math.random() * 2
    this.blink_duration = 0.3
    this.float_timer = 0
    this.toggleErosion(false)
  }

  clearModel() {
    this.modelMode = false
    this.modelGrid = null
    this.modelEye = null
    this.modelBrightness = null
    this.rows = 45
    this.cols = 80
    this.cx = 40
    this.cy = 22
    this.grid = Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => HEX[Math.floor(Math.random() * HEX.length)]),
    )
    this.blink_duration = 0.1
    this.blink_interval = 3 + Math.random() * 2
    this.blink_timer = 0
    this.is_blinking = false
    this.rebuildMask()
  }

  /** Explicit is_eye cells, or auto-detected enclosed holes in the face. */
  private detectModelEyes(): { eyeMask: boolean[][]; eye_areas: EyeArea[] } {
    const eyeMask = Array.from({ length: this.rows }, () => Array(this.cols).fill(false))
    const eye_areas: EyeArea[] = []
    if (this.modelEye) {
      let explicit = 0
      for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) if (this.modelEye[y][x]) explicit++
      if (explicit > 0) {
        for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) if (this.modelEye[y][x]) eyeMask[y][x] = true
        for (const comp of this.findComponents(eyeMask)) {
          const b = comp.b
          const cx = (b.minX + b.maxX + 1) / 2
          const cy = (b.minY + b.maxY + 1) / 2
          eye_areas.push({ x: cx, y: cy, w: b.maxX - b.minX + 1, h: b.maxY - b.minY + 1, eye_x: cx, eye_y: cy })
        }
        return { eyeMask, eye_areas }
      }
    }
    // auto-detect: the two topmost enclosed holes = eyes
    const holes = this.findEnclosedHoles()
    holes.sort((a, b) => a.y - b.y || b.area - a.area)
    for (const h of holes.slice(0, 2)) {
      for (const [x, y] of h.cells) eyeMask[y][x] = true
      eye_areas.push({ x: h.cx, y: h.cy, w: h.w, h: h.h, eye_x: h.cx, eye_y: h.cy })
    }
    return { eyeMask, eye_areas }
  }

  /** Widest enclosed hole below the eyes (upper 60% of the lower half) = mouth. */
  private detectModelMouth(): { y: number; w: number; cx: number } {
    const holes = this.findEnclosedHoles()
    const eyeBottom = this.eye_areas.reduce((m, e) => Math.max(m, e.y + e.h / 2), 0)
    const lowerBound = this.cy + Math.floor((this.rows - this.cy) * 0.6)
    let best = { y: 0, w: 0, cx: this.cx }
    for (const h of holes) {
      if (h.y < eyeBottom + 1) continue
      if (h.y > lowerBound) continue
      if (h.w > best.w) best = { y: Math.round(h.cy), w: h.w, cx: Math.round(h.cx) }
    }
    if (best.w < 3) return { y: 0, w: 0, cx: this.cx }
    return best
  }

  private findComponents(grid: boolean[][]): Array<{ cells: Array<[number, number]>; b: { minX: number; maxX: number; minY: number; maxY: number } }> {
    const seen = new Set<string>()
    const out: Array<{ cells: Array<[number, number]>; b: { minX: number; maxX: number; minY: number; maxY: number } }> = []
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (!grid[y][x]) continue
        const k = `${x},${y}`
        if (seen.has(k)) continue
        const q: Array<[number, number]> = [[x, y]]
        seen.add(k)
        const cells: Array<[number, number]> = []
        let b = { minX: x, maxX: x, minY: y, maxY: y }
        while (q.length) {
          const [cx2, cy2] = q.pop()!
          cells.push([cx2, cy2])
          if (cx2 < b.minX) b.minX = cx2
          if (cx2 > b.maxX) b.maxX = cx2
          if (cy2 < b.minY) b.minY = cy2
          if (cy2 > b.maxY) b.maxY = cy2
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx2 + dx
            const ny = cy2 + dy
            if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.rows) continue
            if (!grid[ny][nx]) continue
            const kk = `${nx},${ny}`
            if (seen.has(kk)) continue
            seen.add(kk)
            q.push([nx, ny])
          }
        }
        out.push({ cells, b })
      }
    }
    return out
  }

  /** Enclosed (not touching the face bbox border) empty regions, area >= 4. */
  private findEnclosedHoles(): Array<{ cells: Array<[number, number]>; x: number; y: number; w: number; h: number; cx: number; cy: number; area: number }> {
    let minX = Infinity
    let maxX = -1
    let minY = Infinity
    let maxY = -1
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (this.mask[y][x]) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) return []
    const seen = new Set<string>()
    const out: Array<{ cells: Array<[number, number]>; x: number; y: number; w: number; h: number; cx: number; cy: number; area: number }> = []
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (this.mask[y][x]) continue
        const k = `${x},${y}`
        if (seen.has(k)) continue
        const q: Array<[number, number]> = [[x, y]]
        seen.add(k)
        const cells: Array<[number, number]> = []
        let touches = false
        let b = { minX: x, maxX: x, minY: y, maxY: y }
        let area = 0
        while (q.length) {
          const [cx2, cy2] = q.pop()!
          cells.push([cx2, cy2])
          area++
          if (cx2 === minX || cx2 === maxX || cy2 === minY || cy2 === maxY) touches = true
          if (cx2 < b.minX) b.minX = cx2
          if (cx2 > b.maxX) b.maxX = cx2
          if (cy2 < b.minY) b.minY = cy2
          if (cy2 > b.maxY) b.maxY = cy2
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx2 + dx
            const ny = cy2 + dy
            if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue
            if (this.mask[ny][nx]) continue
            const kk = `${nx},${ny}`
            if (seen.has(kk)) continue
            seen.add(kk)
            q.push([nx, ny])
          }
        }
        if (touches) continue
        if (area < 4) continue
        out.push({
          cells,
          x: b.minX,
          y: b.minY,
          w: b.maxX - b.minX + 1,
          h: b.maxY - b.minY + 1,
          cx: (b.minX + b.maxX + 1) / 2,
          cy: (b.minY + b.maxY + 1) / 2,
          area,
        })
      }
    }
    return out
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
      if (this.blink_timer > this.blink_duration) {
        this.is_blinking = false
        this.blink_timer = 0
      }
    }
    if (this.is_blinking) {
      const progress = this.blink_timer / this.blink_duration
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
    const nowOpen = this.mouth_open > 0.02
    if (nowOpen || this.mouthWasOpen) this.rebuildMask()
    this.mouthWasOpen = nowOpen
    if (this.mouth_open > 0.05) {
      const openH = Math.floor(2 + this.mouth_open * 1.5)
      if (openH > 0) {
        for (let y = this.mouth_y; y < Math.min(this.rows, this.mouth_y + openH); y++) {
          const yOffset = (y - this.mouth_y) / Math.max(1, openH)
          const widthFactor = 1 - yOffset * 0.15
          const mw = Math.floor(this.mouth_w * widthFactor)
          for (let x = this.mouth_cx - Math.floor(mw / 2); x < this.mouth_cx + Math.floor(mw / 2); x++) {
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

  updateFromAudio(isPlaying: boolean, amplitude = 0, dt = 0.016) {
    if (isPlaying && !this.is_playing) this.mouth_reset_needed = true
    this.is_playing = isPlaying
    this.current_amplitude = amplitude
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

  updateFrame(dt = 0.016) {
    this.frame_count++
    this.updateErosion(dt)
    this.updateFallingChars(dt)
    if (!this.modelMode && this.frame_count % 3 === 0) {
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

  private updateErosion(dt: number) {
    if (!this.erosion_active || !this.face_cells.length) return
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

  private updateFallingChars(dt: number) {
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
