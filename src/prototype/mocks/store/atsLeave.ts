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
    CompOffCalendar,
    CompOffCalendarDay,
    CompOffCheck,
    CompOffDayKind,
    CompOffRequest,
    HrAddLeaveInput,
    LateDeduction,
    LeaveCancelCheck,
    LeaveCancellation,
    LeaveChange,
    LeavePolicy,
    LeaveRequest,
    LeaveRequestInput,
    LeaveRequestRow,
    LeaveSettingsView,
    LeaveTypeConfig,
    LeaveTypeInput,
    LeaveView,
    MaternityRule,
    SandwichConfig,
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
    nextStatus,
    restartTrail,
    stepName,
    toMinutes,
    trailLabel,
    weekStartOf,
} from '@src/prototype/rules/attendance';
import {
    COMP_OFF,
    CANCEL_FROM_MESSAGES,
    COMP_OFF_MESSAGES,
    LEAVE_MESSAGES,
    LEAVE_ROUTE,
    WorkCalendar,
    appliesTo,
    applyCancellation,
    cancellationRange,
    compOffDayAvailable,
    compOffDays,
    compOffProblem,
    computeLeaveYear,
    countLeaveDays,
    dayMonth,
    isWeeklyOffFor,
    isWorkingDayFor,
    leaveYearOf,
    MATERNITY_DATE_LABEL,
    departmentHead,
    isMaternity,
    maternityOffered,
    maternityProblem,
    maternityRequired,
    sandwichOf,
    exitOptsOf,
    isEventType,
    lossOfPayOnApproval,
    needsEndorsement,
    newTypeId,
    pastLeaveProblem,
    removedPastDays,
    rollForwardDay,
    shortDate,
    typeLabel,
    validateLeave,
    validateLop,
    withEndorsement,
    type LateMark,
    type WorkEvidence,
    negativeOf,
    negativeRoom,
    daysText,
} from '@src/prototype/rules/leave';
import { ADJUST_MESSAGES, OPENING_STATUS, type OpeningContext, adjustmentProblem, reviewOpeningRows } from '@src/prototype/rules/openingBalances';

