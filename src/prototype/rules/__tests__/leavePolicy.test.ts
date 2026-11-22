// PROTOTYPE-SETUP (Leave policy settings): the rules that let HR set up Peko's own Leave & Attendance Policy (June 2026)
// through settings — day counting, credit date, rounding, year end, leaving options, per-event leave, loss of pay and
// the endorsement step for longer leave.
import { describe, expect, it } from 'vitest';

import type { ApprovalTrail, LeavePolicy, LeaveTypeConfig } from '@src/domains/attendanceTimesheet/types';

import { DEFAULT_LEAVE_POLICY, DEFAULT_LEAVE_TYPES } from '../attendance';
import {
    COMP_OFF,
    EVENT_MESSAGES,
    LOP,
    computeLeaveYear,
    countLeaveDays,
    creditDateIn,
    creditSchedule,
    departmentHead,
    durationText,
    eventLimitDays,
    eventProblem,
    exitOptsOf,
    exitSettlement,
    lopProblem,
    migrateLeaveType,
    needsEndorsement,
    roundCredits,
    roundDays,
    validateLeave,
    validateLop,
    withEndorsement,
    yearEndLedger,
    yearEndRule,
} from '../leave';

const yearly = (over: Partial<LeaveTypeConfig> = {}): LeaveTypeConfig => ({
    id: 'CL',
    name: 'Casual',
    kind: 'yearly',
    count: 'working',
    daysPerYear: 14,
    credit: 'MONTHLY',
    probation: 'MONTHLY',
    yearEnd: 'lapse',
    carryForward: 0,
    exitOpts: [],
    limit: null,
    limitUnit: 'days',
    eventLabel: '',
    windowBefore: null,
    windowAfter: null,
    proofAfterDays: null,
    appliesTo: 'ALL',
    active: true,
    ...over,
});
const MATERNITY = DEFAULT_LEAVE_TYPES.find(t => t.id === 'MATERNITY')!;
const PATERNITY = DEFAULT_LEAVE_TYPES.find(t => t.id === 'PATERNITY')!;
const CAL = { weeklyOff: ['SATURDAY', 'SUNDAY'] as const, isHoliday: (d: string) => d === '2026-12-25' };
const cal = { weeklyOff: [...CAL.weeklyOff], isHoliday: CAL.isHoliday };

// Peko's policy (June 2026): calendar-year cycle, credits at the end of the month, nearest half day.
const PEKO: LeavePolicy = {
    ...DEFAULT_LEAVE_POLICY,
    cycleStart: '01-01',
    creditDate: 'END',
    rounding: 'HALF',
    types: [
        yearly({ id: 'CL', name: 'Casual', daysPerYear: 14, yearEnd: 'lapse', exitOpts: [] }),
        yearly({ id: 'EL', name: 'Earned', daysPerYear: 18, yearEnd: 'carry', carryForward: 45, exitOpts: ['encash'] }),
        MATERNITY,
        PATERNITY,
    ],
    lateOrder: ['CL', 'EL'],
    compOff: { enabled: false, expiryDays: 60 },
};
const yearInput = (over: Partial<Parameters<typeof computeLeaveYear>[0]> = {}) => ({
    policy: PEKO,
    today: '2026-03-31',
    facts: { dateOfJoin: '2026-03-10', status: 'ACTIVE' as const, gender: 'Female' as const },
    opening: {},
    leave: [],
    late: [],
    lateDays: 0,
    compOff: [],
    ...over,
});

describe('day counting by the type’s setting', () => {
    it('working days skip the employee’s weekly offs and holidays; calendar days count every day', () => {
        // Mon 21 Dec – Sun 27 Dec 2026: 4 working days (25th is a holiday), 7 calendar days.
        expect(countLeaveDays('2026-12-21', '2026-12-27', null, cal).days).toBe(4);
        expect(countLeaveDays('2026-12-21', '2026-12-27', null, cal, 'OFF', 'calendar').days).toBe(7);
        expect(countLeaveDays('2026-12-21', '2026-12-27', 'FIRST', cal, 'OFF', 'calendar').days).toBe(3.5);
    });
    it('a calendar-day count says weekends and public holidays are included', () => {
        expect(durationText(countLeaveDays('2026-12-21', '2026-12-27', null, cal, 'OFF', 'calendar'), null)).toBe('7 calendar days, weekends and public holidays included.');
    });
});

