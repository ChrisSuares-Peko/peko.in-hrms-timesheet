// PROTOTYPE-SETUP (Overview, Slice 3): ESS - Employee expands in the sidebar into its pages (prototype
// "subnav"): Overview, Attendance & Timesheet (named per mode), Leaves, Reimbursements, Payslips, Documents and
// My profile. Clicking "ESS - Employee" opens the Overview; the group is open whenever an ESS - Employee page is.
// ESS - Manager stays a flat item. Used by the desktop sidebar and the mobile drawer.
import './essNav.css';
import type { AtsMode } from '@src/domains/attendanceTimesheet/types';
import { hasTracking, titleFor } from '@src/prototype/rules/attendance';
import { paths } from '@src/routes/paths';

/** Menu key of the ESS - Employee group (its own route is the Overview child). */
export const ESS_EMPLOYEE_GROUP = 'ess-employee-group';

const base = () => paths.essEmployee.index;

export const isEssEmployeePath = (pathname: string) => pathname === base() || pathname.startsWith(`${base()}/`);

export const essEmployeeSubItems = (atsMode: AtsMode) => [
    { key: base(), text: 'Overview' },
    // PROTOTYPE-SETUP (Overview v4, Slice 5): no Attendance & Timesheet section in 'none' mode.
    ...(hasTracking(atsMode) ? [{ key: `${base()}/attendance-timesheet`, text: titleFor(atsMode) }] : []),
    { key: `${base()}/leaves`, text: 'Leaves' },
    { key: `${base()}/reimbursements`, text: 'Reimbursements' },
    { key: `${base()}/payslips`, text: 'Payslips' },
    { key: `${base()}/documents`, text: 'Documents' },
    { key: `${base()}/profile`, text: 'My profile' },
];

type MenuLike = { key: string; children?: MenuLike[] };

/** The selected menu key: the longest key (sub-items included) the path is on, else the first path segment. */
export const activeNavKey = (items: MenuLike[], pathname: string) =>
    items
        .flatMap(i => [i, ...(i.children ?? [])])
        .filter(i => i.key && (pathname === i.key || pathname.startsWith(`${i.key}/`)))
        .sort((a, b) => b.key.length - a.key.length)[0]?.key ?? `/${pathname.split('/')[1]}`;

/** Open groups: ESS - Employee while one of its pages is open. */
export const navOpenKeys = (pathname: string) => (isEssEmployeePath(pathname) ? [ESS_EMPLOYEE_GROUP] : []);

/** Clicking the ESS - Employee title opens the Overview. */
export const withGroupTitleClick = <T extends MenuLike>(items: T[], go: (to: string) => void) =>
    items.map(i => (i.key === ESS_EMPLOYEE_GROUP ? { ...i, onTitleClick: () => go(base()) } : i));
