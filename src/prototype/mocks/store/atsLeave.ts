// PROTOTYPE-SETUP (Final batch, Slice 1): what an employee sees and does on the Leave page — the leave year, balances
// and ledger per type, late check-in deductions, the probation and exit-settlement notes, requests (apply, withdraw)
// — plus the leave demo (joining and leaving dates). Rules: src/prototype/rules/leavePolicy.ts.
import type { LeaveRequest, LeaveRequestInput, LeaveType, LeaveView } from '@src/domains/attendanceTimesheet/types';
import { RuleError, addDays, cancelTrail, hasCheckIn, isWeeklyOff, startTrail, trailLabel } from '@src/prototype/rules/attendance';
import { LEAVE_LABEL, LEAVE_TYPES, LateEvent, computeLeave, dayMonth, leaveYearOf, validateLeaveRequest } from '@src/prototype/rules/leavePolicy';

import { atsEmployeeLife, atsLeaveRequests, leaveRequestsOf, lifeOf, openingBalancesOf } from './atsRequests';
import { attendanceDay, correctionsOf, getSettings, managerRef, nowIso, publicHolidayOn, recordOf, today } from './atsStore';
import { MockEmployee } from '../data/employees';
import type { DataMode } from '../envelope';

const uid = () => `lv-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

const isWorkingDayFor = (mode: DataMode) => (d: string) => !isWeeklyOff(d, getSettings(mode)) && !publicHolidayOn(d);

/**
 * Late check-ins since the start of the leave year (only when check-in is tracked): late now → deducted (pending while
 * a correction waits); not late any more because an approved correction changed the check-in → reversed, on the day
 * it was approved.
 */
export const lateEventsOf = (mode: DataMode, e: MockEmployee, from: string): LateEvent[] => {
    const settings = getSettings(mode);
    if (!hasCheckIn(settings.mode)) return [];
    const t = today();
    const approved = new Map(
        correctionsOf(mode, e)
            .filter(c => c.trail.status === 'APPROVED')
            .map(c => [c.date, c])
    );
    const lateAt = (checkIn: string | null) => {
        if (!checkIn) return 0;
        const [h, m] = settings.shift.start.split(':').map(Number);
        const [ch, cm] = checkIn.split(':').map(Number);
        const by = ch * 60 + cm - (h * 60 + m);
        return by > settings.graceMinutes ? by : 0;
    };
    const out: LateEvent[] = [];
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

const summaryOf = (l: LeaveRequest) =>
    l.half ? `${LEAVE_LABEL[l.type]} leave, ${dayMonth(l.start)} (${l.half === 'FIRST' ? 'first' : 'second'} half)` : `${LEAVE_LABEL[l.type]} leave, ${dayMonth(l.start)}${l.end > l.start ? ` – ${dayMonth(l.end)}` : ''}`;

const isLive = (l: LeaveRequest) => l.trail.status === 'APPROVED' || l.trail.status.startsWith('PENDING');

/** The Leave page: leave year, balances and ledger, late deductions, probation / exit notes, requests. */
export const leaveViewOf = (mode: DataMode, e: MockEmployee): LeaveView => {
    const settings = getSettings(mode);
    const t = today();
    const life = lifeOf(mode, e);
    const policy = settings.leavePolicy;
    const year = leaveYearOf(t, policy, life.dateOfJoin);
    const requests = leaveRequestsOf(mode, e.id);
    const c = computeLeave({
        policy,
        today: t,
        dateOfJoin: life.dateOfJoin,
        exitDate: life.exitDate,
        opening: openingBalancesOf(e),
        taken: requests.filter(l => l.trail.status === 'APPROVED').map(l => ({ type: l.type, start: l.start, end: l.end, half: l.half, days: l.days })),
        late: lateEventsOf(mode, e, year.start > life.dateOfJoin ? year.start : life.dateOfJoin),
        lateDays: settings.lateDeductionDays,
    });
    return {
        year: { ...c.year, basis: policy.year },
        dateOfJoin: life.dateOfJoin,
        probationUntil: c.probationUntil,
        exit: life.exitDate && c.settlement ? { date: life.exitDate, settlement: c.settlement } : null,
        balances: c.balances.map(b => ({ ...b, label: LEAVE_LABEL[b.type] })),
        lateDeductions: c.lateDeductions.sort((a, b) => b.date.localeCompare(a.date)),
        lossOfPayDays: c.lossOfPayDays,
        lateDeductionDays: settings.lateDeductionDays,
        requests: [...requests]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map(l => ({ ...l, statusLabel: l.withdrawn ? 'Withdrawn' : trailLabel(l.trail) })),
        managerName: managerRef(e)?.name ?? null,
    };
};

/** Available per type for a new request: the balance minus requests still pending. */
const availableForRequest = (mode: DataMode, e: MockEmployee): Record<LeaveType, number> => {
    const view = leaveViewOf(mode, e);
    const pending = leaveRequestsOf(mode, e.id).filter(l => l.trail.status.startsWith('PENDING'));
    return Object.fromEntries(
        LEAVE_TYPES.map(type => [type, (view.balances.find(b => b.type === type)?.available ?? 0) - pending.filter(l => l.type === type).reduce((s, l) => s + l.days, 0)])
    ) as Record<LeaveType, number>;
};

/** Apply for leave: checked (dates, overlap, balance, proof, reason), then to the manager, then HR. */
export const createLeaveRequest = (mode: DataMode, e: MockEmployee, input: LeaveRequestInput | undefined) => {
    const existing = leaveRequestsOf(mode, e.id)
        .filter(isLive)
        .map(l => ({ start: l.start, end: l.end, half: l.half, summary: summaryOf(l) }));
    const clean = validateLeaveRequest(input ?? {}, { isWorkingDay: isWorkingDayFor(mode), existing, available: availableForRequest(mode, e) });
    const at = nowIso();
    const request: LeaveRequest = { id: uid(), employeeId: e.id, ...clean, trail: startTrail('leave', managerRef(e), getSettings(mode)), createdAt: at, updatedAt: at };
    atsLeaveRequests.update(mode, list => [request, ...list]);
    return leaveViewOf(mode, e);
};

/** Withdraw a pending request. */
export const withdrawLeaveRequest = (mode: DataMode, e: MockEmployee, id: string) => {
    const l = leaveRequestsOf(mode, e.id).find(x => x.id === id);
    if (!l) throw new RuleError('Leave request not found.', 404);
    if (!l.trail.status.startsWith('PENDING')) throw new RuleError('Only a pending request can be withdrawn.');
    const at = nowIso();
    atsLeaveRequests.update(mode, list => list.map(x => (x.id === id ? { ...x, trail: cancelTrail(x.trail), withdrawn: true, updatedAt: at } : x)));
    return leaveViewOf(mode, e);
};

/** Demo: the employee's joining and leaving dates, so the leave maths can be shown live. */
export const setEmployeeLife = (mode: DataMode, e: MockEmployee, body: { dateOfJoin?: string | null; exitDate?: string | null } | undefined) => {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const dateOfJoin = body?.dateOfJoin && iso.test(body.dateOfJoin) ? body.dateOfJoin : undefined;
    const exitDate = body?.exitDate && iso.test(body.exitDate) ? body.exitDate : null;
    if (dateOfJoin && exitDate && exitDate < dateOfJoin) throw new RuleError('The leaving date is before the joining date.', 400);
    atsEmployeeLife.update(mode, all => ({ ...all, [e.id]: { ...(dateOfJoin ? { dateOfJoin } : {}), exitDate } }));
    return leaveViewOf(mode, e);
};
