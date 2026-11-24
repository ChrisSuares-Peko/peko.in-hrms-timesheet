# Leave module API

PROTOTYPE-SETUP (Leave module). Mock API served by `src/prototype/mocks/handlers/ats.ts` under
`{userType}/{userId}/payroll/ats/`, every response wrapped in `SuccessGenericResponse<T>`. Rule breaks come back as
4xx with the message (the API client's interceptor shows it as a toast). Spec: the Leave pages of `docs/dev-notes/dev-notes.json` (`ess:leave:*`, `pay:leave:*`, `pay:settings:leave:*`) and its shared rules.

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
| `onLeaving` | `ENCASH` · `BRING_FORWARD` | Unused leave on leaving: encashed in full & final settlement · used to bring the last working day forward. Stored only (F&F is a later module). Replaces `encashOnExit` (true → `ENCASH`, false → `BRING_FORWARD`), mapped on read and accepted on write. |
| `proofAfterDays` | `null` · 0 · N | Supporting document: never · always · when longer than N days. |
| `appliesTo` | `ALL` · `FEMALE` · `MALE` | Who sees it. Other employees never see the type. |
| `active` | bool | "Show to employees" in the Edit drawer. Off = deactivated: hidden from employees, nothing deleted, balances and history kept. |

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
| Exit: unused days encashed or bring the last working day forward (per type), recover extra taken | `exitSettlement` |
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
| GET | `leave/comp-off/calendar?month=YYYY-MM[&exclude=id]` | — | `CompOffCalendar { month, today, expiryDays, days: [{ date, kind: HOLIDAY · WEEKLY_OFF · WORKING, holidayName?, worked, claimed, available }] }`. The "Request comp off" day picker. Only weekly offs and holidays on the employee's own schedule are `available` (not future, inside the expiry window, not already claimed; `exclude` = the request being resubmitted). Rule: `compOffDayAvailable`. |
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

## Leave policy settings, per-event leave and loss of pay (PROTOTYPE-SETUP: this run)

Spec: `docs/dev-notes/dev-notes.json` (pay:settings:leave:types / config / approvals, ess:leave:overview / requests).
Rules: `src/prototype/rules/leave.ts` (tests: `rules/__tests__/leavePolicy.test.ts`, store:
`mocks/store/__tests__/atsLeavePolicy.test.ts`).

### New fields

| Where | Field | Values | Notes |
|---|---|---|---|
| `LeaveTypeConfig` | `kind` | `'yearly' \| 'event'` | Per-event types have no balance, aren't in balance tables or `lateOrder`, never flag loss of pay. |
| | `count` | `'working' \| 'calendar'` | Calendar = every day in the range (no sandwich rule). |
| | `yearEnd` | `'carry' \| 'encash' \| 'lapse'` | Yearly only. `carryForward` keeps the carry limit (the spec's `carry`). |
| | `exitOpts` | `('encash' \| 'prepone')[]` | Both = the employee chooses; none = lapses. Stored only (F&F is a later module). Replaces `onLeaving` / `encashOnExit`. |
| | `limit`, `limitUnit` | number, `'days' \| 'weeks'` | Per event; weeks × 7 days. |
| | `eventLabel` | string | The event date asked on the request. |
| | `windowBefore`, `windowAfter` | days or `null` | `null` = no limit that side. |
| `LeavePolicy` | `creditDate`, `creditDay` | `'START' \| 'END' \| 'CUSTOM'`, 1–28 | When monthly credits land; never before joining. |
| | `rounding` | `'NONE' \| 'HALF' \| 'DAY'` | On the running total of credits and the year's total. |
| | `lop` | `'USED_UP' \| 'ANY_TIME'` | When loss of pay can be requested. |
| `AtsSettings` | `leaveEndorsement` | `{ enabled, overDays, endorser: 'DEPT_HEAD' \| 'person:{id}' }` | Saved with the approvals (PUT settings). |
| `LeaveRequest` / `LeaveChange` | `eventDate` | ISO date | Required for per-event types. |
| `LeaveRequest` | `lop` | `true` | Loss of pay: `type: 'LOP'`, "Loss of pay". Payroll's LOP calculation reads this flag. |
| `ApprovalStep` | `endorsement` | `true` | The endorsement step (a person step after level 1). |
| `LedgerKind` | `ENCASHED` | | Year-end encashment (information line). |
| `LeaveSettlement` | `choice`, `lapse` | | Both leaving options ticked / none ticked. |
| `LeaveView` | `eventTypes`, `rules.lop` | | The per-event types the employee can apply for; the LOP rule. |
| `LeaveSettingsView` | `endorsement` | | The current extra-approval setting. |
| `RequestItem` | `unpaid`, `eventLine` | | Approvers: "Unpaid: payroll treats these days as loss of pay." / "Up to 7 days per event · Date of birth or adoption: Tue 3 Nov". |

### New endpoint

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `leave/lop` | `{ start, end?, half?, reason }` | `LeaveView`. Working days only; overlap check; with `lop: 'USED_UP'`, 409 "You still have paid leave: 9.5 Annual · 6.5 Casual. …" while any yearly balance or comp off is above 0. Same approvers (and endorsement) as leave. Resubmit and change are refused (409): withdraw or cancel only. |

Changed bodies: `POST leave/requests` (and resubmit / change) take `eventDate`; `PUT leave-settings/config` takes
`creditDate`, `creditDay`, `rounding`, `lop`; leave type add / edit take the new type fields (older clients sending
`onLeaving` or `encashOnExit` are mapped).

### Per-event checks (after the overlap and probation checks)

1. No event date → "Add the {event label}." (400)
2. Starts more than `windowBefore` days before the event → "… can start at most N days before …" (409)
3. Ends more than `windowAfter` days after it → "… has to end within N days after …" (409)
4. This request + leave already booked for the same type and event date (approved or in request) > the limit → "… is up to
   26 weeks per event. N days already booked for this event." (409)

### Department head (endorser)

The person in the employee's department whose own manager is outside it, or who has none (from `managerEmployeeId`
and each person's department). Several → the one with the most people in the department under them, then the lowest
id. The step is skipped when the endorser is the employee or the level 1 approver. Backend: the same rule over the
org chart; when the org has explicit department heads, use those instead.

## Leave settings rework: per-event triggers, Maternity, holiday upload (PROTOTYPE-SETUP: this run)

Spec: `docs/dev-notes/dev-notes.json` (pay:settings:leave:types / config / holidays / approvals, pay:leave:overview,
ess:leave:overview / requests). Rules: `src/prototype/rules/leave.ts`, `src/prototype/rules/holidayImport.ts` (tests:
`rules/__tests__/leavePolicy.test.ts`, `rules/__tests__/holidayImport.test.ts`, store:
`mocks/store/__tests__/atsLeavePolicy.test.ts`). Stored data is migrated on read (`migrateLeavePolicy`,
`migrateLeaveType`); nothing needs a one-off script.

### Changed and new fields

| Where | Field | Values | Notes |
|---|---|---|---|
| `LeaveTypeConfig` | `probation` | `'MONTHLY' \| 'DAILY' \| 'FULL' \| 'NONE'` | `DAILY` is new: credited daily while on Probation. `NONE` = nothing until Active. |
| | `yearEnd` + `excess` | `'carry' \| 'encash' \| 'lapse'` + `'lapse' \| 'encash'` | The four end-of-cycle options: all lapse / all encashed / carry up to `carryForward`, the rest lapses / carry, the rest encashed. Each adds a ledger line on the last working day of the cycle. |
| | `exitOpts` | `[] \| ['encash'] \| ['prepone']` | One option now (none = lapse). Stored both → `['encash']`. |
| | `halfDay` | boolean | Per type (was the company-wide `leaveRules.halfDay`, which seeds it on migration). Always `false` for per-event types. |
| | `trigger` | `'birthadopt' \| 'birth' \| 'adoption' \| 'loss' \| 'procedure' \| 'other'` | Per event: decides the date label asked on the request (`other` uses `eventLabel`). |
| | `docRequired`, `docName` | boolean, string | Per event: every request needs a document; `docName` is what employees are asked for. Yearly types keep `proofAfterDays`. |
| | `system`, `mat` | `'maternity'`, `{ d1, d2, d3, pre, post }` | The statutory Maternity type: calendar days by child (minimum 182 / 182 / 84) and the start window in weeks before / after the delivery date (`pre` ≤ 8; 6 at most for the third child or later, applied automatically). It can't be deleted or renamed; saving below the minimum is refused (400). |
| `LeavePolicy` | `sandwich` | `{ on, when: 'always' \| 'longer', overDays, weeklyOffs, holidays }` | Was an enum (`OFF` / `WEEKLY_OFFS` / `WEEKLY_OFFS_AND_HOLIDAYS`), mapped on read and still accepted on PUT. `longer` = only when the request covers more than `overDays` days from first to last day. |
| | `creditTime` | `'HH:mm'` | Custom credit date: daily credits count each day from this time (default 12:00). Monthly custom credits use `creditDay`. |
| | `matOn` | boolean | Whether Maternity is offered when it is optional (10 or fewer current employees). Ignored above 10 (always offered). |
| `LeaveRequest` / `LeaveChange` / `HrAddLeaveInput` | `child` | `1 \| 2 \| 3` | Maternity: which child (third = third or later). Sets the days and the start window. |
| `LeaveBalance` | `halfDay` | boolean | The type's half-day rule, for the Apply form. |
| `LeaveSettingsView` | `headcount`, `maternityRequired` | number, boolean | Current employees (no past leaving date) and whether Maternity is required (more than 10). |
| employee leave types (HR) | `eventTypes`, `events` | | The per-event types the employee can take, and `{ type, eventDate }` already booked. |

### New endpoint

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `leave-settings/holidays/bulk` | `{ holidays: [{ date, name }] }` | `LeaveSettingsView`. The Ready rows of the bulk upload, one entry per date. Dates already holidays are skipped; a bad date or empty name refuses the whole call (400); an empty list → 400 "There are no holidays to import." |

The spreadsheet itself is read in the browser (Start date, End date, Holiday name; YYYY-MM-DD, DD/MM/YYYY or Excel
dates) and reviewed with `reviewHolidayRows` before anything is sent. Backend: accept the same body; checking the file
server-side can reuse the same statuses (Ready / Already added / Start date isn’t a date / Holiday name is missing /
End date is before the start date / More than 31 days long).

Changed bodies: `PUT leave-settings/config` also takes `sandwich` as the object, `creditTime`, `matOn`; `halfDay` is no
longer sent by the screen (kept for older clients). Leave requests, changes and HR add leave take `child`.

### Per-event checks (replace the ones above)

The window limits the START date only; the leave then runs in one go for the entitlement.

1. No event date → "Add the {date label}." (400)
2. Maternity without a child → "Pick which child this is (first, second, third or later)." (400)
3. Start before the window → "{Type} can start from {date} at the earliest." (409)
4. Start after the window → "{Type} has to start by {date}." (409)
5. More days than the entitlement → "{Type} is up to N days (working days) for one event. Shorten the dates." (409)
6. Another open or approved request for the same type and event date → "There’s already a {type} request for this
   event. It has to be taken in one go; change that request instead." (409)
7. Document required and missing → "{Type} needs a supporting document: {docName}." (400)
