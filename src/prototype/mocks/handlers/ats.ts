// PROTOTYPE-SETUP: ESS Service 1 — Attendance & Timesheet endpoints. Contract: docs/api/attendance-timesheet.md.
// Stateful (store/atsStore.ts + atsEss.ts + atsTeam.ts), persisted per data mode, so ESS - Employee,
// ESS - Manager and Payroll see the same data. ESS and manager endpoints answer as the requesting persona
// (requester.ts); Payroll level-2 endpoints act as the role in `?role=HR|FINANCE`.
import type { Level2Role, QueueScope } from '@src/domains/attendanceTimesheet/types';
import { RuleError } from '@src/prototype/rules/attendance';

import { findEmployee } from '../data/employees';
import type { DataMode } from '../envelope';
import { fail } from '../errors';
import { essRequester } from '../requester';
import { MockContext, MockRoute, route } from '../router';
import {
    addEntry,
    attendanceMonthOf,
    cancelChangeRequest,
    cancelCorrection,
    cancelOvertime,
    checkIn,
    checkOut,
    correctionsView,
    createCorrection,
    createOvertime,
    deleteEntry,
    editEntry,
    overtimeViewOf,
    overviewOf,
    requestChange,
    submitWeek,
    timesheetMonthOf,
} from '../store/atsEss';
import { currentMonth, getSettings, overtimeContext, today, weekView } from '../store/atsStore';
import {
    RequestType,
    approveChangeRequest,
    approveWeek,
    assertManages,
    autoRunSubmissionDay,
    decideRequest,
    level2Counts,
    level2Requests,
    payrollMonthStatus,
    payrollMonths,
    processPayrollMonth,
    rejectChangeRequest,
    runSubmissionDay,
    sendBackWeek,
    teamApprovalCounts,
    teamMonthSummary,
    teamRequests,
    teamToday,
    teamWeekGrid,
    timesheetQueue,
    timesheetStatusView,
    updateSettings,
} from '../store/atsTeam';

const A = ':type/:uid/payroll/ats';

/** Rule breaks become HTTP errors (the interceptor shows the message as a toast). */
const run = <T>(mode: DataMode, fn: () => T): T => {
    try {
        autoRunSubmissionDay(mode);
        return fn();
    } catch (e) {
        if (e instanceof RuleError) throw fail(e.status, e.message);
        throw e;
    }
};

const MONTH = /^\d{4}-\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const monthParam = (q: MockContext['query']) => (MONTH.test(String(q.month ?? '')) ? String(q.month) : currentMonth());
const dateParam = (q: MockContext['query']) => (DATE.test(String(q.date ?? '')) ? String(q.date) : today());
const scopeParam = (q: MockContext['query']): QueueScope => (q.scope === 'all' ? 'all' : 'waiting');
const roleParam = (q: MockContext['query']): Level2Role => {
    if (q.role === 'HR' || q.role === 'FINANCE') return q.role;
    throw fail(400, 'role must be HR or FINANCE');
};
const typeParam = (p: MockContext['params']): RequestType => {
    if (p.requestType === 'attendance' || p.requestType === 'overtime') return p.requestType;
    throw fail(404, 'Unknown request type');
};

const monthOrFail = (m: string | undefined) => {
    if (!MONTH.test(m ?? '')) throw fail(400, 'month must be YYYY-MM');
    return m!;
};

/** Default month: the earliest one whose payroll isn't processed (last month in the demo). */
const timesheetStatusOrDefault = (ctx: MockContext) =>
    timesheetStatusView(
        ctx.mode,
        MONTH.test(String(ctx.query.month ?? '')) ? String(ctx.query.month) : payrollMonths(ctx.mode).find(m => !m.processed)?.month ?? currentMonth()
    );

/** ESS: the persona making the request. */
const ess = (handler: (ctx: MockContext, me: ReturnType<typeof essRequester>) => unknown) => (ctx: MockContext) => {
    const me = essRequester();
    return run(ctx.mode, () => handler(ctx, me));
};

const member = (ctx: MockContext, manager: ReturnType<typeof essRequester>) =>
    assertManages(manager, findEmployee(ctx.params.employeeId));