describe('credit date', () => {
    const m = { start: '2026-03-01', end: '2026-03-31' };
    it('start / end of the month / a custom day', () => {
        expect(creditDateIn(m, 'START')).toBe('2026-03-01');
        expect(creditDateIn(m, 'END')).toBe('2026-03-31');
        expect(creditDateIn(m, 'CUSTOM', 25)).toBe('2026-03-25');
        expect(creditDateIn({ start: '2026-02-01', end: '2026-02-28' }, 'CUSTOM', 28)).toBe('2026-02-28');
    });
    it('a joiner’s first monthly credit lands on the credit date of their first counted month', () => {
        const year = { start: '2026-01-01', end: '2026-12-31' };
        const sched = creditSchedule(yearly(), year, { dateOfJoin: '2026-03-10', status: 'ACTIVE' }, { creditDate: 'END' });
        expect(sched.credits[0].date).toBe('2026-03-31');
        const start = creditSchedule(yearly(), year, { dateOfJoin: '2026-03-10', status: 'ACTIVE' }, { creditDate: 'START' });
        expect(start.credits[0].date).toBe('2026-03-10'); // never before joining
    });
});

describe('rounding', () => {
    it('nearest half day / nearest day', () => {
        expect(roundDays(14 / 12, 'HALF')).toBe(1);
        expect(roundDays(1.3, 'HALF')).toBe(1.5);
        expect(roundDays(1.3, 'DAY')).toBe(1);
        expect(roundDays(1.3, 'NONE')).toBe(1.3);
    });
    it('applies to the running total, so credited-so-far is always rounded and the year adds up', () => {
        const credits = roundCredits(Array.from({ length: 12 }, () => ({ amount: 14 / 12 })), 'HALF');
        const running = credits.reduce<number[]>((acc, c) => [...acc, (acc[acc.length - 1] ?? 0) + c.amount], []);
        expect(running.slice(0, 4)).toEqual([1, 2.5, 3.5, 4.5]);
        expect(running[11]).toBe(14);
        expect(running.every(n => Number.isInteger(n * 2))).toBe(true);
    });
    it('Peko: a new joiner’s first Casual credit lands at the end of their first counted month, in half days', () => {
        const before = computeLeaveYear(yearInput({ today: '2026-03-30' })).balances.find(b => b.type === 'CL')!;
        expect(before.credited).toBe(0);
        expect(before.next).toEqual({ date: '2026-03-31', amount: 1 });
        const cl = computeLeaveYear(yearInput()).balances.find(b => b.type === 'CL')!;
        expect(cl.credited).toBe(1);
        // 10 counted months of 14 a year = 11.67 → 11.5 (nearest half day)
        expect(cl.allocated).toBe(11.5);
    });
});

describe('year end', () => {
    it('carry up to the limit (the rest lapses) / encash / lapse', () => {
        expect(yearEndRule(50, { yearEnd: 'carry', carryForward: 45 })).toEqual({ carried: 45, encashed: 0, lapsed: 5 });
        expect(yearEndRule(6, { yearEnd: 'encash', carryForward: 0 })).toEqual({ carried: 0, encashed: 6, lapsed: 0 });
        expect(yearEndRule(6, { yearEnd: 'lapse', carryForward: 45 })).toEqual({ carried: 0, encashed: 0, lapsed: 6 });
    });
    it('the ledger line says carried / encashed / lapsed', () => {
        expect(yearEndLedger('2027-01-01', 50, { yearEnd: 'carry', carryForward: 45 }).map(l => [l.kind, l.amount])).toEqual([
            ['CARRIED', 45],
            ['LAPSED', null],
        ]);
        expect(yearEndLedger('2027-01-01', 6, { yearEnd: 'encash', carryForward: 0 })[0]).toMatchObject({ kind: 'ENCASHED', text: '6 unused days encashed at the end of last year (paid by payroll)' });
        expect(yearEndLedger('2027-01-01', 6, { yearEnd: 'lapse', carryForward: 0 })[0]).toMatchObject({ kind: 'LAPSED', text: '6 unused days lapsed (no carry forward)' });
    });
    it('the leave year applies each type’s rule to last year’s unused days', () => {
        const y = computeLeaveYear(yearInput({ facts: { dateOfJoin: '2024-01-10', status: 'ACTIVE', gender: 'Female' }, opening: { CL: 4, EL: 50 } }));
        const cl = y.balances.find(b => b.type === 'CL')!;
        const el = y.balances.find(b => b.type === 'EL')!;
        expect(cl.carried).toBe(0);
        expect(cl.ledger.some(l => l.kind === 'LAPSED')).toBe(true);
        expect(el.carried).toBe(45);
        const encash = computeLeaveYear(
            yearInput({ policy: { ...PEKO, types: [yearly({ id: 'EL', yearEnd: 'encash' })] }, facts: { dateOfJoin: '2024-01-10', status: 'ACTIVE', gender: 'Female' }, opening: { EL: 6 } })
        );
        expect(encash.balances[0].carried).toBe(0);
        expect(encash.balances[0].ledger.find(l => l.kind === 'ENCASHED')).toBeDefined();
    });
});

