# Developer notes

Grouped by module so each module can be built on its own. Every module also depends on **Shared platform**. Source: the prototype's Developer notes panel.

<!-- module: shared -->
## Shared platform (every module)

### How to read the prototype
- All business rules are plain functions in the prototype file (attOf, workedMins, dayStatus, expectedFor, otSuggestion, leaveYear, leaveBalances, leaveDayCount, l1For / l2For, personQueue, submitWeek, decideRequest, applyEffects). Port them as tested rules (src/prototype/rules or the backend). Screens should call the rules, never re-derive them.
- Demo personas: ESS - Employee = Rohan Mehta (ACME-002), ESS - Manager = Priya Nair. 21 employees, ACME-001 to ACME-021; ACME-021 (CEO) has no manager. Demo data is rebuilt each week and stored in localStorage.
- Times are shown in 12-hour format everywhere (9:30 AM). Inputs stay as time pickers. Dates as "Tue 13 Oct".
- The "Demo controls" and "Developer notes" buttons are prototype-only. Do not ship them.

### Tracking modes
- Company setting: attendance only / timesheet only / attendance + timesheet / neither.
- Use two helpers everywhere: attOn = attendance or both; tsOn = timesheet or both. Never write "not timesheet means attendance", because "neither" breaks it.
- Neither: no attendance or timesheet UI at all (cards, recent days table, tabs, calendars). Leave, overtime and reimbursements still work.

### Approval engine (all request types)
- Per function (attendance corrections, timesheets, overtime, leave, reimbursements) HR sets Level 1 and Level 2. Level 1: Reporting manager (default) / a team (Payroll, HR, Admin, Finance) / a specific person. Level 2: a team / a specific person / None (level 1 is final).
- Resolve the approvers when the item is submitted (and Level 2 again when Level 1 approves) and store them on the item. Changing settings later must not move items already in flight.
- No manager (CEO) or "Reporting manager" pointing at themselves: Level 1 is skipped.
- Actions at either level: Approve, Ask for update (comment required, goes straight back to the employee, status update_requested; resubmitting starts again at Level 1), Reject (requests only). Level 2 approval is final and runs the effects (attendance updated, leave applied, deduction reversed, etc).
- Queues: items waiting on a person appear in that person’s My team → Approvals. Items waiting on a team appear in Payroll → {service} → Requests. Payroll can see items sitting with people (read-only) and send a Remind notification.
- Leave cancellation and comp off requests use the leave approvers. Profile updates go straight to HR (no manager).
- Request statuses: pending_l1, pending_l2, update_requested, approved, rejected, withdrawn, cancelled (approved leave that was cancelled).

### Payroll month
- There is no month lock. Processing payroll only records the month as paid. Anything changed afterwards (leave, timesheets, attendance) is picked up by the next payroll. Loss of pay and retro adjustments are owned by the payroll team.
- Payroll for a month can only be processed when every timesheet period in it is Approved (when timesheet approval is on).

### Employee working days
- The prototype uses company-wide weekly offs. The real build must use each employee’s own working days and shift (the per-employee schedule already in the latest code) for: late marks, hours targets, leave day counts, half days, the sandwich rule, calendars and comp off eligibility.

### Payroll navigation
- The Payroll side has no service tabs. Admins open each service (Timesheet, Attendance, Leave, Overtime, Reimbursements, Employees, Payroll settings) from Quick actions on the Payroll dashboard, each tile showing what’s waiting for them. A service page shows the breadcrumb Payroll › Services › {service} and a way back to the dashboard.

<!-- module: attendance -->
## Attendance module

### ESS · Attendance rules
- One check-in and one check-out per day. No automatic check-out: a session stays open until the employee checks out, even across days.
- Overnight work counts to the check-in day: store outDays (0 = same day, 1 = next day…). Hours worked = check-out + outDays × 24h − check-in, breaks included.
- Breaks: multiple per day, { start, end, description }. Start/End only while checked in; checking out ends a running break. Today’s breaks can be edited directly (no overlaps, inside the session); past breaks only via a correction.
- Late mark: check-in after shift start + grace. With first-half leave, the shift start moves to mid-shift. No exceptions for working late the night before.
- Location (attendance-only mode): optional day-level timeline [{ at, location, client }], changeable any time; first entry from the pre-check-in choice.

