import { useEffect, useState } from 'react'
import { Text, type App } from 'leafer-ui'
import type { CanvasModel, SessionSelection } from '../../../model'
import { findItem, indexItems } from '../utils/findItem'
import { richLayout } from '../thinking/richText'

type Overlay = { session: SessionSelection; id: string; x: number; y: number; width: number; height: number; caret?: boolean; highlight?: boolean; pointer?: boolean }
export function RemoteSelections({ app, model, sessions }: { app: App; model?: CanvasModel; sessions: SessionSelection[] }) {
  const [bounds, setBounds] = useState<Overlay[]>([])
  const activeSessions = new Set(sessions)
  useEffect(() => {
    if (!sessions.length) return
    const update = () => {
      // The App can be disposed before React tears down its view overlays.
      const stageElement = (app.view as HTMLElement | null)?.closest('.canvas-stage')
      if (app.destroyed || !stageElement) return
      const stage = stageElement.getBoundingClientRect()
      const count = sessions.reduce((sum, session) => sum + session.elementIds.length + (session.text ? 1 : 0), 0)
      const index = count > 1 ? indexItems(app.tree) : undefined
      const itemFor = (id: string) => index ? index.get(id) : findItem(app.tree, id)
      const overlays: Overlay[] = []
      for (const session of sessions) {
        if (session.cursor && [session.cursor.x, session.cursor.y].every(Number.isFinite)) {
          const point = app.tree.getClientPointByWorld(app.tree.getWorldPoint(session.cursor))
          overlays.push({ session, id: 'pointer', x: point.x - stage.left, y: point.y - stage.top, width: 18, height: 22, pointer: true })
        }
        const presence = session.text, selection = presence && model?.resolveTextPresence(presence), text = presence && itemFor(presence.elementId)
        if (selection && text instanceof Text && text.visible !== false) {
          const layout = richLayout(text, true), carets = layout?.carets || []
          const at = carets.filter(c => c.offset === selection.focus).at(-1)
          const rect = (x: number, y: number, width: number, height: number) => {
            const start = app.tree.getClientPointByWorld(text.getWorldPoint({ x, y })), end = app.tree.getClientPointByWorld(text.getWorldPoint({ x: x + width, y: y + height }))
            return { x: start.x - stage.left, y: start.y - stage.top, width: Math.max(2, end.x - start.x), height: Math.max(8, end.y - start.y) }
          }
          if (at && at.y + at.height >= 0 && at.y <= Number(text.height)) overlays.push({ session, id: `${presence!.elementId}:caret`, ...rect(at.x, Math.max(0, at.y), 0, Math.min(at.height, Number(text.height) - Math.max(0, at.y))), caret: true })
          const min = Math.min(selection.anchor, selection.focus), max = Math.max(selection.anchor, selection.focus)
          carets.forEach((caret, index) => {
            const next = carets[index + 1]
            if (!next || caret.offset < min || caret.offset >= max || next.y !== caret.y || next.x <= caret.x || caret.y < 0 || caret.y + caret.height > Number(text.height)) return
            overlays.push({ session, id: `${presence!.elementId}:${index}`, ...rect(caret.x, caret.y, next.x - caret.x, caret.height), highlight: true })
          })
          continue
        }
        for (const id of session.elementIds) {
          const item = itemFor(id)
          if (!item || item.visible === false) continue
          const box = item.getBounds('render', 'world')
          overlays.push({ session, id, x: box.x, y: box.y, width: box.width, height: box.height })
        }
      }
      setBounds(previous => previous.length === overlays.length && previous.every((old, i) => {
        const next = overlays[i]
        return old.session === next.session && old.id === next.id && old.x === next.x && old.y === next.y && old.width === next.width && old.height === next.height && old.caret === next.caret && old.highlight === next.highlight && old.pointer === next.pointer
      }) ? previous : overlays)
    }
    update(); const timer = window.setInterval(update, 125)
    return () => window.clearInterval(timer)
  }, [app, model, sessions])
  return <div className="remote-selections" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 38 }}>
    {bounds.filter(b => activeSessions.has(b.session)).map(b => <div key={`${b.session.sessionId}:${b.id}`} data-remote-session={b.session.sessionId} data-remote-pointer={b.pointer || undefined} data-remote-caret={b.caret || undefined} data-remote-highlight={b.highlight || undefined} style={{ position: 'absolute', left: b.x, top: b.y, width: b.width, height: b.height, ...(b.pointer ? {} : b.highlight ? { background: b.session.color, opacity: .22 } : b.caret ? { background: b.session.color, boxShadow: '0 0 0 1px #ffffff' } : { border: `2px solid ${b.session.color}` }) }}>
      {b.pointer && <svg width="18" height="22" viewBox="0 0 18 22" fill={b.session.color} stroke="white" strokeWidth="1.2"><path d="M1 1 16 13l-7 1-3 7L1 1Z" /></svg>}
      {!b.highlight && <span style={{ position: 'absolute', top: b.pointer ? 18 : -22, left: b.pointer ? 14 : -2, background: b.session.color, color: 'white', fontSize: 11, whiteSpace: 'nowrap', padding: '2px 5px', borderRadius: 3 }}>{b.session.name}</span>}
    </div>)}
  </div>
}
