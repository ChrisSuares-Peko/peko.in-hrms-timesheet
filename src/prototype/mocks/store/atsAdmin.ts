// PROTOTYPE-SETUP (Payroll admin, Slices 1–6): the Payroll module's admin side. The admin covers ALL employees and is
// level 2 (the final stop) for every service, whichever level-2 role Settings routes it to (profile updates: HR).
//   requests ...... every request of a type, each in a bucket: waiting for you (level 2) · with managers (read-only)
//                   · update requested · approved · rejected; newest first. Withdrawn / cancelled ones are left out.
//   decisions ..... only on items waiting for level 2 — at the level-2 role the item is waiting for. Ask for update goes
//                   straight to the employee; when they resubmit it starts again at the manager (resubmitTrail).
//   remind ........ a mocked notification to the manager (with managers) or the employee (update requested)
//   counts ........ the service tabs' badges
//   timesheet ..... the month overview (readiness, five period counts, departments), the all-employees week grid and
//                   month summary
//   leave ......... off today, the company calendar, balances per employee, one employee's leave view
import type {
    AdminBucket,
    AdminCounts,
    AdminLeaveRow,
    AdminOffToday,
    AdminRequestRow,
    AdminRequestType,
    AdminTimesheetOverview,
    Level2Role,
    RequestItem,
} from '@src/domains/attendanceTimesheet/types';
import {
    RuleError,
    awaiting,
    monthBounds,
    monthLabel,
    isApproverTeam,
    pendingStep,
} from '@src/prototype/rules/attendance';

import { timesheetMonthOf } from './atsEss';
import { leaveViewOf } from './atsLeave';
import { atsProfileRequests } from './atsProfile';
import { atsLeaveRequests, atsReimbursements } from './atsRequests';
import { atsCorrections, atsOvertime, employeesFor, getSettings, isProcessed, personRef, today, weeksSummary } from './atsStore';
import {
    allRequests,
    decideRequest,
    leaveCalendarOf,
    monthSummaryOf,
    payrollMonthStatus,
    payrollTimesheetQueue,
    weekGridOf,
} from './atsTeam';
import { findEmployee, managerOf } from '../data/employees';
import type { DataMode } from '../envelope';

const LEVEL2: Level2Role[] = ['HR', 'FINANCE', 'PAYROLL', 'ADMIN'];

/** The level-2 role a type is routed to (profile updates: HR). 'NONE' = the manager is final. */
export const adminRoleOf = (mode: DataMode, type: AdminRequestType): Level2Role | 'NONE' => {
    if (type === 'profile') return 'HR';
    const v = getSettings(mode).level2[type];
    return v === 'NONE' || isApproverTeam(v) ? v : 'NONE';
};

const bucketOf = (item: RequestItem): AdminBucket | null => {
    const s = item.trail.status;
    if (s === 'PENDING_MANAGER') return 'mgr';
    if (s.startsWith('PENDING')) return 'you';
    if (s === 'UPDATE_REQUESTED') return 'upd';
    if (s === 'APPROVED') return 'ok';
    if (s === 'REJECTED') return 'no';
    return null;
};

/** The raw record behind an item: the day it's about, its value, category, and whether it was withdrawn. */
const rawOf = (mode: DataMode, type: AdminRequestType, id: string) => {
    if (type === 'leave') {
        const l = atsLeaveRequests.get(mode).find(x => x.id === id);
        return l && { date: l.start, value: l.days, withdrawn: Boolean(l.withdrawn), leave: l };
    }
    if (type === 'reimbursement') {
        const c = atsReimbursements.get(mode).find(x => x.id === id);
        return c && { date: c.expenseDate.slice(0, 10), value: c.totalPay, category: c.category, withdrawn: Boolean(c.withdrawn) };
    }
    if (type === 'overtime') {
        const o = atsOvertime.get(mode).find(x => x.id === id);
        return o && { date: o.date, value: o.minutes, withdrawn: false };
    }
    if (type === 'attendance') {
        const c = atsCorrections.get(mode).find(x => x.id === id);
        return c && { date: c.date, value: 1, withdrawn: false };
    }
    const p = atsProfileRequests.get(mode).find(x => x.id === id);
    return p && { date: p.createdAt.slice(0, 10), value: 1, withdrawn: false };
};

const firstName = (id: number) => findEmployee(id)?.fullName.split(' ')[0] ?? '';