### ESS · Attendance tab layout
- Header: one "Request correction" button. Grid: Today | Month totals (3×3) | My correction requests (spans both rows, same height as the left side, scrolls inside). Calendar spans the first two columns.
- Totals: Present, Late, Half day, Absent, On leave, Holidays, Worked off-days, Break time, and "Xh worked, Yh overtime".
- Correction popup: date picker, "Recorded now", check-in, check-out, same day / next day, reason. Refuses future dates and days with a pending correction. Asks before replacing edited times when the date changes.

### Payroll · Scope
- Keep the existing Attendance page. Add a Requests section for attendance corrections waiting on Payroll, using the shared admin requests list.

### Settings · Attendance
- Tracking mode (attendance only / timesheet only / both / neither), working day rules (grace period, half-day threshold, break), and the Level 1 / Level 2 approvers for attendance corrections, all in Payroll settings → Attendance, timesheet & overtime.

### Link to Leave
- Late check-ins deduct leave (see the Leave module: late check-in deduction). The Attendance tab shows the Notes panel for those deductions and the dispute (correction) flow.

<!-- module: timesheet -->
## Timesheet module

### ESS · Timesheet entries
- Entry: { id, date, start|null, end|null, startNext, endNext, mins, description, project|null, location, client|null }. Hours-only entries allowed (parse 1:30, 1.5, 1h 30m).
- An end earlier than the start means the next morning ("Ends next day"). On an overnight day, a start before check-in means after midnight.
- Overlaps are blocked, including against breaks and leave/holiday rows.
- Location per entry (attendance + timesheet and timesheet-only): Office / Home / Client site (+ client name, required). Defaults to the last used.
- Project codes when HR turns them on: required on every entry.

### ESS · Rows the system adds (read-only, not stored as entries)
- Breaks (description editable), approved leave (full shift, or the half for half days), weekday public holidays (skipped if the employee checked in that day).
- They count towards logged hours, never count as overtime, and never make a period "Saved" or need submitting.

### ESS · Targets and saving
- Day target = hours worked (full check-in to check-out). Timesheet-only = shift length. Leave or public holiday (no check-in) = shift length. Half-day leave = worked + half shift.
- Every change saves immediately; changed dates are tracked (dirty set) and shown as "Saved" until submitted.
- Submit (view bar) sends every period overlapping the current Day/Week/Month view that is Draft or Update requested. If only edits of already-sent periods are included: "Only your changes will be resubmitted" + the changed dates. Day view notes that the whole filing period goes.
- Auto-submit at the HR-set day and time sends Draft periods with entries (and their attendance). Anything already sent is left alone.
- Editing a period after it was sent (even approved) moves it back to Draft with a baseline; reviewers see "What changed".
- Period statuses: draft → submitted (with Level 1) → with_payroll (with Level 2) → approved; rejected = Update requested.

### ESS · Timesheet screen
- Calendar 65% / Notices 35% (same height, scrolls inside). Legend: Saved · Submitted · Update requested · Leave · Public holiday · Selected (red outline on the days in view).
- Notices: the focused week’s status, "Needs your action" across all weeks with Go to day, Unlogged hours, History. No Submit in Notices.
- Single bar per day (no second meter). The axis stretches past midnight on overnight days.
- Download timesheet: date range presets + custom, downloads .xlsx (template columns + Status), Copy rows as a fallback.
- Upload timesheet: .xlsx/.xls/.csv; Download template inside the popup; matches columns by name (synonyms), validates each row (date, times, hours, location, project, description, overlaps), imports only the ready rows as Saved. A downloaded file must upload back cleanly.

### Payroll · Sub-tabs
- Overview: payroll readiness banner (blocked by N employees / ready / processed), counts of periods (Not submitted, With managers, Waiting for you, Update requested, Approved), department table (people, hours logged, hours worked, statuses).
- Details: every employee’s timesheets in the same Week/Month browser the manager uses, department filter. Read-only unless the period is waiting for Payroll.
- Requests: periods waiting for Level 2 (or a team at Level 1). Review opens the shared review screen at that level; "This approval is final."
- The old Level 2 approvals and Timesheet status pages are retired; redirect their routes here.

### Settings · Timesheet
- Timesheet approval on/off, auto-submit day and time, project codes (on/off + list), and the Level 1 / Level 2 approvers for timesheets, in Payroll settings → Attendance, timesheet & overtime.

<!-- module: overtime -->
## Overtime module

