<!-- PROTOTYPE-SETUP: ESS Service 1 — API contract for Attendance & Timesheet. -->
# Attendance & Timesheet API

This contract is served by the prototype's mock layer today (`src/prototype/mocks/handlers/ats.ts`). The backend needs to implement the same contract.

- **Base path:** `{userType}/{userId}/payroll/ats`.
  - ESS screens call it as the employee (`user/{employeeId}`).
  - Payroll calls it as the corporate user (`corporate/{corporateId}`).
- **Envelope:** every response uses the usual `SuccessGenericResponse<T>`: `{ status, message, responseCode: "000", data: T }`.
- **Types:** all shapes are defined in `src/domains/attendanceTimesheet/types.ts`. The client is `src/domains/attendanceTimesheet/api.ts`.
- **Formats:** dates are `YYYY-MM-DD`, months are `YYYY-MM`, times are `HH:mm` (24h, company local time), and timestamps are ISO-8601.
- **Errors:** a broken rule returns a 4xx with a human-readable `message`. The UI shows that message as-is.
  - 400: invalid input.
  - 403: not your report.
  - 404: not found.
  - 409: rule conflict, such as overlap, locked day, approved week, or already pending.
- **Rules:** every business rule lives in `src/prototype/rules/attendance.ts`, with unit tests in `src/prototype/rules/__tests__`. The backend must apply the same rules.

## Settings (HR / Payroll)

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `settings` | — | `AtsSettings` |
| PUT | `settings` | `Partial<AtsSettings>` (invalid values are ignored) | `AtsSettings` |

Defaults:
- `mode: 'both'`.
- Shift `09:30–18:30` (the shift includes the break), `breakMinutes: 60`.
- `graceMinutes: 10`, `halfDayThresholdMinutes: 240`, `overtimeMinimumMinutes: 30`.
- Weekly off: SAT and SUN.
- `timesheetApproval: { enabled: true, submissionWeekday: 'FRIDAY' }`.
- `level2`: attendance HR, overtime FINANCE, timesheet NONE (fixed), leave HR, reimbursement FINANCE.

The legacy endpoints `hr-settings/grace-period` and `hr-settings/work-schedule` read and write the same `graceMinutes` and `shift`.

**Modes:**

| Mode | Tabs | Timesheet day | Overtime basis |
|---|---|---|---|
| `attendance` | Attendance, Overtime | — | (out − in) − shift length |
| `both` | Attendance, Timesheet, Overtime | check-in → check-out | (out − in) − shift length |
| `timesheet` | Timesheet, Overtime (no check-in) | the shift | hours logged − (shift − break) |

On weekly offs and holidays, all time worked counts as overtime.

## ESS — employee (as the requesting employee)

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `overview` | — | `AtsOverview` (card name, tabs, today, this week, counts) |
| POST | `check-in` / `check-out` | — | `AtsOverview` |
| GET | `attendance` | `?month=YYYY-MM` | `AttendanceMonthView` |
| GET | `corrections` | — | `(AttendanceCorrection & { statusLabel })[]` |
| POST | `corrections` | `CorrectionInput` | `AttendanceCorrection` |
| POST | `corrections/{id}/cancel` | — | list as above |
| GET | `timesheet/week` | `?date=` (any day of the week) | `TimesheetWeekView` |
| GET | `timesheet/month` | `?month=` | `TimesheetMonthView` |
| POST | `timesheet/entries` | `TimesheetEntryInput` | `TimesheetWeekView` |
| PUT | `timesheet/entries/{entryId}` | `TimesheetEntryInput` (same week) | `TimesheetWeekView` |
| DELETE | `timesheet/entries/{entryId}` | — | `TimesheetWeekView` |
| POST | `timesheet/weeks/{weekStart}/submit` | — | `TimesheetWeekView` |
| POST | `timesheet/weeks/{weekStart}/change-request` | `ChangeRequestInput` (full proposed week + reason) | `TimesheetWeekView` |
| POST | `timesheet/weeks/{weekStart}/change-request/cancel` | — | `TimesheetWeekView` |
| GET | `overtime` | `?month=` (stats month; default current) | `OvertimeView` |
| GET | `overtime/context` | `?date=` | `OvertimeContext` |
| POST | `overtime` | `OvertimeInput` | `OvertimeRequest` |
| POST | `overtime/{id}/cancel` | — | `OvertimeView` |

**Attendance rules**
- One check-in and one check-out per day.
- A past day with no check-out is closed automatically at shift end (`checkOutAuto: true`). The fix is a `kind: 'update-check-out'` correction.
- Statuses:
  - **Late:** check-in after shift start + grace.
  - **Half day:** time at work under the threshold.
  - Otherwise: Present, Absent, On leave (approved full-day leave), Holiday (public), Weekly off, or Worked on weekly off/holiday.
  - `not-checked-in` (today) and `upcoming` (future) are not final statuses.
- Corrections go through the approval chain. Once fully approved, they replace the day's check-in and check-out (`source: 'correction'`).
- Only one pending correction is allowed per day.

**Timesheet rules**
- Every entry needs a start, an end and a description. The end must be after the start.
- Entries can't overlap on the same day.
- Past, present and future days can all be logged.
- In `both` mode, entries outside check-in and check-out set `TimesheetDay.outsideCheckIn`:
  - The flag carries a pre-filled `suggested` check-in and check-out.
  - Its `action` is `update-check-out` on an auto-closed day, otherwise `request-correction`.
  - This time never counts as overtime.
