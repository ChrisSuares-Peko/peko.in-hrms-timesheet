# Leave policy and leave requests (ESS)

PROTOTYPE-SETUP (Final batch, Slice 1). Mock API served by `src/prototype/mocks/handlers/ats.ts` under `/api/v1/ess/ats/`. The rules are pure and tested: `src/prototype/rules/leavePolicy.ts`. The stores are `src/prototype/mocks/store/atsLeave.ts` and `atsRequests.ts`.

There are three leave types: **Annual**, **Casual** and **Sick**. "Earned leave" was renamed to **Annual** and the seed data was migrated to match.

## Settings

The company policy is `settings.leavePolicy`. It is read and saved with the other settings (`GET` / `PUT payroll/settings`).

| Field | Default | Meaning |
|---|---|---|
| `year` | `COMPANY` | `COMPANY`: one leave year for everyone, starting on `cycleStart`. `JOINING`: each employee's year starts on their joining anniversary (29 Feb is treated as 28 Feb). |
| `cycleStart` | `04-01` | The company leave year's start date, as "MM-DD". |
| `probationMonths` | `6` | `0` means there's no probation. |
| `types.ANNUAL` | 12 days, `MONTHLY`, carry 30, encash on exit | |
| `types.CASUAL` | 8 days, `UPFRONT`, carry 0, no encashment | |
| `types.SICK` | 6 days, `UPFRONT`, carry 0, no encashment | |

`settings.lateDeductionDays` defaults to `0.5`. It's the number of leave days deducted for each late check-in, and `0` turns deductions off.

## How leave is credited

- **Upfront**: the whole year's days are credited on the first day of the leave year.
- **Monthly**: daysPerYear ÷ 12 is credited on the first of each month. It isn't rounded, so 12 ÷ 12 = 1 and 8 ÷ 12 = 0.667.
- **Probation**: every type is credited monthly during probation, whatever its setting. When probation ends, the rest of the year's entitlement arrives in one entry (`PROBATION_REST`).
- **Pro-rata**:
  - A joining month counts if the employee joins on or before the 15th.
  - A leaving month counts if the employee leaves on or after the 15th.
  - An upfront type is pro-rated by the months counted.
- **Carry forward**: last year's closing balance carries over up to the type's limit. Anything above the limit lapses (an information row).
  - The demo persona's seeded closing balances are Annual 5, Casual 2 and Sick 1.
  - Annual's 5 days carry forward. The Casual and Sick days lapse.

## Ledger

Each type has a ledger, newest first. Each entry is `{ date, kind, amount, text }`, where `amount` is `+` for a credit, `−` for a debit, and `null` for an information row.

The ledger kinds are:
- carry-forward: `CARRIED`, `LAPSED`;
- credits: `MONTHLY`, `PROBATION_MONTHLY`, `PROBATION_REST`, `YEARLY`, `PRORATED_JOIN`, `PRORATED_EXIT`;
- debits and their reversal: `TAKEN`, `LATE`, `LATE_REVERSED`.

