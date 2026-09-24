import type { IUI } from 'leafer-ui'
import type { Plugins, styleValue } from '../plugins'
import { AddMenu, FRAME_NAME } from './AddMenu'

export const framePlugin: Plugins = {
  name: FRAME_NAME,
  shortcut: 'f',
  AddMenu,
  styleControlKeys: ['stroke', 'fill', 'strokeWidth', 'dashPattern', 'cornerRadius', 'opacity'],
  customStyleControlRenders: [],
  setStyleCustom: {
    fill: (item: IUI, value: styleValue) => item.set({
      fill: (value === undefined ? 'rgba(0,0,0,0)' : value) as never,
      hitFill: value === undefined ? 'none' : 'path',
      hitStroke: 'path',
    }),
  },
  getStyleCustom: {
    fill: (item: IUI): styleValue => item.fill == null || item.fill === 'transparent' || item.fill === 'rgba(0,0,0,0)' ? undefined : item.fill as unknown as styleValue,
  },
}
