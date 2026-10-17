import type { IUI } from 'leafer-ui'

/** Build once for commands that resolve many IDs, rather than walking per ID. */
export function indexItems(root: IUI): Map<string, IUI> {
  const items = new Map<string, IUI>()
  const visit = (item: IUI) => {
    if (item.skipJSON) return
    if (item.id) items.set(item.id, item)
    item.children?.forEach(visit)
  }
  visit(root)
  return items
}

/** Tree traversal does not require the optional Leafer find plugin. */
export function findItem(root: IUI | null | undefined, id: string): IUI | undefined {
  if (!root) return undefined
  if (root.id === id) return root
  if ('children' in root && Array.isArray(root.children)) {
    for (const child of root.children as IUI[]) { const found = findItem(child, id); if (found) return found }
  }
}