/** Every request of a type, for the admin (all employees), newest first. */
export const adminRequests = (mode: DataMode, type: AdminRequestType): AdminRequestRow[] => {
    const role = adminRoleOf(mode, type);
    const approvedLeave = type === 'leave' ? atsLeaveRequests.get(mode).filter(l => l.trail.status === 'APPROVED' && !l.withdrawn) : [];
    return allRequests(mode, type, role === 'NONE' ? 'PAYROLL' : role)
        .flatMap((item): AdminRequestRow[] => {
            const bucket = bucketOf(item);
            const raw = rawOf(mode, type, item.id);
            if (!bucket || !raw || raw.withdrawn) return [];
            const e = findEmployee(item.employee.id);
            const {department} = item.employee;
            const row: AdminRequestRow = {
                item: { ...item, waitingForYou: bucket === 'you' },
                bucket,
                department,
                date: raw.date,
                value: raw.value,
                ...('category' in raw && raw.category ? { category: raw.category } : {}),
                managerName: e ? managerOf(e)?.fullName ?? null : null,
                // PROTOTYPE-SETUP (Settings, Slice 1): with approvers — the person it's waiting with.
                waitingWith: bucket === 'mgr' ? pendingStep(item.trail)?.approverName ?? null : null,
            };
            if (type === 'leave' && 'leave' in raw && raw.leave) {
                const l = raw.leave;
                const overlapping = approvedLeave.filter(x => x.employeeId !== l.employeeId && x.start <= l.end && x.end >= l.start);
                const inDept = overlapping.filter(x => findEmployee(x.employeeId)?.department === department);
                row.deptClash = { department, names: [...new Set(inDept.map(x => firstName(x.employeeId)))] };
                // The calendar's side panel: anyone in the company off then.
                row.item = { ...row.item, leave: { start: l.start, end: l.end, half: l.half ?? null, alsoOff: [...new Set(overlapping.map(x => firstName(x.employeeId)))] } };
            }
            return [row];
        })
        .sort((a, b) => b.item.at.localeCompare(a.item.at));
};

const waiting = (mode: DataMode, type: AdminRequestType) => adminRequests(mode, type).filter(r => r.bucket === 'you').length;

/** The Payroll service tabs' badges: what's waiting for the admin. */
export const adminCounts = (mode: DataMode): AdminCounts => ({
    timesheet: payrollTimesheetQueue(mode, 'waiting').length,
    attendance: waiting(mode, 'attendance'),
    leave: waiting(mode, 'leave'),
    overtime: waiting(mode, 'overtime'),
    reimbursement: waiting(mode, 'reimbursement'),
    profile: waiting(mode, 'profile'),
});

const rowOrFail = (mode: DataMode, type: AdminRequestType, id: string) => {
    const row = adminRequests(mode, type).find(r => r.item.id === id);
    if (!row) throw new RuleError('Request not found.', 404);
    if (row.bucket === 'mgr') throw new RuleError(`Still with ${row.waitingWith ?? 'the approver'}. You can decide once they approve.`);
    if (row.bucket !== 'you') throw new RuleError('This request is no longer waiting for your decision — refresh the list.');
    return row;
};

/**
 * Approve / reject / ask for an update — only on an item waiting for level 2, at the level-2 role it's waiting for.
 * Approving is final and runs the type's effects (attendance updated, leave applied, the profile changed).
 */
export const adminDecide = (
    mode: DataMode,
    type: AdminRequestType,
    id: string,
    decision: 'APPROVED' | 'REJECTED' | 'UPDATE_REQUESTED',
    comment?: string
) => {
    const row = rowOrFail(mode, type, id);
    const role = awaiting(row.item.trail);
    if (!role || !LEVEL2.includes(role as Level2Role)) throw new RuleError('This request is no longer waiting for your decision — refresh the list.');
    return decideRequest(mode, type, id, { role: role as Level2Role }, decision, comment);
};

/** Approve several at once — each exactly as a single approval. Items not waiting for the admin are skipped and reported. */
export const adminBulkApprove = (mode: DataMode, type: AdminRequestType, body: { ids?: string[] } | undefined) => {
    const ids = Array.isArray(body?.ids) ? body!.ids : [];
    if (!ids.length) throw new RuleError('Pick at least one request to approve.', 400);
    let approved = 0;
    const failed: { id: string; reason: string }[] = [];
    ids.forEach(id => {
        try {
            adminDecide(mode, type, id, 'APPROVED');
            approved += 1;
        } catch (e) {
            if (!(e instanceof RuleError)) throw e;
            failed.push({ id, reason: e.message });
        }
    });
    return { approved, failed };
};

/** "Remind manager" (still with them) / "Remind employee" (update requested) — a mocked notification. */
export const adminRemind = (mode: DataMode, type: AdminRequestType, id: string) => {
    const row = adminRequests(mode, type).find(r => r.item.id === id);
    if (!row) throw new RuleError('Request not found.', 404);
    if (row.bucket === 'mgr') return { to: row.waitingWith ?? 'the approver', message: `Reminder sent to ${row.waitingWith ?? 'the approver'}` };
    if (row.bucket === 'upd') return { to: row.item.employee.name, message: `Reminder sent to ${row.item.employee.name}` };
    throw new RuleError('Only requests with a manager or waiting for an update can be reminded.', 400);
};

