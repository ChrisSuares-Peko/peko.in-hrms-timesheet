# ESS design language

PROTOTYPE-SETUP (ESS design, Slice 1). One visual system for every ESS page (ESS - Employee and ESS - Manager),
taken from two screens that already look like Peko:

- the ESS dashboard: `src/domains/employee/pages/Dashboard.tsx` and `src/domains/employee/components/dashboard/*`
  (ProfileCard, AttendanceTable, ServiceShortcutCard, AnnouncementsPanel);
- the Payroll dashboard: `src/domains/dashboard/Payroll/pages/Dash.tsx` and `components/Dashboard/*`
  (DashboardHeader, InfoCard, NavigationCards, Chart).

Component library: antd v5.

## Where the tokens live

| Piece | File | What it holds |
|---|---|---|
| Tokens | `src/components/ess/essTokens.ts` | colours, radii, shadow, spacing, and the Tailwind class strings for hand-built blocks (card, inner block, panel, type scale) |
| antd theme | `src/components/ess/EssThemeProvider.tsx` | a `ConfigProvider` with the ESS token and component overrides, mounted once on `EssLayout` |
| Scoped CSS | `src/components/ess/ess.css` | `.ess-scope` rules that map the shared portal pages' own Tailwind tokens onto the ESS type scale |
| Building blocks | `src/components/ess/EssUi.tsx` | `EssPageHeader`, `EssSectionHeading`, `EssCard`, `EssStatusBlock` |

**Why a ConfigProvider on the ESS layout.** The codebase themes antd through `ConfigProvider`: one global theme in
`src/antd.config.tsx`, plus local `ConfigProvider`s where a screen needs its own look (e.g. `InvoiceCard`,
`VpsStep2Config`). Nesting one on `EssLayout` follows that pattern, reaches every ESS page on both tabs (including
their modals and drawers, which inherit the context through portals), and leaves Payroll and the real `/employee`
portal untouched — important because Leaves, Reimbursements, Payslips, Documents and Profile are shared with that
portal. Those shared pages are therefore restyled through tokens and the scoped `.ess-scope` CSS, never by editing
their markup for everyone.

## Tokens

### Colour

| Token | Value | Source | Use |
|---|---|---|---|
| Text | `#080808` | ProfileCard values | values, titles (`colorText`) |
| Text secondary | `#616161` | ProfileCard designation | sub-lines, role (`colorTextSecondary`) |
| Text tertiary | `#9e9e9e` | ProfileCard labels ("Employee ID") | labels, captions, group labels |
| Border | `#e6e6e6` | ProfileCard inner block | inner blocks, inputs (`colorBorder`) |
| Border soft | `#eff1f4` | AttendanceTable container | tables, dividers (`colorBorderSecondary`) |
| Tile | `#F9F6F5` | ServiceShortcutCard, Payroll NavigationCards | quick-access tiles |
| Panel | `#f8f8f8` | AnnouncementsPanel | grey panels (notifications) |
| Peko red | `#FF4F4F` (`#FF3A3A` global) | ProfileCard Check In, "See all" | primary buttons, links, active tab (`colorPrimary`) |
| Status idle / on time / late / done | `#F7F7F7` / `#eaf9f0` + `#43B75D` / `#FFFAEB` + `#B78912` / `#f5f6f7` | ProfileCard status blocks | attendance status blocks |

### Radius, shadow, spacing

| Token | Value | Source |
|---|---|---|
| Card (outer) | 32px | ProfileCard `rounded-[32px]`, AnnouncementsPanel |
| Inner block | 26px | ProfileCard inner `rounded-[26px]` |
| Tile | 24px (`rounded-3xl`) | ServiceShortcutCard |
| Status block / list item | 16px (`rounded-2xl`) | ProfileCard status, announcement items |
| Table container | 18px | AttendanceTable |
| Controls (buttons, inputs) | 8px | ProfileCard buttons (`rounded-md`/`rounded-lg`) |
| Shadow | `0 1.66px 8.28px rgba(0,0,0,.06)` | ProfileCard |
| Spacing scale | 4 · 8 · 12 · 16 · 24 · 32 | gaps 16–24 between cards, 24 inside cards, 20 inside inner blocks |

### Type scale

| Role | Style | Source |
|---|---|---|
| Page title | 20px, medium, `#080808` | Payroll DashboardHeader "HR Dashboard" |
| Section heading | 18px, medium, `#171717`; link on the right 14px medium red | AnnouncementsPanel "Announcements" / "See all" |
| Card title | 16px, semibold, `#141414` | AnnouncementsPanel item title |
| Label | 12px, `#9e9e9e` | ProfileCard "Employee ID" |
| Value | 16px, medium, `#080808` | ProfileCard values |
| Body / muted | 14px `#080808` / `#616161` | |
| Caption | 12px `#9e9e9e` | ProfileCard check-in hint |
| Group label | 11px caps, `#9e9e9e` | notifications groups |