import { addHoliday, addHolidays, holidaysOf, removeHoliday, updateHoliday } from './atsHolidays';
import { atsCompOffs, atsEmployeeLife, atsLeaveAdjustments, atsLeaveCancels, atsLeaveChanges, atsLeaveRequests, leaveRequestsOf, lifeOf, openingBalancesOf } from './atsRequests';
import {
    activeOvertimeOn,
    atsAttendance,
    atsCorrections,
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
// PROTOTYPE-SETUP (Leave email notifications): starts the email triggers on the leave request collections.
import './atsLeaveEmail';

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const first = (name: string) => name.split(' ')[0];

// ---- the employee's calendar ----------------------------------------------------------------------------------

/** Their own weekly offs and the company's public holidays. */
export const calendarOf = (mode: DataMode, e: MockEmployee): WorkCalendar => ({
    weeklyOff: scheduleOf(mode, e).weeklyOff,
    isHoliday: d => Boolean(publicHolidayOn(mode, d)),
});

// PROTOTYPE-SETUP (Leave policy settings): counted the way the leave's type counts (working or calendar days).
const recountFor = (mode: DataMode, e: MockEmployee, type?: string) => (start: string, end: string, half: LeaveRequest['half']) => {
    const t = getSettings(mode).leavePolicy.types.find(x => x.id === type);
    const calendar = t?.count === 'calendar';
    return countLeaveDays(start, end, half, calendarOf(mode, e), calendar || isEventType(t) ? 'OFF' : getSettings(mode).leavePolicy.sandwich, calendar ? 'calendar' : 'working').days;
};

// ---- extra approval for longer leave (PROTOTYPE-SETUP: Leave policy settings) ---------------------------------------

/**
 * The endorser for someone's longer leave: the department head of their department (the person in it whose own manager
 * is outside it, or who has none — rules/leave.ts departmentHead), or the specific person in the settings.
 */
export const endorserFor = (mode: DataMode, e: MockEmployee): { id: number; name: string } | null => {
    const cfg = getSettings(mode).leaveEndorsement;
    if (cfg.endorser !== 'DEPT_HEAD') {
        const p = findEmployee(Number(String(cfg.endorser).slice(7)));
        return p ? { id: p.id, name: p.fullName } : null;
    }
    const people = employeesFor(mode).map(x => ({ id: x.id, department: x.department as string, managerId: x.managerEmployeeId ? findEmployee(x.managerEmployeeId)?.id ?? null : null, name: x.fullName }));
    const head = departmentHead(people, e.department);
    return head ? { id: head.id, name: head.name } : null;
};

/** Steps without the endorsement, then the endorsement again when this many days need it. */
const endorse = (mode: DataMode, e: MockEmployee, trail: ApprovalTrail, days: number): ApprovalTrail => {
    const steps = trail.steps.filter(s => !s.endorsement);
    const base = steps.length === trail.steps.length ? trail : { ...trail, steps };
    return needsEndorsement(getSettings(mode).leaveEndorsement, days) ? withEndorsement(base, endorserFor(mode, e), e.id) : base;
};

/** A new leave (or leave change) request's chain: the leave approvers, plus the endorsement for longer leave. */
const leaveTrail = (mode: DataMode, e: MockEmployee, days: number) => endorse(mode, e, newTrail(mode, LEAVE_ROUTE, e), days);

/** Resubmitted: back to level 1 with the same approvers; the endorsement follows the new number of days. */
const restartLeaveTrail = (mode: DataMode, e: MockEmployee, trail: ApprovalTrail, days: number, at: string) => {
    const next = endorse(mode, e, restartTrail(trail, at, e.fullName), days);
    return { ...next, status: nextStatus(next.steps) };
};

// ---- request states --------------------------------------------------------------------------------------------

const isPending = (t: ApprovalTrail) => t.status.startsWith('PENDING');
/** Waiting for a decision, or sent back for an update. */
const isOpenItem = (x: { withdrawn?: boolean; trail: ApprovalTrail }) => !x.withdrawn && (isPending(x.trail) || x.trail.status === 'UPDATE_REQUESTED');
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
/**
 * The year is recomputed only when something it reads changed: every collection is replaced on write, so the identities
 * of what it reads (plus today) are the cache key. Approval lists ask for the same employees' years many times.
 */
const yearCache = new Map<string, ReturnType<typeof computeYear>>();
let yearCacheDeps: unknown[] = [];
const depsOf = (mode: DataMode) => [
    mode,
    today(),
    atsSettings.get(mode),
    atsLeaveRequests.get(mode),
    atsCompOffs.get(mode),
    atsLeaveAdjustments.get(mode),
    atsEmployeeLife.get(mode),
    atsAttendance.get(mode),
    atsCorrections.get(mode),
    holidaysOf(mode),
];

export const leaveYearFor = (mode: DataMode, e: MockEmployee, exclude?: string) => {
    const deps = depsOf(mode);
    if (deps.length !== yearCacheDeps.length || deps.some((d, i) => d !== yearCacheDeps[i])) {
        yearCache.clear();
        yearCacheDeps = deps;
    }
    const key = `${mode}:${e.id}:${exclude ?? ''}`;
    let y = yearCache.get(key);
    if (!y) {
        y = computeYear(mode, e, exclude);
        yearCache.set(key, y);
    }
    return y;
};

const computeYear = (mode: DataMode, e: MockEmployee, exclude?: string) => {
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
        // PROTOTYPE-SETUP (Leave settings rework): the time now, for the custom daily credit time (browser time zone).
        nowTime: new Date().toTimeString().slice(0, 5),
        opening: openingBalancesOf(e),
        leave,
        late: lateEventsOf(mode, e, year.start > life.dateOfJoin ? year.start : life.dateOfJoin),
        lateDays: settings.lateDeductionDays,
        compOff,
        // PROTOTYPE-SETUP (Leave fixes): HR's adjustments and imported opening balances.
        adjustments: atsLeaveAdjustments
            .get(mode)
            .filter(a => a.employeeId === e.id)
            .map(a => ({ type: a.type, days: a.days, date: a.date, reason: a.reason, opening: a.opening })),
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

// ---- Maternity's headcount rule (PROTOTYPE-SETUP: Leave settings rework) --------------------------------------------

/** Current employees: people in Employees without a leaving date in the past. */
export const currentHeadcount = (mode: DataMode) => {
    const t = today();
    return employeesFor(mode).filter(x => {
        const exit = lifeOf(mode, x).exitDate;
        return !exit || exit >= t;
    }).length;
};

/** Maternity is offered: required above 10 current employees, otherwise when HR turned it on (and it's active). */
export const maternityIsOffered = (mode: DataMode) => maternityOffered(getSettings(mode).leavePolicy, currentHeadcount(mode));

/** Active, for their gender — Maternity only when it's offered. */
const ownTypes = (mode: DataMode, e: MockEmployee) => {
    const policy = getSettings(mode).leavePolicy;
    const offered = maternityIsOffered(mode);
    return policy.types.filter(t => t.active && appliesTo(t, e.gender) && (!isMaternity(t) || offered));
};

/** The types someone can apply for (active, for their gender) plus Comp off when it's on. */
const applicableTypes = (mode: DataMode, e: MockEmployee): LeaveTypeConfig[] => {
    const policy = getSettings(mode).leavePolicy;
    const own = ownTypes(mode, e);
    return policy.compOff.enabled
        ? [
              ...own,
              {
                  id: COMP_OFF,
                  name: 'Comp off',
                  kind: 'yearly',
                  count: 'working',
                  daysPerYear: 0,
                  credit: 'CYCLE_START',
                  probation: 'FULL',
                  yearEnd: 'lapse',
                  carryForward: 0,
                  exitOpts: ['encash'],
                  limit: null,
                  limitUnit: 'days',
                  eventLabel: '',
                  windowBefore: null,
                  windowAfter: null,
                  excess: 'lapse',
                  halfDay: true,
                  trigger: 'other',
                  docRequired: false,
                  docName: '',
                  proofAfterDays: null,
                  appliesTo: 'ALL',
                  active: true,
              },
          ]
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
    const changes = atsLeaveChanges.get(mode).filter(c => c.employeeId === e.id);
    const openCancel = (leaveId: string) => cancels.some(c => c.leaveId === leaveId && isOpenItem(c));
    const openChange = (leaveId: string) => changes.some(c => c.leaveId === leaveId && isOpenItem(c));
    const requests: LeaveRequestRow[] = [...leaveRequestsOf(mode, e.id)]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(l => {
            const state = rowState(l);
            // PROTOTYPE-SETUP (Leave module): approved leave can be changed or cancelled (from any of its days, past
            // ones only if worked) while no cancellation or change is waiting on it.
            const free = state === 'approved' && !openCancel(l.id) && !openChange(l.id);
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
                ...(openChange(l.id) ? { changePending: true } : {}),
                ...(free ? { cancelFrom: l.start, cancelDays: l.days, canChange: true } : {}),
                ...(l.changedFrom ? { changedFromTypeName: leaveTypeName(mode, l.changedFrom.type) } : {}),
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
        balances: y.balances.map(({ entitlement: _e, exitOpts: _x, ...b }) => b),
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
        changes: [...changes]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map(c => ({ ...c, typeName: leaveTypeName(mode, c.type), wasTypeName: leaveTypeName(mode, c.was.type), statusLabel: c.withdrawn ? 'Withdrawn' : trailLabel(c.trail) })),
        compOffs: atsCompOffs
            .get(mode)
            .filter(c => c.employeeId === e.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map(c => ({ ...c, statusLabel: c.withdrawn ? 'Withdrawn' : trailLabel(c.trail), ...(publicHolidayOn(mode, c.date) ? { holidayName: publicHolidayOn(mode, c.date) } : {}) })),
        managerName: managerRef(e)?.name ?? null,
        // PROTOTYPE-SETUP (Settings, Slice 1): who a new request would go to, by name (cancellations and comp off too).
        approvalPath: approvalPathText(newTrail(mode, LEAVE_ROUTE, e), managerRef(e)?.id ?? null),
        rules: {
            halfDay: settings.leaveRules.halfDay,
            sandwich: settings.leavePolicy.sandwich,
            compOff: settings.leavePolicy.compOff,
            lop: settings.leavePolicy.lop,
            negative: settings.leavePolicy.negative,
        },
        eventTypes: ownTypes(mode, e).filter(x => isEventType(x)),
        calendar: { weeklyOff: cal.weeklyOff, shift: scheduleOf(mode, e).shift, holidays: holidayRange(mode, addDays(t, -400), addDays(t, 400)) },
        holidays: holidaysOf(mode)
            .filter(h => h.date.slice(0, 4) === year)
            .map(h => ({ ...h, weeklyOff: isWeeklyOffFor(cal, h.date) })),
    };
};

// ---- applying, withdrawing, resubmitting ---------------------------------------------------------------------------

/** Per-event leave already booked (approved or in request) for a type and event date, a request left out. */
/** PROTOTYPE-SETUP (Leave settings rework): one active request per type and event date (taken in one go). */
const eventTakenFor = (mode: DataMode, e: MockEmployee, exclude?: string) => (type: string, eventDate: string) =>
    leaveRequestsOf(mode, e.id).some(l => l.id !== exclude && l.type === type && l.eventDate === eventDate && leaveState(l) !== null);

const checkLeave = (mode: DataMode, e: MockEmployee, input: Partial<LeaveRequestInput> | undefined, exclude?: string, who?: string) => {
    const settings = getSettings(mode);
    const b = balancesFor(mode, e, exclude);
    return validateLeave(input ?? {}, {
        types: applicableTypes(mode, e),
        cal: calendarOf(mode, e),
        sandwich: settings.leavePolicy.sandwich,
        // Half days are per type now; comp off keeps them.
        halfDayAllowed: true,
        existing: existingFor(mode, e, exclude),
        available: b.available,
        pending: b.pending,
        onProbation: lifeOf(mode, e).status === 'PROBATION',
        eventTaken: eventTakenFor(mode, e, exclude),
        negative: settings.leavePolicy.negative,
        ...(who ? { who, reasonMessage: LEAVE_MESSAGES.note } : {}),
    });
};

/** Apply for leave: checked (dates, overlap, probation, balance, document, reason), then to the leave approvers. */
export const createLeaveRequest = (mode: DataMode, e: MockEmployee, input: LeaveRequestInput | undefined) => {
    const clean = checkLeave(mode, e, input);
    const at = nowIso();
    const request: LeaveRequest = { id: uid('lv'), employeeId: e.id, ...clean, trail: leaveTrail(mode, e, clean.days), createdAt: at, updatedAt: at };
    atsLeaveRequests.update(mode, list => [request, ...list]);
    return leaveViewOf(mode, e);
};

export const LOP_MESSAGES = {
    noEdit: 'Loss of pay can only be withdrawn or cancelled. Withdraw it and request it again with the new dates.',
} as const;

/**
 * PROTOTYPE-SETUP (Leave policy settings): request loss of pay (unpaid leave). A leave request with type "Loss of pay"
 * and lop = true: working days only, the overlap check, the LOP rule (only once paid leave is used up, or any time), a
 * reason; no balance and no limit; the leave approvers (and the endorsement for longer leave).
 */
export const createLopRequest = (mode: DataMode, e: MockEmployee, input: Partial<LeaveRequestInput> | undefined) => {
    const settings = getSettings(mode);
    const y = leaveYearFor(mode, e);
    const clean = validateLop(input ?? {}, {
        cal: calendarOf(mode, e),
        halfDayAllowed: settings.leaveRules.halfDay,
        existing: existingFor(mode, e),
        rule: settings.leavePolicy.lop,
        balances: y.balances.map(b => ({ name: b.name, available: b.available })),
    });
    const at = nowIso();
    const request: LeaveRequest = { id: uid('lv'), employeeId: e.id, ...clean, trail: leaveTrail(mode, e, clean.days), createdAt: at, updatedAt: at };
    atsLeaveRequests.update(mode, list => [request, ...list]);
    return leaveViewOf(mode, e);
};

/**
 * Edit a request that is still open (pending at either level), or update one that was sent back: saved in place with
 * the same checks, then it starts again at level 1.
 */
export const resubmitLeaveRequest = (mode: DataMode, e: MockEmployee, id: string, input: Partial<LeaveRequestInput> | undefined) => {
    const l = leaveRequestsOf(mode, e.id).find(x => x.id === id);
    if (!l) throw new RuleError('Leave request not found.', 404);
    if (!isOpenItem(l)) throw new RuleError('Only an open request can be edited.');
    if (l.lop) throw new RuleError(LOP_MESSAGES.noEdit, 409);
    const merged = { type: l.type, start: l.start, end: l.end, half: l.half, reason: l.reason, proof: l.proof ?? null, eventDate: l.eventDate ?? null, child: l.child ?? null, ...(input ?? {}) };
    const clean = checkLeave(mode, e, merged, id);
    const at = nowIso();
    const trail = restartLeaveTrail(mode, e, l.trail, clean.days, at);
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
    const res = applyCancellation(l, from, recountFor(mode, e, l.type));
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
    pending: 'A cancellation or change for this leave is already waiting for approval.',
    reason: 'Add a short reason.',
} as const;

/** How the company records work: check-ins (attendance modes), timesheets (timesheet-only), or neither. */
const evidenceOf = (mode: DataMode): WorkEvidence => {
    const m = getSettings(mode).mode;
    if (hasCheckIn(m)) return 'attendance';
    return hasTimesheets(m) ? 'timesheet' : 'none';
};

/** Did the employee work that day: a check-in (attendance modes), or timesheet entries (timesheet-only)? */
const workedDay = (mode: DataMode, e: MockEmployee) => (date: string) =>
    evidenceOf(mode) === 'attendance' ? Boolean(recordOf(mode, e, date)?.checkIn) : entriesOn(mode, e, date).length > 0;

/** Past days of approved leave that a cancellation / change would take off must have been worked. */
const pastProblem = (mode: DataMode, e: MockEmployee, original: LeaveRequest, next: { start: string; end: string; half: LeaveRequest['half'] } | null) =>
    pastLeaveProblem(removedPastDays(original, next, today(), calendarOf(mode, e)), workedDay(mode, e), evidenceOf(mode));

const hasOpenFollowUp = (mode: DataMode, leaveId: string) =>
    atsLeaveCancels.get(mode).some(c => c.leaveId === leaveId && isOpenItem(c)) || atsLeaveChanges.get(mode).some(c => c.leaveId === leaveId && isOpenItem(c));

/**
 * Cancelling approved leave from `from` (default: the whole leave): what goes back to the balance, or why it can't.
 * Days before today can only be cancelled if the employee worked them.
 */
export const leaveCancelCheck = (mode: DataMode, e: MockEmployee, leaveId: string, fromAsked?: string): LeaveCancelCheck => {
    const l = leaveRequestsOf(mode, e.id).find(x => x.id === leaveId);
    if (!l) throw new RuleError(CANCEL_MESSAGES.notFound, 404);
    if (l.trail.status !== 'APPROVED') throw new RuleError(CANCEL_MESSAGES.notApproved);
    const from = fromAsked && /^\d{4}-\d{2}-\d{2}$/.test(fromAsked) ? fromAsked : l.start;
    if (from < l.start || from > l.end) return { from, to: l.end, whole: false, days: 0, problem: CANCEL_FROM_MESSAGES.outside };
    const whole = from <= l.start;
    const days = recountFor(mode, e, l.type)(from, l.end, l.half);
    if (days <= 0) return { from, to: l.end, whole, days: 0, problem: CANCEL_FROM_MESSAGES.nothing };
    const problem = pastProblem(mode, e, l, whole ? null : { start: l.start, end: addDays(from, -1), half: l.half });
    return { from, to: l.end, whole, days, problem };
};

/**
 * The employee cancels approved leave: a cancellation request (reason, same approvers as leave) for the whole leave or
 * from a date they pick ("Cancel from"). The leave stays booked until it's approved; then those days go back to the
 * balance and attendance / timesheet update. Past days need a check-in (or timesheet entries) on each of them.
 */
export const requestLeaveCancellation = (mode: DataMode, e: MockEmployee, leaveId: string, body: { reason?: string; from?: string } | undefined) => {
    const check = leaveCancelCheck(mode, e, leaveId, body?.from);
    if (check.problem) throw new RuleError(check.problem, 409);
    if (hasOpenFollowUp(mode, leaveId)) throw new RuleError(CANCEL_MESSAGES.pending, 409);
    const l = leaveRequestsOf(mode, e.id).find(x => x.id === leaveId)!;
    const reason = body?.reason?.trim() ?? '';
    if (!reason) throw new RuleError(CANCEL_MESSAGES.reason, 400);
    const at = nowIso();
    const c: LeaveCancellation = {
        id: uid('lc'),
        employeeId: e.id,
        leaveId,
        type: l.type,
        from: check.from,
        to: check.to,
        days: check.days,
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
    const trail = restartTrail(c.trail, at, e.fullName);
    atsLeaveCancels.update(mode, list => list.map(x => (x.id === id ? { ...x, reason, trail, updatedAt: at } : x)));
    return leaveViewOf(mode, e);
};

// ---- changing approved leave -----------------------------------------------------------------------------------------

const CHANGE_MESSAGES = {
    notFound: 'Change request not found.',
    notApproved: 'Only approved leave can be changed.',
    same: 'Nothing has changed. Pick new dates, a different type or a different half.',
} as const;

/** A change, checked like a new request with the original left out (its days count as free again). */
const checkChange = (mode: DataMode, e: MockEmployee, l: LeaveRequest, input: Partial<LeaveRequestInput> | undefined) => {
    if (l.lop) throw new RuleError(LOP_MESSAGES.noEdit, 409);
    const merged = { type: l.type, start: l.start, end: l.end, half: l.half, reason: '', proof: l.proof ?? null, eventDate: l.eventDate ?? null, child: l.child ?? null, ...(input ?? {}) };
    const clean = checkLeave(mode, e, merged, l.id);
    if (clean.type === l.type && clean.start === l.start && clean.end === l.end && clean.half === l.half) throw new RuleError(CHANGE_MESSAGES.same, 400);
    const problem = pastProblem(mode, e, l, clean);
    if (problem) throw new RuleError(problem, 409);
    return clean;
};

/**
 * The employee changes approved leave (new dates, type or half, and a reason): a change request with the leave
 * approvers. The original leave stays as it is until the change is approved; then it is replaced.
 */
export const requestLeaveChange = (mode: DataMode, e: MockEmployee, leaveId: string, input: Partial<LeaveRequestInput> | undefined) => {
    const l = leaveRequestsOf(mode, e.id).find(x => x.id === leaveId);
    if (!l) throw new RuleError(CANCEL_MESSAGES.notFound, 404);
    if (l.trail.status !== 'APPROVED') throw new RuleError(CHANGE_MESSAGES.notApproved);
    if (hasOpenFollowUp(mode, leaveId)) throw new RuleError(CANCEL_MESSAGES.pending, 409);
    const clean = checkChange(mode, e, l, input);
    const at = nowIso();
    const c: LeaveChange = {
        id: uid('lch'),
        employeeId: e.id,
        leaveId,
        ...clean,
        was: { type: l.type, start: l.start, end: l.end, half: l.half, days: l.days },
        trail: leaveTrail(mode, e, clean.days),
        createdAt: at,
        updatedAt: at,
    };
    atsLeaveChanges.update(mode, list => [c, ...list]);
    return leaveViewOf(mode, e);
};

export const withdrawLeaveChange = (mode: DataMode, e: MockEmployee, id: string) => {
    const c = atsLeaveChanges.get(mode).find(x => x.id === id && x.employeeId === e.id);
    if (!c) throw new RuleError(CHANGE_MESSAGES.notFound, 404);
    if (!isOpenItem(c)) throw new RuleError('Only a pending request can be withdrawn.');
    const at = nowIso();
    atsLeaveChanges.update(mode, list => list.map(x => (x.id === id ? { ...x, trail: cancelTrail(x.trail), withdrawn: true, updatedAt: at } : x)));
    return leaveViewOf(mode, e);
};

/** Edit an open change request (or update one sent back): checked again, then it starts again at level 1. */
export const resubmitLeaveChange = (mode: DataMode, e: MockEmployee, id: string, input: Partial<LeaveRequestInput> | undefined) => {
    const c = atsLeaveChanges.get(mode).find(x => x.id === id && x.employeeId === e.id);
    if (!c) throw new RuleError(CHANGE_MESSAGES.notFound, 404);
    if (!isOpenItem(c)) throw new RuleError('Only an open request can be edited.');
    const l = leaveRequestsOf(mode, e.id).find(x => x.id === c.leaveId);
    if (!l || l.trail.status !== 'APPROVED') throw new RuleError(CHANGE_MESSAGES.notApproved);
    const clean = checkChange(mode, e, l, { type: c.type, start: c.start, end: c.end, half: c.half, reason: c.reason, proof: c.proof ?? null, eventDate: c.eventDate ?? null, child: c.child ?? null, ...(input ?? {}) });
    const at = nowIso();
    const trail = restartLeaveTrail(mode, e, c.trail, clean.days, at);
    atsLeaveChanges.update(mode, list => list.map(x => (x.id === id ? { ...x, ...clean, trail, updatedAt: at } : x)));
    return leaveViewOf(mode, e);
};

/** How far below zero this type may go (comp off: never; per-event types have no balance). */
const roomFor = (mode: DataMode, type: string) => (type === COMP_OFF ? 0 : negativeRoom(getSettings(mode).leavePolicy.negative));

/** An approved change replaces the leave (the old one kept as "Was"); days beyond what's left are flagged as loss of pay. */
const applyChange = (mode: DataMode, id: string) => {
    const c = atsLeaveChanges.get(mode).find(x => x.id === id);
    if (!c || c.trail.status !== 'APPROVED') return;
    const l = atsLeaveRequests.get(mode).find(x => x.id === c.leaveId);
    const e = findEmployee(c.employeeId);
    if (!l || !e || l.trail.status !== 'APPROVED') return;
    const left = balancesFor(mode, e, l.id).left[c.type];
    // PROTOTYPE-SETUP (Leave policy settings): per-event types have no balance, so nothing is flagged.
    const lop = left === undefined ? 0 : lossOfPayOnApproval(left + roomFor(mode, c.type), c.days);
    const at = nowIso();
    atsLeaveRequests.update(mode, list =>
        list.map(x => {
            if (x.id !== l.id) return x;
            const rest = { ...x };
            delete rest.lossOfPayDays;
            return {
                ...rest,
                type: c.type,
                start: c.start,
                end: c.end,
                half: c.half,
                days: c.days,
                ...(c.proof ? { proof: c.proof } : {}),
                ...(c.eventDate ? { eventDate: c.eventDate } : {}),
                ...(c.child ? { child: c.child } : {}),
                ...(lop > 0 ? { lossOfPayDays: lop } : {}),
                changedFrom: { ...c.was, at, changeId: c.id },
                updatedAt: at,
            };
        })
    );
};

/**
 * PROTOTYPE-SETUP (Leave fixes): the approver's balance line; below zero but within the negative balance allowance is
 * `negativeOk` ("−1.5 after this (negative balance, recovered from the next credits)", no "Not enough leave" warning).
 */
const balanceInfo = (mode: DataMode, type: string, now: number, days: number) => {
    const after = Math.round((now - days) * 100) / 100;
    const room = roomFor(mode, type);
    return { typeName: leaveTypeName(mode, type), availableNow: now, after, days, ...(after < 0 && -after <= room + 1e-9 ? { negativeOk: true } : {}) };
};

/** "Annual: 7 available now · 6.5 after this" for a change request: the original's days count as free again. */
export const changeBalanceLine = (mode: DataMode, c: LeaveChange) => {
    const e = findEmployee(c.employeeId);
    if (!e) return undefined;
    const now = balancesFor(mode, e, c.leaveId).left[c.type];
    if (now === undefined) return undefined;
    return balanceInfo(mode, c.type, now, c.days);
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

/** PROTOTYPE-SETUP (Comp off calendar): one month of days for "Request comp off" (the employee's own weekly offs,
 *  public holidays, days worked, days already claimed). `exclude` = the request being resubmitted (its day stays open). */
export const compOffCalendar = (mode: DataMode, e: MockEmployee, month: string, exclude?: string): CompOffCalendar => {
    const settings = getSettings(mode);
    if (!settings.leavePolicy.compOff.enabled) throw new RuleError('Comp off is turned off at your company.');
    const now = today();
    const m = /^\d{4}-\d{2}$/.test(month) ? month : now.slice(0, 7);
    const cal = calendarOf(mode, e);
    const { expiryDays } = settings.leavePolicy.compOff;
    const claimedDays = new Set(
        atsCompOffs
            .get(mode)
            .filter(c => c.employeeId === e.id && c.id !== exclude && !c.withdrawn && c.trail.status !== 'REJECTED' && c.trail.status !== 'CANCELLED')
            .map(c => c.date)
    );
    const days: CompOffCalendarDay[] = [];
    for (let d = `${m}-01`; d.slice(0, 7) === m; d = addDays(d, 1)) {
        const holidayName = publicHolidayOn(mode, d);
        let kind: CompOffDayKind = 'WORKING';
        if (holidayName) kind = 'HOLIDAY';
        else if (!isWorkingDayFor(cal, d)) kind = 'WEEKLY_OFF';
        const claimed = claimedDays.has(d);
        days.push({
            date: d,
            kind,
            ...(holidayName ? { holidayName } : {}),
            worked: d <= now && workedOn(mode, e, d) > 0,
            claimed,
            available: compOffDayAvailable({ date: d, today: now, kind, expiryDays, claimed }),
        });
    }
    return { month: m, today: now, expiryDays, days };
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
    const trail = restartTrail(c.trail, at, e.fullName);
    atsCompOffs.update(mode, list => list.map(x => (x.id === id ? { ...x, date, days: check.days as 0.5 | 1, workedMinutes: check.workedMinutes, reason, trail, updatedAt: at } : x)));
    return leaveViewOf(mode, e);
};

// ---- effects of a final approval ------------------------------------------------------------------------------------

/**
 * Called when a leave item is decided. Approved leave: days beyond what was left are flagged as loss of pay (an
 * approver approved anyway). An approved cancellation cancels the leave (the days go back to the balance). An approved
 * comp off becomes a credit (read from the store).
 */
export const applyLeaveDecision = (mode: DataMode, kind: 'leave' | 'cancel' | 'compoff' | 'change', id: string) => {
    if (kind === 'change') {
        applyChange(mode, id);
        return;
    }
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
    // PROTOTYPE-SETUP (Leave policy settings): loss of pay is unpaid already (lop = true); per-event types have no
    // balance — nothing to flag for either.
    if (l.lop) return;
    const left = balancesFor(mode, e, l.id).left[l.type];
    if (left === undefined) return;
    // PROTOTYPE-SETUP (Leave fixes): the negative balance allowance counts as available (not loss of pay).
    const lop = lossOfPayOnApproval(left + roomFor(mode, l.type), l.days);
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
    return balanceInfo(mode, l.type, now, l.days);
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
    const clean = checkLeave(mode, e, { type: body.type, start: body.start, end: body.end, half: body.half ?? null, reason: body.note, proof: body.attachment ?? null, eventDate: body.eventDate ?? null, child: body.child ?? null }, undefined, first(e.fullName));
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
    const days = recountFor(mode, e, l.type)(range.from, range.to, l.half);
    applyCancel(mode, leaveId, range.from, 'HR team', reason);
    // Any cancellation the employee had asked for is now moot.
    atsLeaveCancels.update(mode, list => list.map(c => (c.leaveId === leaveId && isOpenItem(c) ? { ...c, trail: cancelTrail(c.trail), withdrawn: true } : c)));
    atsLeaveChanges.update(mode, list => list.map(c => (c.leaveId === leaveId && isOpenItem(c) ? { ...c, trail: cancelTrail(c.trail), withdrawn: true } : c)));
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
                    cancelDays: range ? recountFor(mode, e, l.type)(range.from, range.to, l.half) : 0,
                    ...(l.lossOfPayDays ? { lossOfPayDays: l.lossOfPayDays } : {}),
                },
            ];
        })
        .sort((a, b) => b.start.localeCompare(a.start));
};

/** Payroll → Leave → Balances: every employee, their status, and per type available / allocated. */
export const adminLeaveBalances = (mode: DataMode): AdminLeaveBalances => {
    const policy = getSettings(mode).leavePolicy;
    const columns = [...policy.types.filter(t => t.active && !isEventType(t)).map(t => ({ id: t.id, name: t.name })), ...(policy.compOff.enabled ? [{ id: COMP_OFF, name: 'Comp off' }] : [])];
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

// ---- Balances: Adjust balance, Import opening balances (PROTOTYPE-SETUP: Leave fixes) --------------------------------

/** The yearly types an employee has a balance for (comp off and per-event leave have none to adjust). */
const adjustableTypes = (mode: DataMode, e: MockEmployee) => ownTypes(mode, e).filter(t => !isEventType(t));

/**
 * HR adds or deducts days on one type, with a reason (shown in the employee's ledger and Recent activity). Counted as a
 * credit or deduction in this cycle. A deduction can't take the balance below zero past the negative allowance.
 */
export const adjustLeaveBalance = (mode: DataMode, employeeId: string | number, body: { type?: string; direction?: string; days?: number; reason?: string } | undefined) => {
    const e = employeeOr404(mode, employeeId);
    const t = adjustableTypes(mode, e).find(x => x.id === body?.type);
    if (!t) throw new RuleError(ADJUST_MESSAGES.type, 400);
    const direction = body?.direction === 'deduct' ? 'deduct' : 'add';
    const days = Number(body?.days);
    const reason = String(body?.reason ?? '').trim();
    const available = leaveYearFor(mode, e).balances.find(b => b.type === t.id)?.available ?? 0;
    const problem = adjustmentProblem({ direction, days, reason }, { first: first(e.fullName), available, label: typeLabel(t.name), room: negativeRoom(getSettings(mode).leavePolicy.negative) });
    if (problem) throw new RuleError(problem, 400);
    const at = nowIso();
    atsLeaveAdjustments.update(mode, list => [...list, { id: uid('adj'), employeeId: e.id, type: t.id, days: direction === 'add' ? days : -days, reason, date: today(), by: 'HR team', createdAt: at }]);
    return { message: `${daysText(days)} ${direction === 'add' ? 'added to' : 'deducted from'} ${first(e.fullName)}’s ${typeLabel(t.name)}` };
};

/** What the opening balance review checks against. */
const openingContext = (mode: DataMode): OpeningContext => {
    const policy = getSettings(mode).leavePolicy;
    const people = employeesFor(mode);
    const codeOf = new Map(people.map(e => [e.id, e.employeeId]));
    return {
        employees: people.map(e => ({ id: e.id, employeeId: e.employeeId, name: e.fullName, types: adjustableTypes(mode, e).map(t => t.id) })),
        types: policy.types.filter(t => !isEventType(t)).map(t => ({ id: t.id, name: t.name })),
        imported: new Set(atsLeaveAdjustments.get(mode).filter(a => a.opening).map(a => `${codeOf.get(a.employeeId)}:${a.type}`)),
        today: today(),
    };
};

/** The template's sample rows and the review context (the review itself runs in the browser too). */
export const openingBalanceContext = (mode: DataMode) => {
    const c = openingContext(mode);
    return { ...c, imported: [...c.imported] };
};

/** "Import N rows": each row is checked again here; Ready rows become "Opening balance" ledger lines. */
export const importOpeningBalances = (mode: DataMode, body: { rows?: { employeeId?: string; type?: string; days?: number; asOf?: string }[] } | undefined) => {
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (!rows.length) throw new RuleError('There are no opening balances to import.', 400);
    const review = reviewOpeningRows(
        rows.map(r => [String(r?.employeeId ?? ''), String(r?.type ?? ''), String(r?.days ?? ''), String(r?.asOf ?? '')]),
        openingContext(mode)
    );
    const ready = review.filter(r => r.status === 'ready');
    if (!ready.length) throw new RuleError(`None of these rows can be imported: ${OPENING_STATUS[review[0].status].toLowerCase()}.`, 409);
    const at = nowIso();
    const people = employeesFor(mode);
    atsLeaveAdjustments.update(mode, list => [
        ...list,
        ...ready.map(r => ({
            id: uid('opn'),
            employeeId: people.find(x => x.employeeId === r.employeeId)!.id,
            type: r.type,
            days: r.days ?? 0,
            reason: 'Opening balance',
            date: r.asOf,
            by: 'HR team',
            opening: true,
            createdAt: at,
        })),
    ]);
    return { imported: ready.length, skipped: review.length - ready.length, message: `${ready.length} opening balance${ready.length === 1 ? '' : 's'} imported` };
};

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
        // PROTOTYPE-SETUP (Leave settings rework): the per-event types they can take, and the events already booked.
        eventTypes: v.eventTypes ?? [],
        events: v.requests.filter(r => r.eventDate && (r.state === 'approved' || r.state === 'pending' || r.state === 'update_requested')).map(r => ({ type: r.type, eventDate: r.eventDate! })),
        existing: v.requests.filter(r => r.state === 'approved' || r.state === 'pending' || r.state === 'update_requested').map(r => ({ start: r.start, end: r.end, half: r.half, summary: leaveSummary(mode, r) })),
    };
};

// ---- Payroll settings → Leave Policies ----------------------------------------------------------------------------------

const MIGRATION_NOTE =
    'Annual, Casual and Sick keep the days, credit and carry-forward the employee balances already used. Maternity and Paternity are per-event leave (no yearly balance). Every type is paid: loss of pay is the only unpaid leave, requested from ESS → Leave → Request LOP.';

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
        headcount: currentHeadcount(mode),
        maternityRequired: maternityRequired(currentHeadcount(mode)),
        endorsement: s.leaveEndorsement,
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
    maternityDelete: 'Maternity is statutory leave, so it can’t be deleted. Turn it off instead (only with 10 or fewer employees).',
    maternityRename: 'Maternity is statutory leave, so it keeps its name.',
    limit: 'Enter how much can be taken per event.',
    renameUsed: 'This leave type has been used, so its name can’t change.',
    removeUsed: 'This leave type has been used, so it can only be made inactive.',
    last: 'Keep at least one leave type.',
    notFound: 'Leave type not found.',
} as const;

