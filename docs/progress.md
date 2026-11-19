# Progress — Leave module (full build)

PROTOTYPE-SETUP. Run log for the Leave module (spec: docs/specs/leave-module-spec.md; prototype: docs/prototypes/leave-prototype.html).
If a run is interrupted, continue from the first step that isn't **done**. The previous run (Settings, `10b3f2c`–`f1e292c`) is finished and pushed.

| Step | Commit | Status |
|---|---|---|
| 1 — Leave rules as tested pure functions (src/prototype/rules/leave.ts) + new leave types | Leave: rules engine | done |
| 2 — Data layer: settings migration, holidays, per-employee schedule, leave / cancellation / comp off stores, routing | Leave: data layer and mock endpoints | done |
| 3 — Mock endpoints + docs/api/leave.md | Leave: API contract | done |
| 4 — Payroll settings → Leave Policies (Leave types · Public holidays · Configuration · Approvals) | Leave: Leave Policies settings, Attendance notes, demo probation toggle | done |
| 5 — Payroll → Employee leaves (Overview · Leaves · Requests · Balances) + HR Add leave | Leave: ESS Leaves, Payroll Leave and the approver line | done |
| 6 — ESS → Leaves (Overview · My requests · Public holidays, type pages, Apply, Cancel, Comp off) | Leave: ESS Leaves, Payroll Leave and the approver line | done |
| 7 — Approver view (balance line, Not enough leave, Leave calendar panel) | Leave: ESS Leaves, Payroll Leave and the approver line | done |
| 8 — Attendance Notes panel (late deductions + disputes); attendance / timesheet effects | Leave: Leave Policies settings, … | done |
| Performance: each employee's year cached until its data changes | Leave: cache each employee's leave year … | done |
| VERIFY 1–10 (desktop / tablet / phone), production build, single push | Leave: verification log | done |

## Done
- Step 1: `src/prototype/rules/leave.ts` (leave year, credits start-of-cycle / monthly / daily, 15th pro-rata, status-based
  probation, carry forward + roll-forward day, exit settlement, available, day counting with the employee's own calendar,
  half days over a range, sandwich rule, comp off days / eligibility / expiry (oldest first), cancellation, late deduction
  order + reversal, Requests views per approval setup, loss of pay on approval, the per-employee year aggregator, the
  migration of the stored policy). 47 tests in `src/prototype/rules/__tests__/leave.test.ts`.
  The new types are in `src/domains/attendanceTimesheet/types.ts` (leave section). The code base doesn't type-check
  again until step 2 moves the stores and screens onto them.

- Step 2: `atsLeave.ts` rewritten on the rules (view, apply / withdraw / resubmit, cancellation requests, comp off, HR add /
  cancel, mark active, admin lists, Leave Policies settings); `atsHolidays.ts` (editable holidays); `atsRequests.ts` (cancel
  and comp off collections, employee status); `atsTeam.ts` / `atsAdmin.ts` (three leave item kinds in one queue, effects
  on final approval, balance line); `scheduleOf` / `settingsFor` (per-employee schedule) in `atsStore.ts`. Store tests:
  `atsLeaveModule.test.ts` (14, one per VERIFY item) and the existing store tests moved to the new API.
- Step 3: `docs/api/leave.md` (model, rules, every endpoint, effects, data mapping). Endpoints added to the mock layer:
  see that file (ESS: cancel / comp off; Payroll: overview, leaves, add, cancel, mark active, balances, employee types;
  settings: leave-settings, types CRUD, config, holidays).

