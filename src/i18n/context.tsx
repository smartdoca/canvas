/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { MessageKey } from './en'
import { translate, type TranslateParams } from './translate'

export type Translator = (key: MessageKey, params?: TranslateParams) => string

const CanvasI18nContext = createContext<Translator>((key, params) => translate(undefined, key, params))

export function CanvasI18nProvider({ locale, messages, children }: { locale?: string; messages?: Record<string, string>; children: ReactNode }) {
  const t = useMemo<Translator>(() => (key, params) => translate(locale, key, params, messages), [locale, messages])
  return <CanvasI18nContext.Provider value={t}>{children}</CanvasI18nContext.Provider>
}

export function useCanvasI18n() {
  return useContext(CanvasI18nContext)
}
