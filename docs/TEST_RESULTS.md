# 验证记录

## 0.4.1 性能优化（2026-09-13）

静态检查、库构建、示例类型检查通过；模型28/28、Chrome27/27通过（84.84秒，含60秒真实静置零写入）。新增定点patch等价/原子校验、稳定ID锚点无全场景枚举、虚拟图层滚动及编辑、万元素导出性能及零写入保护。原PNG/SVG复杂文件输出哈希与0.4.0完全相同。

100～10000元素前后对比、图片/密集手绘测量及限制见 [性能报告](PERFORMANCE_0.4.1.md) 与 [原始数据](performance-0.4.1-results.json)。以上为源码构建验收；实际安装包的验收和哈希另在包外交付清单记录。性能优化没有绕过远端原子校验、改变epoch或清理outbox。

## 0.4.0 第一阶段（2026-09-12）

环境：macOS、Node 24.15.0、Chrome 152、Playwright 1.63、Yjs 13.6.27。源码静态检查、库构建、Doca/导入导出示例类型检查通过；模型 **26/26**、浏览器 **25/25** 通过（约82秒，含真实60秒静置）。安装包的独立消费验证及最终哈希另见交付清单，不以本段源码测试冒充安装验收。

| 本次验收 | 实际覆盖 / 结果 |
| --- | --- |
| 真实图片输入 | 浏览器实际编码 PNG/JPEG/WebP + 中文 emoji SVG；真实头/MIME/扩展名、120×60尺寸、200×100 contain插入、视口中心；通过 |
| 插入与协同 | 每格式一次 local update、undo/redo、同账号双页收敛、对端零回声、立即关闭/checkpoint/重开；模型不含 data/blob；通过 |
| 新建场景 | parse → 宿主上传 → createCanvasImportValue；一个稳定 ID 的 Image/vector 资源描述，当前文档及本地更新不变；通过（未调用真实平台创建服务） |
| 安全与取消 | 伪造后缀/MIME、损坏内容、11MiB、超大尺寸、DTD、循环引用、未知编辑 metadata、预取消；危险 SVG 不发外部请求，脚本/事件/外链被清洗；通过 |
| 异步生命周期 | 上传失败、等待上传期间取消/撤为只读/销毁，完成旧 Promise 后无迟到元素；通过 |
| 宿主入口 | 文件 input、DOM drop/clipboard files 事件共用同一插入；Ctrl+V keydown 不被吞；通过。未自动化操作系统剪贴板权限/原生拖拽管理器 |
| 真实导出文件 | 生成 real-output.png/svg，独立 file:// 页面打开并核对尺寸；中文/emoji/多行文字、旋转分组、描边/常规阴影、实心两端箭头、手绘、位图和整体 SVG 图片；通过，另人工查看 PNG/SVG 截图 |
| 导出无副作用 | 每次比对模型、选区、本地更新数、undo/redo能力、保存状态；全部不变。导出中无评论/epoch/资源path/控制层；通过 |
| 范围与上限 | 空画板、空选区、缺失ID分别报错；全部/选中、嵌套组子选区不含未选中文字；透明首像素alpha=0、指定绿背景RGBA准确、2倍率尺寸正确、超大尺寸/倍率拒绝；通过 |
| 资源与只读 | 只读导出成功；授权读取拒绝、读取挂起时取消明确报错，模型/更新不变；通过 |
| 手绘输出 | 斜线/交叉/锯齿/点状/实心在变换下重复导出完全确定；非实心为真实SVG pattern，不用位图缓存；通过 |
| 协同旧功能 | 16项既有浏览器回归全过，包括60秒零内容/存储写入、远端与本地文本/Chromium组合输入、评论、定位、立即关闭、只读、原outbox拒绝保留；模型26项全过 |

测试源码 `tests/browser/io.spec.mjs`；真实输入/输出及独立查看器截图生成于 `test-results/io-true-vector-SVG-and-PNG-fff86-ages-export-has-zero-writes/`。该目录是忽略的验收产物，不应提交为源码；测试会重新生成文件。

未实现/未验证：第二阶段可编辑 SVG 元素与连接恢复、资产往返、ID引用重映射未实现；当前仅验证明确拒绝及宿主显式降级提示。高级 paint/效果、字体嵌入、任意 SVG 无损、Safari/Firefox/所有原生独立查看器未保证。系统级中文输入法/操作系统剪贴板、Doca真实资产鉴权/持久ACK/创建目录服务、强杀后的宿主持久 outbox 均未在此验证。不得将内存宿主模拟接收回执称为数据库ACK。

