import { LeafList, type App, type DragEvent, type IBounds, type IUI } from 'leafer-ui'
import { EditSelect, type Editor } from '@leafer-in/editor'

function containedItems(items: IUI[], bounds: IBounds): IUI[] {
  return items.flatMap(item => {
    // Template routes use graph handles for pointer hits, but still participate
    // in marquee selection when their entire visible route is enclosed.
    const templateRoute = item.data?.kind === 'template-edge'
    if (item.skipJSON || !item.visible || !item.hittable && !templateRoute || item.locked) return []
    const box = item.getBounds('box', 'world')
    if (!bounds.hit(box)) return []
    // A partially enclosed group must not pull its other members into the
    // selection. Descend into open groups and choose only contained elements.
    // Table cells own pointer hits, so a newly drawn table has hitSelf=false.
    // Its semantic group still participates as one fully enclosed object.
    const table = item.data?.kind === 'table'
    if ((templateRoute || item.editable && (item.hitSelf || table)) && bounds.includes(box)) return [item]
    if (item.children && item.hitChildren) return containedItems(item.children, bounds)
    return []
  })
}

class ContainedEditSelect extends EditSelect {
  private pendingSelection?: IUI[]

  protected override onDragStart(event: DragEvent) {
    this.pendingSelection = undefined
    super.onDragStart(event)
  }

  private applySelection(selection: IUI[]) {
    if (selection.length !== this.editor.list.length || selection.some((item, index) => item !== this.editor.list[index])) {
      if (selection.length) this.editor.select(selection)
      else this.editor.cancel()
    }
  }

  protected override onDrag(event: DragEvent) {
    if (event.multiTouch) return
    if (this.editor.dragging) return this.onDragEnd(event)
    if (!this.dragging) return
    const total = event.getInnerTotal(this)
    this.bounds.width = total.x; this.bounds.height = total.y
    const bounds = this.bounds.clone().unsign()
    this.selectArea.setBounds(bounds.get())
    const hits = new LeafList(containedItems(this.editor.app?.tree?.children || [], bounds))
    const selection: IUI[] = []
    this.originList.forEach(item => { if (!hits.has(item)) selection.push(item as IUI) })
    hits.forEach(item => { if (!this.originList.has(item)) selection.push(item as IUI) })
    // Native multi-selection replaces per-element listeners and edit targets.
    // Keep large drags as a lightweight area preview, then apply their final
    // membership once, rather than rebuilding thousands of targets per move.
    this.pendingSelection = selection.length > 1000 ? selection : undefined
    if (!this.pendingSelection) this.applySelection(selection)
  }

  protected override onDragEnd(event: DragEvent) {
    if (event.multiTouch) return
    if (this.dragging && this.pendingSelection) this.applySelection(this.pendingSelection)
    this.pendingSelection = undefined
    super.onDragEnd(event)
  }
}

/** Keep native click/shift/drag behavior, replacing only marquee hit testing. */
export function installContainedSelection(app: App) {
  const previous = app.editor.selector
  previous.destroy()
  const selector = new ContainedEditSelect(app.editor as Editor)
  app.editor.selector = selector
  app.editor.add(selector, 1)
}
