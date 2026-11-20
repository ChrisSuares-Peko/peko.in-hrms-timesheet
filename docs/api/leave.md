# Leave module API

PROTOTYPE-SETUP (Leave module). Mock API served by `src/prototype/mocks/handlers/ats.ts` under
`{userType}/{userId}/payroll/ats/`, every response wrapped in `SuccessGenericResponse<T>`. Rule breaks come back as
4xx with the message (the API client's interceptor shows it as a toast). Spec: `docs/dev-notes/developer-notes.md` (Leave module + Shared platform).

- Rules: `src/prototype/rules/leave.ts` (pure, tested in `rules/__tests__/leave.test.ts`).
- Stores: `src/prototype/mocks/store/atsLeave.ts` (views and actions), `atsRequests.ts` (collections),
  `atsHolidays.ts` (public holidays), `atsTeam.ts` / `atsAdmin.ts` (approval queues and decisions).
- Types: `src/domains/attendanceTimesheet/types.ts` (leave section). Client: `src/domains/attendanceTimesheet/api.ts`.
- This supersedes `docs/api/leave-policy.md` (three fixed types, probation length).

## Model

### Leave types (`LeaveTypeConfig`)

| Field | Values | Meaning |
|---|---|---|
| `id` | `ANNUAL`, `CASUAL`, `SICK`, `MATERNITY`, `PATERNITY`, `LT-<NAME>` | Stable id; requests store it. |
| `name` | text | What employees see ("Annual" shows as "Annual leave"). |
| `daysPerYear` | > 0, halves allowed | A full cycle's entitlement. |
| `credit` | `CYCLE_START` · `MONTHLY` · `DAILY` | At the start of the leave cycle · days ÷ 12 on the 1st (not rounded) · days × days elapsed ÷ days in the cycle. |
| `probation` | `MONTHLY` · `FULL` · `NONE` | While the employee's status is Probation: credited monthly · full entitlement · not available. |
| `carryForward` | ≥ 0 | Unused days carried into the next cycle, up to this; the rest lapses. |
| `encashOnExit` | bool | Unused days paid in the final settlement. |
| `proofAfterDays` | `null` · 0 · N | Supporting document: never · always · when longer than N days. |
| `appliesTo` | `ALL` · `FEMALE` · `MALE` | Who sees it. Other employees never see the type. |
| `active` | bool | Inactive types are hidden from the forms; history stays. |

All types are paid. Loss of pay only happens when a balance runs out (late deductions, or an approver approving anyway).
`COMP_OFF` ("Comp off") is added to an employee's types while comp off is on; it's never in the types table.

### Policy (`settings.leavePolicy`)

`{ year: 'COMPANY' | 'JOINING', cycleStart: 'MM-DD', types: LeaveTypeConfig[], sandwich: 'OFF' | 'WEEKLY_OFFS' | 'WEEKLY_OFFS_AND_HOLIDAYS', compOff: { enabled, expiryDays }, lateOrder: string[] }`,
plus `settings.leaveRules.halfDay` and `settings.lateDeductionDays` (0 = off). Approvers: `settings.level1.leave` /
`settings.level2.leave` (leave cancellations and comp off use them too).

A policy stored in the earlier shape (`types` as `{ ANNUAL: { daysPerYear, credit: 'UPFRONT' | 'MONTHLY', carryForward, encashOnExit } }`,
`probationMonths`, `leaveRules.proofDays`) is mapped by `migrateLeavePolicy` when settings are read — see "Data mapping".

### Employee status

`lifeOf(employee)`: `{ dateOfJoin, exitDate, status: 'PROBATION' | 'ACTIVE', confirmedOn }`. Probation lasts until HR marks
the employee Active (`confirmedOn` = that day). Seeded: the new joiner (ACME-015) and ACME-020 are on probation.

### Requests

- `LeaveRequest`: `{ id, employeeId, type, start, end, half: 'FIRST' | 'SECOND' | null, days, reason, proof?, trail, withdrawn?, addedByHr?, cancellation?, lossOfPayDays?, createdAt, updatedAt }`.
  Half days cover every working day from start to end (0.5 each). `cancellation` is set on approved leave that was
  cancelled: whole (trail `CANCELLED`) or from a date (`end` moved back, `days` re-counted).
  `changedFrom?: { type, start, end, half, days, at, changeId }` is what it was before an approved change ("Was").
- `LeaveCancellation`: `{ id, employeeId, leaveId, type, from, to, days, reason, trail, withdrawn? }`. `from` is the date
  the employee picked ("Cancel from"): the leave's first day = the whole leave.
- `LeaveChange` (new): `{ id, employeeId, leaveId, type, start, end, half, days, reason, proof?, was: { type, start, end,
  half, days }, trail, withdrawn?, createdAt, updatedAt }` — a request to change approved leave. The original leave is
  untouched until the change is approved; then it's updated in place (same id) and keeps `changedFrom`.
- `CompOffRequest`: `{ id, employeeId, date (the day worked), days: 0.5 | 1, workedMinutes, reason, trail, withdrawn? }`.

Each trail is resolved from the leave approvers when the item is submitted (`startTrail('leave', …)`) and stored on it,
so later settings changes don't move items in flight. Statuses: `PENDING_MANAGER` / `PENDING_<TEAM>` / `UPDATE_REQUESTED`
/ `APPROVED` / `REJECTED` / `CANCELLED`.

## Rules

| Rule | Function |
|---|---|
| Leave year (company cycle, or joining anniversary; 29 Feb → 28 Feb) | `leaveYearOf` |
| Credits per type (start of cycle / monthly / daily), probation per type, 15th-of-the-month pro-rata | `creditSchedule`, `creditedBy`, `countedMonths` |
| Carry forward and lapse; roll-forward on the last working day of the cycle | `carryForward`, `rollForwardDay` |
| Available = credited − approved − late deductions − leave in request | `availableBalance`, `computeLeaveYear` |
| Exit: encash unused (encashable types), recover extra taken | `exitSettlement` |
| Day count: the employee's own working days; half days 0.5 per working day; sandwich rule | `countLeaveDays` |
| Checks when applying | `validateLeave` |
| Comp off: 0.5 / 1 day by hours; refusals; expiry, oldest credit used first | `compOffDays`, `compOffProblem`, `compOffLedger` |
| Cancellation by HR: whole, or from today once started | `cancellationRange`, `applyCancellation` |
| Cancellation / change by the employee: past working days being removed must have been worked (a check-in in attendance modes, timesheet entries in timesheet-only mode); "neither" mode refuses past days | `removedPastDays`, `pastLeaveProblem` |
| A shortened leave ends on the last working day before the cancel date | `applyCancellation` |
| Editing an open request: saved in place, starts again at level 1 ("Edited and resubmitted") | `restartTrail` |
| The leave log per type and Recent activity | `typeLog`, `recentActivity`, `requestHistory` (`rules/leaveLog.ts`) |
| Late deduction order, loss of pay, reversal | `allocateLateDeductions` |
| Requests views per approval setup | `adminRequestViews` |
| Loss of pay when approved beyond the balance | `lossOfPayOnApproval` |

### Checks when applying (in order)

| Check | Message |
|---|---|
| Type | "Pick a leave type." (a type that doesn't apply to the employee isn't offered at all) |
| Dates | "Pick a valid date." / "The end date is before the start date." |
| Half days off | "Half-day leave is turned off. Apply for full days." |
| Working days | "Those dates are all weekly offs or holidays." |
| Overlap with approved, pending or update-requested leave (opposite halves don't clash) | "You already have leave on these dates ({summary})." |
| Probation, type "Not available" | "{Type} leave isn’t available during probation. You can use it once HR confirms you." |
| Balance | "You have {n} days of {Type} leave available ({m} more already waiting for approval). Apply for fewer days or pick another leave type." |
| Document | "{Type} leave of more than {n} days needs a supporting document." / "{Type} leave needs a supporting document." |
| Reason | "Add a short reason." (HR: "Add a short note.") |

HR's Add leave runs the same checks, worded for HR ("Kavya has 2 days of Annual leave available.", "… isn’t available while Kavya is on probation.").

### Comp off refusals (in order)

"Pick a day you’ve already worked." · "{Tue 13 Oct} is a working day. Comp off is only for weekly offs and public holidays." ·
"Comp off has to be claimed within {n} days." · "There’s no check-in and check-out for that day." (timesheet-only:
"There’s no timesheet for that day.") · "You worked {2h}, less than half a shift." · "You’ve already claimed comp off for that day." ·
"You’ve claimed overtime for that day. A day can be overtime or comp off, not both."

## Endpoints — ESS (the requesting persona)

| Method | Path | Body | Returns · rules |
|---|---|---|---|
| GET | `leave` | — | `LeaveView`: status, year, balances per type (credited, approved, late, inRequest, available, left, allocated, carried, `carryForward` (the type's limit), next, expiring, notAvailable, ledger), late deductions with their dispute, requests (with `state`, `cancelFrom` / `cancelDays` = the whole leave, `canChange`, `cancellationPending`, `changePending`, `changedFromTypeName`), cancellations, `changes`, comp offs, approval path, rules, the employee's calendar, this year's holidays. Cancel / change are offered only while no cancellation or change is waiting on that leave. |
| POST | `leave/requests` | `{ type, start, end?, half?, reason, proof? }` | `LeaveView`. Checks above; to the leave approvers. |
| POST | `leave/requests/:id/withdraw` | — | `LeaveView`. Pending or update requested only. |
| POST | `leave/requests/:id/resubmit` | `{ type?, start, end, half, reason, proof? }` | `LeaveView`. **Edit request / Update and resubmit**: pending (at either level) or update requested; same checks (the request itself left out of the balance and overlap); saved in place; starts again at level 1. |
| GET | `leave/requests/:id/cancel-check?from=` | — | **New.** `LeaveCancelCheck { from, to, whole, days, problem }`: what cancelling approved leave from that date gives back, or why not (`from` outside the leave; past working days without a check-in / timesheet entries → "…request an attendance correction first…"). No `from` = the whole leave. |
| POST | `leave/requests/:id/cancel` | `{ reason, from? }` | `LeaveView`. Approved leave (past, current or future); creates a `LeaveCancellation` from `from` (default: the whole leave). 409 with the check's message when past days weren't worked, or when a cancellation or change is already waiting. The leave stays booked until it's approved. |
| POST | `leave/requests/:id/change` | `{ type, start, end?, half?, reason, proof? }` | **New.** `LeaveView`. Creates a `LeaveChange` with the leave approvers. Checked like a new request with the original left out (overlap and balance); 400 if nothing changed; 409 when past days it would remove weren't worked, or when a cancellation or change is already waiting. |
| POST | `leave/changes/:id/withdraw` | — | **New.** `LeaveView`. Pending or update requested only. |
| POST | `leave/changes/:id/resubmit` | `{ type?, start?, end?, half?, reason?, proof? }` | **New.** `LeaveView`. Edit / update an open change: checked again, starts again at level 1. |
| POST | `leave/cancellations/:id/withdraw` | — | `LeaveView`. |
| POST | `leave/cancellations/:id/resubmit` | `{ reason }` | `LeaveView`. Edit (while pending) or update (when sent back); starts again at level 1. |
| GET | `leave/comp-off/check?date=` | — | `CompOffCheck { date, days, workedMinutes, dayName, problem }`. |
| POST | `leave/comp-off` | `{ date, reason }` | `LeaveView`. 409 with the refusal message. |
| POST | `leave/comp-off/:id/withdraw` | — | `LeaveView`. |
| POST | `leave/comp-off/:id/resubmit` | `{ date, reason }` | `LeaveView`. Edit (while pending) or update (when sent back); starts again at level 1. |
| PUT | `demo/employee-life` | `{ dateOfJoin?, exitDate?, status? }` | `LeaveView`. Demo only (the prototype data menu). |

## Endpoints — approvers

Leave, leave cancellations, leave changes and comp off share the leave queues (`RequestItem.type = 'leave'`,
`leaveKind` = `leave` / `cancel` / `change` / `compoff`). A change item's title is the new leave and its detail says
what it was ("was Annual leave, Tue 1 Dec – Wed 2 Dec (2 days)"); its balance line gives the original's days back. A waiting leave request carries `leaveBalance { typeName, availableNow, after, days }`
("Annual: 7 available now · 6.5 after this"; `availableNow` = credited − approved − late, i.e. not counting requests).

| Method | Path | Notes |
|---|---|---|
| GET | `team/approvals/requests/leave?scope=waiting|all` | My team → Approvals (a person at level 1 or 2). |
| POST | `team/approvals/requests/leave/:id/approve` · `reject` · `ask-for-update` | `{ comment? }`. Reject and ask for update need a comment. |
| GET | `payroll/admin/requests/leave` | Payroll → Leave → Requests (`AdminRequestRow[]`, buckets `you` · `mgr` · `upd` · `ok` · `no`; leave rows carry `deptClash`). |
| POST | `payroll/admin/requests/leave/:id/approve` · `reject` · `ask-for-update` · `remind`; `bulk-approve` `{ ids }` | Only items waiting for a team. |

A final approval runs the effects: approved leave updates attendance and the timesheet (read live); days beyond what was
left are flagged as `lossOfPayDays`; an approved cancellation cancels the leave (whole, or from its `from` date) and the
days go back to the balance; an approved change replaces the leave (days beyond what's left flagged as loss of pay);
approved comp off becomes a Comp off credit. Attendance and the timesheet follow the leave as it is after the decision.

## Endpoints — Payroll (HR)

| Method | Path | Body | Returns · rules |
|---|---|---|---|
| GET | `payroll/admin/leave/overview` | — | `AdminLeaveOverview` (off today, off this week, waiting for you, taken this month, on probation). |
| GET | `payroll/admin/leave/calendar?month=` | — | `TeamLeaveView` for everyone. |
| GET | `payroll/admin/leave/leaves` | — | `AdminLeaveEntry[]`: approved leave, newest first, with state (upcoming / now / taken), added by, `cancelFrom` / `cancelDays`. |
| POST | `payroll/admin/leave/leaves` | `HrAddLeaveInput { employeeId, type, start, end, half?, note, attachment? }` | `{ id, message }`. Same checks as the employee form; approved immediately, `addedByHr`. |
| POST | `payroll/admin/leave/leaves/:id/cancel` | `{ reason }` | `{ message }`. Applies immediately (days from today if started). Not limited by the worked-day check. Any waiting cancellation or change request for it is withdrawn. |
| GET | `payroll/admin/leave/balances` | — | `AdminLeaveBalances { types, rows }`: per type available / allocated (null when the type doesn't apply), status. |
| POST | `payroll/admin/leave/employees/:id/mark-active` | — | `{ message }`. Probation → Active, confirmedOn = today. |
| GET | `payroll/admin/leave/employees/:id/types` | — | The Add leave drawer's data: status, calendar, rules, balances, existing leave. |
| GET | `payroll/admin/leave/:employeeId` | — | That employee's `LeaveView` (Balances → row). |

## Endpoints — Payroll settings → Leave Policies

| Method | Path | Body | Rules |
|---|---|---|---|
| GET | `leave-settings` | — | `LeaveSettingsView`: policy, half days, late days, leave approvers, usage per type (requests, employees it applies to), holidays, next roll-forward day. |
| POST | `leave-settings/types` | `LeaveTypeInput` | Name required and unique; days 0–366. The id comes from the name. |
| PUT | `leave-settings/types/:id` | partial `LeaveTypeInput` | A used type can't be renamed (409). The client asks for confirmation (with the affected count) before changing days, credit, probation, carry forward or applies-to. |
| POST | `leave-settings/types/:id/active` | `{ active }` | Deactivate / activate. |
| DELETE | `leave-settings/types/:id` | — | Only a type never used (409 otherwise); at least one type stays. |
| PUT | `leave-settings/config` | `{ year?, cycleStart?, halfDay?, sandwich?, compOff?: { enabled?, expiryDays? }, lateDeductionDays?, lateOrder? }` | Invalid values keep the current ones (cycle day 1–28, expiry 0–365, late 0–5 in quarters, order = active type ids). |
| POST | `leave-settings/holidays` | `{ date, name }` | 409 if there's already one that day. |
| DELETE | `leave-settings/holidays/:date` | — | |
| PUT | `settings` | `{ level1: { leave }, level2: { leave } }` | The Approvals sub-tab (existing endpoint). |

## Effects on attendance and timesheets

Read live from approved leave (`atsStore.ts`), using each employee's own weekly offs and shift (`scheduleOf`):

- Full day: status "On leave" ("{Type} leave"), no hours expected; a read-only timesheet row for the shift.
- Half day (each day of a half-day range): "Half-day leave (first half / second half)"; first-half leave moves the late
  mark to mid-shift; a past day with no check-in is "Half-day leave (…) · Absent (other half)"; a read-only row for that
  half.
- Weekday public holiday: a read-only "Public holiday" row for the shift (unless they checked in).
- A check-in on a day of approved full-day leave doesn't replace the leave: the day stays "On leave" ("{Type} leave ·
  checked in", no late mark) until a cancellation or change of that day is approved; then the check-in counts as a
  worked day and the timesheet's leave row goes away.
- Leave and holiday rows count as logged time and never as overtime; weekly offs and holidays inside a leave stay what
  they are.

## Data mapping (earlier leave policy data → this model)

| Earlier | Now |
|---|---|
| `leavePolicy.types.ANNUAL / CASUAL / SICK` (days, `UPFRONT`/`MONTHLY`, carry, encash) | Same ids and values; `UPFRONT` → `CYCLE_START`. Probation rule added: Annual and Casual credited monthly, Sick full entitlement. |
| `leavePolicy.probationMonths` | Dropped: probation is a status. Employees whose `probationEnded` is false (and ACME-020) start on Probation; everyone else is Active, confirmed six months after joining. |
| `leaveRules.proofDays` (sick leave) | `SICK.proofAfterDays`. |
| Original Payroll leave policies: Maternity Leave (182, female), Paternity Leave (5, male) | `MATERNITY` (182, female, start of cycle, not available on probation, document always) and `PATERNITY` (5, male, not available on probation). |
| Original Payroll leave policies: Casual 12 / Sick 12 / Annual 18 (monthly 1.5, carry 45) | Already superseded by the live policy in the Final batch; the live values (8 / 6 / 12, carry 30) are kept. |
| "Unpaid Leave" | Removed: every type is paid. |
| Static public holidays (`time-calendar.ts`, category public) | Seeded into the editable `ats-holidays` collection (last, this and next year). |
