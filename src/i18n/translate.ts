import { en, type MessageKey } from './en'
import { zh } from './zh'

const catalogs = { en, zh }

export type TranslateParams = Record<string, string | number | undefined>

/** Missing locale stays Chinese. Any unrecognized code uses English. */
export function resolveLocale(locale?: string): 'zh' | 'en' {
  if (locale === 'en') return 'en'
  if (!locale || locale === 'zh') return 'zh'
  return 'en'
}

function lookup(locale: 'zh' | 'en', key: string, messages?: Record<string, string>): string | undefined {
  if (messages && Object.prototype.hasOwnProperty.call(messages, key)) return messages[key]
  const catalog = catalogs[locale]
  if (Object.prototype.hasOwnProperty.call(catalog, key)) return catalog[key as MessageKey]
  return undefined
}

export function translate(locale: string | undefined, key: string, params?: TranslateParams, messages?: Record<string, string>): string {
  const resolved = resolveLocale(locale)
  let selected = key
  if (typeof params?.count === 'number') {
    const plural = `${key}.${params.count === 1 ? 'one' : 'other'}`
    if (lookup(resolved, plural, messages) != null || lookup('en', plural, messages) != null) selected = plural
  }
  const template = lookup(resolved, selected, messages) ?? lookup('en', selected, messages) ?? selected
  return template.replace(/\{(\w+)\}/g, (token, name: string) => {
    const value = params?.[name]
    return value == null ? token : String(value)
  })
}
