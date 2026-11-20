# Progress — Developer notes panel, page-by-page version

PROTOTYPE-SETUP. Run log. Sources: `docs/dev-notes/dev-notes.json` (the notes) and
`docs/prototypes/leave-prototype.html` (the panel's look and behaviour). If a run stops, continue from the first step
that isn't **done**. The previous run (Leave module updates + module-grouped notes panel, `c34e05f`–`9b91229`) is
finished and pushed; its log is in git history (`git show 9b91229:docs/progress.md`).

| Step | Commit | Status |
|---|---|---|
| 1 — Remove the module-grouped panel; page-key context + `useDevPage`; new docked panel on `dev-notes.json` | Dev notes: page-by-page panel replaces the module notes | done |
| 2 — Every mapped screen and sub-tab reports its key | Dev notes: pages report their notes key | done |
| 3 — README flag section, `docs/dev-notes/README.md` (how to update, key list) | Dev notes: how to update the notes and the key list | done |
| 4 — VERIFY 1–5 at 1440 / 1024 / 375, type-check, lint, tests, production build, one push | Dev notes: verification log | next |

## Done
- Step 1: removed `src/prototype/devNotes/devNotes.tsx` (markdown loader, module map, renderer), its tests and
  `docs/dev-notes/developer-notes.md`; rewrote `src/prototype/devNotes/DevNotesPanel.tsx`; added `devPage.tsx`
  (`DevPageProvider`, `useDevPage`, `useCurrentDevPage`) and `notes.ts` (`DEV_NOTES`, `notesFor` with the fallback);
  `DevPageProvider` wraps the router and demo controls in `App.tsx`. Tests: `src/prototype/devNotes/__tests__/devNotes.test.tsx`.
- Step 2: `useDevPage` in the ESS Overview, Leave, Attendance & Timesheet, My team (+ member page), Reimbursements,
  Profile; Payroll dashboard, Leave, Timesheet, Attendance, Overtime / Reimbursements, Employees; Payroll settings and
  its Leave Policies sub-tabs.
- Step 3: `README.md`, `docs/dev-notes/README.md`; references to the old notes file now point at `dev-notes.json`.

## Next
- Step 4.

## Decisions
1. **One panel.** The module-grouped panel, its markdown loader, renderer, tests and `developer-notes.md` are removed.
   `docs/api/leave.md` and code comments that cited `developer-notes.md` now cite `dev-notes.json`.
2. **Flag** reused from the last run: `VITE_PROTOTYPE` (on in `yarn dev`, on in the Vercel prototype via `vercel.json`,
   off in production builds, which drop the panel chunk and the JSON entirely). `useDevPage` / `DevPageProvider` are
   in every build: they only hold a key string and nothing reads it without the panel.
3. **Button** stays inside the existing bottom-right demo pill (as "next to the demo controls"); open, it reads "Close
   notes" and is the primary (red) button. The panel is portalled to `<body>` with `z-index` 999: under the demo pill
   (1000) and antd modals / drawers, over the page; no overlay. 460px wide, full width under 640px. Its body has 90px
   of bottom padding so the demo pill never hides the last lines.
4. **Clearing the key.** The prototype keeps the last key when a page has none; here leaving a page clears its key
   (only if it's still the current one), so a page without notes shows the empty state instead of the previous page's
   notes.
5. **Closest keys for screens the notes don't name**: Payroll Timesheet / Overtime / Reimbursements sub-tabs report
   `pay:<service>:<view>`, Payroll Attendance tabs `pay:attendance:<tab>` (all fall back to the service);
   My team's other tabs `ess:team:<tab>` and a member's timesheet page `ess:team:member` (fall back to `ess:team`);
   Payroll settings tabs other than Leave / Attendance-timesheet-overtime / Reimbursements report `pay:settings:other`
   (no notes: empty state). ESS Payslips and Documents and the Payroll Salary pages report nothing (empty state).
6. **Payroll → Leave → Balances** reports `pay:leave:details` (the notes' name for it).
7. **Leave calendar** tab id is `leave-calendar` in code; it reports `ess:team:leavecal`.
8. **Copy feedback** uses antd's message hook (no static-message warning). The page view's empty state shows "No
   notes for this page yet" with the "How to use these notes" button and a one-line hint, as in the prototype.
