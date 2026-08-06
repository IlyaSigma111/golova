import React, { useEffect, useState } from 'react'

interface DisplayInfo {
  id: number
  bounds: { x: number; y: number; width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  size: { width: number; height: number }
  scaleFactor: number
}

export function Landing() {
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [msg, setMsg] = useState<string>('')
  const [busy, setBusy] = useState(false)

  const say = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 6000)
  }

  useEffect(() => {
    const anyOnyx = window as unknown as { onyx?: { listDisplays?: () => Promise<DisplayInfo[]> } }
    if (anyOnyx.onyx?.listDisplays) {
      anyOnyx.onyx.listDisplays().then(setDisplays).catch(() => {})
    }
  }, [])

  const onyx = (window as unknown as { onyx: any }).onyx

  const openViz = async () => {
    setBusy(true)
    try {
      await onyx.openViz()
      say('Окно рендера открыто')
    } finally {
      setBusy(false)
    }
  }

  const testAll = async () => {
    setBusy(true)
    try {
      const created = await onyx.openAllDisplays()
      say(`Открыто окон: ${created.length} на ${displays.length} дисплее(ях)`)
    } finally {
      setBusy(false)
    }
  }

  const download = async () => {
    setBusy(true)
    try {
      const dest = await onyx.downloadSelf()
      say(dest ? `Сохранено: ${dest}` : 'Не удалось сохранить (работает из dev-режима)')
    } finally {
      setBusy(false)
    }
  }

  const refresh = async () => {
    const list = await onyx.listDisplays()
    setDisplays(list)
    say(`Дисплеев найдено: ${list.length}`)
  }

  return (
    <div className="landing">
      <header className="ld-header">
        <div className="ld-logo">ГОЛОВА<span className="ld-cursor">_</span></div>
        <div className="ld-sub">череп-аватар на символьной сетке · Electron</div>
      </header>

      <section className="ld-hero">
        <h1>Символьная голова<br /><span>для проектора и мониторов</span></h1>
        <p className="ld-desc">
          Окно рендера выводится на любой дисплей и адаптируется под разрешение.
          Проверьте, плывёт ли голова при смене экрана.
        </p>
        <div className="ld-actions">
          <button className="btn btn-primary" onClick={openViz} disabled={busy}>
            {busy ? '...' : '▶ Вывод рендера'}
          </button>
          <button className="btn btn-accent" onClick={testAll} disabled={busy}>
            {busy ? '...' : '🖥 Тест окон на разных мониторах'}
          </button>
          <button className="btn" onClick={download} disabled={busy}>
            {busy ? '...' : '⤓ Скачать'}
          </button>
          <button className="btn btn-ghost" onClick={refresh}>
            ↻ Дисплеи
          </button>
        </div>
        {msg && <div className="ld-msg">{msg}</div>}
      </section>

      <section className="ld-displays">
        <h2>Подключённые дисплеи</h2>
        {displays.length === 0 ? (
          <div className="ld-empty">Нет данных (запустите через Electron: npm run dev)</div>
        ) : (
          <table className="ld-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Разрешение</th>
                <th>WorkArea</th>
                <th>Scale</th>
              </tr>
            </thead>
            <tbody>
              {displays.map((d) => (
                <tr key={d.id}>
                  <td>{d.id}</td>
                  <td>{d.size.width}×{d.size.height}</td>
                  <td>
                    {d.workArea.width}×{d.workArea.height} @ ({d.workArea.x},{d.workArea.y})
                  </td>
                  <td>{d.scaleFactor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="ld-footer">
        тестовая сборка · ГОЛОВА v0.1.0 · ASCII 80×44
      </footer>
    </div>
  )
}
