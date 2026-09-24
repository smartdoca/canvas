# SDK 边界（0.3.1）

手绘持久化转换、只读评论动作与图层位置见 [DOCA_0.3.1](DOCA_0.3.1.md)。

最新评论装饰、定位、文字范围限制、严格验证和历史恢复契约见 [DOCA_0.3](DOCA_0.3.md)。

浏览器 UI 入口为 `aidcanvas`，无浏览器模型入口为 `aidcanvas/model`，样式入口为 `aidcanvas/style.css`。

模型接入、实际导出、资源接口和 React props 以 [README](../README.md) 为准；并发规则、生命周期和版本迁移以 [COLLABORATION](COLLABORATION.md) 为准。测试证据见 [TEST_RESULTS](TEST_RESULTS.md)。

元素扩展仍使用 `elementExtensions`：工厂返回受支持 Leafer 基础 tag，type 写入 name，JSON 业务属性写入 data。多个顶层属性可以独立并发，但整个 data 是原子属性；不得假设任意嵌套自定义字段拥有独立 CRDT。业务引用只存稳定 ID，鉴权、展示名称、导航、通知由宿主实现。data.atomic=true 的文本元素不参与模型搜索。这里的画板卡片不是 Slate inline/void，不宣称富文本片段序列化能力。

模型模式的 UI 通过 applyScene(next,lastProjection) 将本地变化转为 Yjs Map/Text 差量；远端前先 flush 原生变化，之后按稳定 ID 更新存活节点。保持一个 App、一个已恢复的模型、一个 UI handle。宿主用户/保存/ACL props 不在创建 App 的依赖中。

资源存储与展示分离，资源解析不发布内容。当前不含上传占位排序/进度 UI/自动重试。宿主仍需处理附件权限及服务端拒绝。没有 second socket、autosave 或持久离线队列。

发布包含 ESM、声明、独立 CSS、模型和示例。npm pack 的 prepack 会运行类型/静态检查及库构建；行为测试另外通过 yarn test:model 和 yarn test:browser 执行。UNLICENSED 未变；未执行公共发布。
