# @smartdoca/canvas

[English](README.md)

可嵌入的 React 矢量画板，基于 LeaferJS。包负责场景和编辑命令。宿主负责身份、图片字节、权限和网络。

许可证为 [MIT](LICENSE)。

## 安装

```sh
npm install @smartdoca/canvas react react-dom
```

```tsx
import { CanvasEditor } from "@smartdoca/canvas";
import { CanvasModel } from "@smartdoca/canvas/model";
import "@smartdoca/canvas/style.css";

// 挂载前创建一次新的本地文档。
const model = CanvasModel.initialize(crypto.randomUUID(), {
  version: 1,
  scene: { children: [] },
});

export function Canvas() {
  return <CanvasEditor model={model} hostManaged mode="edit" />;
}
```

一份文档会话只保留一个 `CanvasModel`。选区或只读变化时不要新建模型。

已有文档使用 `CanvasModel.restore(checkpoint)` 恢复宿主提供的权威 checkpoint。协同宿主只创建一次权威 epoch，并向各会话分发同一 checkpoint。详见[协同接入](docs/COLLABORATION.md)和 [0.5.0 更新记录](CHANGELOG.md)。

## 0.5.0 画布能力

- 思维导图、流程图与连接点、可编辑模板、容器、便笺、卡片和表格；富文本支持段落、列表、局部格式、图片、附件和自定义原子块。
- 画笔提供 1.5、3、5、8、12、20 六档粗细，修复首笔卡死和落笔后位置漂移。
- 框选只选择完全包含的内容；删除保留未选中的连线。删除思维导图父主题时递归删除子主题。修复删除、撤销后无法再次选择。
- 优化大场景投影、远端更新校验和批量选择；`yarn bench:collaboration` 覆盖 1000、5000、10000 元素双页面离线编辑、重复回放、只读与收敛。结果使用模拟宿主传输，见[性能报告](docs/performance/collaboration-2026-10-17.txt)。

## Props

`CanvasEditor` 接收 `CanvasEditorProps`。

| Prop | 类型 | 作用 |
|---|---|---|
| `model` | `CanvasModel` | 来自 `@smartdoca/canvas/model` 的场景。它自己不连接网络。 |
| `hostManaged` | `boolean` | 宿主负责保存和协同。 |
| `mode` | `"edit" \| "readonly"` | `readonly` 停止编辑。 |
| `value`、`defaultValue` | `CanvasValue` | 未传入 model 时的场景值。 |
| `onChange` | `(value, meta) => void` | `meta.source` 为 `local`、`api` 或 `remote`。只有 `local` 应该保存。 |
| `sessionId` | `string` | 当前标签的会话。 |
| `remoteSelections` | `SessionSelection[]` | 临时的远端选区。 |
| `onPresenceChange` | function | 本地元素选区、画布指针与可选的 epoch 相对文字选区，不产生内容写入。 |
| `anchors` | `CanvasAnchorDecoration[]` | 永久的元素评论，独立于选区和在线状态。 |
| `activeAnchorId` | `string \| null` | 高亮的锚点。 |
| `onAnchorClick` | function | 锚点装饰被激活。 |
| `resources` | `CanvasEditorResources` | 宿主提供 `uploadImage`、`uploadAttachment`、`resolveUrl`、`resolveDownloadUrl`；`readImage` 为导出提供授权字节。 |
| `onAttachmentPreview` | `(CanvasResource) => void \| Promise<void>` | 附件预览交给宿主，优先于 `onResourcePreview`。 |
| `onResourcePreview` | `(CanvasResource) => void` | 由宿主预览图片和附件，接收稳定资源信息。 |
| `richTextExtensions` | `CanvasRichTextExtension[]` | 富文本自定义原子块或 `inline: true` 行内原子节点，序列化 JSON 与可读 label。 |
| `saveStatus` | `CanvasSaveStatus` | 宿主保存状态。传入后，编辑器显示这个值。 |
| `onSaveRequest` | function | 包请求宿主保存时调用。 |
| `locale` | `string` | `zh` 或 `en`。省略为中文。未知代码使用英文。 |
| `messages` | `Record<string, string>` | 替换单个文案键。 |
| `showHeader`、`showToolbar`、`showZoomControls` | `boolean` | 内建界面。 |
| `selectionActions`、`hostActions` | `CanvasSelectionAction[]` | 选区操作，以及没有选区时仍可用的操作。 |
| `onReady` | `(handle) => void` | 得到 `CanvasEditorRef`。 |
| `className`、`style`、`theme` | | 布局和 `--aidcanvas-*` 主题变量。 |

底部控件和小地图默认在右侧额外预留 `64px`，避让宿主悬浮按钮。可通过 `theme={{ '--aidcanvas-bottom-right-offset': '0px' }}` 取消留白，也可传入其他 CSS 长度适配宿主布局。

文件元素通过上方工具栏预览、下载，只读状态也可操作。预览使用与 slatetsx 一致的展开图标。附件优先调用最新的 `onAttachmentPreview`，未传时调用 `onResourcePreview`；图片继续使用 `onResourcePreview`。回调收到稳定的 path 和元数据；预览界面和权限由宿主处理。回调可返回 Promise，失败交给 `onError`，不会写入文档。下载仍需 `resources.resolveDownloadUrl` 授权。

## 协同

codec 名称是 `aidcanvas-yjs`。

- 用宿主基线创建 `model`，之后一直传入同一个实例。
- 仅当 `meta.source` 为 `local` 时持久化 `onChange`。远端场景更新不能再产生一次上传。
- `mode="readonly"` 不发布编辑，也不发布正在编辑的选区。
- `onPresenceChange` 报告本会话的元素 id。它是临时状态，不是评论锚点。
- `anchors` 是永久元素锚点。句柄上的 `captureAnchor` 和 `resolveAnchor` 用来创建和检查。
- `resources.readImage` 必须返回宿主已经授权的字节。导出器不会自己请求 URL。

`@smartdoca/canvas/io` 负责 PNG 和 SVG 的导入导出。

行内扩展可提供 `suggestions: {trigger, search(query, {signal})}`，以及 `matchPaste(text)` / `paste(text, {signal})`。宿主负责目录查询、用户卡片、文档标题和权限；画布负责候选菜单、活范围、插入、删除、复制和撤销。异步回调不会在目标关闭、删除或只读后插入。原生文本用一个 U+FFFC 标记表示每个原子节点；画布和导出显示保存的 label，纯文本复制显示可读文字。新节点不承诺旧客户端可识别；不迁移、回填或重写现有内容。
