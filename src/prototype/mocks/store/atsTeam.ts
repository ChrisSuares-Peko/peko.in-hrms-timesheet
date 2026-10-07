// PROTOTYPE-SETUP: ESS Service 1 — ESS - Manager "My team" (team today, timesheets, approvals), Payroll's
// level-2 queues (HR / Finance), the timesheet-status page, payroll months (process + blockers), the
// submission-day run and settings. Rules: src/prototype/rules/attendance.ts.
import type {
    ApprovalCounts,
    ApproverRole,
    AtsSettings,
    AttendanceCorrection,
    GridMarker,
    Level2Approver,
    Level2Role,
    OvertimeRequest,
    PayrollMonthStatus,
    QueueScope,
    RequestItem,
    SubmissionRunResult,
    TeamMonthSummary,
    TeamTodayView,
    TeamWeekGrid,
    TimesheetApprovalItem,
    TimesheetStatusView,
    TimesheetWeek,
    Weekday,
} from '@src/domains/attendanceTimesheet/types';
import {
    RuleError,
    WEEKDAYS,
    addMonths,
    awaiting,
    changeRequestBlockedReason,
    decide,
    diffEntries,
    diffSummary,
    displayTime,
    entryMinutes,
    formatDuration,
    isSubmissionDay,
    lockReasonFor,
    monthBounds,
    monthDates,
    monthLabel,
    payrollBlockers,
    teamTodayCounts,
    trailLabel,
    weekDates,
    weekStartOf,
    weeksDueForSubmission,
    weeksOverlappingMonth,
} from '@src/prototype/rules/attendance';

import { submitWeekRecord } from './atsEss';
import {
    atsChangeRequests,
    atsCorrections,
    atsOvertime,
    atsPayroll,
    atsSettings,
    atsWeeks,
    attendanceDay,
    currentMonth,
    dayLabel,
    employeesFor,
    firstUnprocessedMonth,
    getSettings,
    isDayLocked,
    isProcessed,
    lastMonth,
    loggedOn,
    managerRef,
    nowIso,
    overtimeContext,
    pendingChangeRequest,
    personRef,
    processedMonths,
    saveRecord,
    saveWeek,
    timesheetDay,
    today,
    weekOf,
    weeksSummary,
} from './atsStore';
import { actorOf } from '../data/ats-seed';
import { MockEmployee, findEmployee } from '../data/employees';
import type { DataMode } from '../envelope';

// ---- team ---------------------------------------------------------------------------------------------

export const teamOf = (mode: DataMode, manager: MockEmployee) =>
    employeesFor(mode).filter(e => e.managerEmployeeId === manager.employeeId);

export const assertManages = (manager: MockEmployee, employee: MockEmployee | undefined) => {
    if (!employee || employee.managerEmployeeId !== manager.employeeId) {
        throw new RuleError('You can only view and approve your direct reports.', 403);
    }
    return employee;
};

export const teamToday = (mode: DataMode, manager: MockEmployee): TeamTodayView => {
    const t = today();
    const rows = teamOf(mode, manager).map(e => {
        const d = attendanceDay(mode, e, t);
        return {
            employee: personRef(e),
            status: d.status,
            ...(d.label ? { label: d.label } : {}),
            checkIn: d.checkIn,
            checkOut: d.checkOut,
            minutesAtWork: d.minutesAtWork,
            loggedMinutesToday: loggedOn(mode, e, t),
        };
    });
    return { date: t, counts: teamTodayCounts(rows.map(r => r.status)), rows };
};

const markerFor = (status: string, date: string, logged: number, expected: number): GridMarker | undefined => {
    if (status === 'on-leave') return 'leave';
    if (status === 'holiday') return 'holiday';
    if (status === 'weekly-off') return 'off';
    if (date < today() && expected > 0 && logged === 0) return 'nothing-logged';
    return undefined;
};

