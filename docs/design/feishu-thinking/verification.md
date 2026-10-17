# 验收记录 · 2026-10-16—17

所有验收使用当前源码与真实浏览器，预览服务为 `http://127.0.0.1:4179/`。

## 前一轮基础升级记录

以下为本次深度交互升级之前的历史验收；本轮结果另记于文末。

| 检查 | 最终结果 |
| --- | --- |
| `yarn run check`（ESLint + TypeScript） | 最终代码连续三次通过 |
| 37 项浏览器主流程，`--repeat-each=3` | **111 passed**，165.98 秒 |
| 补齐独立 Slate React root 的宿主翻译回调后，4 项富文本专项，`--repeat-each=3` | **12 passed**，20.97 秒 |
| 导图 60 秒静默协作检查 | **1 passed**，63.28 秒；内容值、更新数量和同伴更新数量保持不变；editor handle 与 ready 次数保持稳定 |
| `git diff --check` | 通过 |
| 桌面、手机、模板、图形抽屉、帮助、富文本截图 | 无控制台错误、横向溢出或图片加载失败 |
| 首次进入、插入、抽屉切换 | 实际录屏、三帧与动效探测均已检查 |
| 独立视觉复核 | **9/10**；手机工具栏、入口、模板预览和自动适配遮挡反馈均已修正 |

主流程命令：

```sh
yarn playwright test \
  tests/browser/richtext.spec.mjs \
  tests/browser/thinking.spec.mjs \
  tests/browser/integration.spec.mjs \
  tests/browser/text-editing.spec.mjs \
  tests/browser/whiteboard.spec.mjs \
  tests/browser/layout.spec.mjs \
  --repeat-each=3
```

静默检查命令：

```sh
yarn playwright test tests/browser/thinking-idle.spec.mjs --output=.cache/feishu-idle-final
```

覆盖内容包括导图层级快捷键、布局/主题/折叠、稳定 ID 与复制关系、拖动绑定连线、快捷创建事务、移动后的连接文字、表格连续编辑与 TSV 粘贴、部分文字格式、实际 SVG/PNG 导出、自动保存重载、保存失败重试、只读约束、评论锚点、中文输入候选、远端文字插入、撤销保留同伴内容、卸载重开、宿主 CSS 隔离和手机入口。

本轮没有运行生产构建或全部历史测试。Doca 示例源码测试通过入口拦截使用 `src`，避免误测旧 `dist`。仓库原有 `check:examples` 使用旧包名 `aidcanvas`，与当前 `@smartdoca/canvas` 不一致，本轮未调整该既有配置。

## 本轮深度交互验收

用户进一步要求连线、表格内容操作和单元格选择对齐参考，便签/卡片/单元格支持多行富文本，并移除宿主所属的全局搜索入口。

| 检查 | 最终结果 |
| --- | --- |
| 最后一次源码修改后的 `yarn run check` | 连续三次通过；5.71、5.74、6.20 秒 |
| 54 个浏览器场景，`--repeat-each=3` | **162 passed**，约 3 分钟；命令总用时 183.33 秒 |
| 60 秒静置检查 | **1 passed**，62.41 秒；零内容写入、零同伴回写，handle 与 ready 次数稳定 |
| 浏览器错误 | 所有场景均包含控制台与页面关闭阶段错误断言；无意外错误 |
| 独立视觉复核 | 本轮不打分；两处反馈已修正并复核，未见新的必须修复项 |
| 截图/录屏 | 桌面 1280×720、手机 390×844、2 倍像素细节；进入、拖入创建、行列菜单三组录屏/三帧 |
| `git diff --check` | 通过 |

最终浏览器命令：

```sh
yarn playwright test \
  tests/browser/deep-interactions.spec.mjs \
  tests/browser/richtext.spec.mjs \
  tests/browser/thinking.spec.mjs \
  tests/browser/text-editing.spec.mjs \
  tests/browser/whiteboard.spec.mjs \
  tests/browser/layout.spec.mjs \
  tests/browser/integration.spec.mjs \
  --repeat-each=3 --reporter=line --output=.cache/deep-final-pass
```

