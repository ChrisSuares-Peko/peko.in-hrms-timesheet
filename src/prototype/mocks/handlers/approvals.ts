// PROTOTYPE-SETUP: approval queues (Timesheet V1).
//   Slice 3 — ESS - Manager "Team Approvals": the persona's DIRECT REPORTS only.
//     Timesheets: submitted weeks + Change Requests — the manager's decision is final (level 1 only).
//     Two-level requests (overtime; Slice 5 adds leave, reimbursement, attendance): level-1 decision; approval
//     moves the request to HR / Finance per routing.
import type {
    ApprovalCounts,
    ApprovalQueueItem,
    ChangeRequest,
    HistoryEvent,
    TimesheetQueueItem,
    TimesheetWeek,
} from '@src/domains/timesheet/types';
import {
    diffEntries,
    diffSummary,
    isOutsideWindow,
    loggedMinutesOn,
} from '@src/domains/timesheet/utils';

import { MockEmployee, findEmployee } from '../data/employees';
import { weekWindows } from '../data/timesheet-windows';
import type { DataMode } from '../envelope';
import { fail } from '../errors';
import { essRequester } from '../requester';
import { MockRoute, route } from '../router';
import { saveWeek, viewOf } from './timesheet';
import { assertManages, awaiting, decide, personRef } from '../store/approvals';
import { allSources, sourceFor } from '../store/requestSources';
import {
    timesheetChangeRequests,
    timesheetSettings,
    timesheetWeeks,
} from '../store/timesheetStore';

const T = ':type/:uid/payroll/team-approvals';

const reportsOf = (manager: MockEmployee) => (employeeId: number) =>
    findEmployee(employeeId)?.managerEmployeeId === manager.employeeId;

const decodeId = (value: string | undefined) => decodeURIComponent(value ?? '');

const managerEvent = (
    manager: MockEmployee,
    action: HistoryEvent['action'],
    detail?: string
): HistoryEvent => ({
    at: new Date().toISOString(),
    actor: { id: manager.id, name: manager.fullName, role: 'MANAGER' },
    action,
    ...(detail ? { detail } : {}),
});

// ---- timesheets ---------------------------------------------------------------------------------------------

const weekTotals = (mode: DataMode, week: TimesheetWeek) => {
    const employee = findEmployee(week.employeeId)!;
    const windows = weekWindows(employee, week.weekStart, timesheetSettings.get(mode).mode);
    return {
        loggedMinutes: windows.reduce((s, w) => s + loggedMinutesOn(week.entries, w.date), 0),
        expectedMinutes: windows.reduce((s, w) => s + w.expectedMinutes, 0),
        outsideWindowCount: week.entries.filter(e =>
            isOutsideWindow(e, windows.find(w => w.date === e.date)!)
        ).length,
    };
};

const timesheetQueue = (mode: DataMode, manager: MockEmployee): TimesheetQueueItem[] => {
    const mine = reportsOf(manager);
    const weeks = timesheetWeeks.get(mode).filter(w => mine(w.employeeId));
    const submitted: TimesheetQueueItem[] = weeks
        .filter(w => w.status === 'SUBMITTED')
        .map(w => ({
            kind: 'TIMESHEET',
            id: w.id,
            weekId: w.id,
            weekStart: w.weekStart,
            employee: personRef(findEmployee(w.employeeId)!),
            at: w.submittedAt ?? '',
            autoSubmitted: w.autoSubmitted,
            ...weekTotals(mode, w),
        }));
    const changes: TimesheetQueueItem[] = timesheetChangeRequests
        .get(mode)
        .filter(c => c.status === 'PENDING' && mine(c.employeeId))
        .map(c => {
            const week = weeks.find(w => w.id === c.weekId)!;
            return {
                kind: 'CHANGE_REQUEST',
                id: c.id,
                weekId: c.weekId,
                weekStart: week.weekStart,
                employee: personRef(findEmployee(c.employeeId)!),
                at: c.requestedAt,
                reason: c.reason,
                diffSummary: diffSummary(diffEntries(c.baseEntries, c.proposedEntries)),
                ...weekTotals(mode, { ...week, entries: c.proposedEntries }),
            };
        });
    return [...changes, ...submitted].sort((a, b) => a.at.localeCompare(b.at));
};

const ownedWeek = (mode: DataMode, manager: MockEmployee, weekId: string) => {
    const week = timesheetWeeks.get(mode).find(w => w.id === weekId);
    if (!week) throw fail(404, 'That timesheet no longer exists.');
    assertManages(manager, findEmployee(week.employeeId));
    return week;
};

const ownedChange = (mode: DataMode, manager: MockEmployee, crId: string) => {
    const cr = timesheetChangeRequests.get(mode).find(c => c.id === crId);
    if (!cr) throw fail(404, 'That change request no longer exists.');
    assertManages(manager, findEmployee(cr.employeeId));
    if (cr.status !== 'PENDING') throw fail(409, 'This change request has already been decided.');
    return cr;
};

const comment = (body: unknown) =>
    String((body as { comment?: string } | undefined)?.comment ?? '').trim();

const decideWeek = (mode: DataMode, weekId: string, approve: boolean, body: unknown) => {
    const me = essRequester();
    const week = ownedWeek(mode, me, weekId);
    if (week.status !== 'SUBMITTED')
        throw fail(409, 'This timesheet is no longer waiting for approval.');
    const note = comment(body);
    if (!approve && !note) throw fail(400, 'Please add a comment explaining the rejection.');
    const decision = {
        by: { id: me.id, name: me.fullName, role: 'MANAGER' as const },
        at: new Date().toISOString(),
        ...(note ? { comment: note } : {}),
    };
    saveWeek(mode, {
        ...week,
        status: approve ? 'APPROVED' : 'REJECTED',
        ...(approve ? { approvedEntries: week.entries } : {}),
        decision,
        history: [
            ...week.history,
            managerEvent(me, approve ? 'APPROVED' : 'REJECTED', note || undefined),
        ],
    });
    return viewOf(mode, findEmployee(week.employeeId)!, week.weekStart);
};