describe('leaving', () => {
    it('drives the settlement: encash, bring forward, the employee’s choice, or lapse', () => {
        const y = computeLeaveYear(yearInput({ facts: { dateOfJoin: '2026-01-05', exitDate: '2026-06-30', status: 'ACTIVE', gender: 'Female' } }));
        expect(y.settlement!.find(x => x.type === 'EL')).toMatchObject({ encash: 9, bringForward: 0 });
        expect(y.settlement!.find(x => x.type === 'CL')).toMatchObject({ encash: 0, bringForward: 0, lapse: 7 });
        expect(exitSettlement({ earned: 5, approved: 1, late: 0 }, ['encash', 'prepone'])).toMatchObject({ encash: 4, bringForward: 4, choice: true });
    });
    it('maps the old leaving flags and keeps old types working', () => {
        expect(exitOptsOf({ encashOnExit: true })).toEqual(['encash']);
        expect(exitOptsOf({ onLeaving: 'BRING_FORWARD' })).toEqual(['prepone']);
        const old = migrateLeaveType({ id: 'ANNUAL', name: 'Annual', daysPerYear: 12, credit: 'MONTHLY', probation: 'MONTHLY', carryForward: 30, onLeaving: 'ENCASH', proofAfterDays: null, appliesTo: 'ALL', active: true });
        expect(old).toMatchObject({ kind: 'yearly', count: 'working', yearEnd: 'carry', carryForward: 30, exitOpts: ['encash'], limit: null });
        expect(old).not.toHaveProperty('onLeaving');
        expect(migrateLeaveType({ ...old, carryForward: 0, yearEnd: undefined })).toMatchObject({ yearEnd: 'lapse' });
    });
});

describe('per-event leave', () => {
    it('has no yearly balance and isn’t in the balance tables or deduction orders', () => {
        const y = computeLeaveYear(yearInput());
        expect(y.balances.map(b => b.type)).toEqual(['CL', 'EL']);
    });
    it('defaults: Maternity 26 weeks in calendar days from 56 days before; Paternity 7 working days, 30 before to 90 after', () => {
        expect(MATERNITY).toMatchObject({ kind: 'event', count: 'calendar', limit: 26, limitUnit: 'weeks', windowBefore: 56, windowAfter: null, appliesTo: 'FEMALE', proofAfterDays: 0 });
        expect(eventLimitDays(MATERNITY)).toBe(182);
        expect(PATERNITY).toMatchObject({ kind: 'event', count: 'working', limit: 7, limitUnit: 'days', windowBefore: 30, windowAfter: 90, appliesTo: 'MALE', proofAfterDays: 0 });
    });
    it('refuses: no event date, dates outside the window, more than the limit for that event', () => {
        const base = { start: '2026-12-01', end: '2026-12-07', days: 5, booked: 0 };
        expect(eventProblem(PATERNITY, { ...base, eventDate: null })).toBe(EVENT_MESSAGES.eventDate('Date of birth or adoption'));
        expect(eventProblem(PATERNITY, { ...base, eventDate: '2027-01-15' })).toMatch(/at most 30 days before the date of birth or adoption/);
        expect(eventProblem(PATERNITY, { ...base, eventDate: '2026-08-01' })).toMatch(/within 90 days after/);
        expect(eventProblem(PATERNITY, { ...base, eventDate: '2026-12-01' })).toBeNull();
        expect(eventProblem(PATERNITY, { ...base, eventDate: '2026-12-01', booked: 3 })).toMatch(/up to 7 days per event\. 3 days already booked/);
    });
    it('Maternity counts calendar days and refuses more than 182 days for one delivery date', () => {
        const ctx = {
            types: [MATERNITY],
            cal,
            sandwich: 'OFF' as const,
            halfDayAllowed: true,
            existing: [],
            available: {},
            pending: {},
            onProbation: false,
            eventBooked: () => 0,
        };
        const ok = validateLeave({ type: 'MATERNITY', start: '2026-12-01', end: '2027-05-31', eventDate: '2026-12-20', reason: 'Delivery', proof: { name: 'cert.pdf' } }, ctx);
        expect(ok).toMatchObject({ days: 182, eventDate: '2026-12-20' });
        expect(() => validateLeave({ type: 'MATERNITY', start: '2026-12-01', end: '2027-06-01', eventDate: '2026-12-20', reason: 'x', proof: { name: 'c.pdf' } }, ctx)).toThrow(/up to 26 weeks per event/);
        expect(() =>
            validateLeave({ type: 'MATERNITY', start: '2026-12-01', end: '2026-12-31', eventDate: '2026-12-20', reason: 'x', proof: { name: 'c.pdf' } }, { ...ctx, eventBooked: () => 160 })
        ).toThrow(/160 days already booked/);
        expect(() => validateLeave({ type: 'MATERNITY', start: '2026-10-01', end: '2026-12-31', eventDate: '2026-12-20', reason: 'x', proof: { name: 'c.pdf' } }, ctx)).toThrow(/at most 56 days before/);
    });
});