- Week statuses: `DRAFT → SUBMITTED → APPROVED | SENT_BACK` (sent back with a required comment).
- Editing a SUBMITTED week updates it in place.
- An APPROVED week returns `editMode: 'change-request'`. The employee sends the whole proposed week with a required reason.
  - The manager approves the change request, or rejects it and the approved version stays.
  - The manager's decision is final.
  - A new change request replaces a pending one.
- With approval off, weeks stay DRAFT, are just recorded, and are editable until payroll is processed.
- On the submission weekday, every DRAFT week up to the current one goes to the manager. Sent-back weeks wait for the employee.
- The CEO has no manager, so the CEO's weeks and change requests are auto-approved.

**Overtime rules**
- `worked`: the date is today or earlier.
- `planned`: the date is today or later, and the description is required. After the date, `context.extraMinutes` shows the actual extra time.
- Suggestions are made only for past days whose extra time is at least the minimum and that have no request yet.
- One active request is allowed per day.

**Locks:** once payroll is processed for a month, every day in it is read-only everywhere. Each day and week view carries `locked` and `lockReason`.

## ESS — Manager "My team" (as the manager; direct reports only, otherwise 403)

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `team/today` | — | `TeamTodayView` |
| GET | `team/timesheets/week` | `?date=` | `TeamWeekGrid` |
| GET | `team/timesheets/month` | `?month=` | `TeamMonthSummary` |
| GET | `team/members/{employeeId}/timesheet/week` | `?date=` | `TimesheetWeekView` (`editMode: 'read-only'`) |
| GET | `team/members/{employeeId}/timesheet/month` | `?month=` | `TimesheetMonthView` |
| GET | `team/members/{employeeId}/attendance` | `?month=` | `AttendanceMonthView` |
| GET | `team/approvals/counts` | — | `ApprovalCounts` |
| GET | `team/approvals/timesheets` | `?scope=waiting\|all` | `TimesheetApprovalItem[]` |
| POST | `team/approvals/timesheets/{employeeId}/{weekStart}/approve` | `{ comment? }` | `TimesheetApprovalItem` |
| POST | `team/approvals/timesheets/{employeeId}/{weekStart}/send-back` | `{ comment }` (required) | `TimesheetApprovalItem` |
| POST | `team/approvals/change-requests/{id}/approve` | `{ comment? }` | `TimesheetApprovalItem` |
| POST | `team/approvals/change-requests/{id}/reject` | `{ comment }` (required) | `TimesheetApprovalItem` |
| GET | `team/approvals/requests/{attendance\|overtime}` | `?scope=waiting\|all` | `RequestItem[]` |
| POST | `team/approvals/requests/{type}/{id}/approve` / `reject` | `{ comment? }` (required to reject) | `RequestItem` |

For the "What changed" view, the week view's `changeRequest` carries `baseEntries` and `proposedEntries`. A change request that touches a processed month can't be approved: it has `blockedReason`, and approving it returns 409.

## Payroll (as the corporate user)

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `payroll/approvals/counts` | `?role=HR\|FINANCE` | `{ attendance, overtime }` waiting for that role |
| GET | `payroll/approvals/{attendance\|overtime}` | `?role=&scope=waiting\|all` | `RequestItem[]` (requests whose chain includes that role) |
| POST | `payroll/approvals/{type}/{id}/approve` / `reject` | `?role=`, `{ comment? }` | `RequestItem` |
| GET | `payroll/timesheet-status` | `?month=` (default: earliest unprocessed) | `TimesheetStatusView` (status only, never entries) |
| GET | `payroll/months` | — | `PayrollMonthStatus[]` (two months ago, last month, this month) |
| GET | `payroll/months/{month}` | — | `PayrollMonthStatus` |
| POST | `payroll/months/{month}/process` | — | `PayrollMonthStatus`. Returns 409 if the month is blocked, already processed, or not the earliest unprocessed month. |

**Approval chain:**
- Level 1 is the reporting manager.
- Level 2 comes from settings: attendance goes to HR, overtime to Finance, and timesheets have no level 2.
- Rejecting at any level needs a comment and is final.
- The CEO skips level 1 and goes straight to level 2.
- HR and Finance only ever see timesheet statuses, never entries.

**Payroll blockers:** with approval on, a month can't be processed until every week that overlaps it is APPROVED. A week with a pending change request still counts as approved. Each blocker lists the employee, the manager, the week and its status.

## Demo only

| Method | Path | Returns |
|---|---|---|
| POST | `demo/simulate-submission-day` | `SubmissionRunResult`. Runs the submission-day rule now. |

Demo data is relative to today. Sneha Iyer (ACME-004, reports to Arjun Mehta) has:
- A sent-back week in last month, which blocks last month's payroll.
- A late day in that week with a pending correction.
- A day in that week with time logged after her check-out.
- An approved week with a pending change request.
- A day this week with unclaimed overtime.
- An auto check-out day yesterday, with entries after it.
- A planned entry later this week.
- An approved leave in the next fortnight.

Arjun's team today: Rahul is late, Karthik hasn't checked in, and Ananya is on leave.