- Steps 4–8: `leave/settings/LeavePoliciesTab.tsx` + `LeaveTypeDrawer.tsx` (Payroll settings → Leave Policies);
  `payroll/admin/AdminLeavePage.tsx` + `HrAddLeaveDrawer.tsx` (Payroll → Leave); `leave/EssLeavePage.tsx`,
  `ApplyLeaveModal.tsx`, `LeaveActionModals.tsx`, `leaveUi.tsx` (ESS → Leaves); `components/RequestQueue.tsx` (balance
  line + Not enough leave, everywhere a leave request is decided), `team/TeamLeaveCalendar.tsx` (Leave to approve: leave
  requests only, type names); `payroll/admin/AdminRequestsList.tsx` (views from the approval setup, no Approved view for
  leave); `ess/LateNotesPanel.tsx` (Attendance → Notes); `prototype/DataModeToggle.tsx` (Leave (demo): persona on
  probation / Active). Old `leave/LateDeductions.tsx` and the Settings run's leave cards in `AtsSettingsTab.tsx` removed.

## VERIFY (checked in Chrome via a scripted browser at 1440 / 1024 / 375 and with the store tests)
1. Pass — added a daily type (store test) and "Menstrual leave" (female) in the UI: Sneha sees it, Arjun doesn't; editing
   Annual's days asked "This changes Annual balances for 21 employees from today…".
2. Pass — 10 / 4 / 2 → 4 in the rule test; Sneha's Annual 6.5 and Casual 4 match on the cards, the Apply form, HR's
   drawer (store test) and Balances.
3. Pass — Mon–Fri first halves showed "5 half days = 2.5 days of leave"; after approval each day is "Half-day leave
   (first half)" in attendance and has an "Annual leave (first half)" timesheet row (store test).
4. Pass — Fri + Mon: "4 days: 2 working days + 2 days off in between (sandwich rule)" with the rule on, "2 working days"
   off (UI).
5. Pass — employee: Cancel leave → "Send for approval", "Cancellation requested" chip; days come back after approval
   (store test). HR: applies at once; started leave cancels from today only (store test).
6. Pass — last Saturday: "1 day of comp off · weekly off, 9h 5m worked"; refused once overtime is claimed; approved →
   Comp off balance; expires after the setting (store tests).
7. Pass — HR adding Maternity for Kavya (Probation): "Maternity leave isn’t available while Kavya is on probation.";
   Mark active → Active, Maternity 60.67 available.
8. Pass — Notes panel shows Raise dispute / waiting for Arjun Mehta / rejected with the comment + Dispute again; an
   approved dispute reverses (store test).
9. Pass — rule test (team at both levels → no With managers view); UI with the default setup shows Waiting for you ·
   With managers · Update requested · Rejected · All.
10. See the report: no console errors from the new screens (only pre-existing sidebar / font / antd warnings).

## Checks at the end
- Type-check: clean. ESLint: 3 errors, all pre-existing in `src/prototype/mocks/store/requestStores.ts` (untouched).
- Tests: 5673 passed, 366 failed in 166 files (baseline before this run: 370 failed in 170 files, all in unrelated
  domains). The one failure in this area, "timesheet v6: Excel round trip", already failed in the baseline (last week
  holds the Balipadyami holiday row).
- Production build (`vite build`): passes.

## Next
- Nothing left in scope. Leftovers for the backend team are in the run report.

## Decisions
1. **Where the screens are.** "Payroll → Employee Leaves" in this repo is already folded into Payroll → Leave
   (`/payroll/services/leave`, AdminLeavePage; the old `employee-Leaves` route redirects there). The Leave module's
   Payroll screen is built there (sub-tabs Overview · Leaves · Requests · Balances). "Payroll settings → Leave Policies"
   is the Payroll settings tab with key 5; it's rebuilt with the four sub-tabs, and the separate "Leave" tab added by the
   Settings run (key 11) now redirects to it (nothing is in two places).
2. **Personas.** The repo's own personas stay: ESS - Employee = Sneha Iyer (ACME-004, female), ESS - Manager = Arjun Mehta
   (ACME-001, male). The prototype's Rohan Mehta / Priya Nair are prototype-only names.
