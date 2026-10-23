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
    cancelCorrection,
    cancelOvertime,
    checkIn,
    checkOut,
    checkOutPrevious,
    setWorkingFrom,
    correctionsView,
    createCorrection,
    endBreak,
    startBreak,
    updateBreakDescription,
    updateTodayBreaks,
    createOvertime,
    deleteEntry,
    editEntry,
    overtimeViewOf,
    overviewOf,
    submitWeek,
    timesheetMonthOf,
    timesheetNoticesOf,
    timesheetPeriodsOf,
} from '../store/atsEss';
import { homeOf } from '../store/atsHome';
import { createLeaveRequest, leaveViewOf, setEmployeeLife, withdrawLeaveRequest } from '../store/atsLeave';
import { createProfileRequest, myProfileOf, withdrawProfileRequest } from '../store/atsProfile';
import { currentMonth, getSettings, overtimeContext, resetTodayCheckIn, today, weekView } from '../store/atsStore';
import {
    RequestType,
    approveWeek,
    assertManages,
    autoRunSubmissionDay,
    decideRequest,
    level2Counts,
    level2Requests,
    payrollMonthStatus,
    payrollMonths,
    processPayrollMonth,
    runSubmissionDay,
    sendBackWeek,
    teamApprovalCounts,
    teamMonthSummary,
    teamRequests,
    teamToday,
    teamWeekGrid,
    payrollApproveWeek,
    payrollSendBackWeek,
    payrollTimesheetQueue,
    payrollWeekView,
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
    if (q.role === 'HR' || q.role === 'FINANCE' || q.role === 'PAYROLL' || q.role === 'ADMIN') return q.role;
    throw fail(400, 'role must be HR, FINANCE, PAYROLL or ADMIN');
};
/** PROTOTYPE-SETUP (Final batch, Slice 1): leave and reimbursements go through the manager too. */
const typeParam = (p: MockContext['params']): RequestType => {
    const t = p.requestType;
    if (t === 'attendance' || t === 'overtime' || t === 'leave' || t === 'reimbursement') return t;
    throw fail(404, 'Unknown request type');
};
/** PROTOTYPE-SETUP (Overview, Slice 1): level 2 also handles profile updates (HR only). */
const level2TypeParam = (p: MockContext['params']): RequestType =>
    p.requestType === 'profile' ? 'profile' : typeParam(p);

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
    // PROTOTYPE-SETUP (Final batch, Slice 1): "Run auto-submit now".
    route('POST', `${A}/demo/simulate-submission-day`, ctx => run(ctx.mode, () => runSubmissionDay(ctx.mode))),
    route('POST', `${A}/demo/run-auto-submit`, ctx => run(ctx.mode, () => runSubmissionDay(ctx.mode))),
    route('PUT', `${A}/demo/employee-life`, ess((ctx, me) => setEmployeeLife(ctx.mode, me, ctx.body))),
    route('POST', `${A}/demo/reset-today-check-in`, ctx => run(ctx.mode, () => resetTodayCheckIn(ctx.mode))),

    // ---- ESS: overview, check-in / out, attendance ------------------------------------------------------
    route('GET', `${A}/overview`, ess((ctx, me) => overviewOf(ctx.mode, me))),
    // PROTOTYPE-SETUP (Overview, Slice 3): the Overview's table, notifications and shortcut summaries.
    route('GET', `${A}/home`, ess((ctx, me) => homeOf(ctx.mode, me))),
    route('POST', `${A}/check-in`, ess((ctx, me) => checkIn(ctx.mode, me))),
    route('POST', `${A}/check-out`, ess((ctx, me) => checkOut(ctx.mode, me))),
    // PROTOTYPE-SETUP (HR rules, Slice 1): check out of an earlier day still open (now, with outDays), and breaks.
    route('POST', `${A}/check-out/previous`, ess((ctx, me) => checkOutPrevious(ctx.mode, me))),
    // PROTOTYPE-SETUP (Final batch, Slice 2): Attendance only mode — where they're working from.
    route('PUT', `${A}/working-from`, ess((ctx, me) => setWorkingFrom(ctx.mode, me, ctx.body))),
    route('POST', `${A}/breaks/start`, ess((ctx, me) => startBreak(ctx.mode, me))),
    route('POST', `${A}/breaks/end`, ess((ctx, me) => endBreak(ctx.mode, me))),
    route('PUT', `${A}/breaks`, ess((ctx, me) => updateTodayBreaks(ctx.mode, me, ctx.body))),
    route('PUT', `${A}/attendance/:date/breaks/:index`, ess((ctx, me) => updateBreakDescription(ctx.mode, me, ctx.params.date!, Number(ctx.params.index), ctx.body))),
    route('GET', `${A}/attendance`, ess((ctx, me) => attendanceMonthOf(ctx.mode, me, monthParam(ctx.query), { overtimeAtMinimum: true }))),
    route('GET', `${A}/corrections`, ess((ctx, me) => correctionsView(ctx.mode, me))),
    route('POST', `${A}/corrections`, ess((ctx, me) => createCorrection(ctx.mode, me, ctx.body))),
    route('POST', `${A}/corrections/:id/cancel`, ess((ctx, me) => cancelCorrection(ctx.mode, me, ctx.params.id!))),

    // ---- ESS: my profile (PROTOTYPE-SETUP: Overview, Slice 1) ---------------------------------------------
    route('GET', `${A}/profile`, ess((ctx, me) => myProfileOf(ctx.mode, me))),
    route('POST', `${A}/profile/update-request`, ess((ctx, me) => createProfileRequest(ctx.mode, me, ctx.body))),
    route('POST', `${A}/profile/update-request/:id/withdraw`, ess((ctx, me) => withdrawProfileRequest(ctx.mode, me, ctx.params.id!))),

    // ---- ESS: timesheet ---------------------------------------------------------------------------------
    // PROTOTYPE-SETUP (Overview v2, Slice 2): ?date= may be any day of the week (as documented) — use its Monday.
    route('GET', `${A}/timesheet/week`, ess((ctx, me) => weekView(ctx.mode, me, dateParam(ctx.query)))),
    // PROTOTYPE-SETUP (Timesheet filing): the filing periods covering a date range (the Timesheet tab's Day / Week / Month).
    route('GET', `${A}/timesheet/periods`, ess((ctx, me) => timesheetPeriodsOf(ctx.mode, me, String(ctx.query.from ?? ''), String(ctx.query.to ?? '')))),
    route('GET', `${A}/timesheet/month`, ess((ctx, me) => timesheetMonthOf(ctx.mode, me, monthParam(ctx.query)))),
    // PROTOTYPE-SETUP (HR rules, Slice 3): the Notices panel's "Needs your action", across all weeks.
    route('GET', `${A}/timesheet/notices`, ess((ctx, me) => timesheetNoticesOf(ctx.mode, me))),
    route('POST', `${A}/timesheet/entries`, ess((ctx, me) => addEntry(ctx.mode, me, ctx.body))),
    route('PUT', `${A}/timesheet/entries/:entryId`, ess((ctx, me) => editEntry(ctx.mode, me, ctx.params.entryId!, ctx.body))),
    route('DELETE', `${A}/timesheet/entries/:entryId`, ess((ctx, me) => deleteEntry(ctx.mode, me, ctx.params.entryId!))),
    route('POST', `${A}/timesheet/weeks/:weekStart/submit`, ess((ctx, me) => submitWeek(ctx.mode, me, ctx.params.weekStart!, ctx.body))),

    // ---- ESS: leave (PROTOTYPE-SETUP: Final batch, Slice 1) ----------------------------------------------
    route('GET', `${A}/leave`, ess((ctx, me) => leaveViewOf(ctx.mode, me))),
    route('POST', `${A}/leave/requests`, ess((ctx, me) => createLeaveRequest(ctx.mode, me, ctx.body))),
    route('POST', `${A}/leave/requests/:id/withdraw`, ess((ctx, me) => withdrawLeaveRequest(ctx.mode, me, ctx.params.id!))),

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
    route('GET', `${A}/team/approvals/requests/:requestType`, ess((ctx, me) => teamRequests(ctx.mode, me, typeParam(ctx.params), scopeParam(ctx.query)))),
    route('POST', `${A}/team/approvals/requests/:requestType/:id/approve`, ess((ctx, me) => decideRequest(ctx.mode, typeParam(ctx.params), ctx.params.id!, { role: 'MANAGER', manager: me }, 'APPROVED', ctx.body?.comment))),
    route('POST', `${A}/team/approvals/requests/:requestType/:id/reject`, ess((ctx, me) => decideRequest(ctx.mode, typeParam(ctx.params), ctx.params.id!, { role: 'MANAGER', manager: me }, 'REJECTED', ctx.body?.comment))),

    // ---- Payroll: level 2, timesheet status, payroll months ---------------------------------------------
    route('GET', `${A}/payroll/approvals/counts`, ctx => run(ctx.mode, () => level2Counts(ctx.mode, roleParam(ctx.query)))),
    route('GET', `${A}/payroll/approvals/:requestType`, ctx => run(ctx.mode, () => level2Requests(ctx.mode, roleParam(ctx.query), level2TypeParam(ctx.params), scopeParam(ctx.query)))),
    route('POST', `${A}/payroll/approvals/:requestType/:id/approve`, ctx => run(ctx.mode, () => decideRequest(ctx.mode, level2TypeParam(ctx.params), ctx.params.id!, { role: roleParam(ctx.query) }, 'APPROVED', ctx.body?.comment))),
    route('POST', `${A}/payroll/approvals/:requestType/:id/reject`, ctx => run(ctx.mode, () => decideRequest(ctx.mode, level2TypeParam(ctx.params), ctx.params.id!, { role: roleParam(ctx.query) }, 'REJECTED', ctx.body?.comment))),
    route('GET', `${A}/payroll/timesheet-status`, ctx => run(ctx.mode, () => timesheetStatusOrDefault(ctx))),
    // PROTOTYPE-SETUP (Final batch, Slice 1): timesheets at level 2 — Payroll's final approval.
    route('GET', `${A}/payroll/timesheets`, ctx => run(ctx.mode, () => payrollTimesheetQueue(ctx.mode, scopeParam(ctx.query)))),
    route('GET', `${A}/payroll/timesheets/:employeeId/week`, ctx => run(ctx.mode, () => payrollWeekView(ctx.mode, ctx.params.employeeId!, dateParam(ctx.query)))),
    route('POST', `${A}/payroll/timesheets/:employeeId/:weekStart/approve`, ctx => run(ctx.mode, () => payrollApproveWeek(ctx.mode, ctx.params.employeeId!, ctx.params.weekStart!, ctx.body?.comment))),
    route('POST', `${A}/payroll/timesheets/:employeeId/:weekStart/send-back`, ctx => run(ctx.mode, () => payrollSendBackWeek(ctx.mode, ctx.params.employeeId!, ctx.params.weekStart!, ctx.body?.comment))),
    route('GET', `${A}/payroll/months`, ctx => run(ctx.mode, () => payrollMonths(ctx.mode))),
    route('GET', `${A}/payroll/months/:month`, ctx => run(ctx.mode, () => payrollMonthStatus(ctx.mode, monthOrFail(ctx.params.month)))),
    route('POST', `${A}/payroll/months/:month/process`, ctx => run(ctx.mode, () => processPayrollMonth(ctx.mode, monthOrFail(ctx.params.month)))),
];
