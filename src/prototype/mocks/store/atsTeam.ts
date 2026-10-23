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
    ProfileUpdateRequest,
    QueueScope,
    RequestItem,
    SubmissionRunResult,
    TeamMonthSummary,
    TeamTodayView,
    LeavePolicy,
    LeaveRequest,
    TeamWeekGrid,
    TimesheetApprovalItem,
    TimesheetFilingSettings,
    TimesheetStatus,
    TimesheetStatusView,
    TimesheetWeek,
    Weekday,
} from '@src/domains/attendanceTimesheet/types';
import {
    RuleError,
    WEEKDAYS,
    addDays,
    addMonths,
    awaiting,
    decide,
    diffEntries,
    diffSummary,
    displayTime,
    displayTimeOn,
    formatDuration,
    PROJECT_CODE_RE,
    filingFieldsError,
    hasTimesheets,
    lockReasonFor,
    monthBounds,
    monthDates,
    monthLabel,
    normaliseProjectCode,
    payrollBlockers,
    profileChangeSummary,
    teamTodayCounts,
    trailLabel,
    weekDates,
    weekStartOf,
} from '@src/prototype/rules/attendance';
import { LEAVE_LABEL, LEAVE_TYPES } from '@src/prototype/rules/leavePolicy';
import { afterManagerApproval, isAutoSubmitDue, periodEndOf, periodsDueForSubmission } from '@src/prototype/rules/timesheetFiling';

import { autoSubmitNote, submitWeekRecord, timesheetMonthOf } from './atsEss';
import { applyApprovedProfile, atsProfileRequests } from './atsProfile';
import { StoredClaim, atsLeaveRequests, atsReimbursements } from './atsRequests';
import {
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
    periodDates,
    periodsBetween,
    recordOf,
    personRef,
    regroupDrafts,
    storedPeriodsOf,
    saveRecord,
    saveWeek,
    editedAfterSending,
    entriesOn,
    nowMinutes,
    timesheetDay,
    weekView,
    today,
    weekOf,
    weeksSummary,
} from './atsStore';
import { actorOf } from '../data/ats-seed';
import { MockEmployee, findEmployee, managerOf } from '../data/employees';
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

/**
 * PROTOTYPE-SETUP (Timesheet filing): one status for the filing periods a calendar week touches (daily filing: up to
 * seven) — the one that needs attention first: sent back, then draft, then submitted, else approved.
 */
const combinedStatus = (statuses: TimesheetStatus[]): TimesheetStatus =>
    (['SENT_BACK', 'DRAFT', 'SUBMITTED'] as TimesheetStatus[]).find(x => statuses.includes(x)) ?? 'APPROVED';

