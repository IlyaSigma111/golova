import React, { useEffect, useRef, useState } from 'react'
import { SkullCanvas } from '../skull/canvas'
import { hub, DEFAULT_EFFECTS, EMOTION_LABELS } from '../state/hub'
import { emotionLabel } from '../state/hub'
import { MusicWidget } from '../ui/MusicWidget'
import { ScriptEditor } from '../ui/ScriptEditor'
import { Icon, type IconName } from '../ui/icons'
import type { EffectToggles, ScriptData } from '../types'

const onyx = window as unknown as {
  onyx?: {
    readText: (p: string) => Promise<string | null>
    writeText: (p: string, d: string) => Promise<boolean>
  }
}

const FACE_EFFECTS: Array<{ key: keyof EffectToggles; icon: IconName; label: string; color: string }> = [
  { key: 'erosion', icon: 'skull', label: 'Эрозия лица (осыпание)', color: '#ff8800' },
  { key: 'glitch', icon: 'glitch', label: 'Помехи (глитч)', color: '#ff44ff' },
  { key: 'alarm', icon: 'alarm', label: 'Тревога (ошибка/внимание)', color: '#ff2222' },
  { key: 'terminal', icon: 'terminal', label: 'Терминал', color: '#00ff88' },
  { key: 'matrix', icon: 'matrix', label: 'Матрица (дождь из кода)', color: '#00ff44' },
  { key: 'shatter', icon: 'shatter', label: 'Рассыпание', color: '#ff8844' },
]

const BG_EFFECTS: Array<{ key: keyof EffectToggles; icon: IconName; label: string }> = [
  { key: 'visualizer', icon: 'visualizer', label: 'Звуковой визуализатор' },
  { key: 'particles', icon: 'particles', label: 'Символы кода' },
  { key: 'waves', icon: 'waves', label: 'Волны' },
]

const INTENSITY_LIST: Array<{ key: string; label: string }> = [
  { key: 'glitch', label: 'Помехи' },
]

const EMOTION_BUTTONS: Array<{ value: number; icon: IconName; label: string }> = [
  { value: 1, icon: 'smile', label: 'Доброта' },
  { value: 0, icon: 'neutral', label: 'Нейтрально' },
  { value: -1, icon: 'angry', label: 'Злость' },
]

function emptyScript(): ScriptData {
  return {
    name: 'Новый сценарий',
    audio_path: null,
    video_path: null,
    emotion: 0,
    erosion_enabled: false,
    glitch_enabled: false,
    alarm_enabled: false,
    terminal_enabled: false,
    matrix_enabled: false,
    shatter_enabled: false,
    visualizer_enabled: true,
    particles_enabled: true,
    waves_enabled: true,
    color_effect: null,
  }
}

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() || p
}

