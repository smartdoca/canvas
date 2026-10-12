import type { IUI, Text } from 'leafer-ui'
import { getStyleParamByKeyList } from '../../utils/styleLocalStorage'
import { STYPE_CONTROLL_KEYS } from './const'

export function getTextStyleParams() {
  const { fontColor, lineHeight, ...style } = getStyleParamByKeyList(STYPE_CONTROLL_KEYS)
  return { ...style, fill: fontColor as string, lineHeight: { type: 'percent' as const, value: Number(lineHeight ?? 1.5) } }
}

export function getTextLineHeight(item: IUI): number {
  const { lineHeight, fontSize } = item as Text
  if (lineHeight === undefined) return 1.5
  return typeof lineHeight === 'number' ? lineHeight / (fontSize || 12) : lineHeight.type === 'percent' ? lineHeight.value : lineHeight.value / (fontSize || 12)
}

export function normalizeTextStyle(item: Text) {
  // Older canvas text controls wrote their 0.8–3 multiplier as pixel heights.
  // Keep real pixel heights intact while repairing the native display of those texts.
  if (typeof item.lineHeight === 'number' && item.lineHeight >= 0.8 && item.lineHeight <= 3) {
    item.lineHeight = { type: 'percent', value: item.lineHeight }
  }
}
