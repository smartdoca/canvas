import { useEffect, useState } from 'react'
import type { App } from 'leafer-ui'
import type { CanvasModel } from '../../../model'
import type { CanvasAnchorClick, CanvasAnchorDecoration, CanvasElementBounds } from '../../../sdk/types'
import { elementBounds } from '../utils/elementBounds'
import { useCanvasI18n } from '../../../i18n/context'

export function AnchorDecorations({ app, model, anchors, activeId, onClick }: {
  app: App; model: CanvasModel; anchors: CanvasAnchorDecoration[]; activeId?: string | null; onClick?: (event: CanvasAnchorClick) => void
}) {
  const [items, setItems] = useState<{ decoration: CanvasAnchorDecoration; elementIds: string[]; boxes: (CanvasElementBounds & { id: string })[] }[]>([])
  useEffect(() => {
    const update = () => {
      if (model.isDisposed) return
      setItems(anchors.filter(a => !a.resolved).flatMap(decoration => {
        const { elementIds } = model.resolveAnchor(decoration.anchor)
        const boxes = elementIds.flatMap(id => { const found = elementBounds(app, id); return found?.bounds && !found.hidden ? [{ ...found.bounds, id }] : [] })
        return boxes.length ? [{ decoration, elementIds, boxes }] : []
      }))
    }
    update()
    const timer = window.setInterval(update, 100)
    return () => window.clearInterval(timer)
  }, [app, model, anchors])
  const t = useCanvasI18n()
  return <div className="anchor-decorations" aria-label={t('anchor.region')}>
    {items.map(({ decoration, elementIds, boxes }) => <div key={decoration.anchorId} data-anchor-id={decoration.anchorId} data-active={activeId === decoration.anchorId}>
      {boxes.map(box => <div key={box.id} className="anchor-decoration-box" data-anchor-element={box.id} style={{ left: box.x, top: box.y, width: box.width, height: box.height }} />)}
      <button type="button" className="anchor-decoration-marker" aria-label={decoration.label || t('anchor.comment', { id: decoration.anchorId })} aria-pressed={activeId === decoration.anchorId}
        style={{ left: boxes[0].x + boxes[0].width - 10, top: boxes[0].y - 10 }}
        onPointerDown={event => event.stopPropagation()}
        onClick={event => { event.stopPropagation(); onClick?.({ anchorId: decoration.anchorId, anchor: decoration.anchor, elementIds }) }}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', margin: 'auto' }}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    </div>)}
  </div>
}
