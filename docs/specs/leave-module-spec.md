# Leave module: build spec

Source of truth for the Leave module. It comes from the Developer notes in the prototype (`docs/prototypes/leave-prototype.html`, button at the bottom right). Where this spec and the prototype differ, this spec wins.

## Leave module

### ESS · Layout
- Sub-tabs: Overview · My requests (count of open) · Public holidays. "Apply for leave" is pinned top right; "Request comp off" next to it when comp off is on.
- Overview: one card per leave type that applies to the employee (gender), then Upcoming leave and Next public holiday.
- Clicking a card opens that type’s page: Available / Approved / In request cards, every request of that type (start, end, day type, days, reason, applied on, status), filters (status with counts, date range), and "Credits and deductions this year".

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
- Pending: Withdraw. Update requested: Update and resubmit (starts again at Level 1).
- Approved and not finished: Cancel leave → a leave cancellation request (reason, same approvers). If the leave has started, only the days from today are cancelled. The leave stays booked until the cancellation is approved; then the days go back to the balance.
- Approved leave updates attendance (status, late mark at mid-shift for first-half leave, "Absent (other half)") and fills the timesheet automatically.

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

## My team (approver surface)

### Who sees it
- Anyone with direct reports, or anyone named as a Level 1 / Level 2 approver for any function, or with items waiting on them. Same ESS as everyone else, plus this page.
- If the manager is on leave, items simply wait (no delegation in this version).

### Tabs
- Approvals: one inbox for everything waiting on this person (timesheets + requests, Level 1 or Level 2). Type filters with counts, Select all + "Approve selected". Timesheets open the review screen with "What changed".
- Leave items show "Annual: 7 available now · 6.5 after this" (red when short). Approving when short opens "Not enough leave" with the loss-of-pay amount, Approve anyway or Ask for update.
- Team today, Team attendance (month grid: P, L, ½, A, Lv, H, W, In; click a cell for the day), Team timesheets, Leave calendar (approved solid, pending dashed, ½; "Leave to approve" side panel with an "Also off" clash chip), Team reimbursements (month totals, by person, status filter, inline actions).
- Hide Team today / Team attendance in timesheet-only mode and Team timesheets in attendance-only mode.
