import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { isOwnCanvasEvent } from '../runtime/utils/keyboardOwnership'
import { IconButton } from './Controls'

export function Popover({ label, icon, children, className = '', keepMounted = false, selected = false, fitViewport = false }: { label: string; icon: ReactNode; children: ReactNode; className?: string; keepMounted?: boolean; selected?: boolean; fitViewport?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!open || !fitViewport) return
    const popup = ref.current?.querySelector<HTMLElement>('.canvas-popover-content'), anchor = ref.current?.querySelector('button'), stage = ref.current?.closest('.canvas-stage')
    if (!popup || !anchor) return
    const position = () => {
      // Measure the final layout, not the smaller scale used by the entry
      // animation. ResizeObserver does not report that animation's final scale.
      const scale = popup.style.getPropertyValue('scale'), scalePriority = popup.style.getPropertyPriority('scale')
      popup.style.setProperty('scale', '1', 'important')
      try {
        popup.style.marginLeft = '0px'; popup.style.marginTop = '0px'
        popup.style.maxWidth = ''; popup.style.maxHeight = ''
        const stageBox = stage?.getBoundingClientRect()
        const left = Math.max(8, (stageBox?.left ?? 0) + 8), top = Math.max(8, (stageBox?.top ?? 0) + 8)
        const right = Math.min(window.innerWidth - 8, (stageBox?.right ?? window.innerWidth) - 8), bottom = Math.min(window.innerHeight - 8, (stageBox?.bottom ?? window.innerHeight) - 8)
        const button = anchor.getBoundingClientRect(), belowTop = Math.max(top, button.bottom + 8), aboveBottom = Math.min(bottom, button.top - 8)
        const below = Math.max(0, bottom - belowTop), above = Math.max(0, aboveBottom - top)
        popup.style.maxWidth = `${Math.max(0, right - left)}px`
        const naturalHeight = popup.getBoundingClientRect().height
        const useAbove = naturalHeight > below && above > below
        // Keep the trigger visible; when neither side fits, scroll the larger
        // side instead of letting the final menu extend outside its canvas.
        popup.style.maxHeight = `${Math.min(naturalHeight, useAbove ? above : below)}px`
        popup.style.overflowY = 'auto'; popup.style.overscrollBehavior = 'contain'
        const box = popup.getBoundingClientRect()
        const x = Math.max(left, Math.min(box.left, right - box.width))
        const y = useAbove ? aboveBottom - box.height : belowTop
        popup.style.marginLeft = `${x - box.left}px`; popup.style.marginTop = `${y - box.top}px`
      } finally {
        if (scale) popup.style.setProperty('scale', scale, scalePriority)
        else popup.style.removeProperty('scale')
      }
    }
    position()
    const observer = new ResizeObserver(position); observer.observe(popup); observer.observe(anchor); if (stage) observer.observe(stage)
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true)
    return () => { observer.disconnect(); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true) }
  }, [open, fitViewport])
  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && isOwnCanvasEvent(event, ref.current)) { setOpen(false); ref.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div ref={ref} className={`canvas-popover ${className}`} onKeyDown={event => {
    if (!open || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menu"] button:not(:disabled)') || [])]
    if (!buttons.length) return
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length
    buttons[next].focus()
  }}>
    <IconButton label={label} icon={icon} active={open || selected} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)} />
    {(open || keepMounted) && <div className="canvas-popover-content" hidden={!open} role="menu" aria-label={label} onClick={event => { if ((event.target as HTMLElement).closest('button:not([data-keep-open])')) setOpen(false) }}>{children}</div>}
  </div>
}
