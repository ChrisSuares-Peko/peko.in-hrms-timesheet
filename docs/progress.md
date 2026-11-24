# Progress — Leave module: settings rework, per-event & maternity, holiday upload, Peko One design

PROTOTYPE-SETUP. Run log. Sources: `docs/dev-notes/dev-notes.json` (the notes) and
`docs/prototypes/leave-prototype.html` (the panel's look and behaviour). If a run stops, continue from the first step
that isn't **done**. The previous run (Leave module updates + module-grouped notes panel, `c34e05f`–`9b91229`) is
finished and pushed; its log is in git history (`git show 9b91229:docs/progress.md`).

## Leave module: settings rework, per-event & maternity, holiday upload, Peko One design + tooltips — in progress

Spec: `docs/dev-notes/dev-notes.json` (guide.read / guide.shared; pay:settings:leave:types / config / holidays /
approvals, pay:leave:overview, ess:leave:overview / requests) and `docs/prototypes/leave-prototype.html`.

| Step | Commit | Status |
|---|---|---|
| A + B — Leave type model, migrations, engine rules and tests | Leave: leave type model, migrations and rules for the settings rework | done |
| C1 — Payroll settings → Leave types (table, view, drawer incl. Maternity) | Leave: leave types table, view and drawer (yearly, per event, Maternity) | done |
| C2 — Configuration (credit date, sandwich, …) and Public holidays bulk upload | | |
| C3 — ESS Apply for leave and Payroll Add leave | | |
| D — Peko One tokens, type, buttons, inputs, underline tabs, tags, InfoTip (shared pieces) | Design: Peko One tokens, underline section tabs and InfoTip | done (tooltips moved with each screen) |
| E + VERIFY — developer notes, VERIFY 1–9, build, push | | |

Migrations (`migrateLeaveType` / `migrateLeavePolicy`, run on every settings read; nothing is rewritten until HR saves):
- Probation values stay as they are (MONTHLY / FULL / NONE; DAILY is new). The brief's `prob` none / monthly / daily /
  full is the existing `probation` field (NONE / MONTHLY / DAILY / FULL); `credit` keeps CYCLE_START (= "upfront") /
  MONTHLY / DAILY.
- yearEnd 'carry' gets `excess: 'lapse'`; types without yearEnd: carry when a limit is set, else lapse.
- Leaving: one option now. Both ticked (the last run's "employee chooses") → ['encash']; onLeaving / encashOnExit as before.
- Maternity: any stored shape becomes the statutory system type — the prototype's weeks { w1, w2, pre1 } → d1 = d2 = w1×7,
  d3 = w2×7, pre = pre1, post = 0; the last run's 26 weeks from 56 days before → d1 = d2 = 182, d3 = 84, pre = 8,
  post = 0. Never below 182 / 182 / 84; pre at most 8. Document required. A company without Maternity gets the default.
- Per-event types without a trigger → 'other'; their eventLabel stays as the date label; docRequired = they had a
  document rule.
- The company-wide half-day setting (`leaveRules.halfDay`) becomes every yearly type's `halfDay` (per-event: no half days).
- Sandwich: the enum becomes `{ on, when, overDays, weeklyOffs, holidays }` (OFF → off; WEEKLY_OFFS → on, weekly offs;
  WEEKLY_OFFS_AND_HOLIDAYS → on, both); `creditTime` defaults to 12:00; `matOn` to false.
- Requests: `child` is new and optional (Maternity), so every stored request reads as before.

Decisions:
1. **Field names.** Existing names are kept where the brief's field is the same thing (`probation` = prob,
   `credit` = credit after probation, `carryForward` = carry, `proofAfterDays` = proofDays, `appliesTo` = gender,
   `active` = Show to employees); new ones use the brief's names (`excess`, `halfDay`, `trigger`, `docRequired`,
   `docName`, `mat`, `matOn`, `creditTime`, `child`).
2. **Daily during probation** accrues day by day while the employee is on Probation; once Active, the months spent on
   probation count as monthly credits (the engine has no per-day probation history).
3. **Per-event window** applies to the START date only: the block can run past the window end. One active request per
   type and event date ("It has to be taken in one go; change that request instead"); the duration is at most the
   entitlement.
4. **Maternity entitlement and earliest start by child**: first / second / third or later; "before" = the setting, at
   most 8 weeks, 6 for the third child or later; "after" = post weeks. Weeks are 7 days.
5. **Maternity's headcount**: current employees = Employees without a leaving date in the past (`currentHeadcount`).
   Above 10: required, the switch is locked on and saving it off keeps it on. 10 or fewer: optional, off by default
   (`matOn`). When it's not offered it's hidden from employees' cards and forms.
