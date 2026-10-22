# Changelog

## 0.5.12 — 2026-10-22

- Keep keyboard and clipboard commands with their current DOM input and canvas instance, independently of retained object selections. Comment fields, form controls and contenteditable drafts no longer delete or move selected drawing objects.
- Use the existing scoped DOM commands for deletion, arrows, shortcuts and Space panning instead of Leafer's unscoped document key dispatch. Releasing Space after focus changes or window blur clears the temporary pan state.
- Keep table, diagram/mind editing and open format menus within their own canvas; a second canvas or a host autofocus does not redirect input into a previous selection.
- Preserve native plain/Slate text editing, readonly behavior, model/schema/checkpoints, collaboration transport and public package exports.

## 0.5.11 — 2026-10-22

- Preserve explicitly positioned container titles within their existing right inset, including right-aligned titles in clipped Web frames.
- Keep native group-open flags in the view while preserving exact authored `hitChildren` fields in model snapshots, exports, duplicate/clipboard content and public selection payloads; explicit commands and remote patches retain their normal ownership.
- Reconsider container membership at genuine transform and creation boundaries; keep copied nested subtrees intact during tool switches, unrelated gestures and new drawing.
- Fit animated view/alignment menus using their final size inside the embedded canvas and browser; scroll short menus and keep their final command reachable by keyboard after resize or host scrolling.
- Keep existing diagram-wrapper geometry consistent in native and detached exports, and capture existing native table layout in the view baseline so focus/exit does not write defaults.
- Keep native Phone hardware visible after model-only child changes; the live canvas and PNG/SVG exports retain the same bezel.
- Keep titles and Phone hardware generated only for a model projection out of its content snapshot and diff baseline. Native edits, undo/redo and reopening no longer attempt to place missing model entries or reuse their IDs.
- Preserve authoritative container children and any stored titles/hardware. Public APIs, model implementation, schema 1, original checkpoints and collaboration transport are unchanged; opening a container does not backfill drawing data.

## 0.5.10 — 2026-10-22

- Keep the toolbar usable in short and embedded canvases with a scrollable tool list and a pinned selection button.
- Position every tool flyout within the canvas and browser viewport, updating it on resize and scrolling.
- Scroll long flyout content independently so container presets remain reachable without clipping menus.

## 0.5.9 — 2026-10-21

- Paint full unbound connectors and rich table/card objects continuously while dragging, including attached routes and labels; commit once on release and restore paint on cancellation.
- Support Ctrl+A and Cmd+A within plain diagram/connector labels without selecting the canvas.
- Move the view menu to the upper-left above canvas tools. Navigate to any minimap point by clicking or dragging, with a current-viewport indicator and unchanged zoom.
- Add controlled, version-1 personal view and creation preferences, change callbacks, explicit save/reset actions and pure public validators. The host owns browser/account/document storage; no new document fields, old-data conversion or default backfill.
- Keep the SVG font portability notice; avoid that vector-only warning for raster PNG exports.

## 0.5.8 — 2026-10-20

- Drag the body of a connector with both endpoints unbound to translate the entire line, including straight lines, manual elbow routes and curves. Preserve existing editing behavior for connected lines and dedicated route handles.
- Translate route coordinates and labels correctly inside scaled groups and at any canvas zoom; commit once on release with undo/redo, peer synchronization and checkpoint restoration. Cancelled and zero-distance drags leave content unchanged.

## 0.5.7 — 2026-10-20

- Apply quick stroke widths and dashed/dotted lines to diagram bodies and table cells, matching the full style panel.
- Keep trackpad panning continuous over connection ports, rich media and table/object controls.
- Open mention suggestions immediately with loading feedback, cancel stale searches and reuse completed queries within the editor session.
- Delete the semantic note/card/diagram when an object deletion command targets its active rich label, preserving inline content through undo.
- Bake custom-path sizes only after actual resizing; discard deferred gesture work after history/model restoration so it cannot clear redo.
- Keep the top-right view menu available in embedded canvases without the package header. Add dot/grid patterns and background colors alongside minimap and outline controls as view state.
- Anchor the table move handle to the table's top-left corner, including outside the viewport.

## 0.5.6 — 2026-10-20

- Keep empty diagram label carets vertically aligned with the text that follows, and align rich list markers with the first text baseline.
- Require a drag before connector ports show or create a line; ignore clicks and small pointer jitter.
- Accept Cmd+A or Ctrl+A for canvas selection without treating Ctrl+Cmd+A and other mixed modifiers as select-all.
- Expand connection ports from four to twelve, follow ellipse and diamond outlines, refresh port positions after resizing, and preserve pointer-selected ports when drawing connectors.
- Recognize name-only diagram wrappers and synchronize their body, text box and outline during corner resizing. Repair existing mismatched legacy geometry without misclassifying explicit containers or dropping custom paths.
- Select canvas images on the first click and preview selected images through the host on the next click; add authorized PNG image copying to canvas and rich-image context menus, including readonly canvas views.
- Add regressions for the reported interactions, all ten diagram shapes, multi-selection resizing, legacy geometry, undo/redo and reopening.

## 0.5.5 — 2026-10-18

- Remove the code block action from shared rich-text paragraph menus in notes, cards, labels and table cells.
- Scope rich inline elements and suggestion menus to the canvas root so their styles do not affect host pages.

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
