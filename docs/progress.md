# Progress — Design update: Peko design language

PROTOTYPE-SETUP. Run log. Sources: `docs/dev-notes/dev-notes.json` (the notes) and
`docs/prototypes/leave-prototype.html` (the panel's look and behaviour). If a run stops, continue from the first step
that isn't **done**. The previous run (Leave module updates + module-grouped notes panel, `c34e05f`–`9b91229`) is
finished and pushed; its log is in git history (`git show 9b91229:docs/progress.md`).

## Design update: Peko design language for the ESS & Payroll redesign screens — in progress

Look only: no behaviour, data, route, validation or wording changes (apart from the new one-line descriptions the
design asks for, listed under Decisions). Rules: `docs/design/peko-design-language.md`. Screenshots:
`docs/design/screens/before/` and `docs/design/screens/after/`.

| Step | Commit | Status |
|---|---|---|
| 0 — Shared pieces: PekoScope (one theme layer), StatusTag, page header, sweep of radii/borders/greys/red | Design: shared Peko scope, status tag and page header | done |
| 1 — Payroll dashboard: Quick actions as cards | Design: Payroll dashboard quick actions | done |
| 2 — Payroll Leave: all sub-tabs + Add leave drawer | | |
| 3 — Payroll settings: Leave sub-tabs, Attendance/timesheet/overtime, Reimbursements | | |
| 4 — ESS Leave: Overview, type details, My requests + drawer, Public holidays, Apply and comp off modals | | |
| 5 — My team | | |
| 6 — Remaining ESS and Payroll screens in scope | | |
| 7 — VERIFY 1–8, build, push | | |

Decisions:
1. **Reference.** `docs/prototypes/leave-prototype.html` is the same file as the last run (no Peko palette: it uses
   #E30000 red, blue links, 12px panels, a dark segmented control). Where it disagrees with the design rules in the
   brief or the Peko theme, the rules and the theme win; the prototype is used for layout (what sits where).
2. **No `src/whitelabel/peko.ts` in this code base.** Its values (hover #FF6963, active #E02B2B, surface #FFF7F6, border
   #FFE4E4) are taken from the brief and kept in `src/components/peko/pekoTokens.ts`, next to the antd.config and
   tailwind values they sit with.
3. **One theme layer.** The ESS layout already nested a ConfigProvider (`EssThemeProvider`, with its own #FF4F4F red and
   32px cards). It now renders `PekoScope`, which nests in the global theme and keeps its values (#FF3A3A, #121212,
   36px controls, radius 6); the global `src/antd.config.tsx` is untouched. The same scope wraps every Payroll service
   page and Payroll settings (in `src/routes/sections/payroll.tsx`), so their modals and drawers get it through the
   ConfigProvider context. Payroll settings is wrapped as a whole page, so its other tabs (Company Profile, Payroll Cycle…)
   also get the Peko tabs, table header and card details.
4. **Modal and drawer dividers, card shadow, tag pills** come from ConfigProvider class names (`modal`, `drawer`,
   `card`, `tag`, `alert`, `segmented`, `tabs`) styled in `src/components/peko/peko.css`, because they reach portals.
5. **StatusTag** maps the antd preset colours screens already used onto the six pairs, so every `<Tag>` in scope became
   `<StatusTag>` without changing which status gets which meaning. Two maps moved to match the rules: holiday days
   (cyan → leave pair) and "Update requested" timesheet periods (red → warning pair). The "Leave" chip on the Overview
   status table and leave-type chips use the leave pair.
6. **Stat values are #121212.** CountTile no longer colours values (blue "Waiting for you", green "Approved"); the
   label/value/line carry the meaning.
7. **`danger` on primary buttons removed** (Send for approval, Save settings, Add leave type, Edit…): with the theme's
   primary already red, `danger` only swapped #FF3A3A for #FF4D4F. Destructive buttons (Delete, Cancel request, remove
   break) keep `danger`.
8. **Request rows**: Reject / Ask for update / Approve are small (28px); Approve is outlined green (`peko-approve`).
   "Approve anyway" in the Not enough leave dialog stays primary (it's a dialog footer, not a row).
9. **Quick actions** are cards with an antd outline icon in #EA3639 (the old illustrated PNG/SVG icons can't take the
   icon colour) and one grey line each. Service lines are the prototype's ("Leave, requests and balances", "Expense
   claims"…); the other tiles got short new lines (Salary "Salaries and pay runs", Company Documents "Policies and
   company files", Reports & Forms "Payroll reports and statutory forms", Announcements "News for your employees",
   Download Payslip "Payslips for any month", CTC Calculator "Work out salary from CTC"). The waiting count is the red
   badge top right ("N waiting" as its label and tooltip) instead of a line under the name.
10. **Page header descriptions** that didn't exist before: Attendance "Everyone’s daily attendance, monthly summary,
    holidays, shifts and correction requests.", Employees "Employees, departments and profile updates.", Payroll
    Settings "Rules for payroll and every service: leave, attendance, timesheet, overtime and reimbursements."
11. **Page actions on the tab row**: Leave ("Add leave"), Attendance ("Mark Attendance", "Add Holiday", now primary).
    Employees keeps its three actions beside the title: its tab row has seven tabs and no room.
12. **Main-tab counts** are small red pills (antd Badge): Attendance "Requests", Employees "Profile Update Request",
    "Document Requests", "Profile updates". Segmented sub-tabs keep their "Requests (1)" text.
13. **Content width**: the scope caps content at 1320px; the dashboard layout already gives ~40px side padding on
    desktop, so it isn't changed.

## Leave settings + comp off calendar + approvers — done

| Step | Commit | Status |
|---|---|---|
| 1 — Leave types: Action column (View · Edit · Delete), drawer sections, unused leave on leaving, Show to employees | Leave: leave types Action column, drawer sections, … | done |
| 2 — ESS comp off: month calendar of weekly offs and holidays | Leave: comp off day picker is a calendar of weekly offs and holidays | done |
| 3 — Approvers: Reporting manager · Admin / HR · a person at both levels; manager at level 2 | Approvers: Reporting manager, Admin / HR or a person … | done |
| 4 — Late check-in deduction only under Attendance, timesheet & overtime | (previous run, `2fe83d7`; checked again) | done |

Decisions:
1. **Unused leave on leaving** is a new field, `onLeaving: 'ENCASH' | 'BRING_FORWARD'`, which replaces `encashOnExit`.
   - Stored policies map on read (`migrateLeavePolicy` → `onLeavingOf`): true → ENCASH, false → BRING_FORWARD. The store
     also accepts the old flag on write.
   - Only the choice is stored. The settlement adds a display-only `bringForward` amount, and the ESS leaving banner says
     "Casual: 2 days can be used to bring your last working day forward." No F&F or payroll change.
   - The defaults keep Annual on encash; the others bring the last working day forward (the old `false`).
2. **Show to employees** is the existing `active` flag, now edited in the drawer and saved with the type (no confirmation:
   it doesn't change balances). The table's Deactivate/Activate button is gone. The `PATCH …/active` endpoint stays for
   older callers.
3. **Delete** (renamed from Remove) is disabled for used types. The tooltip sits on a wrapper, because a disabled button
   doesn't fire hover events. Delete still asks for confirmation.
4. **Drawer order** follows the notes: Carry forward is under "Other". In the prototype it sits under "When an employee
   joins", but the notes are the spec.
5. **Comp off calendar** gets its data from a new endpoint, `GET leave/comp-off/calendar?month=` (`compOffCalendar`). The rule
   is the pure `compOffDayAvailable`.
   - Pickable: a weekly off or public holiday on the employee's own schedule, not in the future, inside the expiry window
     and not already claimed. Resubmitting keeps the request's own day open (`exclude`).
   - Hours worked are still checked after picking, so an off day with no work can be picked and is refused with the
     reason. This matches the prototype, which disables only working, future, expired and claimed days.
   - Next month is disabled after the current one. The calendar opens on the request's day when resubmitting, otherwise
     on this month.
6. **Admin / HR** is one choice, stored as `HR`.
   - Older team values (Payroll, HR, Admin, Finance) keep routing to the Payroll queues exactly as before. Every screen
     shows them as "Admin / HR", and the settings form saves them as `HR` on the next save.
   - The team names in trails, statuses, the activity log and Home ("HR team", "Payroll team"…) now read "Admin / HR".
     Profile updates still say "HR team" in the trail steps.
7. **Reporting manager at level 2** resolves to the employee's manager when the request is submitted (approvers are fixed
   on each request).
   - If level 1 is the same person, level 2 is dropped and level 1 is final (`samePerson`). This also applies to a
     specific person who is the manager, and to timesheet periods.
   - Level 1 is resolved at submit too, so "the person who approved level 1" is the resolved level-1 person. A team at
     level 1 is never the same as a manager at level 2.
8. **Help text**: the approvals card is shared by Attendance, timesheet & overtime, Leave → Approvals and
   Reimbursements, so one change updates all three tables.

Checks (Chrome, scripted, 1440 and 375):
- **Leave types table:** the headers end in "Action". There's no Deactivate/Activate button. Delete is disabled for
  Annual, Casual and Sick (used) and enabled for Maternity and Paternity. The tooltip text matches the notes.
- **Drawer:** it shows the three section headings. Casual is set to "Use it to bring the last working day forward"
  (mapped from `false`). Turning "Show to employees" off and saving marks Casual Inactive.
- **ESS after deactivating Casual:** the leave cards and the Apply leave types no longer include Casual.
- **Comp off calendar (November 2026):**
  - Working days available: 0. Available: weekly offs and holidays only (no future days). Dots on worked days 8 and 14.
  - Legend: Public holiday · Weekly off · You worked · Not available. Next month is disabled.
  - Picking 8 Nov shows "0.5 day of comp off · Deepavali, 4h 45m worked".
- **Approvers:** Level 1 offers Reporting manager · Admin / HR (approved in Payroll) · a specific person; Level 2 offers
  the same plus None. The leave Level 2 that was stored as `HR` shows as Admin / HR.
- **Routing** (store tests): manager → Admin / HR; Admin / HR → manager at level 2; manager at both levels approves once;
  older team values still route; the leaving banner wording.
- **Leave → Configuration:** only Leave year, Leave requests, Sandwich rule and Comp off; no late check-in panel. No page
  overflow at 375 and no console errors.
- **Pre-existing failures:** "payroll admin: leave › off today" fails on the previous commit too, because today
  (21 Nov 2026) is a Saturday. The known "Excel round trip" test also still fails.
- **Type-check:** clean. **Lint:** only the 3 existing errors in `requestStores.ts`. **Build:** passes. **Tests:** no new
  failures. The only failures in prototype code are the two above; the rest are the unrelated domain files that already
  failed.

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
  - Type-check: clean. Lint: only the 3 existing errors in `requestStores.ts`. Build: passes. Tests: in prototype code
    only the known "Excel round trip" test fails. The other failing files are unrelated (WhatsApp, PekoCloud, eSign,
    user management) and failed before this change too.

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