describe('loss of pay', () => {
    const balances = [
        { name: 'Annual', available: 9.5 },
        { name: 'Casual', available: 6.5 },
        { name: 'Comp off', available: 0 },
    ];
    it('only once paid leave is used up (yearly balances and comp off), or any time', () => {
        expect(lopProblem('USED_UP', balances)).toBe('You still have paid leave: 9.5 Annual · 6.5 Casual. Loss of pay is only once all of it is used up.');
        expect(lopProblem('USED_UP', balances.map(b => ({ ...b, available: 0 })))).toBeNull();
        expect(lopProblem('ANY_TIME', balances)).toBeNull();
    });
    it('a loss-of-pay request: working days, overlap, the rule, a reason; no balance, no limit', () => {
        const ctx = { cal, halfDayAllowed: true, existing: [{ start: '2026-12-10', end: '2026-12-10', half: null, summary: 'Annual leave, 10 Dec' }], rule: 'ANY_TIME' as const, balances };
        expect(validateLop({ start: '2026-12-01', end: '2026-12-04', reason: 'Personal' }, ctx)).toEqual({ type: LOP, lop: true, start: '2026-12-01', end: '2026-12-04', half: null, days: 4, reason: 'Personal' });
        expect(() => validateLop({ start: '2026-12-09', end: '2026-12-11', reason: 'x' }, ctx)).toThrow(/already have leave/);
        expect(() => validateLop({ start: '2026-12-01', end: '2026-12-04', reason: 'x' }, { ...ctx, rule: 'USED_UP' })).toThrow(/You still have paid leave/);
        expect(() => validateLop({ start: '2026-12-05', end: '2026-12-06', reason: 'x' }, ctx)).toThrow(/weekly offs or holidays/);
        expect(() => validateLop({ start: '2026-12-01', reason: ' ' }, ctx)).toThrow('Add a short reason.');
    });
    it('comp off counts as paid leave; per-event types never do (they have no balance)', () => {
        expect(lopProblem('USED_UP', [{ name: 'Comp off', available: 1 }])).toMatch(/1 Comp off/);
        expect(COMP_OFF).toBe('COMP_OFF');
    });
});

describe('extra approval for longer leave', () => {
    const people = [
        { id: 1, department: 'Engineering', managerId: 21 }, // head: reports to the CEO, outside Engineering
        { id: 2, department: 'Engineering', managerId: 1 },
        { id: 3, department: 'Engineering', managerId: 2 },
        { id: 4, department: 'Sales', managerId: 21 },
        { id: 21, department: 'Leadership', managerId: null },
    ];
    it('only when on and longer than N days', () => {
        expect(needsEndorsement({ enabled: true, overDays: 5 }, 6)).toBe(true);
        expect(needsEndorsement({ enabled: true, overDays: 5 }, 5)).toBe(false);
        expect(needsEndorsement({ enabled: false, overDays: 5 }, 9)).toBe(false);
    });
    it('the department head is the person whose own manager is outside the department (or who has none)', () => {
        expect(departmentHead(people, 'Engineering')?.id).toBe(1);
        expect(departmentHead(people, 'Leadership')?.id).toBe(21);
        expect(departmentHead(people, 'Marketing')).toBeNull();
    });
    const trail = (l1: number): ApprovalTrail => ({
        type: 'leave',
        status: 'PENDING_MANAGER',
        steps: [
            { level: 1, role: 'MANAGER', approverId: l1, approverName: `P${l1}` },
            { level: 2, role: 'HR' },
        ],
    });
    it('adds the step after level 1 and before level 2', () => {
        const t = withEndorsement(trail(2), { id: 1, name: 'Head' }, 3);
        expect(t.steps.map(s => [s.level, s.role, s.approverId ?? null, Boolean(s.endorsement)])).toEqual([
            [1, 'MANAGER', 2, false],
            [1, 'MANAGER', 1, true],
            [2, 'HR', null, false],
        ]);
        expect(t.status).toBe('PENDING_MANAGER');
    });
    it('is skipped when the endorser is the level 1 approver or the employee', () => {
        expect(withEndorsement(trail(1), { id: 1, name: 'Head' }, 3).steps).toHaveLength(2);
        expect(withEndorsement(trail(21), { id: 1, name: 'Head' }, 1).steps).toHaveLength(2);
        expect(withEndorsement(trail(2), null, 3).steps).toHaveLength(2);
    });
});
