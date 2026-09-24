# aidcanvas 0.4.0 第一阶段交付清单

验收日期：2026-09-12。本清单在安装验收完成后生成，作为包外的哈希证明，不嵌入它所校验的 tgz。唯一交付安装包为仓库根目录的 `aidcanvas-0.4.0-9aef0bae817a.tgz`（不是 workspace 链接，也未发布公共 npm registry）。

- SHA-1：`9aef0bae817a709ab35449b66d5634aae63c833c`
- SHA-256：`bb883d757e0f0d1423c4384d326d43028578668bddd25085b37997483a379a11`

```sh
npm install ./aidcanvas-0.4.0-9aef0bae817a.tgz
```

## 实际安装验收

隔离消费目录：`/private/tmp/aidcanvas-030-consumer.ctU2rb`（沿用历史目录名，本次安装版本确认为 0.4.0）。使用离线缓存依赖，实际解包安装上述哈希文件；安装目录的全部 dist 和 examples 与验收源码构建产物逐文件一致。

- 消费项目编译 `CanvasEditorRef.insertImageFile/exportFile/exportImage`、`aidcanvas/io` 类型及两个正式宿主示例：通过。
- 消费项目 Vite 生产构建：通过。含 React/Leafer/Yjs 的示例主 JS 约798kB（gzip251kB），有500kB体积提示；Yarn报告既有 Leafer peer 元数据警告，未阻止构建及运行。
- 实际安装包的 Node `server.mjs/history.mjs/recover-rough-fill.mjs`：全部通过。Node24/lib0诊断出现 localStorage 实验性提示，不代表模型进行存储。
- 浏览器测试直接访问该消费项目内 `node_modules/aidcanvas/examples/doca/main.jsx`，不用源码 alias；**25/25 通过，82.44秒**。所有页面及关闭过程的 console.error/pageerror 均纳入失败断言。
- 库源码静态检查、构建、示例类型检查：通过；模型 **26/26 通过**。这26项运行于 dist，且该 dist 与安装包逐文件相同。
- 与已保留的 0.3.1 包对比，`dist/model.js` 字节完全相同，SHA-256 均为 `f8bdee2bc1b8d0864b8a91883ca40816d2faa2cc4917c08b61ddc8064f32d6e6`。schemaVersion仍为1，不修改旧epoch/锚点/outbox，无需迁移或清空队列。

## 接口、示例和测试文件

- [正式接口、支持清单、错误及完整限制](IMPORT_EXPORT_0.4.md)
- [变更清单](CHANGELOG.md)（同时参见接口文档的兼容性章节）
- [可复制 React 宿主](../examples/io/HostCanvas.tsx)
- [导入为新文档 / 资源读取 / 下载工作流](../examples/io/workflow.ts)
- [可运行双页面宿主](../examples/doca/main.jsx)：源码仓库先 `yarn build:lib && yarn dev`，打开 `/examples/doca/`。
- [真实文件浏览器测试](../tests/browser/io.spec.mjs)；[逐项测试结果与既有协同回归](TEST_RESULTS.md)。

实际文件目录：`test-results/io-true-vector-SVG-and-PNG-fff86-ages-export-has-zero-writes/`，含 input.png/jpg/webp/svg、real-output.png/svg 和 png/svg-independent-viewer.png。测试生成真实文件，并在独立 file:// 页面打开，校验尺寸；已人工查看中文、emoji、分组旋转、手绘、实心箭头、阴影与嵌入图片。该目录、构建产物和 tgz 均被 Git 忽略，不应提交。

| 文件 | SHA-256 |
| --- | --- |
| input.png | `70ab0e983a9a9e676ce3c798b8bd954c18ca414b7e28ae9b130f55335853bd5b` |
| input.jpg | `253431cad5fb1c5694dafd7817be81b25f8c476e13b43f3dd92297d8e85ba6f6` |
| input.webp | `5598c8843013894db4b9ed28c93a056e82e6a5a68643b797fcd08c107b2faf74` |
| input.svg | `052f6e3410968bb85fb47eccc9e3f647086d525c8290af8e21e7283008399c7a` |
| real-output.png | `afe6d711a024473cd5ca46b757d57c94e3fb004c43747c1c71700e5dbee16a14` |
| real-output.svg | `1d9c9ed7a364cbb59b1e1a13731a42fc90a4e72b0d1cbc249a4f5e3d2fa4027f` |

## 兼容性和未完成能力

第一阶段已交付：四种图片整体素材、安全解析、正式单次插入事务、PNG/真实SVG文件返回、取消/进度/宿主资源读取、全部/选中及导出零内容提交。不提供独立JSON文件下载或上传。

宿主需接入 `resources.readImage` 和实际下载动作；`exportImage` 不再返回 unknown/自动下载，不再接受 jpg。File/Blob的旧addImage委托新接口并要求resources，不再回退data URL存储。PNG和SVG对不支持的paint/效果返回有损警告，字体不嵌入。详细项目不可省略，见接口文档。

**第二阶段未交付**：`editableSvgRoundtrip=false`，`preserveEditData:true` 明确错误。不具备原生层/连接关系/可移植资产的完整往返、ID及内部引用重映射。没有把元素级评论宣传为文字范围锚点，也没有恢复旧协同身份的SVG入口。普通SVG中的嵌套data SVG会清洗并警告，不能视为可编辑或完整资产往返。

未在真实 Doca 后端验证持久ACK/权限/资产服务；未覆盖Safari/Firefox、所有原生查看器、系统级中文输入法候选窗和操作系统剪贴板授权。浏览器模拟剪贴板事件、Chromium组合输入测试不替代这些外部验证。

两份 Doca Skill 在本次落实为实际边界：宿主持有上传/读取/下载/权限/ACK，独立转换器无平台业务副作用，模型谱系与未确认队列保持不动。验收依赖上述真实文件和安装运行，而非仅凭 Skill 声明或类型存在。
