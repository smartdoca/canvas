# 0.4：导入导出第一阶段

本次交付图片素材导入与普通 PNG/SVG 导出。第二阶段的「带编辑数据 SVG 往返」**尚未实现**，不应据此开放恢复原生图层的产品入口。无独立 JSON 文件导入/下载 UI；模型初始化参数不是文件格式。

## 正式接口

`aidcanvas/io` 是浏览器 ESM 子入口，不需要挂载编辑器，也不会弹框、下载、fetch、上传或访问当前会话；但会使用 DOMParser、Image、Canvas 和浏览器字体，因此不能在 Node/SSR 中执行。无浏览器模型入口仍是 `aidcanvas/model`。

```ts
import {
  CANVAS_IO_CAPABILITIES, CanvasIOError,
  parseCanvasFile, createCanvasImportValue, exportCanvasFile,
} from 'aidcanvas/io'
import type {
  CanvasImportOptions, CanvasImportResult, CanvasInsertOptions, CanvasInsertResult,
  CanvasExportOptions, CanvasExportResult, CanvasIOProgress, CanvasIOWarning,
} from 'aidcanvas/io'

// 独立解析：资源 blob 已经识别、校验及 SVG 清洗，不能上传原始未清洗 SVG。
const parsed: CanvasImportResult = await parseCanvasFile(file, { signal, onProgress })
// kind:'image-asset', format, filename, width, height,
// resources:[{id, blob, mimeType, width, height}], warnings:[{code,message,elementId?}]

// 仅构造 NEW 文档初值；资源先由宿主上传。
const initialValue = createCanvasImportValue(parsed, { 'asset-1': stablePath })
// 宿主服务器创建文档/检查权限，CanvasModel.initialize(NEW_EPOCH, initialValue) 一次，
// 分发原始 checkpoint。严禁用此 value 覆盖正在协同的画板。

// 已有文档：上传/校验完成后，正式原生模型事务插入。
const inserted: CanvasInsertResult = await handle.insertImageFile(file, {
  x: 120, y: 80, width: 320, height: 240, signal, onProgress,
})
// elementId, element, warnings；不是 Yjs bytes，也不是 outbox。

const result: CanvasExportResult = await handle.exportFile({
  format: 'png', scope: 'selection', background: 'transparent', scale: 2,
  filename: '画板', signal, onProgress,
})
// {blob,filename,mimeType,width,height,warnings}，width/height 为输出像素/固有尺寸。
// 独立转换同样可用：
await exportCanvasFile({ scene }, {
  format: 'svg', scope: 'selection', elementIds: ['id-1'], readAsset,
})
```

以上变量代表宿主上下文；完整可复制、通过类型检查的 React 示例为 `examples/io/HostCanvas.tsx`，新建文档工作流和资源读取/下载实现为 `examples/io/workflow.ts`。可运行的宿主示例 `examples/doca/` 已有文件选择、拖入、粘贴、PNG/SVG 按钮及双页面同步。

`CanvasIOError.code` 是稳定错误标识；模型本身的严格验证错误仍按模型契约抛出，宿主上传回调异常原样传播。`warnings` 的 code 用于宿主本地化提示，message 目前是同名英文标识。

## 支持与限制

