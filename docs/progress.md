# Progress — Leave module updates + Developer notes panel

PROTOTYPE-SETUP. Run log. Spec: `docs/dev-notes/developer-notes.md` ("Leave module" and "Shared platform" sections; they
replace `docs/specs/leave-module-spec.md`, deleted in this run). Prototype: `docs/prototypes/leave-prototype.html`.
If a run stops, continue from the first step that isn't **done**. The previous run (Leave module, `756c594`–`c319c89`)
is finished and pushed; its log is in git history (`git show c319c89:docs/progress.md`).

| Step | Commit | Status |
|---|---|---|
| 1 — Rules: past leave only for days worked, restart an edited open request at Level 1, the leave log / recent activity | Leave: rules for past leave, editing open requests and the leave log | done |
| 2 — Data: change requests, Cancel from a date (+ dry-run check), edit pending in place, queues, endpoints, seed | Leave: change requests, cancel from a date, edit pending requests | done |
| 3 — Source docs: developer notes committed, old leave spec deleted, this log | Leave: developer notes replace the leave spec | done |
| 4 — ESS Leave: compact cards, Recent activity, type page (4 cards, one log), My requests table, request drawer | Leave: ESS overview, type log, My requests and the request drawer | done |
| 5 — Payroll navigation: no service tabs; Quick actions with waiting counts; breadcrumb + back link; redirects | Leave: Payroll services from Quick actions | done |
| 6 — API doc (`docs/api/leave.md`) for the new endpoints | Leave: API contract for changes and cancel from | done |
| 7 — Developer notes panel (prototype flag), README + docs/dev-notes/README.md | Dev notes: … | |
| 8 — VERIFY 1–8 at 1440 / 1024 / 375, type-check, lint, tests, production build, one push | Leave: verification log | |

## Done
- Step 1: `src/prototype/rules/leave.ts` (`removedPastDays`, `pastLeaveProblem`, `PAST_LEAVE_MESSAGES`, the shortened
  leave ends on the last working day), `src/prototype/rules/attendance.ts` (`restartTrail`; approved full-day leave
  stays "On leave" with a check-in), `src/prototype/rules/leaveLog.ts` (`typeLog`, `recentActivity`, `filterLog`,
  `logCounts`). Tests: `src/prototype/rules/__tests__/leaveLog.test.ts` (15).
- Step 2: `src/prototype/mocks/store/atsLeave.ts` (`leaveCancelCheck`, `requestLeaveCancellation` with `from`,
  `requestLeaveChange` / `withdrawLeaveChange` / `resubmitLeaveChange`, `applyChange`, `changeBalanceLine`, edit
  in place via `restartTrail`), `atsRequests.ts` (`atsLeaveChanges`), `atsTeam.ts` / `atsAdmin.ts` (change items in
  every leave queue), `handlers/ats.ts` + `api.ts` (endpoints), seed (`time-leaves.ts`, `ats-seed.ts`), data v9.
  Tests: `src/prototype/mocks/store/__tests__/atsLeaveUpdates.test.ts` (12).

- Step 4: `leave/EssLeavePage.tsx` (overview cards 2 / 4 a row, Recent activity, Upcoming leave, Next public holiday;
  type page with 4 cards + summary + one log with Show / status / date filters; My requests table with status filters;
  drawer via `?req=kind:id`), `leave/leaveLogUi.tsx` (TypeCard, LeaveLogTable), `leave/LeaveRequestDrawer.tsx`,
  `leave/ApplyLeaveModal.tsx` (Edit request, Change leave, edit a change), `leave/LeaveActionModals.tsx` (Cancel from +
  live worked-day check). Balances carry the type's carry-forward limit (`carryForward`).

- Step 5: `src/prototype/persona/payrollServices.tsx` (service links, labels, "Payroll › Services › {service}"),
  `CustomBreadcrumb.tsx` (uses it on service pages), `payroll/admin/adminShared.tsx` (`PayrollServiceBar` replaces
  `PayrollServiceTabs`: "‹ Back to dashboard" + "N waiting for you"), the five service pages + Payroll settings,
  `Dash.tsx` + `NavigationCards.tsx` (Quick actions heading, waiting badge and "N waiting" per tile, Payroll settings
  tile), `routes/sections/payroll.tsx` (redirects).

- Step 6: `docs/api/leave.md` — `LeaveChange`, `changedFrom`, the new endpoints (`cancel-check`, `change`,
  `changes/:id/withdraw|resubmit`), `cancel` with `from`, `resubmit` while pending, `leaveKind = change`, the effects.

## Next
- Step 7 (Developer notes panel).

## Decisions
1. **Spec.** `docs/dev-notes/developer-notes.md` is the spec; `docs/specs/leave-module-spec.md` is deleted. The notes'
   personas (Rohan Mehta / Priya Nair) stay prototype-only names; the repo keeps Sneha Iyer (ESS - Employee) and Arjun
   Mehta (ESS - Manager), as in the last run.
2. **Editing a pending request** reuses `POST leave/requests/:id/resubmit` (now allowed while pending at either level,
   not only after "Ask for update"). It saves in place and restarts at Level 1; the history says "Edited and
   resubmitted". Cancellation and comp off requests can be edited the same way.
