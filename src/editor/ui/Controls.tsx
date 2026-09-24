import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  icon: ReactNode
  active?: boolean
  danger?: boolean
}

export function IconButton({ label, icon, active, danger, className = '', ...props }: IconButtonProps) {
  return <button data-tooltip={label} title={label} aria-label={label} className={`icon-button ${active ? 'is-active' : ''} ${danger ? 'is-danger' : ''} ${className}`} {...props}>{icon}</button>
}

export function CircleToolIcon() {
  return <svg className="circle-tool-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /></svg>
}

export function ActionButton({ children, className = '', ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return <button className={`action-button ${className}`} {...props}>{children}</button>
}

export function Panel({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <section className={`floating-panel ${className}`}>{children}</section>
}