### ESS · Overtime
- Suggestion = hours worked − shift length, at least the HR minimum. Weekends and public holidays count in full. Leave/holiday rows never count.
- No suggestion while the day is still open, while a correction for it is pending, or if the day was claimed as comp off.
- Overtime only exists once the employee claims it (planned overtime allowed).

### Payroll · Sub-tabs
- Overview (month): Requested, With managers, Waiting for you, Approved (hours + count), department table.
- Details (month): per employee requests, approved and pending hours; click for their requests.
- Requests: shared admin list.

### Settings · Overtime
- "Suggest overtime from N min extra" and the Level 1 / Level 2 approvers for overtime, in Payroll settings → Attendance, timesheet & overtime.
- A day can be claimed as overtime or comp off, not both.

<!-- module: leave -->
## Leave module

### ESS · Layout
- Sub-tabs: Overview · My requests (count of open) · Public holidays. "Apply for leave" is pinned top right; "Request comp off" next to it when comp off is on.
- Overview: compact cards, up to 4 per row (2 on phones), one per leave type that applies to the employee: name, "available / total days" (e.g. 6 / 18 days), View details. Nothing else on the card. Then Upcoming leave and Next public holiday.
- Overview also shows "Recent activity": the last 10 changes across all the employee’s leave types, newest change first (requests and decisions, credits, late deductions, reversals, expiries). Columns: Date, Leave type, What happened, Period, Days (+/−), Status. Leave rows open the request drawer.
- View details opens the type’s page: four cards (Available of total, Approved, In request, Carried forward with the limit), a one-line summary (credited so far, credit method, next credit, probation rule, what lapses), then ONE log table with everything for that type: leave requests, credits, carry forward, lapses/expiry, late deductions and reversals. Columns: Date, Entry, Period, Days (+/−), Status, Reason. Filters: Show (All / Leave / Credits / Deductions with counts), status, date range. Leave rows open the request drawer.
- My requests: a table (Leave type, Start date, End date, Duration, Status, Action View), with filters All / In progress / Approved / Rejected or withdrawn. Comp off, cancellation and change requests are listed too. A pending cancellation or change shows under the status.

### ESS · Balance (what "available" means)
- Available = credited so far − approved leave − late deductions − leave still in request (pending or update requested). Example: 10 credited, 4 taken, 2 requested = 4 available.
- Show it as soon as a leave type is picked in the form, plus "{n} days waiting for approval are already taken off".
- Loss of pay only happens when a balance runs out (late deductions, or an approver approving anyway).

### ESS · Applying
- Leave types listed = active types that apply to the employee’s gender.
- Full days or Half days. Half days can cover a range: first or second half of every working day in it, one request (0.5 per working day).
- Duration counts the employee’s working days. With the sandwich rule on, days off strictly between two leave days in the same request count too (never at the edges, never for half days).
- Supporting document field appears only when the type’s rule needs it for that duration ("longer than N days", or always).
- Blocked: dates already covered by leave (approved, pending or update requested), not enough available balance, types set to "Not available" during probation.

### ESS · After applying
- Clicking a request opens a drawer: details (type, dates, day type, duration, reason, document, and "Was" for changes), approval chain, history with comments, and the actions that fit its state.
- Pending / update requested: Edit request (or Update and resubmit) in the drawer → saved in place and sent back to the start of the approval chain; Withdraw.
- Approved: Change leave → a leave change request (new dates/type/half, reason) that needs approval; the original leave stays until it’s approved, then it’s replaced. Cancel leave → a cancellation request; the employee picks "Cancel from" (whole leave, or from a date).
- Past dates: approved leave that’s in the past (or partly past) can still be cancelled or shortened, but only for days the employee actually worked: there must be a check-in (attendance modes) or timesheet entries (timesheet-only) on each past working day being removed. Otherwise refuse and point them to an attendance correction first. HR cancelling from Payroll isn’t limited by this.
- Approved leave updates attendance (status, late mark at mid-shift for first-half leave, "Absent (other half)") and fills the timesheet automatically; cancellations and changes update them again once approved.

### ESS · Comp off
- Only for a weekly off or public holiday the employee actually worked (attendance, or timesheet in timesheet-only mode). Half a shift or more = 0.5 day, a full shift = 1 day.
- Refused: working days, days not worked, days already claimed, days older than the expiry window, days claimed as overtime.
- Approved comp off becomes a "Comp off" balance usable in Apply for leave. Unused comp off expires N days after the day worked (oldest used first).