## 0.3.1（2026-09-12）

环境：macOS，Node 24.15.0，Chrome 152.0.7977.84，Playwright 1.63，Yjs 13.6.27。未操作真实 Doca 文档或后端；独立消费项目实际安装 tgz（非 workspace 链接）。

- 静态检查、库构建、示例类型检查通过；外部消费者编译新增 props/类型及包内 DocaCanvas.tsx 通过，Vite 生产构建通过。
- 模型测试 **26/26 通过**：新增渲染缓存转换/所有填充风格/复制/撤销/checkpoint，临时资源 URL 本地与 raw restore/apply 拒绝、原模型不变，以及稳定真实图片资源路径回归；既有 24 项全部通过。
- Chrome **16/16 通过**，独立安装包完整运行约 82 秒。所有页面及关闭阶段 console.error/pageerror 均纳入失败断言。

| 手绘与接入验收 | 实际结果 |
| --- | --- |
| 原生复现路径 | 点击矩形工具拖拽创建 → 选中 → 手绘 → 斜线填充 → #ffc9c9；通过 |
| 五类风格及切换 | 斜线/交叉/锯齿/点状/实心，再切回斜线与标准/手绘；颜色/seed/风格和几何保留；通过 |
| CRDT 安全 | 每步检查 getValue、模型投影、每条原始 local update、checkpoint，均无 data:image/blob/临时签名地址；通过 |
| 纹理重建 | 每种风格都立即关闭→checkpoint→恢复；非实心填充重建的 PNG 与该 Chrome 恢复前相同，投影/更新计数不变；通过 |
| 变换/复制/undo/redo/双页 | 旋转32°、非等比缩放、API修改颜色、对端修改描边；复制及本人 undo/redo，双方收敛且保留对端描边；通过 |
| 视口缩放/滚动 | 手绘视图缩放/滚动无内容更新；完整回归另真实等待60秒含选中/缩放/滚动/resize，零内容更新及挂载后零 storage 访问；通过 |
| 拒绝与队列 | 宿主模拟服务端拒绝后 saveStatus=error；立即关闭重开原 outbox ID/bytes 完整保留，不显示已保存；通过（并非 Doca durable ACK 测试） |
| 只读与独立评论权限 | 鼠标选中，允许的宿主评论动作可用，动态禁用/提示可更新；内建复制副本/删除/属性及图层修改按钮不存在，命令不能改内容；通过 |
| 正式布局和顶部动作 | layersPosition左右切换；隐藏内建toolbar、无选区和只读时顶部动作仍可用；图标/提示/禁用有效；handle及ready次数不变；通过 |
| 既有关键回归 | 评论卡片/标记联动、部分/全部删除、嵌套变换定位、并发原生文本、Chromium组合输入/远端插入、只读、立即关闭、同账号不同会话、断线重连、资源适配与CSS隔离；全部通过 |

额外兼容性检查：以用户当前安装哈希 f80fb38d 的本地保留 0.3.0 包，在隔离进程生成合法 checkpoint；0.3.1 恢复后的 raw bytes、投影、元素 ID 与 epoch 完全一致。不对非法旧 checkpoint 声称无损自动恢复。

包内 `server.mjs`、`history.mjs`、`recover-rough-fill.mjs` 在外部安装目录执行通过。恢复演练验证非法旧队列及 checkpoint 哈希不变、后续依赖修改不丢、产生新 ID/bytes、保留远端文字，并重复应用新事务验证幂等；不发送、不 ACK、不删除任何真实队列。

警告/限制：消费项目主 JS 约775kB（gzip242kB），有500kB体积提示和既有Leafer peer metadata警告；Node24运行Yjs/lib0示例可能出现 localStorage 实验性接口诊断，不代表模型建立本地存储。系统级原生输入法候选窗/所有浏览器像素一致性、Doca真实鉴权与持久ACK、强杀后的宿主outbox持久性未在本仓库验证。永久文字范围锚点、字符级presence、渐变/图片的手绘图案化、同epoch整篇回滚仍不支持。

以下为历史版本测试记录。

## 0.3.0（2026-09-12）

使用隔离模型和独立安装的 npm tgz 消费项目，不访问真实 Doca 文档、数据库或资源服务。

