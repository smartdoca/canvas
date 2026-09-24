import { DragEvent, type App, type IUI } from 'leafer-ui'
import { useEffect } from 'react'
import { Puzzle } from '@icon-park/react'
import type { CanvasElementExtension } from '../../../../sdk/types'
import { IconButton } from '../../../ui/Controls'

interface Props {
  app: App
  extension: CanvasElementExtension
  properties: Record<string, unknown>
  activeKey: string
  onClick: (key: string) => void
  onCreateComplete: () => void
}

export function ExtensionTool({ app, extension, properties, activeKey, onClick, onCreateComplete }: Props) {
  const active = activeKey === extension.type
  useEffect(() => {
    if (!active) return
    app.mode = 'draw'
    let item: IUI | undefined
    const events = [
      app.on_(DragEvent.START, (event: DragEvent) => {
        const point = event.getPagePoint()
        app.tree.add(extension.create({ bounds: { x: point.x, y: point.y, width: 1, height: 1 }, properties }) as never)
        item = app.tree.children[app.tree.children.length - 1]
        item.name = extension.type
        item.editable = true
      }),
      app.on_(DragEvent.DRAG, (event: DragEvent) => item?.set(event.getPageBounds())),
      app.on_(DragEvent.END, () => {
        if (item) app.editor.select(item)
        onCreateComplete()
        app.off_(events)
      }),
    ]
    return () => app.off_(events)
  }, [active, app, extension, onCreateComplete, properties])

  return <IconButton
    label={`${extension.label}${extension.shortcut ? ` (${extension.shortcut.toUpperCase()})` : ''}`}
    icon={extension.icon || <Puzzle />}
    active={active}
    onClick={() => onClick(extension.type)}
  />
}
