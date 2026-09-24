import type { Plugins } from '../plugins'
import { AddMenu } from './AddMenu'

export const eraserPlugin: Plugins = { name: 'eraser', shortcut: 'e', AddMenu, styleControlKeys: [], customStyleControlRenders: [], setStyleCustom: {}, getStyleCustom: {} }
