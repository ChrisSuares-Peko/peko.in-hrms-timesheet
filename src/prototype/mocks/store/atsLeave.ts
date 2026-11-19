// PROTOTYPE-SETUP (Leave module): leave on the live stores — what an employee sees and does (balances per type, apply,
// withdraw, update and resubmit, cancel approved leave, comp off), what HR does (add leave, cancel, mark active, the
// Payroll → Leave lists) and the Leave Policies settings (leave types, holidays, configuration). Every rule comes from
// src/prototype/rules/leave.ts; this file only looks things up, applies them and assembles views. Contract:
// docs/api/leave.md.
import type {
    AdminLeaveBalances,
    AdminLeaveEntry,
    AdminOffToday,
    ApprovalTrail,
    CompOffCheck,
    CompOffRequest,
    HrAddLeaveInput,
    LateDeduction,
    LeaveCancellation,
    LeavePolicy,
    LeaveRequest,
    LeaveRequestInput,
    LeaveRequestRow,
    LeaveSettingsView,
    LeaveTypeConfig,
    LeaveTypeInput,
    LeaveView,
} from '@src/domains/attendanceTimesheet/types';
import {
    RuleError,
    addDays,
    approvalPathText,
    cancelTrail,
    formatDuration,
    hasCheckIn,
    hasTimesheets,
    pendingStep,
    resubmitTrail,
    stepName,
    toMinutes,
    trailLabel,
    weekStartOf,
} from '@src/prototype/rules/attendance';
import {
    COMP_OFF,
    COMP_OFF_MESSAGES,
    LEAVE_MESSAGES,
    LEAVE_ROUTE,
    WorkCalendar,
    appliesTo,
    applyCancellation,
    cancellationRange,
    compOffDays,
    compOffProblem,
    computeLeaveYear,
    countLeaveDays,
    dayMonth,
    isWeeklyOffFor,
    isWorkingDayFor,
    leaveYearOf,
    lossOfPayOnApproval,
    newTypeId,
    rollForwardDay,
    shortDate,
    typeLabel,
    validateLeave,
    type LateMark,
} from '@src/prototype/rules/leave';

import { addHoliday, holidaysOf, removeHoliday } from './atsHolidays';
import { atsCompOffs, atsEmployeeLife, atsLeaveCancels, atsLeaveRequests, leaveRequestsOf, lifeOf, openingBalancesOf } from './atsRequests';
import {
    activeOvertimeOn,
    atsSettings,
    attendanceDay,
    correctionsOf,
    employeesFor,
    entriesOn,
    getSettings,
    leaveTypeName,
    managerRef,
    newTrail,
    nowIso,
    personRef,
    publicHolidayOn,
    recordOf,
    scheduleOf,
    today,
} from './atsStore';
import { MockEmployee, findEmployee } from '../data/employees';
import type { DataMode } from '../envelope';

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const first = (name: string) => name.split(' ')[0];

// ---- the employee's calendar ----------------------------------------------------------------------------------

/** Their own weekly offs and the company's public holidays. */
export const calendarOf = (mode: DataMode, e: MockEmployee): WorkCalendar => ({
    weeklyOff: scheduleOf(mode, e).weeklyOff,
    isHoliday: d => Boolean(publicHolidayOn(mode, d)),
});

const recountFor = (mode: DataMode, e: MockEmployee) => (start: string, end: string, half: LeaveRequest['half']) =>
    countLeaveDays(start, end, half, calendarOf(mode, e), getSettings(mode).leavePolicy.sandwich).days;

// ---- request states --------------------------------------------------------------------------------------------

const isPending = (t: ApprovalTrail) => t.status.startsWith('PENDING');
/** Leave that counts against a balance: approved, or in request (pending / update requested). */
const leaveState = (l: LeaveRequest): 'approved' | 'in_request' | null => {
    if (l.withdrawn) return null;
    if (l.trail.status === 'APPROVED') return 'approved';
    if (isPending(l.trail) || l.trail.status === 'UPDATE_REQUESTED') return 'in_request';
    return null;
};

const rowState = (l: LeaveRequest): LeaveRequestRow['state'] => {
    if (l.withdrawn) return 'withdrawn';
    if (l.trail.status === 'CANCELLED') return l.cancellation ? 'cancelled' : 'withdrawn';
    if (l.trail.status === 'APPROVED') return 'approved';
    if (l.trail.status === 'REJECTED') return 'rejected';
    if (l.trail.status === 'UPDATE_REQUESTED') return 'update_requested';
    return 'pending';
};

/** "Casual leave, 23 Nov – 24 Nov (first half of each day)" */
export const leaveSummary = (mode: DataMode, l: Pick<LeaveRequest, 'type' | 'start' | 'end' | 'half'>) => {
    const range = `${dayMonth(l.start)}${l.end > l.start ? ` – ${dayMonth(l.end)}` : ''}`;
    const half = l.half ? ` (${l.half === 'FIRST' ? 'first' : 'second'} half${l.end > l.start ? ' of each day' : ''})` : '';
    return `${typeLabel(leaveTypeName(mode, l.type))}, ${range}${half}`;
};

// ---- late check-ins --------------------------------------------------------------------------------------------

/**
 * Late check-ins since `from` (only when check-in is tracked): late now → deducted (pending while a dispute waits); not
 * late any more because an approved dispute changed the check-in → reversed, on the day it was approved.
 */
export const lateEventsOf = (mode: DataMode, e: MockEmployee, from: string): LateMark[] => {
    const settings = getSettings(mode);
    if (!hasCheckIn(settings.mode)) return [];
    const t = today();
    const { shift } = scheduleOf(mode, e);
    const approved = new Map(
        correctionsOf(mode, e)
            .filter(c => c.trail.status === 'APPROVED')
            .map(c => [c.date, c])
    );
    const lateAt = (checkIn: string | null) => {
        if (!checkIn) return 0;
        const by = toMinutes(checkIn) - toMinutes(shift.start);
        return by > settings.graceMinutes ? by : 0;
    };
    const out: LateMark[] = [];
    for (let d = from; d <= t; d = addDays(d, 1)) {
        const day = recordOf(mode, e, d)?.checkIn ? attendanceDay(mode, e, d) : null;
        const c = day && day.lateMinutes === 0 ? approved.get(d) : undefined;
        const was = c ? lateAt(c.current.checkIn) : 0;
        if (day && day.lateMinutes > 0) {
            out.push({ date: d, lateMinutes: day.lateMinutes, state: day.correction?.state === 'pending' ? 'pending' : 'deducted' });
        } else if (c && was > 0) {
            const decidedAt = [...c.trail.steps].reverse().find(s => s.at)?.at ?? c.updatedAt;
            out.push({ date: d, lateMinutes: was, state: 'reversed', reversedOn: decidedAt.slice(0, 10) });
        }
    }
    return out;
};