export const teamWeekGrid = (mode: DataMode, manager: MockEmployee, weekStart: string): TeamWeekGrid => {
    const ws = weekStartOf(weekStart);
    const days = weekDates(ws);
    return {
        weekStart: ws,
        days,
        rows: teamOf(mode, manager).map(e => {
            const week = weekOf(mode, e, ws);
            const cells = days.map(date => {
                const d = timesheetDay(mode, e, date, week.entries);
                const marker = markerFor(d.attendance.status, date, d.loggedMinutes, d.expectedMinutes);
                return { date, loggedMinutes: d.loggedMinutes, ...(marker ? { marker } : {}), extraMinutes: d.attendance.overtimeMinutes };
            });
            return {
                employee: personRef(e),
                days: cells,
                totalMinutes: cells.reduce((s, c) => s + c.loggedMinutes, 0),
                extraMinutes: cells.reduce((s, c) => s + c.extraMinutes, 0),
                status: week.status,
                changePending: Boolean(pendingChangeRequest(mode, week)),
            };
        }),
    };
};

export const teamMonthSummary = (mode: DataMode, manager: MockEmployee, month: string): TeamMonthSummary => {
    const t = today();
    return {
        month,
        monthLabel: monthLabel(month),
        rows: teamOf(mode, manager).map(e => {
            const days = monthDates(month).map(date => timesheetDay(mode, e, date, weekOf(mode, e, weekStartOf(date)).entries));
            return {
                employee: personRef(e),
                loggedMinutes: days.reduce((s, d) => s + d.loggedMinutes, 0),
                daysNothingLogged: days.filter(d => d.date < t && d.expectedMinutes > 0 && d.loggedMinutes === 0).length,
                extraMinutes: days.reduce((s, d) => s + d.attendance.overtimeMinutes, 0),
                weeks: weeksSummary(mode, e, weeksOverlappingMonth(month)),
            };
        }),
    };
};

// ---- timesheet approvals (manager) -------------------------------------------------------------------

const weekItem = (mode: DataMode, e: MockEmployee, week: TimesheetWeek): TimesheetApprovalItem => {
    const days = weekDates(week.weekStart).map(d => timesheetDay(mode, e, d, week.entries));
    return {
        kind: 'TIMESHEET',
        id: week.id,
        weekId: week.id,
        weekStart: week.weekStart,
        employee: personRef(e),
        at: week.decision?.at ?? week.submittedAt ?? '',
        status: week.status,
        loggedMinutes: days.reduce((s, d) => s + d.loggedMinutes, 0),
        expectedMinutes: days.reduce((s, d) => s + d.expectedMinutes, 0),
        ...(week.decision?.comment ? { reason: week.decision.comment } : {}),
        waitingForYou: week.status === 'SUBMITTED',
    };
};

export const timesheetQueue = (mode: DataMode, manager: MockEmployee, scope: QueueScope): TimesheetApprovalItem[] => {
    const team = teamOf(mode, manager);
    const ids = new Set(team.map(e => e.id));
    const weeks = Object.values(atsWeeks.get(mode)).filter(w => ids.has(w.employeeId));
    const months = processedMonths(mode);
    const weekItems = weeks
        .filter(w => (scope === 'waiting' ? w.status === 'SUBMITTED' : w.status !== 'DRAFT'))
        .map(w => weekItem(mode, findEmployee(w.employeeId)!, w));
    const crItems = atsChangeRequests
        .get(mode)
        .filter(c => ids.has(c.employeeId) && (scope === 'all' || c.status === 'PENDING'))
        .map((c): TimesheetApprovalItem => {
            const e = findEmployee(c.employeeId)!;
            const ws = c.weekId.split(':')[1];
            const blocked = c.status === 'PENDING' ? changeRequestBlockedReason(c, months) : null;
            return {
                kind: 'CHANGE_REQUEST',
                id: c.id,
                weekId: c.weekId,
                weekStart: ws,
                employee: personRef(e),
                at: c.decision?.at ?? c.requestedAt,
                status: c.status,
                loggedMinutes: c.proposedEntries.reduce((s, x) => s + entryMinutes(x), 0),
                expectedMinutes: weekDates(ws).reduce((s, d) => s + timesheetDay(mode, e, d, []).expectedMinutes, 0),
                reason: c.reason,
                diffSummary: diffSummary(diffEntries(c.baseEntries, c.proposedEntries)),
                ...(blocked ? { blockedReason: blocked } : {}),
                waitingForYou: c.status === 'PENDING',
            };
        });
    return [...weekItems, ...crItems].sort((a, b) => Number(b.waitingForYou) - Number(a.waitingForYou) || b.at.localeCompare(a.at));
};

