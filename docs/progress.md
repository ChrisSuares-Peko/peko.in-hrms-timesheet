# Progress — Developer notes panel, page-by-page version

PROTOTYPE-SETUP. Run log. Sources: `docs/dev-notes/dev-notes.json` (the notes) and
`docs/prototypes/leave-prototype.html` (the panel's look and behaviour). If a run stops, continue from the first step
that isn't **done**. The previous run (Leave module updates + module-grouped notes panel, `c34e05f`–`9b91229`) is
finished and pushed; its log is in git history (`git show 9b91229:docs/progress.md`).

## Small update: Leave configuration (commit "Settings: move late check-in deduction to attendance") — done

- **Leave → Configuration** now has four panels: Leave year (with the roll-forward note), Leave requests, Sandwich rule, Comp off.
  The "Probation and pro-rating" panel is gone. Its rules are unchanged: they stay in the leave engine (status-based probation,
  15th-of-the-month pro-rating). The "Late check-in deduction" panel is gone from this page too.
- **Attendance, timesheet & overtime**: the "Late check-in deduction" panel sits below Overtime, with the same fields (days per late
  mark, 0 = off; deduct from {type} then {type} then loss of pay). It's shown only when check-in is tracked
  (Attendance only, Attendance + timesheet), using `hasCheckIn`.
- Decisions:
  1. **One save.** The panel is part of the page's form and is saved with **Save settings** (PUT settings). The days go
     in `lateDeductionDays`; the order goes in a *partial* `leavePolicy: { lateOrder }`. The store already merged a partial
     policy, so the rest of the policy is kept. `updateAtsSettings` now types its body that way. No new endpoint.
     `PUT leave-settings/config` still accepts the two fields, but the UI no longer sends them.
  2. **Hidden values are kept.** In Timesheet only or Neither mode the panel is hidden. Saving keeps the stored values,
     and deductions don't run anyway, because they need check-in.
  3. **Existing values are kept.** Nothing is migrated: both pages read and write the same stored settings.
  4. **The copy says "a correction is approved"**, matching the updated prototype (before, it said "a dispute is approved").
- Checks:
  - Leave → Configuration lists exactly the four cards.
  - The new card appears under Overtime, hides in Timesheet only mode and comes back afterwards.
  - Changing the settings to 1 day with Casual first and saving holds after a reload. Sneha's late check-ins then show
    −1 under Casual (before the change: −0.5 under Annual).
  - The Developer notes panel shows the new content for `pay:settings:leave:config` (the panel list plus "Not settings")
    and for `pay:settings:ato` (the "Late check-in deduction (attendance setting)" section).
  - A new store test covers the save path.
  - Type-check, lint, tests and build: see the commit.

| Step | Commit | Status |
|---|---|---|
| 1 — Remove the module-grouped panel; page-key context + `useDevPage`; new docked panel on `dev-notes.json` | Dev notes: page-by-page panel replaces the module notes | done |
| 2 — Every mapped screen and sub-tab reports its key | Dev notes: pages report their notes key | done |
| 3 — README flag section, `docs/dev-notes/README.md` (how to update, key list) | Dev notes: how to update the notes and the key list | done |
| 4 — VERIFY 1–5 at 1440 / 1024 / 375, type-check, lint, tests, production build, one push | Dev notes: verification log | done |

## Done
- Step 1: removed `src/prototype/devNotes/devNotes.tsx` (markdown loader, module map, renderer), its tests and
  `docs/dev-notes/developer-notes.md`; rewrote `src/prototype/devNotes/DevNotesPanel.tsx`; added `devPage.tsx`
  (`DevPageProvider`, `useDevPage`, `useCurrentDevPage`) and `notes.ts` (`DEV_NOTES`, `notesFor` with the fallback);
  `DevPageProvider` wraps the router and demo controls in `App.tsx`. Tests: `src/prototype/devNotes/__tests__/devNotes.test.tsx`.
- Step 2: `useDevPage` in the ESS Overview, Leave, Attendance & Timesheet, My team (+ member page), Reimbursements,
  Profile; Payroll dashboard, Leave, Timesheet, Attendance, Overtime / Reimbursements, Employees; Payroll settings and
  its Leave Policies sub-tabs.
- Step 3: `README.md`, `docs/dev-notes/README.md`; references to the old notes file now point at `dev-notes.json`.

- Polish (`7e6148c`): copy feedback on the Copy button instead of a toast; a new page starts scrolled to the top.

## VERIFY (Chrome via a scripted browser at 1440 / 1024 / 375; the panel stayed open while clicking on desktop and
tablet; on phones, where it is full width, it was closed, the page changed, and it was reopened)
1. Pass — 33 steps: ESS Overview → Leave (sidebar) → My requests → Public holidays → Overview → a type's details →
   Attendance → Timesheet → My team (Approvals, Today → falls back to My team, Leave calendar) → Reimbursements →
   Profile → Payslips (empty state) → Payroll dashboard → Leave tile → Leaves → Requests → Balances → Overview →
   Timesheet / Attendance / Overtime / Reimbursements / Employees → Payroll settings → Leave Policies → all four
   sub-tabs → Attendance, timesheet & overtime → Reimbursements. The title changed on every step with the panel
   open; the clicks on the page (sidebar, sub-tabs, cards, the dashboard tile, settings tabs) worked with it open.
   No overlay; 460px on desktop and tablet, full width on phones; no horizontal overflow.
2. Pass — Copy prompt copies the page's prompt (button shows "Copied"); How to use these notes shows the intro,
   Reading the prototype, Build order, Shared rules and the kickoff prompt; its Copy works; "‹ Back to this page’s
   notes" returns to the page.
3. Pass — `ess:team:today`, `pay:timesheet:requests`, `pay:attendance:1`, `pay:overtime:overview` show their parent's
   notes; Payslips and the other Payroll settings tabs show "No notes for this page yet".
4. Pass — production build (no flag): no panel code or notes text in `dist`; served, it shows the demo pill without
   the Developer notes button. With `VITE_PROTOTYPE=true`: the notes are one lazy chunk.
5. Pass — no console errors from the new code (remaining messages are pre-existing: the sidebar's `stringLabel` prop,
   external font lookups, antd deprecations on older pages). Type-check clean; ESLint 3 errors, all pre-existing in
   `src/prototype/mocks/store/requestStores.ts`; tests 5713 passed, 359 failed in 161 files, all in unrelated files
   that also fail on `9b91229` (e.g. `src/domains/employee/__tests__/…`, checked) plus the known "timesheet v6: Excel
   round trip"; production build passes.

## Next
- Nothing left in scope.

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
8. **Copy feedback** is on the Copy button itself ("Copied" for 2 s), not a toast: on phones a toast covered the panel's Back button. A new page or the guide starts scrolled to the top. The page view's empty state shows "No
   notes for this page yet" with the "How to use these notes" button and a one-line hint, as in the prototype.
9. **Source prototype.** Your updated `docs/prototypes/leave-prototype.html` (the panel's reference) is committed with
   the verification log, as the source for this run.
