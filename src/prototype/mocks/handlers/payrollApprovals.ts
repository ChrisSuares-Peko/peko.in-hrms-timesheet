// PROTOTYPE-SETUP: Timesheet V1, Slice 4 — Payroll (HR / Finance). Corporate-scoped (the Payroll admin acts as
// HR or Finance).
//   Level-2 queues: every request currently waiting on HR or Finance (routing per component in settings).
//   Timesheet summary: per month, status counts + employees with unapproved weeks (timesheets are level 1 only;
//   Payroll / HR can view them read-only).
import type {
    ApprovalQueueItem,
    Level2Role,
    SummaryWeekStatus,
    TimesheetSummary,
    TimesheetSummaryRow,
    TimesheetWeek,
} from '@src/domains/timesheet/types';
import { addDaysIso, weekStartOf } from '@src/domains/timesheet/utils';

import { EMPLOYEES, findEmployee, managerOf } from '../data/employees';
import { isPayrollProcessed, lockFor, monthLabel } from '../data/payroll-processing';
import { todayIso } from '../data/time-calendar';
import type { DataMode } from '../envelope';
import { fail } from '../errors';
import { MockRoute, route } from '../router';
import { viewOf } from './timesheet';
import { awaiting, decide, personRef } from '../store/approvals';
import { allSources, sourceFor } from '../store/requestSources';
import { timesheetSettings, timesheetWeeks } from '../store/timesheetStore';

const A = ':type/:uid/payroll/approvals';
const TS = ':type/:uid/payroll/timesheet';

const asRole = (value: unknown): Level2Role => {
    const role = String(value ?? '').toUpperCase();
    if (role !== 'HR' && role !== 'FINANCE') throw fail(400, 'Queue must be HR or FINANCE.');
    return role;
};

const level2Queue = (mode: DataMode, role: Level2Role): ApprovalQueueItem[] =>
    allSources()
        .flatMap(s =>
            s
                .list(mode)
                .filter(r => awaiting(r.trail)?.role === role)
                .map(r => s.toItem(mode, r.id))
        )
        .filter((x): x is ApprovalQueueItem => !!x)
        .sort((a, b) => a.at.localeCompare(b.at));

const countsFor = (mode: DataMode, role: Level2Role) =>
    level2Queue(mode, role).reduce<Record<string, number>>(
        (acc, item) => ({ ...acc, [item.component]: (acc[item.component] ?? 0) + 1 }),
        { attendance: 0, overtime: 0, leave: 0, reimbursement: 0 }
    );

// ---- timesheet summary --------------------------------------------------------------------------------------

const weeksOverlapping = (month: string) => {
    const first = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const last = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    const starts: string[] = [];
    let ws = weekStartOf(first);
    while (ws <= last) {
        starts.push(ws);
        ws = addDaysIso(ws, 7);
    }
    return { starts, last };
};

