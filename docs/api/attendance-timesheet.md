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
| GET | `profile` | — | `MyProfileView` (work details, approved personal details, the pending update, the last decided one) |
| POST | `profile/update-request` | `Partial<PersonalDetails>` (any subset; only changed fields are kept) | `MyProfileView` |
| POST | `profile/update-request/{id}/withdraw` | — | `MyProfileView` |
| GET | `timesheet/week` | `?date=` (any day of the week) | `TimesheetWeekView` |
| GET | `timesheet/month` | `?month=` | `TimesheetMonthView` |
| POST | `timesheet/entries` | `TimesheetEntryInput` | `TimesheetWeekView` |
| PUT | `timesheet/entries/{entryId}` | `TimesheetEntryInput` (same week) | `TimesheetWeekView` |
| DELETE | `timesheet/entries/{entryId}` | — | `TimesheetWeekView` |
| POST | `timesheet/weeks/{weekStart}/submit` | — (resubmits a SENT_BACK week only) | `TimesheetWeekView` |
| POST | `timesheet/weeks/{weekStart}/change-request` | `ChangeRequestInput` (full proposed week + reason) | `TimesheetWeekView` |
| POST | `timesheet/weeks/{weekStart}/change-request/cancel` | — | `TimesheetWeekView` |
| GET | `overtime` | `?month=` (stats month; default current) | `OvertimeView` |
| GET | `overtime/context` | `?date=` | `OvertimeContext` |
| POST | `overtime` | `OvertimeInput` | `OvertimeRequest` |
| POST | `overtime/{id}/cancel` | — | `OvertimeView` |

