import { useEffect, useState } from 'react'
import type { App } from 'leafer-ui'
import type { SessionSelection } from '../../../model'
import { findItem } from '../utils/findItem'

export function RemoteSelections({ app, sessions }: { app: App; sessions: SessionSelection[] }) {
  const [bounds, setBounds] = useState<{ session: SessionSelection; id: string; x: number; y: number; width: number; height: number }[]>([])
  useEffect(() => {
    const update = () => setBounds(sessions.flatMap(session => session.elementIds.flatMap(id => {
      const item = findItem(app.tree, id)
      if (!item) return []
      const box = item.getBounds('render', 'world')
      return [{ session, id, x: box.x, y: box.y, width: box.width, height: box.height }]
    })))
    update()
    const timer = window.setInterval(update, 125)
    return () => window.clearInterval(timer)
  }, [app, sessions])
  return <div className="remote-selections" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 12 }}>
    {bounds.map(b => <div key={`${b.session.sessionId}:${b.id}`} data-remote-session={b.session.sessionId} style={{ position: 'absolute', left: b.x, top: b.y, width: b.width, height: b.height, border: `2px solid ${b.session.color}` }}>
      <span style={{ position: 'absolute', top: -22, left: -2, background: b.session.color, color: 'white', fontSize: 11, whiteSpace: 'nowrap', padding: '2px 5px' }}>{b.session.name}</span>
    </div>)}
  </div>
}