## Patterns and the antd components to use

| Pattern | How | antd |
|---|---|---|
| Page header | title + subtitle on the left, actions on the right | `EssPageHeader`; `Button` (`type="primary"` for the main action) |
| Section heading + action link | title left, link right | `EssSectionHeading` (`Typography`-sized `h3` + router `Link`) |
| Card | white, 32px, shadow, 24px padding | `EssCard` / `ESS_CARD`; antd `Card` gets the same radius and shadow via tokens |
| Inner bordered block | 26px radius, `#e6e6e6` border, 20px padding | `ESS_INNER` |
| Status block | grey rounded block, pin icon, bold status, line underneath; green/amber tint for on time/late | `EssStatusBlock` (`EnvironmentFilled`) |
| Tabs | red ink bar and active label, 15px labels | `Tabs` (token: `inkBarColor`, `itemSelectedColor`) |
| Segmented | grey track, white selected item | `Segmented` (token: `trackBg`, `itemSelectedColor`) |
| Buttons | primary red, default bordered, 8px radius, medium weight, no shadow; full-width 44px for the main action | `Button` (`block`, `className={ESS_BUTTON}`) |
| Forms and inputs | 8px radius, red focus border | `Form`, `Input`, `InputNumber`, `Select`, `DatePicker`/`TimePicker` |
| Modals and drawers | 24px modal radius, 18px title | `Modal`, `Drawer` |
| Tables | `#F9FAFB` header, grey medium header text, 14px row padding, soft border | `Table` (token: `headerBg`, `headerColor`, `cellPaddingBlock`) |
| Tags / status pills | fully rounded, borderless | `Tag` (`bordered={false}`; token `borderRadiusSM: 999`) |
| Calendars | tinted day cells, red-soft active | custom grids keep their colours; antd `Calendar` token `itemActiveBg` |
| Empty states | grey description | `Empty` (`image={Empty.PRESENTED_IMAGE_SIMPLE}`) |
| Quick-access tiles | 96×96 `#F9F6F5` tile, illustrated icon, title under it | `ServiceShortcutCard` |
| Announcements / notifications panel | grey panel, white rounded items, caps group labels | `ESS_PANEL`, `ESS_PANEL_ITEM`, `List` |

## Page checklist (Slices 2–5)

| # | Page / component | Files | Slice |
|---|---|---|---|
| 1 | Overview (ESS - Employee home) | `attendanceTimesheet/overview/*` | 2 |
| 2 | Attendance & Timesheet section header and tabs | `ess/AtsSectionPage.tsx` | 3 |
| 3 | Attendance tab: today panel, calendar, day drawer, totals, corrections list, correction modal | `ess/AttendanceTab.tsx`, `ess/TodayPunch.tsx`, `ess/AttendanceCalendar.tsx`, `ess/DayDetailDrawer.tsx`, `ess/CorrectionsList.tsx`, `ess/ui.tsx`, `components/CorrectionModal.tsx` | 3 |
| 4 | Timesheet tab: 3-month calendar, right-hand cards, view bar, day rows, bars and meter, entries panel, entry form, change request and history | `timesheet/*` | 3 |
| 5 | Overtime tab: stats, suggestions, requests, overtime modal | `ess/OvertimeTab.tsx`, `components/OvertimeRequestModal.tsx` | 3 |
| 6 | Leaves | `employee/pages/Leaves.tsx` + `components/sections/*Leave*` | 4 |
| 7 | Reimbursements | `employee/pages/Reimbursements.tsx` + `components/sections/ReimbursementClaimsTab.tsx`, `SubmitClaimModal.tsx` | 4 |
| 8 | Payslips | `employee/pages/Payslips.tsx`, `components/PayslipDetailModal.tsx` | 4 |
| 9 | Documents | `employee/pages/Documents.tsx` + `components/sections/*Document*` | 4 |
| 10 | Profile (ESS - Employee editor, header card; ESS - Manager read-only view) | `employee/pages/Profile.tsx`, `attendanceTimesheet/profile/EssProfileEditor.tsx`, `components/profile/*` | 4 |
| 11 | ESS - Manager dashboard | `employee/pages/Dashboard.tsx` + `components/dashboard/*`, `team/MyTeamCard.tsx` | 5 |
| 12 | My team: Team today, Team timesheets, Timesheet approvals, review drawer, member viewer, request queues | `team/*`, `timesheet/manager/*`, `components/RequestQueue.tsx`, `components/TrailSteps.tsx` | 5 |
| 13 | Shared chrome: ESS sidebar group and sub-items, breadcrumb, page headers, Dummy/Empty + Demo control | `nav-section/vertical/*`, `prototype/persona/essBreadcrumb.tsx`, `prototype/DataModeToggle.tsx` | 5 |
