import type { Plugins } from '../plugins'
import { AddMenu } from './AddMenu'
import { NAME, STYLE_CONTROL_KEYS } from './const'

export const specialShapePlugin: Plugins = { name: NAME, AddMenu, styleControlKeys: STYLE_CONTROL_KEYS, customStyleControlRenders: [], setStyleCustom: {}, getStyleCustom: {} }