- `yarn run check`、`yarn check:examples`、库构建通过。
- 模型/打包测试：24 项通过，含既有 16 项回归、严格入口验证、未闭合 struct/delete 依赖拒绝与有序重放、原生文本分支、关闭前 flush、历史原始身份恢复、0.2.0 schema-1 checkpoint、空白画板恢复与首次并发、全部 CSS 选择器/keyframes 范围审计。
- Chrome：13 项通过；包含独立安装包上的完整执行，约 75 秒。已将 console.error / pageerror（含关闭页面期间）纳入失败断言。

| 本轮要求 | 实际覆盖及结果 |
| --- | --- |
| 常驻评论双向联动 | 标记点击激活宿主卡片；卡片定位并激活标记；不伪造编辑选区，不产生内容更新；通过 |
| 分组/变换定位 | 两层嵌套 Group、不同旋转与非等比缩放、离屏大对象；实际装饰框落在可视 padding 内；只读也通过 |
| 部分/全部删除 | 对端删除后只覆盖幸存元素；点击回调只含幸存 IDs；全部删除和 resolved 后移除；通过 |
| 中文组合输入 | Chrome DevTools imeSetComposition + insertText；远端插入期间保留候选 DOM；候选拼音零本地更新；确认合并、本人 undo/redo 不覆盖远端、重开保留中文；通过 |
| 并发原生文字 | 原生输入尚未 debounce 时远端插入；双方内容保留，输入框与焦点不消失；本人撤销保留远端；通过 |
| 只读与输入生命周期 | checkpoint 主动结束 composition 后切只读；只读无文本输入框；远端删除输入中的元素不复活；通过 |
| 立即关闭重开 | 原生属性修改与正在编辑的中文输入未等 120ms，立即卸载、checkpoint、dispose、restore、重新挂载；最后一次已送达输入及稳定 ID 保留；通过 |
| 新建文字 | 空白处双击，首次输入前获得稳定模型 ID；中文输入关闭重开保留；只读双击不能创建临时原生文字；通过 |
| CSS | 宿主 .brand/.toast/.i-icon 不受影响；包内全部 CSS 选择器和动画作用域审计通过 |
| 空闲及旧协同回归 | 同账号双页面、本人撤销、断线重连、只读、资源取消与下载拒绝；真实等待 60 秒并选择/缩放/滚动/resize，零内容更新、挂载后零 storage 访问；通过 |

安装验证：tgz 实际安装到独立临时目录，非 workspace 链接。执行包内 server.mjs/history.mjs 均通过；外部项目编译新增评论/定位/历史/文本分支类型与 DocaCanvas.tsx 通过；Vite 生产构建通过。浏览器完整回归直接运行安装包内示例，并核对最终交付的 dist JS/CSS 与验收版本一致。

构建警告：含 React/Leafer/Yjs 的示例主 JS 约 772 kB（gzip 241 kB），触发 500 kB 提示；Yarn 仍报告 Leafer 插件 peer dependency 元数据警告，当前消费项目可构建运行。Yjs/lib0 导入阶段的三个诊断配置读取没有被冒充为零；零 storage 指编辑器挂载后。

明确未验证：macOS/Windows/Linux 系统原生输入法候选窗及复杂多行/双向文本 caret、真实 Doca durable ACK/ACL/数据库原子回滚与跨所有会话的 epoch 屏障、大量评论重叠/性能和恶意 CRDT 压测。永久文字范围锚点、字符级远端 presence、同 epoch 历史回滚不支持。React 卸载/已送达 DOM 的输入测试不是浏览器强杀后持久 outbox 保证。

用户报告的 0.2.0 SHA-1（4b5f2fb78c49c200635718c3da2c7db0876f40dc）不在本地现存产物中。已用本地保留 0.2.0（c95611e949aed206ecd48fda27b74b7f1ff104d4）生成真实 checkpoint fixture 验证身份恢复，不宣称二者字节相同。

下文为 0.2.0 历史验收记录，不代表本版仍缺少评论装饰/定位能力。

# 0.2.0 验证记录

测试使用新建隔离模型、内存宿主与独立 Chrome 页面，没有访问真实 Doca 文档或服务。

## Node 模型测试

`yarn build:lib && yarn test:model`：16 项通过，0 失败。测试源码：tests/model.test.mjs。

