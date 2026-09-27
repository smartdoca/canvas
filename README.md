# aidcanvas

基于 React、LeaferJS 和 Yjs 的矢量画布编辑器。

## 基础使用

```tsx
import { CanvasEditor } from 'aidcanvas'
import 'aidcanvas/style.css'

export function Canvas() {
  return <CanvasEditor mode="edit" />
}
```

`mode` 是唯一权限入口。宿主可通过 `toolbarStart`、`toolbarEnd`、`headerActions`、`hostActions` 和 `selectionActions` 扩展界面，通过 `messages` 覆盖稳定的国际化键。

## 协同使用

新文档由权威端创建 `CanvasModel`，客户端恢复 checkpoint 后将同一 model 注入编辑器：

```ts
import { CanvasModel } from 'aidcanvas/model'

const model = CanvasModel.restore(checkpoint)
```

```tsx
<CanvasEditor
  model={model}
  hostManaged
  mode={canEdit ? 'edit' : 'readonly'}
  sessionId={sessionId}
/>
```

包只实现当前 `aidcanvas-yjs` schema。网络、认证、ACK、outbox、checkpoint、重连和业务评论由宿主负责。远端更新只通过 `model.applyUpdate` 进入，宿主监听 `model.onLocalUpdate` 持久化本地 update。详见 [协同接入](docs/COLLABORATION.md)。

## Handle

`CanvasEditorRef` 提供当前接口：`getValue`、`setValue`、`getSelection`、`select`、`updateSelection`、`removeSelection`、`addElement`、`addCustomShape`、`addExtensionElement`、`addImage`、`insertImageFile`、`clientToScene`、`exportFile`、`undo`、`redo`、`flush`、`groupSelection`、`ungroupSelection`、`find`、`reveal`、`revealElements`、`revealAnchor`、`replace`、`replaceAll`、`captureAnchor`、`resolveAnchor` 和 `capabilities`。

model 模式禁止整篇 `setValue`；内容变更必须成为可追踪的模型事务。图片持久化稳定资源路径，显示地址由 `resources` 在使用时解析。

## 开发

```bash
yarn check
yarn build:lib
yarn test:model
yarn check:examples
```