6. **Daily credit timing** uses the browser's time as the company time zone in the prototype (`nowTime`).
7. **LOP half days** stay allowed (half days are per leave type now and LOP isn't one).
9. **Primary colour: #FF4F4F (Peko One) on these screens, #FF3A3A still in the global theme.** The leave screens get it
   through PekoScope (one ConfigProvider nested in the global theme, as before); `src/antd.config.tsx` is untouched.
   Everything outside the scope (sidebar, header, breadcrumb, other modules) stays #FF3A3A until design aligns the
   global theme — flagged in the report.
10. **No hard-coded colours in components.** Tokens live in `pekoTokens.ts` (antd theme) and as CSS variables in
    `peko.css` (`--peko-primary`, `--peko-muted`, `--peko-border`, status pairs…); 502 Tailwind hex classes in the
    redesign files now read `var(--peko-…)`. Left as literals on purpose: the calendar palettes (timesheet three-month
    calendar, attendance calendar, team grid, comp off calendar; "calendars keep their colours") and a handful of one-off
    chips, listed in the report.
11. **Status tag pairs** move to Peko One: success #308242 on #ECF8EF, warning #B45309 on #FFFBEB, error #DC2626 on
    #FEF2F2; info and leave (not in the design system) use the Tailwind blue / violet pairs; neutral slate.
12. **Buttons:** neutral (antd default) = grey outline with a grey hover; secondary (`peko-approve` / `peko-secondary`)
    = red outline — Approve in request rows (was green outline); primary solid red; text / link red. Inputs, selects
    and pickers: #E2E8F0 border, 8px radius, red focus border; labels 13 medium; hints 12/18.
13. **Section switchers** are antd line Tabs (`PekoSectionTabs`): Payroll Leave, the other Payroll service pages
    (Timesheet, Overtime, Reimbursements — same shared sub-tabs), Payroll settings → Leave, ESS Leave. Counts are the
    small red pills. Filters (status, month, year, Day/Week/Month) stay Segmented.
8. **Date-dependent tests**: "Reporting manager at level 2" and "leave and absent days" also fail on the previous
   commit on 24 Nov (their dates land on a weekend); left as they are.

## Leave: policy settings, per-event leave, LOP and overview layout — done

Spec: `docs/dev-notes/dev-notes.json` (pay:settings:leave:types / config / approvals, ess:leave:overview / requests,
guide.shared) and `docs/prototypes/leave-prototype.html`. Goal: HR can set up Peko's own Leave & Attendance Policy
(June 2026) through settings alone.

| Step | Commit | Status |
|---|---|---|
| 1 + 5 — Leave type model, migration, engine rules and tests | Leave: leave type model and policy engine | done |
| 2 — Payroll settings → Leave types: table, drawer, view, confirmation | Leave: leave types settings for yearly and per-event leave | done |
| 3 — Configuration: credit date, rounding, loss of pay | Leave: credit date, rounding and loss of pay settings | done |
| 4 — Approvals: extra approval for longer leave | Leave: extra approval for longer leave | done |
| 6 — ESS Leave: Request LOP, Apply for per-event / calendar types, overview grid | Leave: request LOP, per-event leave in ESS and the overview grid | done |
| 7 — Developer notes check, VERIFY 1–5, build, push | Leave: verification and API notes | done |

Mapping of existing leave types (`migrateLeaveType`, run on every settings read; nothing is rewritten in storage
until HR saves):
- `kind` → 'yearly' for every stored type; `count` → 'working'.
- `yearEnd` → 'carry' when `carryForward` > 0, else 'lapse'. The limit stays in `carryForward` (the brief's `carry`).
- `exitOpts` ← `onLeaving` (last run) or `encashOnExit` (older): ENCASH / true → ['encash'], BRING_FORWARD / false →
  ['prepone']. The old fields are dropped from the type.
- Per-event fields default to `limit: null, limitUnit: 'days', eventLabel: '', windowBefore: null, windowAfter: null`.
- Policy: `creditDate: 'START'`, `creditDay: 1`, `rounding: 'NONE'`, `lop: 'USED_UP'` when missing (START keeps the
  old monthly credit on the 1st). Settings: `leaveEndorsement: { enabled: false, overDays: 5, endorser: 'DEPT_HEAD' }`.
- Requests: `eventDate` and `lop` are optional, so every stored request reads as before.

Decisions:
1. **Field names.** The brief's values are used as given (`kind: 'yearly' | 'event'`, `count`, `yearEnd`, `exitOpts:
   ['encash' | 'prepone']`, `limit`, `limitUnit`, `eventLabel`, `windowBefore`, `windowAfter`). The carry limit keeps
   its existing name `carryForward` so stored data and the API don't need renaming; `yearEnd: 'carry'` uses it.
2. **Stored Maternity / Paternity stay yearly** if a company already saved its policy: the migration can't know HR
   wants them per event. New companies (and the demo, which starts from the defaults) get the per-event defaults; HR
   can switch an existing type to "Per event" in the drawer.
3. **Weeks are 7 days.** "26 weeks per event" = 182 days whatever the counting (calendar for Maternity).
4. **Per-event types** skip the balance check, the sandwich rule and settlement, aren't in balance tables or the late
   deduction order (they're dropped from `lateOrder` when a type is switched to per event), and never flag loss of pay
   on approval. The probation rule still applies (default "Full entitlement").
5. **Rounding** is applied to the running total of each type's credits (each ledger line is the change in the rounded
   total), so the ledger always adds up to the rounded credited-so-far; the year's total is rounded the same way.
   Daily accrual: credited-so-far is rounded, the monthly ledger lines aren't. Pro-rating stays unrounded until then.
6. **Credit date** moves monthly credits (and probation monthly credits) to the start / end / custom day of each leave
   month; never before the joining date. Start-of-cycle and daily credits are unaffected.
7. **Year end:** encash writes an information ledger line ("6 unused days encashed at the end of last year (paid by
   payroll)", kind ENCASHED); payroll's payout is another team's.
8. **Leaving banner:** both options → "your choice: encash them in the final settlement or use them to bring your last
   working day forward"; none → "N days unused lapse when you leave".
9. **Loss of pay** is stored as a leave request with `type: 'LOP'`, `lop: true` ("Loss of pay"). It has no balance and
   no `lossOfPayDays` flag (lop itself is the flag). Edit and Change are refused ("Loss of pay can only be withdrawn or
   cancelled"); an LOP sent back for an update can only be withdrawn.
10. **Department head** (rules/leave.ts `departmentHead`): the person in the employee's department whose own manager is
    outside it, or who has none; several → the one with the most people in the department under them, then the lowest
    id. From the org data: managerEmployeeId → that person's department.
11. **Demo org:** every reporting manager was also their department head, so the endorsement would always be skipped.
    One two-level line is added: Imran Shaikh (ACME-014) reports to Divya Menon (ACME-013), who reports to Manish Patel
    (Operations head). Imran's longer leave goes Divya → Manish (endorsement) → Admin / HR.
12. **Endorsement on edits:** approvers stay as fixed at submission; on resubmit (edit or update requested) it restarts
    at level 1 and the endorsement step is added or removed for the new number of days.
14. **Leave types drawer:** Kind and Count first; the yearly sections (Days per year, Credited, joins, year end, leaves)
    or the per-event section (Up to N days/weeks, event date label, window) show for the kind picked. Confirmation also
    covers kind, counting, year end and the event limit (the employee count is everyone the type applies to now).
    The View popup lists every rule in plain language (`leaveTypeRules`).
15. **Late-deduction order** (Attendance settings) only offers yearly types.
16. **Configuration panels** sit in this order: Leave year (the roll-forward note now names each type's year-end
    rule) · Credit date · Rounding · Leave requests (half days) · Loss of pay · Sandwich rule · Comp off. They save
    with the existing "Save settings" (PUT leave-settings/config, now also creditDate, creditDay, rounding, lop).
17. **Extra approval** is stored on the settings (`leaveEndorsement`), saved with the approvals (PUT ats settings),
    validated server-side (days 0–365; endorser DEPT_HEAD or an existing person). The step is a person step
    (`role: 'MANAGER'`, `endorsement: true`, level 1) inserted after level 1, so it uses the same person queue, decide
    and "Ask for update" code; level 2 only sees the request once every level-1 step (endorsement included) approved.
    The chain shows "{name} (endorsement)"; the employee's "Approval:" line names the usual approvers (the endorsement
    depends on the request's length).
18. **Apply footer note** follows the brief, not the notes: "Need unpaid leave (loss of pay)? Use Request LOP once all your
    paid leave is used up." (the notes still say "Email Admin / HR to arrange it"; the brief asks for the pointer to
    Request LOP). With "Any time" the "once …" part is dropped.
19. **Request LOP** is a separate modal (RequestLopModal) with the same fields as Apply minus the type; Send is disabled
    and the paid balances are listed while the rule blocks it. The drawer offers Withdraw (pending / update requested)
    or "Cancel loss of pay" (approved) only, and shows "Pay: Unpaid …". Approvers see the unpaid line in amber instead
    of a balance line, so there's no "Not enough leave" dialog.
20. **Per-event types in ESS** come from a new `eventTypes` list on the Leave view (active, for the employee's gender).
    Apply lists them after the yearly types; the box shows "Up to N per event · counted in …" with the window; an event
    date field appears with the window hint. The overview shows them as grey info cards ("Up to … per event ·
    Working/Calendar days · apply when needed", with "Apply ›"). Approvers see "Up to … per event · {event label}: {date}".
21. **Overview grid** (`OverviewGrid`): desktop from antd `lg` (1024px) — N ≤ 2: 4 columns, leave cards then the two side
    cards in columns 3–4; 3–4: 3 columns, leave cards 2 per row, side cards stacked in column 3; 5+: 4 columns, leave
    cards 3 per row, side cards stacked in column 4 (rows 1–2). Below lg: 2 columns, side cards after. Comp off counts
    as a leave card when it's on. The old separate Upcoming / Holiday section is gone; Recent activity sits below.
22. **Upcoming leave** = the earliest-starting leave request (any type, LOP included) that hasn't ended and isn't
    withdrawn or cancelled, whatever its status, with its status pill; ties → the newest request.
13. **Tests that assumed Maternity was a yearly, probation-blocked type** now use Sick set to "Not available" during
    probation; the exit-settlement demo lists the yearly types only. The HR-cancel test expected "yesterday"; on a
    weekend the leave correctly ends on Friday, so it now checks "before today".

VERIFY (Chrome, scripted; settings changed through the screens, results read from the same live store):
1. **Peko's policy through settings — pass.**
   - Configuration: leave year 1 Jan, credit date End of the month, rounding Nearest half day, sandwich off.
   - Attendance settings: late deduction 0.
   - Leave types: Casual = 14, monthly, Lapse, leaving: lapses. Annual = 18, monthly, carry forward 45, leaving:
     encash. Sick deactivated. Maternity / Paternity are the per-event defaults.
   - Approvals: Reporting manager → Admin / HR, plus extra approval over 5 days by the department head.
   - The settings read back exactly. Kavya (joined 1 Nov) has 0 Casual credited on 22 Nov, the next credit 1 day on
     30 Nov (14/12 rounded to the half day), 2.5 for the year.
   - Imran's 6-day Annual request goes Divya Menon → Manish Patel (endorsement) → Admin / HR, and Payroll → Leave →
     Requests shows "Manish Patel (endorsement)" in the chain. The store test walks the approvals through to Approved.
   - Maternity: 182 calendar days are accepted; 183, or one more day for the same delivery date, are refused ("up to
     26 weeks per event. 182 days already booked"). Paternity 40 days before or 95 days after the birth is refused
     with the window message.
2. **Year end and leaving — pass.** Annual ledger "Carried forward from last year"; Casual "2 unused days lapsed (no
   carry forward)"; with Casual set to Encash, "2 unused days encashed at the end of last year (paid by payroll)".
   With a leaving date: Annual encash 18 / Casual lapse 10; with both options ticked on Annual the banner reads
   "Annual: 18 days unused, your choice: encash them … or use them to bring your last working day forward. Casual: 10
   days unused lapse when you leave."
3. **Loss of pay — pass.** Default rule: "You still have paid leave: 15 Annual · 5.5 Casual", Send disabled. "Any time":
   sent ("Loss of pay", lop = true, 1 day, With Arjun Mehta); the drawer offers Withdraw only; Arjun's My team →
   Approvals shows "Unpaid: payroll treats these days as loss of pay." and no balance line.
4. **Overview grid — pass.** 4 leave cards (Peko setup): 3 columns, side cards in column 3 rows 1–2. 2 cards: one row
   of 4, side cards in columns 3–4. 6 cards: 4 columns, side cards in column 4 rows 1–2 (also at 1024). 7 cards: same,
   a third row of leave cards. 375: 2 columns, side cards after the leave cards. Every row has equal heights. Upcoming
   leave shows one item, the next leave; after the manager rejected it, it still shows it with "Rejected".
5. **Existing data — pass.** Earlier flows still run (`flows.cjs`: edit and resubmit, change, approve at both levels,
   cancellation rules, withdraw; `flow2.cjs`: apply 8 → 9 requests, HR Add leave 25 → 26, Configuration save and
   restore). Old types and requests load through `migrateLeaveType`. No console errors.
   - The Developer notes panel shows the updated text on pay:settings:leave:types / config / approvals and
     ess:leave:overview / requests.
   - In the scripts, the prototype's "Developer notes" pill sat over the Half-day switch and the Save button at the
     bottom edge, so those are clicked directly (prototype-only overlay; it doesn't ship).

Checks: type-check clean; ESLint only the 3 existing errors in `requestStores.ts`; production build passes. Tests:
5762 passed, 357 failed in 159 files — no failing file that wasn't failing in the last run (171 then; the load-related
timeouts in other domains passed this time). New: `rules/__tests__/leavePolicy.test.ts` (23) and
`mocks/store/__tests__/atsLeavePolicy.test.ts` (12). In the leave / attendance suites the only failures are the two
known date ones ("off today", "Excel round trip").

## Design update: Peko design language for the ESS & Payroll redesign screens — done

Look only: no behaviour, data, route, validation or wording changes (apart from the new one-line descriptions the
design asks for, listed under Decisions). Rules: `docs/design/peko-design-language.md`. Screenshots:
`docs/design/screens/before/` and `docs/design/screens/after/`.

| Step | Commit | Status |
|---|---|---|
| 0 — Shared pieces: PekoScope (one theme layer), StatusTag, page header, sweep of radii/borders/greys/red | Design: shared Peko scope, status tag and page header | done |
| 1 — Payroll dashboard: Quick actions as cards | Design: Payroll dashboard quick actions | done |
| 2 — Payroll Leave: all sub-tabs + Add leave drawer | Design: Payroll Leave | done |
| 3 — Payroll settings: Leave sub-tabs, Attendance/timesheet/overtime, Reimbursements | Design: Payroll settings | done |
| 4 — ESS Leave: Overview, type details, My requests + drawer, Public holidays, Apply and comp off modals | Design: ESS Leave | done |
| 5 — My team | Design: My team | done |
| 6 — Remaining ESS and Payroll screens in scope | Design: remaining ESS and Payroll screens | done |
| 7 — VERIFY 1–8, build, push | Design: verification, design language doc, screenshots | done |

Decisions:
1. **Reference.** `docs/prototypes/leave-prototype.html` is the same file as the last run (no Peko palette: it uses
   #E30000 red, blue links, 12px panels, a dark segmented control). Where it disagrees with the design rules in the
   brief or the Peko theme, the rules and the theme win; the prototype is used for layout (what sits where).
2. **No `src/whitelabel/peko.ts` in this code base.** Its values (hover #FF6963, active #E02B2B, surface #FFF7F6, border
   #FFE4E4) are taken from the brief and kept in `src/components/peko/pekoTokens.ts`, next to the antd.config and
   tailwind values they sit with.
3. **One theme layer.** The ESS layout already nested a ConfigProvider (`EssThemeProvider`, with its own #FF4F4F red and
   32px cards). It now renders `PekoScope`, which nests in the global theme and keeps its values (#FF3A3A, #121212,
   36px controls, radius 6); the global `src/antd.config.tsx` is untouched. The same scope wraps every Payroll service
   page and Payroll settings (in `src/routes/sections/payroll.tsx`), so their modals and drawers get it through the
   ConfigProvider context. Payroll settings is wrapped as a whole page, so its other tabs (Company Profile, Payroll Cycle…)
   also get the Peko tabs, table header and card details.
4. **Modal and drawer dividers, card shadow, tag pills** come from ConfigProvider class names (`modal`, `drawer`,
   `card`, `tag`, `alert`, `segmented`, `tabs`) styled in `src/components/peko/peko.css`, because they reach portals.
5. **StatusTag** maps the antd preset colours screens already used onto the six pairs, so every `<Tag>` in scope became
   `<StatusTag>` without changing which status gets which meaning. Two maps moved to match the rules: holiday days
   (cyan → leave pair) and "Update requested" timesheet periods (red → warning pair). The "Leave" chip on the Overview
   status table and leave-type chips use the leave pair.
6. **Stat values are #121212.** CountTile no longer colours values (blue "Waiting for you", green "Approved"); the
   label/value/line carry the meaning.
7. **`danger` on primary buttons removed** (Send for approval, Save settings, Add leave type, Edit…): with the theme's
   primary already red, `danger` only swapped #FF3A3A for #FF4D4F. Destructive buttons (Delete, Cancel request, remove
   break) keep `danger`.
8. **Request rows**: Reject / Ask for update / Approve are small (28px); Approve is outlined green (`peko-approve`).
   "Approve anyway" in the Not enough leave dialog stays primary (it's a dialog footer, not a row).
9. **Quick actions** are cards with an antd outline icon in #EA3639 (the old illustrated PNG/SVG icons can't take the
   icon colour) and one grey line each. Service lines are the prototype's ("Leave, requests and balances", "Expense
   claims"…); the other tiles got short new lines (Salary "Salaries and pay runs", Company Documents "Policies and
   company files", Reports & Forms "Payroll reports and statutory forms", Announcements "News for your employees",
   Download Payslip "Payslips for any month", CTC Calculator "Work out salary from CTC"). The waiting count is the red
   badge top right ("N waiting" as its label and tooltip) instead of a line under the name.
10. **Page header descriptions** that didn't exist before: Attendance "Everyone’s daily attendance, monthly summary,
    holidays, shifts and correction requests.", Employees "Employees, departments and profile updates.", Payroll
    Settings "Rules for payroll and every service: leave, attendance, timesheet, overtime and reimbursements."
11. **Page actions on the tab row**: Leave ("Add leave"), Attendance ("Mark Attendance", "Add Holiday", now primary).
    Employees keeps its three actions beside the title: its tab row has seven tabs and no room.
12. **Main-tab counts** are small red pills (antd Badge): Attendance "Requests", Employees "Profile Update Request",
    "Document Requests", "Profile updates". Segmented sub-tabs keep their "Requests (1)" text.
13. **Content width**: the scope caps content at 1320px; the dashboard layout already gives ~40px side padding on
    desktop, so it isn't changed.
14. **Field labels** in the hand-built forms (Apply leave, comp off, cancel, Add leave drawer) are 14px regular #121212
    (were bold). antd `Form.Item` labels already follow the theme.
15. **Generic greys** left from the prototype (Tailwind gray-400…800, #475467, #667085, #98A2B3, #F9FAFB, #EAECF0)
    are mapped onto the Peko neutrals (#121212, #404040, #595959, #8B8B8B, #FAFAFA, #F5F5F5, #F0F0F0, #EAEAEA).
16. **"Add leave type"** sits right-aligned on the Leave policies sub-tab row (the drawer's open state moved up into
    the tab; same drawer, same save). "Add holiday" stays beside the date and name fields it submits.
17. **Middle-size tables** (most tables in scope) use 14px top/bottom and 12px left/right cell padding, so the leave
    types table fits at 1440 without scrolling; default-size tables keep 16px. Long "Credited" / "Accrual rate" values wrap.
18. **Switches**: the platform's `src/index.css` paints every checked switch green (`!important`); inside the Peko scope
    the switch is primary red (#FF3A3A, hover #FF6963) as the rules ask. Elsewhere in the platform switches stay green.
19. **Card padding**: antd `Card` (also `size="small"`, used by the settings cards) has 20–24px header and body padding.
20. **Leave type drawer**: field labels are 14px regular; the section headings ("When an employee joins"…) are 16px
    medium.
21. **Leave balance cards**: the "available / total days" text is one element with two spans (22px medium number,
    13px grey rest), so its text and the card's aria-label are unchanged. 2 per row on phones, 4 on desktop, 16px gaps.
22. **Footer order**: the leave request drawer lists its primary action first in every state; the footer row is reversed
    visually so the primary sits last on the right (keyboard order unchanged). The correction and overtime request
    modals keep their buttons inside the form (submit), drawn as a footer row: full-width #F0F0F0 divider,
    right-aligned, no longer two full-width buttons.
23. **Section spacing**: ESS Leave and the type details page use 24px between sections, 16px between cards in a row.
24. **Stat tiles everywhere in scope** (Payroll service totals, My team Team today / Team reimbursements, ESS leave
    type details, ESS attendance and overtime totals) show the label first (13px #8B8B8B) and the value 24px medium
    #121212. The ESS attendance/overtime totals keep their status tint, moved onto the Peko pair backgrounds (late /
    half day → #FFF6EA, absent → #FFF1F0, on leave / holidays → #F9F0FB). Accent-coloured values (red "Waiting for
    you", green "Approved") are #121212 now.
25. **Notices** (Overview "Needs your action", timesheet notices, update-requested strips, late notes, the leave
    loss-of-pay card) use the antd Alert pairs: info #E6F4FF / #91CAFF, warning #FFFBE6 / #FFE58F, error #FFF2F0 /
    #FFCCC7, with #121212 body text. Calendar cells, legends and the attendance grid keep their own colours (rule 15).
26. **Legacy Payroll status pills** (Attendance daily log, Employees document requests, profile update list and
    drawer) now render the shared StatusTag: Present success, Late / Half Day warning, Absent error, On Leave leave;
    Pending warning, In Progress info, Completed / Approved success, Rejected error. Their leading dot is gone (the
    shared pill has none).
27. **Employees "Export"** stayed inside its column (it overflowed the content edge by 17px before this run; now the
    button fills its column).
28. **Pages shared with the /employee portal** (ESS Reimbursements, Payslips, Documents, the profile header card) keep
    their own markup, as in the ESS design slices: the scoped `ess.css` moves their cards onto the Peko card (8px,
    #EAEAEA, soft shadow) and their text greys onto #121212 / #8B8B8B, and their antd tables, tags and buttons follow the
    scope. Their pastel summary tiles (value above the label, coloured backgrounds) stay as they are: restyling them
    means changing the portal's own component. Listed under intentional differences.

29. **Payroll dashboard in the scope too** (its index route), so the Quick actions, the chart's year select and the
    header buttons take the theme radius. Legacy pieces that hard-code their own look inside the scope are brought
    onto the rules with scoped CSS only: buttons with a `rounded-*` class → 6px; the platform's `.rounded-select`
    (0.3rem !important) → 6px; antd preset tag colours → the six pairs.
30. **Employees table**: the "● Active" / "In Probation" / "Confirmed" / "Suspended" / "Resigned" and "Live" / "Not
    Live" pills are StatusTags (success, warning, success, warning, error; success, error). The "●" glyph is gone.

Intentional differences from the prototype (it isn't in the Peko palette; the rules and the theme win):
- Prototype red #E30000 and blue links → Peko #FF3A3A and red links; its dark selected segmented item → white
  selected item on #F5F5F5; its 12px panels and 10px banners → 8px cards and Alert-coloured notices; its green
  switches → red; its blue "leave"/"holiday" chips → the purple leave pair.
- The prototype's Payroll service pages have a "‹ Payroll dashboard" button and an inline crumb; the build keeps the
  layout breadcrumb and the red "‹ Back to dashboard" link the rules ask for.
- ESS page headers keep their own breadcrumb ("Overview › Leave") and keep "Apply for leave" / "Request comp off"
  beside the title, as in the prototype (the tab-row rule is for Payroll pages).
- Employees keeps its three actions beside the title (seven tabs leave no room on the tab row).
- Calendars (timesheet three-month calendar, attendance calendar and team grid, leave calendars, comp off calendar)
  keep their colours and legends (rule 15).

Visual changes skipped because they'd need more than a look change:
- ESS Reimbursements, Payslips, Documents and the profile header card are the /employee portal's own components; their
  pastel summary tiles and the inline-coloured "Pending" / "Rejected" reimbursement tags stay as they are (only the
  scoped CSS reaches them). Changing them means changing the portal for everyone.
- The Payroll dashboard's Info cards, chart, Today's Attendance and Activities panels are the existing dashboard (only
  Quick actions is part of the redesign); they get the scope's tokens but keep their markup.
- The ESS Overview "Quick actions" keep the ESS illustrated tiles (rule 13 is the Payroll dashboard's).

VERIFY (Chrome, scripted: `dverify.cjs`, `flows.cjs`, `run3.cjs`, `flow2.cjs` in the session scratchpad):
1. **Page header — pass.** Leave, Timesheet, Attendance, Overtime, Reimbursements, Employees and Payroll settings show
   "Payroll › Services › {service}" (last item rgb(255,58,58)), "‹ Back to dashboard", a 20px / 500 / #404040 title and a
   14px #8B8B8B line, at 1440, 1024 and 375.
2. **Tabs and Segmented — pass.** Main tab rows are antd line Tabs (Attendance, Employees, Payroll settings, ESS
   Attendance & Timesheet, My team); every sub-tab and filter group checked is antd Segmented.
3. **antd + theme values — pass in our screens.** No button, input, select or picker with a radius other than 6px in
   the scope at any width; tables, drawers, modals and switches are antd (switches red). The portal-owned pages are
   the exception noted above.
4. **Status tags — pass in our screens.** Every visible tag in the redesign screens is a StatusTag on one of the six
   pairs (0 off-pair). ESS Reimbursements' "Pending" / "Rejected" are the portal's inline colours (#FFFBEB, #FEF2F2).
5. **Notices — pass.** Every visible Alert is on an antd Alert colour; no solid saturated block wider than 120px
   outside buttons, badges, switches and calendars on any page checked.
6. **Balance cards and tiles — pass.** ESS Leave: 4 per row at 1440 and 1024, 2 at 375, 0 clipped, available 22px / 500,
   rest 13px, text "6.5 / 17 days". Quick actions: 13 tiles, 0 clipped, 8px radius, #EAEAEA border, 18px padding,
   40×40 #FFF7F7 icon square in #EA3639, 6 red count badges.
7. **Side by side — pass with the differences listed above.** Before (1440): `docs/design/screens/before/`; after (1440,
   1024, 375, plus the Apply / comp off modals, the request drawer, the Add leave drawer and the leave type drawer):
   `docs/design/screens/after/`.
8. **No behaviour change — pass.** Edit and resubmit, change request, manager then Admin / HR approval, cancellation
   (whole refused before check-in rules, from-date), withdraw (`flows.cjs` v2–v5); apply for leave (8 → 9 requests);
   HR Add leave (25 → 26 approved leaves); Leave configuration save and restore; Leave types table, delete rules,
   drawer, Show to employees hiding Casual in ESS, comp off calendar, approver options (`run3.cjs`). No console errors
   on any of the 25 screens at three widths. (`flows.cjs` v7 targets the module-grouped notes panel removed two runs
   ago and was not run.)

Checks: type-check clean. ESLint: only the 3 existing errors in `requestStores.ts`. Production build passes. Tests:
5712 passed, 371 failed in 171 files; the failures are the files that already failed before this run, plus 15 files
in PekoCloud, Sales, corporate cards and invoices that time out under the full-suite load and pass when run on their
own (e.g. ItemsTable 4/4, ChequeBooksTable + UploadDocumentsKyb 35/35). No file in those domains, `src/index.css` or
`src/antd.config.tsx` changed in this run. In the redesign's own suites the only failures are the two known ones
("off today" on a Saturday, "Excel round trip").

## Leave settings + comp off calendar + approvers — done

| Step | Commit | Status |
|---|---|---|
| 1 — Leave types: Action column (View · Edit · Delete), drawer sections, unused leave on leaving, Show to employees | Leave: leave types Action column, drawer sections, … | done |
| 2 — ESS comp off: month calendar of weekly offs and holidays | Leave: comp off day picker is a calendar of weekly offs and holidays | done |
| 3 — Approvers: Reporting manager · Admin / HR · a person at both levels; manager at level 2 | Approvers: Reporting manager, Admin / HR or a person … | done |
| 4 — Late check-in deduction only under Attendance, timesheet & overtime | (previous run, `2fe83d7`; checked again) | done |

Decisions:
1. **Unused leave on leaving** is a new field, `onLeaving: 'ENCASH' | 'BRING_FORWARD'`, which replaces `encashOnExit`.
   - Stored policies map on read (`migrateLeavePolicy` → `onLeavingOf`): true → ENCASH, false → BRING_FORWARD. The store
     also accepts the old flag on write.
   - Only the choice is stored. The settlement adds a display-only `bringForward` amount, and the ESS leaving banner says
     "Casual: 2 days can be used to bring your last working day forward." No F&F or payroll change.
   - The defaults keep Annual on encash; the others bring the last working day forward (the old `false`).
2. **Show to employees** is the existing `active` flag, now edited in the drawer and saved with the type (no confirmation:
   it doesn't change balances). The table's Deactivate/Activate button is gone. The `PATCH …/active` endpoint stays for
   older callers.
3. **Delete** (renamed from Remove) is disabled for used types. The tooltip sits on a wrapper, because a disabled button
   doesn't fire hover events. Delete still asks for confirmation.
4. **Drawer order** follows the notes: Carry forward is under "Other". In the prototype it sits under "When an employee
   joins", but the notes are the spec.
5. **Comp off calendar** gets its data from a new endpoint, `GET leave/comp-off/calendar?month=` (`compOffCalendar`). The rule
   is the pure `compOffDayAvailable`.
   - Pickable: a weekly off or public holiday on the employee's own schedule, not in the future, inside the expiry window
     and not already claimed. Resubmitting keeps the request's own day open (`exclude`).
   - Hours worked are still checked after picking, so an off day with no work can be picked and is refused with the
     reason. This matches the prototype, which disables only working, future, expired and claimed days.
   - Next month is disabled after the current one. The calendar opens on the request's day when resubmitting, otherwise
     on this month.
6. **Admin / HR** is one choice, stored as `HR`.
   - Older team values (Payroll, HR, Admin, Finance) keep routing to the Payroll queues exactly as before. Every screen
     shows them as "Admin / HR", and the settings form saves them as `HR` on the next save.
   - The team names in trails, statuses, the activity log and Home ("HR team", "Payroll team"…) now read "Admin / HR".
     Profile updates still say "HR team" in the trail steps.
7. **Reporting manager at level 2** resolves to the employee's manager when the request is submitted (approvers are fixed
   on each request).
   - If level 1 is the same person, level 2 is dropped and level 1 is final (`samePerson`). This also applies to a
     specific person who is the manager, and to timesheet periods.
   - Level 1 is resolved at submit too, so "the person who approved level 1" is the resolved level-1 person. A team at
     level 1 is never the same as a manager at level 2.
8. **Help text**: the approvals card is shared by Attendance, timesheet & overtime, Leave → Approvals and
   Reimbursements, so one change updates all three tables.

Checks (Chrome, scripted, 1440 and 375):
- **Leave types table:** the headers end in "Action". There's no Deactivate/Activate button. Delete is disabled for
  Annual, Casual and Sick (used) and enabled for Maternity and Paternity. The tooltip text matches the notes.
- **Drawer:** it shows the three section headings. Casual is set to "Use it to bring the last working day forward"
  (mapped from `false`). Turning "Show to employees" off and saving marks Casual Inactive.
- **ESS after deactivating Casual:** the leave cards and the Apply leave types no longer include Casual.
- **Comp off calendar (November 2026):**
  - Working days available: 0. Available: weekly offs and holidays only (no future days). Dots on worked days 8 and 14.
  - Legend: Public holiday · Weekly off · You worked · Not available. Next month is disabled.
  - Picking 8 Nov shows "0.5 day of comp off · Deepavali, 4h 45m worked".
- **Approvers:** Level 1 offers Reporting manager · Admin / HR (approved in Payroll) · a specific person; Level 2 offers
  the same plus None. The leave Level 2 that was stored as `HR` shows as Admin / HR.
- **Routing** (store tests): manager → Admin / HR; Admin / HR → manager at level 2; manager at both levels approves once;
  older team values still route; the leaving banner wording.
- **Leave → Configuration:** only Leave year, Leave requests, Sandwich rule and Comp off; no late check-in panel. No page
  overflow at 375 and no console errors.
- **Pre-existing failures:** "payroll admin: leave › off today" fails on the previous commit too, because today
  (21 Nov 2026) is a Saturday. The known "Excel round trip" test also still fails.
- **Type-check:** clean. **Lint:** only the 3 existing errors in `requestStores.ts`. **Build:** passes. **Tests:** no new
  failures. The only failures in prototype code are the two above; the rest are the unrelated domain files that already
  failed.

## Small update: Leave configuration (commit "Settings: move late check-in deduction to attendance") — done

- **Leave → Configuration** now has four panels: Leave year (with the roll-forward note), Leave requests, Sandwich rule, Comp off.
  The "Probation and pro-rating" panel is gone. Its rules are unchanged: they stay in the leave engine (status-based probation,
  15th-of-the-month pro-rating). The "Late check-in deduction" panel is gone from this page too.
- **Attendance, timesheet & overtime**: the "Late check-in deduction" panel sits below Overtime, with the same fields (days per late
  mark, 0 = off; deduct from {type} then {type} then loss of pay). It's shown only when check-in is tracked
  (Attendance only, Attendance + timesheet), using `hasCheckIn`.
- Decisions:
  1. **One save.** The panel is part of the page's form and is saved with **Save settings** (PUT settings). The days go
     in `lateDeductionDays`; the order goes in a *partial* `leavePolicy: { lateOrder }`. The store already merged a partial
     policy, so the rest of the policy is kept. `updateAtsSettings` now types its body that way. No new endpoint.
     `PUT leave-settings/config` still accepts the two fields, but the UI no longer sends them.
  2. **Hidden values are kept.** In Timesheet only or Neither mode the panel is hidden. Saving keeps the stored values,
     and deductions don't run anyway, because they need check-in.
  3. **Existing values are kept.** Nothing is migrated: both pages read and write the same stored settings.
  4. **The copy says "a correction is approved"**, matching the updated prototype (before, it said "a dispute is approved").
- Checks:
  - Leave → Configuration lists exactly the four cards.
  - The new card appears under Overtime, hides in Timesheet only mode and comes back afterwards.
  - Changing the settings to 1 day with Casual first and saving holds after a reload. Sneha's late check-ins then show
    −1 under Casual (before the change: −0.5 under Annual).
  - The Developer notes panel shows the new content for `pay:settings:leave:config` (the panel list plus "Not settings")
    and for `pay:settings:ato` (the "Late check-in deduction (attendance setting)" section).
  - A new store test covers the save path.
  - Type-check: clean. Lint: only the 3 existing errors in `requestStores.ts`. Build: passes. Tests: in prototype code
    only the known "Excel round trip" test fails. The other failing files are unrelated (WhatsApp, PekoCloud, eSign,
    user management) and failed before this change too.

| Step | Commit | Status |
|---|---|---|
| 1 — Remove the module-grouped panel; page-key context + `useDevPage`; new docked panel on `dev-notes.json` | Dev notes: page-by-page panel replaces the module notes | done |
| 2 — Every mapped screen and sub-tab reports its key | Dev notes: pages report their notes key | done |
| 3 — README flag section, `docs/dev-notes/README.md` (how to update, key list) | Dev notes: how to update the notes and the key list | done |
| 4 — VERIFY 1–5 at 1440 / 1024 / 375, type-check, lint, tests, production build, one push | Dev notes: verification log | done |

## Done
- Step 1: removed `src/prototype/devNotes/devNotes.tsx` (markdown loader, module map, renderer), its tests and
  `docs/dev-notes/developer-notes.md`; rewrote `src/prototype/devNotes/DevNotesPanel.tsx`; added `devPage.tsx`
  (`DevPageProvider`, `useDevPage`, `useCurrentDevPage`) and `notes.ts` (`DEV_NOTES`, `notesFor` with the fallback);
  `DevPageProvider` wraps the router and demo controls in `App.tsx`. Tests: `src/prototype/devNotes/__tests__/devNotes.test.tsx`.
- Step 2: `useDevPage` in the ESS Overview, Leave, Attendance & Timesheet, My team (+ member page), Reimbursements,
  Profile; Payroll dashboard, Leave, Timesheet, Attendance, Overtime / Reimbursements, Employees; Payroll settings and
  its Leave Policies sub-tabs.
- Step 3: `README.md`, `docs/dev-notes/README.md`; references to the old notes file now point at `dev-notes.json`.

- Polish (`7e6148c`): copy feedback on the Copy button instead of a toast; a new page starts scrolled to the top.

## VERIFY (Chrome via a scripted browser at 1440 / 1024 / 375; the panel stayed open while clicking on desktop and
tablet; on phones, where it is full width, it was closed, the page changed, and it was reopened)
1. Pass — 33 steps: ESS Overview → Leave (sidebar) → My requests → Public holidays → Overview → a type's details →
   Attendance → Timesheet → My team (Approvals, Today → falls back to My team, Leave calendar) → Reimbursements →
   Profile → Payslips (empty state) → Payroll dashboard → Leave tile → Leaves → Requests → Balances → Overview →
   Timesheet / Attendance / Overtime / Reimbursements / Employees → Payroll settings → Leave Policies → all four
   sub-tabs → Attendance, timesheet & overtime → Reimbursements. The title changed on every step with the panel
   open; the clicks on the page (sidebar, sub-tabs, cards, the dashboard tile, settings tabs) worked with it open.
   No overlay; 460px on desktop and tablet, full width on phones; no horizontal overflow.
2. Pass — Copy prompt copies the page's prompt (button shows "Copied"); How to use these notes shows the intro,
   Reading the prototype, Build order, Shared rules and the kickoff prompt; its Copy works; "‹ Back to this page’s
   notes" returns to the page.
3. Pass — `ess:team:today`, `pay:timesheet:requests`, `pay:attendance:1`, `pay:overtime:overview` show their parent's
   notes; Payslips and the other Payroll settings tabs show "No notes for this page yet".
4. Pass — production build (no flag): no panel code or notes text in `dist`; served, it shows the demo pill without
   the Developer notes button. With `VITE_PROTOTYPE=true`: the notes are one lazy chunk.
5. Pass — no console errors from the new code (remaining messages are pre-existing: the sidebar's `stringLabel` prop,
   external font lookups, antd deprecations on older pages). Type-check clean; ESLint 3 errors, all pre-existing in
   `src/prototype/mocks/store/requestStores.ts`; tests 5713 passed, 359 failed in 161 files, all in unrelated files
   that also fail on `9b91229` (e.g. `src/domains/employee/__tests__/…`, checked) plus the known "timesheet v6: Excel
   round trip"; production build passes.

## Next
- Nothing left in scope.

## Decisions
1. **One panel.** The module-grouped panel, its markdown loader, renderer, tests and `developer-notes.md` are removed.
   `docs/api/leave.md` and code comments that cited `developer-notes.md` now cite `dev-notes.json`.
2. **Flag** reused from the last run: `VITE_PROTOTYPE` (on in `yarn dev`, on in the Vercel prototype via `vercel.json`,
   off in production builds, which drop the panel chunk and the JSON entirely). `useDevPage` / `DevPageProvider` are
   in every build: they only hold a key string and nothing reads it without the panel.
3. **Button** stays inside the existing bottom-right demo pill (as "next to the demo controls"); open, it reads "Close
   notes" and is the primary (red) button. The panel is portalled to `<body>` with `z-index` 999: under the demo pill
   (1000) and antd modals / drawers, over the page; no overlay. 460px wide, full width under 640px. Its body has 90px
   of bottom padding so the demo pill never hides the last lines.
4. **Clearing the key.** The prototype keeps the last key when a page has none; here leaving a page clears its key
   (only if it's still the current one), so a page without notes shows the empty state instead of the previous page's
   notes.
5. **Closest keys for screens the notes don't name**: Payroll Timesheet / Overtime / Reimbursements sub-tabs report
   `pay:<service>:<view>`, Payroll Attendance tabs `pay:attendance:<tab>` (all fall back to the service);
   My team's other tabs `ess:team:<tab>` and a member's timesheet page `ess:team:member` (fall back to `ess:team`);
   Payroll settings tabs other than Leave / Attendance-timesheet-overtime / Reimbursements report `pay:settings:other`
   (no notes: empty state). ESS Payslips and Documents and the Payroll Salary pages report nothing (empty state).
6. **Payroll → Leave → Balances** reports `pay:leave:details` (the notes' name for it).
7. **Leave calendar** tab id is `leave-calendar` in code; it reports `ess:team:leavecal`.
8. **Copy feedback** is on the Copy button itself ("Copied" for 2 s), not a toast: on phones a toast covered the panel's Back button. A new page or the guide starts scrolled to the top. The page view's empty state shows "No
   notes for this page yet" with the "How to use these notes" button and a one-line hint, as in the prototype.
9. **Source prototype.** Your updated `docs/prototypes/leave-prototype.html` (the panel's reference) is committed with
   the verification log, as the source for this run.