const decideChange = (mode: DataMode, crId: string, approve: boolean, body: unknown) => {
    const me = essRequester();
    const cr = ownedChange(mode, me, crId);
    const note = comment(body);
    if (!approve && !note) throw fail(400, 'Please add a comment explaining the rejection.');
    const decided: ChangeRequest = {
        ...cr,
        status: approve ? 'APPROVED' : 'REJECTED',
        decision: {
            by: { id: me.id, name: me.fullName, role: 'MANAGER' },
            at: new Date().toISOString(),
            ...(note ? { comment: note } : {}),
        },
    };
    timesheetChangeRequests.update(mode, list => list.map(c => (c.id === cr.id ? decided : c)));
    const week = timesheetWeeks.get(mode).find(w => w.id === cr.weekId)!;
    const summary = diffSummary(diffEntries(cr.baseEntries, cr.proposedEntries));
    saveWeek(mode, {
        ...week,
        // Approved: the proposal becomes the approved version. Rejected: revert to the last approved version.
        entries: approve ? cr.proposedEntries : (week.approvedEntries ?? cr.baseEntries),
        approvedEntries: approve ? cr.proposedEntries : week.approvedEntries,
        pendingChangeRequestId: undefined,
        history: [
            ...week.history,
            managerEvent(
                me,
                approve ? 'CHANGE_APPROVED' : 'CHANGE_REJECTED',
                approve ? summary : `${note} The week reverted to the last approved version.`
            ),
        ],
    });
    return viewOf(mode, findEmployee(week.employeeId)!, week.weekStart);
};

// ---- two-level requests (overtime; leave, reimbursement, attendance in Slice 5) ----------------------------

const managerQueue = (
    mode: DataMode,
    manager: MockEmployee,
    component?: string
): ApprovalQueueItem[] => {
    const mine = reportsOf(manager);
    return allSources()
        .filter(s => !component || s.component === component)
        .flatMap(s =>
            s
                .list(mode)
                .filter(r => mine(r.employeeId) && awaiting(r.trail)?.role === 'MANAGER')
                .map(r => s.toItem(mode, r.id))
        )
        .filter((x): x is ApprovalQueueItem => !!x)
        .sort((a, b) => a.at.localeCompare(b.at));
};

const decideRequest = (
    mode: DataMode,
    component: string,
    id: string,
    approve: boolean,
    body: unknown
) => {
    const me = essRequester();
    const source = sourceFor(component);
    if (!source) throw fail(404, 'Unknown request type.');
    const record = source.list(mode).find(r => r.id === id);
    if (!record) throw fail(404, 'That request no longer exists.');
    assertManages(me, findEmployee(record.employeeId));
    source.setTrail(
        mode,
        id,
        decide(record.trail, 'MANAGER', approve ? 'APPROVED' : 'REJECTED', comment(body))
    );
    return source.toItem(mode, id);
};

export const teamApprovalRoutes: MockRoute[] = [
    route('GET', `${T}/counts`, ({ mode }): ApprovalCounts => {
        const me = essRequester();
        const ts = timesheetQueue(mode, me);
        const req = managerQueue(mode, me);
        const count = (c: string) => req.filter(r => r.component === c).length;
        return {
            timesheets: ts.filter(t => t.kind === 'TIMESHEET').length,
            changeRequests: ts.filter(t => t.kind === 'CHANGE_REQUEST').length,
            attendance: count('attendance'),
            overtime: count('overtime'),
            leave: count('leave'),
            reimbursement: count('reimbursement'),
        };
    }),
    route('GET', `${T}/timesheets`, ({ mode }) => timesheetQueue(mode, essRequester())),
    route('GET', `${T}/timesheets/:weekId`, ({ mode, params }) => {
        const me = essRequester();
        const week = ownedWeek(mode, me, decodeId(params.weekId));
        return viewOf(mode, findEmployee(week.employeeId)!, week.weekStart);
    }),
    route('POST', `${T}/timesheets/:weekId/approve`, ({ mode, params, body }) =>
        decideWeek(mode, decodeId(params.weekId), true, body)
    ),
    route('POST', `${T}/timesheets/:weekId/reject`, ({ mode, params, body }) =>
        decideWeek(mode, decodeId(params.weekId), false, body)
    ),
    route('POST', `${T}/change-requests/:crId/approve`, ({ mode, params, body }) =>
        decideChange(mode, decodeId(params.crId), true, body)
    ),
    route('POST', `${T}/change-requests/:crId/reject`, ({ mode, params, body }) =>
        decideChange(mode, decodeId(params.crId), false, body)
    ),
    route('GET', `${T}/requests/:component`, ({ mode, params }) =>
        managerQueue(mode, essRequester(), params.component)
    ),
    route('POST', `${T}/requests/:component/:id/approve`, ({ mode, params, body }) =>
        decideRequest(mode, params.component ?? '', decodeId(params.id), true, body)
    ),
    route('POST', `${T}/requests/:component/:id/reject`, ({ mode, params, body }) =>
        decideRequest(mode, params.component ?? '', decodeId(params.id), false, body)
    ),
];
