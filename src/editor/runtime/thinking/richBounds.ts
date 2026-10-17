import type { IUI } from 'leafer-ui'

const bounded = new Set(['note', 'card', 'table-cell'])
const scrolls = new WeakMap<IUI, number>()
export function richContainer(item?: IUI | null): IUI | undefined {
  for (let node = item; node; node = node.parent as IUI | undefined) if (bounded.has(String(node.data?.kind || node.name))) return node
}
export const richScroll = (text: IUI) => scrolls.get(text) || 0
export function setRichScroll(text: IUI, offset: number) { if (richScroll(text) === Math.max(0, offset)) return
 scrolls.set(text, Math.max(0, offset)); text.forceUpdate('fontSize') }
