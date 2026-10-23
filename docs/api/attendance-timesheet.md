<!-- PROTOTYPE-SETUP: ESS Service 1 — API contract for Attendance & Timesheet. -->
# Attendance & Timesheet API

This contract is served by the prototype's mock layer today (`src/prototype/mocks/handlers/ats.ts`). The backend needs to implement the same contract.

- **Base path:** `{userType}/{userId}/payroll/ats`.
  - ESS screens call it as the employee (`user/{employeeId}`).
  - Payroll calls it as the corporate user (`corporate/{corporateId}`).
- **Envelope:** every response uses the usual `SuccessGenericResponse<T>`: `{ status, message, responseCode: "000", data: T }`.
- **Types:** all shapes are defined in `src/domains/attendanceTimesheet/types.ts`. The client is `src/domains/attendanceTimesheet/api.ts`.
- **Formats:** dates are `YYYY-MM-DD`, months are `YYYY-MM`, times are `HH:mm` (24h, company local time), and timestamps are ISO-8601. Screens show times in 12-hour format ("9:30 AM"; calendar cells "9:30a").
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
- `timesheetApproval: { enabled: true, submissionWeekday: 'FRIDAY', submissionTime: '23:00' }` — auto-submit every Friday at 11:00 PM (the weekday is used for weekly filing).
- `lateDeductionDays: 0.5` — leave deducted per late check-in (0 = off). See docs/api/leave-policy.md.
- `leavePolicy` — leave year, probation and per-type credits. See docs/api/leave-policy.md.
- `timesheetFiling: { frequency: 'WEEKLY', fields: { startTime: true, endTime: true, duration: true, projectCode: false }, projectCodes: [...] }` — see **Timesheet filing** below. PUT refuses an impossible field combination with 400 (start and end time go together; start + end, or duration, must be on). Changing `frequency` regroups draft timesheets into the new periods; submitted, approved and sent-back ones keep their dates.
- `level2`: attendance PAYROLL, overtime PAYROLL, timesheet PAYROLL, leave HR, reimbursement ADMIN. Options per type: PAYROLL, HR, ADMIN, FINANCE, NONE (manager is final).

The legacy endpoints `hr-settings/grace-period` and `hr-settings/work-schedule` read and write the same `graceMinutes` and `shift`.

**Modes:**

| Mode | Tabs | Timesheet day | Overtime basis |
|---|---|---|---|
| `attendance` | Attendance, Overtime | — | hours worked − shift length |
| `both` | Attendance, Timesheet, Overtime | check-in → check-out (past midnight when overnight) | hours worked − shift length |
| `timesheet` | Timesheet, Overtime (no check-in) | the shift | hours logged − shift length (no break deduction) |

Hours worked = (check-out + outDays × 24h) − check-in, breaks included, all on the check-in day.
| `none` | — (section hidden) | — | no overtime |

On weekly offs and holidays, all time worked counts as overtime.

**`none` ("Neither: no attendance or timesheet tracking").** No check-in or check-out, no timesheets and no overtime: check-in, entries and overtime requests return 409 ("Your company doesn’t track attendance or timesheets."), there are no overtime suggestions, no timesheet payroll blockers and no submission-day run. `overview.tabs` is empty, the ESS section and its Overview tiles are hidden, `home.recentDays` is empty and `home.actions` / `home.requests` keep only leave, reimbursement and profile items. Leave, reimbursements, payslips, documents and profile work as normal. Stored check-ins, timesheets and requests are kept and show again when another mode is chosen.

