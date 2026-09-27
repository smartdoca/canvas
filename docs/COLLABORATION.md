# Doca 协同接入

## 所有权

Doca 拥有认证、权限、资源上传下载、WebSocket、数据库、消息去重、ACK、outbox、重连调度、通知和评论正文。画布包拥有模型事务、Yjs update、撤销栈、稳定元素身份、选区 presence 与评论元素锚点。

一个打开的文档只有一个 `CanvasModel` 和一条宿主连接。`CanvasEditor` 的 `model`、`sessionId`、`mode`、`remoteSelections` 和资源回调均由宿主注入。

## 创建与恢复

权威端使用 `CanvasModel.provision(value, epochId)` 创建新 checkpoint。普通打开使用 `CanvasModel.restore(checkpoint)`；checkpoint 的 codec、schema 和 epoch 必须完整匹配当前模型。

checkpoint 保存 `Y.encodeStateAsUpdate` 的完整状态。普通压缩只更新 checkpoint 与宿主 sequence，不从 JSON 重建身份。历史切换必须创建新 epoch，并由服务端在写入隔离下完成原子切换。

## 本地 update 与 ACK

宿主通过 `model.onLocalUpdate` 接收带稳定消息 ID 的 update，先写入持久 outbox，再发送。重试复用同一 ID。ACK 只确认对应消息，不代表 checkpoint 已保存。远端 update 通过 `model.applyUpdate` 应用，不产生本地回声。

## 编辑器生命周期

model 在挂载前必须完成恢复。`onReady` 只表示 handle 可用，不表示服务端已保存。远端合并、checkpoint、撤销和卸载会先 flush 当前文字编辑会话。`mode="readonly"` 同时禁用模型写入和编辑控件，但仍可运行明确允许的宿主只读动作。

## 资源与评论

模型只保存稳定资源路径，不保存签名 URL、Cookie 或二进制。评论正文、作者、状态和 ACL 留在 Doca；画布只提供基于元素 ID 与 epoch 的锚点捕获、解析和定位。