export function MainPanel() {
  const [status, setStatus] = useState('Готов')
  const [avatarStatus, setAvatarStatus] = useState('Аватар не загружен')
  const [toggles, setToggles] = useState<EffectToggles>(DEFAULT_EFFECTS())
  const [scripts, setScripts] = useState<ScriptData[]>([])
  const [currentIdx, setCurrentIdx] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [autoPlay, setAutoPlay] = useState(true)
  const [editor, setEditor] = useState<{ script: ScriptData; isNew: boolean } | null>(null)
  const [headScale, setHeadScale] = useState(1)
  const [fxIntensity, setFxIntensity] = useState<Record<string, number>>({})
  const [paused, setPaused] = useState(false)
  const [anim, setAnim] = useState<Record<string, number | boolean>>({
    blink_enabled: true,
    blink_interval: 3,
    blink_duration: 0.2,
    pupil_size: 1,
    pupil_move: true,
    mouth_amp: 1,
    mouth_speed: 1,
  })

  const [aiApiKey, setAiApiKey] = useState(localStorage.getItem('gemini_api_key') || '')
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResponseText, setAiResponseText] = useState('')

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const skullRef = useRef<SkullCanvas | null>(null)
  const [modelLoaded, setModelLoaded] = useState(false)

  const refresh = () => {
    setScripts([...hub.scripts.scripts])
    const ci = hub.scripts.scripts.findIndex((s) => s === hub.currentScript)
    setCurrentIdx(ci)
    setToggles({ ...hub.effects })
    setHeadScale(hub.params.data.head_scale || 1)
    setFxIntensity({ ...(hub.params.data as unknown as Record<string, number>) })
    setAnim({
      blink_enabled: hub.params.data.blink_enabled !== false,
      blink_interval: hub.params.data.blink_interval ?? 3,
      blink_duration: hub.params.data.blink_duration ?? 0.2,
      pupil_size: hub.params.data.pupil_size ?? 1,
      pupil_move: hub.params.data.pupil_move !== false,
      mouth_amp: hub.params.data.mouth_amp ?? 1,
      mouth_speed: hub.params.data.mouth_speed ?? 1,
    })
  }

  useEffect(() => {
    hub.onStatus = (s) => setStatus(s)
    hub.onPlayStateChange = (p) => {
      setPlaying(p)
      if (!p) setPaused(false)
      setToggles({ ...hub.effects })
    }
    hub.onScriptsChange = () => refresh()
    hub.onParamsChange = () => refresh()

    let alive = true
    ;(async () => {
      await Promise.all([hub.loadParams(), hub.scriptsInit()])
      if (!alive) return
      hub.autoPlayEnabled = true
      setAvatarStatus('Аватар загружен (default)')
      if (hub.scripts.scripts.length) hub.currentScript = hub.scripts.scripts[0]
      refresh()
      const canvas = canvasRef.current
      if (canvas) {
        const skull = new SkullCanvas(canvas, hub.params)
        skullRef.current = skull
        skull.start()
        hub.setPreview(skull)
      }
    })()

    return () => {
      alive = false
      hub.setPreview(null)
      skullRef.current?.stop()
      skullRef.current = null
      hub.onStatus = null
      hub.onPlayStateChange = null
      hub.onScriptsChange = null
      hub.onParamsChange = null
    }
  }, [])

  const current = currentIdx >= 0 && currentIdx < scripts.length ? scripts[currentIdx] : null

  const toggleFx = (key: keyof EffectToggles, active: boolean) => {
    hub.setEffect(key, active)
    setToggles({ ...hub.effects })
  }

  const loadAvatar = async () => {
    const ok = await hub.loadAvatar()
    if (ok) setAvatarStatus('Аватар загружен (пользовательский)')
  }

  const loadModelBtn = async () => {
    const ok = await hub.loadModel()
    if (ok) {
      setAvatarStatus('Модель загружена (Головастик)')
      setModelLoaded(true)
    }
  }

  const clearModelBtn = () => {
    hub.clearModel()
    setModelLoaded(false)
    setAvatarStatus('Аватар загружен (default)')
  }

  const newScript = () => setEditor({ script: emptyScript(), isNew: true })

  const editScript = () => {
    if (current) setEditor({ script: current, isNew: false })
  }

  const deleteScript = () => {
    if (!current) return
    if (!window.confirm(`Удалить сценарий «${current.name}»?`)) return
    const idx = hub.scripts.scripts.findIndex((s) => s === current)
    if (idx < 0) return
    if (hub.isPlaying) hub.stopScript()
    hub.scripts.remove(idx)
    if (hub.currentScript === current) hub.currentScript = hub.scripts.scripts[0] ?? null
    hub.scripts.save()
    refresh()
  }

  const renameScript = (script: ScriptData) => {
    const n = window.prompt('Новое имя сценария', script.name)
    if (!n || !n.trim() || n.trim() === script.name) return
    if (hub.scripts.scripts.some((s) => s !== script && s.name === n.trim())) {
      window.alert(`Сценарий с именем '${n.trim()}' уже существует`)
      return
    }
    hub.scripts.rename(hub.scripts.scripts.findIndex((s) => s === script), n)
    refresh()
  }

  const editorClose = (res: ScriptData | null) => {
    if (res) {
      if (editor?.isNew) {
        if (hub.scripts.scripts.some((s) => s.name === res.name)) {
          window.alert(`Сценарий с именем '${res.name}' уже существует`)
          return
        }
        hub.scripts.scripts.push(res)
      } else if (editor) {
        const idx = hub.scripts.scripts.findIndex((s) => s === editor.script)
        if (idx >= 0) hub.scripts.scripts[idx] = res
      }
      hub.scripts.save()
      hub.selectScript(res)
      refresh()
    }
    setEditor(null)
  }

  const saveScriptToFile = async () => {
    if (!current) return
    const p = await hub.onyx?.saveFile({
      title: 'Сохранить сценарий',
      defaultPath: `${current.name}.json`,
      filters: [{ name: 'Script files', extensions: ['json'] }],
    })
    if (!p) return
    await onyx.onyx?.writeText(p, JSON.stringify(current, null, 2))
    setStatus(`[SAVE] Сценарий сохранен: ${baseName(p)}`)
  }

  const loadScriptFromFile = async () => {
    const p = await hub.onyx?.openFile({
      title: 'Загрузить сценарий',
      filters: [{ name: 'Script files', extensions: ['json'] }],
    })
    if (!p) return
    const raw = await onyx.onyx?.readText(p)
    if (!raw) {
      setStatus('[ERR] Не удалось прочитать файл')
      return
    }
    try {
      const data = JSON.parse(raw) as Partial<ScriptData>
      const script: ScriptData = { ...emptyScript(), ...data }
      const existing = hub.scripts.scripts.find((s) => s.name === script.name)
      if (existing) {
        if (!window.confirm(`Сценарий с именем '${script.name}' уже существует. Заменить?`)) return
        hub.scripts.scripts[hub.scripts.scripts.indexOf(existing)] = script
      } else {
        hub.scripts.scripts.push(script)
      }
      hub.scripts.save()
      hub.selectScript(script)
      refresh()
      setStatus(`[LOAD] Сценарий загружен: ${baseName(p)}`)
    } catch {
      setStatus('[ERR] Ошибка в JSON сценария')
    }
  }

  const play = () => {
    if (!current) return
    hub.playScript(current)
    setPlaying(true)
    setPaused(false)
  }

  const stop = () => {
    hub.stopScript()
    setPlaying(false)
    setPaused(false)
  }

  const pauseToggle = () => {
    hub.togglePause()
    setPaused(hub.isPaused)
  }

  const step = (dir: 1 | -1) => {
    if (!scripts.length) return
    const n = scripts.length
    const idx = current ? scripts.findIndex((s) => s === current) : -1
    const start = idx < 0 ? (dir === 1 ? -1 : 0) : idx
    const next = scripts[(((start + dir) % n) + n) % n]
    hub.selectScript(next)
    refresh()
    hub.playScript(next)
    setPlaying(true)
    setPaused(false)
  }

  const effectsList = current
    ? (FACE_EFFECTS as Array<{ key: keyof EffectToggles; icon: IconName; label: string }>)
        .filter((e) => (current as unknown as Record<string, unknown>)[e.key + '_enabled'])
        .map((e) => e.label.replace(/\s*\(.*\)/, ''))
        .concat(
          (BG_EFFECTS as Array<{ key: keyof EffectToggles; icon: IconName; label: string }>)
            .filter((e) => (current as unknown as Record<string, unknown>)[e.key + '_enabled'])
            .map((e) => e.label)
        )
        .concat(current.color_effect ? [`Цвет: ${current.color_effect === 'red' ? 'Красный' : 'Белый'}`] : [])
    : []

  const infoLines = current
    ? [
        `Текущий: ${current.name}`,
        `аудио: ${current.audio_path ? baseName(current.audio_path) : 'нет аудио'}`,
        `видео: ${current.video_path ? baseName(current.video_path) : 'нет видео'}`,
        `эмоция: ${emotionLabel(current.emotion)}`,
        ...(effectsList.length ? [`Эффекты: ${effectsList.join(', ')}`] : []),
      ]
    : ['Текущий: не выбран']

  return (
    <div className="panel-root">
      <div className="panel-body">
        <aside className="panel-left">
          <button className="btn-viz" onClick={() => hub.openViz()}>
            <Icon name="monitor" size={18} /> Открыть визуализацию
          </button>

          {/* ── 1. Аватар ── */}
          <section className="grp">
            <div className="grp-title"><Icon name="skull" size={14} /> Аватар</div>
            <button className="btn btn-sm btn-block" onClick={loadAvatar}>
              <Icon name="folderOpen" size={14} /> Загрузить аватар
            </button>
            <button className="btn btn-sm btn-block" onClick={loadModelBtn}>
              <Icon name="folderOpen" size={14} /> Загрузить модель (Головастик)
            </button>
            <button className="btn btn-sm btn-block" onClick={clearModelBtn} disabled={!modelLoaded}>
              Сбросить модель
            </button>
            <div className="avatar-status" style={{ color: avatarStatus.includes('не загружен') ? '#888' : '#00ff00' }}>
              {avatarStatus}
            </div>
          </section>

          {/* ── 2. Эффекты лица ── */}
          <section className="grp">
            <div className="grp-title"><Icon name="glitch" size={14} /> Эффекты лица</div>
            {FACE_EFFECTS.map((e) => (
              <label key={e.key} className={'fx-cb' + (toggles[e.key] ? ' on' : '')} style={{ '--ac': e.color } as React.CSSProperties}>
                <input type="checkbox" checked={toggles[e.key]} onChange={(ev) => toggleFx(e.key, ev.target.checked)} />
                <Icon name={e.icon} size={14} className="chk-icon" />
                <span>{e.label}</span>
              </label>
            ))}
          </section>

          {/* ── 3. Цвет и Эмоции ── */}
          <section className="grp">
            <div className="grp-title"><Icon name="droplet" size={14} /> Цвет и Эмоции</div>
            <div className="fx-label"><Icon name="droplet" size={13} /> Эффекты цвета:</div>
            <div className="color-row">
              <button className="btn btn-sm btn-c-red" title="Красный" onClick={() => hub.setColor('red')}>
                <Icon name="droplet" size={14} />
              </button>
              <button className="btn btn-sm btn-c-green" title="Исходный цвет" onClick={() => hub.setColor('reset')}>
                <Icon name="reset" size={14} />
              </button>
              <button className="btn btn-sm btn-c-white" title="Белый" onClick={() => hub.setColor('white')}>
                <Icon name="droplet" size={14} />
              </button>
            </div>
            <div className="grp-divider"></div>
            <div className="fx-label"><Icon name="neutral" size={13} /> Эмоция:</div>
            <div className="emotion-row">
              {EMOTION_BUTTONS.map((e) => (
                <button
                  key={e.value}
                  className={'emotion-btn' + (hub.emotion === e.value ? ' active' : '')}
                  title={e.label}
                  onClick={() => {
                    hub.setEmotion(e.value)
                    if (current) {
                      current.emotion = e.value
                      hub.scripts.save()
                    }
                    // Принудительный рендер для подсветки активной кнопки
                    setToggles({ ...hub.effects })
                  }}
                >
                  <Icon name={e.icon} size={15} />
                </button>
              ))}
            </div>
          </section>

          {/* ── 4. Эффекты фона ── */}
          <section className="grp">
            <div className="grp-title"><Icon name="visualizer" size={14} /> Эффекты фона</div>
            {BG_EFFECTS.map((e) => (
              <label key={e.key} className={'fx-cb' + (toggles[e.key] ? ' on' : '')}>
                <input type="checkbox" checked={toggles[e.key]} onChange={(ev) => toggleFx(e.key, ev.target.checked)} />
                <Icon name={e.icon} size={14} className="chk-icon" />
                <span>{e.label}</span>
              </label>
            ))}
            <div className="grp-divider"></div>
            <div className="fx-label"><Icon name="sliders" size={13} /> Интенсивность эффектов:</div>
            {INTENSITY_LIST.map((item) => (
              <label key={item.key} className="fx-slider">
                <span className="fx-slider-label">{item.label}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={fxIntensity[item.key + '_intensity'] ?? 1}
                  onChange={(ev) => {
                    const v = parseFloat(ev.target.value)
                    setFxIntensity((prev) => ({ ...prev, [item.key + '_intensity']: v }))
                    hub.setEffectIntensity(item.key, v)
                  }}
                />
                <span className="fx-slider-val">
                  {Math.round((fxIntensity[item.key + '_intensity'] ?? 1) * 100)}%
                </span>
              </label>
            ))}
          </section>

          {/* ── 5. Анимация ── */}
          <section className="grp">
            <div className="grp-title"><Icon name="eye" size={14} /> Анимация</div>

            <label className="fx-cb">
              <input
                type="checkbox"
                checked={anim.blink_enabled !== false}
                onChange={(ev) => {
                  setAnim((prev) => ({ ...prev, blink_enabled: ev.target.checked }))
                  hub.setAnimParam('blink_enabled', ev.target.checked)
                }}
              />
              <Icon name="eye" size={14} className="chk-icon" />
              <span>Моргание</span>
            </label>

            <label className="fx-slider">
              <span className="fx-slider-label">Интервал моргания, с</span>
              <input
                type="range"
                min={0.5}
                max={10}
                step={0.1}
                value={anim.blink_interval as number}
                onChange={(ev) => {
                  const v = parseFloat(ev.target.value)
                  setAnim((prev) => ({ ...prev, blink_interval: v }))
                  hub.setAnimParam('blink_interval', v)
                }}
              />
              <span className="fx-slider-val">{(anim.blink_interval as number).toFixed(1)}</span>
            </label>

            <label className="fx-slider">
              <span className="fx-slider-label">Длительность моргания, с</span>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.01}
                value={anim.blink_duration as number}
                onChange={(ev) => {
                  const v = parseFloat(ev.target.value)
                  setAnim((prev) => ({ ...prev, blink_duration: v }))
                  hub.setAnimParam('blink_duration', v)
                }}
              />
              <span className="fx-slider-val">{(anim.blink_duration as number).toFixed(2)}</span>
            </label>

            <label className="fx-slider">
              <span className="fx-slider-label">Размер зрачков</span>
              <input
                type="range"
                min={0.3}
                max={2.5}
                step={0.05}
                value={anim.pupil_size as number}
                onChange={(ev) => {
                  const v = parseFloat(ev.target.value)
                  setAnim((prev) => ({ ...prev, pupil_size: v }))
                  hub.setAnimParam('pupil_size', v)
                }}
              />
              <span className="fx-slider-val">{(anim.pupil_size as number).toFixed(2)}×</span>
            </label>

            <label className="fx-cb">
              <input
                type="checkbox"
                checked={anim.pupil_move !== false}
                onChange={(ev) => {
                  setAnim((prev) => ({ ...prev, pupil_move: ev.target.checked }))
                  hub.setAnimParam('pupil_move', ev.target.checked)
                }}
              />
              <Icon name="eye" size={14} className="chk-icon" />
              <span>Движение зрачков</span>
            </label>

            <label className="fx-slider">
              <span className="fx-slider-label">Рот: размах</span>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={anim.mouth_amp as number}
                onChange={(ev) => {
                  const v = parseFloat(ev.target.value)
                  setAnim((prev) => ({ ...prev, mouth_amp: v }))
                  hub.setAnimParam('mouth_amp', v)
                }}
              />
              <span className="fx-slider-val">{(anim.mouth_amp as number).toFixed(2)}</span>
            </label>

            <label className="fx-slider">
              <span className="fx-slider-label">Рот: скорость</span>
              <input
                type="range"
                min={0.2}
                max={4}
                step={0.1}
                value={anim.mouth_speed as number}
                onChange={(ev) => {
                  const v = parseFloat(ev.target.value)
                  setAnim((prev) => ({ ...prev, mouth_speed: v }))
                  hub.setAnimParam('mouth_speed', v)
                }}
              />
              <span className="fx-slider-val">{(anim.mouth_speed as number).toFixed(1)}×</span>
            </label>
          </section>

          {/* Блок 6. ИИ (Временно скроем в релизе) */}
          <section className="grp">
            <div className="grp-title"><Icon name="terminal" size={14} /> ИИ (Gemini)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '0 4px', marginBottom: '4px' }}>
              <input
                type="password"
                placeholder="Gemini API Key"
                value={aiApiKey}
                onChange={(e) => {
                  setAiApiKey(e.target.value)
                  localStorage.setItem('gemini_api_key', e.target.value)
                }}
                style={{ fontSize: '11px', padding: '4px 6px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(52, 224, 122, 0.5)', color: '#fff', borderRadius: '4px' }}
              />
              <textarea
                placeholder="Что скажешь, Голова?"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                style={{ fontSize: '12px', padding: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(52, 224, 122, 0.5)', color: '#fff', borderRadius: '4px', resize: 'vertical', minHeight: '50px' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (!aiLoading && aiPrompt.trim()) {
                      setAiLoading(true)
                      hub.askAi(aiPrompt, aiApiKey, setAiResponseText).finally(() => setAiLoading(false))
                      setAiPrompt('')
                    }
                  }
                }}
              />
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  className="btn btn-sm"
                  style={{ flex: 1 }}
                  disabled={aiLoading || !aiPrompt.trim()}
                  onClick={() => {
                    setAiLoading(true)
                    hub.askAi(aiPrompt, aiApiKey, setAiResponseText).finally(() => setAiLoading(false))
                    setAiPrompt('')
                  }}
                >
                  {aiLoading ? 'Думает...' : 'Отправить'}
                </button>
                <button
                  className="btn btn-sm btn-accent"
                  title="Сказать голосом"
                  onClick={() => {
                    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                    if (!SpeechRecognition) return alert('Голосовой ввод не поддерживается.');
                    const recognition = new SpeechRecognition();
                    recognition.lang = 'ru-RU';
                    recognition.onresult = (e: any) => {
                      const text = e.results[0][0].transcript;
                      setAiLoading(true);
                      hub.askAi(text, aiApiKey, setAiResponseText).finally(() => setAiLoading(false));
                    };
                    recognition.start();
                  }}
                >
                  🎙
                </button>
              </div>
              {aiResponseText && (
                <div style={{ fontSize: '11px', color: '#88e0a0', marginTop: '4px', lineHeight: '1.3', maxHeight: '120px', overflowY: 'auto', padding: '4px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                  {aiResponseText}
                </div>
              )}
            </div>
          </section>

          <section className="grp grp-status">
            <div className="grp-title"><Icon name="terminal" size={14} /> Статус</div>
            <div className="status-line">{status}</div>
          </section>
        </aside>

        <main className="panel-center">
          <div className="preview-title"><Icon name="monitor" size={15} /> Предпросмотр</div>
          <div className="preview-wrap">
            <canvas ref={canvasRef} className="preview-canvas" />
          </div>
          <div className="preview-size">
            <span className="preview-size-label">Размер головы</span>
            <input
              type="range"
              min={0.4}
              max={2.4}
              step={0.05}
              value={headScale}
              onChange={(ev) => {
                const v = parseFloat(ev.target.value)
                setHeadScale(v)
                hub.setHeadScale(v)
              }}
            />
            <span className="preview-size-val">{headScale.toFixed(2)}×</span>
          </div>
        </main>

        <aside className="panel-right">
          <div className="sc-title"><Icon name="file" size={14} /> Список сценариев</div>

          <div className="sc-list">
            {scripts.length === 0 ? (
              <div className="sc-empty">Сценариев нет — создайте новый</div>
            ) : (
              scripts.map((s, i) => (
                <div
                  key={i}
                  className={'sc-item' + (i === currentIdx ? ' current' : '')}
                  onClick={() => {
                    hub.selectScript(s)
                    refresh()
                  }}
                  onDoubleClick={() => {
                    hub.selectScript(s)
                    refresh()
                    hub.playScript(s)
                    setPlaying(true)
                  }}
                >
                  <Icon name="file" size={12} className="sc-ic" />
                  <span className="sc-name">{s.name}</span>
                  <button
                    type="button"
                    className="sc-rename"
                    title="Переименовать"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      renameScript(s)
                    }}
                  >
                    <Icon name="edit" size={11} />
                  </button>
                  <span className="sc-mark">
                    {playing && s === hub.currentScript ? <Icon name="play" size={11} /> : s === hub.currentScript ? <span className="sc-arrow">◀</span> : null}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="sc-info">
            {infoLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>

          <div className="row">
            <button className="btn btn-sm" onClick={newScript}><Icon name="plus" size={13} /> Новый</button>
            <button className="btn btn-sm" onClick={editScript} disabled={!current}><Icon name="edit" size={13} /> Редактировать</button>
            <button className="btn btn-sm btn-danger" onClick={deleteScript} disabled={!current}><Icon name="trash" size={13} /> Удалить</button>
          </div>
          <div className="row">
            <button className="btn btn-sm" onClick={loadScriptFromFile}><Icon name="folderOpen" size={13} /> Загрузить</button>
            <button className="btn btn-sm" onClick={saveScriptToFile} disabled={!current}><Icon name="save" size={13} /> Сохранить</button>
          </div>
          <div className="row">
            <button
              className="btn btn-primary btn-sm btn-playwide"
              onClick={paused ? pauseToggle : playing ? pauseToggle : play}
              disabled={!current}
            >
              <Icon name={paused || !playing ? 'play' : 'pause'} size={13} /> {paused ? 'Продолжить' : playing ? 'Пауза' : 'Воспроизвести'}
            </button>
            <button className="btn btn-sm btn-danger" onClick={stop} disabled={!current}><Icon name="stop" size={13} /> Стоп</button>
          </div>
          <div className="row auto-row">
            <label className="chk auto">
              <input
                type="checkbox"
                checked={autoPlay}
                onChange={(ev) => {
                  setAutoPlay(ev.target.checked)
                  hub.autoPlayEnabled = ev.target.checked
                }}
              />
              <Icon name="refresh" size={13} className="chk-icon" />
              <span>Авто</span>
            </label>
            <span className="row-grow" />
            <button className="btn btn-sm btn-sq" onClick={() => step(-1)} title="Предыдущий"><Icon name="skipPrev" size={13} /></button>
            <button className="btn btn-sm btn-sq" onClick={() => step(1)} title="Следующий"><Icon name="skipNext" size={13} /></button>
          </div>

          <section className="grp grp-music">
            <MusicWidget />
          </section>
        </aside>
      </div>

      {editor && <ScriptEditor initial={editor.script} onClose={editorClose} />}
    </div>
  )
}
