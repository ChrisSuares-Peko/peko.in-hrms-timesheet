# Peko design language — ESS & Payroll redesign screens

PROTOTYPE-SETUP (Design update). One look for every screen built or changed in the redesign: ESS (Overview,
Attendance & Timesheet, Leave, My team, Reimbursements, My profile), the Payroll dashboard, the Payroll service pages
(Timesheet, Attendance, Leave, Overtime, Reimbursements, Employees), Payroll settings, and their drawers and modals.
It replaces the values in `ess-design-language.md` (32px cards, #FF4F4F red); the page checklist there still lists
which files make up each ESS page.

Source of truth for values is the platform's own Peko theme, not the prototype: `src/antd.config.tsx` (primary
#FF3A3A, text #121212, 36px controls, control radius 6, Roboto), the Peko white-label values (hover #FF6963, active
#E02B2B, surface #FFF7F6, border #FFE4E4) and `tailwind.config.js`. `docs/prototypes/leave-prototype.html` gives the
layout (what sits where).

## Where it lives

| Piece | File | What it holds |
|---|---|---|
| Tokens | `src/components/peko/pekoTokens.ts` | colours, card shadow, radii, the six status pairs, class strings for hand-built cards and stats |
| Theme scope | `src/components/peko/PekoScope.tsx` | one `ConfigProvider` nested in the global theme (component tokens + class names for modal, drawer, card, tag, alert, segmented, tabs, switch) |
| Scoped CSS | `src/components/peko/peko.css` | what tokens can't say: card border/shadow, modal and drawer dividers, pills, alert titles, red switches, approve button |
| Status tag | `src/components/peko/StatusTag.tsx` | the one status pill (`tone`, or an antd preset `color` mapped onto the six pairs) |
| Page header | `src/components/peko/PageHeader.tsx` | `PekoBackLink`, `PekoPageHeader`, `PekoTabRow`, `PekoTabLabel` |
| ESS names | `src/components/ess/essTokens.ts`, `EssThemeProvider.tsx`, `ess.css` | the ESS aliases of the same values; the ESS layout renders `PekoScope` |

`PekoScope` wraps the ESS layout (`EssLayout`) and, in `src/routes/sections/payroll.tsx`, the Payroll dashboard, every
service page and Payroll settings. Modals and drawers inherit it through the ConfigProvider context.

## Rules

| # | Element | Spec | How |
|---|---|---|---|
| 1 | Payroll page header | breadcrumb "Payroll › Services › {service}" (grey, last item #FF3A3A); red "‹ Back to dashboard"; title 20px medium #404040; one line 14px #8B8B8B; page actions right-aligned on the sub-tab row | layout breadcrumb (`payrollServiceCrumbs`), `PayrollServiceBar` → `PekoBackLink`, `ServiceHeader` → `PekoPageHeader`, `AdminSubTabs` / `PekoTabRow` (`actions`) |
| 2 | Main tabs | antd `Tabs` (line); labels #404040, active #FF3A3A medium with a 2px ink bar; 1px #F0F0F0 bottom border; counts as small red pills | theme `Tabs` tokens, `peko-tabs`, `PekoTabLabel` (antd `Badge`) |
| 3 | Sub-tabs, filters | antd `Segmented`; track #F5F5F5; selected white, medium, soft shadow | theme `Segmented` tokens, `peko-segmented` |
| 4 | Cards | white, 1px #EAEAEA, 8px, shadow `0 1px 12px 1px rgba(122,122,122,.06)`, 20–24px padding; title 16px medium #121212; helper 13px #8B8B8B | antd `Card` (tokens + `peko-card`), hand-built: `PEKO_CARD` |
| 5 | Stat cards | label 13px #8B8B8B, value 24px medium #121212 | `CountTile` (Payroll and My team), `PEKO_STAT_LABEL` / `PEKO_STAT_VALUE` |
| 6 | Buttons | antd defaults: 36px, radius 6; primary red filled; default outlined (hover red); text for low emphasis; link red; 28px small in tables and rows; Approve in request rows outlined green (#12B76A, hover #ECFDF3) | theme tokens, `peko-approve` |
| 7 | Inputs | antd, 36px, radius 6, red focus; labels 14px regular #121212; helper 12px grey | theme tokens |
| 8 | Tables | antd `Table`; header #FAFAFA, 14px medium #121212; 14–16px cell padding (12px sides in middle-size tables); #F0F0F0 lines; hover #FAFAFA; pointer on clickable rows | theme `Table` tokens |
| 9 | Status tags | pills, no border, 12px medium; success #ECFDF3/#027A48, warning #FFF6EA/#D48806, error #FFF1F0/#FF4D4F, info #E6F4FF/#0958D9, leave #F9F0FB/#861E99, neutral #F5F5F5/#595959 | `StatusTag` |
| 10 | Notices | antd `Alert` colours (info #E6F4FF/#91CAFF, warning #FFFBE6/#FFE58F, error #FFF2F0/#FFCCC7); body #121212, title in the accent colour | antd `Alert` + `peko-alert`; hand-built notice blocks use the same pairs |
| 11 | Drawers, modals | 16px semibold title; #F0F0F0 dividers under the header and above the footer; footer right-aligned, primary last; 24px sides | `peko-modal-*`, `peko-drawer-*` |
| 12 | Switches | antd `Switch`, #FF3A3A when on | `peko-switch` (beats the platform's green `index.css` rule inside the scope) |
| 13 | Quick actions | card (1px #EAEAEA, 8px, 18px padding); 40px #FFF7F7 icon square, icon #EA3639; name medium; one grey line; red count top right; hover #FFE4E4 border + stronger shadow | `NavigationCards` |
| 14 | Leave balance cards | name 13px grey; available 22px medium, "/ total days" 13px grey; "View details ›" red; 4 per row desktop, 2 on phones | `TypeCard` |
| 15 | Calendars | keep their colours and legends; 4–6px day cells; selected / outlined days red | unchanged colour maps |
| 16 | Spacing | 24px between sections, 16px between cards in a row, content up to 1320px | `.peko-scope { max-width: 1320px }`, `gap-6` / `gap-4` |
