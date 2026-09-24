# AidCanvas 0.3.1 协同契约

手绘纹理严格留在视图：`toPersistedCanvasScene` 在事务产生前提取参数。非法旧 bytes 不清洗、不复用 ID、不跳过依赖；独立恢复流程见 [DOCA_0.3.1](DOCA_0.3.1.md)。

本版的常驻评论、正式定位、严格校验、文本输入分支与历史恢复完整接口见 [DOCA_0.3](DOCA_0.3.md)。编码仍为 schema 1。

## 包与宿主边界

`aidcanvas/model` 是无 DOM、React、Leafer 运行时依赖的 Yjs 模型入口，可直接在 Node 20+ 使用。包负责元素身份、编辑、合并、本人撤销、查找替换、checkpoint 和元素锚点。`CanvasEditor model={model}` 提供原生画布适配和临时选区绘制。

Doca 拥有权限、身份、资源上传下载、WebSocket、数据库、消息去重、ACK、重连调度、通知和评论正文。设置 model/hostManaged/onLocalTransaction 中任意一个都会禁用兼容 Provider、localStorage 恢复与 autosave；样式偏好仅存在内存。mode/saveStatus/用户/选区变化不会重建 App 或 handle。model 挂载前必须已经恢复；onReady 仅表示 UI handle 可用。model 模式忽略 value，setValue/applyRemoteValue 明确拒绝整篇替换。

## 实际导出

```ts
import {
  CanvasModel, CANVAS_CODEC, CANVAS_SCHEMA_VERSION,
  createElementId, migrateCanvasValue, switchCanvasEpoch, toPersistedCanvasScene,
  visibleRemoteSelections, createHistoryRestore, CANVAS_ELEMENT_PROPERTIES,
} from 'aidcanvas/model'
import type {
  CanvasUpdate, CanvasCheckpoint, ModelValue, SceneNode,
  ModelChange, ModelMatch, ElementAnchor, SessionSelection,
} from 'aidcanvas/model'
```

| 方法 | 语义 |
| --- | --- |
| CanvasModel.initialize(epochId,value) | 权威方只执行一次，旧 JSON 补稳定 ID 并产生初始 CRDT |
| CanvasModel.restore(checkpoint) | 各页面/后端从相同原始身份编码恢复，不能分别从 JSON 初始化 |
| add/patch/remove | 新增、顶层属性修改、删除元素/子树 |
| place(id,parent,beforeId?) | 修改父级及同级顺序；坐标仍为父级内坐标 |
| group/ungroup | 同级元素原子分组/解组；Node 解组支持平移，旋转/缩放/斜切组要求原生几何适配 |
| editText(id,index,deleteCount,insert) | UTF-16 范围的 Y.Text 字符操作 |
| applyScene(next,base,expectedRevision?) | 正式场景差量适配；base 为最近视图投影，显式过期 revision 拒绝 |
| onLocalUpdate(fn) | 仅本地实际 Yjs bytes；返回取消订阅函数 |
| subscribe(fn) | origin(local/remote)、revision；不是保存信号 |
| beforeApply(fn) | 远端合并、undo、checkpoint 前同步 flush 视图本地编辑 |
| flush(reason?) / startTextSession(id) | 显式同步视图 / 原生输入的临时 CRDT 分支，不是永久文字范围锚点 |
| applyUpdate(envelope) | 隔离预校验后合并原始 bytes，不产生本地回声 |
| stateVector/diff/checkpoint | 同步摘要、补拉响应、完整原始 CRDT 编码；均不是 ACK |
| undo/redo/canUndo/canRedo | 仅当前模型会话的本地操作 |
| find/replace/replaceAll | 字面搜索、大小写选项、revision 失效保护、单事务批量替换 |
| captureAnchor/resolveAnchor | epoch + 稳定元素 IDs；返回 valid/partial/存活 IDs |
| setReadOnly/dispose | 阻止本地命令、释放监听/模型；只读仍接收远端 |

## 冲突规则

元素为 `Y.Map<id,Y.Map>`，各顶层属性为独立 key，纯文本使用 Y.Text。

| 操作 | 规则 |
| --- | --- |
| 新增 | UUID 不相交则全部保留；正式命令禁止复用已出现的 ID（含 tombstone） |
| 删除 | tombstone 与属性独立，删除优先于并发修改/移动；子树删除只包含当时已知后代；并发新子节点保留并提升至根 |
| 属性/移动 | 不同元素/顶层属性独立合并；同属性由 Yjs 因果顺序和 client ID 确定胜者，与网络到达顺序无关；x/y 独立，可能组合两人的坐标 |
| 嵌套 JSON | data/fill/path 等对象和数组是顶层属性的原子值，不合并其内部子字段 |
| 父级/分组 | parent+rank 为原子 placement；子元素属性仍可并发编辑；父级缺失或并发父级环以确定性投影提升到根，不产生修复写入 |
| 顺序 | 数值 rank，中间插入取中间值，相同 rank 用 ID 排序；重排可能影响多个同级 placement；确定性收敛但不保证满足双方全部排序意图；精度耗尽明确抛错，无隐式全局重编号 |
| 文本 | Y.Text 保留同位置的并发插入，按字符身份合并交叠删除；UI 字符串变化转为公共前后缀之间的 splice |
| 撤销 | Y.UndoManager 只跟踪当前会话 origin；不恢复旧快照覆盖他人属性。撤销本人新增会使整个元素及别人的后续编辑不可见；撤销本人删除可恢复 ID 与期间合并的属性 |

