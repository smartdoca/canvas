# Keyboard ownership

Canvas 0.5.12 routes content commands through their current DOM event target, independently of retained object selection. A host comment field can retain the drawing selection for its anchor while owning Backspace/Delete, caret arrows, select-all, undo/redo and clipboard input.

The command target must belong to this editor's nearest `.canvas-app`, must not be a form/control or an actually editable DOM element, and must not have been prevented by its owner. Keyboard commands ignore composition events. Table and diagram/mind commands use the same per-instance boundary. Native plain/Slate text editors continue to own their own text surfaces; a format menu's retained text range does not authorize inputs or extension controls elsewhere in its mount.

Selection-toolbar mouse commands retain the canvas/text focus, so opening style controls does not silently redirect the next drawing shortcut to a button. Keyboard-focused controls still own their events. File/image clipboard uploads use the same input boundary; dropping a file remains a separate pointer operation.

Leafer 2.1's document key listener has no target predicate and can dispatch before a host's delegated handlers. Canvas disables that native key dispatch with the existing `keyEvent: false` configuration and uses its existing DOM command handlers. Native Space panning is disabled independently with `move.holdSpaceKey: false`, so another Leafer instance's shared key map cannot turn a host's typed space into a pan. Canvas-focused Space panning remains local and releases on keyup even after focus changes, and on window blur.

Canvas-focused arrows use the existing native editor move operation once, retaining its transform, connector and targeted container-membership lifecycle. Form inputs and another canvas do not enter that operation. Existing readonly checks apply before content changes.

No model implementation, schema, persisted fields, checkpoint, compatibility reader, transport or public package export changes are involved. Rollback preserves original document data and restores the previous runtime behavior.

`tests/browser/keyboard-ownership.spec.mjs` exercises real Chrome keyboard/clipboard input in host and canvas controls, plus the focused-canvas and readonly controls. The package candidate must also pass the Doca comment-composer scenario before publication. Use the isolated source browser configuration to avoid ignored release-consumer dependency caches:

```sh
node node_modules/@playwright/test/cli.js test --config tests/browser/phone-projection.playwright.config.mjs tests/browser/keyboard-ownership.spec.mjs
```