新增 17 个深度场景涵盖工具/模板拖入与取消、连接点吸附/换绑/路径拖动与撤销、浮层避让、单元格光标定位与文字拖选/跨格选区、整行列/批量增删、合并拆分与稳定 ID、尺寸拖动、多段富文本与内容撑高、局部取消继承粗体、富文本单元格剪贴板、卡片多段格式、文字/格式/尺寸同事务、同格离线多行合并、本地撤销保留同伴内容、远端插行保持活动格，以及远端删除/合并覆盖当前格时的安全关闭和无回写。

静默检查命令：

```sh
yarn playwright test tests/browser/thinking-idle.spec.mjs --reporter=line --output=.cache/deep-release-idle
```

测试使用当前 Vite 源码；不依赖旧 `dist`。没有运行生产构建、全部历史测试或正式宿主服务器联调。测试不代表逐字符格式 CRDT、所有并发表格结构冲突或通用避障已完成；具体边界见 [深度交互说明](deep-interactions.md)，画面复核见 [评审记录](deep-interactions/review.md)。

## 后续用户实测缺陷修复

对应路径点选/控制点、鼠标随行放置、单元格小型 Slate、错误弹层、折线收敛、单元格双框，以及拖动导图方向后新增子节点回到右侧的反馈。

| 检查 | 最终结果 |
| --- | --- |
| 最终源码 `yarn run check` | 连续三次通过，7.03、5.30、5.71 秒 |
| 63 个相关浏览器场景 × 3 | **189 passed**，约 3.5 分钟；命令总用时 210.10 秒 |
| 60 秒静置与视图操作 | **1 passed**，命令用时 63.74 秒；内容/对端更新数及 handle/ready 次数稳定 |
| 真正逐键输入 | 含空格的连续输入、Enter 多段、格式按钮后继续键入通过；补上此前整体 insertText 未覆盖的问题 |
| 路径收敛 | 12 次连续分段拖动，端点保持绑定，冗余点不增长；重置/撤销通过 |
| 分支方向 | 实际拖到左侧、上方后新增多行子节点，方向和手工位置保留；保存重开通过 |
| 视觉自检 | 文字选择不出现原生矩形框和 DOM outline；跨格才显示范围；预览与落位三帧、路径和分支画面已查看；本轮未另行独立打分 |
| `git diff --check` | 通过 |

命令：

```sh
yarn playwright test \
  tests/browser/interaction-repair.spec.mjs \
  tests/browser/deep-interactions.spec.mjs \
  tests/browser/richtext.spec.mjs \
  tests/browser/thinking.spec.mjs \
  tests/browser/text-editing.spec.mjs \
  tests/browser/whiteboard.spec.mjs \
  tests/browser/layout.spec.mjs \
  tests/browser/integration.spec.mjs \
  --repeat-each=3 --reporter=line --output=.cache/repair-final

yarn playwright test tests/browser/thinking-idle.spec.mjs --reporter=line --output=.cache/repair-idle
```

9 个新增缺陷场景与此前 54 个相关场景一起运行，包含协作字符合并、撤销、只读、输入法、表格行列增删/合并拆分、导出和宿主边界回归。最终记录仅对应固定源码后的完整通过轮次，不计入实现期间主动中止的检查。没有运行生产构建、全部历史测试或正式宿主服务器联调。

实现原因、参考和当前截图见 [交互缺陷修复](interaction-repair.md)。

## 2026-10-17 操作范围修复与完整功能复查

