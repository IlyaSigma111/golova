import React, { useEffect, useRef, useState } from 'react'
import { SkullCanvas } from '../skull/canvas'
import { SkullParams } from '../skullParams'
import type { StateMsg } from '../types'

const onyx = (window as unknown as { onyx: any }).onyx

export function VizPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const skullRef = useRef<SkullCanvas | null>(null)
  const [full, setFull] = useState(false)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const skull = new SkullCanvas(canvas, new SkullParams())
    skullRef.current = skull
    skull.start()

    const offState = onyx.onState((msg: StateMsg) => {
      const s = skullRef.current
      if (!s) return
      switch (msg.kind) {
        case 'sync': {
          const p = SkullParams.fromJson(null)
          p.fromData(msg.params as unknown as Record<string, unknown>)
          s.updateParams(p)
          s.applyScriptToggles(msg.toggles)
          s.setEmotion(msg.emotion)
          s.setAudioData(msg.isPlaying, msg.amplitude)
          setScale(p.data.head_scale || 1)
          break
        }
        case 'params': {
          const p = SkullParams.fromJson(null)
          p.fromData(msg.data as unknown as Record<string, unknown>)
          s.updateParams(p)
          setScale(p.data.head_scale || 1)
          break
        }
        case 'audio':
          s.setAudioData(msg.isPlaying, msg.amplitude)
          break
        case 'emotion':
          s.setEmotion(msg.emotion)
          break
        case 'effects':
          s.applyScriptToggles(msg.toggles)
          break
        case 'color':
          s.setColorEffect(msg.color)
          break
        case 'resetMouth':
          s.resetMouth()
          break
        case 'video':
          s.clearVideo()
          if (msg.playing && msg.path) {
            const v = document.createElement('video')
            v.src = 'file:///' + msg.path.replace(/\\/g, '/')
            v.muted = false
            v.autoplay = true
            v.loop = true
            v.play().catch(() => {})
            s.setVideoSource(v)
          }
          break
        case 'model':
          s.setModel(msg.model)
          break
      }
    })

    return () => {
      offState()
      skull.stop()
      skullRef.current = null
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') {
        onyx.fullscreen().then(setFull)
      }
      if (e.key === 'Escape') {
        if (full) {
          onyx.fullscreen(false).then(setFull)
        } else {
          onyx.closeChild()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [full])

  return (
    <div className="viz-root">
      <canvas ref={canvasRef} className="viz-canvas" />
      <div className="viz-hud" title="Размер головы (head_scale)">
        <span className="viz-hud-key">ГОЛОВА</span>
        <span className="viz-hud-val">{Math.round(scale * 100)}%</span>
      </div>
    </div>
  )
}
