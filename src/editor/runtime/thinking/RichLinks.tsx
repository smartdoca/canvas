import { useEffect, useRef, useState } from 'react'
import type { App, Text } from 'leafer-ui'
import { useCanvasI18n } from '../../../i18n/context'
import { allItems } from './scene'
import { getRichExtensions } from './slateRuntime'
import type { CanvasRichTextElement } from '../../../sdk/types'
import { richLayout, safeLink } from './richText'

/** Native text remains canvas-rendered; link navigation is a view-only overlay. */
export function RichLinks({ app }: { app: App }) {
  const t = useCanvasI18n(), root = useRef<HTMLDivElement>(null)
  const [link, setLink] = useState<{ url?: string; inline?: CanvasRichTextElement; x: number; y: number }>()
  useEffect(() => {
    const stage = (app.view as HTMLElement).closest<HTMLElement>('.canvas-stage')!
    const hit = (event: PointerEvent) => {
      if (app.editor.innerEditing || !(event.target instanceof HTMLElement) || !event.target.closest('.canvas-view')) return
      for (const text of allItems(app).filter(item => item.tag === 'Text' && item.visible !== false).reverse() as Text[]) {
        const layout = richLayout(text)
        if (!layout?.glyphs.some(g => g.url || g.inline)) continue
        const p = text.getInnerPoint(app.tree.getWorldPointByClient(event))
        if (p.x < 0 || p.y < 0 || p.x > Number(text.width) || p.y > Number(text.height)) continue
        const glyph = layout.glyphs.find(g => (g.url || g.inline) && p.x >= g.x && p.x <= g.x + g.width && p.y >= g.y - g.size && p.y <= g.y + g.size * .3)
        if (glyph?.url || glyph?.inline) return { text, glyph, url: glyph.url, inline: glyph.inline }
      }
    }
    const move = (event: PointerEvent) => {
      if (root.current?.contains(event.target as globalThis.Node)) return
      const found = hit(event)
      if (!found) { setLink(undefined); return }
      // Overlap the glyph's hit envelope so moving slowly into the link card
      // cannot cross a dead strip that dismisses the card before it is reached.
      const point = app.tree.getClientPointByWorld(found.text.getWorldPoint({ x: found.glyph.x, y: found.glyph.y + found.glyph.size * .2 })), bounds = stage.getBoundingClientRect()
      setLink({ url: found.url, inline: found.inline, x: Math.max(8, Math.min(bounds.width - 270, point.x - bounds.left)), y: Math.min(bounds.height - 40, point.y - bounds.top) })
    }
    const down = (event: PointerEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      const found = hit(event)
      if (found?.url && safeLink(found.url)) { event.preventDefault(); event.stopImmediatePropagation(); window.open(found.url, '_blank', 'noopener,noreferrer') }
    }
    const leave = () => setLink(undefined)
    stage.addEventListener('pointermove', move); stage.addEventListener('pointerdown', down, true); stage.addEventListener('pointerleave', leave)
    return () => { stage.removeEventListener('pointermove', move); stage.removeEventListener('pointerdown', down, true); stage.removeEventListener('pointerleave', leave) }
  }, [app])
  const extension = link?.inline && getRichExtensions(app).find(e => e.inline && e.type === link.inline!.type)
  return link && <div ref={root} className="rich-native-link" style={{ left: link.x, top: link.y }}>{link.inline ? extension ? extension.render({ element: link.inline, selected: false, onChange: () => {} }) : link.inline.label : <a href={safeLink(link.url)} target="_blank" rel="noopener noreferrer" title={link.url} aria-label={`${t('rich.openLink')}: ${link.url}`}>↗ {link.url}</a>}</div>
}