export const teamWeekGrid = (mode: DataMode, manager: MockEmployee, weekStart: string): TeamWeekGrid => {
    const ws = weekStartOf(weekStart);
    const days = weekDates(ws);
    return {
        weekStart: ws,
        days,
        rows: teamOf(mode, manager).map(e => {
            const periods = periodsBetween(mode, e, ws, days[6]);
            const cells = days.map(date => {
                const d = timesheetDay(mode, e, date, entriesOn(mode, e, date));
                const marker = markerFor(d.attendance.status, date, d.loggedMinutes, d.expectedMinutes);
                return { date, loggedMinutes: d.loggedMinutes, ...(marker ? { marker } : {}), extraMinutes: d.attendance.overtimeMinutes };
            });
            return {
                employee: personRef(e),
                days: cells,
                totalMinutes: cells.reduce((s, c) => s + c.loggedMinutes, 0),
                extraMinutes: cells.reduce((s, c) => s + c.extraMinutes, 0),
                status: combinedStatus(periods.map(w => w.status)),
                changePending: periods.some(editedAfterSending),
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
            const days = monthDates(month).map(date => timesheetDay(mode, e, date, entriesOn(mode, e, date)));
            return {
                employee: personRef(e),
                loggedMinutes: days.reduce((s, d) => s + d.loggedMinutes, 0),
                daysNothingLogged: days.filter(d => d.date < t && d.expectedMinutes > 0 && d.loggedMinutes === 0).length,
                extraMinutes: days.reduce((s, d) => s + d.attendance.overtimeMinutes, 0),
                weeks: weeksSummary(mode, e, month),
            };
        }),
    };
};

// ---- timesheet approvals (manager) -------------------------------------------------------------------

const weekItem = (mode: DataMode, e: MockEmployee, week: TimesheetWeek, viewer: 'MANAGER' | 'PAYROLL' = 'MANAGER'): TimesheetApprovalItem => {
    const days = periodDates(week).map(d => timesheetDay(mode, e, d, week.entries));
    const edited = week.baselineEntries && week.editedAfter ? diffEntries(week.baselineEntries, week.entries) : null;
    return {
        kind: 'TIMESHEET',
        id: week.id,
        weekId: week.id,
        weekStart: week.weekStart,
        periodEnd: periodEndOf(week),
        employee: personRef(e),
        at: week.decision?.at ?? week.submittedAt ?? '',
        status: week.status,
        loggedMinutes: days.reduce((s, d) => s + d.loggedMinutes, 0),
        expectedMinutes: days.reduce((s, d) => s + d.expectedMinutes, 0),
        ...(week.decision?.comment ? { reason: week.decision.comment } : {}),
        // PROTOTYPE-SETUP (Final batch, Slice 1): edited after it was sent / approved — "What changed".
        ...(edited ? { editedAfter: week.editedAfter, diffSummary: diffSummary(edited) } : {}),
        ...(week.managerDecision ? { approvedBy: week.managerDecision.by.name } : {}),
        waitingForYou: viewer === 'MANAGER' ? week.status === 'SUBMITTED' : week.status === 'WITH_PAYROLL',
    };
};

/** The manager's timesheet queue: waiting = with the manager; all = everything that has been sent. */
export const timesheetQueue = (mode: DataMode, manager: MockEmployee, scope: QueueScope): TimesheetApprovalItem[] => {
    const team = teamOf(mode, manager);
    const ids = new Set(team.map(e => e.id));
    return Object.values(atsWeeks.get(mode))
        .filter(w => ids.has(w.employeeId))
        .filter(w => (scope === 'waiting' ? w.status === 'SUBMITTED' : w.status !== 'DRAFT' || Boolean(w.submittedAt)))
        .map(w => weekItem(mode, findEmployee(w.employeeId)!, w))
        .sort((a, b) => Number(b.waitingForYou) - Number(a.waitingForYou) || b.at.localeCompare(a.at));
};

const memberWeek = (mode: DataMode, manager: MockEmployee, employeeId: number | string, weekStart: string) => {
    const e = assertManages(manager, findEmployee(employeeId));
    return { e, week: weekOf(mode, e, weekStart) };
};

const NOT_WAITING = 'This timesheet is no longer waiting for your approval — refresh the list.';

/**
 * PROTOTYPE-SETUP (Final batch, Slice 1): the manager approves → on to Payroll (level 2), or approved when the company
 * has no level 2 for timesheets.
 */
export const approveWeek = (mode: DataMode, manager: MockEmployee, employeeId: string, weekStart: string, comment?: string) => {
    const { e, week } = memberWeek(mode, manager, employeeId, weekStart);
    if (week.status !== 'SUBMITTED') throw new RuleError(NOT_WAITING);
    const at = nowIso();
    const note = comment?.trim();
    const decision = { by: actorOf(manager, 'MANAGER'), at, ...(note ? { comment: note } : {}) };
    const next = afterManagerApproval(getSettings(mode).level2.timesheet);
    saveWeek(mode, {
        ...week,
        status: next,
        managerDecision: decision,
        decision,
        ...(next === 'APPROVED' ? { approvedEntries: week.entries, baselineEntries: null, editedAfter: undefined } : {}),
        history: [...week.history, { at, actor: actorOf(manager, 'MANAGER'), action: 'APPROVED', detail: `${next === 'APPROVED' ? 'Approved' : 'Approved, sent to Payroll'}${note ? ` — ${note}` : ''}` }],
    });
    return weekItem(mode, e, weekOf(mode, e, week.weekStart));
};

export const sendBackWeek = (mode: DataMode, manager: MockEmployee, employeeId: string, weekStart: string, comment?: string) => {
    const { e, week } = memberWeek(mode, manager, employeeId, weekStart);
    if (week.status !== 'SUBMITTED') throw new RuleError(NOT_WAITING);
    const note = comment?.trim();
    if (!note) throw new RuleError('Add a short note so the employee knows what to fix.', 400);
    const at = nowIso();
    saveWeek(mode, {
        ...week,
        status: 'SENT_BACK',
        sentBackBy: 'MANAGER',
        decision: { by: actorOf(manager, 'MANAGER'), at, comment: note },
        history: [...week.history, { at, actor: actorOf(manager, 'MANAGER'), action: 'SENT_BACK', detail: `Sent back: ${note}` }],
    });
    return weekItem(mode, e, weekOf(mode, e, week.weekStart));
};

// ---- timesheets at level 2: Payroll (PROTOTYPE-SETUP: Final batch, Slice 1) ------------------------------

const PAYROLL_ACTOR = { id: null, name: 'Payroll team', role: 'HR' as const };

/** "Timesheets waiting for Payroll" (waiting) or every timesheet that has reached Payroll (all). */
export const payrollTimesheetQueue = (mode: DataMode, scope: QueueScope): TimesheetApprovalItem[] =>
    Object.values(atsWeeks.get(mode))
        .filter(w => (scope === 'waiting' ? w.status === 'WITH_PAYROLL' : w.status === 'WITH_PAYROLL' || Boolean(w.managerDecision) || (w.status === 'APPROVED' && !managerOf(findEmployee(w.employeeId)!))))
        .map(w => weekItem(mode, findEmployee(w.employeeId)!, w, 'PAYROLL'))
        .sort((a, b) => Number(b.waitingForYou) - Number(a.waitingForYou) || b.at.localeCompare(a.at));

/** The period Payroll is reviewing (read-only; no manager check). */
export const payrollWeekView = (mode: DataMode, employeeId: string | number, date: string) => {
    const e = findEmployee(employeeId);
    if (!e) throw new RuleError('Employee not found.', 404);
    return weekView(mode, e, date, { readOnly: true });
};

/** PROTOTYPE-SETUP (Final batch, Slice 4): the month view for Payroll's review screen. */
export const payrollMonthView = (mode: DataMode, employeeId: string | number, month: string) => {
    const e = findEmployee(employeeId);
    if (!e) throw new RuleError('Employee not found.', 404);
    return timesheetMonthOf(mode, e, month);
};

const payrollWeek = (mode: DataMode, employeeId: string, weekStart: string) => {
    const e = findEmployee(employeeId);
    if (!e) throw new RuleError('Employee not found.', 404);
    const week = weekOf(mode, e, weekStart);
    if (week.status !== 'WITH_PAYROLL') throw new RuleError('This timesheet is no longer waiting for Payroll — refresh the list.');
    return { e, week };
};

/** Payroll's final approval: the version approved becomes the baseline for any later edit. */
export const payrollApproveWeek = (mode: DataMode, employeeId: string, weekStart: string, comment?: string) => {
    const { e, week } = payrollWeek(mode, employeeId, weekStart);
    const at = nowIso();
    const note = comment?.trim();
    saveWeek(mode, {
        ...week,
        status: 'APPROVED',
        approvedEntries: week.entries,
        baselineEntries: null,
        editedAfter: undefined,
        decision: { by: PAYROLL_ACTOR, at, ...(note ? { comment: note } : {}) },
        history: [...week.history, { at, actor: PAYROLL_ACTOR, action: 'APPROVED', detail: `Approved by Payroll${note ? ` — ${note}` : ''}` }],
    });
    return weekItem(mode, e, weekOf(mode, e, week.weekStart), 'PAYROLL');
};

export const payrollSendBackWeek = (mode: DataMode, employeeId: string, weekStart: string, comment?: string) => {
    const { e, week } = payrollWeek(mode, employeeId, weekStart);
    const note = comment?.trim();
    if (!note) throw new RuleError('Add a short note so the employee knows what to fix.', 400);
    const at = nowIso();
    saveWeek(mode, {
        ...week,
        status: 'SENT_BACK',
        sentBackBy: 'PAYROLL',
        decision: { by: PAYROLL_ACTOR, at, comment: note },
        history: [...week.history, { at, actor: PAYROLL_ACTOR, action: 'SENT_BACK', detail: `Sent back: ${note}` }],
    });
    return weekItem(mode, e, weekOf(mode, e, week.weekStart), 'PAYROLL');
};

// ---- attendance & overtime requests (manager and level 2) ---------------------------------------------

/**
 * PROTOTYPE-SETUP (Overview, Slice 1): 'profile' = profile updates (HR only, never in a manager's queue).
 * PROTOTYPE-SETUP (Final batch, Slice 1): 'leave' (manager → HR) and 'reimbursement' (manager → Admin).
 */
export type RequestType = 'attendance' | 'overtime' | 'profile' | 'leave' | 'reimbursement';

const correctionItem = (mode: DataMode, c: AttendanceCorrection, viewer: ApproverRole): RequestItem | null => {
    const e = findEmployee(c.employeeId);
    if (!e) return null;
    const fmt = (v: string | null) => (v ? displayTime(v) : '—');
    const fmtOut = (v: string | null, days: number) => (v ? displayTimeOn(v, days) : 'not checked out');
    // PROTOTYPE-SETUP (HR rules, Slice 1): next-day check-outs read "5:00 AM (next day)".
    const changes = [
        c.requested.checkIn !== c.current.checkIn && `Check-in ${fmt(c.current.checkIn)} → ${fmt(c.requested.checkIn)}`,
        (c.requested.checkOut !== c.current.checkOut || c.requested.outDays !== c.current.outDays) &&
            `Check-out ${fmtOut(c.current.checkOut, c.current.outDays)} → ${fmtOut(c.requested.checkOut, c.requested.outDays)}`,
    ].filter(Boolean);
    const blocked = c.trail.status.startsWith('PENDING') && isDayLocked(mode, c.date) ? lockReasonFor(c.date) : undefined;
    return {
        type: 'attendance',
        id: c.id,
        employee: personRef(e),
        manager: managerRef(e),
        title: `Attendance correction · ${dayLabel(c.date)}`,
        detail: changes.join(' · ') || 'No time change',
        notes: c.reason,
        at: c.createdAt,
        trail: c.trail,
        statusLabel: trailLabel(c.trail),
        correction: { current: c.current, requested: c.requested },
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
        ...(o.trail.status.startsWith('PENDING') && isDayLocked(mode, o.date) ? { blockedReason: lockReasonFor(o.date) } : {}),
        waitingForYou: awaiting(o.trail) === viewer,
    };
};

const profileItem = (p: ProfileUpdateRequest, viewer: ApproverRole): RequestItem | null => {
    const e = findEmployee(p.employeeId);
    if (!e) return null;
    return {
        type: 'profile',
        id: p.id,
        employee: personRef(e),
        manager: managerRef(e),
        title: 'Profile update · Personal details',
        detail: profileChangeSummary(p.changes),
        at: p.createdAt,
        trail: p.trail,
        statusLabel: trailLabel(p.trail),
        profile: { changes: p.changes },
        waitingForYou: awaiting(p.trail) === viewer,
    };
};

const leaveItem = (l: LeaveRequest, viewer: ApproverRole): RequestItem | null => {
    const e = findEmployee(l.employeeId);
    if (!e) return null;
    let when = l.end > l.start ? `${dayLabel(l.start)} – ${dayLabel(l.end)}` : dayLabel(l.start);
    if (l.half) when = `${dayLabel(l.start)} (${l.half === 'FIRST' ? 'first' : 'second'} half)`;
    return {
        type: 'leave',
        id: l.id,
        employee: personRef(e),
        manager: managerRef(e),
        title: `${LEAVE_LABEL[l.type]} leave · ${when}`,
        detail: `${l.half ? 'Half a day' : `${l.days} working day${l.days === 1 ? '' : 's'}`}${l.proof ? ` · Proof attached: ${l.proof.name}` : ''}`,
        notes: l.reason,
        at: l.createdAt,
        trail: l.trail,
        statusLabel: l.withdrawn ? 'Withdrawn' : trailLabel(l.trail),
        waitingForYou: awaiting(l.trail) === viewer,
    };
};

const claimItem = (c: StoredClaim, viewer: ApproverRole): RequestItem | null => {
    const e = findEmployee(c.employeeId);
    if (!e) return null;
    return {
        type: 'reimbursement',
        id: c.id,
        employee: personRef(e),
        manager: managerRef(e),
        title: `Reimbursement · ₹${c.totalPay.toLocaleString('en-IN')} · ${c.category}`,
        detail: `${c.expenseDetails} · ${dayLabel(c.expenseDate)}`,
        at: c.createdAt,
        trail: c.trail,
        statusLabel: trailLabel(c.trail),
        waitingForYou: awaiting(c.trail) === viewer,
    };
};

const itemsOf = (mode: DataMode, type: RequestType, viewer: ApproverRole) => {
    if (type === 'attendance') return atsCorrections.get(mode).map(c => correctionItem(mode, c, viewer));
    if (type === 'profile') return atsProfileRequests.get(mode).map(p => profileItem(p, viewer));
    if (type === 'leave') return atsLeaveRequests.get(mode).map(l => leaveItem(l, viewer));
    if (type === 'reimbursement') return atsReimbursements.get(mode).map(c => claimItem(c, viewer));
    return atsOvertime.get(mode).map(o => overtimeItem(mode, o, viewer));
};

const allRequests = (mode: DataMode, type: RequestType, viewer: ApproverRole): RequestItem[] =>
    itemsOf(mode, type, viewer).filter((x): x is RequestItem => x !== null);

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
        timesheets: queue.length,
        attendance: teamRequests(mode, manager, 'attendance', 'waiting').length,
        overtime: teamRequests(mode, manager, 'overtime', 'waiting').length,
        leave: teamRequests(mode, manager, 'leave', 'waiting').length,
        reimbursement: teamRequests(mode, manager, 'reimbursement', 'waiting').length,
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
    profile: level2Requests(mode, role, 'profile', 'waiting').length,
    leave: level2Requests(mode, role, 'leave', 'waiting').length,
    reimbursement: level2Requests(mode, role, 'reimbursement', 'waiting').length,
    // PROTOTYPE-SETUP (Final batch, Slices 1 and 4): timesheets at level 2 — with the role Settings routes them to.
    timesheets: getSettings(mode).level2.timesheet === role ? payrollTimesheetQueue(mode, 'waiting').length : 0,
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
    if (type === 'leave') {
        // PROTOTYPE-SETUP (Final batch, Slice 1): manager → HR; approved leave updates attendance and the timesheet
        // straight away (they read the live requests).
        const l = atsLeaveRequests.get(mode).find(x => x.id === id);
        if (!l) throw new RuleError('Request not found.', 404);
        if (actor.role === 'MANAGER') assertManages(actor.manager, findEmployee(l.employeeId));
        const trail = decide(l.trail, actor.role, decision, comment, at);
        atsLeaveRequests.update(mode, list => list.map(x => (x.id === id ? { ...x, trail, updatedAt: at } : x)));
        return leaveItem({ ...l, trail }, actor.role)!;
    }
    if (type === 'reimbursement') {
        // PROTOTYPE-SETUP (Final batch, Slice 1): manager → Admin.
        const c = atsReimbursements.get(mode).find(x => x.id === id);
        if (!c) throw new RuleError('Request not found.', 404);
        if (actor.role === 'MANAGER') assertManages(actor.manager, findEmployee(c.employeeId));
        const trail = decide(c.trail, actor.role, decision, comment, at);
        atsReimbursements.update(mode, list => list.map(x => (x.id === id ? { ...x, trail, updatedAt: at } : x)));
        return claimItem({ ...c, trail }, actor.role)!;
    }
    if (type === 'profile') {
        // PROTOTYPE-SETUP (Overview, Slice 1): HR decides; the profile changes only when HR approves.
        const p = atsProfileRequests.get(mode).find(x => x.id === id);
        if (!p) throw new RuleError('Request not found.', 404);
        const trail = decide(p.trail, actor.role, decision, comment, at);
        atsProfileRequests.update(mode, list => list.map(x => (x.id === id ? { ...x, trail, updatedAt: at } : x)));
        if (trail.status === 'APPROVED') applyApprovedProfile(mode, p);
        return profileItem({ ...p, trail }, actor.role)!;
    }
    if (type === 'attendance') {
        const c = atsCorrections.get(mode).find(x => x.id === id);
        if (!c) throw new RuleError('Request not found.', 404);
        if (actor.role === 'MANAGER') assertManages(actor.manager, findEmployee(c.employeeId));
        if (decision === 'APPROVED' && isDayLocked(mode, c.date)) throw new RuleError(`Can't approve: ${lockReasonFor(c.date)}`);
        const trail = decide(c.trail, actor.role, decision, comment, at);
        atsCorrections.update(mode, list => list.map(x => (x.id === id ? { ...x, trail, updatedAt: at } : x)));
        if (trail.status === 'APPROVED') {
            // Breaks are kept; the times (and the check-out day) come from the request.
            const existing = recordOf(mode, findEmployee(c.employeeId)!, c.date);
            saveRecord(mode, {
                ...(existing ?? { breaks: [] }),
                employeeId: c.employeeId,
                date: c.date,
                checkIn: c.requested.checkIn,
                checkOut: c.requested.checkOut,
                outDays: c.requested.checkOut ? c.requested.outDays : 0,
                source: 'correction',
            });
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
        approvalEnabled: settings.timesheetApproval.enabled && hasTimesheets(settings.mode),
        employees: employeesFor(mode),
        statusOf: (id, ws) => weekOf(mode, findEmployee(id)!, ws).status,
        periodsOf: e => weeksSummary(mode, e, month),
    }).map(b => ({ employee: personRef(b.employee), manager: managerRef(b.employee), weekStart: b.weekStart, periodEnd: b.periodEnd, status: b.status }));
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
        approvalEnabled: settings.timesheetApproval.enabled && hasTimesheets(settings.mode),
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
            `Payroll for ${status.monthLabel} can't be processed yet: ${status.blockers.length} timesheet${status.blockers.length === 1 ? '' : 's'} of ${people.size} employee${people.size === 1 ? '' : 's'} not approved.`
        );
    }
    atsPayroll.update(mode, p => ({ ...p, processed: { ...p.processed, [month]: nowIso() } }));
    return payrollMonthStatus(mode, month);
};