### ESS Attendance · Late check-in deduction
- Each late mark deducts settings.lateDays (default 0.5, 0 = off) immediately, from the order set in Leave settings (default Annual, then Casual, then loss of pay).
- It stays deducted while a dispute (correction) is pending. When the correction is approved and the day is no longer late, it’s reversed automatically and shown as "+0.5 reversed".
- Attendance tab Notes panel (latest 5): no dispute yet → Raise dispute; pending → waiting for {approver}; rejected → shows who and their comment, with Dispute again.

### My team · Leave
- Leave requests in Approvals show "{type}: X available now · Y after this" (red when short). Approving when short opens "Not enough leave" (loss-of-pay amount, Approve anyway / Ask for update).
- Leave calendar: approved solid, pending dashed, ½ for half days; "Leave to approve" side panel with an "Also off" clash chip.

### Payroll · Sub-tabs
- Overview: Off today, Off this week, Waiting for you, Leave taken this month, On probation; Off today strip; company leave calendar with the Level 2 "Leave to approve" panel.
- Leaves: approved leave as a table (name + email, type, from, to, duration, reason, applied on, added by, status Upcoming / On leave now / Taken). Filters: when, leave type, date range, search by name/email/type. Cancel (HR, reason, applies immediately, only the days from today if it has started).
- Requests: shared admin list. Views depend on the approval setup: "Waiting for you" only if a team is an approver at some level; "With managers/approvers" only if a person is; Update requested, Rejected, All always. A view stays while older items still sit in it. No "Approved" view here (that’s Leaves). Clash chip per request: approved leave in the same department overlapping.
- Balances: every employee, Status (Probation with "Mark active" → status Active, confirmedOn = today), and per type "available / allocated" (allocated = this year’s entitlement + carry forward; available excludes leave in request). Types that don’t apply to the employee show "—". Click a row for their cards and credits.

### Payroll · Add leave (HR)
- Drawer: employee, start date, end date, duration worked out, full days or half days (first/second half of each day), leave type with available balance, note, optional attachment.
- Same checks as the employee form (overlap, balance, probation). Approved immediately, marked "Added by HR"; attendance and timesheet update straight away.

### Settings · Leave → Leave types
- Table: leave type, days per year, credited, accrual rate, carry forward ("Yes, up to N days" / "No"), applies to, status, actions View / Edit / Deactivate or Remove. Search by name.
- All leave types are paid; there is no unpaid type. Loss of pay only when a balance runs out.
- Drawer fields (each with help text): name, days per year, credited (start of leave cycle / monthly / daily), during probation (credited monthly / full entitlement / not available), carry forward up to N days, encash on exit, supporting document when longer than N days (empty = never, 0 = always), applies to (all / female / male).
- A type that has been used can’t be removed or renamed, only deactivated (hidden from forms, history kept).
- Editing days, credit method, probation rule, carry forward or applies-to asks for confirmation with the number of employees affected.

### Settings · Leave → Public holidays
- Dated list per year (add date + name, remove). Drives calendars, timesheet prefill, leave day counts and comp off eligibility. A holiday on a weekly off gives no extra day.

### Settings · Leave → Configuration
- Leave year (company cycle start date, or joining date) + the automatic roll-forward note.
- Probation: no length setting; explains status-based probation.
- Half-day leave on/off. Sandwich rule: off / weekly offs count / weekly offs and holidays count.
- Comp off on/off + expiry days (0 = never).
- Late check-in deduction: days per late mark (0 = off) and the deduct-from order.

### Settings · Leave → Approvals
- Level 1 / Level 2 dropdowns for leave. Leave cancellations and comp off requests use the same approvers.

### Leave engine (for the backend)
- Leave year: company cycle (HR start date) or each employee’s joining date.
- Credits: at the start of the cycle (full year), monthly (quota/12 on the 1st, no rounding), or daily (quota × days elapsed / days in the cycle).
- Joining or leaving mid-year: a month counts if they join on or before the 15th, or leave on or after the 15th.
- Probation is a status, not a length: while status = Probation each type follows its probation rule (credited monthly / full entitlement / not available). When HR marks the employee Active (confirmedOn), the normal rule applies from that date; upfront types credit the rest of the year then.
- Carry forward at the start of a cycle = min(last year’s unused, the type’s limit); the rest lapses. This runs automatically on the last working day of the cycle.
- Exit: entitlement pro-rated to the last day; unused days of encashable types are encashed, extra days taken are recovered in the final settlement.

