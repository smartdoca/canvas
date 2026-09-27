# @smartdoca/canvas

[中文](README.zh-CN.md)

Embeddable collaborative vector canvas for React and LeaferJS. The package owns the scene and editing commands. The host owns identity, image bytes, permissions, and the network.

Licensed under [AGPL-3.0-only](LICENSE).

## Install

```sh
npm install @smartdoca/canvas react react-dom
```

```tsx
import { CanvasEditor } from "@smartdoca/canvas";
import { CanvasModel } from "@smartdoca/canvas/model";
import "@smartdoca/canvas/style.css";

const model = new CanvasModel();

export function Canvas() {
  return <CanvasEditor model={model} hostManaged mode="edit" />;
}
```

Keep one `CanvasModel` for the document session. Do not construct a new model when selection or readonly changes.

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
| `onPresenceChange` | function | Local element selection for presence. It is not a content write. |
| `anchors` | `CanvasAnchorDecoration[]` | Permanent element comments. Independent from selection and presence. |
| `activeAnchorId` | `string \| null` | Highlighted anchor. |
| `onAnchorClick` | function | An anchor decoration was activated. |
| `resources` | `CanvasEditorResources` | `resolveUrl` is required when images are remote. `readImage` returns original bytes for export. |
| `saveStatus` | `CanvasSaveStatus` | Host save state. When set, it is what the editor displays. |
| `onSaveRequest` | function | Called when the package asks the host to save. |
| `locale` | `string` | `zh` or `en`. Omitted means Chinese. Unknown codes use English. |
| `messages` | `Record<string, string>` | Replaces individual message keys. |
| `showHeader`, `showToolbar`, `showZoomControls` | `boolean` | Built-in chrome. |
| `selectionActions`, `hostActions` | `CanvasSelectionAction[]` | Selection actions, and actions that stay available without a selection. |
| `onReady` | `(handle) => void` | Receives `CanvasEditorRef`. |
| `className`, `style`, `theme` | | Layout and `--aidcanvas-*` theme variables. |

## Collaboration

The codec name is `aidcanvas-yjs`.

- Bootstrap `model` from the host baseline, then pass that same instance.
- Persist `onChange` only when `meta.source` is `local`. Remote scene updates must not create another upload.
- `mode="readonly"` does not publish edits or editing selections.
- `onPresenceChange` reports element ids for this session. It is temporary and is not a comment anchor.
- `anchors` are permanent element anchors. The handle methods `captureAnchor` and `resolveAnchor` create and check them.
- `resources.readImage` must return bytes the host has already authorized. The exporter does not fetch URLs.

`@smartdoca/canvas/io` imports and exports PNG and SVG.