模型 place 不自动计算坐标转换；UI 分组/解组由 Leafer 计算变换后通过 applyScene 原子提交。并发重设父级和变换会收敛，但复杂变换的视觉意图不保证一致。

## 本地差量 / 保存 / 恢复

```ts
model.onLocalUpdate(update => hostOutbox.enqueue(update))
// { protocolVersion:1, codec:'aidcanvas-yjs', schemaVersion:1,
//   epochId, id, update: Uint8Array }
model.applyUpdate(remoteEnvelope)
```

回调为实际差量 bytes，不是快照。需在挂载 UI 前注册；宿主同步入队且不得抛错，保留相同 ID/bytes 直到数据库提交后的 ACK。重复合并幂等，但 seq/审计/通知/同 ID 异 payload 去重属于宿主。

UI 120ms 聚合本地编辑；远端应用前 beforeApply 同步 flush。因此尚未 debounce 或未发送的本地编辑先进入 CRDT，再合并远端。投影按 ID 更新存活节点，保持 App、viewport、selection。初始化、资源解析、根级平移缩放、选区和默认行高补齐不产生本地更新。宿主撤权/只读切换前应 handle.flush() 将已发生编辑交由平台处理，之后变更 mode；服务端仍复查 ACL。

重连先 applyUpdate(diff(vector))，再重试原 ID/bytes。diff 可包含历史 delete set，但不进入 onLocalUpdate。saveStatus 以宿主 ACK 为准。示例 BroadcastChannel receipt 仅表示对端接收，不是 durable ACK。

checkpoint 保存 Y.encodeStateAsUpdate 原始身份；恢复用 Y.applyUpdate。压缩只更新 checkpoint 和宿主 seq，不改 epoch，不从 JSON 重建；旧客户端晚到更新仍可合并。switchCanvasEpoch(previous,newCheckpoint,pendingUpdates) 要求新 epoch 且 pendingUpdates=0，返回新模型并保留旧模型供恢复。宿主先确认或导出未保存工作，再显式更换 model。未知 codec/schema/document.version 拒绝；目前无不兼容 schema 转换器。migrateCanvasValue 仅补齐旧 document.version=1 的 ID。

applyUpdate 在隔离副本验证合并结果，失败不污染活模型。限制：单更新 16 MiB、10,000 个元素（含 tombstone）、JSON 64 层。支持 Rect/Ellipse/Line/Path/Polygon/Star/Text/Frame/Group/Image/Arrow。校验不能代替 ACL、频控、资源隔离和原子数据库事务；恶意结构/大规模性能未完整压力测试。

## 资源、presence、锚点

协同 Image 必须提供 data.resourcePath；持久化 url/sourceUrl 均为稳定 path。展示用 resources.resolveUrl；下载必须 resolveDownloadUrl 或宿主完全接管。旧 Data URL/CDN 图片须先由宿主上传并替换为资源 path，再初始化模型。

sessionId 和 remoteSelections 由宿主给定，每条 `{sessionId,userId,name,color,elementIds}`；只排除当前 session，不排除同 user。边框和操作人标签基于元素 ID 跟随；onPresenceChange 125ms 节流，只发 ID，无内容。失焦/只读发布 null；断线、撤权、TTL 由宿主清空远端数组。包不生成身份/颜色，也不订阅第二个房间。

已实现元素级评论锚点捕获/解析：删除后 valid=false，部分删除 partial=true，epoch 变化失效。0.3 提供 anchors/activeAnchorId/onAnchorClick 常驻标记与高亮；正文和文字内部永久范围锚点尚未提供。

## 限制

- 纯文本 CRDT；无富文本 span、字符级远端光标、全平台 IME 并发选区保持保证。Chromium composition 的保真与本人撤销有自动化覆盖。
- 自定义元素必须采用支持的基础 tag/JSON 属性。data.atomic=true 的 Text 不参与搜索；不保证任意插件 codec 兼容。
- Node 不渲染位图；复杂旋转组解组须原生适配。精度耗尽不自动压缩排序 rank；大量 tombstone 需规划新 epoch。
- 图片有取消/错误/晚到保护，但无上传占位排序、进度 UI 或重试队列。
- 持久离线 outbox、数据库 ACK、服务端去重、Doca ACL/资产服务、生产级恶意流量隔离均未在本仓库实现或联调。
- 旧 CanvasCollaborationProvider/onLocalTransaction 仍为快照兼容接口，不是完整多人 CRDT；Doca 应使用 model.onLocalUpdate。
- Yjs/lib0 首次模块导入会读 production/no-color/node_env 三个诊断键；本包不持久化内容或偏好，组件挂载后的测试为零 storage 访问。

测试明细见 TEST_RESULTS.md，可运行示例见 examples/doca 与 examples/server.mjs。
