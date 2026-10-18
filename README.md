# @smartdoca/canvas

[中文](README.zh-CN.md)

Embeddable collaborative vector canvas for React and LeaferJS. The package owns the scene and editing commands. The host owns identity, image bytes, permissions, and the network.

Licensed under [MIT](LICENSE).

## Install

```sh
npm install @smartdoca/canvas react react-dom
```

```tsx
import { CanvasEditor } from "@smartdoca/canvas";
import { CanvasModel } from "@smartdoca/canvas/model";
import "@smartdoca/canvas/style.css";

// Create a new local document once, before mounting.
const model = CanvasModel.initialize(crypto.randomUUID(), {
  version: 1,
  scene: { children: [] },
});

export function Canvas() {
  return <CanvasEditor model={model} hostManaged mode="edit" />;
}
```

Keep one `CanvasModel` for the document session. Do not construct a new model when selection or readonly changes.

For an existing document, use `CanvasModel.restore(checkpoint)` with the authoritative checkpoint supplied by your host. A collaborative host creates the authoritative epoch once and shares its checkpoint with every session. See [collaboration](docs/COLLABORATION.md) and the [0.5.0 release notes](CHANGELOG.md).

`yarn bench:collaboration` benchmarks two browser pages at 1,000, 5,000 and 10,000 elements, including repeated edits, concurrent offline changes, original-message replay and duplicate delivery. `PERF_OUTPUT=path.json` saves measurements; `PERF_COUNTS`, `PERF_SAMPLES` and `PERF_LATENCY_MS` configure the fixture. This uses a simulated example-host transport, rather than a production Doca service. `yarn bench:model` also covers boards containing up to 1,000 groups.

## Props

`CanvasEditor` accepts `CanvasEditorProps`.

| Prop | Type | Role |
|---|---|---|
| `model` | `CanvasModel` | Bootstrapped scene from `@smartdoca/canvas/model`. It does not open a network. |
| `hostManaged` | `boolean` | The host owns save and collaboration. |
| `mode` | `"edit" \| "readonly"` | `readonly` stops editing. |
| `value`, `defaultValue` | `CanvasValue` | Scene value when a model is not supplied. |
| `onChange` | `(value, meta) => void` | `meta.source` is `local`, `api`, or `remote`. Only `local` should be saved. |
| `sessionId` | `string` | This tab's session. |
| `remoteSelections` | `SessionSelection[]` | Ephemeral remote selections. |
| `onPresenceChange` | function | Local element selection and optional epoch-scoped relative text caret/range. It is not a content write. |
| `anchors` | `CanvasAnchorDecoration[]` | Permanent element comments. Independent from selection and presence. |
| `activeAnchorId` | `string \| null` | Highlighted anchor. |
| `onAnchorClick` | function | An anchor decoration was activated. |
| `resources` | `CanvasEditorResources` | Host `uploadImage`, `uploadAttachment`, `resolveUrl`, `resolveDownloadUrl`; `readImage` authorizes image bytes for export. |
| `onAttachmentPreview` | `(CanvasResource) => void \| Promise<void>` | Host-owned attachment preview, taking precedence over `onResourcePreview` for attachments. |
| `onResourcePreview` | `(CanvasResource) => void` | Host-owned preview for rich and canvas media; receives stable metadata. |
| `saveStatus` | `CanvasSaveStatus` | Host save state. When set, it is what the editor displays. |
| `onSaveRequest` | function | Called when the package asks the host to save. |
| `locale` | `string` | `zh` or `en`. Omitted means Chinese. Unknown codes use English. |
| `messages` | `Record<string, string>` | Replaces individual message keys. |
| `showHeader`, `showToolbar`, `showZoomControls` | `boolean` | Built-in chrome. |
| `selectionActions`, `hostActions` | `CanvasSelectionAction[]` | Selection actions, and actions that stay available without a selection. |
| `onReady` | `(handle) => void` | Receives `CanvasEditorRef`. |
| `className`, `style`, `theme` | | Layout and `--aidcanvas-*` theme variables. |

The bottom controls and minimap reserve an extra `64px` on the right for floating host buttons. Set `theme={{ '--aidcanvas-bottom-right-offset': '0px' }}` to remove that space, or provide another CSS length to match the host layout.

## Collaboration

The codec name is `aidcanvas-yjs`.

- Bootstrap `model` from the host baseline, then pass that same instance.
- Persist `onChange` only when `meta.source` is `local`. Remote scene updates must not create another upload.
- `mode="readonly"` does not publish edits or editing selections.
- `onPresenceChange` reports element ids for this session. It is temporary and is not a comment anchor.
- `anchors` are permanent element anchors. The handle methods `captureAnchor` and `resolveAnchor` create and check them.
- `resources.readImage` must return bytes the host has already authorized. The exporter does not fetch URLs.

`@smartdoca/canvas/io` imports and exports PNG and SVG.


## Rich cards, tables and files