<!-- module: reimbursements -->
## Reimbursements module

### ESS · Claim form
- Categories come from Payroll settings → Reimbursements. Under the amount: "Limit ₹X a month · ₹Y left for {month}" or "No monthly limit", plus the claim window.
- Monthly limit counts approved + pending + update-requested claims in the same category and month.
- Receipt upload required when the category says so. Claims older than the claim window are refused.
- Routing follows the reimbursement approvers (default manager → Admin). Update requested → Update and resubmit.

### Payroll · Sub-tabs
- Overview (month): totals in ₹, department table, by category.
- Details (month): per employee totals; click for their claims.
- Requests: shared admin list (default Level 2 = Admin).
- Fold the existing Employee reimbursement page into this tab.

### Settings · Reimbursements
- Categories (monthly limit per employee, receipt required), claim window in days, Level 1 / Level 2 approvers. Default Level 2 = Admin.

<!-- module: profile-and-employees -->
## Profile & employees module

### ESS · Rules
- Edits go to HR for approval (no manager step). One pending update at a time; edited fields are locked while pending.
- Grade is still a placeholder ("L4" style) until Peko’s real format is confirmed.

### Payroll · Scope
- Existing employee list, plus a "Profile updates" sub-tab (HR approvals for ESS profile edits).
- Employee status Probation / Active drives leave probation rules (see Leave).

<!-- module: my-team -->
## My team (approver surface)

### Who sees it
- Anyone with direct reports, or anyone named as a Level 1 / Level 2 approver for any function, or with items waiting on them. Same ESS as everyone else, plus this page.
- If the manager is on leave, items simply wait (no delegation in this version).

### Tabs
- Approvals: one inbox for everything waiting on this person (timesheets + requests, Level 1 or Level 2). Type filters with counts, Select all + "Approve selected". Timesheets open the review screen with "What changed".
- Leave items show "Annual: 7 available now · 6.5 after this" (red when short). Approving when short opens "Not enough leave" with the loss-of-pay amount, Approve anyway or Ask for update.
- Team today, Team attendance (month grid: P, L, ½, A, Lv, H, W, In; click a cell for the day), Team timesheets, Leave calendar (approved solid, pending dashed, ½; "Leave to approve" side panel with an "Also off" clash chip), Team reimbursements (month totals, by person, status filter, inline actions).
- Hide Team today / Team attendance in timesheet-only mode and Team timesheets in attendance-only mode.

<!-- module: ess-shell -->
## ESS shell: Overview & navigation

### ESS Overview · Cards
- Profile: edits go to HR for approval (no manager step). Only one pending update at a time; the edited fields are locked while it’s pending.
- Attendance today: Check in · Start/End break · Check out. Status line, breaks today with Edit breaks, the late-deduction note after a late check-in, and the "Working from" switch only in attendance-only mode.
- If an earlier day is still open (no check-out, search back 60 days), Check in is disabled and "Check out from {date}" closes it with today’s time and outDays = days between. The server must refuse a check-in while an earlier session is open.
- Today’s timesheet: the same entry form as the Timesheet tab (labelled fields, location, project when on), the day bar, and Submit with the unlogged-hours check. Note: "Every change saves automatically…".
- Quick actions: one row. Managers / approvers also get My team (with a count badge).
- Recent days: last 10 working days with check in/out (next-day chip), hours worked, hours logged, overtime state.

### ESS Overview · Notifications → Needs your action (order)
- Update requested on any of my requests (with the approver’s comment).
- Still checked in from an earlier day.
- Late check-in deductions from the last 7 days, not yet disputed (max 3), with Request correction.
- Sent-back timesheet, unclaimed overtime, and for approvers "{N} waiting for your approval".

<!-- module: payroll-settings -->
## Payroll settings (where each module’s settings live)

### General
- All ESS settings live in the existing Payroll settings section, never inside service tabs. "Run payroll" is not a setting.
- Settings drive ESS behaviour directly; changing them affects employees from that moment (items already in flight keep their approvers).

### Tabs
- Attendance, timesheet & overtime → see the Attendance, Timesheet and Overtime modules.
- Leave (Leave types, Public holidays, Configuration, Approvals) → see the Leave module.
- Reimbursements → see the Reimbursements module.
