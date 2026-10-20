const leases = new WeakMap<HTMLElement, { count: number; value: string; priority: string }>()
const property = 'overscroll-behavior-x'

function holdBoundary(element: HTMLElement) {
  const existing = leases.get(element)
  if (existing) existing.count++
  else { leases.set(element, { count: 1, value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) }); element.style.setProperty(property, 'none') }
  return () => {
    const lease = leases.get(element)
    if (!lease || --lease.count) return
    leases.delete(element)
    if (element.style.getPropertyValue(property) === 'none' && !element.style.getPropertyPriority(property)) {
      if (lease.value) element.style.setProperty(property, lease.value, lease.priority)
      else element.style.removeProperty(property)
    }
  }
}

/** Cover the first trackpad packet and the root scroll chain while the pointer is in this canvas. */
export function installCanvasWheelBoundary(root: HTMLElement, canvas?: HTMLElement) {
  let inside = root.matches(':hover'), release: (() => void) | undefined, timer: number | undefined
  const activate = () => {
    if (release) return
    const restores: (() => void)[] = []
    for (let element: HTMLElement | null = root; element; element = element.parentElement) restores.push(holdBoundary(element))
    release = () => restores.reverse().forEach(restore => restore())
  }
  const clear = () => { window.clearTimeout(timer); release?.(); release = undefined }
  const enter = () => { inside = true; window.clearTimeout(timer); activate() }
  const leave = () => { inside = false; window.clearTimeout(timer); timer = window.setTimeout(clear, 200) }
  const wheel = (event: WheelEvent) => {
    activate()
    if (!inside) leave()
    const target = event.target as Element, horizontal = event.deltaX !== 0 || event.shiftKey
    // Connection ports and table/object handles sit above Leafer's canvas.
    // Route their wheel packets through the same native interaction surface.
    if (canvas && target.closest('.graph-handle,.node-quick-create,.rich-object-move-handle,.table-axis-layer,.native-rich-resource,.native-task-checkbox,.rich-native-link')) {
      event.preventDefault(); event.stopPropagation()
      canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true,
        clientX: event.clientX, clientY: event.clientY, deltaX: event.deltaX, deltaY: event.deltaY, deltaMode: event.deltaMode,
        ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey }))
      return
    }
    const editing = target.closest('[contenteditable],input,textarea')
    if (horizontal || event.deltaX === 0 && event.deltaY === 0) event.preventDefault()
    else if (editing && !event.ctrlKey && !event.metaKey) {
      // The editable's native vertical scrolling must not also pan Leafer.
      event.stopPropagation()
    } else if (target.closest('.canvas-host')) event.preventDefault()
  }
  root.addEventListener('pointerenter', enter); root.addEventListener('pointerleave', leave)
  root.addEventListener('wheel', wheel, { capture: true, passive: false })
  window.addEventListener('blur', clear)
  if (inside) activate()
  return () => { clear(); root.removeEventListener('pointerenter', enter); root.removeEventListener('pointerleave', leave); root.removeEventListener('wheel', wheel, true); window.removeEventListener('blur', clear) }
}
