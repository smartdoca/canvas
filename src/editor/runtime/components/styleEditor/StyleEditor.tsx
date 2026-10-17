import { type App, type IUI } from 'leafer-ui';
import React, { useEffect, useCallback, useMemo, useLayoutEffect, useRef } from 'react';
import type { Plugins, styleControlRender, styleValue } from '../../plugins/plugins';
import { DEFAULT_STYLE_PARAMS, getStyleParamsFromLocalStorage, isStyleParamsExist, setStyleParamsToLocalStorage } from '../../utils/styleLocalStorage';
import { commonStyleRenders } from './commonStyleRenders';
import { BringForward, SendBackward, ToBottom, ToTop } from '@icon-park/react';
import { IconButton } from '../../../ui/Controls';
import type { CanvasElementExtension } from '../../../../sdk/types';
import { useCanvasI18n } from '../../../../i18n/context';
import type { MessageKey } from '../../../../i18n/en';
import { QuickStyle } from './QuickStyle';

interface StyleEditorProps {
  app: App;
  plugins: Plugins[];
  activeKey: string;
  editorList: IUI[];
  onLayerChange: (mode: 'top' | 'up' | 'down' | 'bottom') => void;
  elementExtensions?: CanvasElementExtension[];
  extensionValues?: Record<string, Record<string, unknown>>;
  onExtensionValueChange?: (type: string, key: string, value: unknown) => void;
}

