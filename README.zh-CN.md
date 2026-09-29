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

const model = new CanvasModel();

export function Canvas() {
  return <CanvasEditor model={model} hostManaged mode="edit" />;
}
```

一份文档会话只保留一个 `CanvasModel`。选区或只读变化时不要新建模型。

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
| `onPresenceChange` | function | 用于在线状态的本地元素选区。它不是内容写入。 |
| `anchors` | `CanvasAnchorDecoration[]` | 永久的元素评论，独立于选区和在线状态。 |
| `activeAnchorId` | `string \| null` | 高亮的锚点。 |
| `onAnchorClick` | function | 锚点装饰被激活。 |
| `resources` | `CanvasEditorResources` | 远程图片需要 `resolveUrl`。`readImage` 为导出返回原始字节。 |
| `saveStatus` | `CanvasSaveStatus` | 宿主保存状态。传入后，编辑器显示这个值。 |
| `onSaveRequest` | function | 包请求宿主保存时调用。 |
| `locale` | `string` | `zh` 或 `en`。省略为中文。未知代码使用英文。 |
| `messages` | `Record<string, string>` | 替换单个文案键。 |
| `showHeader`、`showToolbar`、`showZoomControls` | `boolean` | 内建界面。 |
| `selectionActions`、`hostActions` | `CanvasSelectionAction[]` | 选区操作，以及没有选区时仍可用的操作。 |
| `onReady` | `(handle) => void` | 得到 `CanvasEditorRef`。 |
| `className`、`style`、`theme` | | 布局和 `--aidcanvas-*` 主题变量。 |

## 协同

codec 名称是 `aidcanvas-yjs`。

- 用宿主基线创建 `model`，之后一直传入同一个实例。
- 仅当 `meta.source` 为 `local` 时持久化 `onChange`。远端场景更新不能再产生一次上传。
- `mode="readonly"` 不发布编辑，也不发布正在编辑的选区。
- `onPresenceChange` 报告本会话的元素 id。它是临时状态，不是评论锚点。
- `anchors` 是永久元素锚点。句柄上的 `captureAnchor` 和 `resolveAnchor` 用来创建和检查。
- `resources.readImage` 必须返回宿主已经授权的字节。导出器不会自己请求 URL。

`@smartdoca/canvas/io` 负责 PNG 和 SVG 的导入导出。
