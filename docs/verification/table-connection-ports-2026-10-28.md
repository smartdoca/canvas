# Table connection ports — 2026-10-28

Doca issue record 2.0, row 12: show usable connection points for a native canvas table. Baseline: `@smartdoca/canvas` 0.5.15, commit `3dec1e7`. Verification uses synthetic documents in the package's example host, with no user-document edits or Doca dependency changes.

## Accepted interaction

- Editing a cell hides connection points, including while typing.
- Hovering a table outside editing shows its twelve existing outer connection points; leaving hides them.
- Clicking the upper-left hand selects the whole table and keeps its connection points visible after the pointer leaves.
- A cell or range selection alone does not keep connection points visible. Hover can reveal them when no cell editor is open. Readonly hides editing controls.

`GraphHandles` resolves table hover through the existing `connectableNode` path and clears stale hover on editing, pointer exit and cancellation. Connections continue to bind the table ID through existing endpoint anchors. Non-editing axis controls have a separate strip outside the connection targets; their position does not jump on hover. Open table axis menus paint above connection targets. Cell editing keeps its preceding axis spacing.

## Package boundary

There is no new API. Hosts continue using `CanvasEditor` and the existing `CanvasModel`; `select`, `getSelection`, `flush`, `undo` and `redo` keep their public signatures. Source/target IDs, endpoint indices/anchors, schema 1, checkpoints, collaboration transport and historical readers are unchanged. No adapter, migration or stored-field backfill is added.

The hash-qualified local candidate is an unpublished verification archive using the baseline package version, not an npm release. Its 155-file content audit changes only `dist/index.js` and `dist/index.css` relative to the retained official 0.5.15 archive. Model runtime, all declarations, package exports and dependencies are byte-identical. The isolated React 18 installation matches all 155 candidate files exactly.

## Verification

The reusable test is `tests/browser/table-connection-ports.spec.mjs`. It checks native hover and hand selection, all twelve port centers, sixty seconds without writes/checkpoint changes, hidden ports during editing, native table-to-shape/table connections, cancellations, retained cell input, peer flush without echo, undo/redo and checkpoint reopening. It also checks axis/menu hit targets and native column resizing.

Final results: 26/26 source Chrome tests and 16/16 independent React 18 archive-consumer Chrome tests passed, including the five new scenarios on each build. The 30 model tests, ESLint, TypeScript, example type checking and library build passed. These results apply to the final `c98e096a1366` candidate; earlier artifacts preserve superseded interaction experiments and diagnostic failures.

Final commands, logs, screenshots, package identity and results are recorded under `artifacts/verification/table-connection-ports/`. The example's BroadcastChannel receipt is not a production durable-server ACK. Doca compiled-host acceptance and a new official release remain separate work.
