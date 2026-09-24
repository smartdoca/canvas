# Doca 接入补充：0.3.0（2026-09-12）

本版保持 `aidcanvas-yjs / schemaVersion=1` 编码，不新增网络、身份、评论正文、上传鉴权或 ACK 服务。React/DOM 评论装饰与后端 Node 模型仍分入口。不是所有平台文字范围能力都已经完成。

## 常驻元素评论与双向联动（已实现）

```tsx
import { CanvasEditor, type CanvasAnchorDecoration, type CanvasEditorRef } from 'aidcanvas'
import type { ElementAnchor } from 'aidcanvas/model'

// 由 Doca 维护：正文、解决状态、权限与 activeId。
const anchors: CanvasAnchorDecoration[] = comments.map(c => ({
  anchorId: c.id, anchor: c.anchor, resolved: c.resolved, label: `查看评论 ${c.id}`,
}))
<CanvasEditor model={session.model} ref={editorRef}
  hostManaged mode={canEdit ? 'edit' : 'readonly'}
  anchors={anchors} activeAnchorId={activeId}
  onAnchorClick={({ anchorId, elementIds }) => openCommentDrawer(anchorId, elementIds)} />

// 卡片 -> 画布；setActiveId 由宿主管理，不修改编辑器选区。
function activateComment(id: string, anchor: ElementAnchor) {
  setActiveId(id)
  return editorRef.current?.revealAnchor(anchor, { padding: 48, maxZoom: 1 })
}
```

`CanvasAnchorDecoration = { anchorId, anchor, resolved?, label? }`；`onAnchorClick` 返回 `{anchorId,anchor,elementIds}`，elementIds 只含当前存活元素。anchorId 必须在数组内唯一。解决状态为 true、从数组移除、全部元素删除、epoch 不匹配时均不画标记；部分删除只包围幸存元素。默认金色虚线，激活为双线/浅底，与原生紫色选区及远端实线框分离。只读仍绘制、激活、点击；不发布编辑 presence。

无正文、用户卡片、自动评论同步。标记不自动聚合避碰；多条评论指向相同对象时可能重叠，宿主可用卡片定位。文字内部永久范围不在本 API 中。

## 正式定位接口（已实现）

```ts
handle.revealElements(ids: string[], options?: CanvasRevealOptions): CanvasRevealResult
handle.revealAnchor(anchor: ElementAnchor, options?: CanvasRevealOptions): CanvasRevealResult
// options = { padding?: number, maxZoom?: number }；默认 48px、最大缩放 1。
// result = { revealed, elementIds, missingIds, hiddenIds, bounds? }
```

按节点实际 world/render bounds 合并并适配视口，考虑嵌套分组、旋转、缩放和已有平移。图层面板是否展开不影响定位。只改变 viewport，不调用 select、不打开组、不修改 visible/locked、不发布内容更新。bounds 为定位后画布视口坐标。

隐藏元素/隐藏祖先列入 hiddenIds，不擅自修改内容让其可见。缺失、全部删除、过期 epoch 返回 revealed=false。Frame 裁剪、遮挡关系不会被取消：定位几何范围不保证被遮挡部分变为可见。没有图层树自动展开事件；目前内置树本身未提供折叠状态。

## 原生文本与文字范围边界

已实现：普通 Y.Text、原生文本输入的临时 CRDT 分支、远端合并后同步输入框、相对字符身份映射临时光标；组合输入期间保留候选 DOM，确认时产生字符差量，避免旧 DOM 字符串覆盖远端。未确认的候选拼音不因远端收包/定时防抖而发布。撤销组合输入不撤销远端文本。

`startTextSession(elementId)` 返回 `commit(text)`、`sync(selection?)`、`dispose()`，用于原生输入适配；`selection={anchor,focus}` 是当前 DOM 的临时 UTF-16 坐标，sync 内部用 Yjs 相对位置转换。**不得将此数值结构或 find 结果持久化为评论范围。** 分支须在开始输入、尚未修改 DOM 时创建，结束后释放；不承担网络。默认 React 组件自动管理它。

能力声明：`textRangeAnchors=false`、`characterPresence=false`。后续分阶段：

1. 当前阶段：元素级永久评论、框选 presence、Chromium 组合输入保真测试。
2. 计划：正式文字范围锚点 codec（元素 ID + 序列化相对点、边界关联策略、全部/部分删除语义、校验与跨恢复政策）。不得用当前下标替代。
3. 计划：字符级远端光标/选区绘制、自动换行/变换位置映射及 Windows/macOS/Linux 原生中文输入法矩阵。

目前的 Chromium DevTools composition/insertText 自动化不是操作系统候选窗测试；没有全平台 IME 光标保证。多行/复杂双向文本 caret 的 DOM 映射尚未完整验收，富文本 span 不支持。

## 严格模型入口（已实现）