Notes, cards and table cells reuse the same Slate surface. Cards and cells edit on a body click; notes select and drag on the first click, then edit on another click. The upper-left hand selects or drags a container. Cards and cells default to top alignment and wrap horizontally. Cards scroll vertically; table rows grow to fit all cell content, including merged cells, without internal scrolling. Notes grow to fit content and cannot be resized below it; extra manual space remains. Flowcharts, mind topics and connector labels keep single-click selection/dragging and double-click plain text editing. Select text to format it; drag across cells to select a range and merge/split. A shared two-row alignment panel offers four horizontal and three vertical choices, independently of text-range formatting. Notes also have 12 surface presets. Modern connectable shapes replace the retired primitive/rough-style tools; `elementExtensions` and custom SVG paths remain supported.

Marquee selection requires complete containment. A partly enclosed group contributes only its fully enclosed members. Deletion removes selected content; unselected connectors and labels stay in place with references to deleted elements detached. Mind-map deletion is recursive: deleting a topic removes its descendants, and deleting the root removes the entire map.

```tsx
<CanvasEditor
  resources={{ uploadImage, uploadAttachment, resolveUrl, resolveDownloadUrl, readImage }}
  onAttachmentPreview={resource => host.openFilePreview(resource)}
  onResourcePreview={resource => host.openFilePreview(resource)}
/>
// Host commands also include insertImageFile(file) and insertAttachmentFile(file).
```

File paste/drop uses those callbacks in both rich content and the canvas. Failed uploads can retry at the captured target; cancellation, readonly and disposal stop late insertion. Only stable paths and metadata are serialized. Rich media are atomic Slate void blocks, with U+FFFC markers in native text; schema-1 formatting and media metadata remain whole-field LWW. No per-character formatting collaboration is claimed. Exports embed authorized inline image bytes and readable attachment labels. [Resource and interaction verification](https://github.com/smartdoca/canvas/blob/v0.5.0/docs/design/feishu-thinking/resources-and-containers.md) records source-only acceptance and host integration limits.


### Rich text extensions and presence

`richTextExtensions` embeds host-owned **atomic blocks** inside notes, cards and cells. Supply stable extension definitions with `type`, `label`, `create(data)` and `render({ element, selected, onChange })`. `element` contains only `{ id, type, label, data }`; `data` must be JSON. The package owns the Slate void wrapper, native selection, clipboard, deletion and undo. `handle.insertRichTextElement(type, data)` inserts into the active text editor and returns false outside editing or in readonly. Unknown extension types keep their JSON and display their saved label. The native canvas and exports use the saved text label; host React UI renders during rich editing. Set `inline: true` for an atomic inline element. Inline atoms use `{type:'inline', inline:{id,type,label,data}, children:[{text:''}]}` inside a paragraph and one U+FFFC marker in native text. The saved label renders on the canvas and in exports, including when the host extension is unavailable. Copy/paste regenerates instance IDs and retains opaque data; plain text copy uses readable labels. Block extensions retain their existing shape.

An inline extension may supply `suggestions: {trigger, search(query, {signal})}` and `matchPaste(text)` / `paste(text, {signal})`. The host performs directory/ACL checks and returns bounded JSON. The native editor owns debouncing, the candidate menu, live ranges, keyboard selection, cancellation, clipboard, deletion and undo. Async paste cannot insert into a closed/deleted/readonly target. The host's `render` supplies interactive user cards or document links while editing and in the native hover preview. Lookup/render/preview do not write content; accepted insertion and explicit `onChange` do. No host identity, route or network policy is built into this package.

For text cursors, forward the complete `CanvasPresence` from `onPresenceChange` to the authenticated room and pass it back with the server-owned identity as `SessionSelection`. The optional `text` member carries `{ epochId, elementId, anchor, focus }`, with Yjs relative positions encoded as JSON strings. Do not flatten it to `elementIds`. Presence is transient; it contains no typed content, is never persisted, and clears on blur/readonly. `model.captureTextPresence` and `resolveTextPresence` expose the same mapping for host adapters. `characterPresence` is available with a model.

Images and attachments select on click. Use the file toolbar for attachment preview and download, including readonly views. Its preview action uses the expand icon, matching slatetsx. `onAttachmentPreview` receives stable resource metadata; when absent, attachments use `onResourcePreview`. Images use `onResourcePreview`. Both callbacks can return promises; failures go to `onError`. Preview does not resolve an asset URL or write content. Downloads require the host's `resolveDownloadUrl`. Drag media out of a selected note (or the active rich editor) to move it to the canvas. Moving reuses its stable resource path and commits source removal plus destination insertion together; canceling or dropping inside its source container preserves the original.

Presence also includes optional `cursor: { x, y }` in scene coordinates for remote canvas pointers. Pointer movement is throttled, temporary and uses the same host presence channel.

Rich row actions follow the hovered or active paragraph in a floating left gutter. Heading/list/task and alignment commands target that row. The formatting toolbar waits for mouse or keyboard selection to end, then appears above the selected range (below only when viewport space requires it).