| 能力 | 已实现 / 边界 |
| --- | --- |
| PNG | `image/png`，`.png`；单个图片元素，不 OCR、不拆图层 |
| JPEG | `image/jpeg`，`.jpg/.jpeg`；原始图片资源，浏览器解码处理显示方向 |
| WebP | `image/webp`，`.webp`；不提供动画时间轴，导出不保证动画帧时刻 |
| 普通 SVG | `image/svg+xml`，`.svg`；整体矢量资源，保留 SVG 源而非截图，不拆原生层 |
| 定位和比例 | x/y 为场景左上角；不传时以调用时视口中心定位；width/height 为 contain 包围盒，始终保持比例；无尺寸时不放大，限制在 480×360 及可视区域的 55% 内 |
| 编辑 | Image 元素的移动/缩放/旋转、本人 undo/redo、模型差量、checkpoint 恢复沿用正式模型能力 |
| PNG | 建议默认分享格式；由相同的矢量转换结果光栅化，不截取活动画板 |
| SVG | 真实 path/text/group/matrix；图形、路径、纯文字、分组/层级/变换、开口/实心箭头、五种手绘填充与常规外阴影；图片使用嵌入 data 资源，仅在导出文件中存在 |
| 输出范围 | 默认 all；selection 必须存在且非空。保留必要的祖先变换，排除未选中的兄弟内容、隐藏子树及所有编辑辅助层 |
| 边界 | 脱离编辑器的原生 render bounds，加抗锯齿/文字安全边距；不是固定页面尺寸；背景默认为透明，可指定合法颜色 |
| 字体 | 不嵌入字体；保留字体名/字号和行位置，追加 sans-serif 回退并给出 `FONT_NOT_EMBEDDED_SYSTEM_FALLBACK`；接收端字体不同会有差异，可选 PNG 获得本机渲染外观 |
| 有损项 | 渐变/多重 paint、mask/eraser、内阴影、模糊/背景模糊/混合模式不支持，返回 `UNSUPPORTED_PAINT_*` / `UNSUPPORTED_EFFECT_*` 并在脱离的输出中省略；非居中描边、复杂阴影及文字溢出返回近似警告。PNG 同样遵循这些限制 |
| 未保证 | 自定义字体完整可移植、复杂双向文字及所有高级排版、所有查看器像素一致性、浏览器原生打印/动画导出、任意自定义 tag、服务端无头转换 |

源 SVG 的保守白名单支持基础图形/文本/分组、局部 use、渐变、裁剪/遮罩、pattern、常规滤镜和内嵌 PNG/JPEG/WebP。移除脚本、事件、foreignObject、样式表、动画、危险 URL、外部图片/字体/链接；安全 inline presentation style 转为属性。移除项会有警告，并不宣称任意 SVG 无损。拒绝 DTD/entity、重复 ID、引用环、过度展开的引用图及超限滤镜。嵌套 data SVG 不接收，避免递归资源；导出文件中的嵌套 SVG 在独立查看器可显示，但重新作为普通 SVG 导入会被清洗警告，完整资产往返属第二阶段。

## 硬限制

从 `CANVAS_IO_CAPABILITIES.limits` 读取，不应只靠 accept/文件后缀判断：

- 单文件 10 MiB，SVG 源 2 MiB；原始解码前检查真实文件头和尺寸，伪造后缀/MIME 拒绝，浏览器原生解码再次验证。
- 图片边长 ≤16,384、像素积 ≤32,000,000；SVG 内嵌位图像素合计同样 ≤32,000,000。
- SVG 节点/引用展开 ≤10,000、深度 ≤64；filter 标准差 ≤128，滤镜表面同样受尺寸/像素限制。
- 导出场景 ≤10,000 元素；输出边长 ≤8,192、像素积 ≤32,000,000；scale 在 0.1～4。超限明确报错，不自动缩小。
- 导出读取资源合计 ≤40 MiB、去重资源的外框像素积 ≤32,000,000；每份资源仍受导入校验限制。SVG 导出文件可能因内嵌资源超过普通 SVG 导入的 2 MiB 限制，不能把普通分享等同无损往返。

## 生命周期、权限、资源与副作用

`insertImageFile` 必须提供 `resources.uploadImage` 和 `resolveUrl`。上传返回稳定 path，解析成功后才插入；CRDT 仅含 path 和尺寸/素材信息。取消、只读切换、model/编辑器替换、卸载会取消待插入操作，无上传占位元素。真实 ACL、取消上传及孤立资产回收仍由宿主处理：浏览器取消不等于服务器上传回滚。

插入自身是一次 `model.add` 本地事务（一次本人撤销）；若此前还有防抖修改，先单独 flush 此前修改。本地回调仍为标准 CanvasUpdate 差量；服务器拒绝时不能移除 outbox 或置为 clean。包不提交、ACK、重试或重写已有 Yjs bytes。