restore/apply 拒绝未知共享根（仅 meta/elements）、未知 meta/元素容器/placement 字段、非法容器类型、非法属性类型、富文本 attributes/embed、嵌套 Yjs 值以及未闭合 pendingStructs/pendingDs。apply 先在独立副本验证，再合并活文档。数据字段先通过本地校验，非法本地 props 不能部分写入。

`CANVAS_ELEMENT_PROPERTIES` 导出允许的顶层属性名；业务扩展仅放 `data`，仍为原子 JSON 值。限制为单更新 16 MiB、10,000 元素（含 tombstone）、嵌套 JSON/父级深度保护 64。并发父级环仍按既有规则确定性投影，不增加修复事务。

`UNRESOLVED_UPDATE_DEPENDENCIES` 表示宿主需要补拉缺失依赖后再以原 ID/bytes 重放；包不缓存非法/不完整更新，不应 ACK 成功。历史 checkpoint 必须是闭合状态。此收紧不改变 wire schema，但过去夹带未知字段或缺依赖的输入会被拒绝。应用者应先校验存量 checkpoint。ACL、频控、身份与事务原子落库仍由 Doca 负责；不声称完整抗恶意流量压测。

## flush / checkpoint / dispose 顺序（已实现）

`handle.flush()` / `model.flush()` 同步提交最后的原生文本与 120ms 防抖编辑。`checkpoint()` 先 flush 再编码；`dispose()` 在本地订阅者仍存在时先 flush，再清理模型，重复 dispose 无副作用。React 卸载先结束原生输入，再 flush，最后销毁 App。远端/补拉仅提交已确认输入；显式 flush/checkpoint/undo/dispose 若发生在 composition 中会结束原生输入框，将当时已送达 DOM 的候选作为普通文本提交，不代表操作系统未送达的候选已被保存。

推荐宿主顺序：

```ts
// 监听 local update 的同步入队函数仍保持注册，且不得抛错。
const recoveryCheckpoint = session.model.checkpoint() // 已包含最后防抖输入
await doca.persistRecoveryOrAwaitExactAck(recoveryCheckpoint) // 宿主选择可靠保存策略
unmountEditor()
session.dispose() // 示例已改为先 model.dispose，再取消本地订阅
```

不要先取消 onLocalUpdate 或丢掉 outbox 再 dispose。checkpoint 含本地未 ACK 内容，不等于服务器提交。浏览器崩溃/强杀不保证卸载事件，持久 outbox 仍是宿主责任。撤权前主动 flush 已发生输入，再改 mode；服务端决定是否接受。见 `examples/doca/session.ts` 的 prepareClose。

## 历史恢复（已实现：显式新 epoch）

```ts
import { createHistoryRestore, switchCanvasEpoch } from 'aidcanvas/model'
const nextCheckpoint = createHistoryRestore(historicalRawCheckpoint, newServerEpochId)
const nextModel = switchCanvasEpoch(currentModel, nextCheckpoint, pendingOutboxCount)
```

`createHistoryRestore` 从**历史原始 Yjs bytes** 恢复并改写 epoch 元数据，保留历史 CRDT 元素/文本身份，不从 scene JSON 初始化。纯构造函数不操作当前房间、网络或数据库。当前版本不提供同 epoch 回滚事务。

Doca 必须先暂停房间写入、保存回滚前 checkpoint、检查权限并处理所有会话未 ACK 更新，再原子提交新 epoch/checkpoint 并通知所有页面切换。switch 会先 flush；若 flush 新产生内容或 pendingOutboxCount 非零则拒绝，不能用切换吞掉最后一次输入。这个参数无法验证远端会话或服务器 outbox，房间写入屏障仍由宿主保证。

旧模型保留给宿主生成恢复副本，不能把旧队列改 epoch 后重发。新模型拒绝旧 epoch 更新；旧评论锚点因 epoch 不同失效。需要保留评论时由宿主明确审核并针对新模型重新 captureAnchor，不能静默重绑。新模型 undo 栈为空。只读预览直接 `CanvasModel.restore(history)` + mode=readonly，不切换在线房间。

可执行示例：`node node_modules/aidcanvas/examples/history.mjs`。实际结果见 TEST_RESULTS.md。

## CSS / 产物兼容性

构建后的自有样式与 icon 样式全部限定在 `[data-aidcanvas]` 根下，keyframes 有 aidcanvas 前缀；不处理宿主自己的 CSS。保留 className/style/theme，内部类名不改名；外部主题仍可覆盖，不提供 Shadow DOM 双向隔离（宿主全局样式仍可能影响编辑器）。

本轮只交付一个新版本 0.3.0 的 SHA-1 限定文件名，保留旧包回退。用户报告的 Doca 0.2.0 SHA-1 为 `4b5f2fb78c49c200635718c3da2c7db0876f40dc`；本地保留的 0.2.0 产物并非该哈希，未声称对用户那份二进制逐字节验证。编码仍为 schema 1；本轮新 API、严格验证和 CSS 隔离需要 Doca 集成测试。