const memberWeek = (mode: DataMode, manager: MockEmployee, employeeId: number | string, weekStart: string) => {
    const e = assertManages(manager, findEmployee(employeeId));
    return { e, week: weekOf(mode, e, weekStartOf(weekStart)) };
};

export const approveWeek = (mode: DataMode, manager: MockEmployee, employeeId: string, weekStart: string, comment?: string) => {
    const { e, week } = memberWeek(mode, manager, employeeId, weekStart);
    if (week.status !== 'SUBMITTED') throw new RuleError('This week is no longer waiting for your approval — refresh the list.');
    const at = nowIso();
    const note = comment?.trim();
    saveWeek(mode, {
        ...week,
        status: 'APPROVED',
        approvedEntries: week.entries,
        decision: { by: actorOf(manager, 'MANAGER'), at, ...(note ? { comment: note } : {}) },
        history: [...week.history, { at, actor: actorOf(manager, 'MANAGER'), action: 'APPROVED', ...(note ? { detail: note } : {}) }],
    });
    return weekItem(mode, e, weekOf(mode, e, week.weekStart));
};

export const sendBackWeek = (mode: DataMode, manager: MockEmployee, employeeId: string, weekStart: string, comment?: string) => {
    const { e, week } = memberWeek(mode, manager, employeeId, weekStart);
    if (week.status !== 'SUBMITTED') throw new RuleError('This week is no longer waiting for your approval — refresh the list.');
    const note = comment?.trim();
    if (!note) throw new RuleError('Add a comment so they know what to fix.', 400);
    const at = nowIso();
    saveWeek(mode, {
        ...week,
        status: 'SENT_BACK',
        decision: { by: actorOf(manager, 'MANAGER'), at, comment: note },
        history: [...week.history, { at, actor: actorOf(manager, 'MANAGER'), action: 'SENT_BACK', detail: note }],
    });
    return weekItem(mode, e, weekOf(mode, e, week.weekStart));
};

const memberChangeRequest = (mode: DataMode, manager: MockEmployee, id: string) => {
    const cr = atsChangeRequests.get(mode).find(c => c.id === id);
    if (!cr) throw new RuleError('Change request not found.', 404);
    const e = assertManages(manager, findEmployee(cr.employeeId));
    if (cr.status !== 'PENDING') throw new RuleError('This change request has already been decided.');
    return { cr, e, week: weekOf(mode, e, cr.weekId.split(':')[1]) };
};

export const approveChangeRequest = (mode: DataMode, manager: MockEmployee, id: string, comment?: string) => {
    const { cr, e, week } = memberChangeRequest(mode, manager, id);
    const blocked = changeRequestBlockedReason(cr, processedMonths(mode));
    if (blocked) throw new RuleError(`Can't approve: ${blocked}`);
    const at = nowIso();
    const note = comment?.trim();
    const decision = { by: actorOf(manager, 'MANAGER'), at, ...(note ? { comment: note } : {}) };
    atsChangeRequests.update(mode, list => list.map(c => (c.id === id ? { ...c, status: 'APPROVED' as const, decision } : c)));
    saveWeek(mode, {
        ...week,
        entries: cr.proposedEntries,
        approvedEntries: cr.proposedEntries,
        pendingChangeRequestId: undefined,
        history: [...week.history, { at, actor: actorOf(manager, 'MANAGER'), action: 'CHANGE_APPROVED', ...(note ? { detail: note } : {}) }],
    });
    return weekItem(mode, e, weekOf(mode, e, week.weekStart));
};

