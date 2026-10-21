# Row 47 / 60 — approved personal browser preferences (2026-10-21)

The main Doca session reports explicit user approval on 2026-10-21: “同意，按本浏览器个人偏好实现”. This supersedes the initial page-state/cross-document proposal. No Doca files are changed by this repository.

## Recommended ownership and scope

Store these as host-owned **personal preferences in this browser, isolated by website origin + account + resource**, never in canvas scene JSON, Yjs, checkpoints, history or business document metadata. Canvas receives validated optional props and emits changes through optional callbacks. The package does not read host localStorage, cookies, routes or user IDs. Doca owns localStorage. Both view and creation preferences share the approved site/account/resource scope; neither is an account-wide server setting.

### Row 47: view preferences per account + resource

Proposed host key: `canvas.view.v1.{resourceId}` in host localStorage, in the website origin + account + resource scope. Value: `{version:1, gridVisible:boolean, gridPattern:'dots'|'lines', backgroundColor:null|'#ffffff'|'#f5f6f7'|'#edf3ff'|'#eaf5ee'|'#fff7e6'|'#25282d', minimapVisible:boolean, outlineVisible:boolean}`. Package surface: optional `viewPreferences` and `onViewPreferencesChange(next)`.

- Two users retain independent views; the current user returns to the same document's view after refresh. Content collaboration and undo remain unaffected. Different documents have independent preferences.
- No preference record means **exactly the current 0.5.8 initial view**, without writing a record on open. Only an explicit menu/keyboard view change writes a complete version-1 preference record through the host. No historic document's omitted fields are interpreted or backfilled.
- Accept only exact version 1, exact allowed keys and valid enumerations. Unknown versions or invalid records are reported as unsupported, preserved verbatim by the host and never converted/overwritten. The existing view remains usable without accepting those values; no saved document is touched.
- Older package/host builds do not consume this new namespace. Rolling back package/host leaves the preference record and every document/checkpoint/update untouched. Returning to the new version can read the same validated version-1 record. Older clients need not display these preferences.
- Readonly/history modes may change the user's view preferences only if the host enables that callback; they never mutate the viewed content. Account switching changes the host-supplied preference, not the mounted document/model.

### Row 60: creation styles for this browser + account + resource

Proposed host key: `canvas.creation.v1.{accountId}.{resourceId}` within this browser origin. Value `{version:1, connector?:{mode:'straight'|'elbow'|'curve',stroke:string,strokeWidth:number,lineDash:'solid'|'dashed'|'dotted',startHead:'none'|'arrow'|'triangle'|'circle',endHead:'none'|'arrow'|'triangle'|'circle'},note?:{preset:string,fontSize:number,fontColor:string,textAlign:'left'|'center'|'right'|'justify',verticalAlign:'top'|'middle'|'bottom'}}`. Values must pass the package's actual current native style validation; bounded finite numbers, supported presets/colors only. Proposed package surface: optional `creationPreferences`, `onCreationPreferencesChange(next)` plus an explicit “Use as creation defaults” action for the selected connector/note and a reset action.

- No record: keep current 0.5.8 connector/note creation behavior exactly. Existing session style behavior is audited and retained, not silently replaced or promoted to persisted defaults.
- Save defaults only on the user's explicit action. Do not make every selected-element style edit silently change future elements.
- Apply supplied preferences only when creating a **new interactive** connector or note (including port-drag-created connectors). Existing elements, imports, explicit host/API/AI-created scene JSON and remote projections retain their supplied native fields. Never scan/rewrite old notes/connectors, or fill their missing fields.
- New elements store the same existing native style fields; there is no new scene field, schema/codec version or old-scene reader. A previous editor may render the explicit existing fields it already understands; no additional older-client guarantee is claimed.
- Exact version/field validation and unsupported-record preservation match row 47. Reset removes only the specific user preference after explicit action; it never edits documents. Rollback leaves preference records and later content untouched.

## Verification before release after approval

Use isolated accounts/documents: two users and two resources; refresh restores the selected scope; idle/open/select/pan emits zero content updates for 60 seconds; view/default changes do not enter content undo or peer updates; newly drawn objects use explicit preferences while old objects/API insertion remain byte-identical; unknown/malformed versions retain original bytes and are not overwritten; previous 0.5.8 artifact/checkpoint reopens without conversion; readonly, account switching and rollback are checked. Publish the package artifact, compare public declarations/schema/model, then let the main Doca session implement/validate the host bindings and storage contract.

## Approved decisions

1. Approved: personal view preferences for this browser origin + account + resource, outside shared canvas content.
2. Approved: creation defaults in the same browser origin + account + resource scope, saved explicitly and applied only to new interactive elements.
3. Approved: exact-version validation; unknown records stay intact and blocked from reading/writing; absent records preserve 0.5.8 behavior.
