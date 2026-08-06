import React, { useEffect, useRef, useState } from 'react'
import { SkullCanvas } from '../skull/canvas'
import { SkullParams } from '../skullParams'
import { COLS, ROWS } from '../headMap'

const onyx = (window as unknown as { onyx: any }).onyx

export function VizPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const skullRef = useRef<SkullCanvas | null>(null)
  const [hud, setHud] = useState('')
  const [displayInfo, setDisplayInfo] = useState('')
  const [full, setFull] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const skull = new SkullCanvas(canvas, new SkullParams())
    skullRef.current = skull
    skull.start()
    return () => {
      skull.stop()
      skullRef.current = null
    }
  }, [])

  useEffect(() => {
    const updateHud = () => {
      const skull = skullRef.current
      const cw = skull?.canvas.clientWidth || 0
      const ch = skull?.canvas.clientHeight || 0
      const dpr = window.devicePixelRatio || 1
      const cellX = cw / COLS
      const cellY = ch / ROWS
      const cellSize = Math.min(cellX, cellY) * 0.85
      setHud(
        `${cw}×${ch}px · dpr ${dpr} · сетка ${COLS}×${ROWS} · клетка ${cellSize.toFixed(1)}px · шрифт ${Math.max(7, Math.floor(cellSize * 0.85))}px`
      )
    }
    updateHud()
    const ro = new ResizeObserver(updateHud)
    if (canvasRef.current) ro.observe(canvasRef.current)

    const off = onyx.onDisplayChange((data: any) => {
      const d = data?.display
      setDisplayInfo(
        d ? `дисплей ${d.id} · ${d.workArea.width}×${d.workArea.height} @ scale ${d.scaleFactor}` : ''
      )
      updateHud()
    })

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
      ro.disconnect()
      off()
      window.removeEventListener('keydown', onKey)
    }
  }, [full])

  return (
    <div className="viz-root">
      <canvas ref={canvasRef} className="viz-canvas" />
      <div className="viz-hud">
        <span className="hud-title">ГОЛОВА</span>
        <span>{hud}</span>
        {displayInfo && <span className="hud-display">{displayInfo}</span>}
        <span className="hud-hint">F — полноэкран · Esc — закрыть</span>
      </div>
    </div>
  )
}
