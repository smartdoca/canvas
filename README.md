# AidCanvas 0.4.1

当前源码 UI 调整：演示页铺满窗口；内建图层面板已移除（不删除元素、分组或模型层级）；`showLayers` / `layersPosition` 仅作为废弃兼容参数保留，不再显示面板。下述0.4.1性能数据对应此前交付包，当前源码未重新发包。

此前交付的 0.4.1 包修复大画板性能瓶颈：图层列表按可见范围渲染、单元素属性修改和评论锚点直接按 ID 访问、场景投影避免重复复制同级列表、导出复用一次离屏布局。万元素实测与剩余性能边界见 [性能报告](docs/PERFORMANCE_0.4.1.md)。当前源码已移除图层列表，其余优化保留；不改变 schema/epoch、宿主 ACK 或已有数据。

新增第一阶段图片素材导入和 PNG / **真实矢量 SVG** 导出：`aidcanvas/io`、统一单事务插入、宿主资源读取、取消/进度及安全校验。第二阶段可编辑 SVG 往返尚未实现，开启保留编辑数据会明确报错。正式接口、限制与兼容性变化见 [0.4 导入导出](docs/IMPORT_EXPORT_0.4.md)，复制接入见 [HostCanvas](examples/io/HostCanvas.tsx) 和 [新建文档工作流](examples/io/workflow.ts)。不再提供独立 JSON 文件上传下载。

修复手绘填充渲染缓存进入 CRDT：仅保存颜色、风格、seed 和几何，恢复时重建纹理；点状填充使用局部确定性随机源。新增 `layersPosition`、`hostActions` 和只读授权评论动作。实际声明、接入与旧非法队列隔离恢复方案见 [0.3.1 手绘修复](docs/DOCA_0.3.1.md)。

本版新增常驻元素评论装饰、revealAnchor/revealElements、严格模型验证、输入生命周期保护和原始 checkpoint 的新 epoch 历史恢复。实际声明、完整接入示例、文字范围分阶段边界见 [Doca 0.3 接入补充](docs/DOCA_0.3.md)。

React + Leafer 无限画板，以及可在 Node 使用的元素级 Yjs 模型。Doca 持有权限、资源服务、网络、持久队列和 ACK；编辑器不开发自己的后端。

## 安装与入口

```sh
# 使用交付的唯一 SHA-1 限定文件名（不要复用旧版本包缓存）
npm install ./aidcanvas-0.4.1-*.tgz
```

```tsx
import { CanvasEditor } from 'aidcanvas' // 浏览器组件；SSR 项目需 client-only 加载
import type { CanvasEditorRef, CanvasEditorProps, CanvasEditorResources } from 'aidcanvas'
import { CanvasModel } from 'aidcanvas/model' // Node/浏览器均可，无 DOM 依赖
import { parseCanvasFile, createCanvasImportValue, exportCanvasFile, CANVAS_IO_CAPABILITIES } from 'aidcanvas/io' // 浏览器独立转换，不需要挂载编辑器
import 'aidcanvas/style.css'
```

React/ReactDOM 为 peer dependencies，Yjs 13.6.27 为 dependency。不要在一个文档会话混用不同副本的 Yjs runtime。ESM 输出及完整声明文件随包发布。

## Doca 推荐接入

权威服务只初始化一次，然后将原始 checkpoint 给各页面；不要让各页面分别从 JSON 创建 CRDT。

```ts
import { CanvasModel } from 'aidcanvas/model'

// 服务端首次导入；图片需已转换为稳定资源 path。
const authority = CanvasModel.initialize('epoch-from-server', {
  version: 1,
  scene: { children: [{ id: 'box-1', tag: 'Rect', x: 40, y: 50, width: 120, height: 80 }] },
})
const checkpoint = authority.checkpoint()

// 页面创建一次，放在会话生命周期中。
const model = CanvasModel.restore(checkpoint)
const stop = model.onLocalUpdate(update => docaOutbox.enqueue(update))
// 接收同一宿主 WebSocket 的数据：model.applyUpdate(remoteEnvelope)
// 离开时先 flush/处理待确认数据，再 stop() 和 model.dispose()。
```

