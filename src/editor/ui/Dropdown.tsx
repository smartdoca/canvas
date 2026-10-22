import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { isOwnCanvasEvent, ownsCanvasCommands } from '../runtime/utils/keyboardOwnership'

export interface DropdownOption<T> { value: T; label: string }

/** Keeps toolbar choices in the document UI, including text-range formatting. */
export function Dropdown<T extends string | number>({ label, value, options, onChange, placeholder = '—', wide = false }: {
  label: string; value: T; options: DropdownOption<T>[]; onChange: (value: T) => void; placeholder?: string; wide?: boolean
}) {
  const [open, setOpen] = useState(false), [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null), popup = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), id = useId()
  const search = useRef({ text: '', at: 0 })
  const selected = options.findIndex(option => option.value === value)
  const show = useCallback((index = Math.max(0, selected)) => { setActive(index); setOpen(true) }, [selected])
  const choose = useCallback((index: number) => { const option = options[index]; if (option) { setOpen(false); onChange(option.value) } }, [options, onChange])
  const handleKeys = useCallback((event: KeyboardEvent | ReactKeyboardEvent<HTMLDivElement>) => {
    const native = 'nativeEvent' in event ? event.nativeEvent : event
    if (event.defaultPrevented || native.isComposing || native.keyCode === 229) return
    if (event.key === 'Tab') { setOpen(false); return }
    if (event.key === 'Escape') { if (open) { event.preventDefault(); event.stopPropagation(); setOpen(false) } return }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation()
      if (!options.length) return
      if (!open) show(event.key === 'ArrowUp' || event.key === 'End' ? options.length - 1 : event.key === 'Home' ? 0 : Math.max(0, selected))
      else setActive(index => event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length)
    } else if (open && ['Enter', ' '].includes(event.key)) {
      event.preventDefault(); event.stopPropagation(); choose(active)
    } else if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.length === 1 && event.key !== ' ') {
      if (open) { event.preventDefault(); event.stopPropagation() }
      const at = Date.now(), text = (at - search.current.at < 700 ? search.current.text : '') + event.key.toLowerCase()
      search.current = { text, at }
      const index = options.findIndex(option => option.label.toLowerCase().startsWith(text))
      if (index >= 0) { event.preventDefault(); event.stopPropagation(); show(index) }
    }
  }, [open, options, selected, active, show, choose])
  useLayoutEffect(() => {
    if (!open || !popup.current || !trigger.current) return
    const menu = popup.current, button = trigger.current
    const position = () => {
      menu.style.marginLeft = '0px'; menu.style.marginTop = '0px'
      const box = menu.getBoundingClientRect(), anchor = button.getBoundingClientRect()
      menu.style.marginLeft = `${Math.max(8 - box.left, Math.min(0, window.innerWidth - 8 - box.right))}px`
      const above = box.bottom > window.innerHeight - 8 ? anchor.top - 6 - box.height - box.top : 0
      menu.style.marginTop = `${Math.max(8 - box.top, above)}px`
    }
    position()
    const observer = new ResizeObserver(position); observer.observe(menu)
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true)
    return () => { observer.disconnect(); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true) }
  }, [open])
  useLayoutEffect(() => { if (open) popup.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }) }, [open, active])
  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    // Mouse opening keeps a live editor's range and pending text transaction.
    const key = (event: KeyboardEvent) => {
      if (ref.current?.contains(event.target as Node) || !isOwnCanvasEvent(event, ref.current)) return
      // A mouse-opened format menu may retain this canvas text editor's range.
      const target = event.target as HTMLElement
      const ownsText = target.isContentEditable && target.closest('.canvas-plain-text-editor,[data-slate-editor]') &&
        !target.closest('button,input,textarea,select,[contenteditable="false"]')
      if (ownsCanvasCommands(event, ref.current) || ownsText) handleKeys(event)
    }
    document.addEventListener('pointerdown', dismiss, true)
    document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('pointerdown', dismiss, true); document.removeEventListener('keydown', key, true) }
  }, [open, handleKeys])
  return <div ref={ref} className={`canvas-dropdown${wide ? ' is-wide' : ''}`} onPointerDown={event => event.preventDefault()} onKeyDown={handleKeys}>
    <button ref={trigger} type="button" className="dropdown-trigger" role="combobox" aria-label={label} title={label} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? id : undefined} aria-activedescendant={open ? `${id}-${active}` : undefined} onClick={() => open ? setOpen(false) : show()}>
      <span>{selected >= 0 ? options[selected].label : value === '' ? placeholder : String(value)}</span><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    {open && <div ref={popup} id={id} role="listbox" aria-label={label} className="dropdown-menu">{options.map((option, index) => <button type="button" key={option.value} id={`${id}-${index}`} role="option" aria-selected={index === selected} tabIndex={-1} data-active={active === index} className="dropdown-option" onPointerEnter={() => setActive(index)} onClick={() => choose(index)}>
      <span>{option.label}</span><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" style={{ visibility: index === selected ? 'visible' : 'hidden' }}><path d="m3 8 3 3 7-7" /></svg>
    </button>)}</div>}
  </div>
}