/** The body's leaving options; older clients may still send onLeaving or encashOnExit (mapped as in exitOptsOf). */
const exitOptsFrom = (body: Partial<LeaveTypeInput> | undefined, cur?: LeaveTypeConfig) => {
    const b = body as { exitOpts?: unknown; onLeaving?: unknown; encashOnExit?: unknown } | undefined;
    if (b && (Array.isArray(b.exitOpts) || b.onLeaving === 'ENCASH' || b.onLeaving === 'BRING_FORWARD' || typeof b.encashOnExit === 'boolean')) return exitOptsOf(b);
    return cur?.exitOpts ?? ['prepone'];
};

const numOrNull = (v: unknown, max: number) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null;
};

/**
 * A leave type from the drawer, checked. PROTOTYPE-SETUP (Leave settings rework): probation (none / monthly / daily /
 * full), credit after probation, the four end-of-cycle options (yearEnd + excess), one leaving option, per-type half
 * days, the supporting-document rule; per event: trigger, limit, start window, document; Maternity: fixed kind,
 * counting, gender and trigger, days by child at or above the legal minimum, weeks before (max 8) and after, and on
 * for good when it's required by headcount.
 */
const cleanType = (body: Partial<LeaveTypeInput> | undefined, cur?: LeaveTypeConfig, maternityLocked = false): Omit<LeaveTypeConfig, 'id'> => {
    const maternity = isMaternity(cur);
    const name = maternity ? cur!.name : String(body?.name ?? cur?.name ?? '').trim();
    if (!name) throw new RuleError(TYPE_MESSAGES.name, 400);
    const pick = <T extends string>(v: unknown, ok: readonly T[], fallback: T): T => (ok.includes(v as T) ? (v as T) : fallback);
    const flag = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
    const carry = Number(body?.carryForward ?? cur?.carryForward ?? 0);
    const proofRaw = body && 'proofAfterDays' in body ? body.proofAfterDays : cur?.proofAfterDays ?? null;
    const proof = proofRaw === null || proofRaw === undefined || (proofRaw as unknown) === '' ? null : Math.max(0, Math.round(Number(proofRaw)));
    const kind = maternity ? 'event' : pick(body?.kind, ['yearly', 'event'] as const, cur?.kind ?? 'yearly');
    const days = kind === 'event' ? 0 : Number(body?.daysPerYear ?? cur?.daysPerYear);
    if (kind === 'yearly' && (!(days > 0) || days > 366)) throw new RuleError(TYPE_MESSAGES.days, 400);
    const limitUnit = pick(body?.limitUnit, ['days', 'weeks'] as const, cur?.limitUnit ?? 'days');
    let limit = kind === 'event' ? numOrNull(body && 'limit' in body ? body.limit : cur?.limit, limitUnit === 'weeks' ? 52 : 366) : null;
    let mat: MaternityRule | undefined;
    if (maternity) {
        const raw = { ...cur!.mat, ...(body?.mat ?? {}) } as MaternityRule;
        const problem = maternityProblem(raw);
        if (problem) throw new RuleError(problem, 400);
        mat = { d1: Math.round(raw.d1), d2: Math.round(raw.d2), d3: Math.round(raw.d3), pre: Math.round(raw.pre), post: Math.round(raw.post) };
        limit = mat.d1;
    }
    if (kind === 'event' && !(limit && limit > 0)) throw new RuleError(TYPE_MESSAGES.limit, 400);
    const yearEnd = pick(body?.yearEnd, ['carry', 'encash', 'lapse'] as const, cur?.yearEnd ?? (carry > 0 ? 'carry' : 'lapse'));
    const docRequired = flag(body?.docRequired, cur?.docRequired ?? maternity);
    // The event date label and the start window: Maternity's come from its rule; other per-event types from the body.
    let eventFields: Pick<LeaveTypeConfig, 'eventLabel' | 'windowBefore' | 'windowAfter'> = { eventLabel: '', windowBefore: null, windowAfter: null };
    if (maternity) eventFields = { eventLabel: MATERNITY_DATE_LABEL, windowBefore: mat!.pre * 7, windowAfter: mat!.post * 7 };
    else if (kind === 'event')
        eventFields = {
            eventLabel: String(body?.eventLabel ?? cur?.eventLabel ?? '').trim(),
            windowBefore: numOrNull(body && 'windowBefore' in body ? body.windowBefore : cur?.windowBefore, 366),
            windowAfter: numOrNull(body && 'windowAfter' in body ? body.windowAfter : cur?.windowAfter, 366),
        };
    let proofRule: number | null = Number.isFinite(proof as number) ? proof : null;
    if (kind === 'event') proofRule = docRequired ? 0 : null;
    return {
        name,
        kind,
        count: maternity ? 'calendar' : pick(body?.count, ['working', 'calendar'] as const, cur?.count ?? 'working'),
        daysPerYear: Math.round(days * 2) / 2,
        credit: pick(body?.credit, ['CYCLE_START', 'MONTHLY', 'DAILY'] as const, cur?.credit ?? 'MONTHLY'),
        probation: pick(body?.probation, ['MONTHLY', 'DAILY', 'FULL', 'NONE'] as const, cur?.probation ?? 'MONTHLY'),
        yearEnd: kind === 'event' ? 'lapse' : yearEnd,
        excess: kind === 'yearly' && yearEnd === 'carry' ? pick(body?.excess, ['lapse', 'encash'] as const, cur?.excess ?? 'lapse') : 'lapse',
        carryForward: kind === 'yearly' && yearEnd === 'carry' && Number.isFinite(carry) ? Math.max(0, Math.min(366, carry)) : 0,
        exitOpts: kind === 'event' ? [] : exitOptsFrom(body, cur),
        halfDay: kind === 'event' ? false : flag(body?.halfDay, cur?.halfDay ?? true),
        limit,
        limitUnit: maternity ? 'days' : limitUnit,
        trigger: maternity ? 'birth' : pick(body?.trigger, ['birthadopt', 'birth', 'adoption', 'loss', 'procedure', 'other'] as const, cur?.trigger ?? 'other'),
        ...eventFields,
        docRequired: kind === 'event' ? docRequired : false,
        docName: kind === 'event' ? String(body?.docName ?? cur?.docName ?? '').trim() : '',
        ...(maternity ? { system: 'maternity' as const, mat } : {}),
        proofAfterDays: proofRule,
        appliesTo: maternity ? 'FEMALE' : pick(body?.appliesTo, ['ALL', 'FEMALE', 'MALE'] as const, cur?.appliesTo ?? 'ALL'),
        active: (maternity && maternityLocked) || (typeof body?.active === 'boolean' ? body.active : cur?.active ?? true),
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
    const t = cleanType(body, cur, maternityRequired(currentHeadcount(mode)));
    if (isMaternity(cur) && String(body?.name ?? cur.name).trim() !== cur.name) throw new RuleError(TYPE_MESSAGES.maternityRename, 409);
    if (t.name !== cur.name && usedCount(mode, id) > 0) throw new RuleError(TYPE_MESSAGES.renameUsed, 409);
    if (types.some(x => x.id !== id && x.name.toLowerCase() === t.name.toLowerCase())) throw new RuleError(TYPE_MESSAGES.duplicate, 409);
    // PROTOTYPE-SETUP (Leave policy settings): a per-event type can't be in the late-deduction order.
    savePolicy(mode, p => ({ ...p, types: p.types.map(x => (x.id === id ? { id, ...t } : x)), lateOrder: t.kind === 'event' ? p.lateOrder.filter(x => x !== id) : p.lateOrder }));
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
    if (isMaternity(types.find(x => x.id === id))) throw new RuleError(TYPE_MESSAGES.maternityDelete, 409);
    if (usedCount(mode, id) > 0) throw new RuleError(TYPE_MESSAGES.removeUsed, 409);
    if (types.length <= 1) throw new RuleError(TYPE_MESSAGES.last, 400);
    savePolicy(mode, p => ({ ...p, types: p.types.filter(x => x.id !== id), lateOrder: p.lateOrder.filter(x => x !== id) }));
    return leaveSettingsView(mode);
};

/** Configuration: leave year, half days, sandwich rule, comp off + expiry, late deduction days + order. Invalid values keep the current ones. */
export const updateLeaveConfig = (
    mode: DataMode,
    body:
        | Partial<Pick<LeavePolicy, 'year' | 'cycleStart' | 'lateOrder' | 'creditDate' | 'creditDay' | 'creditTime' | 'rounding' | 'lop' | 'matOn' | 'negative'>> & {
              sandwich?: Partial<SandwichConfig> | string;
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
    const ids = p.types.filter(t => t.active && !isEventType(t)).map(t => t.id);
    const creditDay = Number(b.creditDay);
    const order = Array.isArray(b.lateOrder) ? [...new Set(b.lateOrder.filter(x => ids.includes(x)))] : p.lateOrder;
    const next: LeavePolicy = {
        ...p,
        year: b.year === 'COMPANY' || b.year === 'JOINING' ? b.year : p.year,
        cycleStart: cycleOk ? b.cycleStart! : p.cycleStart,
        // PROTOTYPE-SETUP (Leave settings rework): the sandwich settings (the older enum values are mapped).
        sandwich: b.sandwich === undefined ? p.sandwich : sandwichOf(typeof b.sandwich === 'object' ? { ...p.sandwich, ...b.sandwich } : b.sandwich),
        compOff: {
            enabled: typeof b.compOff?.enabled === 'boolean' ? b.compOff.enabled : p.compOff.enabled,
            expiryDays: Number.isFinite(expiry) && expiry >= 0 && expiry <= 365 ? Math.round(expiry) : p.compOff.expiryDays,
        },
        lateOrder: order.length ? order : p.lateOrder,
        // PROTOTYPE-SETUP (Leave policy settings): credit date, rounding and loss of pay.
        creditDate: b.creditDate === 'START' || b.creditDate === 'END' || b.creditDate === 'CUSTOM' ? b.creditDate : p.creditDate,
        creditDay: Number.isInteger(creditDay) && creditDay >= 1 && creditDay <= 28 ? creditDay : p.creditDay,
        rounding: b.rounding === 'NONE' || b.rounding === 'HALF' || b.rounding === 'DAY' ? b.rounding : p.rounding,
        lop: b.lop === 'USED_UP' || b.lop === 'ANY_TIME' ? b.lop : p.lop,
        creditTime: typeof b.creditTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(b.creditTime) ? b.creditTime : p.creditTime,
        matOn: typeof b.matOn === 'boolean' ? b.matOn : p.matOn,
        // PROTOTYPE-SETUP (Leave fixes): negative balance (on / off, up to N days; null = no limit).
        negative: b.negative === undefined ? p.negative : negativeOf({ ...p.negative, ...b.negative }),
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

export const addPublicHoliday = (mode: DataMode, body: { date?: string; from?: string; to?: string; name?: string } | undefined) => {
    addHoliday(mode, body);
    return leaveSettingsView(mode);
};

/** PROTOTYPE-SETUP (Leave fixes): Edit a holiday (name, From, To); `start` is its current first date. */
export const updatePublicHoliday = (mode: DataMode, start: string, body: { from?: string; to?: string; name?: string } | undefined) => {
    updateHoliday(mode, start, body);
    return leaveSettingsView(mode);
};

/** PROTOTYPE-SETUP (Leave settings rework): "Import N days" from the bulk upload. */
export const importPublicHolidays = (mode: DataMode, body: { holidays?: { date?: string; name?: string }[] } | undefined) => {
    addHolidays(mode, body);
    return leaveSettingsView(mode);
};

export const removePublicHoliday = (mode: DataMode, date: string) => {
    removeHoliday(mode, date);
    return leaveSettingsView(mode);
};

export { first as firstName };
