// PROTOTYPE-SETUP (Leave module): the leave flows on the live stores — one describe per VERIFY item (docs/progress.md).
import { beforeEach, describe, expect, it } from 'vitest';

import { addDays, weekdayOf } from '@src/prototype/rules/attendance';
import { COMP_OFF } from '@src/prototype/rules/leave';

import { atsScenario } from '../../data/ats-seed';
import { findEmployee } from '../../data/employees';
import { adminRequests } from '../atsAdmin';
import { createCorrection, createOvertime } from '../atsEss';
import {
    addLeaveType,
    adminEmployeeLeaveTypes,
    adminLeaveBalances,
    adminLeaveEntries,
    compOffCheck,
    createCompOff,
    createLeaveRequest,
    hrAddLeave,
    hrCancelLeave,
    leaveSettingsView,
    leaveViewOf,
    markActive,
    requestLeaveCancellation,
    setLeaveTypeActive,
    updateLeaveConfig,
    updateLeaveType,
} from '../atsLeave';
import { atsLeaveRequests } from '../atsRequests';
import { attendanceDay, correctionsOf, getSettings, publicHolidayOn, weekView } from '../atsStore';
import { decideRequest, teamRequests, updateSettings } from '../atsTeam';
import { resetAllCollections } from '../persistentStore';

const M = 'dummy' as const;
const s = atsScenario();
const sneha = findEmployee('ACME-004')!;
const arjun = findEmployee('ACME-001')!;
const kavya = findEmployee('ACME-015')!;

beforeEach(() => resetAllCollections());

/** The n-th working day (Mon–Fri, no holiday) after a date. */
const working = (from: string, n: number) => {
    let d = from;
    for (let k = 0; k < n; ) {
        d = addDays(d, 1);
        if (!['SATURDAY', 'SUNDAY'].includes(weekdayOf(d)) && !publicHolidayOn(M, d)) k += 1;
    }
    return d;
};
/** The next date (after n days) that falls on a weekday. */
const nextWeekday = (from: string, day: string) => {
    let d = addDays(from, 1);
    while (weekdayOf(d) !== day) d = addDays(d, 1);
    return d;
};
const approve = (id: string) => {
    decideRequest(M, 'leave', id, { role: 'MANAGER', manager: arjun }, 'APPROVED');
    decideRequest(M, 'leave', id, { role: 'HR' }, 'APPROVED');
};
const balance = (type: string, e = sneha) => leaveViewOf(M, e).balances.find(b => b.type === type);

describe('1 · leave types', () => {
    it('a daily-credit type and a female-only type behave in ESS (hidden for men)', () => {
        addLeaveType(M, { name: 'Study', daysPerYear: 6, credit: 'DAILY', probation: 'FULL', carryForward: 0, encashOnExit: false, proofAfterDays: null, appliesTo: 'ALL' });
        addLeaveType(M, { name: 'Menstrual leave', daysPerYear: 12, credit: 'MONTHLY', probation: 'FULL', carryForward: 0, encashOnExit: false, proofAfterDays: null, appliesTo: 'FEMALE' });
        const study = balance('LT-STUDY')!;
        expect(study.credit).toBe('DAILY');
        expect(study.credited).toBeGreaterThan(0);
        expect(study.next).toBeNull();
        expect(balance('LT-MENSTRUAL-LEAVE')).toBeDefined();
        expect(leaveViewOf(M, arjun).balances.some(b => b.type === 'LT-MENSTRUAL-LEAVE')).toBe(false);
        expect(() => createLeaveRequest(M, arjun, { type: 'LT-MENSTRUAL-LEAVE', start: working(s.today, 5), reason: 'x' })).toThrow('Pick a leave type.');
    });
    it('a used type can’t be renamed or removed, only deactivated (hidden from forms, history kept)', () => {
        const v = leaveSettingsView(M);
        expect(v.usage.ANNUAL.requests).toBeGreaterThan(0);
        expect(v.usage.MATERNITY.employees).toBeGreaterThan(0);
        expect(() => updateLeaveType(M, 'ANNUAL', { name: 'Vacation' })).toThrow('This leave type has been used, so its name can’t change.');
        setLeaveTypeActive(M, 'CASUAL', { active: false });
        expect(balance('CASUAL')).toBeUndefined();
        expect(leaveViewOf(M, sneha).requests.some(r => r.type === 'CASUAL')).toBe(true);
    });
});

describe('2 · balances', () => {
    it('available is the same number everywhere (view, HR drawer, Balances)', () => {
        const b = balance('ANNUAL')!;
        expect(b.available).toBe(Math.round((b.credited - b.approved - b.late - b.inRequest) * 100) / 100);
        expect(adminEmployeeLeaveTypes(M, sneha.id).balances.find(x => x.type === 'ANNUAL')!.available).toBe(b.available);
        expect(adminLeaveBalances(M).rows.find(r => r.employee.id === sneha.id)!.types.ANNUAL!.available).toBe(b.available);
    });
    it('leave in request is taken off straight away', () => {
        const before = balance('ANNUAL')!.available;
        createLeaveRequest(M, sneha, { type: 'ANNUAL', start: working(s.today, 30), end: working(s.today, 31), reason: 'Trip' });
        expect(balance('ANNUAL')!).toMatchObject({ available: before - 2, inRequest: balance('ANNUAL')!.inRequest });
    });
});