/** The latest dispute (attendance correction) for a late day, for the Notes panel. */
const disputeOf = (mode: DataMode, e: MockEmployee, date: string): LateDeduction['dispute'] | undefined => {
    const c = correctionsOf(mode, e).find(x => x.date === date && x.trail.status !== 'CANCELLED');
    if (!c) return undefined;
    if (isPending(c.trail)) {
        const p = pendingStep(c.trail);
        return { state: 'pending', with: p ? stepName(p) : 'your approver' };
    }
    if (c.trail.status === 'UPDATE_REQUESTED') return { state: 'update_requested', by: c.trail.updateRequest?.by, comment: c.trail.updateRequest?.comment };
    if (c.trail.status === 'REJECTED') {
        const step = c.trail.steps.find(s => s.decision === 'REJECTED');
        return { state: 'rejected', by: step ? stepName(step) : undefined, comment: step?.comment };
    }
    return undefined;
};

// ---- one employee's year -----------------------------------------------------------------------------------------

/** Everything the leave year needs, for one employee. `exclude` leaves one request out (when it's being resubmitted). */
export const leaveYearFor = (mode: DataMode, e: MockEmployee, exclude?: string) => {
    const settings = getSettings(mode);
    const life = lifeOf(mode, e);
    const t = today();
    const policy = settings.leavePolicy;
    const year = leaveYearOf(life.exitDate && life.exitDate < t ? life.exitDate : t, policy, life.dateOfJoin);
    const leave = leaveRequestsOf(mode, e.id)
        .filter(l => l.id !== exclude && l.end >= life.dateOfJoin)
        .flatMap(l => {
            const state = leaveState(l);
            return state ? [{ type: l.type, start: l.start, end: l.end, half: l.half, days: l.days, state }] : [];
        });
    const compOff = atsCompOffs
        .get(mode)
        .filter(c => c.employeeId === e.id && c.trail.status === 'APPROVED' && !c.withdrawn)
        .map(c => ({ worked: c.date, approvedOn: ([...c.trail.steps].reverse().find(s => s.at)?.at ?? c.updatedAt).slice(0, 10), days: c.days }));
    return computeLeaveYear({
        policy,
        today: t,
        facts: { dateOfJoin: life.dateOfJoin, exitDate: life.exitDate, status: life.status, confirmedOn: life.confirmedOn, gender: e.gender },
        opening: openingBalancesOf(e),
        leave,
        late: lateEventsOf(mode, e, year.start > life.dateOfJoin ? year.start : life.dateOfJoin),
        lateDays: settings.lateDeductionDays,
        compOff,
    });
};

/** Available and in request per type (the request being resubmitted left out). */
const balancesFor = (mode: DataMode, e: MockEmployee, exclude?: string) => {
    const y = leaveYearFor(mode, e, exclude);
    return {
        available: Object.fromEntries(y.balances.map(b => [b.type, b.available])),
        pending: Object.fromEntries(y.balances.map(b => [b.type, b.inRequest])),
        left: Object.fromEntries(y.balances.map(b => [b.type, b.left])),
        y,
    };
};

/** The types someone can apply for (active, for their gender) plus Comp off when it's on. */
const applicableTypes = (mode: DataMode, e: MockEmployee): LeaveTypeConfig[] => {
    const policy = getSettings(mode).leavePolicy;
    const own = policy.types.filter(t => t.active && appliesTo(t, e.gender));
    return policy.compOff.enabled
        ? [...own, { id: COMP_OFF, name: 'Comp off', daysPerYear: 0, credit: 'CYCLE_START', probation: 'FULL', carryForward: 0, encashOnExit: false, proofAfterDays: null, appliesTo: 'ALL', active: true }]
        : own;
};

/** Leave already booked (approved, pending or waiting for an update), for the overlap check. */
const existingFor = (mode: DataMode, e: MockEmployee, exclude?: string) =>
    leaveRequestsOf(mode, e.id)
        .filter(l => l.id !== exclude && leaveState(l) !== null)
        .map(l => ({ start: l.start, end: l.end, half: l.half, summary: leaveSummary(mode, l) }));

// ---- the ESS view ------------------------------------------------------------------------------------------------

const holidayRange = (mode: DataMode, from: string, to: string) => holidaysOf(mode).filter(h => h.date >= from && h.date <= to);

