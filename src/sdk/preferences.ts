import type { CanvasCreationPreferences, CanvasViewPreferences } from './types'
import { notePresets } from '../editor/core/notePresets'

const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v))
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k))
const color = (v: unknown) => typeof v === 'string' && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(v)
const optional = (v: Record<string, unknown>, key: string, check: (value: unknown) => boolean) => !(key in v) || check(v[key])
const choice = (values: string[]) => (v: unknown) => typeof v === 'string' && values.includes(v)
export function isCanvasViewPreferences(v: unknown): v is CanvasViewPreferences {
  return object(v) && keys(v, ['version', 'gridVisible', 'gridPattern', 'backgroundColor', 'minimapVisible', 'outlineVisible']) && v.version === 1 && typeof v.gridVisible === 'boolean' && choice(['dots', 'lines'])(v.gridPattern) && (v.backgroundColor === null || color(v.backgroundColor)) && typeof v.minimapVisible === 'boolean' && typeof v.outlineVisible === 'boolean'
}
export function isCanvasCreationPreferences(v: unknown): v is CanvasCreationPreferences {
  if (!object(v) || !keys(v, ['version', 'connector', 'note']) || v.version !== 1) return false
  if (v.connector !== undefined) {
    const c = v.connector
    if (!object(c) || !keys(c, ['mode', 'stroke', 'strokeWidth', 'lineDash', 'startHead', 'endHead']) || !optional(c, 'mode', choice(['straight', 'elbow', 'curve'])) || !optional(c, 'stroke', color) || !optional(c, 'strokeWidth', n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 64) || !optional(c, 'lineDash', choice(['solid', 'dashed', 'dotted'])) || !['startHead', 'endHead'].every(k => optional(c, k, choice(['none', 'arrow', 'triangle', 'circle'])))) return false
  }
  if (v.note !== undefined) {
    const n = v.note
    if (!object(n) || !keys(n, ['preset', 'fill', 'fontSize', 'fontColor', 'textAlign', 'verticalAlign']) || !optional(n, 'preset', choice(notePresets.map(p => p.id))) || !optional(n, 'fill', color) || !optional(n, 'fontColor', color) || !optional(n, 'fontSize', n => typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 256) || !optional(n, 'textAlign', choice(['left', 'center', 'right', 'justify'])) || !optional(n, 'verticalAlign', choice(['top', 'middle', 'bottom']))) return false
  }
  return true
}