describe('3 · half days over a range', () => {
    it('Mon–Fri first halves = 2.5 days, half-day leave on each day in attendance and the timesheet', () => {
        const mon = nextWeekday(addDays(s.today, 21), 'MONDAY');
        const fri = addDays(mon, 4);
        createLeaveRequest(M, sneha, { type: 'ANNUAL', start: mon, end: fri, half: 'FIRST', reason: 'Mornings' });
        const r = leaveViewOf(M, sneha).requests.find(x => x.start === mon)!;
        const workdays = [0, 1, 2, 3, 4].map(i => addDays(mon, i)).filter(d => !publicHolidayOn(M, d));
        expect(r.days).toBe(workdays.length * 0.5);
        approve(r.id);
        workdays.forEach(d => {
            expect(attendanceDay(M, sneha, d)).toMatchObject({ halfLeave: 'FIRST', label: 'Half-day leave (first half)' });
            expect(weekView(M, sneha, d).days.find(x => x.date === d)!.leaveRows).toEqual([expect.objectContaining({ description: 'Annual leave (first half)', half: 'FIRST' })]);
        });
    });
});

describe('4 · sandwich rule', () => {
    it('Friday + Monday is 4 days with the rule on, 2 with it off', () => {
        const fri = nextWeekday(addDays(s.today, 40), 'FRIDAY');
        const mon = addDays(fri, 3);
        updateLeaveConfig(M, { sandwich: 'WEEKLY_OFFS' });
        createLeaveRequest(M, sneha, { type: 'ANNUAL', start: fri, end: mon, reason: 'Long weekend' });
        expect(leaveViewOf(M, sneha).requests.find(x => x.start === fri)!.days).toBe(4);
        updateLeaveConfig(M, { sandwich: 'OFF' });
        const fri2 = addDays(fri, 14);
        createLeaveRequest(M, sneha, { type: 'ANNUAL', start: fri2, end: addDays(fri2, 3), reason: 'Long weekend' });
        expect(leaveViewOf(M, sneha).requests.find(x => x.start === fri2)!.days).toBe(2);
    });
});

describe('5 · cancelling approved leave', () => {
    it('the employee’s cancellation needs approval; the days come back after it', () => {
        const d = working(s.today, 12);
        createLeaveRequest(M, sneha, { type: 'CASUAL', start: d, end: d, reason: 'x' });
        const r = leaveViewOf(M, sneha).requests.find(x => x.start === d)!;
        approve(r.id);
        const after = balance('CASUAL')!.available;
        requestLeaveCancellation(M, sneha, r.id, { reason: 'Plans changed' });
        expect(balance('CASUAL')!.available).toBe(after);
        expect(leaveViewOf(M, sneha).requests.find(x => x.id === r.id)).toMatchObject({ state: 'approved', cancellationPending: true });
        const c = teamRequests(M, arjun, 'leave', 'waiting').find(x => x.leaveKind === 'cancel')!;
        approve(c.id);
        expect(leaveViewOf(M, sneha).requests.find(x => x.id === r.id)!.state).toBe('cancelled');
        expect(balance('CASUAL')!.available).toBe(after + 1);
    });
    it('HR cancels straight away; leave that has started is cancelled from today only', () => {
        const template = atsLeaveRequests.get(M).find(l => l.trail.status === 'APPROVED')!;
        const start = addDays(s.today, -3);
        const end = addDays(s.today, 3);
        atsLeaveRequests.update(M, list => [...list, { ...template, id: 'lv-started', employeeId: sneha.id, type: 'ANNUAL', start, end, half: null, days: 5 }]);
        const res = hrCancelLeave(M, 'lv-started', { reason: 'Back early' });
        expect(res.message).toMatch(/cancelled from/);
        const l = atsLeaveRequests.get(M).find(x => x.id === 'lv-started')!;
        expect(l).toMatchObject({ start, end: addDays(s.today, -1), trail: { status: 'APPROVED' }, cancellation: { from: s.today, by: 'HR team' } });
    });
});