按“随手记录 → 扩展分支 → 串联关系 → 表格整理 → 保存/恢复/导出”实际操作现有功能。修正折线斜段及端口反向接入、元素/单元格/文字的工具范围、无选区残留面板、导图方向和加号、点阵缩放，以及所有文字载体的 Markdown 与超链接行为。完整体验另外发现并修复图片首次插入偏移、图片撤销/粘贴资源解析、文字编辑后误拖内部标签、标题字号倍率、输入法保存视觉前缀和长工具栏被侧栏遮挡的问题。

| 最终源码检查 | 结果 |
| --- | --- |
| `yarn run check`，ESLint + TypeScript | 连续三次通过：15.97、10.69、11.79 秒 |
| 85 个核心浏览器场景 × 3 | **255 passed**；三轮均通过，命令总用时 401.47 秒 |
| 28 个扩展浏览器场景 | **28 passed**；命令总用时 163.60 秒 |
| 覆盖范围 | 共 **113 个独立场景、283 次通过**，涵盖现有全部 18 个浏览器测试文件 |
| 60 秒静置 | 扩展检查内两项均通过；普通场景及导图场景无多余内容写入、回写，handle/ready 稳定 |
| 浏览器错误 | 含页面关闭阶段的控制台与页面错误断言均通过 |
| 画面复查 | 桌面与手机实际看图自检；13 张关键截图已留档，本轮未另行独立评分 |
| `git diff --check` | 通过 |

最终固定源码后的命令：

```sh
yarn playwright test \
  tests/browser/creative-workflow.spec.mjs \
  tests/browser/selection-scopes.spec.mjs \
  tests/browser/deep-interactions.spec.mjs \
  tests/browser/richtext.spec.mjs \
  tests/browser/thinking.spec.mjs \
  tests/browser/text-editing.spec.mjs \
  tests/browser/whiteboard.spec.mjs \
  tests/browser/layout.spec.mjs \
  tests/browser/integration.spec.mjs \
  tests/browser/interaction-repair.spec.mjs \
  tests/browser/connector-label.spec.mjs \
  --repeat-each=3 --reporter=line --output=.cache/canvas-release-core

yarn playwright test \
  tests/browser/alignment-guides.spec.mjs \
  tests/browser/collaboration.spec.mjs \
  tests/browser/io.spec.mjs \
  tests/browser/rough-fill.spec.mjs \
  tests/browser/viewport-navigation.spec.mjs \
  tests/browser/performance.spec.mjs \
  tests/browser/thinking-idle.spec.mjs \
  --reporter=line --output=.cache/canvas-release-extended
```

覆盖创建预览/拖放/取消、八种模板、导图四向扩展与层级快捷键、布局/主题/折叠、连线全路径点选/端点换绑/分段及折点修改/收敛/重置、普通文字/便签/卡片/流程图/导图/单元格的多段 Slate、文字选区与 Markdown/链接、表格范围/行列/尺寸/合并拆分/剪贴板、图片裁剪调色/撤销/副本、画笔路径编辑、吸附/分组/框选/评论、手机/只读/视口导航、资源导入/独立 SVG 和 PNG、自动保存/失败重试/关闭重开，以及本地两页离线合并、远端结构变化和宿主模拟拒绝。

所有宿主示例测试通过公共 fixture 使用当前 `src` 库、model、IO 与 CSS，避免旧 `dist` 造成假通过。实现期间为修复新发现问题而主动中止的运行不计入上述结果。没有运行生产构建或正式宿主服务器联调；格式仍为 schema 1 下 `data.richText` 字段级合并，未宣称逐字符格式 CRDT 或通用路径避障。没有增加全局搜索入口。

本轮是既有交互的缺陷修复，没有新增视觉方向、宣传文案或额外动效；沿用既有创建预览、入口和模板过渡。操作范围、原因及截图索引见 [文字、单元格和元素的操作范围](selection-scopes.md)。

## 同日追加：端点附近线段拖不动、右下角路径错误

