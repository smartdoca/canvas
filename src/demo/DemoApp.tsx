import { useEffect } from 'react'
import CanvasEditor from '../editor/runtime/CanvasEditor'
import type { CanvasElementExtension } from '../sdk/types'

const badgeExtension: CanvasElementExtension = {
  type: 'demo-badge',
  label: '自定义卡片',
  icon: <span style={{ fontSize: 11, fontWeight: 700 }}>卡</span>,
  shortcut: 'b',
  properties: [{
    key: 'fill',
    label: '卡片颜色',
    defaultValue: '#6257e8',
    control: ({ value, onChange }) => <input aria-label="卡片颜色" type="color" value={String(value || '#6257e8')} onChange={event => onChange(event.target.value)} />,
  }],
  create: ({ bounds, properties }) => ({
    tag: 'Frame', name: 'demo-badge', editable: true, resizeChildren: true,
    ...bounds, fill: String(properties.fill || '#6257e8'), cornerRadius: 16,
    children: [{ tag: 'Text', text: '自定义元素', x: 12, y: 10, fill: '#ffffff', fontSize: 14 }],
  }),
}

export function DemoApp() {
  const locale = new URLSearchParams(window.location.search).get('locale') || undefined
  useEffect(() => {
    document.documentElement.lang = !locale || locale === 'zh' ? 'zh-CN' : 'en'
  }, [locale])
  return <CanvasEditor locale={locale} elementExtensions={[badgeExtension]} />
}