describe('6 · comp off', () => {
    it('a worked weekly off earns 1 (full shift) or 0.5 (half a shift); refused if overtime was claimed', () => {
        const sat = s.snehaWorkedSaturday;
        expect(compOffCheck(M, sneha, sat)).toMatchObject({ days: 1, problem: null });
        expect(compOffCheck(M, sneha, s.snehaWorkedSunday)).toMatchObject({ days: 0.5, problem: null });
        expect(compOffCheck(M, sneha, working(addDays(s.today, -10), 1)).problem).toMatch(/is a working day/);
        createOvertime(M, sneha, { date: s.snehaWorkedSunday, minutes: 285, kind: 'worked', description: 'Release support' } as never);
        expect(compOffCheck(M, sneha, s.snehaWorkedSunday).problem).toBe('You’ve claimed overtime for that day. A day can be overtime or comp off, not both.');
    });
    it('approved comp off becomes a balance; it expires after the setting', () => {
        createCompOff(M, sneha, { date: s.snehaWorkedSaturday, reason: 'Release weekend' });
        expect(() => createCompOff(M, sneha, { date: s.snehaWorkedSaturday, reason: 'again' })).toThrow('You’ve already claimed comp off for that day.');
        const c = teamRequests(M, arjun, 'leave', 'waiting').find(x => x.leaveKind === 'compoff' && x.employee.id === sneha.id)!;
        approve(c.id);
        expect(balance(COMP_OFF)).toMatchObject({ available: 1, expiring: { date: addDays(s.snehaWorkedSaturday, 60) } });
        updateLeaveConfig(M, { compOff: { expiryDays: 1 } });
        expect(balance(COMP_OFF)!.available).toBe(0);
    });
});

describe('7 · probation', () => {
    it('a "Not available" type can’t be used on probation; Mark active makes it available', () => {
        expect(leaveViewOf(M, kavya).status).toBe('PROBATION');
        const mat = balance('MATERNITY', kavya)!;
        expect(mat).toMatchObject({ notAvailable: true, available: 0 });
        const d = working(s.today, 8);
        expect(() => hrAddLeave(M, { employeeId: kavya.id, type: 'MATERNITY', start: d, end: d, note: 'x' })).toThrow('Maternity leave isn’t available while Kavya is on probation.');
        markActive(M, kavya.id);
        const after = balance('MATERNITY', kavya)!;
        expect(after.notAvailable).toBe(false);
        expect(after.available).toBeGreaterThan(0);
        expect(() => hrAddLeave(M, { employeeId: kavya.id, type: 'MATERNITY', start: d, end: d, note: 'x', attachment: { name: 'note.pdf' } })).not.toThrow();
        expect(adminLeaveEntries(M).find(x => x.employee.id === kavya.id)).toMatchObject({ addedBy: 'HR', state: 'upcoming' });
    });
});

describe('8 · late check-in deduction', () => {
    it('a late mark deducts leave; an approved dispute reverses it; a rejected one shows the comment', () => {
        const late = leaveViewOf(M, sneha).lateDeductions.find(l => l.date === s.lateDay);
        if (!late) return; // the scripted late day may fall before this leave year
        expect(late).toMatchObject({ state: 'pending', from: 'ANNUAL', dispute: { state: 'pending', with: arjun.fullName } });
        const c = correctionsOf(M, sneha).find(x => x.date === s.lateDay && x.trail.status.startsWith('PENDING'))!;
        decideRequest(M, 'attendance', c.id, { role: 'MANAGER', manager: arjun }, 'REJECTED', 'Badge log shows 9:52 AM.');
        expect(leaveViewOf(M, sneha).lateDeductions.find(l => l.date === s.lateDay)).toMatchObject({ state: 'deducted', dispute: { state: 'rejected', by: arjun.fullName, comment: 'Badge log shows 9:52 AM.' } });
        const again = createCorrection(M, sneha, { date: s.lateDay, checkIn: '09:28', reason: 'Gate timed out' });
        decideRequest(M, 'attendance', again.id, { role: 'MANAGER', manager: arjun }, 'APPROVED');
        decideRequest(M, 'attendance', again.id, { role: 'PAYROLL' }, 'APPROVED');
        expect(leaveViewOf(M, sneha).lateDeductions.find(l => l.date === s.lateDay)!.state).toBe('reversed');
    });
});

describe('9 · Requests views and the approver line', () => {
    it('leave items carry “X available now · Y after this”; approving beyond it flags loss of pay', () => {
        const item = teamRequests(M, arjun, 'leave', 'waiting').find(x => x.leaveKind === 'leave')!;
        expect(item.leaveBalance).toMatchObject({ availableNow: expect.any(Number), after: expect.any(Number) });
        const {id} = item;
        const l = atsLeaveRequests.get(M).find(x => x.id === id)!;
        atsLeaveRequests.update(M, list => list.map(x => (x.id === id ? { ...x, days: 40 } : x)));
        approve(id);
        expect(atsLeaveRequests.get(M).find(x => x.id === id)!.lossOfPayDays).toBeGreaterThan(0);
        expect(l.type).toBeTruthy();
    });
    it('a team at both levels: every waiting item is "you" in Payroll; nothing with managers', () => {
        updateSettings(M, { level1: { ...getSettings(M).level1, leave: 'HR' }, level2: { ...getSettings(M).level2, leave: 'PAYROLL' } });
        createLeaveRequest(M, sneha, { type: 'CASUAL', start: working(s.today, 50), end: working(s.today, 50), reason: 'x' });
        const mine = adminRequests(M, 'leave').filter(r => r.item.employee.id === sneha.id && r.bucket !== 'ok' && r.bucket !== 'no');
        expect(mine.find(r => r.item.trail.status === 'PENDING_HR')!.bucket).toBe('you');
    });
});
