import type { Plugins } from '../plugins'
import { AddMenu } from './AddMenu'
import { NAME, STYPE_CONTROLL_KEYS } from './const'

export const starPlugin: Plugins = { name: NAME, shortcut: 's', AddMenu, styleControlKeys: STYPE_CONTROLL_KEYS, customStyleControlRenders: [], setStyleCustom: {}, getStyleCustom: {} }
