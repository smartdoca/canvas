import type { App, IUI, Path } from 'leafer-ui'
import { Text } from 'leafer-ui'
import { allItems, connectorGeometry, connectorLocalPoint, connectorPagePoint, endpoint, isConnector, kind, type AnchorPoint } from './scene'
import { enhanceRichText } from './richText'

function paintCopy(item: IUI) {
  const copy = item.clone({ id: '', name: 'object-drag-preview', skipJSON: true, editable: false, hittable: false })
  const enhance = (node: IUI) => { if (node instanceof Text) enhanceRichText(node); node.children?.forEach(enhance) }
  enhance(copy)
  const render = item.__render
  item.__render = () => {}
  item.parent!.add(copy); item.forceRender()
  return { copy, dispose() { item.__render = render; copy.destroy(); if (!item.destroyed) item.forceRender() } }
}

/** A native paint-only copy: the real element and its JSON stay unchanged until release. */
export function connectorTranslationPreview(app: App, line: IUI) {
  const label = allItems(app).find(item => item.id === line.data?.labelId && kind(item) === 'connector-label')
  const copies = [line, label].filter((item): item is IUI => Boolean(item?.parent)).map(item => {
    const result = paintCopy(item); result.copy.name = 'connector-drag-preview'; return result
  })
  return {
    update(from: AnchorPoint, to: AnchorPoint, data: Record<string, unknown>) {
      const edge = copies[0]?.copy as Path | undefined
      if (!edge) return
      edge.path = connectorGeometry(from, to, data).path
      if (label && copies[1]) {
        const delta = { x: from.x - line.data!.from.x, y: from.y - line.data!.from.y }
        const a = connectorLocalPoint(app, label, connectorPagePoint(app, line, { x: 0, y: 0 }))
        const b = connectorLocalPoint(app, label, connectorPagePoint(app, line, delta))
        copies[1].copy.set({ x: Number(label.x) + b.x - a.x, y: Number(label.y) + b.y - a.y })
      }
    },
    dispose() {
      copies.forEach(copy => copy.dispose())
    },
  }
}

export function movingObjectPreview(app: App, owner: IUI) {
  const object = paintCopy(owner), items = allItems(app)
  const lines = items.filter(item => isConnector(item) && (item.data?.sourceId === owner.id || item.data?.targetId === owner.id)).map(line => {
    const label = items.find(item => item.id === line.data?.labelId && kind(item) === 'connector-label')
    return { line, paint: paintCopy(line), label, labelPaint: label && paintCopy(label) }
  })
  const stage = (app.view as HTMLElement).closest('.canvas-stage')!
  const selector = app.editor.selector as unknown as { targetStroker?: IUI; hoverStroker?: IUI }
  const masks = [app.editor.editBox as IUI, selector.targetStroker, selector.hoverStroker].filter((item): item is IUI => Boolean(item)).map(item => {
    const render = item.__render; item.__render = () => {}; item.forceRender(); return () => { item.__render = render; if (!item.destroyed) item.forceRender() }
  })
  stage.classList.add('is-object-dragging')
  return {
    update(x: number, y: number) {
      object.copy.set({ x: Number(owner.x || 0) + x, y: Number(owner.y || 0) + y })
      lines.forEach(({ line, paint, label, labelPaint }) => {
        const data = line.data!, from = data.sourceId === owner.id ? connectorLocalPoint(app, line, endpoint(object.copy, connectorPagePoint(app, line, data.to), data.sourceAnchor)) : data.from
        const to = data.targetId === owner.id ? connectorLocalPoint(app, line, endpoint(object.copy, connectorPagePoint(app, line, data.from), data.targetAnchor)) : data.to
        const geometry = connectorGeometry(from, to, data)
        ;(paint.copy as Path).path = geometry.path
        if (label && labelPaint) {
          const offset = label.data?.offset as AnchorPoint | undefined
          const middle = connectorLocalPoint(app, label, connectorPagePoint(app, line, { x: geometry.middle.x + (offset?.x || 0), y: geometry.middle.y + (offset?.y || 0) }))
          labelPaint.copy.set({ x: middle.x - Number(label.width) / 2, y: middle.y - Number(label.height) / 2 })
        }
      })
    },
    dispose() {
      object.dispose(); lines.forEach(({ paint, labelPaint }) => { paint.dispose(); labelPaint?.dispose() })
      masks.forEach(restore => restore()); stage.classList.remove('is-object-dragging')
    },
  }
}
