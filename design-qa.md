# Design QA — Workspace、Collections 與排程重構

## Evidence

- source visual truth path: `/var/folders/lp/vhgkn01n4hl0mpwnz4541mvh0000gn/T/codex-clipboard-ea92be2f-69b2-4818-8aa6-66e5bb6ab92e.png`
- implementation screenshot path: `/tmp/ehlink-scheduler-final.png`
- focused scheduler form screenshot: `/tmp/ehlink-scheduler-dialog-final-pass.png`
- workspace/download guard screenshot: `/tmp/ehlink-download-workspace-guard.png`
- full-view comparison evidence: `/tmp/ehlink-scheduler-comparison-final.png`
- viewport: browser content viewport `1280 × 720`; source and implementation were normalized into equal comparison frames. The source includes its desktop window chrome while the implementation capture contains renderer content only.
- state: configured workspace, two enabled schedules, `non-h` selected, no active run, no active download, one completed run. Additional unconfigured-workspace and editor states were checked separately.

## Findings

No actionable P0/P1/P2 finding remains.

- Fonts and typography: the implementation preserves EhLink-Getter's existing system font stack, weight hierarchy, uppercase eyebrow labels, truncation, and compact metadata treatment. It intentionally does not copy Nh-Downloader's dark-theme font color because this is a structural reference inside an existing product design system.
- Spacing and layout rhythm: scheduler list, selected item, action bar, three summary panels, current run, download progress, and history follow the source hierarchy. EhLink-Getter's existing full navigation remains an intentional extra column. Cards, borders, gaps, and vertical rhythm remain consistent with the rest of this app.
- Colors and visual tokens: the source's dark/pink palette is intentionally mapped to EhLink-Getter's cream/deep-red tokens. Enabled, running, error, disabled, and empty states retain semantic contrast.
- Image quality and asset fidelity: the implementation uses the existing app logo and PrimeIcons. The scheduler target contains no required photography or illustration, and no visible reference asset was replaced with CSS or handcrafted SVG art.
- Copy and content: monitor condition, page limit, target Collection, "開始下載後自動加入", current progress, download progress, and run history are self-contained and match the requested domain behavior.
- Accessibility: nav and actions use semantic buttons; the schedule form's frequency, interval, weekday, and target Collection controls now expose accessible names. The fixed dialog footer keeps Cancel/Save reachable while long form content scrolls.
- Responsiveness: scheduler and Collection master lists collapse to a 76 px rail below 900 px. The dialog no longer overflows horizontally and keeps its actions visible at the tested desktop viewport.

## Focused Region Comparison

The schedule editor was captured separately because its controls were too small to judge reliably in the full-view comparison. The final focused capture verifies readable labels, default page limit `3`, friendly frequency/interval controls, target Collection, enabled state, vertical scrolling, and a persistent footer without horizontal overflow.

## Primary Interactions Tested

- Opened Scheduler and selected schedule records.
- Opened the create-schedule dialog, verified defaults and accessible control names, filled name/URL, and submitted; the new schedule appeared in the list.
- Opened Collections, verified one Gallery can appear in multiple custom Collections while the dynamic Uncategorized count excludes it, and created a new Collection.
- With no workspace, verified Start Fetch remains available, the Fetched screen shows a workspace requirement only at download time, and Collections/Scheduler remain gated.
- Verified the schedule dialog's footer submit button still submits the form after moving it outside the scrollable content.

## Console Errors Checked

The in-app browser opens the renderer without Electron preload before the QA mock is injected, so it records expected bootstrap errors for missing `window.api`. After mock injection, the tested Scheduler and Collection interactions produced no additional application error. Electron production build and full type checks passed; actual Electron visual smoke testing was also completed.

## Comparison History

1. Initial pass — P2 accessibility: PrimeVue Select/MultiSelect controls did not expose stable accessible names.
   - Fix: added explicit `aria-label` values for frequency, interval, weekdays, and target Collection.
   - Post-fix evidence: `/tmp/ehlink-scheduler-dialog-final-pass.png` and the final DOM accessibility snapshot.
2. Second pass — P1 behavior: the workspace overlay blocked the entire TaskManager, including search/fetch snapshots, instead of only downloads.
   - Fix: limited page-level gating to Collections/Scheduler and added a download-time workspace guard in Fetched.
   - Post-fix evidence: `/tmp/ehlink-download-workspace-guard.png`; Start Fetch remained interactive while download required a workspace.
3. Third pass — P2 responsive dialog: long content exposed horizontal overflow and pushed persistent actions below the visible area.
   - Fix: constrained form fields, removed horizontal overflow, and moved Cancel/Save into the Dialog footer.
   - Post-fix evidence: `/tmp/ehlink-scheduler-dialog-final-pass.png`; both actions are visible and the submit path was exercised successfully.

## Implementation Checklist

- [x] Match the source scheduler's master-detail information architecture.
- [x] Keep product-specific colors, typography, logo, and navigation.
- [x] Make all primary scheduler and Collection interactions functional.
- [x] Limit workspace blocking to downloads, Collections, and Scheduler.
- [x] Verify desktop, collapsed rail, dialog, empty, and unconfigured states.
- [x] Remove all actionable P0/P1/P2 findings.

## Follow-up Polish

- P3: a future pass may localize the remaining English labels in the legacy TaskManager tabs; this predates and does not block the new domain flows.

final result: passed