export const rejectChangeRequest = (mode: DataMode, manager: MockEmployee, id: string, comment?: string) => {
    const { e, week } = memberChangeRequest(mode, manager, id);
    const note = comment?.trim();
    if (!note) throw new RuleError('Add a comment explaining why.', 400);
    const at = nowIso();
    const decision = { by: actorOf(manager, 'MANAGER'), at, comment: note };
    atsChangeRequests.update(mode, list => list.map(c => (c.id === id ? { ...c, status: 'REJECTED' as const, decision } : c)));
    saveWeek(mode, {
        ...week,
        pendingChangeRequestId: undefined,
        history: [...week.history, { at, actor: actorOf(manager, 'MANAGER'), action: 'CHANGE_REJECTED', detail: note }],
    });
    return weekItem(mode, e, weekOf(mode, e, week.weekStart));
};

// ---- attendance & overtime requests (manager and level 2) ---------------------------------------------

export type RequestType = 'attendance' | 'overtime';

const correctionItem = (mode: DataMode, c: AttendanceCorrection, viewer: ApproverRole): RequestItem | null => {
    const e = findEmployee(c.employeeId);
    if (!e) return null;
    const what = c.kind === 'update-check-out' ? 'Update check-out' : 'Attendance correction';
    const fmt = (v: string | null) => (v ? displayTime(v) : '—');
    const changes = [
        c.requested.checkIn !== c.current.checkIn && `Check-in ${fmt(c.current.checkIn)} → ${fmt(c.requested.checkIn)}`,
        c.requested.checkOut !== c.current.checkOut && `Check-out ${fmt(c.current.checkOut)}${c.current.checkOutAuto ? ' (auto)' : ''} → ${fmt(c.requested.checkOut)}`,
    ].filter(Boolean);
    const blocked = c.trail.status.startsWith('PENDING') && isDayLocked(mode, c.date) ? lockReasonFor(c.date) : undefined;
    return {
        type: 'attendance',
        id: c.id,
        employee: personRef(e),
        manager: managerRef(e),
        title: `${what} · ${dayLabel(c.date)}`,
        detail: changes.join(' · ') || 'No time change',
        notes: c.reason,
        at: c.createdAt,
        trail: c.trail,
        statusLabel: trailLabel(c.trail),
        correction: { kind: c.kind, current: c.current, requested: c.requested },
        ...(blocked ? { blockedReason: blocked } : {}),
        waitingForYou: awaiting(c.trail) === viewer,
    };
};

const overtimeItem = (mode: DataMode, o: OvertimeRequest, viewer: ApproverRole): RequestItem | null => {
    const e = findEmployee(o.employeeId);
    if (!e) return null;
    return {
        type: 'overtime',
        id: o.id,
        employee: personRef(e),
        manager: managerRef(e),
        title: `${o.kind === 'planned' ? 'Planned' : 'Worked'} overtime · ${formatDuration(o.minutes)} on ${dayLabel(o.date)}`,
        detail: o.description,
        at: o.createdAt,
        trail: o.trail,
        statusLabel: trailLabel(o.trail),
        overtimeContext: overtimeContext(mode, e, o.date),
        waitingForYou: awaiting(o.trail) === viewer,
    };
};

const allRequests = (mode: DataMode, type: RequestType, viewer: ApproverRole): RequestItem[] =>
    (type === 'attendance'
        ? atsCorrections.get(mode).map(c => correctionItem(mode, c, viewer))
        : atsOvertime.get(mode).map(o => overtimeItem(mode, o, viewer))
    ).filter((x): x is RequestItem => x !== null);

const byWaitingThenNewest = (a: RequestItem, b: RequestItem) =>
    Number(b.waitingForYou) - Number(a.waitingForYou) || b.at.localeCompare(a.at);

