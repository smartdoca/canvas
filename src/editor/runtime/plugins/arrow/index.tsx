import type { Plugins } from '../plugins'
import { AddMenu } from './AddMenu'
import { NAME, STYPE_CONTROLL_KEYS } from './const'

export const arrowPlugin: Plugins = { name: NAME, shortcut: 'a', AddMenu, styleControlKeys: STYPE_CONTROLL_KEYS, customStyleControlRenders: [], setStyleCustom: {}, getStyleCustom: {} }
