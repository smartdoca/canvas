# Doca 协同接入

## 所有权

Doca 拥有认证、权限、资源上传下载、WebSocket、数据库、消息去重、ACK、outbox、重连调度、通知和评论正文。画布包拥有模型事务、Yjs update、撤销栈、稳定元素身份、选区 presence 与评论元素锚点。

一个打开的文档只有一个 `CanvasModel` 和一条宿主连接。`CanvasEditor` 的 `model`、`sessionId`、`mode`、`remoteSelections` 和资源回调均由宿主注入。

## 创建与恢复

权威端使用 `CanvasModel.initialize(epochId, value)` 创建新模型，并通过 `model.checkpoint()` 获取权威 checkpoint。普通打开使用 `CanvasModel.restore(checkpoint)`；checkpoint 的 codec、schema 和 epoch 必须完整匹配当前模型。

checkpoint 保存 `Y.encodeStateAsUpdate` 的完整状态。普通压缩只更新 checkpoint 与宿主 sequence，不从 JSON 重建身份。历史切换必须创建新 epoch，并由服务端在写入隔离下完成原子切换。

## 本地 update 与 ACK

宿主通过 `model.onLocalUpdate` 接收带稳定消息 ID 的 update，先写入持久 outbox，再发送。重试复用同一 ID。ACK 只确认对应消息，不代表 checkpoint 已保存。远端 update 通过 `model.applyUpdate` 应用，不产生本地回声。

## 编辑器生命周期

model 在挂载前必须完成恢复。`onReady` 只表示 handle 可用，不表示服务端已保存。远端合并、checkpoint、撤销和卸载会先 flush 当前文字编辑会话。`mode="readonly"` 同时禁用模型写入和编辑控件，但仍可运行明确允许的宿主只读动作。

## 资源与评论

模型只保存稳定资源路径，不保存签名 URL、Cookie 或二进制。评论正文、作者、状态和 ACL 留在 Doca；画布只提供基于元素 ID 与 epoch 的锚点捕获、解析和定位。


## 富文本与字符 presence（2026-10-17，当前源码）

富文本继续使用既有 schema 1：文字由 Y.Text 合并，`data.richText` 中的行样式、媒体与自定义块作为整体字段采用 Yjs LWW。并发修改同一个富文本格式字段会确定性选择一个快照；这不是逐字符格式 CRDT。没有转换已有 checkpoint、epoch 或增加 autosave 通道。

`CanvasPresence` 增加可选 `text: { epochId, elementId, anchor, focus }`。anchor/focus 是 Yjs relative-position JSON 字符串，而非可持久化的数字偏移。服务端仍负责会话身份、颜色、文档权限与广播范围；宿主必须保留并转发完整 presence。包拒绝错误 epoch、跨文字类型位置、非法或超长位置和已删除对象。光标和选区只影响视图；只读/失焦清空本地 presence，readonly 不绘制远端编辑光标。同账号的不同 session 分开展示。

`richTextExtensions` 的自定义原子块只持久化 JSON 和可读 label。Slate void 语义、整块复制/删除与撤销归包管理，业务交互和展示归宿主；canvas/export 使用可读 label，不运行宿主 React 渲染。当前接口不支持自定义行内节点。资源拖出复用授权资源路径，以一个原生模型事务完成源删除与目标插入，保持现有 outbox/ACK 行为。

示例宿主 `/examples/doca/` 已透传完整 presence。实际 Doca 服务端权限与持久 ACK 不由本源码示例证明，需宿主接入后验收。

Presence 还包含可选的 `cursor: { x, y }` 画布坐标，展示远端鼠标指针；移动节流发送并使用同一宿主 presence 通道，不产生内容写入。

## 大数据协同性能（2026-10-17，当前源码）

远端更新复用隔离的校验副本，仍逐次完成完整校验，再应用到在线文档；拒绝更新后丢弃校验副本，下次从在线文档重建。校验副本跟随本地、撤销和远端增量。文字编辑分支使用 state vector 获取差量。场景适配仅复用字节相同且已验证的内容；调用方修改原对象后必须重新验证。

页面比较上次投影的模型意图，只更新变化元素，保留本地布局默认值与资源解析 URL；原生内容未变化时复用快照。批量定位、presence 和多选成员判断使用索引。超过 1000 个元素的框选在拖动时显示选区范围，松手后一次应用最终成员。远端选区为空时不启动刷新计时器，静止选区不重复渲染。

使用 `yarn bench:collaboration` 运行 1000/5000/10000 元素双页面测试；包含双向离线编辑、原始消息重复回放、只读拒绝、内容收敛和无回声检查。性能日志中的传输延迟与排队等待绘制为测试宿主模拟值，不能作为生产网络或持久 ACK 的验收结果。模型、schema 1、epoch、checkpoint 字节、消息 ID、outbox 与 ACK 协议均保持既有契约。上述优化随 0.5.0 发布；真实 Doca 后端性能仍需宿主联调验收。
