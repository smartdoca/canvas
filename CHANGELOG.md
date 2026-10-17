# Changelog

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
