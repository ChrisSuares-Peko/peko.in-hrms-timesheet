# Developer notes

A prototype-only panel (bottom right: **Developer notes**) that always shows the notes for the page the developer is
on and switches by itself as they move between pages and sub-tabs. It docks on the right without covering the page,
so it can stay open while clicking around. Each page's notes say what the page is, everything on it, its rules and
data, and end with **Build it with Claude**: a ready prompt for Claude Code. **How to use these notes** shows the
general guide, the shared rules and the kickoff prompt.

It is shown only in the prototype build (`VITE_PROTOTYPE`, see the root `README.md`), never in production.

## How it works

-   Notes: `dev-notes.json`, imported at build time by `src/prototype/devNotes/notes.ts`.
-   Every page or sub-tab calls `useDevPage('<key>')` (`src/prototype/devNotes/devPage.tsx`). Only the innermost
    component of a page sets a key; a parent passes `null` where a child sets it. Leaving a page clears its key.
-   Lookup falls back by trimming the last `:` segment: `ess:team:today` has no entry, so it shows `ess:team`.
    A key with no entry at any level shows "No notes for this page yet".
-   Panel: `src/prototype/devNotes/DevNotesPanel.tsx`, mounted in the demo controls (`src/prototype/DataModeToggle.tsx`).

## How to update the notes

-   Edit `dev-notes.json` and keep its shape:
    `{ pages: { "<key>": { title, module, what, sections: [[heading, [items]]], prompt } }, guide: { intro, read, order, shared: [[heading, [items]]], kickoff } }`.
-   One entry per page key. A sub-tab without its own entry uses its parent's (see the fallback above).
-   Update the notes in the same commit as any behaviour change they describe, so notes and code never disagree.
-   A new page or sub-tab needs both a `useDevPage('<key>')` call in its component and a notes entry (or a parent
    entry it can fall back to). `src/prototype/devNotes/__tests__/devNotes.test.tsx` lists the keys the screens use
    and checks each one finds notes: add new keys there too.

## Keys and screens

| Key | Screen | Where it's set |
|---|---|---|
| `ess:home` | ESS Overview (employee and manager) | `overview/EssOverviewPage.tsx` |
| `ess:leave:overview` | ESS → Leaves → Overview | `leave/EssLeavePage.tsx` |
| `ess:leave:type` | ESS → Leaves → a leave type's details page | `leave/EssLeavePage.tsx` |
| `ess:leave:requests` | ESS → Leaves → My requests | `leave/EssLeavePage.tsx` |
| `ess:leave:holidays` | ESS → Leaves → Public holidays | `leave/EssLeavePage.tsx` |
| `ess:time:attendance` · `ess:time:timesheet` · `ess:time:overtime` | ESS → Attendance & Timesheet tabs | `ess/AtsSectionPage.tsx` |
| `ess:team:approvals` | ESS - Manager → My team → Approvals | `team/MyTeamPage.tsx` |
| `ess:team:leavecal` | My team → Leave calendar | `team/MyTeamPage.tsx` |
| `ess:team:today` · `ess:team:attendance` · `ess:team:timesheets` · `ess:team:reimbursements` | Other My team tabs (fall back to `ess:team`) | `team/MyTeamPage.tsx` |
| `ess:team:member` | My team → a member's timesheets (falls back to `ess:team`) | `team/MemberTimesheetPage.tsx` |
| `ess:reimbursement` | ESS → Reimbursements | `employee/pages/Reimbursements.tsx` |
| `ess:profile` | ESS → My profile | `employee/pages/Profile.tsx` |
| `pay:dashboard` | Payroll dashboard | `dashboard/Payroll/pages/Dash.tsx` |
| `pay:leave:overview` · `pay:leave:leaves` · `pay:leave:requests` · `pay:leave:details` | Payroll → Leave → Overview · Leaves · Requests · Balances | `payroll/admin/AdminLeavePage.tsx` |
| `pay:timesheet:<view>` | Payroll → Timesheet (Overview / Details / Requests → `pay:timesheet`) | `payroll/admin/AdminTimesheetPage.tsx` |
| `pay:attendance:<tab>` | Payroll → Attendance (its tabs → `pay:attendance`) | `dashboard/Payroll/pages/Timesheet.tsx` |
| `pay:overtime:<view>` · `pay:reimbursement:<view>` | Payroll → Overtime / Reimbursements (→ the service key) | `payroll/admin/AdminServicePage.tsx` |
| `pay:employees` | Payroll → Employees | `dashboard/Payroll/pages/Employees.tsx` |
| `pay:settings:leave:types` · `…:holidays` · `…:config` · `…:approvals` | Payroll settings → Leave Policies sub-tabs | `leave/settings/LeavePoliciesTab.tsx` |
| `pay:settings:ato` | Payroll settings → Attendance, timesheet & overtime | `dashboard/Payroll/pages/OrganizationSettings.tsx` |
| `pay:settings:reimb` | Payroll settings → Reimbursements | `dashboard/Payroll/pages/OrganizationSettings.tsx` |
| `pay:settings:other` | Other Payroll settings tabs (no notes: empty state) | `dashboard/Payroll/pages/OrganizationSettings.tsx` |

Pages that don't call `useDevPage` (e.g. ESS Payslips and Documents, Payroll Salary) show "No notes for this page
yet".