/** The Leave page: balances per type, requests, cancellations, comp off, late deductions, probation / exit notes. */
export const leaveViewOf = (mode: DataMode, e: MockEmployee): LeaveView => {
    const settings = getSettings(mode);
    const t = today();
    const life = lifeOf(mode, e);
    const y = leaveYearFor(mode, e);
    const cal = calendarOf(mode, e);
    const cancels = atsLeaveCancels.get(mode).filter(c => c.employeeId === e.id);
    const openCancel = (leaveId: string) => cancels.some(c => c.leaveId === leaveId && !c.withdrawn && (isPending(c.trail) || c.trail.status === 'UPDATE_REQUESTED'));
    const requests: LeaveRequestRow[] = [...leaveRequestsOf(mode, e.id)]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(l => {
            const state = rowState(l);
            const range = state === 'approved' ? cancellationRange(l, t) : null;
            let statusLabel = trailLabel(l.trail);
            if (state === 'withdrawn') statusLabel = 'Withdrawn';
            if (state === 'cancelled') statusLabel = 'Cancelled';
            if (state === 'approved' && l.addedByHr) statusLabel = 'Approved · added by HR';
            return {
                ...l,
                typeName: leaveTypeName(mode, l.type),
                statusLabel,
                state,
                ...(openCancel(l.id) ? { cancellationPending: true } : {}),
                ...(range && !openCancel(l.id) ? { cancelFrom: range.from, cancelDays: recountFor(mode, e)(range.from, range.to, l.half) } : {}),
            };
        });
    const year = t.slice(0, 4);
    return {
        employeeId: e.id,
        employeeName: e.fullName,
        gender: e.gender,
        status: life.status,
        confirmedOn: life.confirmedOn,
        year: { ...y.year, basis: settings.leavePolicy.year },
        dateOfJoin: life.dateOfJoin,
        exit: life.exitDate && y.settlement ? { date: life.exitDate, settlement: y.settlement } : null,
        balances: y.balances.map(({ entitlement: _e, encashOnExit: _x, ...b }) => b),
        lateDeductions: y.lateDeductions
            .map(d => {
                const dispute = disputeOf(mode, e, d.date);
                return dispute ? { ...d, dispute } : d;
            })
            .sort((a, b) => b.date.localeCompare(a.date)),
        lossOfPayDays: y.lossOfPay,
        lateDeductionDays: settings.lateDeductionDays,
        lateOrder: settings.leavePolicy.lateOrder,
        requests,
        cancellations: [...cancels]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map(c => ({ ...c, typeName: leaveTypeName(mode, c.type), statusLabel: c.withdrawn ? 'Withdrawn' : trailLabel(c.trail) })),
        compOffs: atsCompOffs
            .get(mode)
            .filter(c => c.employeeId === e.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map(c => ({ ...c, statusLabel: c.withdrawn ? 'Withdrawn' : trailLabel(c.trail), ...(publicHolidayOn(mode, c.date) ? { holidayName: publicHolidayOn(mode, c.date) } : {}) })),
        managerName: managerRef(e)?.name ?? null,
        // PROTOTYPE-SETUP (Settings, Slice 1): who a new request would go to, by name (cancellations and comp off too).
        approvalPath: approvalPathText(newTrail(mode, LEAVE_ROUTE, e), managerRef(e)?.id ?? null),
        rules: { halfDay: settings.leaveRules.halfDay, sandwich: settings.leavePolicy.sandwich, compOff: settings.leavePolicy.compOff },
        calendar: { weeklyOff: cal.weeklyOff, shift: scheduleOf(mode, e).shift, holidays: holidayRange(mode, addDays(t, -400), addDays(t, 400)) },
        holidays: holidaysOf(mode)
            .filter(h => h.date.slice(0, 4) === year)
            .map(h => ({ ...h, weeklyOff: isWeeklyOffFor(cal, h.date) })),
    };
};

// ---- applying, withdrawing, resubmitting ---------------------------------------------------------------------------

const checkLeave = (mode: DataMode, e: MockEmployee, input: Partial<LeaveRequestInput> | undefined, exclude?: string, who?: string) => {
    const settings = getSettings(mode);
    const b = balancesFor(mode, e, exclude);
    return validateLeave(input ?? {}, {
        types: applicableTypes(mode, e),
        cal: calendarOf(mode, e),
        sandwich: settings.leavePolicy.sandwich,
        halfDayAllowed: settings.leaveRules.halfDay,
        existing: existingFor(mode, e, exclude),
        available: b.available,
        pending: b.pending,
        onProbation: lifeOf(mode, e).status === 'PROBATION',
        ...(who ? { who, reasonMessage: LEAVE_MESSAGES.note } : {}),
    });
};

/** Apply for leave: checked (dates, overlap, probation, balance, document, reason), then to the leave approvers. */
export const createLeaveRequest = (mode: DataMode, e: MockEmployee, input: LeaveRequestInput | undefined) => {
    const clean = checkLeave(mode, e, input);
    const at = nowIso();
    const request: LeaveRequest = { id: uid('lv'), employeeId: e.id, ...clean, trail: newTrail(mode, LEAVE_ROUTE, e), createdAt: at, updatedAt: at };
    atsLeaveRequests.update(mode, list => [request, ...list]);
    return leaveViewOf(mode, e);
};

/** Update a request that was sent back and send it again: the same checks, then it starts again at level 1. */
export const resubmitLeaveRequest = (mode: DataMode, e: MockEmployee, id: string, input: Partial<LeaveRequestInput> | undefined) => {
    const l = leaveRequestsOf(mode, e.id).find(x => x.id === id);
    if (!l) throw new RuleError('Leave request not found.', 404);
    const merged = { type: l.type, start: l.start, end: l.end, half: l.half, reason: l.reason, proof: l.proof ?? null, ...(input ?? {}) };
    const clean = checkLeave(mode, e, merged, id);
    const at = nowIso();
    const trail = resubmitTrail(l.trail, at, e.fullName);
    atsLeaveRequests.update(mode, list => list.map(x => (x.id === id ? { ...x, ...clean, trail, updatedAt: at } : x)));
    return leaveViewOf(mode, e);
};

/** Withdraw a pending request (or one sent back for an update). */
export const withdrawLeaveRequest = (mode: DataMode, e: MockEmployee, id: string) => {
    const l = leaveRequestsOf(mode, e.id).find(x => x.id === id);
    if (!l) throw new RuleError('Leave request not found.', 404);
    if (!isPending(l.trail) && l.trail.status !== 'UPDATE_REQUESTED') throw new RuleError('Only a pending request can be withdrawn.');
    const at = nowIso();
    atsLeaveRequests.update(mode, list => list.map(x => (x.id === id ? { ...x, trail: cancelTrail(x.trail), withdrawn: true, updatedAt: at } : x)));
    return leaveViewOf(mode, e);
};

// ---- cancelling approved leave --------------------------------------------------------------------------------------

/** Cancel approved leave from `from`: all of it, or the days from then on (the rest stays as leave). */
const applyCancel = (mode: DataMode, leaveId: string, from: string, by: string, reason: string) => {
    const l = atsLeaveRequests.get(mode).find(x => x.id === leaveId);
    if (!l || l.trail.status !== 'APPROVED') return;
    const e = findEmployee(l.employeeId);
    if (!e) return;
    const at = nowIso();
    const res = applyCancellation(l, from, recountFor(mode, e));
    const cancellation = { from, at, by, reason, originalEnd: l.end, originalDays: l.days };
    atsLeaveRequests.update(mode, list =>
        list.map(x => {
            if (x.id !== leaveId) return x;
            if (res.whole) return { ...x, trail: { ...x.trail, status: 'CANCELLED' as const }, cancellation, updatedAt: at };
            return { ...x, end: res.leave.end, days: res.leave.days, cancellation, updatedAt: at };
        })
    );
};

const CANCEL_MESSAGES = {
    notFound: 'Leave not found.',
    notApproved: 'Only approved leave can be cancelled.',
    over: 'This leave is already over, so there’s nothing to cancel.',
    pending: 'A cancellation for this leave is already waiting for approval.',
    reason: 'Add a short reason.',
} as const;

/**
 * The employee cancels approved leave: a cancellation request (reason, same approvers as leave). The leave stays booked
 * until it's approved; then the days go back to the balance. If the leave has started, only the days from today.
 */
export const requestLeaveCancellation = (mode: DataMode, e: MockEmployee, leaveId: string, body: { reason?: string } | undefined) => {
    const l = leaveRequestsOf(mode, e.id).find(x => x.id === leaveId);
    if (!l) throw new RuleError(CANCEL_MESSAGES.notFound, 404);
    if (l.trail.status !== 'APPROVED') throw new RuleError(CANCEL_MESSAGES.notApproved);
    const range = cancellationRange(l, today());
    if (!range) throw new RuleError(CANCEL_MESSAGES.over);
    if (atsLeaveCancels.get(mode).some(c => c.leaveId === leaveId && !c.withdrawn && (isPending(c.trail) || c.trail.status === 'UPDATE_REQUESTED')))
        throw new RuleError(CANCEL_MESSAGES.pending, 409);
    const reason = body?.reason?.trim() ?? '';
    if (!reason) throw new RuleError(CANCEL_MESSAGES.reason, 400);
    const at = nowIso();
    const c: LeaveCancellation = {
        id: uid('lc'),
        employeeId: e.id,
        leaveId,
        type: l.type,
        from: range.from,
        to: range.to,
        days: recountFor(mode, e)(range.from, range.to, l.half),
        reason,
        trail: newTrail(mode, LEAVE_ROUTE, e),
        createdAt: at,
        updatedAt: at,
    };
    atsLeaveCancels.update(mode, list => [c, ...list]);
    return leaveViewOf(mode, e);
};

export const withdrawLeaveCancellation = (mode: DataMode, e: MockEmployee, id: string) => {
    const c = atsLeaveCancels.get(mode).find(x => x.id === id && x.employeeId === e.id);
    if (!c) throw new RuleError('Cancellation not found.', 404);
    const at = nowIso();
    atsLeaveCancels.update(mode, list => list.map(x => (x.id === id ? { ...x, trail: cancelTrail(x.trail), withdrawn: true, updatedAt: at } : x)));
    return leaveViewOf(mode, e);
};

export const resubmitLeaveCancellation = (mode: DataMode, e: MockEmployee, id: string, body: { reason?: string } | undefined) => {
    const c = atsLeaveCancels.get(mode).find(x => x.id === id && x.employeeId === e.id);
    if (!c) throw new RuleError('Cancellation not found.', 404);
    const reason = (body?.reason ?? c.reason).trim();
    if (!reason) throw new RuleError(CANCEL_MESSAGES.reason, 400);
    const at = nowIso();
    const trail = resubmitTrail(c.trail, at, e.fullName);
    atsLeaveCancels.update(mode, list => list.map(x => (x.id === id ? { ...x, reason, trail, updatedAt: at } : x)));
    return leaveViewOf(mode, e);
};

// ---- comp off ---------------------------------------------------------------------------------------------------------

/** Time worked on a day: check-in → check-out (attendance), or the timesheet in timesheet-only mode. */
const workedOn = (mode: DataMode, e: MockEmployee, date: string) => {
    const settings = getSettings(mode);
    if (hasCheckIn(settings.mode)) {
        const d = attendanceDay(mode, e, date);
        return d.checkOut ? d.minutesAtWork : 0;
    }
    if (hasTimesheets(settings.mode)) return entriesOn(mode, e, date).reduce((s, x) => s + (x.mins ?? (x.start && x.end ? toMinutes(x.end) - toMinutes(x.start) : 0)), 0);
    return 0;
};

/** What a worked weekly off / holiday earns as comp off, or why it can't be claimed. */
export const compOffCheck = (mode: DataMode, e: MockEmployee, date: string, exclude?: string): CompOffCheck => {
    const settings = getSettings(mode);
    if (!settings.leavePolicy.compOff.enabled) throw new RuleError('Comp off is turned off at your company.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RuleError(COMP_OFF_MESSAGES.pick, 400);
    const cal = calendarOf(mode, e);
    const { shift } = scheduleOf(mode, e);
    const shiftMinutes = toMinutes(shift.end) - toMinutes(shift.start);
    const workedMinutes = date <= today() ? workedOn(mode, e, date) : 0;
    const problem = compOffProblem({
        date,
        today: today(),
        isOffDay: !isWorkingDayFor(cal, date),
        dayText: shortDate(date),
        expiryDays: settings.leavePolicy.compOff.expiryDays,
        workedMinutes,
        workedText: formatDuration(workedMinutes),
        shiftMinutes,
        attendance: hasCheckIn(settings.mode),
        alreadyClaimed: atsCompOffs.get(mode).some(c => c.employeeId === e.id && c.id !== exclude && c.date === date && !c.withdrawn && c.trail.status !== 'REJECTED' && c.trail.status !== 'CANCELLED'),
        overtimeClaimed: Boolean(activeOvertimeOn(mode, e, date)),
    });
    return { date, days: problem ? 0 : compOffDays(workedMinutes, shiftMinutes), workedMinutes, dayName: publicHolidayOn(mode, date) ?? 'weekly off', problem };
};

/** Request comp off for a worked weekly off / holiday (same approvers as leave). */
export const createCompOff = (mode: DataMode, e: MockEmployee, body: { date?: string; reason?: string } | undefined) => {
    const date = String(body?.date ?? '');
    if (!date) throw new RuleError(COMP_OFF_MESSAGES.pick, 400);
    const check = compOffCheck(mode, e, date);
    if (check.problem) throw new RuleError(check.problem, 409);
    const reason = body?.reason?.trim() ?? '';
    if (!reason) throw new RuleError(COMP_OFF_MESSAGES.reason, 400);
    const at = nowIso();
    const c: CompOffRequest = { id: uid('co'), employeeId: e.id, date, days: check.days as 0.5 | 1, workedMinutes: check.workedMinutes, reason, trail: newTrail(mode, LEAVE_ROUTE, e), createdAt: at, updatedAt: at };
    atsCompOffs.update(mode, list => [c, ...list]);
    return leaveViewOf(mode, e);
};

export const withdrawCompOff = (mode: DataMode, e: MockEmployee, id: string) => {
    const c = atsCompOffs.get(mode).find(x => x.id === id && x.employeeId === e.id);
    if (!c) throw new RuleError('Comp off request not found.', 404);
    const at = nowIso();
    atsCompOffs.update(mode, list => list.map(x => (x.id === id ? { ...x, trail: cancelTrail(x.trail), withdrawn: true, updatedAt: at } : x)));
    return leaveViewOf(mode, e);
};

export const resubmitCompOff = (mode: DataMode, e: MockEmployee, id: string, body: { date?: string; reason?: string } | undefined) => {
    const c = atsCompOffs.get(mode).find(x => x.id === id && x.employeeId === e.id);
    if (!c) throw new RuleError('Comp off request not found.', 404);
    const date = String(body?.date ?? c.date);
    const check = compOffCheck(mode, e, date, id);
    if (check.problem) throw new RuleError(check.problem, 409);
    const reason = (body?.reason ?? c.reason).trim();
    if (!reason) throw new RuleError(COMP_OFF_MESSAGES.reason, 400);
    const at = nowIso();
    const trail = resubmitTrail(c.trail, at, e.fullName);
    atsCompOffs.update(mode, list => list.map(x => (x.id === id ? { ...x, date, days: check.days as 0.5 | 1, workedMinutes: check.workedMinutes, reason, trail, updatedAt: at } : x)));
    return leaveViewOf(mode, e);
};

// ---- effects of a final approval ------------------------------------------------------------------------------------

/**
 * Called when a leave item is decided. Approved leave: days beyond what was left are flagged as loss of pay (an
 * approver approved anyway). An approved cancellation cancels the leave (the days go back to the balance). An approved
 * comp off becomes a credit (read from the store).
 */
export const applyLeaveDecision = (mode: DataMode, kind: 'leave' | 'cancel' | 'compoff', id: string) => {
    if (kind === 'cancel') {
        const c = atsLeaveCancels.get(mode).find(x => x.id === id);
        if (!c || c.trail.status !== 'APPROVED') return;
        const e = findEmployee(c.employeeId);
        applyCancel(mode, c.leaveId, c.from, e?.fullName ?? 'Employee', c.reason);
        return;
    }
    if (kind !== 'leave') return;
    const l = atsLeaveRequests.get(mode).find(x => x.id === id);
    if (!l || l.trail.status !== 'APPROVED') return;
    const e = findEmployee(l.employeeId);
    if (!e) return;
    const left = balancesFor(mode, e, l.id).left[l.type] ?? 0;
    const lop = lossOfPayOnApproval(left, l.days);
    if (lop > 0) atsLeaveRequests.update(mode, list => list.map(x => (x.id === id ? { ...x, lossOfPayDays: lop } : x)));
};

/** "Annual: 7 available now · 6.5 after this" — for a leave request waiting for a decision. */
export const leaveBalanceLine = (mode: DataMode, l: LeaveRequest, cache?: Map<number, ReturnType<typeof balancesFor>>) => {
    const e = findEmployee(l.employeeId);
    if (!e) return undefined;
    let b = cache?.get(e.id);
    if (!b) {
        b = balancesFor(mode, e);
        cache?.set(e.id, b);
    }
    const now = b.left[l.type];
    if (now === undefined) return undefined;
    return { typeName: leaveTypeName(mode, l.type), availableNow: now, after: Math.round((now - l.days) * 100) / 100, days: l.days };
};

// ---- HR ---------------------------------------------------------------------------------------------------------------

const employeeOr404 = (mode: DataMode, id: number | string | undefined) => {
    const e = findEmployee(id);
    if (!e || !employeesFor(mode).some(x => x.id === e.id)) throw new RuleError('Employee not found.', 404);
    return e;
};

/**
 * HR adds leave for an employee: the same checks as the employee's form (overlap, balance, probation); approved
 * straight away and marked "Added by HR"; attendance and the timesheet update at once.
 */
export const hrAddLeave = (mode: DataMode, body: Partial<HrAddLeaveInput> | undefined) => {
    if (!body?.employeeId) throw new RuleError('Pick an employee.', 400);
    const e = employeeOr404(mode, body.employeeId);
    if (!body.start || !body.end) throw new RuleError('Pick the start and end dates.', 400);
    const clean = checkLeave(mode, e, { type: body.type, start: body.start, end: body.end, half: body.half ?? null, reason: body.note, proof: body.attachment ?? null }, undefined, first(e.fullName));
    const at = nowIso();
    const trail: ApprovalTrail = { type: 'leave', status: 'APPROVED', steps: [{ level: 2, role: 'HR', decision: 'APPROVED', at, comment: 'Added by HR' }] };
    const request: LeaveRequest = { id: uid('lv'), employeeId: e.id, ...clean, trail, addedByHr: true, createdAt: at, updatedAt: at };
    atsLeaveRequests.update(mode, list => [request, ...list]);
    return { id: request.id, message: `${typeLabel(leaveTypeName(mode, clean.type))} added for ${e.fullName}. Their attendance and timesheet are updated.` };
};

/** HR cancels approved leave: applies straight away (only the days from today if it has started). */
export const hrCancelLeave = (mode: DataMode, leaveId: string, body: { reason?: string } | undefined) => {
    const l = atsLeaveRequests.get(mode).find(x => x.id === leaveId);
    if (!l) throw new RuleError(CANCEL_MESSAGES.notFound, 404);
    if (l.trail.status !== 'APPROVED') throw new RuleError(CANCEL_MESSAGES.notApproved);
    const range = cancellationRange(l, today());
    if (!range) throw new RuleError(CANCEL_MESSAGES.over);
    const reason = body?.reason?.trim() ?? '';
    if (!reason) throw new RuleError(CANCEL_MESSAGES.reason, 400);
    const e = findEmployee(l.employeeId)!;
    const days = recountFor(mode, e)(range.from, range.to, l.half);
    applyCancel(mode, leaveId, range.from, 'HR team', reason);
    // Any cancellation the employee had asked for is now moot.
    atsLeaveCancels.update(mode, list => list.map(c => (c.leaveId === leaveId && isPending(c.trail) ? { ...c, trail: cancelTrail(c.trail), withdrawn: true } : c)));
    return {
        message: `${e.fullName}’s leave cancelled${range.whole ? '' : ` from ${dayMonth(range.from)}`}. ${days} day${days === 1 ? '' : 's'} back to the balance.`,
    };
};

/** HR marks an employee Active (probation over): confirmedOn = today; the normal leave rules apply from today. */
export const markActive = (mode: DataMode, employeeId: number | string) => {
    const e = employeeOr404(mode, employeeId);
    const life = lifeOf(mode, e);
    if (life.status === 'ACTIVE') throw new RuleError(`${e.fullName} is already Active.`);
    atsEmployeeLife.update(mode, all => ({ ...all, [e.id]: { ...all[e.id], status: 'ACTIVE', confirmedOn: today() } }));
    return { message: `${e.fullName} is now Active. Leave follows the full-employee rules from today.` };
};

/** Demo: the employee's joining and leaving dates and status, so the leave maths can be shown live. */
export const setEmployeeLife = (
    mode: DataMode,
    e: MockEmployee,
    body: { dateOfJoin?: string | null; exitDate?: string | null; status?: 'PROBATION' | 'ACTIVE' } | undefined
) => {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const cur = atsEmployeeLife.get(mode)[e.id] ?? {};
    const dateOfJoin = body?.dateOfJoin && iso.test(body.dateOfJoin) ? body.dateOfJoin : cur.dateOfJoin;
    const asked = body?.exitDate && iso.test(body.exitDate) ? body.exitDate : null;
    const exitDate = body && 'exitDate' in body ? asked : cur.exitDate;
    if (dateOfJoin && exitDate && exitDate < dateOfJoin) throw new RuleError('The leaving date is before the joining date.', 400);
    const status = body?.status === 'PROBATION' || body?.status === 'ACTIVE' ? body.status : cur.status;
    const confirmedOnFor = (st: 'PROBATION' | 'ACTIVE') => {
        if (st !== 'ACTIVE') return null;
        return body?.status === 'ACTIVE' ? today() : cur.confirmedOn ?? null;
    };
    atsEmployeeLife.update(mode, all => ({
        ...all,
        [e.id]: {
            ...(dateOfJoin ? { dateOfJoin } : {}),
            ...(exitDate !== undefined ? { exitDate } : {}),
            ...(status ? { status, confirmedOn: confirmedOnFor(status) } : {}),
        },
    }));
    return leaveViewOf(mode, e);
};

// ---- Payroll → Leave lists ---------------------------------------------------------------------------------------------

const emailOf = (e: MockEmployee) => e.email;

/** Approved leave covering today (half days marked), on the employee's working days. */
export const adminOffToday = (mode: DataMode): AdminOffToday[] => {
    const t = today();
    return atsLeaveRequests
        .get(mode)
        .filter(l => l.trail.status === 'APPROVED' && l.start <= t && l.end >= t)
        .flatMap(l => {
            const e = findEmployee(l.employeeId);
            if (!e || !isWorkingDayFor(calendarOf(mode, e), t)) return [];
            return [{ employee: personRef(e), type: l.type, typeName: leaveTypeName(mode, l.type), half: l.half }];
        });
};

/** Payroll → Leave → Overview's numbers (the waiting count is added by the admin store). */
export const adminLeaveNumbers = (mode: DataMode) => {
    const t = today();
    const people = employeesFor(mode);
    const ws = weekStartOf(t);
    const we = addDays(ws, 6);
    const approved = atsLeaveRequests.get(mode).filter(l => l.trail.status === 'APPROVED');
    const month = t.slice(0, 7);
    return {
        offToday: adminOffToday(mode),
        employees: people.length,
        offThisWeek: new Set(approved.filter(l => l.start <= we && l.end >= ws).map(l => l.employeeId)).size,
        takenThisMonth: Math.round(approved.filter(l => l.start.slice(0, 7) === month).reduce((s, l) => s + l.days, 0) * 100) / 100,
        monthLabel: new Date(`${t}T00:00:00`).toLocaleDateString('en-IN', { month: 'long' }),
        onProbation: people.filter(e => lifeOf(mode, e).status === 'PROBATION').length,
    };
};

const entryState = (l: { start: string; end: string }, t: string): AdminLeaveEntry['state'] => {
    if (l.end < t) return 'taken';
    return l.start <= t ? 'now' : 'upcoming';
};

/** Payroll → Leave → Leaves: approved leave (cancelled-in-part leave keeps the days still taken), newest first. */
export const adminLeaveEntries = (mode: DataMode): AdminLeaveEntry[] => {
    const t = today();
    return atsLeaveRequests
        .get(mode)
        .filter(l => l.trail.status === 'APPROVED')
        .flatMap(l => {
            const e = findEmployee(l.employeeId);
            if (!e) return [];
            const range = cancellationRange(l, t);
            return [
                {
                    id: l.id,
                    employee: { ...personRef(e), email: emailOf(e) },
                    type: l.type,
                    typeName: leaveTypeName(mode, l.type),
                    start: l.start,
                    end: l.end,
                    half: l.half,
                    days: l.days,
                    reason: l.reason,
                    createdAt: l.createdAt,
                    addedBy: l.addedByHr ? ('HR' as const) : ('Employee' as const),
                    state: entryState(l, t),
                    cancelFrom: range?.from ?? null,
                    cancelDays: range ? recountFor(mode, e)(range.from, range.to, l.half) : 0,
                    ...(l.lossOfPayDays ? { lossOfPayDays: l.lossOfPayDays } : {}),
                },
            ];
        })
        .sort((a, b) => b.start.localeCompare(a.start));
};

/** Payroll → Leave → Balances: every employee, their status, and per type available / allocated. */
export const adminLeaveBalances = (mode: DataMode): AdminLeaveBalances => {
    const policy = getSettings(mode).leavePolicy;
    const columns = [...policy.types.filter(t => t.active).map(t => ({ id: t.id, name: t.name })), ...(policy.compOff.enabled ? [{ id: COMP_OFF, name: 'Comp off' }] : [])];
    return {
        types: columns,
        rows: employeesFor(mode).map(e => {
            const y = leaveYearFor(mode, e);
            const life = lifeOf(mode, e);
            return {
                employee: { ...personRef(e), email: emailOf(e), gender: e.gender },
                status: life.status,
                confirmedOn: life.confirmedOn,
                types: Object.fromEntries(
                    columns.map(c => {
                        const b = y.balances.find(x => x.type === c.id);
                        return [c.id, b ? { available: b.available, allocated: b.allocated, inRequest: b.inRequest } : null];
                    })
                ),
                lateDeductionDays: y.lateDeductions.filter(d => d.state !== 'reversed').reduce((s, d) => s + d.days, 0),
                lossOfPayDays: y.lossOfPay,
            };
        }),
    };
};

export const adminLeaveViewOf = (mode: DataMode, employeeId: string | number) => leaveViewOf(mode, employeeOr404(mode, employeeId));

/** HR → Add leave: one employee's applicable types with what's available (for the drawer's type list). */
export const adminEmployeeLeaveTypes = (mode: DataMode, employeeId: string | number) => {
    const e = employeeOr404(mode, employeeId);
    const v = leaveViewOf(mode, e);
    return {
        employeeId: e.id,
        status: v.status,
        calendar: v.calendar,
        rules: v.rules,
        balances: v.balances,
        existing: v.requests.filter(r => r.state === 'approved' || r.state === 'pending' || r.state === 'update_requested').map(r => ({ start: r.start, end: r.end, half: r.half, summary: leaveSummary(mode, r) })),
    };
};

// ---- Payroll settings → Leave Policies ----------------------------------------------------------------------------------

const MIGRATION_NOTE =
    'Annual, Casual and Sick keep the days, credit and carry-forward the employee balances already used. Maternity and Paternity come from the earlier leave policies list. Every type is paid: the earlier “Unpaid leave” option is gone, and loss of pay only happens when a balance runs out.';

export const leaveSettingsView = (mode: DataMode): LeaveSettingsView => {
    const s = getSettings(mode);
    const people = employeesFor(mode);
    const requests = atsLeaveRequests.get(mode);
    const usage = Object.fromEntries(
        s.leavePolicy.types.map(t => [t.id, { requests: requests.filter(l => l.type === t.id).length, employees: people.filter(e => appliesTo(t, e.gender)).length }])
    );
    const companyCycle = s.leavePolicy.year === 'COMPANY' ? leaveYearOf(today(), s.leavePolicy, '2000-01-01') : null;
    return {
        policy: s.leavePolicy,
        halfDay: s.leaveRules.halfDay,
        lateDeductionDays: s.lateDeductionDays,
        level1: s.level1.leave,
        level2: s.level2.leave,
        usage,
        holidays: holidaysOf(mode),
        nextRollForward: companyCycle
            ? rollForwardDay(companyCycle.end, d => !s.weeklyOff.includes((['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const)[new Date(`${d}T00:00:00`).getDay()]) && !publicHolidayOn(mode, d))
            : null,
        migrationNote: MIGRATION_NOTE,
    };
};

const savePolicy = (mode: DataMode, fn: (p: LeavePolicy) => LeavePolicy) => {
    const cur = getSettings(mode);
    atsSettings.set(mode, { ...atsSettings.get(mode), leavePolicy: fn(cur.leavePolicy), leaveRules: cur.leaveRules, updatedAt: nowIso() });
};

export const TYPE_MESSAGES = {
    name: 'Give the leave type a name.',
    duplicate: 'A leave type with that name already exists.',
    days: 'Enter the days per year.',
    renameUsed: 'This leave type has been used, so its name can’t change.',
    removeUsed: 'This leave type has been used, so it can only be made inactive.',
    last: 'Keep at least one leave type.',
    notFound: 'Leave type not found.',
} as const;

const cleanType = (body: Partial<LeaveTypeInput> | undefined, cur?: LeaveTypeConfig): Omit<LeaveTypeConfig, 'id'> => {
    const name = String(body?.name ?? cur?.name ?? '').trim();
    if (!name) throw new RuleError(TYPE_MESSAGES.name, 400);
    const days = Number(body?.daysPerYear ?? cur?.daysPerYear);
    if (!(days > 0) || days > 366) throw new RuleError(TYPE_MESSAGES.days, 400);
    const pick = <T extends string>(v: unknown, ok: readonly T[], fallback: T): T => (ok.includes(v as T) ? (v as T) : fallback);
    const carry = Number(body?.carryForward ?? cur?.carryForward ?? 0);
    const proofRaw = body && 'proofAfterDays' in body ? body.proofAfterDays : cur?.proofAfterDays ?? null;
    const proof = proofRaw === null || proofRaw === undefined || (proofRaw as unknown) === '' ? null : Math.max(0, Math.round(Number(proofRaw)));
    return {
        name,
        daysPerYear: Math.round(days * 2) / 2,
        credit: pick(body?.credit, ['CYCLE_START', 'MONTHLY', 'DAILY'] as const, cur?.credit ?? 'MONTHLY'),
        probation: pick(body?.probation, ['MONTHLY', 'FULL', 'NONE'] as const, cur?.probation ?? 'MONTHLY'),
        carryForward: Number.isFinite(carry) ? Math.max(0, Math.min(366, carry)) : 0,
        encashOnExit: typeof body?.encashOnExit === 'boolean' ? body.encashOnExit : cur?.encashOnExit ?? false,
        proofAfterDays: Number.isFinite(proof as number) || proof === null ? proof : null,
        appliesTo: pick(body?.appliesTo, ['ALL', 'FEMALE', 'MALE'] as const, cur?.appliesTo ?? 'ALL'),
        active: typeof body?.active === 'boolean' ? body.active : cur?.active ?? true,
    };
};

const usedCount = (mode: DataMode, id: string) => atsLeaveRequests.get(mode).filter(l => l.type === id).length;

export const addLeaveType = (mode: DataMode, body: Partial<LeaveTypeInput> | undefined) => {
    const t = cleanType(body);
    const {types} = getSettings(mode).leavePolicy;
    if (types.some(x => x.name.toLowerCase() === t.name.toLowerCase())) throw new RuleError(TYPE_MESSAGES.duplicate, 409);
    const id = newTypeId(t.name, types.map(x => x.id));
    savePolicy(mode, p => ({ ...p, types: [...p.types, { id, ...t }] }));
    return leaveSettingsView(mode);
};

export const updateLeaveType = (mode: DataMode, id: string, body: Partial<LeaveTypeInput> | undefined) => {
    const {types} = getSettings(mode).leavePolicy;
    const cur = types.find(x => x.id === id);
    if (!cur) throw new RuleError(TYPE_MESSAGES.notFound, 404);
    const t = cleanType(body, cur);
    if (t.name !== cur.name && usedCount(mode, id) > 0) throw new RuleError(TYPE_MESSAGES.renameUsed, 409);
    if (types.some(x => x.id !== id && x.name.toLowerCase() === t.name.toLowerCase())) throw new RuleError(TYPE_MESSAGES.duplicate, 409);
    savePolicy(mode, p => ({ ...p, types: p.types.map(x => (x.id === id ? { id, ...t } : x)) }));
    return leaveSettingsView(mode);
};

export const setLeaveTypeActive = (mode: DataMode, id: string, body: { active?: boolean } | undefined) => {
    const cur = getSettings(mode).leavePolicy.types.find(x => x.id === id);
    if (!cur) throw new RuleError(TYPE_MESSAGES.notFound, 404);
    const active = typeof body?.active === 'boolean' ? body.active : !cur.active;
    savePolicy(mode, p => ({ ...p, types: p.types.map(x => (x.id === id ? { ...x, active } : x)) }));
    return leaveSettingsView(mode);
};

export const removeLeaveType = (mode: DataMode, id: string) => {
    const {types} = getSettings(mode).leavePolicy;
    if (!types.some(x => x.id === id)) throw new RuleError(TYPE_MESSAGES.notFound, 404);
    if (usedCount(mode, id) > 0) throw new RuleError(TYPE_MESSAGES.removeUsed, 409);
    if (types.length <= 1) throw new RuleError(TYPE_MESSAGES.last, 400);
    savePolicy(mode, p => ({ ...p, types: p.types.filter(x => x.id !== id), lateOrder: p.lateOrder.filter(x => x !== id) }));
    return leaveSettingsView(mode);
};

/** Configuration: leave year, half days, sandwich rule, comp off + expiry, late deduction days + order. Invalid values keep the current ones. */
export const updateLeaveConfig = (
    mode: DataMode,
    body:
        | Partial<Pick<LeavePolicy, 'year' | 'cycleStart' | 'sandwich' | 'lateOrder'>> & {
              compOff?: Partial<LeavePolicy['compOff']>;
              halfDay?: boolean;
              lateDeductionDays?: number;
          }
        | undefined
) => {
    const cur = getSettings(mode);
    const p = cur.leavePolicy;
    const b = body ?? {};
    const cycleOk = typeof b.cycleStart === 'string' && /^(0[1-9]|1[0-2])-(0[1-9]|1\d|2[0-8])$/.test(b.cycleStart);
    const expiry = Number(b.compOff?.expiryDays);
    const late = Number(b.lateDeductionDays);
    const ids = p.types.filter(t => t.active).map(t => t.id);
    const order = Array.isArray(b.lateOrder) ? [...new Set(b.lateOrder.filter(x => ids.includes(x)))] : p.lateOrder;
    const next: LeavePolicy = {
        ...p,
        year: b.year === 'COMPANY' || b.year === 'JOINING' ? b.year : p.year,
        cycleStart: cycleOk ? b.cycleStart! : p.cycleStart,
        sandwich: b.sandwich === 'OFF' || b.sandwich === 'WEEKLY_OFFS' || b.sandwich === 'WEEKLY_OFFS_AND_HOLIDAYS' ? b.sandwich : p.sandwich,
        compOff: {
            enabled: typeof b.compOff?.enabled === 'boolean' ? b.compOff.enabled : p.compOff.enabled,
            expiryDays: Number.isFinite(expiry) && expiry >= 0 && expiry <= 365 ? Math.round(expiry) : p.compOff.expiryDays,
        },
        lateOrder: order.length ? order : p.lateOrder,
    };
    atsSettings.set(mode, {
        ...atsSettings.get(mode),
        leavePolicy: next,
        leaveRules: { halfDay: typeof b.halfDay === 'boolean' ? b.halfDay : cur.leaveRules.halfDay },
        lateDeductionDays: Number.isFinite(late) && late >= 0 && late <= 5 ? Math.round(late * 4) / 4 : cur.lateDeductionDays,
        updatedAt: nowIso(),
    });
    return leaveSettingsView(mode);
};

export const addPublicHoliday = (mode: DataMode, body: { date?: string; name?: string } | undefined) => {
    addHoliday(mode, body);
    return leaveSettingsView(mode);
};

export const removePublicHoliday = (mode: DataMode, date: string) => {
    removeHoliday(mode, date);
    return leaveSettingsView(mode);
};

export { first as firstName };