| 覆盖 | 结果 |
| --- | --- |
| Node 无 window/DOM 导入、初始化无本地事件、checkpoint 身份往返 | 通过 |
| 不同元素/属性并发，同属性不同网络顺序 | 通过 |
| Y.Text 同位置插入、删除、本人 undo/redo 不覆盖对端 | 通过 |
| 删除赢并发属性修改，10 次重复补拉无本地回声 | 通过 |
| 断线本地待发，先补拉再以原 ID/bytes 重放，重复投递 | 通过 |
| 分组/解组、父级变化、并发父级环、同时新增和排序 | 通过 |
| 原始 checkpoint 压缩后恢复并合并晚到增量 | 通过 |
| epoch/schema/非法内容拒绝且活文档不变 | 通过 |
| 只读命令拒绝、允许远端、过期搜索结果拒绝、批量替换一次撤销 | 通过 |
| UI scene 差量、根级 viewport 不写入 | 通过 |
| 稳定图片 path、同用户不同 session 保留、删除锚点失效 | 通过 |
| 原子分组/解组保留对端属性和元素锚点 | 通过 |
| epoch 切换待确认保护、原始 URL 图片拒绝、非法 ID 无部分写入 | 通过 |

## Chrome 浏览器验收

`yarn test:browser` 使用本机 Chrome、两个独立页面、同一账号不同 sessionId；源码 tests/browser/collaboration.spec.mjs。

1. 原生编辑尚在 debounce 时接收对端属性修改：两边修改保留；本人撤销不清对端填充色。模拟断线/重连后收敛。只读拒绝删除/新增/替换/双击创建，恢复编辑后同一 App canvas、同一 handle，onReady 次数仍为 1。
2. 同 user 的另一 session 显示边框和用户名；只读清除展示与本地 presence。
3. 真实等待 60 秒，并执行选择、缩放、滚动、调整窗口：本地内容更新 0；挂载后 storage 访问 0；onReady=1。不是虚拟时间测试。
4. 原生分组/解组保留稳定子元素 ID，与对端属性编辑合并；模型 replaceAll 和本人撤销同步至另一页面。
5. 图片上传在只读切换时 abort 且晚到响应不插入；资源 path 往返不含展示 Data URL；下载解析器拒绝时错误正确上报，无默认下载绕过。

完整执行结果：5 项通过，0 失败（约 69 秒，包含真实 60 秒等待）。Yjs/lib0 首次模块导入的 production/no-color/node_env 三次诊断读取单独记录，零 storage 断言覆盖编辑器挂载、运行和模式切换；不声称依赖模块初始化完全不读取浏览器配置。

## 构建与示例

- `yarn run check`：ESLint 和显式 src TypeScript 项目检查。
- `yarn check:examples`：DocaCanvas.tsx 与 session.ts 按实际导出声明编译。
- `node examples/server.mjs`：直接使用 aidcanvas/model，在 Node 合并两人的属性并恢复 checkpoint。
- `npm pack`：最终安装包包含 ESM 主入口、无 DOM model 子入口、CSS、声明文件、文档和示例。
- 将 0.2.0 tgz 安装到独立临时项目（不是 workspace 链接）：安装成功；执行包内 server.mjs 成功；外部项目导入 props/model/anchor/update 类型与包内 DocaCanvas.tsx 均通过 TypeScript 检查；Vite 生产构建成功。
- Chrome 打开该独立安装项目：实际渲染 2 个 canvas、无 pageerror；外部 className/style/theme 生效（height=600px，背景 rgb(248,248,252)）。
- 外部构建包含 React/Leafer/Yjs 后主 JS 约 757 kB（gzip 236 kB），触发 Vite 大于 500 kB 提示；不是安装或构建失败。Yarn 提示 Leafer 插件的 peer dependency 元数据警告，当前安装和构建可运行，未覆盖所有包管理器/框架组合。

## 验证边界

内存宿主的 receipt 只代表对端收到，不是数据库提交后的 ACK。模型重复投递/重连测试不等于 Doca 的真实 lost/delayed/duplicate durable ACK 验收；宿主数据库、权限撤回、禁用账户、身份伪造、资产服务、邀请、评论正文和通知未联调。IME 同时输入时的 DOM 光标保持、复杂旋转组并发视觉意图、大规模/恶意 CRDT 性能未验证。

生产接入仍须运行 Doca 的真实 ACK/ACL/资产接口验收，并保留原 ID/bytes 直到精确持久 ACK。此包未实现 IndexedDB 离线 outbox。