export const atsRoutes: MockRoute[] = [
    // ---- settings & demo ----------------------------------------------------------------------------------
    route('GET', `${A}/settings`, ctx => run(ctx.mode, () => getSettings(ctx.mode))),
    route('PUT', `${A}/settings`, ctx => run(ctx.mode, () => updateSettings(ctx.mode, ctx.body))),
    route('POST', `${A}/demo/simulate-submission-day`, ctx => run(ctx.mode, () => runSubmissionDay(ctx.mode))),

    // ---- ESS: overview, check-in / out, attendance ------------------------------------------------------
    route('GET', `${A}/overview`, ess((ctx, me) => overviewOf(ctx.mode, me))),
    route('POST', `${A}/check-in`, ess((ctx, me) => checkIn(ctx.mode, me))),
    route('POST', `${A}/check-out`, ess((ctx, me) => checkOut(ctx.mode, me))),
    route('GET', `${A}/attendance`, ess((ctx, me) => attendanceMonthOf(ctx.mode, me, monthParam(ctx.query)))),
    route('GET', `${A}/corrections`, ess((ctx, me) => correctionsView(ctx.mode, me))),
    route('POST', `${A}/corrections`, ess((ctx, me) => createCorrection(ctx.mode, me, ctx.body))),
    route('POST', `${A}/corrections/:id/cancel`, ess((ctx, me) => cancelCorrection(ctx.mode, me, ctx.params.id!))),

    // ---- ESS: timesheet ---------------------------------------------------------------------------------
    route('GET', `${A}/timesheet/week`, ess((ctx, me) => weekView(ctx.mode, me, dateParam(ctx.query)))),
    route('GET', `${A}/timesheet/month`, ess((ctx, me) => timesheetMonthOf(ctx.mode, me, monthParam(ctx.query)))),
    route('POST', `${A}/timesheet/entries`, ess((ctx, me) => addEntry(ctx.mode, me, ctx.body))),
    route('PUT', `${A}/timesheet/entries/:entryId`, ess((ctx, me) => editEntry(ctx.mode, me, ctx.params.entryId!, ctx.body))),
    route('DELETE', `${A}/timesheet/entries/:entryId`, ess((ctx, me) => deleteEntry(ctx.mode, me, ctx.params.entryId!))),
    route('POST', `${A}/timesheet/weeks/:weekStart/submit`, ess((ctx, me) => submitWeek(ctx.mode, me, ctx.params.weekStart!))),
    route('POST', `${A}/timesheet/weeks/:weekStart/change-request`, ess((ctx, me) => requestChange(ctx.mode, me, ctx.params.weekStart!, ctx.body))),
    route('POST', `${A}/timesheet/weeks/:weekStart/change-request/cancel`, ess((ctx, me) => cancelChangeRequest(ctx.mode, me, ctx.params.weekStart!))),

    // ---- ESS: overtime ------------------------------------------------------------------------------------
    route('GET', `${A}/overtime`, ess((ctx, me) => overtimeViewOf(ctx.mode, me, monthParam(ctx.query)))),
    route('GET', `${A}/overtime/context`, ess((ctx, me) => overtimeContext(ctx.mode, me, dateParam(ctx.query)))),
    route('POST', `${A}/overtime`, ess((ctx, me) => createOvertime(ctx.mode, me, ctx.body))),
    route('POST', `${A}/overtime/:id/cancel`, ess((ctx, me) => cancelOvertime(ctx.mode, me, ctx.params.id!))),

    // ---- ESS - Manager: my team -------------------------------------------------------------------------
    route('GET', `${A}/team/today`, ess((ctx, me) => teamToday(ctx.mode, me))),
    route('GET', `${A}/team/timesheets/week`, ess((ctx, me) => teamWeekGrid(ctx.mode, me, dateParam(ctx.query)))),
    route('GET', `${A}/team/timesheets/month`, ess((ctx, me) => teamMonthSummary(ctx.mode, me, monthParam(ctx.query)))),
    route('GET', `${A}/team/members/:employeeId/timesheet/week`, ess((ctx, me) => weekView(ctx.mode, member(ctx, me), dateParam(ctx.query), { readOnly: true }))),
    route('GET', `${A}/team/members/:employeeId/timesheet/month`, ess((ctx, me) => timesheetMonthOf(ctx.mode, member(ctx, me), monthParam(ctx.query)))),
    route('GET', `${A}/team/members/:employeeId/attendance`, ess((ctx, me) => attendanceMonthOf(ctx.mode, member(ctx, me), monthParam(ctx.query)))),
    route('GET', `${A}/team/approvals/counts`, ess((ctx, me) => teamApprovalCounts(ctx.mode, me))),
    route('GET', `${A}/team/approvals/timesheets`, ess((ctx, me) => timesheetQueue(ctx.mode, me, scopeParam(ctx.query)))),
    route('POST', `${A}/team/approvals/timesheets/:employeeId/:weekStart/approve`, ess((ctx, me) => approveWeek(ctx.mode, me, ctx.params.employeeId!, ctx.params.weekStart!, ctx.body?.comment))),
    route('POST', `${A}/team/approvals/timesheets/:employeeId/:weekStart/send-back`, ess((ctx, me) => sendBackWeek(ctx.mode, me, ctx.params.employeeId!, ctx.params.weekStart!, ctx.body?.comment))),
    route('POST', `${A}/team/approvals/change-requests/:id/approve`, ess((ctx, me) => approveChangeRequest(ctx.mode, me, ctx.params.id!, ctx.body?.comment))),
    route('POST', `${A}/team/approvals/change-requests/:id/reject`, ess((ctx, me) => rejectChangeRequest(ctx.mode, me, ctx.params.id!, ctx.body?.comment))),
    route('GET', `${A}/team/approvals/requests/:requestType`, ess((ctx, me) => teamRequests(ctx.mode, me, typeParam(ctx.params), scopeParam(ctx.query)))),
    route('POST', `${A}/team/approvals/requests/:requestType/:id/approve`, ess((ctx, me) => decideRequest(ctx.mode, typeParam(ctx.params), ctx.params.id!, { role: 'MANAGER', manager: me }, 'APPROVED', ctx.body?.comment))),
    route('POST', `${A}/team/approvals/requests/:requestType/:id/reject`, ess((ctx, me) => decideRequest(ctx.mode, typeParam(ctx.params), ctx.params.id!, { role: 'MANAGER', manager: me }, 'REJECTED', ctx.body?.comment))),

    // ---- Payroll: level 2, timesheet status, payroll months ---------------------------------------------
    route('GET', `${A}/payroll/approvals/counts`, ctx => run(ctx.mode, () => level2Counts(ctx.mode, roleParam(ctx.query)))),
    route('GET', `${A}/payroll/approvals/:requestType`, ctx => run(ctx.mode, () => level2Requests(ctx.mode, roleParam(ctx.query), typeParam(ctx.params), scopeParam(ctx.query)))),
    route('POST', `${A}/payroll/approvals/:requestType/:id/approve`, ctx => run(ctx.mode, () => decideRequest(ctx.mode, typeParam(ctx.params), ctx.params.id!, { role: roleParam(ctx.query) }, 'APPROVED', ctx.body?.comment))),
    route('POST', `${A}/payroll/approvals/:requestType/:id/reject`, ctx => run(ctx.mode, () => decideRequest(ctx.mode, typeParam(ctx.params), ctx.params.id!, { role: roleParam(ctx.query) }, 'REJECTED', ctx.body?.comment))),
    route('GET', `${A}/payroll/timesheet-status`, ctx => run(ctx.mode, () => timesheetStatusOrDefault(ctx))),
    route('GET', `${A}/payroll/months`, ctx => run(ctx.mode, () => payrollMonths(ctx.mode))),
    route('GET', `${A}/payroll/months/:month`, ctx => run(ctx.mode, () => payrollMonthStatus(ctx.mode, monthOrFail(ctx.params.month)))),
    route('POST', `${A}/payroll/months/:month/process`, ctx => run(ctx.mode, () => processPayrollMonth(ctx.mode, monthOrFail(ctx.params.month)))),
];