export const teamRequests = (mode: DataMode, manager: MockEmployee, type: RequestType, scope: QueueScope) => {
    const ids = new Set(teamOf(mode, manager).map(e => e.id));
    return allRequests(mode, type, 'MANAGER')
        .filter(r => ids.has(r.employee.id) && r.trail.status !== 'CANCELLED')
        .filter(r => scope === 'all' || r.waitingForYou)
        .sort(byWaitingThenNewest);
};

export const teamApprovalCounts = (mode: DataMode, manager: MockEmployee): ApprovalCounts => {
    const queue = timesheetQueue(mode, manager, 'waiting');
    return {
        timesheets: queue.filter(i => i.kind === 'TIMESHEET').length,
        changeRequests: queue.filter(i => i.kind === 'CHANGE_REQUEST').length,
        attendance: teamRequests(mode, manager, 'attendance', 'waiting').length,
        overtime: teamRequests(mode, manager, 'overtime', 'waiting').length,
    };
};

/** Level 2 (HR / Finance): requests whose chain includes that role. */
export const level2Requests = (mode: DataMode, role: Level2Role, type: RequestType, scope: QueueScope) =>
    allRequests(mode, type, role)
        .filter(r => r.trail.steps.some(s => s.role === role) && r.trail.status !== 'CANCELLED')
        .filter(r => scope === 'all' || r.waitingForYou)
        .sort(byWaitingThenNewest);

export const level2Counts = (mode: DataMode, role: Level2Role) => ({
    attendance: level2Requests(mode, role, 'attendance', 'waiting').length,
    overtime: level2Requests(mode, role, 'overtime', 'waiting').length,
});

/** Approve / reject at the level the request is waiting for. A fully approved correction updates attendance. */
export const decideRequest = (
    mode: DataMode,
    type: RequestType,
    id: string,
    actor: { role: 'MANAGER'; manager: MockEmployee } | { role: Level2Role },
    decision: 'APPROVED' | 'REJECTED',
    comment?: string
): RequestItem => {
    const at = nowIso();
    if (type === 'attendance') {
        const c = atsCorrections.get(mode).find(x => x.id === id);
        if (!c) throw new RuleError('Request not found.', 404);
        if (actor.role === 'MANAGER') assertManages(actor.manager, findEmployee(c.employeeId));
        if (decision === 'APPROVED' && isDayLocked(mode, c.date)) throw new RuleError(`Can't approve: ${lockReasonFor(c.date)}`);
        const trail = decide(c.trail, actor.role, decision, comment, at);
        atsCorrections.update(mode, list => list.map(x => (x.id === id ? { ...x, trail, updatedAt: at } : x)));
        if (trail.status === 'APPROVED') {
            saveRecord(mode, { employeeId: c.employeeId, date: c.date, checkIn: c.requested.checkIn, checkOut: c.requested.checkOut, source: 'correction' });
        }
        return correctionItem(mode, { ...c, trail }, actor.role)!;
    }
    const o = atsOvertime.get(mode).find(x => x.id === id);
    if (!o) throw new RuleError('Request not found.', 404);
    if (actor.role === 'MANAGER') assertManages(actor.manager, findEmployee(o.employeeId));
    if (decision === 'APPROVED' && isDayLocked(mode, o.date)) throw new RuleError(`Can't approve: ${lockReasonFor(o.date)}`);
    const trail = decide(o.trail, actor.role, decision, comment, at);
    atsOvertime.update(mode, list => list.map(x => (x.id === id ? { ...x, trail, updatedAt: at } : x)));
    return overtimeItem(mode, { ...o, trail }, actor.role)!;
};

// ---- payroll months & timesheet status ------------------------------------------------------------------

const blockersFor = (mode: DataMode, month: string) => {
    const settings = getSettings(mode);
    return payrollBlockers({
        month,
        approvalEnabled: settings.timesheetApproval.enabled && settings.mode !== 'attendance',
        employees: employeesFor(mode),
        statusOf: (id, ws) => weekOf(mode, findEmployee(id)!, ws).status,
    }).map(b => ({ employee: personRef(b.employee), manager: managerRef(b.employee), weekStart: b.weekStart, status: b.status }));
};

