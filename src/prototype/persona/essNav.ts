// PROTOTYPE-SETUP (Overview, Slice 3): ESS - Employee expands in the sidebar into its pages (prototype
// "subnav"): Overview, Attendance & Timesheet (named per mode), Leaves, Reimbursements, Payslips, Documents and
// My profile. Clicking "ESS - Employee" opens the Overview; the group is open whenever an ESS - Employee page is.
// PROTOTYPE-SETUP (My team, Slice 5): a manager uses exactly the same ESS as everyone, so ESS - Manager (the demo's
// manager persona) expands into the same pages, plus "My team" — shown only to someone with direct reports, with a
// badge of what's waiting for them. Used by the desktop sidebar and the mobile drawer.
import './essNav.css';
import type { AtsMode } from '@src/domains/attendanceTimesheet/types';
import { hasTracking, titleFor } from '@src/prototype/rules/attendance';
import { paths } from '@src/routes/paths';

/** Menu keys of the ESS groups (each group's own route is its Overview child). */
export const ESS_EMPLOYEE_GROUP = 'ess-employee-group';
export const ESS_MANAGER_GROUP = 'ess-manager-group';

const GROUPS = [
    { key: ESS_EMPLOYEE_GROUP, base: () => paths.essEmployee.index },
    { key: ESS_MANAGER_GROUP, base: () => paths.essManager.index },
];

const base = () => paths.essEmployee.index;

const onBase = (pathname: string, b: string) => pathname === b || pathname.startsWith(`${b}/`);

export const isEssEmployeePath = (pathname: string) => onBase(pathname, base());

export interface EssSubItem {
    key: string;
    text: string;
    /** My team: what's waiting for the manager. */
    badge?: number;
}

/**
 * The ESS pages under a persona's base. `myTeam` adds "My team" (only for someone with direct reports), with the count
 * of items waiting for them.
 */
export const essSubItems = (atsMode: AtsMode, root: string, myTeam?: { waiting: number } | null): EssSubItem[] => [
    { key: root, text: 'Overview' },
    // PROTOTYPE-SETUP (Overview v4, Slice 5): no Attendance & Timesheet section in 'none' mode.
    ...(hasTracking(atsMode) ? [{ key: `${root}/attendance-timesheet`, text: titleFor(atsMode) }] : []),
    { key: `${root}/leaves`, text: 'Leaves' },
    { key: `${root}/reimbursements`, text: 'Reimbursements' },
    { key: `${root}/payslips`, text: 'Payslips' },
    { key: `${root}/documents`, text: 'Documents' },
    { key: `${root}/profile`, text: 'My profile' },
    ...(myTeam ? [{ key: `${root}/my-team`, text: 'My team', badge: myTeam.waiting }] : []),
];

export const essEmployeeSubItems = (atsMode: AtsMode) => essSubItems(atsMode, base());

type MenuLike = { key: string; children?: MenuLike[] };

/** The selected menu key: the longest key (sub-items included) the path is on, else the first path segment. */
export const activeNavKey = (items: MenuLike[], pathname: string) =>
    items
        .flatMap(i => [i, ...(i.children ?? [])])
        .filter(i => i.key && (pathname === i.key || pathname.startsWith(`${i.key}/`)))
        .sort((a, b) => b.key.length - a.key.length)[0]?.key ?? `/${pathname.split('/')[1]}`;

/** Open groups: an ESS group while one of its pages is open. */
export const navOpenKeys = (pathname: string) => GROUPS.filter(g => onBase(pathname, g.base())).map(g => g.key);

/** Clicking an ESS group's title opens its Overview. */
export const withGroupTitleClick = <T extends MenuLike>(items: T[], go: (to: string) => void) =>
    items.map(i => {
        const g = GROUPS.find(x => x.key === i.key);
        return g ? { ...i, onTitleClick: () => go(g.base()) } : i;
    });