```tsx
<CanvasEditor
  model={model}
  hostManaged
  mode={canEdit && synchronized ? 'edit' : 'readonly'}
  saveStatus={hostSaveStatus}
  sessionId={serverSessionId}
  remoteSelections={hostRemoteSelections}
  onPresenceChange={hostPublishSelection}
  resources={hostResources}
  onReady={handle => { editorHandle.current = handle }}
/>
```

以上变量由宿主提供；完整、通过类型检查的边界示例在 [examples/doca/DocaCanvas.tsx](examples/doca/DocaCanvas.tsx)。onLocalUpdate 的实际回调类型：

```ts
interface CanvasUpdate {
  protocolVersion: 1
  codec: 'aidcanvas-yjs'
  schemaVersion: 1
  epochId: string
  id: string
  update: Uint8Array // 此次本地事务差量，不是快照
}
```

只有本地内容与本人 undo/redo 触发此回调；初始化、远端合并、资源 URL 解析、选区、平移/缩放不触发。宿主保留原 ID/bytes，提交数据库后 ACK；包不判断云端已保存。重连先补拉再重发未确认队列。

`model` 挂载前必须完成 bootstrap。`onReady` 只是 handle 就绪，不代表云端已保存。model 模式禁止 setValue/applyRemoteValue 整篇替换；远端只能 model.applyUpdate。UI 在远端合并前同步 flush 本地编辑，保持未发送修改。

## 可运行示例和检查

以下为源码仓库中的开发/测试命令；安装包内含示例，但不包含仓库测试工具与构建配置。包内 Node 示例可在消费项目直接执行 `node node_modules/aidcanvas/examples/server.mjs`。

```sh
yarn install
yarn build:lib
node examples/server.mjs
yarn dev
# 打开 /examples/doca/，点击“同账号打开第二页面”
yarn test:model
yarn test:browser
yarn run check
npm pack
```

浏览器示例是独立宿主，用 BroadcastChannel 模拟跨页面传输、断线和接收回执；不是生产服务器，也不声称回执为数据库 ACK。包中不包含网络服务。测试默认使用 macOS Chrome；其他系统设置 `CANVAS_BROWSER=/absolute/path/to/chrome`。测试明细及限制见 [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md)。

## React props 与 handle

| Props | 用途 |
| --- | --- |
| model / hostManaged | Yjs 模型/宿主模式；禁止额外 Provider、自动保存及 localStorage 恢复 |
| mode / readOnly | edit/readonly；只读可选中、复制到内部剪贴板、搜索及接收远端，不可创建副本/修改/删除 |
| value / defaultValue | 仅单机受控替换/初值；model 模式不用于传输 |
| onChange | local/api/remote 投影通知，不是 ACK，也不应用作 CRDT 持久化信号 |
| saveStatus / onSaveStatusChange | 宿主权威保存状态 / 本地状态通知 |
| sessionId / remoteSelections / onPresenceChange | 会话级 ID 选区、边框/用户名、125ms 节流本地 presence |
| anchors / activeAnchorId / onAnchorClick | 常驻元素评论标记、受控激活高亮和点击；只读可见 |
| resources | uploadImage/resolveUrl/resolveDownloadUrl/readImage；宿主上传、展示解析、下载授权与导出原始资源读取 |
| onImageUpload / imageStorage / onImageDownload | 旧图片编辑适配 / 下载接管；文件插入必须提供 resources，不再回退 data URL 上传 |
| onImportRequest / onExportRequest | 宿主打开选择器 / 接收 png 或 svg 导出意图；宿主调用正式 API 并决定是否触发下载 |
| customShapes / elementExtensions / selectionActions | 自定义 path、基础 tag 元素和业务按钮 |
| hostActions | 独立顶部宿主动作，不依赖选区或内建 toolbar；两类动作均支持 icon、tooltip、动态 disabled、allowInReadOnly |
| layersPosition / showLayers | 已废弃，无效果；内建图层模块已移除，模型层级/分组不受影响 |
| title / labels / headerActions / toolbarStart / toolbarEnd | 文案和宿主 UI 插槽 |
| showHeader / showToolbar / showZoomControls | 内置 UI 显隐 |
| className / style / theme | 外部 CSS/布局和 --aidcanvas-* 变量覆盖 |
| onReady / onSelectionChange / onError | UI handle、纯选区通知、异常 |
| autoSave / storageKey | 仅单机 localStorage；宿主模式强制禁用 |