3. **Change requests** are a new item (`LeaveChange`, collection `ats-leave-changes`) with the leave approvers, shown in
   My team → Approvals and Payroll → Leave → Requests as a leave item of kind "change". While one waits: the original
   is untouched and counted as before; the change's own days are not counted again as "in request" (no double
   counting). It is checked like a new request with the original left out (so its days count as free). On approval
   the original is updated in place (same id) and keeps `changedFrom` ("Was"); days beyond the balance are flagged as
   loss of pay, like "Approve anyway". The approver's balance line for a change uses the balance with the original's
   days given back.
4. **One follow-up at a time.** An approved leave can have one open cancellation or change at a time; Change leave and
   Cancel leave are hidden while one waits.
5. **Cancel from.** The employee picks "Whole leave" or "From a date" (any day of the leave). Days before today must
   have been worked: a check-in in attendance modes, timesheet entries in timesheet-only mode. In "neither" mode
   nothing can prove it, so past days are refused with "ask HR to change it". Today and later need no proof.
6. **HR cancel** keeps its rule from the notes (Payroll → Leaves: applies at once, only the days from today once the
   leave has started) and never runs the worked-day check.
7. **Leave and a check-in on the same day.** Before, a check-in overrode approved full-day leave (the day showed as
   Present/Late and could even get a late mark). Now approved full-day leave stays the day's status ("{type} ·
   checked in", no late mark, no overtime from it) until a cancellation or change is approved; then the check-in
   counts as a worked day. Half-day leave is unchanged.
8. **Shortened leave ends on a working day.** Cancelling from a Monday ends the leave on the Friday before, not on the
   Sunday.
9. **Demo data.** Sneha has a past 2-day casual leave ("Plumbing work at home", ~50 working days back) with no
   check-in on day 1 and a check-in on day 2: cancelling the whole leave is refused; cancelling from day 2 works.
   Persisted demo data bumped to v9.
10. **Source documents.** `docs/dev-notes/developer-notes.md` and the updated `docs/prototypes/leave-prototype.html` are
    committed as sources. The unrelated local change to `docs/prototypes/attendance-timesheet.html` is left alone.
11. **Commit hooks.** Husky hooks aren't installed in this checkout (no `.husky/_`), so commits run no hooks; the
    commitlint config would reject the "Leave: …" format the run asks for. Lint, type-check and tests are run by hand.
12. **ESS overview content.** Only the compact cards, Recent activity, Upcoming leave and Next public holiday. The
    old Loss of pay card is a one-line alert above the cards (only when there is loss of pay); the old "Late check-in
    deductions" panel is gone from Leave (late deductions and reversals are in Recent activity and each type's log; the
    full list with disputes stays in Attendance → Notes). Probation / exit banners stay.
13. **Comp off card** shows "available / earned days" (comp off has no yearly total).
14. **Type page "Days (+/−)"**: approved and in-request leave show −days; rejected / withdrawn / cancelled requests and
    change requests show their days in grey without a sign (nothing moved); a reversal is an info row (its text says
    "+0.5 reversed"), as in the ledger.
15. **Recent activity** = every dated event (request sent, each decision, edits, withdrawals, cancellations, approved
    changes, comp off, credits, carry forward, lapses, late deductions, reversals, expiries), newest first, last 10.
    Future-dated credits aren't shown. Clicking any request row opens its drawer.
16. **My requests** lists leave, cancellation, change and comp off requests in one table (newest first); "Rejected or
    withdrawn" also holds cancelled leave. A pending cancellation / change shows under the leave's status.
17. **Payroll navigation.** The service tabs component is gone; every service page has the breadcrumb
    "Payroll › Services › {service}" ("Services" links to the dashboard's Quick actions) and "‹ Back to dashboard"
    with "N waiting for you". Quick actions tiles: Employees & Departments (profile updates waiting), Salary, Leave,
    Attendance, Reimbursements, Timesheet, Overtime (each with what's waiting) and a new Payroll settings tile, then
    the existing Company documents, Reports, Announcements, Payslip and CTC tiles. "Leaves" / "Timesheets" tiles are
    renamed "Leave" / "Timesheet" (the service names). Tiles still follow the tracking mode (no Timesheet in
    attendance-only, no Attendance in timesheet-only, neither + no Overtime in "neither").
18. **Redirects.** Already in place and kept: `/payroll/approvals` → Timesheet › Requests, `/payroll/timesheets` →
    Timesheet › Overview, `/payroll/employee-Leaves` → Leave, `/payroll/leave-summary/:id` → Leave (that employee),
    Payroll settings tab 11 → Leave Policies. New: `/payroll/services` → dashboard Quick actions;
    `/payroll/services/attendance` → Attendance; `/payroll/services/employees` → Employees;
    `/payroll/services/settings` and `/payroll/services/payroll-settings` → Payroll settings. The service pages keep
    their URLs (`/payroll/services/timesheet|leave|overtime|reimbursements`, `/payroll/timesheet`, `/payroll/employees`,
    `/payroll/HR-settings`), so bookmarks keep working.