export const timesheetStatusView = (mode: DataMode, month: string): TimesheetStatusView => {
    const settings = getSettings(mode);
    const approvalEnabled = settings.timesheetApproval.enabled && hasTimesheets(settings.mode);
    const { last } = monthBounds(month);
    const rows = employeesFor(mode)
        .filter(e => e.dateOfJoin <= last)
        .map(e => ({ employee: personRef(e), manager: managerRef(e), weeks: weeksSummary(mode, e, month) }));
    const weekCounts: TimesheetStatusView['weekCounts'] = { DRAFT: 0, SUBMITTED: 0, WITH_PAYROLL: 0, APPROVED: 0, SENT_BACK: 0, CHANGE_PENDING: 0 };
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

/**
 * PROTOTYPE-SETUP (Timesheet filing): the automatic submission for the company's frequency — every draft that is due
 * (periodsDueForSubmission) goes to the manager; the CEO's are auto-approved. It never shows or waits for a warning:
 * overlaps, gaps over 5 minutes and missing details it didn't stop for are noted in the period's history.
 */
export const runSubmissionDay = (mode: DataMode): SubmissionRunResult => {
    const settings = getSettings(mode);
    const result: SubmissionRunResult = { submissionWeekday: settings.timesheetApproval.submissionWeekday, submitted: [] };
    // PROTOTYPE-SETUP (Overview v4, Slice 5): no timesheets ('attendance' or 'none') → nothing to submit or block on.
    if (!settings.timesheetApproval.enabled || !hasTimesheets(settings.mode)) return result;
    const t = today();
    const { frequency } = settings.timesheetFiling;
    // Daily filing sends the days already over; weekly and monthly the period running today too (as before).
    const latest = frequency === 'DAILY' ? addDays(t, -1) : t;
    employeesFor(mode).forEach(e => {
        const stored = storedPeriodsOf(mode, e);
        const current = latest >= e.dateOfJoin ? weekOf(mode, e, latest) : null;
        const withCurrent = current && !stored.some(w => w.id === current.id) ? [...stored, current] : stored;
        periodsDueForSubmission(withCurrent, t, frequency)
            .filter(w => !periodDates(w).every(d => isDayLocked(mode, d)))
            .forEach(w => {
                const next = submitWeekRecord(mode, w, e, true, autoSubmitNote(mode, e, w));
                saveWeek(mode, next);
                result.submitted.push({ employeeId: e.id, name: e.fullName, weekStart: w.weekStart, periodEnd: periodEndOf(w), ...(next.status === 'APPROVED' ? { autoApproved: true } : {}) });
            });
    });
    atsPayroll.update(mode, p => ({ ...p, lastSubmissionRun: t }));
    return result;
};

/**
 * On a real auto-submit day, once its time has come (PROTOTYPE-SETUP: Final batch, Slice 1 — default Friday 11:00 PM),
 * run once per day the first time anything is read.
 */
export const autoRunSubmissionDay = (mode: DataMode) => {
    const t = today();
    if (atsPayroll.get(mode).lastSubmissionRun === t) return;
    if (!isAutoSubmitDue(t, nowMinutes(), getSettings(mode))) return;
    runSubmissionDay(mode);
};

// ---- settings ---------------------------------------------------------------------------------------------

// PROTOTYPE-SETUP (Overview v4, Slice 5): 'none' = neither attendance nor timesheet tracking.
const MODES = ['attendance', 'both', 'timesheet', 'none'] as const;
const L2: Level2Approver[] = ['HR', 'FINANCE', 'PAYROLL', 'ADMIN', 'NONE'];
const HHMM = /^\d{2}:\d{2}$/;
const int = (v: unknown, min: number, max: number, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback;
};

const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;

/** PROTOTYPE-SETUP (Final batch, Slice 1): the leave policy — invalid values keep the current ones. */
const leavePolicyFrom = (b: Partial<LeavePolicy> | undefined, cur: LeavePolicy): LeavePolicy => {
    const num = (v: unknown, min: number, max: number, fallback: number) => {
        const n = Number(v);
        return v !== undefined && v !== null && v !== '' && Number.isFinite(n) && n >= min && n <= max ? n : fallback;
    };
    const mmdd = /^(0[1-9]|1[0-2])-(0[1-9]|1\d|2[0-8])$/;
    const types = Object.fromEntries(
        LEAVE_TYPES.map(t => {
            const c = cur.types[t];
            const x = b?.types?.[t];
            return [
                t,
                {
                    daysPerYear: num(x?.daysPerYear, 0, 60, c.daysPerYear),
                    credit: x?.credit === 'UPFRONT' || x?.credit === 'MONTHLY' ? x.credit : c.credit,
                    carryForward: num(x?.carryForward, 0, 120, c.carryForward),
                    encashOnExit: typeof x?.encashOnExit === 'boolean' ? x.encashOnExit : c.encashOnExit,
                },
            ];
        })
    ) as LeavePolicy['types'];
    return {
        year: b?.year === 'COMPANY' || b?.year === 'JOINING' ? b.year : cur.year,
        cycleStart: mmdd.test(b?.cycleStart ?? '') ? b!.cycleStart! : cur.cycleStart,
        probationMonths: Math.round(num(b?.probationMonths, 0, 24, cur.probationMonths)),
        types,
    };
};

/** PROTOTYPE-SETUP (Timesheet filing): frequency, fields (a valid combination) and suggested project codes. */
const filingFrom = (b: Partial<TimesheetFilingSettings> | undefined, cur: TimesheetFilingSettings): TimesheetFilingSettings => {
    const flag = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
    const f = b?.fields;
    const fields = {
        projectCode: flag(f?.projectCode, cur.fields.projectCode),
        startTime: flag(f?.startTime, cur.fields.startTime),
        endTime: flag(f?.endTime, cur.fields.endTime),
        duration: flag(f?.duration, cur.fields.duration),
    };
    const why = filingFieldsError(fields);
    if (why) throw new RuleError(why, 400);
    const codes = Array.isArray(b?.projectCodes)
        ? [...new Set(b!.projectCodes.map(normaliseProjectCode))].filter(c => PROJECT_CODE_RE.test(c)).slice(0, 50)
        : cur.projectCodes;
    return {
        frequency: FREQUENCIES.includes(b?.frequency as (typeof FREQUENCIES)[number]) ? b!.frequency! : cur.frequency,
        fields,
        projectCodes: codes,
    };
};

export const updateSettings = (mode: DataMode, body: Partial<AtsSettings> | undefined): AtsSettings => {
    const cur = getSettings(mode);
    const b = body ?? {};
    const start = HHMM.test(b.shift?.start ?? '') ? b.shift!.start : cur.shift.start;
    const end = HHMM.test(b.shift?.end ?? '') ? b.shift!.end : cur.shift.end;
    if (end <= start) throw new RuleError('Shift end must be after the start.', 400);
    const weekday = (v: unknown, fallback: Weekday) => (WEEKDAYS.includes(v as Weekday) ? (v as Weekday) : fallback);
    const l2 = (k: 'attendance' | 'overtime' | 'leave' | 'reimbursement' | 'timesheet') =>
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
            submissionTime: HHMM.test(b.timesheetApproval?.submissionTime ?? '') ? b.timesheetApproval!.submissionTime : cur.timesheetApproval.submissionTime,
        },
        level2: { attendance: l2('attendance'), overtime: l2('overtime'), leave: l2('leave'), reimbursement: l2('reimbursement'), timesheet: l2('timesheet') },
        // PROTOTYPE-SETUP (Final batch, Slice 1): leave deducted per late check-in (0 = off), and the leave policy.
        lateDeductionDays: Number.isFinite(Number(b.lateDeductionDays)) && Number(b.lateDeductionDays) >= 0 && Number(b.lateDeductionDays) <= 5
            ? Math.round(Number(b.lateDeductionDays) * 4) / 4
            : cur.lateDeductionDays,
        leavePolicy: leavePolicyFrom(b.leavePolicy, cur.leavePolicy),
        timesheetFiling: filingFrom(b.timesheetFiling, cur.timesheetFiling),
        updatedAt: nowIso(),
    };
    atsSettings.set(mode, next);
    // PROTOTYPE-SETUP (Timesheet filing): drafts move to the new periods; submitted ones keep their dates.
    if (next.timesheetFiling.frequency !== cur.timesheetFiling.frequency) regroupDrafts(mode);
    return next;
};

