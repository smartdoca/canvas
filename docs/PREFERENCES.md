# Canvas 0.5.9 personal preferences API

This implements the approved 2026-10-21 browser-only scope. The host owns an independent versioned record, isolated by website origin + account + document. The editor never reads host browser storage. Missing records retain existing behavior; unknown/invalid records remain untouched and must be blocked from reads/writes by the host. No scene, checkpoint, history, epoch or pending update is converted.

```ts
import {
  CanvasEditor, isCanvasViewPreferences, isCanvasCreationPreferences,
  type CanvasViewPreferences, type CanvasCreationPreferences,
} from '@smartdoca/canvas'
// Pure validators also work without React/DOM/CSS:
import { isCanvasViewPreferences, isCanvasCreationPreferences } from '@smartdoca/canvas/preferences'

interface CanvasViewPreferences {
  version: 1
  gridVisible: boolean
  gridPattern: 'dots' | 'lines'
  backgroundColor: string | null // null = existing theme background
  minimapVisible: boolean
  outlineVisible: boolean
}
interface CanvasCreationPreferences {
  version: 1
  connector?: {
    mode?: 'straight' | 'elbow' | 'curve'
    stroke?: string
    strokeWidth?: number
    lineDash?: 'solid' | 'dashed' | 'dotted'
    startHead?: 'none' | 'arrow' | 'triangle' | 'circle'
    endHead?: 'none' | 'arrow' | 'triangle' | 'circle'
  }
  note?: {
    preset?: string
    fill?: string
    fontSize?: number
    fontColor?: string
    textAlign?: 'left' | 'center' | 'right' | 'justify'
    verticalAlign?: 'top' | 'middle' | 'bottom'
  }
}
```

The component accepts `viewPreferences`, `onViewPreferencesChange(next)`, `creationPreferences`, `onCreationPreferencesChange(next)`. Supplied preferences are controlled: callbacks propose the next record and the host supplies the accepted value on the next render. With no view prop, existing local view state remains usable; no callback means no persistence. Creation callbacks are invoked only by explicit “Use selection as creation defaults” / reset actions in the main menu. Supplied unknown/invalid values report `CANVAS_VIEW_PREFERENCES_INVALID` or `CANVAS_CREATION_PREFERENCES_INVALID` through `onError`; they are not converted and cannot emit a replacement preference record.

Both validators reject extra keys, non-version-1 values and invalid field values. Colors are native hex colors of 3/4/6/8 digits. Connector widths are finite 0..64; note font sizes 1..256. Preset IDs are validated against the actual shared native note preset definitions. The functions do not mutate their arguments. Do not substitute a partially decoded or unknown record with a new version-1 record. Host account/document changes must update or omit both props; the model instance need not remount.

Creation styles apply only to future interactive drawing, port drags, node quick-create connectors and palette drags. Explicitly chosen connector modes/note presets take precedence over saved defaults. Existing elements, duplicates, templates, imports, explicit API/AI scene insertion and remote projections are unchanged. Preference changes do not enter content undo, produce content updates, migrate historical data or change schema 1. Rollback stops consuming the new preferences while preserving every record and later document edit.

The legacy module-level session style reader remains in its existing path for omitted styles/no preference record; it is not copied into a new preference record on open. Saving defaults only emits the host callback. Controlled connector mode activation and controlled note-preset selection/style edits do not write the legacy global cache, preventing new personal defaults from leaking into a different account/document with no record. No old preference reader or migration is introduced.

PNG output is rasterized in the current browser and does not have a portable-font-embedding limitation. SVG still returns `FONT_NOT_EMBEDDED_SYSTEM_FALLBACK`: fonts are not embedded, the output retains font names and appends a system fallback; another receiver may render it differently. Hosts should show a readable fidelity notice for SVG instead of treating this warning code as a failed export.

The main Doca session owns storage, host overlay layering, final production acceptance and published-package installation. Package acceptance uses isolated synthetic documents only.
