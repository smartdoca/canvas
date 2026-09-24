import type { IUI } from 'leafer-ui'

/** Tree traversal does not require the optional Leafer find plugin. */
export function findItem(root: IUI | null | undefined, id: string): IUI | undefined {
  if (!root) return undefined
  if (root.id === id) return root
  if ('children' in root && Array.isArray(root.children)) {
    for (const child of root.children as IUI[]) { const found = findItem(child, id); if (found) return found }
  }
}