用户再次提供截图后，新增实际位移断言，确认原有端点段用例漏查了空拖动。修复首末段的拖动轴、端口引出段的复用与限位、预览手柄位置、旧模板隐式端口，以及原生绘制/选中高亮/导出的派生路径一致性。首次 API 插入也执行原生规范化，避免新插入元素继续绘制旧路径。详见 [端点拖拽修复及 5 张截图](connector-terminal-drag.md)。

| 最终固定源码验证 | 结果 |
| --- | --- |
| 58 个相关浏览器场景 × 3 | **174 passed**，三轮通过；命令总用时 258.67 秒 |
| 9 个 IO + 2 个性能/宿主场景 | **11 passed**，命令总用时 17.34 秒 |
| ESLint + TypeScript | 连续三次通过：16.73、11.72、11.94 秒 |
| 浏览器及关闭阶段错误 | 零意外错误 |
| 看图自检 | 已确认横拖竖段、纵拖横段、连续编辑后的端口接入及旧模板绘制；本次未独立评分 |
| `git diff --check` | 通过 |

本次共 69 个独立场景、185 次通过。端点附近横/竖段用例检查真实指针手势、手柄与路径位移、原生初始路径、操作提交次数、十次连续修改后的点数与正交性、端点绑定、取消及撤销。旧文档通过模型直接注入异常自动/手工路径，避免 API 先行修正测试输入；检查重开和节点移动后的原生路径、选中路径及 SVG，并验证无选择回写。完整相关回归还覆盖导图、表格、多行富文本与本地两页协作。

```sh
yarn playwright test \
  tests/browser/connector-drag.spec.mjs \
  tests/browser/selection-scopes.spec.mjs \
  tests/browser/interaction-repair.spec.mjs \
  tests/browser/deep-interactions.spec.mjs \
  tests/browser/thinking.spec.mjs \
  tests/browser/connector-label.spec.mjs \
  --repeat-each=3 --reporter=line --output=.cache/connector-terminal-final

yarn playwright test tests/browser/io.spec.mjs tests/browser/performance.spec.mjs \
  --reporter=line --output=.cache/connector-terminal-io
```

仅记录最后一次源码修改后的完整通过运行，不计入修复期间的失败或主动中断。未运行生产构建，未扩大宿主 API、schema 或正式服务器联调范围。


## 2026-10-17：共享富文本容器、上传与选区修复

参见 [资源与容器验收](resources-and-containers.md)。最终 87 个交互场景连续三轮、261 次通过；另 29 项宿主/协作/文字与对齐检查、9 项 IO、27 项当前模型源码检查通过。两个性能场景与 60 秒空闲场景通过。lint/TS 三次、示例 TS、diff 空白检查通过。截图与宿主边界、未验收项在该文档中列明。

## 2026-10-17：最新交互范围与对齐收尾

本节取代前述记录中普通文字、流程图和导图使用 Slate 的旧操作范围：便签、卡片和单元格共享 Slate；流程图、导图及普通文字保留原生普通文字编辑。便签改为先选中拖动、再次点击编辑，并提供内容最小高度、12 套预设。对象与单元格统一使用参考图的水平 / 垂直对齐弹层。

参见 [最终交互与对齐验收、截图和边界](interaction-polish.md)。冻结当前源码后，完整 **141 项浏览器测试通过**（275.31 秒）；关键交互 33 项 × 3、富文本与容器 24 项 × 3 均通过。另有当前模型源码 27 项通过，lint/TS、示例 TS 与 diff 空白检查通过。完整运行前后 110 个源码文件哈希一致。重复组有重叠，不累计为独立功能数量。

完整验收包括多单元格拖选与合并、Markdown / 链接、图片与附件上传和宿主预览、媒体连线、自定义元素、撤销位置、折线端段拖动和收敛、导图方向 / 加号、横滑边界、只读、导入导出、两页协作及空闲无回写。物理触控板的系统级历史手势、生产 Doca 资产服务与持久服务端 ACK 未由本地自动化验收；未执行发布包构建或部署。
