import type { Plugins } from '../plugins'
import { AddMenu } from './AddMenu'
import { NAME, STYPE_CONTROLL_KEYS } from './const'

export const linePlugin: Plugins = { name: NAME, shortcut: 'l', AddMenu, styleControlKeys: STYPE_CONTROLL_KEYS, customStyleControlRenders: [], setStyleCustom: {}, getStyleCustom: {} }