const summaryOf = (mode: DataMode, month: string): Omit<TimesheetSummary, 'mode'> => {
    const today = todayIso();
    const { starts, last } = weeksOverlapping(month);
    const byId = new Map<string, TimesheetWeek>(timesheetWeeks.get(mode).map(w => [w.id, w]));
    // Only weeks that have ended count: the current week is still open (not "unapproved").
    const visibleStarts = starts.filter(ws => addDaysIso(ws, 6) < today);
    const rows: TimesheetSummaryRow[] = EMPLOYEES.filter(e => e.dateOfJoin <= last).map(e => {
        const weeks = visibleStarts
            .filter(ws => addDaysIso(ws, 6) >= e.dateOfJoin)
            .map(ws => {
                const w = byId.get(`${e.id}:${ws}`);
                return {
                    weekStart: ws,
                    status: (w?.status ?? 'NOT_STARTED') as SummaryWeekStatus,
                    changePending: !!w?.pendingChangeRequestId,
                };
            });
        const manager = managerOf(e);
        return {
            employee: personRef(e),
            manager: manager ? { id: manager.id, name: manager.fullName } : null,
            weeks,
            fullyApproved:
                weeks.length > 0 && weeks.every(w => w.status === 'APPROVED' && !w.changePending),
        };
    });
    const allWeeks = rows.flatMap(r => r.weeks);
    const count = (s: SummaryWeekStatus) => allWeeks.filter(w => w.status === s).length;
    const months = [
        ...new Set(
            timesheetWeeks
                .get(mode)
                .flatMap(w => [w.weekStart.slice(0, 7), addDaysIso(w.weekStart, 6).slice(0, 7)])
        ),
    ]
        .filter(mo => mo <= today.slice(0, 7))
        .sort()
        .reverse();
    const lock = lockFor(`${month}-01`);
    return {
        month,
        monthLabel: monthLabel(month),
        locked: lock.locked,
        ...(lock.reason
            ? {
                  lockReason: `Payroll for ${monthLabel(month)} has been processed — timesheets for this month are locked.`,
              }
            : {}),
        availableMonths: (months.length ? months : [today.slice(0, 7)]).map(mo => ({
            month: mo,
            label: monthLabel(mo),
            locked: isPayrollProcessed(mo),
        })),
        employeesTotal: rows.length,
        employeesFullyApproved: rows.filter(r => r.fullyApproved).length,
        weekCounts: {
            APPROVED: count('APPROVED'),
            SUBMITTED: count('SUBMITTED'),
            DRAFT: count('DRAFT'),
            REJECTED: count('REJECTED'),
            NOT_STARTED: count('NOT_STARTED'),
            CHANGE_PENDING: allWeeks.filter(w => w.changePending).length,
        },
        rows,
    };
};

export const payrollApprovalRoutes: MockRoute[] = [
    // Level-2 queues
    route('GET', `${A}/counts`, ({ mode }) => ({
        HR: countsFor(mode, 'HR'),
        FINANCE: countsFor(mode, 'FINANCE'),
    })),
    route('GET', `${A}/queue`, ({ mode, query }) => level2Queue(mode, asRole(query.role))),
    route('POST', `${A}/:component/:id/approve`, ({ mode, params, query, body }) => {
        const source = sourceFor(params.component ?? '');
        if (!source) throw fail(404, 'Unknown request type.');
        const id = decodeURIComponent(params.id ?? '');
        const record = source.list(mode).find(r => r.id === id);
        if (!record) throw fail(404, 'That request no longer exists.');
        source.setTrail(
            mode,
            id,
            decide(record.trail, asRole(query.role ?? body?.role), 'APPROVED', body?.comment)
        );
        return source.toItem(mode, id);
    }),
    route('POST', `${A}/:component/:id/reject`, ({ mode, params, query, body }) => {
        const source = sourceFor(params.component ?? '');
        if (!source) throw fail(404, 'Unknown request type.');
        const id = decodeURIComponent(params.id ?? '');
        const record = source.list(mode).find(r => r.id === id);
        if (!record) throw fail(404, 'That request no longer exists.');
        source.setTrail(
            mode,
            id,
            decide(record.trail, asRole(query.role ?? body?.role), 'REJECTED', body?.comment)
        );
        return source.toItem(mode, id);
    }),

    // Timesheet summary + read-only view (Payroll / HR)
    route('GET', `${TS}/summary`, ({ mode, query }) => {
        const month = /^\d{4}-\d{2}$/.test(String(query.month ?? ''))
            ? String(query.month)
            : todayIso().slice(0, 7);
        return { ...summaryOf(mode, month), mode: timesheetSettings.get(mode).mode };
    }),
    route('GET', `${TS}/employees/:employeeId/week`, ({ mode, params, query }) => {
        const employee = findEmployee(params.employeeId);
        if (!employee) throw fail(404, 'Employee not found.');
        return viewOf(mode, employee, weekStartOf(String(query.weekStart ?? todayIso())));
    }),
];