外部可通过 className 限定 CSS 覆盖范围，或通过 theme 设置 `--aidcanvas-background`、`--aidcanvas-surface`、`--aidcanvas-text`、`--aidcanvas-border`、`--aidcanvas-font`。构建后的自有 CSS 与图标样式均在 `[data-aidcanvas]` 根下，不影响宿主同名类。目前并非所有内部颜色都已变量化（accent 尚未完整接线），不是 Shadow DOM 双向隔离；复杂主题仍需额外覆盖。

`CanvasEditorRef` 实际提供：getValue、setValue、applyRemoteValue、getSelection、select、updateSelection、removeSelection、addElement、addCustomShape、addExtensionElement、addImage、insertImageFile、clientToScene、exportFile、exportImage、undo、redo、flush、groupSelection、ungroupSelection、find、reveal、revealElements、revealAnchor、replace、replaceAll、captureAnchor、resolveAnchor、capabilities。

编辑器负责搜索匹配和替换事务，Doca 提供搜索 UI。旧 reveal 会选择匹配元素；新的 revealAnchor/revealElements 仅定位视口，不改变选区，支持嵌套变换。替换结果绑定 revision，过期匹配拒绝。模型替换以一次本地事务进入本人撤销。评论已提供稳定元素锚点捕获/解析、常驻标记、激活高亮和点击事件；正文/卡片由宿主实现。

## 资源

```ts
const resources: CanvasEditorResources = {
  uploadImage: (blob, context) => assets.upload(blob, {
    signal: context.signal, fileName: context.fileName, source: context.source,
  }), // 返回 { path: stableAssetId, name?, size?, mimeType?, width?, height? }
  resolveUrl: (path, { signal }) => assets.authorizeView(path, signal),
  resolveDownloadUrl: (path, { signal }) => assets.authorizeDownload(path, signal),
}
```

模型中的图片只有稳定 path；临时地址不写回文档。Doca 模式的 addImage(string) 参数为资源 path，而非任意 URL。未配置授权下载时，默认资源下载拒绝。上传/图片编辑完成后检查当前会话、只读、取消/删除状态；卸载和只读会 abort。服务端必须复查权限；包无上传占位/进度 UI/重试队列。

## 兼容性与限制

- 0.2.0 新增 `aidcanvas/model`，document.version 仍为 1，但协同 codec 为全新 `aidcanvas-yjs` schema 1。旧快照同步不能直接当作 Yjs 增量，需权威迁移生成新 epoch/checkpoint。
- 旧 CanvasCollaborationProvider 和 onLocalTransaction 仍为整篇快照兼容接口，不是完整多人 CRDT，Doca 不使用它们。
- 不同元素/顶层属性、纯文本字符支持并发合并；同属性由 Yjs 确定胜者；嵌套 data/fill/path 作为整体属性值。分组、删除、排序、撤销的精确冲突规则见 [docs/COLLABORATION.md](docs/COLLABORATION.md)。
- 无富文本 span、字符级远端光标、文字内部永久评论锚点。已覆盖 Chromium 组合输入与远端并发，但未验证所有系统输入法/多行复杂选区。自定义元素需使用受支持基础 tag 与已公布顶层属性，业务扩展放在 data，不支持任意新 codec。
- 无持久离线 outbox、服务端 ACK/去重、生产 ACL/资产服务；这些仍由 Doca 接管。测试使用隔离内存宿主，不声称已在 Doca 生产环境验证。
- Node 模型不渲染图片；Node 解组不支持旋转/缩放/斜切，需要 UI 几何适配。排序 rank 精度耗尽拒绝，不自动更换 epoch。元素限制包含 tombstone。
- 浏览器组件入口不能直接 SSR；Node 使用 /model。Yjs/lib0 首次导入读取三个诊断配置键；编辑器挂载后无 storage 读写，也不保存偏好。

许可证仍为 UNLICENSED；此产物可内部安装，未发布到公共 npm registry。