导出不调用 handle.getValue/flush，不改变模型、选区、本人撤销栈、dirty 或 presence，不触发下载。原生编辑尚未提交或文本编辑器打开时，handle 报 `PENDING_LOCAL_EDITS`；宿主应先让用户完成编辑，再显式 flush，之后调用导出。这次显式完成/flush 不属于导出副作用。读取操作开始时的模型快照，不等待云端 ACK；期间远端更新不混入已开始的导出。

新增 `resources.readImage(path,{purpose:'export',signal,onProgress}) => Promise<Blob>` 由宿主授权读取原始资源。**展示的 resolveUrl 与导出读取是不同授权路径**。转换器不会 fetch 地址或自动调用下载接口；缺少资源读取、授权失败、资源损坏时明确失败，不生成缺图文件。只读可以导出，但宿主可不开放下载按钮，并在 readImage 再检查权限。

各耗时 API 支持 signal、分阶段进度 `{phase,completed,total}`。取消等待中的上传/读取可立即返回，即使宿主 Promise 尚未结束，也不会迟到插入；宿主应继续向网络传递 signal。同步 XML/几何转换在当前有界批次内完成，不提供 Worker 级抢占或精确时间百分比。

常见错误：`EMPTY_FILE`、`FILE_TOO_LARGE`、`FILE_EXTENSION_MISMATCH`、`FILE_MIME_MISMATCH`、`INVALID_SVG`、`SVG_DTD_FORBIDDEN`、`SVG_REFERENCE_CYCLE`、`SVG_TOO_COMPLEX`、`IMAGE_DECODE_FAILED`、`IMAGE_DIMENSIONS_EXCEEDED`、`READONLY`、`CANCELLED`、`ASSET_READER_REQUIRED`、`ASSET_READ_FAILED`、`EMPTY_CANVAS`、`EMPTY_SELECTION`、`SELECTION_NOT_FOUND`、`EMPTY_VISIBLE_CONTENT`、`EXPORT_SCALE_EXCEEDED`、`EXPORT_DIMENSIONS_EXCEEDED`、`PENDING_LOCAL_EDITS`。

## 兼容性 / 第二阶段

- `aidcanvas-yjs/schemaVersion=1`、checkpoint、epoch、锚点和旧 outbox 无改动；无需迁移或清空队列。
- 新增 `insertImageFile`、`exportFile`、`clientToScene`、`aidcanvas/io`。`exportImage()` 保留 PNG 默认名，但现为 `Promise<CanvasExportResult>`，不再返回底层 unknown 或触发下载；只支持 png/svg，不支持 jpg 参数。宿主需按此升级。
- 内置头部不再导入/下载独立 JSON；`onImportRequest` 和 `onExportRequest` 由宿主接管选择与下载 UI。旧 File/Blob `addImage` 路径委托正式校验/事务并要求 resources；`onImageUpload/imageStorage` 不再是文件导入后备。字符串 addImage 为旧稳定资源接口，不等于文件解析。旧图片编辑适配保持原合同。
- `CANVAS_IO_CAPABILITIES.editableSvgRoundtrip === false`；`preserveEditData:true` 一律 `EDITABLE_SVG_UNSUPPORTED`。检测到 aidcanvas metadata 的导入也明确报错；只有宿主显式给出 `ignoreEditableData:true` 才清除源数据并返回 `EDITABLE_DATA_IGNORED`，不静默降级。
- 下一阶段需另行交付格式版本、可移植资产映射、原生图层/连接关系恢复、范围裁剪和 ID/引用重映射，以及未知版本/资源缺失测试。本版不会恢复旧 epoch、用户凭据、评论、历史或未确认队列。

测试证据和安装验收结果见 `TEST_RESULTS.md`；仓库实际浏览器用例位于 `tests/browser/io.spec.mjs`，会生成四种输入文件、PNG/SVG 输出和独立查看器截图。
