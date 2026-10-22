# Container model and native view

Canvas 0.5.11 keeps the authoritative model separate from container helpers generated in the native view. The public API and `aidcanvas-yjs` schema 1 are unchanged.

A current-schema container supplied through `CanvasModel` can contain ordinary drawing children without a stored `frame-title` or Phone hardware. The existing native renderer displays its generated title and, for a Phone, the bezel, camera and device controls. These generated-only parts stay in this editor view. They do not become model children when the document opens, receives a child update, flushes an unrelated edit, or reopens.

Identity reconciliation removes unused children as before. It then refreshes affected container parents and keeps generated-only helpers out of native content snapshots and scene-diff baselines. Titles and hardware already present in the model retain their model IDs and stored properties. Their existing model commands, undo and checkpoint handling continue to apply. Title-generation text is unchanged. Non-Phone titles retain the existing 20px right inset using their actual x origin, so an explicitly positioned right-aligned title remains inside its clipped container; the default x20 title keeps the same width as before.

This fixes two 0.5.10 failures: a model-only content update could remove the visible Phone bezel while leaving its native stroke cleared; a later native flush could attempt to place helper IDs absent from the model, raising a missing-map error followed by `ELEMENT_ID_REUSE`. An automatically generated title on a Web or Board container could cause the same missing-map failure.

No checkpoint, epoch, original update, model schema, historical field, stored JSON or host transport is converted or backfilled. Rollback is a package rollback with the original model/checkpoint preserved; an older renderer may reproduce the fixed display/flush defect.


## Native group state

Leafer opens and closes a group by temporarily changing that instance's `hitChildren` flag. The editor recognizes those exact native group transitions and projects the authored field presence/value into content snapshots, exports, duplicate/clipboard input and public selection payloads. The live native flag still changes so group selection works. It is not removed globally: stored `true`, stored `false`, and an absent field remain distinct.

An explicit `updateSelection` command or model patch for `hitChildren` takes ownership of that field, including a same-value command and an explicit deletion. Ordinary pending content changes are neither flushed nor absorbed into a new baseline by opening/closing a group. Export continues to reject pending local edits without writing or flushing them. No model, checkpoint, field default or persisted format changes are involved.

`tests/browser/group-view-flags.spec.mjs` exercises real double-click open/close, nested groups, read-only views, explicit same-value commands, remote true/false/deletion patches, peer convergence, undo/redo, reopening, clone/clipboard IDs and public selection payloads. Its pending-edit controls inspect the model directly before export rather than calling `checkpoint()`, because checkpoint creation itself flushes the example host.

## Container membership boundaries

Selecting a tool, opening/closing a group, or clicking elsewhere does not reassign container children. Native move, resize and rotation gestures reconsider only the instances actually transformed. Moving a container keeps its untransformed nested subtree intact. Creation uses the same containment and smallest-container rules for the new root; a new container may capture existing content, and a captured container stays one intact subtree, including its authored overflow content.

Traditional draw tools track the instances added during that draw operation, so a content debounce while the pointer is still down cannot erase their creation boundary. Structured creation uses its actual root (for example, the table root while its first cell remains selected). Targeted work consumes only its own instances; a host insertion does not clear another item’s pending drag. These are current-runtime bookkeeping changes, without new model fields or persisted defaults.

`tests/browser/group-membership-gestures.spec.mjs` checks unrelated real drags and new drawings beside overlapping copies, movement of a copied nested container, an API insertion during a held pointer drag, native corner resize, native table creation, intact capture of an overflow container, and a real extension draw paused beyond the content debounce. Peer echo, undo/redo and reopen checks accompany the affected cases.

## Verification

`tests/browser/phone-model-projection.spec.mjs` covers Phone models with and without a stored title, plus Web and Board models without titles. Four source browser cases passed with real Chrome. They check zero open writes, content-only updates, native style flush, undo/redo, reopening and two-client convergence without remote echo. The model retains its original child IDs without new helper records. Phone cases also sample the live bezel on four sides, compare those samples with PNG export, and check the SVG even-odd bezel.

Use `tests/browser/phone-projection.playwright.config.mjs` for isolated source acceptance. It scans only the actual app/example HTML entries and uses a dedicated dependency cache, so ignored release-consumer directories cannot introduce another React runtime. Its test match includes all browser specs; select the relevant files on the command line or run the full directory. The corresponding React 18 tarball consumer is a separate production build and must be verified from the actual packed artifact before publishing.

## 中文

0.5.11 修复容器原生视图与权威模型的记账错误，不改公开 API 或 `aidcanvas-yjs` schema 1。当前模型没有存储标题或 Phone 硬件时，继续沿用原生渲染器已有的标题和硬件生成规则，但仅供本次视图使用，不在打开、接收子元素更新、刷新无关编辑或重开时补写到模型。

身份对账仍删除未使用的子元素，然后刷新受影响的容器；仅在视图生成的辅助元素不进入内容快照和场景差异基线。已经存储的标题、硬件保留原模型 ID 和字段，继续使用已有模型命令、撤销和 checkpoint。没有数据转换、历史字段回填、schema 变更或新增保存通道。

修复前，Phone 的子内容更新可能删除可见硬件，却留下已清除的原边框；随后原生内容刷新可能错误访问模型中不存在的辅助元素，引发缺失 map 和 `ELEMENT_ID_REUSE`。Web、Board 缺少存储标题时也可能发生同类错误。四项真实 Chrome 源码回归已通过；正式发布还应使用实际 tarball 在 React 18 生产消费环境复验。
