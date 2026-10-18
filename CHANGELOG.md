# Changelog

## 0.5.4

- Add native atomic inline extensions to rich notes, cards and table cells, with host-owned suggestions and authorized paste resolution.
- Preserve inline identity/data through clipboard, undo, checkpoints and peer projection; copy plain text as readable labels. Async insertion stays bound to the original live editable target.
- Canvas rendering and export show saved labels; native hover previews use the host renderer in readonly and editing views.
- Retain schema-1 transport and existing content unchanged. New inline metadata has no older-client rendering guarantee.


## 0.5.3 — 2026-10-18

- Add host-owned `onAttachmentPreview(resource)` for canvas and rich attachments, with the existing `onResourcePreview` as the fallback. Read the current prop on every invocation and forward synchronous/asynchronous preview failures to `onError`.
- Use the expand preview icon in the file toolbar, matching slatetsx. Keep attachment preview and authorized download available from that toolbar in readonly mode.
- Avoid whole-scene serialization and connector recomputation during pan/zoom. Reuse task candidates and rich-text layout caches; inspect only selected rich content for resource overlays.
- Keep narrow element toolbar width and wrapping stable while panning outside either viewport edge.
- Move help, grid and minimap controls into the top-right menu. Show help in a centered modal and reserve a configurable 64px space beside bottom-right host controls.

## 0.5.2 — 2026-10-17

- Preserve committed Chinese text and the caret during consecutive IME input in rich notes and cards. Keep transient composition ranges out of toolbar selection synchronization, and ignore completion timers from an earlier composition.
- Grow table rows to fit wrapped text, rich formatting, merged cells and media. Column resizing respects content height; cell content does not scroll internally. Text and row geometry remain in the same collaborative undo transaction.
- Prevent browser caret scrolling from moving the canvas stage and its overlays. Keep table toolbar and movement controls separate from cell selection gestures.
- Add browser regressions for repeated Chinese composition and editing after save, and for table row growth, peer convergence, undo/redo and checkpoint restoration on desktop and narrow viewports.

## 0.5.1 — 2026-10-17

- Keep the element toolbar attached to its selection during canvas panning and zooming, including movement outside the viewport. Preserve initial clearance from the drawing tools without pinning the toolbar to screen edges.
- Preserve native Slate and plain-text inner-editor registration in the library build by marking both registration modules as side effects. Fix text editing in the published package; no model or schema conversion is required.
- Skip unchanged rich-text gutter layout updates to prevent an update loop when opening the editor with React 18.
- Add regressions for toolbar movement in all four directions and for plain/rich text editing, undo/redo and checkpoint restoration in the built library.

## 0.5.0 — 2026-10-17

- Add mind maps, editable diagram templates, connectable shapes, alignment guides, containers, rich notes, cards and tables. Replace the primitive and rough-style toolbar with the modern shape tools.
- Add Slate rich text, image and attachment callbacks, atomic host extensions, relative text presence and remote canvas pointers. Keep `aidcanvas-yjs` schema 1 and the existing epoch, checkpoint and update contracts.
- Fix first-stroke pencil freezes and position drift; provide six brush widths: 1.5, 3, 5, 8, 12 and 20.
- Require complete containment for marquee selection. Preserve unselected connectors when deleting elements; mind-map topics recursively delete their descendants. Restore selection after delete and undo.
- Reduce repeated scene projection and remote validation work. Index bulk selection and presence lookups, and apply large marquee selections once on release.
- Pin the Leafer plugin peer dependencies to 2.1.0 so a fresh npm installation uses one compatible runtime.
- Add a reproducible two-page collaboration benchmark for 1,000–10,000 elements. At 10,000 elements, local simulated-host receive/projection p50 improves from 390.5 ms to 94.8 ms; replaying 19 queued messages improves from 10,010 ms to 3,184 ms. These measurements do not cover a production Doca backend.
- Verify 222 browser tests, 29 model tests, an additional text-presence test, lint, application/example type checks, library and production builds. See the [performance report](docs/performance/collaboration-2026-10-17.txt).

Integration: restore host checkpoints with `CanvasModel.restore(checkpoint)`. For a new authoritative epoch, call `CanvasModel.initialize(epochId, value)`, then distribute `model.checkpoint()`. Rich formatting and media metadata remain whole-field LWW; text content uses Y.Text.