3. **Leave type ids.** A leave type is identified by an id string. The existing ids stay (`ANNUAL`, `CASUAL`, `SICK`), so
   stored requests keep working; the original Payroll policies' Maternity / Paternity become `MATERNITY` / `PATERNITY`;
   types HR adds get `LT-<NAME>`; comp off is `COMP_OFF` (shown only while comp off is on, never in the types table).
4. **Leave policy data mapping** (nothing lost):
   - Annual / Casual / Sick keep the live values the ESS balances already used (12 monthly, carry 30, encash; 8 and 6 at
     the start of the cycle). `UPFRONT` → "At the start of the leave cycle".
   - The Settings run's "Sick leave proof after N days" moves onto Sick as its supporting-document rule (default 3).
   - Maternity (182 days, female, at the start of the cycle, not available on probation, document always) and Paternity
     (5 days, male, not available on probation) come from the original Payroll leave policies list.
   - The original list's numbers for Casual / Sick / Annual (12 / 12 / 18) were already superseded by the live policy in
     the Final batch run; the live numbers win. Its "Unpaid Leave" option is removed: every type is paid.
   - The probation length (6 months) is dropped: probation is a status (Probation until HR marks the employee Active).
   - Probation rule per type (new field): Annual and Casual "credited monthly", Sick "full entitlement", Maternity and
     Paternity "not available".
5. **Late deductions take the whole amount from one type** (the first in the order with enough left), else loss of pay —
   as in the prototype (the earlier build split a deduction across types).
6. **Probation and mid-month confirmation.** When HR marks someone Active, a month counts as a normal month if they were
   confirmed on or before the 15th (the same rule as joining). Start-of-cycle types credit the rest of the year on the
   confirmation day.
7. **Per-employee schedule.** The employee record (MockEmployee) gets an optional `workSchedule { weeklyOff, shift }`; when
   absent the company's Attendance & Timesheet settings apply. Every leave rule and the day derivation (late marks,
   half days, expected hours, leave rows, comp off) reads it through `scheduleOf` / `settingsFor`. No demo employee has
   a different schedule (so seeded attendance stays consistent); a Sunday–Thursday case is covered in the rule tests.
8. **Public holidays are editable data** (`ats-holidays`, seeded from the calendar's public holidays for last / this /
   next year). Before, only the current year's static list was used, so next January's Republic Day now counts as a
   holiday in leave day counts (one store test was widened for that).
9. **Comp off demo data.** Sneha worked last Saturday (full shift → 1 day) and the Sunday before (half a shift → 0.5);
   Vikram's existing worked Saturday has a pending 0.5-day comp off request with Arjun.
10. **Loss of pay is only flagged**: late deductions with nothing left (`lossOfPayDays` on the view) and leave approved
    beyond what was left (`lossOfPayDays` on the request). No payroll calculation changes.
11. **Persisted demo data version** bumped to v8 (shapes changed); older settings are still migrated on read.
12. **Source documents committed**: `docs/specs/leave-module-spec.md` and `docs/prototypes/leave-prototype.html` were
    untracked; they're committed with the API doc. The unrelated local change to `docs/prototypes/attendance-timesheet.html`
    is left alone.
13. **Requests views with a team at level 1.** Items waiting on a team at either level are "Waiting for you" in Payroll
    (the admin is every team in this prototype), so Approve / Ask for update / Reject work at level 1 too.
14. **Leave calendar side panel** lists leave requests only (cancellations and comp off have no dates to show on it; they
    stay in Approvals / Requests).
15. **Demo controls.** The ESS Leave page's old "dates for the leave demo" panel is gone (prototype-only per the spec);
    the global prototype "Demo" menu gains "Put Sneha on probation / Mark Sneha active" so VERIFY 7 can be run from ESS.
16. **Employee details → Leave Policies** (the per-employee legacy tab) still reads the legacy `leave-component` mock data;
    it's outside this scope and needs the backend to serve the new leave types.
17. **Bulk approve** skips the "Not enough leave" question (each item is approved as a single approval would be; days
    beyond the balance are still flagged as loss of pay).