const StyleEditor: React.FC<StyleEditorProps> = (props: StyleEditorProps) => {
  const { plugins, activeKey, editorList, onLayerChange, elementExtensions = [], extensionValues = {}, onExtensionValueChange } = props;
  const t = useCanvasI18n()

  const [styleParam, setStyleParam] = React.useState<{ [key: string]: styleValue }>(getStyleParamsFromLocalStorage)
  const [isScrollable, setIsScrollable] = React.useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const panel = panelRef.current
    const container = panel?.parentElement
    if (!panel || !container) return
    const update = () => setIsScrollable(panel.scrollHeight > container.clientHeight + 1)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(panel)
    observer.observe(container)
    return () => observer.disconnect()
  }, [activeKey, editorList.length, styleParam])

  // 将插件列表转换为以插件名称为键的对象，方便后续使用
  const pluginMap: { [key: string]: Plugins } = useMemo(() => {
    const map: { [key: string]: Plugins } = {}
    plugins.forEach(plugin => {
      map[plugin.name] = plugin
    })
    if (map.rect) {
      for (const name of ['mind-node', 'table-cell']) map[name] = { ...map.rect, name }
      map['diagram-node'] = {
        ...map.rect, name: 'diagram-node',
        getStyleCustom: Object.fromEntries(['fill', 'stroke', 'strokeWidth', 'cornerRadius', 'dashPattern'].map(key => [key, (item: IUI) => (item.children?.[0] as unknown as Record<string, styleValue>)?.[key]])),
        setStyleCustom: Object.fromEntries(['fill', 'stroke', 'strokeWidth', 'cornerRadius', 'dashPattern'].map(key => [key, (item: IUI, value: styleValue) => item.children?.[0]?.set({ [key]: value ?? null })])),
      }
      map.connector = { ...map.rect, name: 'connector', styleControlKeys: ['stroke', 'strokeWidth', 'dashPattern', 'opacity'] }
      map['board-table'] = {
        ...map.rect, name: 'board-table', styleControlKeys: ['fill', 'stroke', 'strokeWidth', 'opacity'],
        getStyleCustom: Object.fromEntries(['fill', 'stroke', 'strokeWidth'].map(key => [key, (item: IUI) => (item.children?.[0] as unknown as Record<string, styleValue>)?.[key]])),
        setStyleCustom: Object.fromEntries(['fill', 'stroke', 'strokeWidth'].map(key => [key, (item: IUI, value: styleValue) => item.children?.forEach(child => child.set({ [key]: value ?? null }))])),
      }
    }
    return map
  }, [plugins])

  const initStyleParams = () => {
    if (isStyleParamsExist()) {
      const localStyleParams = getStyleParamsFromLocalStorage()
      setStyleParam(localStyleParams)
    } else {
      const initStyleParams = { ...DEFAULT_STYLE_PARAMS }
      setStyleParam(initStyleParams)
      setStyleParamsToLocalStorage(initStyleParams)
    }
  }

  const updateStyleParamsFromEditor = useCallback(() => {
    const editorStyleParams: { [key: string]: styleValue } = {}

    // 需要实现一个功能，如果选中了多个元素，如果这些元素的key值都一样，就显示这个值，如果不一样，就显示空
    const hasKey: { [key: string]: boolean } = {}
    const undefinedKeyMap: { [key: string]: 'nothing-nothing' } = {}
    editorList.forEach(editorItem => {
      // 如果当前编辑器项没有 name 属性，或者插件列表中没有对应的插件，则跳过该项
      if (!editorItem.name || !pluginMap[editorItem.name]) {
        return
      }

      const plugin = pluginMap[editorItem.name]
      // 遍历插件的 styleControlKeys，获取对应的样式参数值，并更新到 styleParam 中
      plugin.styleControlKeys.forEach(key => {
        const styleMap = editorItem as unknown as Record<string, styleValue>
        let value = styleMap[key]
        if (plugin.getStyleCustom[key]) { // 如果有特殊处理的样式，则用特殊样式
          value = plugin.getStyleCustom[key](editorItem)
        }

        if (hasKey[key] && editorStyleParams[key] !== value) {
          undefinedKeyMap[key] = 'nothing-nothing'
        }

        if (value !== undefined) {
          editorStyleParams[key] = value
        }

        hasKey[key] = true
      })
    })

    elementExtensions.forEach(extension => {
      const items = editorList.filter(item => item.name === extension.type)
      if (!items.length) return
      extension.properties?.forEach(property => {
        const values = items.map(item => {
          const json = item.toJSON() as Record<string, unknown>
          return property.getValue ? property.getValue(json) : json[property.key]
        })
        editorStyleParams[property.key] = values.every(value => Object.is(value, values[0])) ? values[0] as styleValue : 'nothing-nothing'
      })
    })

    setStyleParam({ ...editorStyleParams, ...undefinedKeyMap }) // 只更新状态里边的值，不能更新 localStorage 里的值
  }, [editorList, elementExtensions, pluginMap])

  // 根据根据传入的数据更新样式参数
  useEffect(() => {
    if (activeKey !== 'init') {
      return
    }

    if (editorList.length === 0) {
      // 使用setTimeout避免在effect中直接调用setState
      setTimeout(() => initStyleParams(), 0)
    }

    if (editorList.length > 0) {
      updateStyleParamsFromEditor()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, editorList])

  useEffect(() => {
    if (activeKey !== 'init') setStyleParam(getStyleParamsFromLocalStorage())
  }, [activeKey])

  // 通过UI更新样式
  const updateStyleParam = (key: string, value: styleValue) => {
    const activeExtension = elementExtensions.find(extension => extension.type === activeKey || editorList.some(item => item.name === extension.type && extension.properties?.some(property => property.key === key)))
    const extensionProperty = activeExtension?.properties?.find(property => property.key === key)
    if (activeExtension && extensionProperty) {
      if (editorList.length) editorList.filter(item => item.name === activeExtension.type).forEach(item => {
        const json = item.toJSON() as Record<string, unknown>
        const patch = extensionProperty.setValue ? extensionProperty.setValue(json, value) : { [key]: value }
        item.set(patch as never)
      })
      else onExtensionValueChange?.(activeExtension.type, key, value)
      setStyleParam(previous => ({ ...previous, [key]: value }))
      props.app.editor.select([...editorList])
      return
    }


    // 实时更新选中元素的样式参数
    editorList.forEach(editorItem => {
      if (!editorItem.name || !pluginMap[editorItem.name]) {
        return
      }
      const plugin = pluginMap[editorItem.name]
      if (plugin.styleControlKeys.includes(key)) {
        if (plugin.setStyleCustom[key]) { // 如果有特殊处理的逻辑，就用特殊处理的逻辑
          plugin.setStyleCustom[key](editorItem, value)
        } else {
          // Leafer treats `undefined` as "do not update" for paint attributes.
          // Use null to explicitly clear a fill/stroke while still persisting
          // undefined as the default for subsequently created elements.
          editorItem.set({ [key]: value === undefined && (key === 'fill' || key === 'stroke') ? null : value })
        }
      }
    })

    // 更新状态和 localStorage 中的样式参数
    setStyleParam(prev => ({ ...prev, [key]: value }))

    const localMap = getStyleParamsFromLocalStorage()
    setStyleParamsToLocalStorage({ ...localMap, [key]: value })
  }

  const getStyleControlUI = (styleControlConfig: styleControlRender): JSX.Element => {
    const Control = styleControlConfig.render
    return (
      <div key={styleControlConfig.key} className="style-control">
        <div className="style-label">{t(styleControlConfig.title as MessageKey)}</div>
        <Control value={styleParam[styleControlConfig.key]} onChange={(value) => updateStyleParam(styleControlConfig.key, value)} />
      </div>
    )
  }

  // 获取所有应该渲染的样式
  const getAllStyleControls = () => {
    const styleControls: { render: JSX.Element, order: number }[] = []

    if (editorList.length > 0) {
      const allStyleControlKeys: string[] = []
      editorList.forEach(editorItem => {
        if (!editorItem.name || !pluginMap[editorItem.name]) {
          return
        }
        const plugin = pluginMap[editorItem.name]
        plugin.styleControlKeys.forEach(key => {
          if (!allStyleControlKeys.includes(key)) {
            allStyleControlKeys.push(key)

            // 处理样式控制项的渲染，先从公共样式里边查找，如果没有找到，再从插件的 customStyleControlRenders 里边查找
            commonStyleRenders.forEach(item => {
              if (item.key === key) {
                styleControls.push({ render: getStyleControlUI(item), order: item.order })
              }
            })

            plugin.customStyleControlRenders.forEach(item => {
              if (item.key === key) {
                styleControls.push({ render: getStyleControlUI(item), order: item.order })
              }
            })
          }
        })
      })

      elementExtensions.filter(extension => editorList.some(item => item.name === extension.type)).forEach(extension => {
        extension.properties?.forEach(property => styleControls.push({ order: property.order ?? 50, render: <div key={`${extension.type}-${property.key}`} className="style-control"><div className="style-label">{property.label}</div><property.control value={styleParam[property.key]} selection={editorList.map(item => item.toJSON() as Record<string, unknown>)} onChange={value => updateStyleParam(property.key, value as styleValue)} /></div> }))
      })
    } else {
      const toolKey = activeKey === 'init' || activeKey === 'hand' ? 'rect' : activeKey
      const plugin = pluginMap[toolKey]
      if (plugin) {
        plugin.styleControlKeys.forEach(key => {
          commonStyleRenders.forEach(item => {
            if (item.key === key) {
              styleControls.push({ render: getStyleControlUI(item), order: item.order })
            }
          })

          plugin.customStyleControlRenders.forEach(item => {
            if (item.key === key) {
              styleControls.push({ render: getStyleControlUI(item), order: item.order })
            }
          })
        })

      }
      const extension = elementExtensions.find(item => item.type === activeKey)
      extension?.properties?.forEach(property => styleControls.push({ order: property.order ?? 50, render: <div key={`${extension.type}-${property.key}`} className="style-control"><div className="style-label">{property.label}</div><property.control value={extensionValues[extension.type]?.[property.key] ?? property.defaultValue} selection={[]} onChange={value => updateStyleParam(property.key, value as styleValue)} /></div> }))
    }

    return styleControls.sort((a, b) => a.order - b.order).map(control => control.render)
  }

  const isText = activeKey === 'text' || editorList.length > 0 && editorList.every(item => item.tag === 'Text')
  const hasFill = !isText && !['path', 'line', 'arrow'].includes(activeKey) && !editorList.some(item => ['path', 'line', 'arrow', 'image'].includes(item.name || ''))

  return (
    <div ref={panelRef} className={`floating-panel style-panel ${isScrollable ? 'is-scrollable' : ''}`}>
      <QuickStyle values={styleParam} onChange={updateStyleParam} hasFill={hasFill} isText={isText} />
      <details className="advanced-style" open>
        <summary>{t('style.more')}</summary>
        <div className="advanced-style-content">
      {getAllStyleControls()}
      {editorList.length > 0 && <div className="style-control layer-order-section">
        <div className="style-label">{t('style.layerOrder')}</div>
        <div className="layer-order-controls">
          <IconButton label={t('style.layerTop')} icon={<ToTop />} onClick={() => onLayerChange('top')} />
          <IconButton label={t('style.layerUp')} icon={<BringForward />} onClick={() => onLayerChange('up')} />
          <IconButton label={t('style.layerDown')} icon={<SendBackward />} onClick={() => onLayerChange('down')} />
          <IconButton label={t('style.layerBottom')} icon={<ToBottom />} onClick={() => onLayerChange('bottom')} />
        </div>
      </div>}
        </div>
      </details>
    </div>
  )
}

export default StyleEditor;
