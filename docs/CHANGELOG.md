# 变更清单

## 0.4.1（2026-09-13）

- 图层超过100行后使用可见窗口及预留行，仅挂载约30行控件；保留滚动、选中、隐藏/锁定、删除和本人撤销行为。
- model.patch仅校验和修改目标元素，不再读取/复制整张画板；仍在进入单一本地事务前完成相同的严格校验，文本仍使用Y.Text。
- resolveAnchor直接读取稳定ID及删除状态；getValue构建同级列表改为线性追加，保持排序、孤立父节点/环的原有语义及返回副本隔离。
- SVG/PNG只在脱离编辑器的导出副本完成一次布局后复用几何，避免每个getter重新布局整棵树。适配绑定Leafer2.1，需随其升级复验。
- 新增100/1000/5000/10000元素基准、图片/手绘复杂度基准、万元素导出回归阈值、虚拟图层和模型定点修改测试。schema/epoch/原outbox不变。

## 0.3.1（2026-09-12）

- 修复手绘 PNG 缓存写入 fill.url 后被快照送入 CRDT 的 P1。新增无 DOM `toPersistedCanvasScene`，原生快照、模型场景适配与公开选区输出统一为绘制意图；不改已经产生的 Yjs bytes。
- 按局部几何与元素 scale 重建纹理，不采用包含视口缩放/旋转的 world bounds。修复 Rough.js 点状填充未完整使用 seed，改用局部确定性圆点生成。
- 模型拒绝资源字段中的 data/blob/file/javascript 与携带 query/hash 的 HTTP 地址；图片仍需宿主稳定 resourcePath。原始增量与 checkpoint 不会自动清洗；安全合法性不能替代宿主资源权限验证。
- 新增 layersPosition（默认 right）、独立顶部 hostActions；selectionActions/hostActions 增加 allowInReadOnly、disabled 与 tooltip。只读可选中并调用授权评论动作，内建修改/删除控件不渲染。
- 新增真实 Chrome 手绘路径用例、逐种纹理恢复一致性验证、拒绝状态与队列保持验证，以及只读动作/图层切换测试；新增隔离恢复演练。
- 保持 aidcanvas-yjs/schemaVersion=1，不要求迁移用户数据、epoch 切换或清空旧队列。已包含非法纹理的旧 raw checkpoint/update 会失败关闭，需要单独恢复审批。

## 0.3.0（2026-09-12）

- 新增 anchors/activeAnchorId/onAnchorClick：常驻金色评论标记、受控高亮、只读点击、部分删除及解决状态处理。
- 新增 revealElements/revealAnchor：嵌套变换定位与视口适配，不伪造编辑选区；隐藏/缺失目标有返回值。
- restore/apply 严格拒绝未知根、非法模型字段/类型和未闭合依赖；导出 CANVAS_ELEMENT_PROPERTIES，扩展数据限定在 data。
- 修复最后防抖输入在销毁时丢失、远端应用关闭输入框、旧 DOM 文本覆盖远端的问题；组合输入通过临时 Yjs 分支合并，候选文本不被提前发布。
- 自有 CSS 和图标 CSS 全部限定根命名空间，不处理宿主样式。
- 新增 createHistoryRestore：从历史原始 CRDT bytes 构造新 epoch；切换前检查本地 flush 与待确认数据，不从 scene JSON 重建。
- 永久文字范围和字符级 presence 仍标记为不支持，分阶段计划见 DOCA_0.3.md。完整测试记录见 TEST_RESULTS.md。

以下为历史版本记录，并非 0.3.0 当前能力限制。

# 0.2.0 变更清单

## 已实现

- 新增无 DOM 的 `aidcanvas/model` 子入口、Yjs 元素/顶层属性/文本模型、正式 `applyScene` 差量适配器、本人事务撤销与重做。
- 提供原始 checkpoint 恢复、state vector 补拉、epoch 切换保护、旧 v1 JSON 的权威初始化、稳定元素锚点与会话选区类型。
- CanvasEditor 接入模型；远端前 flush 待处理本地编辑，按稳定 ID 更新视图，不用旧快照替换整个协同文档。
- 宿主模式禁用兼容 Provider、自动保存和本地持久化；只读、保存状态、presence 更新不重建编辑器。
- 图片稳定资源 path 持久化；宿主上传、展示解析和下载授权分离，补齐只读/卸载取消及晚到响应防护。
- 公开分组/解组、查找替换/定位、锚点、presence 与模型 props；保留外部样式和工具栏插槽。
- 补充双页面示例、Node 示例、类型化 Doca 宿主边界、16 项模型测试和 5 项真实浏览器测试。
- 修复缺失 findId 插件导致的原生查找失败，以及默认行高/viewport 被误判为内容更新。

## 兼容性结论

包版本升为 0.2.0；JSON document.version 仍为 1。新的 `aidcanvas-yjs` schema 1 不与旧快照 Provider 互通；需权威方迁移成新 epoch/checkpoint，不能让每个页面独立从 JSON 初始化。旧 Provider/快照接口保留但不称作完整多人协同。模型模式禁用 `setValue/applyRemoteValue` 整篇替换。

Node 20+ 使用 `/model`；React 浏览器入口需 client-only。ESM、CSS 和类型声明已打包；未发布到公共 npm，许可证仍为 UNLICENSED。

## 尚未支持

富文本 span、字符级远端光标/永久评论锚点、IME 并发光标保证、嵌套 JSON 字段级 CRDT、任意自定义 tag codec、Node 复杂旋转/缩放组解组、上传进度/重试队列、完整主题变量化、持久 outbox，以及真实 Doca ACK/ACL/资产服务联调。精确冲突规则与验证边界见 [COLLABORATION](COLLABORATION.md) 和 [TEST_RESULTS](TEST_RESULTS.md)。
# 0.4.0 — 图片导入 / PNG 和 SVG 导出（阶段一）

- 新增浏览器 `aidcanvas/io`：能力清单、真实类型/尺寸校验、SVG 白名单/引用图防护、解析资源描述、新文档初值构造和脱离编辑器的文件转换。
- 新增 `insertImageFile` 单次本地模型操作，支持取消、进度、稳定资源与生命周期检查；宿主 picker/drop/paste 复用，保留浏览器粘贴事件。
- `exportFile` / typed `exportImage` 返回文件而非触发下载，支持全部/选中、背景、倍率、尺寸上限；真实矢量路径、文字、箭头、手绘及内嵌资源，明确有损警告。
- 新增 `resources.readImage`、头部导入/导出宿主回调；移除独立 JSON 文件 UI。File/Blob 导入不再回退旧 data URL 存储。
- 新增可复制宿主示例与真实文件浏览器验收。schemaVersion 仍为 1，不更换 epoch/不迁移用户数据。
- 可编辑 SVG 第二阶段未实现：能力 false、保留数据请求明确报错；详见 IMPORT_EXPORT_0.4.md。