export const payrollMonthStatus = (mode: DataMode, month: string): PayrollMonthStatus => {
    const settings = getSettings(mode);
    const processed = isProcessed(mode, month);
    const blockers = processed ? [] : blockersFor(mode, month);
    const processedAt = atsPayroll.get(mode).processed[month];
    return {
        month,
        monthLabel: monthLabel(month),
        processed,
        ...(processedAt ? { processedAt } : {}),
        canProcess: !processed && !blockers.length && month === firstUnprocessedMonth(mode),
        blockers,
        approvalEnabled: settings.timesheetApproval.enabled && settings.mode !== 'attendance',
    };
};

export const payrollMonths = (mode: DataMode) =>
    [addMonths(currentMonth(), -2), lastMonth(), currentMonth()].map(m => payrollMonthStatus(mode, m));

export const processPayrollMonth = (mode: DataMode, month: string) => {
    const status = payrollMonthStatus(mode, month);
    if (status.processed) throw new RuleError(`Payroll for ${status.monthLabel} has already been processed.`);
    const first = firstUnprocessedMonth(mode);
    if (month !== first) throw new RuleError(`Process ${monthLabel(first)} first.`);
    if (status.blockers.length) {
        const people = new Set(status.blockers.map(b => b.employee.name));
        throw new RuleError(
            `Payroll for ${status.monthLabel} can't be processed yet: ${status.blockers.length} timesheet week${status.blockers.length === 1 ? '' : 's'} of ${people.size} employee${people.size === 1 ? '' : 's'} not approved.`
        );
    }
    atsPayroll.update(mode, p => ({ ...p, processed: { ...p.processed, [month]: nowIso() } }));
    return payrollMonthStatus(mode, month);
};

export const timesheetStatusView = (mode: DataMode, month: string): TimesheetStatusView => {
    const settings = getSettings(mode);
    const approvalEnabled = settings.timesheetApproval.enabled && settings.mode !== 'attendance';
    const weeks = weeksOverlappingMonth(month);
    const { last } = monthBounds(month);
    const rows = employeesFor(mode)
        .filter(e => e.dateOfJoin <= last)
        .map(e => ({ employee: personRef(e), manager: managerRef(e), weeks: weeksSummary(mode, e, weeks) }));
    const weekCounts: TimesheetStatusView['weekCounts'] = { DRAFT: 0, SUBMITTED: 0, APPROVED: 0, SENT_BACK: 0, CHANGE_PENDING: 0 };
    rows.forEach(r =>
        r.weeks.forEach(w => {
            weekCounts[w.status] += 1;
            if (w.changePending) weekCounts.CHANGE_PENDING += 1;
        })
    );
    const notApproved = rows.filter(r => r.weeks.some(w => w.status !== 'APPROVED'));
    const status = payrollMonthStatus(mode, month);
    return {
        month,
        monthLabel: monthLabel(month),
        approvalEnabled,
        processed: status.processed,
        payrollBlocked: !status.processed && status.blockers.length > 0,
        employeesTotal: rows.length,
        employeesApproved: rows.length - notApproved.length,
        weekCounts,
        notApproved: notApproved.map(r => ({ ...r, weeks: r.weeks.filter(w => w.status !== 'APPROVED') })),
        availableMonths: [currentMonth(), lastMonth(), addMonths(currentMonth(), -2)].map(m => ({ month: m, label: monthLabel(m), processed: isProcessed(mode, m) })),
    };
};

// ---- submission day ---------------------------------------------------------------------------------------