A balance (`LeaveBalance`) has these fields:
- `available`;
- `creditedSoFar`;
- `totalThisYear`;
- `carried`;
- `taken`;
- `late` (deductions still standing);
- `next` (the next credit's date and amount);
- `ledger`.

## Late check-in deductions

- Every late check-in this leave year deducts `lateDeductionDays`. The deduction comes from Annual first, then Casual, and anything left becomes **loss of pay** (`lossOfPayDays`).
- The deduction stays in place while an attendance correction for that day is pending (`state: 'pending'`).
- An approved correction that removes the late mark reverses the deduction. Its state becomes `reversed`, with `reversedOn` set to the approval date, and a `LATE_REVERSED` credit is added to the ledger.
- Deductions become final when payroll is processed for the month.
- Deductions apply only in modes that track check-in.

### Where deductions show (Slice 5)

- **Attendance days.** `AttendanceDay.lateDeduction` is `{ days, from, state, reversedOn? }`. It's set on the overview's `today` and on `attendance` month days.
  - The Today card shows a note: "Late by 25m. Half a day of Annual leave has been deducted. If you weren’t late, request a correction. It’s reversed automatically once approved."
  - The day details show a "Late deduction" row, for example "0.5 day · Annual leave".
- **Overview.** "Needs your action" lists deducted late check-ins as `kind: 'late'` actions: the last 7 days only, skipping pending corrections and processed months, newest first, at most 3. For example: "Late on Fri 23 Oct · −0.5 day" with a "Request correction" button.
- **Leave page.** It has a "Late check-in deductions" list, plus a Loss of pay card when any days ran past every balance.
- **Wording.** It lives in `lateTodayNote`, `lateDayDetail`, `lateNotification` and `lateLedgerText` (rules/leavePolicy.ts).

## Exit settlement

When the employee has an exit date, `exit.settlement` lists the following for each type:
- `encash`: unused days that are paid out. Only encashable types are paid out, so Annual is by default.
- `recover`: leave taken beyond what was earned up to the exit date. These days are recovered as loss of pay.

## Endpoints (employee)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `leave` | — | `LeaveView`: the leave year, `probationUntil`, `exit`, balances with ledgers, `lateDeductions`, `lossOfPayDays`, `lateDeductionDays`, requests (each with `statusLabel`) and `managerName`. |
| POST | `leave/requests` | `LeaveRequestInput` `{ type, start, end?, half?: 'FIRST'\|'SECOND'\|null, reason, proof?: { name } }` | `LeaveView` |
| POST | `leave/requests/{id}/withdraw` | — | `LeaveView` (pending requests only) |
| PUT | `demo/employee-life` | `{ dateOfJoin?, exitDate? }` | `LeaveView`. This is a demo control: it overrides the persona's joining and leaving dates, and changes the leave maths only. |

`LeaveView` also carries the following (Slice 6):
- `employeeName`.
- `approvalPath`, for example "Arjun Mehta (manager), then HR team".
- `calendar: { weeklyOff, holidays }`. The apply form uses it to count working days, checking with `validateLeaveRequest` as the server does.

The ESS Leave page is at src/domains/attendanceTimesheet/leave/EssLeavePage.tsx (route `ess-employee/leaves` and `ess-manager/leaves`). It has:
- the header with the leave year;
- the probation and exit banners;
- the balance cards, each with a ledger you can expand;
- the Loss of pay card;
- the requests, with Withdraw on pending ones;
- the late deductions;
- the public holidays;
- the demo dates.

Payroll → Settings → Attendance & Timesheet has a "Leave policy" panel.

### Checks when applying, in order

| Check | Message |
|---|---|
| Leave type | "Pick a leave type." |
| Dates | "Pick a valid date." / "The end date is before the start date." |
| Working days (weekly offs and holidays aren't counted; a half day is 0.5) | "Those dates are all weekly offs or holidays." |
| Overlap with a pending or approved request (the first and second halves of the same day don't clash) | "You already have leave on these dates ({summary})." |
| Balance (available minus pending requests) | "You have {n} day(s) of {Type} leave available right now. Apply for fewer days or pick another leave type." |
| Proof for sick leave over 3 days | "Sick leave of more than 3 days needs a medical certificate or proof." |
| Reason | "Add a short reason." |

## Routing

| Request | Level 1 | Level 2 (default; set in `settings.level2`) |
|---|---|---|
| Leave | Manager | HR |
| Reimbursement | Manager | Admin |
| Attendance correction, overtime, timesheet | Manager | Payroll |

- The manager sees leave and reimbursements under `team/approvals/requests/{leave|reimbursement}`.
- Level 2 sees them under `payroll/approvals/{leave|reimbursement}?role=HR|ADMIN`.
- An employee with no manager skips level 1.

## What approved leave changes

- **Full day**: the day shows as leave in attendance and the timesheet, and no hours are expected that day.
- **Half day**:
  - The day shows "Half-day leave (first half)" or "Half-day leave (second half)".
  - After a first-half leave, the late threshold moves to mid-shift.
  - A past day with no check-in shows "Absent (other half)".
  - In Timesheet-only mode, half the shift's hours are expected.
