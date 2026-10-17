import type { App, IUI } from 'leafer-ui'
import { findItem } from './findItem'

export function elementBounds(app: App, id: string, index?: Map<string, IUI>) {
  const item = index ? index.get(id) : findItem(app.tree, id)
  if (!item) return undefined
  let node: IUI | null | undefined = item
  while (node && node !== app.tree) { if (node.visible === false || node.opacity === 0) return { item, hidden: true }; node = node.parent }
  const b = item.getBounds('render', 'world')
  const bounds = { x: b.x, y: b.y, width: Math.max(1, b.width), height: Math.max(1, b.height) }
  return { item, hidden: false, bounds }
}