/** Every open (Draft) week up to this one goes to the manager; the CEO's are auto-approved. */
export const runSubmissionDay = (mode: DataMode): SubmissionRunResult => {
    const settings = getSettings(mode);
    const result: SubmissionRunResult = { submissionWeekday: settings.timesheetApproval.submissionWeekday, submitted: [] };
    if (!settings.timesheetApproval.enabled || settings.mode === 'attendance') return result;
    const t = today();
    const thisWeek = weekStartOf(t);
    employeesFor(mode).forEach(e => {
        const stored = Object.values(atsWeeks.get(mode)).filter(w => w.employeeId === e.id);
        const withCurrent = stored.some(w => w.weekStart === thisWeek) ? stored : [...stored, weekOf(mode, e, thisWeek)];
        weeksDueForSubmission(withCurrent, t)
            .filter(w => !weekDates(w.weekStart).every(d => isDayLocked(mode, d)))
            .forEach(w => {
                const next = submitWeekRecord(w, e, true);
                saveWeek(mode, next);
                result.submitted.push({ employeeId: e.id, name: e.fullName, weekStart: w.weekStart, ...(next.status === 'APPROVED' ? { autoApproved: true } : {}) });
            });
    });
    atsPayroll.update(mode, p => ({ ...p, lastSubmissionRun: t }));
    return result;
};

/** On the real submission weekday, run once per day the first time anything is read. */
export const autoRunSubmissionDay = (mode: DataMode) => {
    const t = today();
    if (atsPayroll.get(mode).lastSubmissionRun === t) return;
    if (!isSubmissionDay(t, getSettings(mode))) return;
    runSubmissionDay(mode);
};

// ---- settings ---------------------------------------------------------------------------------------------

const MODES = ['attendance', 'both', 'timesheet'] as const;
const L2: Level2Approver[] = ['HR', 'FINANCE', 'NONE'];
const HHMM = /^\d{2}:\d{2}$/;
const int = (v: unknown, min: number, max: number, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback;
};

export const updateSettings = (mode: DataMode, body: Partial<AtsSettings> | undefined): AtsSettings => {
    const cur = getSettings(mode);
    const b = body ?? {};
    const start = HHMM.test(b.shift?.start ?? '') ? b.shift!.start : cur.shift.start;
    const end = HHMM.test(b.shift?.end ?? '') ? b.shift!.end : cur.shift.end;
    if (end <= start) throw new RuleError('Shift end must be after the start.', 400);
    const weekday = (v: unknown, fallback: Weekday) => (WEEKDAYS.includes(v as Weekday) ? (v as Weekday) : fallback);
    const l2 = (k: 'attendance' | 'overtime' | 'leave' | 'reimbursement') =>
        L2.includes(b.level2?.[k] as Level2Approver) ? (b.level2![k] as Level2Approver) : cur.level2[k];
    const next: AtsSettings = {
        mode: MODES.includes(b.mode as (typeof MODES)[number]) ? (b.mode as AtsSettings['mode']) : cur.mode,
        shift: { start, end },
        breakMinutes: int(b.breakMinutes, 0, 180, cur.breakMinutes),
        graceMinutes: int(b.graceMinutes, 0, 120, cur.graceMinutes),
        halfDayThresholdMinutes: int(b.halfDayThresholdMinutes, 60, 600, cur.halfDayThresholdMinutes),
        overtimeMinimumMinutes: int(b.overtimeMinimumMinutes, 0, 600, cur.overtimeMinimumMinutes),
        weeklyOff: Array.isArray(b.weeklyOff) ? b.weeklyOff.filter(d => WEEKDAYS.includes(d)) : cur.weeklyOff,
        timesheetApproval: {
            enabled: typeof b.timesheetApproval?.enabled === 'boolean' ? b.timesheetApproval.enabled : cur.timesheetApproval.enabled,
            submissionWeekday: weekday(b.timesheetApproval?.submissionWeekday, cur.timesheetApproval.submissionWeekday),
        },
        level2: { attendance: l2('attendance'), overtime: l2('overtime'), leave: l2('leave'), reimbursement: l2('reimbursement'), timesheet: 'NONE' },
        updatedAt: nowIso(),
    };
    atsSettings.set(mode, next);
    return next;
};