**Attendance rules**
- One check-in and one check-out per day. Each works once: a second check-in or check-out for the same day returns 409 ("You've already checked in today." / "You've already checked out today."). `AtsOverview.today.canCheckIn` / `canCheckOut` say which button is enabled.
- **Missed check-out:** a past day with a check-in and no check-out is closed automatically at **11:59 PM** (`checkOut: '23:59'`, `checkOutAuto: true`). Shown as "Missed (closed automatically at 11:59 PM)".
  - Time at work is unknown ("Not known until you update the check-out"), so `minutesAtWork` is 0 and the day is never a half day.
  - It never counts as overtime (and is never suggested) until the real check-out is updated.
  - Expected hours use the shift (case #9 below), not check-in → 11:59 PM.
  - For the timesheet bar and the outside-check-in flag the day runs to the shift end: entries after it show as "{dur} after shift end" with "Update check-out".
  - The fix is a `kind: 'update-check-out'` correction. Its "Actual check-out" is pre-filled with the shift end (from the timesheet flag: the latest entry's end).
- Statuses:
  - **Late:** check-in after shift start + grace.
  - **Half day:** time at work under the threshold.
  - Otherwise: Present, Absent, On leave (approved full-day leave), Holiday (public), Weekly off, or Worked on weekly off/holiday.
  - `not-checked-in` (today) and `upcoming` (future) are not final statuses.
- Corrections go through the approval chain. Once fully approved, they replace the day's check-in and check-out (`source: 'correction'`).
- Only one pending correction is allowed per day.

**Timesheet entries**

`TimesheetEntry` is `{ id, date, start: string | null, end: string | null, mins, description }`.
- **Timed entry:** `start` and `end` are set, and `mins` always equals end − start.
- **Hours-only entry:** `start` and `end` are `null`, and `mins` is what the employee entered. Use it when they don't track exact times.

`TimesheetEntryInput` (add, edit, change request) is `{ date, start?, end?, mins?, description }`. The server normalises it:

| Sent | Saved as |
|---|---|
| `start` + `end` | Timed; `mins` = end − start |
| `start` + `mins` | Timed; `end` = start + mins |
| `mins` only | Hours-only |

The form's Hours field accepts `1:30`, `1.5` or `1h 30m` (`parseHours` in the rules module).

Validation (`validateEntry`), in the order it checks. The messages are `ENTRY_MESSAGES`, which the form shows as-is. They use the prototype's wording; the two marked * are extras the prototype doesn't have:

| Problem | Message |
|---|---|
| Bad date / bad time format (API only) | Pick a valid date. / Enter times as HH:mm. |
| End without start | Add a start time too, or clear the end time. |
| End before start | End time must be after the start time. |
| Start without end or hours | Add an end time or the hours. |
| Unreadable hours | Write hours like 1:30, 1.5 or 1h 30m. |
| Nothing entered * | Enter a start and end time, or just the hours. |
| Zero hours | Add the hours worked, or a start and end time. |
| More than 24h in one entry | One entry can’t be more than 24 hours. |
| Start + hours runs past midnight * | This entry would run past midnight. Split it across two days. |
| Missing description | Describe what you worked on. |
| Day total over 24h | That takes the day over 24 hours. |
| Overlap with another **timed** entry | Overlaps with 09:00–12:00 (*description*). |

How hours-only entries behave:
- They count everywhere hours are summed: day and week totals, unlogged hours, overtime in Timesheet-only mode, and the payroll and team figures.
- They never overlap anything and are never "outside check-in hours". Only timed entries are checked for either.
- Within a day, timed entries are sorted by start, then hours-only entries follow (`sortEntries`).
- The change diff compares start, end, mins and description.

**Expected hours**

`expectedMinutes` in the rules module is the single rule behind totals, unlogged hours, the team grid and payroll:
- Weekly off, holiday or full-day leave: **0**.
- Timesheet-only mode: **shift length − break**.
- Both mode: **(check-out − check-in) − break**. With no check-in, today or later: **shift length − break**. A missed check-out: **shift length − break**.

Edge cases. Each one has a unit test in `src/prototype/rules/__tests__/attendance.test.ts`:

| # | Case | Expected |
|---|---|---|
| 1 | Both mode, past working day with no check-in (absent) | **0**. The absence shows in the Attendance tab, not as unlogged timesheet hours. If time was logged that day, the "no check-in recorded" flag still offers an attendance correction. |
| 2 | Both mode, today, checked in but not out | Check-in → **shift end**, minus break, until the employee checks out |
| 3 | Approved full-day leave but checked in anyway | The **check-in window** applies (they worked) |
| 4 | Half-day leave (works the other half) | The **check-in window**, e.g. about 3h |
| 5 | Worked on a weekly off or holiday | **0**; all the time worked counts as overtime instead |
| 6 | Before the joining date | **0** |
| 7 | Check-in after the shift ends (window shorter than the break) | **0**, never negative |
| 8 | Attendance-only mode | **0** (no timesheets) |
| 9 | Both mode, missed check-out (closed automatically at 11:59 PM) | **Shift length − break**, not check-in → 11:59 PM |

**Timesheet rules**
- Past, present and future days can all be logged.
- In `both` mode, timed entries outside check-in and check-out set `TimesheetDay.outsideCheckIn`:
  - The flag carries a pre-filled `suggested` check-in and check-out.
  - Its `action` is `update-check-out` on a missed check-out day (entries after the shift end), otherwise `request-correction`. A missed check-out counts as the shift end here, never 11:59 PM.
  - This time never counts as overtime.
  - On a past day with entries but no check-in, the flag prompts a correction. `suggested` comes from the timed entries, or is `null` when there are only hours-only entries.
- Week statuses: `DRAFT → SUBMITTED → APPROVED | SENT_BACK` (sent back with a required comment).
- No manual submit. Open (DRAFT) weeks go to the manager automatically on the configured submission day (`timesheetApproval.submissionWeekday`). The submit endpoint only resubmits a SENT_BACK week. On a DRAFT week it returns 409 "Weeks go to your manager automatically every {day}." with the configured day.
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
| GET | `payroll/approvals/counts` | `?role=HR\|FINANCE` | `{ attendance, overtime, profile }` waiting for that role |
| GET | `payroll/approvals/{attendance\|overtime\|profile}` | `?role=&scope=waiting\|all` | `RequestItem[]` (requests whose chain includes that role; profile items carry `profile.changes`) |
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
- **Profile updates** have no manager step: HR is the only step ("HR team"). The request holds only the changed fields as `{ from, to }` (photo included, as a data URL). The profile changes only when HR approves. One pending update per employee (a second returns 409); the employee can withdraw it.
- Profile validation (`validatePersonalDetails`): mobile needs at least 10 digits; personal email must look like an email; emergency contact needs a name and a 10-digit number; a photo is at most 1 MB.
- HR and Finance only ever see timesheet statuses, never entries.

**Payroll blockers:** with approval on, a month can't be processed until every week that overlaps it is APPROVED. A week with a pending change request still counts as approved. Each blocker lists the employee, the manager, the week and its status.

## Demo only

| Method | Path | Returns |
|---|---|---|
| POST | `demo/simulate-submission-day` | `SubmissionRunResult`. Runs the submission-day rule now. |
| POST | `demo/reset-today-check-in` | `{ cleared }`. Clears today's check-in and check-out for both ESS personas (Sneha and Arjun). |

Demo data is relative to today. Sneha Iyer (ACME-004, reports to Arjun Mehta) has:
- A sent-back week in last month, which blocks last month's payroll.
- A late day in that week with a pending correction.
- A day in that week with time logged after her check-out, and an hours-only entry ("Writing release notes", 1h).
- An approved week with a pending change request.
- A day this week (or last week) with unclaimed overtime.
- A missed check-out yesterday (closed automatically at 11:59 PM), with entries after the shift end.
- A planned entry on the next working day.
- An approved leave in the next fortnight.

Arjun's team today: Rahul is late, Karthik hasn't checked in, and Ananya is on leave.

HR's queue has one profile update waiting (Karthik: new mobile number and address).
