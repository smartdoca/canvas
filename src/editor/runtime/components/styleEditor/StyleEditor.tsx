import { type App, type IUI } from 'leafer-ui';
import React, { useEffect, useCallback, useMemo, useLayoutEffect, useRef } from 'react';
import type { Plugins, styleControlRender, styleValue } from '../../plugins/plugins';
import { DEFAULT_STYLE_PARAMS, getStyleParamsFromLocalStorage, isStyleParamsExist, setStyleParamsToLocalStorage } from '../../utils/styleLocalStorage';
import { commonStyleRenders } from './commonStyleRenders';
import { BringForward, SendBackward, ToBottom, ToTop } from '@icon-park/react';
import { IconButton } from '../../../ui/Controls';
import { ROUGH_FILL_STYLE_KEY, ROUGH_STROKE_STYLE_KEY, ROUGH_STYLE_KEY, setRoughStyle, supportsRoughStyle, supportsRoughStyleName, updateRoughFill, updateRoughGeometry, updateRoughOption } from '../../utils/roughStyle';
import type { CanvasElementExtension } from '../../../../sdk/types';

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

  const [styleParam, setStyleParam] = React.useState<{ [key: string]: styleValue }>({})
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
        if (key === 'fill' && editorItem.data?.roughMode) value = editorItem.data.roughOriginalFill as styleValue
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

    const roughItems = editorList.filter(supportsRoughStyle)
    if (roughItems.length) {
      const roughValues = roughItems.map((item) => Boolean(item.data?.roughMode))
      editorStyleParams[ROUGH_STYLE_KEY] = roughValues.every((value) => value === roughValues[0]) ? roughValues[0] : 'nothing-nothing'
      if (roughValues.every(Boolean)) {
        const fillStyles = roughItems.map((item) => item.data?.roughFillStyle || 'hachure')
        const strokeStyles = roughItems.map((item) => item.data?.roughStrokeStyle ?? 1)
        editorStyleParams[ROUGH_FILL_STYLE_KEY] = fillStyles.every((value) => value === fillStyles[0]) ? fillStyles[0] as styleValue : 'nothing-nothing'
        editorStyleParams[ROUGH_STROKE_STYLE_KEY] = strokeStyles.every((value) => value === strokeStyles[0]) ? strokeStyles[0] as styleValue : 'nothing-nothing'
      }
    }
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
    if (key === ROUGH_STYLE_KEY) {
      editorList.forEach((item) => setRoughStyle(item, Boolean(value)))
      setStyleParam(prev => ({ ...prev, [key]: value }))
      const localMap = getStyleParamsFromLocalStorage()
      setStyleParamsToLocalStorage({ ...localMap, [key]: value })
      props.app.editor.select([...editorList])
      return
    }
    if (key === ROUGH_FILL_STYLE_KEY || key === ROUGH_STROKE_STYLE_KEY) {
      editorList.forEach((item) => updateRoughOption(item, key, value))
      setStyleParam(prev => ({ ...prev, [key]: value }))
      const localMap = getStyleParamsFromLocalStorage()
      setStyleParamsToLocalStorage({ ...localMap, [key]: value })
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
        if (key === 'fill' && updateRoughFill(editorItem, value)) return
        if (plugin.setStyleCustom[key]) { // 如果有特殊处理的逻辑，就用特殊处理的逻辑
          plugin.setStyleCustom[key](editorItem, value)
        } else {
          // Leafer treats `undefined` as "do not update" for paint attributes.
          // Use null to explicitly clear a fill/stroke while still persisting
          // undefined as the default for subsequently created elements.
          editorItem.set({ [key]: value === undefined && (key === 'fill' || key === 'stroke') ? null : value })
        }
        if (key === 'sides' || key === 'corners' || key === 'cornerRadius') updateRoughGeometry(editorItem)
      }
    })

    // 更新状态和 localStorage 中的样式参数
    setStyleParam(prev => ({ ...prev, [key]: value }))

    const localMap = getStyleParamsFromLocalStorage()
    setStyleParamsToLocalStorage({ ...localMap, [key]: value })
  }

  const getStyleControlUI = (styleControlConfig: styleControlRender): JSX.Element => {
    return (
      <div key={styleControlConfig.key} className="style-control">
        <div className="style-label">{styleControlConfig.title}</div>
        {styleControlConfig.render({
          value: styleParam[styleControlConfig.key],
          onChange: (value) => updateStyleParam(styleControlConfig.key, value)
        })}
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
      if (editorList.some(supportsRoughStyle)) {
        const roughControl = commonStyleRenders.find((item) => item.key === ROUGH_STYLE_KEY)
        if (roughControl) styleControls.push({ render: getStyleControlUI(roughControl), order: roughControl.order })
        if (styleParam[ROUGH_STYLE_KEY] === true) {
          commonStyleRenders.filter((item) => item.key === ROUGH_FILL_STYLE_KEY || item.key === ROUGH_STROKE_STYLE_KEY).forEach((item) => styleControls.push({ render: getStyleControlUI(item), order: item.order }))
        }
      }
      elementExtensions.filter(extension => editorList.some(item => item.name === extension.type)).forEach(extension => {
        extension.properties?.forEach(property => styleControls.push({ order: property.order ?? 50, render: <div key={`${extension.type}-${property.key}`} className="style-control"><div className="style-label">{property.label}</div><property.control value={styleParam[property.key]} selection={editorList.map(item => item.toJSON() as Record<string, unknown>)} onChange={value => updateStyleParam(property.key, value as styleValue)} /></div> }))
      })
    } else if (activeKey !== 'init') {
      const plugin = pluginMap[activeKey]
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
        if (supportsRoughStyleName(activeKey)) {
          const roughControl = commonStyleRenders.find((item) => item.key === ROUGH_STYLE_KEY)
          if (roughControl) styleControls.push({ render: getStyleControlUI(roughControl), order: roughControl.order })
          if (styleParam[ROUGH_STYLE_KEY] === true) {
            commonStyleRenders
              .filter((item) => item.key === ROUGH_FILL_STYLE_KEY || item.key === ROUGH_STROKE_STYLE_KEY)
              .forEach((item) => styleControls.push({ render: getStyleControlUI(item), order: item.order }))
          }
        }
      }
      const extension = elementExtensions.find(item => item.type === activeKey)
      extension?.properties?.forEach(property => styleControls.push({ order: property.order ?? 50, render: <div key={`${extension.type}-${property.key}`} className="style-control"><div className="style-label">{property.label}</div><property.control value={extensionValues[extension.type]?.[property.key] ?? property.defaultValue} selection={[]} onChange={value => updateStyleParam(property.key, value as styleValue)} /></div> }))
    }

    return styleControls.sort((a, b) => a.order - b.order).map(control => control.render)
  }

  if (editorList.length === 0 && (activeKey === 'init' || (!pluginMap[activeKey]?.styleControlKeys.length && !elementExtensions.some(extension => extension.type === activeKey && extension.properties?.length)))) {
    return null;
  }

  return (
    <div ref={panelRef} className={`floating-panel style-panel ${isScrollable ? 'is-scrollable' : ''}`}>
      {getAllStyleControls()}
      {editorList.length > 0 && <div className="style-control layer-order-section">
        <div className="style-label">图层顺序</div>
        <div className="layer-order-controls">
          <IconButton label="置于顶层" icon={<ToTop />} onClick={() => onLayerChange('top')} />
          <IconButton label="上移一层" icon={<BringForward />} onClick={() => onLayerChange('up')} />
          <IconButton label="下移一层" icon={<SendBackward />} onClick={() => onLayerChange('down')} />
          <IconButton label="置于底层" icon={<ToBottom />} onClick={() => onLayerChange('bottom')} />
        </div>
      </div>}
    </div>
  )
}

export default StyleEditor;
