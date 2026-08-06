export interface SkullParamsData {
  head_height: number
  width_top: number
  width_forehead: number
  width_eyes: number
  width_nose: number
  width_mouth: number
  width_chin: number
  zone_top: number
  zone_forehead: number
  zone_eyes: number
  zone_nose: number
  zone_mouth: number
  zone_chin: number
  eye_width: number
  eye_height: number
  eye_spacing: number
  nose_width: number
  nose_height: number
  mouth_width: number
  mouth_height: number
  color_effect: boolean
  color_effect_progress: number
  color_effect_active: boolean
  color_effect_target: 'red' | 'white' | 'reset'
  previous_color: 'red' | 'white'
}

export interface ScriptData {
  name: string
  audio_path: string | null
  video_path: string | null
  emotion: number
  erosion_enabled: boolean
  glitch_enabled: boolean
  alarm_enabled: boolean
  terminal_enabled: boolean
  matrix_enabled: boolean
  shatter_enabled: boolean
  visualizer_enabled: boolean
  particles_enabled: boolean
  waves_enabled: boolean
  color_effect: 'red' | 'white' | null
}

export interface EffectToggles {
  visualizer: boolean
  particles: boolean
  waves: boolean
  glitch: boolean
  alarm: boolean
  terminal: boolean
  matrix: boolean
  shatter: boolean
  erosion: boolean
}