## ESS — employee (as the requesting employee)

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `overview` | — | `AtsOverview` (card name, tabs, today, this week, counts) |
| GET | `home` | — | `EssHomeView`: the Overview's "Last 10 working days" (`recentDays`), "Needs your action" (`actions`: still checked in from an earlier day — first, with "Go to attendance" — sent-back weeks, unclaimed overtime), "Your requests" (latest status of leave, overtime, reimbursement, attendance correction and profile update requests, newest first, max 6), announcements and the shortcut-card summaries |
| POST | `check-in` / `check-out` | — | `AtsOverview`. Check-in returns 409 "Check out from {date} first." while an earlier day is still open. |
| POST | `check-out/previous` | — | `AtsOverview`. Checks out of the earlier day still open: today's current time, with `outDays` = the days between. |
| PUT | `working-from` | `{ location: 'OFFICE'\|'HOME'\|'CLIENT', client? }` | `AtsOverview`. PROTOTYPE-SETUP (Final batch, Slice 2): Attendance only mode. Before check-in it's used for the check-in; while checked in a change adds `{ at, location, client }` to the day's `locations`; refused after check-out. `today.workingFrom` is the current one. A day with nothing set is Office from check-in. No geofencing. |
| POST | `breaks/start` / `breaks/end` | — | `AtsOverview`. Only while checked in today; checking out ends a running break. |
| PUT | `breaks` | `{ breaks: AttendanceBreak[] }` | `AtsOverview`. Today's breaks, edited directly (`validateBreaks`). |
| PUT | `attendance/{date}/breaks/{index}` | `{ description }` | `TimesheetWeekView` (that day's week). A break's description, from the timesheet; times don't change here. |
| GET | `attendance` | `?month=YYYY-MM` | `AttendanceMonthView` |
| GET | `corrections` | — | `(AttendanceCorrection & { statusLabel })[]` |
| POST | `corrections` | `CorrectionInput` | `AttendanceCorrection` |
| POST | `corrections/{id}/cancel` | — | list as above |
| GET | `profile` | — | `MyProfileView` (work details, approved personal details, the pending update, the last decided one) |
| POST | `profile/update-request` | `Partial<PersonalDetails>` (any subset; only changed fields are kept) | `MyProfileView` |
| POST | `profile/update-request/{id}/withdraw` | — | `MyProfileView` |
| GET | `timesheet/week` | `?date=` (any day of the filing period) | `TimesheetWeekView` — the filing period covering the date (a day, a week or a month) |
| GET | `timesheet/periods` | `?from=&to=` (at most two months) | `TimesheetWeekView[]` — every filing period overlapping the range, in order |
| GET | `timesheet/month` | `?month=` | `TimesheetMonthView` |
| POST | `timesheet/entries` | `TimesheetEntryInput` | `TimesheetWeekView` |
| PUT | `timesheet/entries/{entryId}` | `TimesheetEntryInput` (same week) | `TimesheetWeekView` |
| DELETE | `timesheet/entries/{entryId}` | — | `TimesheetWeekView` |
| POST | `timesheet/import/preview` | `{ csv }` | `ImportPreview` — PROTOTYPE-SETUP (Final batch, Slice 3): nothing is saved. `columns` (each header's column or null = ignored; synonyms such as Day, From, To, Duration, Task, Where), then `rows` (`ready`, `reason`, `note`, `entry`) and `ready`. Rules: src/prototype/rules/timesheetImport.ts. |
| POST | `timesheet/import` | `{ csv }` | `{ imported }`. Adds only the ready rows, as by hand (a period that was sent goes back to Draft). 400 when nothing is ready. |
| POST | `timesheet/weeks/{weekStart}/submit` | `{ acknowledged?: { overlaps?: boolean; gaps?: boolean } }` — submits a started DRAFT period or resubmits a SENT_BACK one (`weekStart` = the period's first day) | `TimesheetWeekView` |
| GET | `leave` | — | `LeaveView` — see docs/api/leave-policy.md |
| POST | `leave/requests` | `LeaveRequestInput` | `LeaveView` |
| POST | `leave/requests/{id}/withdraw` | — | `LeaveView` |
| GET | `overtime` | `?month=` (stats month; default current) | `OvertimeView` |
| GET | `overtime/context` | `?date=` | `OvertimeContext` |
| POST | `overtime` | `OvertimeInput` | `OvertimeRequest` |
| POST | `overtime/{id}/cancel` | — | `OvertimeView` |

**Attendance rules**
- One check-in and one check-out per day. Each works once: a second check-in or check-out for the same day returns 409 ("You've already checked in today." / "You've already checked out today."). `AtsOverview.today.canCheckIn` / `canCheckOut` say which button is enabled.
- **No automatic check-out** (HR rules): a session stays open until the employee checks out — even across days and weekends.
  - `AttendanceDay.open` = checked in and not out; `carried` = still open from an earlier day. A carried day shows "Still checked in" and isn't counted (time at work, totals, timesheet target, overtime) until it's checked out.
  - The employee can't check in for a new day while an earlier day (up to 60 days back) is open: `overview.today.openFrom = { date, checkIn }`, `canCheckIn: false`, and `POST check-in` returns 409 "Check out from {date} first."
  - `POST check-out/previous` records today's current time as that day's check-out, with `outDays` = the days between (Friday closed on Monday = 3). Then check-in is allowed. If that's not when they left, they request a correction.
- **Overnight:** all hours count to the check-in day. `AttendanceRecord.outDays` (0 = same day, 1 = next day, …). Hours worked = (check-out + outDays × 24h) − check-in; overtime, the weekend/holiday rule and the payroll month all follow the check-in day.
- **Breaks:** `AttendanceRecord.breaks: { start, end | null, description? }[]`, several per day.
  - Start break / End break only while checked in today (409 otherwise). Checking out ends a running break.
  - Today's breaks are edited directly (`PUT breaks`, rule `validateBreaks`): HH:mm times, within check-in → check-out (or now), no overlaps, at most one running break (the last one, only while still checked in).
  - Past days' breaks change only through a correction request (mentioned in the reason, for now). Descriptions can be edited from the timesheet.
  - Hours worked include breaks. `AttendanceDay.breaks`, `breakMinutes` (a running break counts until now), `onBreak`.
- Statuses:
  - **Late:** check-in after shift start + grace.
  - **Half day:** time at work under the threshold.
  - Otherwise: Present, Absent, On leave (approved full-day leave), Holiday (public), Weekly off, or Worked on weekly off/holiday.
  - `not-checked-in` (today) and `upcoming` (future) are not final statuses.
- **Every attendance change is a correction request** — reporting manager, then Payroll. There's no self-service update. `CorrectionInput` is `{ date, checkIn?, checkOut?, outDays? (0 same day, 1 next day), reason }`; a check-out before the check-in on the same day returns 400 "Check-out must be after check-in. If you left after midnight, choose “Next day”." A day still checked in has to be checked out first (409).
- Once fully approved, a correction replaces the day's check-in, check-out and `outDays` (breaks are kept; `source: 'correction'`).
- Only one pending correction is allowed per day.

**Timesheet entries**

`TimesheetEntry` is `{ id, date, start: string | null, end: string | null, startNext?, endNext?, mins, description, projectCode? }`.
- **Timed entry:** `start` and `end` are set, and `mins` always equals end − start.
- **Next-day times** (HR rules): `startNext` / `endNext` put a time after midnight. Minutes from the day's start = time + 24h when the flag is set; overlap, outside-check-in and totals all use these. "10:00 PM – 2:00 AM (next day)".
- **Hours-only entry:** `start` and `end` are `null`, and `mins` is what the employee entered. Use it when they don't track exact times.

`TimesheetEntryInput` (add, edit) is `{ date, start?, end?, startNext?, endNext?, mins?, description, projectCode?, location?, client? }`. PROTOTYPE-SETUP (Final batch): `location` is `OFFICE` (default), `HOME` or `CLIENT`; a client site needs `client` ("Add the client’s name for a client-site entry."). The server normalises it against the company's fields (`settings.timesheetFiling.fields`):

| Fields | Sent | Saved as |
|---|---|---|
| Start + end on (Patterns A and C) | `start` + `end` (required) | Timed; `mins` = end − start (any `mins` sent is ignored). An end earlier than the start is the next morning (`endNext`). |
| Duration only (Pattern B) | `mins` (required) | Hours-only; any times sent are dropped, none are invented |
| Project code on | `projectCode` (required) | Normalised to upper case; up to 20 letters, numbers, dots, dashes or slashes |
| Project code off | `projectCode` (optional) | Kept when valid, never required |

Without the company's fields (older callers and tests), the rules also accept `start` + `mins` (end = start + mins) and `mins` alone.

The form's Hours field accepts `1:30`, `1.5` or `1h 30m` (`parseHours` in the rules module).

Validation (`validateEntry`), in the order it checks. The messages are `ENTRY_MESSAGES`, which the form shows as-is. They use the prototype's wording; the two marked * are extras the prototype doesn't have:

| Problem | Message |
|---|---|
| Bad date / bad time format (API only) | Pick a valid date. / Enter times as HH:mm. |
| End without start | Add a start time too, or clear the end time. |
| Same start and end | Start and end can’t be the same time. |
| Start without end or hours | Add an end time or the hours. |
| Unreadable hours | Write hours like 1:30, 1.5 or 1h 30m. |
| Nothing entered * | Enter a start and end time, or just the hours. |
| Zero hours | Add the hours worked, or a start and end time. |
| More than 24h in one entry | One entry can’t be more than 24 hours. |
| Ends later than the next day | An entry has to end by the next day. |
| Missing description | Describe what you worked on. |
| Start + end filing, a time missing * | Enter a start and end time. |
| Duration-only filing, no duration * | Enter how long you worked, e.g. 1:30 or 1h 30m. |
| Project codes on, no code / a bad code * | Add a project code. / Use a project code of up to 20 letters, numbers, dots, dashes or slashes. |
| Day total over 24h | That takes the day over 24 hours. |
| Overlap with a recorded break | Overlaps with 1:00 PM – 2:00 PM (break). |

Overlapping **another task entry** is allowed (Timesheet filing): the entry is saved, and the employee is warned (see below).

How hours-only entries behave:
- They count everywhere hours are summed: day and week totals, unlogged hours, overtime in Timesheet-only mode, and the payroll and team figures.
- They never overlap anything and are never "outside check-in hours". Only timed entries are checked for either.
- Within a day, timed entries are sorted by start, then hours-only entries follow (`sortEntries`).
- The change diff compares start, end, mins, description and project code.

**Expected hours (the day's timesheet target)**

`expectedMinutes` in the rules module is the single rule behind totals, unlogged hours, the team grid and payroll. The timesheet should cover every checked-in hour, breaks included: **recorded breaks count as logged time** (they show as read-only Break rows), so unlogged = target − logged.

| Case | Target | Before (HR rules) |
|---|---|---|
| Both mode, checked in and out | **Hours worked**: check-out (+ outDays × 24h) − check-in, breaks included | (out − in) − break |
| Both mode, overnight | Until the next-day check-out, e.g. 9:00 AM → 5:00 AM = **20h** | not possible (no next-day check-out) |
| Both mode, still checked in today | Check-in → **now** (so far) | check-in → shift end − break |
| Both mode, still checked in from an earlier day | **0** until checked out | shift − break (old case #9; the automatic check-out is gone) |
| Both mode, no check-in (past, today or future) | **0** | 0 past; shift − break today and later |
| Both mode, worked on a weekly off or holiday | **Hours worked** (all of it is overtime too) | 0 |
| Both mode, check-in after the shift ends | Hours worked (e.g. 30m) | 0 (never below 0 after the break) |
| Approved leave but checked in / half-day leave | Hours worked | (window − break) |
| Timesheet-only mode, working day | **Shift length** (no break deduction) | shift − break |
| Weekly off, holiday or full-day leave (no check-in); before joining; attendance-only or none mode | **0** | unchanged |

Each case has a unit test in `src/prototype/rules/__tests__/attendance.test.ts` ("expected hours (the timesheet target)").

**Timesheet rules**
- Past, present and future days can all be logged.
- In `both` mode, timed entries outside check-in and check-out set `TimesheetDay.outsideCheckIn`:
  - The flag carries a pre-filled `suggested` check-in and check-out.
  - Its `action` is always `request-correction` (next-day times included: a late entry suggests a next-day check-out). Nothing is flagged while the day is still checked in.
  - This time never counts as overtime.
  - On a past day with entries but no check-in, the flag prompts a correction. `suggested` comes from the timed entries, or is `null` when there are only hours-only entries.
- Period statuses (PROTOTYPE-SETUP: Final batch): `DRAFT → SUBMITTED` (with manager) `→ WITH_PAYROLL → APPROVED`, and `SENT_BACK` at either level (with a required comment; `sentBackBy` says which). Timesheet level 2 is `settings.level2.timesheet` (Payroll by default; NONE = the manager's approval is final).
- Manual submission (Timesheet filing): the employee submits a DRAFT period once it has started, or resubmits a SENT_BACK one. A future period returns 409 "You can't submit a period that hasn't started."; a submitted one 409 "This timesheet is already with {manager}." (so a repeated click never submits twice). Entries missing a required field return 400 "{n} entries need more details before you submit: {message}". Draft periods also go out automatically (see below).
- Template and upload (PROTOTYPE-SETUP: Final batch, Slice 3): the template's example rows follow the company's fields. On upload, each row is checked in this order:
  1. date;
  2. payroll processed for the month;
  3. before joining;
  4. more than 30 days ahead;
  5. times, then hours (0–24);
  6. project code (when on: one on the list or any well-formed code, as in the form);
  7. description;
  8. location (Office, Home or Client: Name);
  9. the entry rules (`validateEntry`).

  Overlapping another entry is allowed, with a note, as in the form. Overlapping a recorded break isn't.
- Manual submit checks in this order: entries missing details (this blocks), overlaps, gaps over 5 minutes, then checked-in hours not logged (15 minutes or more, on days up to today: "Submit for approval?"). Each warning can be overridden with "Submit anyway". Auto-submit never stops for these checks.
- Every entry change saves straight away (there's no Save or draft button). A period goes for approval only on Submit, or at auto-submit.
- Entries stay editable until payroll is processed for the month, even after final approval (`editMode` is always `direct` until then). An edit to a period that's SUBMITTED, WITH_PAYROLL or APPROVED moves it back to DRAFT and keeps a baseline (`baselineEntries` — the last approved version, or the version as submitted; `editedAfter` = the status it had) so reviewers see "What changed". It has to be submitted again. The baseline is cleared on final approval. The old change-request flow is gone.
- With approval off, weeks stay DRAFT, are just recorded, and are editable until payroll is processed.
- At the auto-submit day and time, every due DRAFT period **with entries** goes for approval with its attendance (`attendance`, the days' check-in / check-out). Anything already sent is left alone; sent-back periods wait for the employee.
- The CEO has no manager, so the CEO's timesheets skip level 1 and go straight to Payroll (approved when the company has no level 2).

**Timesheet filing** (PROTOTYPE-SETUP: Timesheet filing — rules in `src/prototype/rules/timesheetFiling.ts`, tests in `rules/__tests__/timesheetFiling.test.ts`)

*Filing periods.* A period is the unit that is submitted and approved. It's stored as `TimesheetWeek`: `weekStart` is the period's first day and `periodEnd` its last (absent on weekly records = weekStart + 6, so existing data reads unchanged).
- `frequency`: `DAILY` (one day), `WEEKLY` (Monday–Sunday) or `MONTHLY` (the calendar month).
- A date's period is the stored period covering it; otherwise the natural period for the frequency, clipped so it never overlaps a stored one. E.g. after weeks up to 18 Oct were submitted, monthly filing makes 19–31 Oct the October period.
- Changing the frequency regroups drafts (their entries and history move to the new periods). Submitted, approved and sent-back periods keep their dates.
- `TimesheetWeekView.filing` = `{ frequency, fields, projectCodes, period: { start, end, label }, autoSubmitOn }`. Labels: "Thu, 15 Oct 2026", "12–18 Oct 2026", "October 2026".

*Fields.* `fields = { startTime, endTime, duration, projectCode }`. Valid combinations: start + end (Pattern A — the duration is calculated); start + end + duration (Pattern C — the calculated duration is shown as its own read-only field); duration only (Pattern B). Start and end go together; with neither times nor duration nothing can be recorded. The description is always required. Disabled fields are hidden and never required.

*Overlaps* (`findOverlaps`). Timed task entries are placed on one timeline (date + next-day times), so a 10:00 PM – 2:00 AM entry meets the next day's 1:00 AM entry, while the same clock time on two dates never overlaps. Touching entries, hours-only entries and breaks never overlap. An overlap never blocks: the form shows "Overlaps {entry} ({times}) from {range}. Check your timings — you can still save it.", the entries carry an "Overlaps …" tag, and the period card counts them.

*Gaps* (`dayGapCheck`, `findGaps`). Within a workday with reliable boundaries, time no entry or recorded break covers for **more than 5 minutes** (exactly 5 doesn't count):
- both mode: check-in → check-out (not while still checked in; nothing without a check-in);
- timesheet-only mode: the shift, on past working days.

No gap check for future days, days without working hours, duration-only filing, or a day with untimed entries (where they fall is unknown).

*Submitting* (`reviewPeriod`, `submissionPrompt`).

| Trigger | Missing details | Overlaps | Gaps over 5 min |
|---|---|---|---|
| Manual (Submit / Resubmit) | Block — "Review entries" (400 from the server too) | Warn — "Review entries" / "Continue anyway" | Warn — "Review entries" / "Submit anyway" |
| Automatic | Not stopped | Not shown | Not shown |

- Overlaps are asked about first, then gaps. Acknowledged warnings are sent as `acknowledged` and recorded on the SUBMITTED event ("Submitted with 1 overlap · 2 gaps over 5 min").
- "Review entries" opens the day with the entries outlined.
- The success toast shows only once the server has accepted the submission.
- An automatic submission never waits for an acknowledgement. What it didn't stop for is noted on the AUTO_SUBMITTED event ("… · not reviewed: 2 gaps over 5 min").

*Automatic submission* (`isAutoSubmitDay`, `periodsDueForSubmission`, `autoSubmitDateFor`), with approval on:

| Frequency | Runs | Sends |
|---|---|---|
| Weekly | on `submissionWeekday` | every started draft (this week included, as before) |
| Daily | every day | every draft day already over |
| Monthly | on the month's last day | every started draft |

**Overtime rules**
- `worked`: the date is today or earlier.
- `planned`: the date is today or later, and the description is required. After the date, `context.extraMinutes` shows the actual extra time.
- Suggestions are made only for past days whose extra time is at least the minimum and that have no request yet — never while the day is still checked in, nor while an attendance correction for it is waiting. Overnight hours count to the check-in day. Overtime is only created when the employee submits a request.
- One active request is allowed per day.

**Locks:** once payroll is processed for a month, every day in it is read-only everywhere. Each day and week view carries `locked` and `lockReason`.

## ESS — Manager "My team" (as the manager; direct reports only, otherwise 403)

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `team/today` | — | `TeamTodayView` |
| GET | `team/timesheets/week` | `?date=` | `TeamWeekGrid` |
| GET | `team/timesheets/month` | `?month=` | `TeamMonthSummary` |
| GET | `team/members/{employeeId}/timesheet/week` | `?date=` | `TimesheetWeekView` (`editMode: 'read-only'`) — the filing period covering the date; the reviewer sees each entry's times, duration, project code and description, and the period's checks (overlaps, gaps over 5 min, missing details) |
| GET | `team/members/{employeeId}/timesheet/month` | `?month=` | `TimesheetMonthView` |
| GET | `team/members/{employeeId}/attendance` | `?month=` | `AttendanceMonthView` |
| GET | `team/approvals/counts` | — | `ApprovalCounts` |
| GET | `team/approvals/timesheets` | `?scope=waiting\|all` | `TimesheetApprovalItem[]` |
| POST | `team/approvals/timesheets/{employeeId}/{weekStart}/approve` | `{ comment? }` | `TimesheetApprovalItem` |
| POST | `team/approvals/timesheets/{employeeId}/{weekStart}/send-back` | `{ comment }` (required) | `TimesheetApprovalItem` |
| GET | `team/approvals/requests/{attendance\|overtime}` | `?scope=waiting\|all` | `RequestItem[]` |
| POST | `team/approvals/requests/{type}/{id}/approve` / `reject` | `{ comment? }` (required to reject) | `RequestItem` |

The manager's approval sends a timesheet on to Payroll (`WITH_PAYROLL`); with no level 2 it's approved. A queue item edited after it was sent carries `editedAfter` and `diffSummary` ("1 added · 2 edited"); "What changed" compares `week.entries` with `week.baselineEntries`. `team/approvals/requests/{type}` also takes `leave` and `reimbursement`.

## Payroll (as the corporate user)

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `payroll/approvals/counts` | `?role=PAYROLL\|HR\|ADMIN\|FINANCE` | `{ attendance, overtime, profile, leave, reimbursement, timesheets }` waiting for that role |
| GET | `payroll/approvals/{attendance\|overtime\|profile\|leave\|reimbursement}` | `?role=&scope=waiting\|all` | `RequestItem[]` (requests whose chain includes that role; profile items carry `profile.changes`) |
| GET | `payroll/timesheets` | `?scope=waiting\|all` | `TimesheetApprovalItem[]` — "Timesheets waiting for Payroll" (`approvedBy`, `editedAfter`) |
| GET | `payroll/timesheets/{employeeId}/week` | `?date=` | `TimesheetWeekView` (read-only) |
| GET | `payroll/timesheets/{employeeId}/month` | `?month=` | `TimesheetMonthView`. PROTOTYPE-SETUP (Final batch, Slice 4): for the shared review screen. |
| POST | `payroll/timesheets/{employeeId}/{weekStart}/approve` / `send-back` | `{ comment? }` (required to send back) | `TimesheetApprovalItem` |
| POST | `payroll/approvals/{type}/{id}/approve` / `reject` | `?role=`, `{ comment? }` | `RequestItem` |
| GET | `payroll/timesheet-status` | `?month=` (default: earliest unprocessed) | `TimesheetStatusView` (status only, never entries) |
| GET | `payroll/months` | — | `PayrollMonthStatus[]` (two months ago, last month, this month) |
| GET | `payroll/months/{month}` | — | `PayrollMonthStatus` |
| POST | `payroll/months/{month}/process` | — | `PayrollMonthStatus`. Returns 409 if the month is blocked, already processed, or not the earliest unprocessed month. |

**Approval chain:**
- Level 1 is the reporting manager.
- Payroll → Approvals (PROTOTYPE-SETUP: Final batch, Slice 4): there are queues for Payroll (the default), HR and Admin. Finance shows only while something is routed to it.
  - The queue that timesheets are routed to (Payroll by default) opens with "Timesheets waiting for Payroll", which uses the manager's review screen: "What changed" for edited periods, then "Approve timesheet" or "Send back" with a required note.
  - Its request tabs follow. Payroll has attendance corrections and overtime, HR has leave and profile updates, and Admin has reimbursements.
  - `counts.timesheets` is counted for the role that timesheets are routed to.
- Level 2 comes from settings: attendance corrections, overtime and timesheets go to the single **Payroll** queue (`PENDING_PAYROLL` / `WITH_PAYROLL`), leave to HR, reimbursements to **Admin** (`PENDING_ADMIN`).
- Rejecting at any level needs a comment and is final.
- The CEO skips level 1 and goes straight to level 2.
- **Profile updates** have no manager step: HR is the only step ("HR team"). The request holds only the changed fields as `{ from, to }` (photo included, as a data URL). The profile changes only when HR approves. One pending update per employee (a second returns 409); the employee can withdraw it.
- Profile validation (`validatePersonalDetails`): mobile needs at least 10 digits; personal email must look like an email; emergency contact needs a name and a 10-digit number; a photo is at most 1 MB.
- HR and Finance only ever see timesheet statuses, never entries.

**Payroll blockers:** with approval on, a month can't be processed until every filing period that overlaps it is APPROVED — Draft, With manager, With Payroll and Sent back all block it. Each blocker lists the employee, the manager, the period (`weekStart`, `periodEnd`) and its status.

## Demo only

| Method | Path | Returns |
|---|---|---|
| POST | `demo/simulate-submission-day` / `demo/run-auto-submit` | `SubmissionRunResult`. "Run auto-submit now": submits every due Draft period with entries, with its attendance. |
| PUT | `demo/employee-life` | `{ dateOfJoin?, exitDate? }` → `LeaveView`. The persona's joining and leaving dates, for the leave demo. |
| POST | `demo/reset-today-check-in` | `{ cleared }`. Clears today's check-in and check-out for both ESS personas (Sneha and Arjun). |

Demo data is relative to today. Sneha Iyer (ACME-004, reports to Arjun Mehta) has:
- A sent-back week in last month, which blocks last month's payroll.
- A late day in that week with a pending correction.
- A day in that week with time logged after her check-out, and an hours-only entry ("Writing release notes", 1h).
- An approved week edited afterwards (a client call added) and submitted again — back with the manager, who sees "What changed". (Rahul's same week is with Payroll, also edited after approval.)
- A day this week (or last week) with unclaimed overtime.
- Still checked in from the last working day (no automatic check-out), and not checked in today — check-in is blocked until she checks out of it.
- An overnight day two weeks back: 9:00 AM → 5:00 AM (next day), with entries until 5:00 AM (next day) — 20h at work, 11h overtime suggested.
- A 1:00–2:00 PM "Lunch" break on every worked day (everyone).
- A planned entry on the next working day.
- An approved leave in the next fortnight.

Arjun's team today: Rahul is late, Karthik hasn't checked in, and Ananya is on leave.

HR's queue has one profile update waiting (Karthik: new mobile number and address).
