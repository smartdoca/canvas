# Doca 0.3.1：手绘持久化与接入

## 已实现的持久化边界

```ts
import { toPersistedCanvasScene, type SceneNode } from 'aidcanvas/model'
// 正式无 DOM 导出；返回新对象，不修改输入。
const persistent: SceneNode = toPersistedCanvasScene(nativeScene)
model.applyScene(persistent, lastProjectedScene)
```

组件内部已自动执行，Doca 不需要新增发送前转换。`initialize/add/patch/applyScene` 也使用同一转换。`getValue/getSelection/onSelectionChange` 与宿主动作 selection 返回参数，不返回手绘缓存。

手绘节点 `data.roughMode=true` 时：`fill` 为 `data.roughOriginalFill`（颜色/合法原始填充，缺省 null），`roughFillStyle`、`roughSeed`、`roughStrokeStyle` 和现有几何/原始路径保持。生成 PNG 仅为 Leafer 视图缓存；checkpoint 恢复和远端投影按参数重建。斜线、交叉、锯齿、点状、实心均支持；切回标准后保留原始颜色。点状使用局部 PRNG，解决依赖库点中心未使用 seed 的问题。相同参数在同一 Chrome 上验证生成相同纹理；不承诺不同浏览器像素抗锯齿逐字节相同。

纹理采用局部几何与节点自身 scale，不使用包含视口和旋转的 world bounds。祖先变换整体变换纹理，不重新随机。纹理分辨率仍限制 48–1024 像素，极大放大可能模糊；手绘图案只对非透明纯色生成，渐变/图片的手绘图案化未支持，实心模式保留合法原始 paint。

模型 `restore/applyUpdate` 不清洗 raw bytes：拒绝 `UNSAFE_RESOURCE_URL` / `NON_CANONICAL_ROUGH_FILL`。已覆盖资源字段中的 data/blob/file/javascript 与带 query/hash 的 HTTP URL；并非通用鉴权或完整恶意 Yjs 历史字节扫描，宿主仍保留严格资源安全检查。真正的 Image 仍保存 `data.resourcePath`，展示走 resources.resolveUrl，下载走 resources.resolveDownloadUrl；不上传手绘临时纹理。

## 正式 UI 声明

```ts
// CanvasEditorProps
layersPosition?: 'left' | 'right' // 默认 right，可动态变化，无实例重建
hostActions?: CanvasSelectionAction[] // 独立顶部，不依赖选区、showHeader 或 showToolbar
selectionActions?: CanvasSelectionAction[]

// CanvasSelectionAction 新增；现有 id/label/icon/visible/onClick 不变
allowInReadOnly?: boolean // 默认 false，由宿主根据评论权限明确授权
disabled?: boolean | ((selection: CanvasElement[]) => boolean)
tooltip?: string
```

可编译示例：`examples/doca/DocaCanvas.tsx`。可运行示例：`yarn dev` 后打开 `/examples/doca/`。只读仍可鼠标/图层选中元素；仅 `allowInReadOnly=true` 的宿主动作显示，内建复制/修改/删除/图层修改按钮不渲染，命令入口继续阻止内容修改。动态 disabled 与 tooltip 由 React props/选区更新。权限验证和评论正文始终属于宿主；回调错误交给 onError。顶部动作即使无选区和内建 toolbar 隐藏也可显示，图标接受 ReactNode。

元素评论：稳定元素 ID 锚点、常驻标记、部分删除幸存覆盖和只读定位已实现。文字内部永久范围锚点和字符级远端 presence **未实现**；不要保存字符串下标作为永久评论范围。此版本不改变既有中文组合输入能力边界。

## 保存、失败与关闭

宿主管理模式没有包内网络/outbox。`onLocalUpdate` 交付新事务原始 ID/bytes；宿主原样持久入队，只有 durable ACK 能移除。拒绝必须保留队列并传 `saveStatus="error"`；checkpoint/flush/dispose 不是 ACK。退出顺序保持：在本地订阅仍挂载时 flush/卸载编辑器 → checkpoint → 宿主持久化 checkpoint/outbox → dispose/移除订阅。浏览器强杀保障依赖宿主持久队列。

## 旧非法待发送内容：独立、显式恢复流程

升级不会迁移数据、清空队列、修改旧事务 ID 或重写旧 Yjs bytes。安全的原始 schema-1 checkpoint 保持原 CRDT 身份直接恢复。已包含非法纹理的 checkpoint 不能靠把当前 fill 改成颜色再 checkpoint 来证明历史 bytes 已清洁，也不能跳过第一条失败消息继续发送依赖它的增量。

1. 宿主暂停该会话发送，显示失败；原 outbox（含每个 ID/bytes/hash）、原 checkpoint/hash、最后已接受基线分别持久归档，不删除。
2. 在隔离的旧运行时读取待恢复 scene，不加载到当前协同文档。必须保留修改之前的已接受本地投影；基线缺失/依赖无法闭合时停止自动恢复，提供人工差异导出。
3. 用 `CanvasModel.restore(最新合法权威checkpoint)` 创建隔离候选副本。审核 `toPersistedCanvasScene(待恢复scene)` 相对基线的语义差异；通过正式 `applyScene(next, base)` 生成 **新 ID/bytes**。不要 initialize(scene) 重新生成现有协同文档，更不能给新 bytes 复用旧 ID。
4. 同字段冲突、删除/层级冲突必须由宿主或用户明确决策。含本地文字修改的队列不适合此快照重放：需单独恢复文字操作身份或人工合并，不能覆盖远端 Y.Text。候选产生的新事务需正常校验、授权与 durable ACK；ACK 前不称已保存。
5. 宿主记录旧队列到新事务的恢复审计关系，经显式确认后结束隔离会话；原归档继续保留。这不是自动丢弃 outbox，也不允许旧隔离 checkpoint 再混入在线会话。评论 ID 仍可基于幸存稳定元素 ID 复核，不跨 epoch 偷换锚点。

可验证演练：`node examples/recover-rough-fill.mjs`。模拟非法填充 + 后续依赖旋转更新 + 权威端并发文字；检查原 queue/checkpoint 哈希不变、新事务不含临时 URL、保留远端文字、重复应用新事务幂等。只输出候选审计结果，不访问 Doca、不发送、不 ACK、不清空队列。它是受控恢复示例，不是通用坏数据修复器。

测试记录见 TEST_RESULTS.md。交付为 npm 可安装 tgz，未发布公共 registry；许可证仍 UNLICENSED。
