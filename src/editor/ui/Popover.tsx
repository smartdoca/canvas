import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { IconButton } from './Controls'

export function Popover({ label, icon, children, className = '', keepMounted = false, selected = false, fitViewport = false }: { label: string; icon: ReactNode; children: ReactNode; className?: string; keepMounted?: boolean; selected?: boolean; fitViewport?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!open || !fitViewport) return
    const popup = ref.current?.querySelector<HTMLElement>('.canvas-popover-content'), anchor = ref.current?.querySelector('button')
    if (!popup || !anchor) return
    const position = () => {
      popup.style.marginLeft = '0px'; popup.style.marginTop = '0px'
      const box = popup.getBoundingClientRect(), button = anchor.getBoundingClientRect()
      const x = Math.max(8 - box.left, Math.min(0, window.innerWidth - 8 - box.right))
      let y = box.bottom > window.innerHeight - 8 ? button.top - box.height - 8 - box.top : 0
      y = Math.max(8 - box.top, y)
      popup.style.marginLeft = `${x}px`; popup.style.marginTop = `${y}px`
    }
    position()
    const observer = new ResizeObserver(position); observer.observe(popup)
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true)
    return () => { observer.disconnect(); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true) }
  }, [open, fitViewport])
  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus() } }
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