// ---- Timesheet ----------------------------------------------------------------------------------------------------

/** Payroll → Timesheet → Overview: payroll readiness, the five period counts, and the department table. */
export const adminTimesheetOverview = (mode: DataMode, month: string): AdminTimesheetOverview => {
    const t = today();
    const { last } = monthBounds(month);
    const status = payrollMonthStatus(mode, month);
    const people = employeesFor(mode).filter(e => e.dateOfJoin <= last);
    const counts: AdminTimesheetOverview['counts'] = { draft: 0, submitted: 0, withYou: 0, sentBack: 0, approved: 0 };
    const KEY = { DRAFT: 'draft', SUBMITTED: 'submitted', WITH_PAYROLL: 'withYou', SENT_BACK: 'sentBack', APPROVED: 'approved' } as const;
    const byDept = new Map<string, AdminTimesheetOverview['departments'][number]>();
    people.forEach(e => {
        const d = byDept.get(e.department) ?? { department: e.department, people: 0, loggedMinutes: 0, workedMinutes: 0, submitted: 0, withYou: 0, approved: 0 };
        d.people += 1;
        const {totals} = timesheetMonthOf(mode, e, month);
        d.loggedMinutes += totals.loggedMinutes;
        d.workedMinutes += totals.expectedMinutes;
        // Periods that have started (a future draft isn't "not submitted" yet).
        weeksSummary(mode, e, month)
            .filter(w => w.weekStart <= t)
            .forEach(w => {
                counts[KEY[w.status]] += 1;
                if (w.status === 'SUBMITTED') d.submitted += 1;
                if (w.status === 'WITH_PAYROLL') d.withYou += 1;
                if (w.status === 'APPROVED') d.approved += 1;
            });
        byDept.set(e.department, d);
    });
    return {
        month,
        monthLabel: monthLabel(month),
        processed: isProcessed(mode, month),
        approvalEnabled: status.approvalEnabled,
        blockedEmployees: new Set(status.blockers.map(b => b.employee.id)).size,
        counts,
        departments: [...byDept.values()].sort((a, b) => a.department.localeCompare(b.department)),
    };
};

const peopleIn = (mode: DataMode, department?: string) =>
    employeesFor(mode).filter(e => !department || department === 'all' || e.department === department);

/** Payroll → Timesheet → Details: everyone's week (optionally one department). */
export const adminWeekGrid = (mode: DataMode, date: string, department?: string) => weekGridOf(mode, peopleIn(mode, department), date);
export const adminMonthSummary = (mode: DataMode, month: string, department?: string) => monthSummaryOf(mode, peopleIn(mode, department), month);

/** Every employee (the Details tables list everyone, with or without requests). */
export const adminPeople = (mode: DataMode) => employeesFor(mode).map(personRef);

/** The company's departments (the Details filter). */
export const adminDepartments = (mode: DataMode) => [...new Set(employeesFor(mode).map(e => e.department))].sort();

// ---- Leave --------------------------------------------------------------------------------------------------------

export const adminLeaveCalendar = (mode: DataMode, month: string) => leaveCalendarOf(mode, employeesFor(mode), month);

/** Approved leave covering today (half days marked). */
export const adminOffToday = (mode: DataMode): AdminOffToday[] => {
    const t = today();
    return atsLeaveRequests
        .get(mode)
        .filter(l => l.trail.status === 'APPROVED' && !l.withdrawn && l.start <= t && l.end >= t)
        .flatMap(l => {
            const e = findEmployee(l.employeeId);
            return e ? [{ employee: personRef(e), type: l.type, half: l.half ?? null }] : [];
        });
};

/** Every employee's available Annual / Casual / Sick, late deductions and loss of pay. */
export const adminLeaveBalances = (mode: DataMode): AdminLeaveRow[] =>
    employeesFor(mode).map(e => {
        const v = leaveViewOf(mode, e);
        const avail = (t: 'ANNUAL' | 'CASUAL' | 'SICK') => v.balances.find(b => b.type === t)?.available ?? 0;
        return {
            employee: personRef(e),
            available: { ANNUAL: avail('ANNUAL'), CASUAL: avail('CASUAL'), SICK: avail('SICK') },
            taken: v.balances.reduce((n, b) => n + b.taken, 0),
            lateDeductionDays: v.balances.reduce((n, b) => n + b.late, 0),
            lossOfPayDays: v.lossOfPayDays,
        };
    });

/** One employee's balance cards and ledger (read-only). */
export const adminLeaveViewOf = (mode: DataMode, employeeId: string | number) => {
    const e = findEmployee(employeeId);
    if (!e) throw new RuleError('Employee not found.', 404);
    return leaveViewOf(mode, e);
};
