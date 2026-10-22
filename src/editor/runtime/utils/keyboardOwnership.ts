/** Current DOM ownership, independent of a retained canvas selection. */
export function isOwnCanvasEvent(event: Event, owner: Element | null | undefined): boolean {
  const root = owner?.closest('.canvas-app'), target = event.target
  return !event.defaultPrevented && Boolean(root) && target instanceof HTMLElement && target.closest('.canvas-app') === root
}

export function ownsCanvasCommands(event: Event, owner: Element | null | undefined): boolean {
  const target = event.target
  return isOwnCanvasEvent(event, owner) && target instanceof HTMLElement && !target.isContentEditable &&
    !target.closest('button,input,textarea,select,a[href],summary,[role="button"],[role="textbox"],[role="combobox"],[role="listbox"],[role="option"],[role="spinbutton"],[role="slider"],[role="checkbox"],[role="menu"],[role="dialog"]')
}
