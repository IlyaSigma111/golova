import type { SkullParamsData } from './types'

const DEFAULTS: SkullParamsData = {
  head_height: 70,
  width_top: 80,
  width_forehead: 75,
  width_eyes: 60,
  width_nose: 45,
  width_mouth: 55,
  width_chin: 40,
  zone_top: 15,
  zone_forehead: 20,
  zone_eyes: 15,
  zone_nose: 15,
  zone_mouth: 15,
  zone_chin: 20,
  eye_width: 30,
  eye_height: 20,
  eye_spacing: 30,
  nose_width: 8,
  nose_height: 12,
  mouth_width: 30,
  mouth_height: 4,
  color_effect: false,
  color_effect_progress: 0.0,
  color_effect_active: false,
  color_effect_target: 'red',
  previous_color: 'red',
  head_scale: 1.0,
  visualizer_intensity: 1.0,
  particles_intensity: 1.0,
  waves_intensity: 1.0,
  glitch_intensity: 0.6,
  alarm_intensity: 1.0,
  terminal_intensity: 1.0,
  matrix_intensity: 1.0,
  shatter_intensity: 1.0,
  erosion_intensity: 1.0,
}

export class SkullParams {
  data: SkullParamsData

  constructor(data?: Partial<SkullParamsData>) {
    this.data = { ...DEFAULTS, ...(data || {}) }
  }

  fromData(data: Record<string, unknown>) {
    for (const key of Object.keys(DEFAULTS)) {
      if (key in data && data[key] !== undefined) {
        ;(this.data as unknown as Record<string, unknown>)[key] = data[key]
      }
    }
  }

  toData(): SkullParamsData {
    return { ...this.data }
  }

  static fromJson(json: string | null): SkullParams {
    const p = new SkullParams()
    if (json) {
      try {
        const data = JSON.parse(json)
        p.fromData(data)
      } catch {
        // ignore malformed
      }
    }
    return p
  }

  toJson(): string {
    return JSON.stringify(this.data, null, 2)
  }
}
