// PROTOTYPE-SETUP (Leave policy settings): the rules that let HR set up Peko's own Leave & Attendance Policy (June 2026)
// through settings — day counting, credit date, rounding, year end, leaving options, per-event leave, loss of pay and
// the endorsement step for longer leave.
import { describe, expect, it } from 'vitest';

import type { ApprovalTrail, LeavePolicy, LeaveTypeConfig, SandwichConfig, Weekday } from '@src/domains/attendanceTimesheet/types';

import { DEFAULT_LEAVE_POLICY, DEFAULT_LEAVE_TYPES } from '../attendance';
import {
    COMP_OFF,
    EVENT_MESSAGES,
    LOP,
    computeLeaveYear,
    countLeaveDays,
    autoEnd,
    creditDateIn,
    creditSchedule,
    creditedBy,
    dailyCreditToday,
    eventDateLabel,
    eventEntitlement,
    eventWindow,
    maternityOffered,
    maternityProblem,
    maternityRequired,
    maternityRuleOf,
    migrateLeavePolicy,
    sandwichOf,
    startRange,
    startRangeText,
    departmentHead,
    durationText,
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
    excess: 'lapse',
    halfDay: true,
    trigger: 'other',
    docRequired: false,
    docName: '',
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
    it('drives the settlement: encash, bring forward, or lapse (one option per type)', () => {
        const y = computeLeaveYear(yearInput({ facts: { dateOfJoin: '2026-01-05', exitDate: '2026-06-30', status: 'ACTIVE', gender: 'Female' } }));
        expect(y.settlement!.find(x => x.type === 'EL')).toMatchObject({ encash: 9, bringForward: 0 });
        expect(y.settlement!.find(x => x.type === 'CL')).toMatchObject({ encash: 0, bringForward: 0, lapse: 7 });
        expect(exitSettlement({ earned: 5, approved: 1, late: 0 }, ['prepone'])).toEqual({ encash: 0, bringForward: 4, recover: 0 });
    });
    it('maps the old leaving flags (both ticked = the employee chose → encash) and keeps old types working', () => {
        expect(exitOptsOf({ encashOnExit: true })).toEqual(['encash']);
        expect(exitOptsOf({ onLeaving: 'BRING_FORWARD' })).toEqual(['prepone']);
        expect(exitOptsOf({ exitOpts: ['encash', 'prepone'] })).toEqual(['encash']);
        expect(exitOptsOf({ exitOpts: [] })).toEqual([]);
        const old = migrateLeaveType({ id: 'ANNUAL', name: 'Annual', daysPerYear: 12, credit: 'MONTHLY', probation: 'MONTHLY', carryForward: 30, onLeaving: 'ENCASH', proofAfterDays: null, appliesTo: 'ALL', active: true }, false);
        expect(old).toMatchObject({ kind: 'yearly', count: 'working', yearEnd: 'carry', excess: 'lapse', carryForward: 30, exitOpts: ['encash'], limit: null, halfDay: false });
        expect(old).not.toHaveProperty('onLeaving');
        expect(migrateLeaveType({ ...old, carryForward: 0, yearEnd: undefined })).toMatchObject({ yearEnd: 'lapse' });
    });
});

describe('migrations (Leave settings rework)', () => {
    it('old prob values stay; yearEnd carry gets excess lapse; the company half-day setting goes on each yearly type', () => {
        const stored = { ...DEFAULT_LEAVE_POLICY, sandwich: 'WEEKLY_OFFS', types: [{ ...yearly({ probation: 'NONE', yearEnd: 'carry', carryForward: 10 }), excess: undefined, halfDay: undefined }] };
        const p = migrateLeavePolicy(stored, undefined, false);
        expect(p.types[0]).toMatchObject({ probation: 'NONE', yearEnd: 'carry', excess: 'lapse', halfDay: false });
        expect(p.sandwich).toMatchObject({ on: true, when: 'always', weeklyOffs: true, holidays: false });
        expect(p.types.some(t => t.id === 'MATERNITY')).toBe(true); // every company gets Maternity
    });
    it('old per-event eventLabel → trigger other (its label kept); old maternity weeks → days', () => {
        const ev = migrateLeaveType({ ...yearly({ kind: 'event', limit: 3, eventLabel: 'Date of the move' }), trigger: undefined });
        expect(ev).toMatchObject({ trigger: 'other', eventLabel: 'Date of the move' });
        expect(eventDateLabel(ev)).toBe('Date of the move');
        expect(maternityRuleOf({ mat: { w1: 26, w2: 12, pre1: 8 } })).toEqual({ d1: 182, d2: 182, d3: 84, pre: 8, post: 0 });
        expect(maternityRuleOf({ mat: { w1: 30, w2: 14, pre1: 6 } })).toEqual({ d1: 210, d2: 210, d3: 98, pre: 6, post: 0 });
        // last run's shape: 26 weeks from 56 days before
        const m = migrateLeaveType({ id: 'MATERNITY', name: 'Maternity', kind: 'event', count: 'calendar', limit: 26, limitUnit: 'weeks', windowBefore: 56, windowAfter: null });
        expect(m).toMatchObject({ system: 'maternity', mat: { d1: 182, d2: 182, d3: 84, pre: 8, post: 0 }, docRequired: true, appliesTo: 'FEMALE' });
    });
});

describe('yearly types: probation and the four end-of-cycle options', () => {
    const year = { start: '2026-01-01', end: '2026-12-31' };
    it('probation No: nothing credited until Active; Daily: accrues day by day while on probation', () => {
        const none = creditSchedule(yearly({ probation: 'NONE' }), year, { dateOfJoin: '2026-03-02', status: 'PROBATION' });
        expect(none.credits).toEqual([]);
        const daily = creditSchedule(yearly({ probation: 'DAILY', credit: 'MONTHLY' }), year, { dateOfJoin: '2026-03-02', status: 'PROBATION' });
        expect(daily.daily).not.toBeNull();
        expect(creditedBy(daily, yearly(), '2026-03-31', year, '2026-03-02')).toBeCloseTo((14 * 30) / 365, 5);
    });
    it('all lapse / all encashed / carry up to N, the rest lapses / carry up to N, the rest encashed — with the ledger line', () => {
        expect(yearEndRule(12, { yearEnd: 'lapse', carryForward: 0 })).toEqual({ carried: 0, encashed: 0, lapsed: 12 });
        expect(yearEndRule(12, { yearEnd: 'encash', carryForward: 0 })).toEqual({ carried: 0, encashed: 12, lapsed: 0 });
        expect(yearEndRule(12, { yearEnd: 'carry', carryForward: 10, excess: 'lapse' })).toEqual({ carried: 10, encashed: 0, lapsed: 2 });
        expect(yearEndRule(12, { yearEnd: 'carry', carryForward: 10, excess: 'encash' })).toEqual({ carried: 10, encashed: 2, lapsed: 0 });
        expect(yearEndLedger('2027-01-01', 12, { yearEnd: 'carry', carryForward: 10, excess: 'encash' }).map(l => l.text)).toEqual([
            'Carried forward from last year (limit 10)',
            '2 unused days encashed at the end of last year (above the carry-forward limit of 10) (paid by payroll)',
        ]);
        expect(yearEndLedger('2027-01-01', 12, { yearEnd: 'carry', carryForward: 10, excess: 'lapse' }).map(l => l.text)).toEqual([
            'Carried forward from last year (limit 10)',
            '2 unused days lapsed (carry-forward limit 10)',
        ]);
    });
    it('half days are per type; documents only above N days', () => {
        const ctx = { types: [yearly({ halfDay: false, proofAfterDays: 2 })], cal, sandwich: 'OFF' as const, halfDayAllowed: true, existing: [], available: { CL: 10 }, pending: {}, onProbation: false };
        expect(() => validateLeave({ type: 'CL', start: '2026-12-01', half: 'FIRST', reason: 'x' }, ctx)).toThrow('Casual leave can’t be taken in half days. Apply for full days.');
        expect(validateLeave({ type: 'CL', start: '2026-12-01', end: '2026-12-02', reason: 'x' }, ctx).days).toBe(2);
        expect(() => validateLeave({ type: 'CL', start: '2026-12-01', end: '2026-12-03', reason: 'x' }, ctx)).toThrow('Casual leave of more than 2 days needs a supporting document.');
    });
});

describe('sandwich rule', () => {
    it('the 1st–9th example: 6 days off-rule, 9 days on-rule with threshold 4', () => {
        // 1st = Mon 1 Mar 2027: the 6th / 7th are Sat / Sun, the 4th (Thu) a holiday.
        const cal9 = { weeklyOff: ['SATURDAY', 'SUNDAY'] as Weekday[], isHoliday: (d: string) => d === '2027-03-04' };
        const rule = (r: Partial<SandwichConfig>): SandwichConfig => ({ on: true, when: 'longer', overDays: 4, weeklyOffs: true, holidays: true, ...r });
        expect(countLeaveDays('2027-03-01', '2027-03-09', null, cal9, rule({ on: false })).days).toBe(6);
        expect(countLeaveDays('2027-03-01', '2027-03-09', null, cal9, rule({})).days).toBe(9);
        expect(countLeaveDays('2027-03-01', '2027-03-09', null, cal9, rule({ overDays: 9 })).days).toBe(6); // 9 days isn't more than 9
        expect(countLeaveDays('2027-03-01', '2027-03-09', null, cal9, rule({ holidays: false })).days).toBe(8);
        expect(countLeaveDays('2027-03-01', '2027-03-09', null, cal9, rule({ weeklyOffs: false })).days).toBe(7);
        expect(countLeaveDays('2027-03-01', '2027-03-09', 'FIRST', cal9, rule({})).days).toBe(3); // half days aren't sandwiched
    });
    it('the older enum maps onto the settings', () => {
        expect(sandwichOf('WEEKLY_OFFS_AND_HOLIDAYS')).toMatchObject({ on: true, when: 'always', weeklyOffs: true, holidays: true });
        expect(sandwichOf('OFF').on).toBe(false);
    });
});

describe('credit date: monthly and daily credits', () => {
    const year = { start: '2026-01-01', end: '2026-12-31' };
    it('monthly on the 1st / last day / a custom day', () => {
        const at = (rule: 'START' | 'END' | 'CUSTOM') => creditSchedule(yearly(), year, { dateOfJoin: '2020-01-01', status: 'ACTIVE' }, { creditDate: rule, creditDay: 15 }).credits[2].date;
        expect([at('START'), at('END'), at('CUSTOM')]).toEqual(['2026-03-01', '2026-03-31', '2026-03-15']);
    });
    it('daily at the start of the day / once the day is over / from the set time', () => {
        expect(dailyCreditToday('START', '08:00')).toBe(true);
        expect(dailyCreditToday('END', '23:59')).toBe(false);
        expect(dailyCreditToday('CUSTOM', '11:59', '12:00')).toBe(false);
        expect(dailyCreditToday('CUSTOM', '12:00', '12:00')).toBe(true);
        const sched = creditSchedule(yearly({ credit: 'DAILY', daysPerYear: 36.5 }), year, { dateOfJoin: '2020-01-01', status: 'ACTIVE' });
        // 36.5 a year = 0.1 a day: by 10 Jan, 1.0 (start) or 0.9 (end)
        expect(creditedBy(sched, { daysPerYear: 36.5 }, '2026-01-10', year, '2020-01-01', true)).toBeCloseTo(1, 5);
        expect(creditedBy(sched, { daysPerYear: 36.5 }, '2026-01-10', year, '2020-01-01', false)).toBeCloseTo(0.9, 5);
    });
});

describe('per-event leave', () => {
    it('has no yearly balance and isn’t in the balance tables or deduction orders', () => {
        const y = computeLeaveYear(yearInput());
        expect(y.balances.map(b => b.type)).toEqual(['CL', 'EL']);
    });
    it('defaults: Maternity statutory (182 / 182 / 84 days, 8 weeks before); Paternity 7 working days, 30 before to 90 after', () => {
        expect(MATERNITY).toMatchObject({ system: 'maternity', kind: 'event', count: 'calendar', appliesTo: 'FEMALE', docRequired: true, mat: { d1: 182, d2: 182, d3: 84, pre: 8, post: 0 } });
        expect(eventDateLabel(MATERNITY)).toBe('Expected or actual date of delivery');
        expect(PATERNITY).toMatchObject({ kind: 'event', count: 'working', limit: 7, limitUnit: 'days', windowBefore: 30, windowAfter: 90, appliesTo: 'MALE', trigger: 'birthadopt', docRequired: true });
        expect(eventDateLabel(PATERNITY)).toBe('Date of birth or adoption');
    });
    it('refuses: no event date, a start outside the window, longer than the limit, a second request for the same event', () => {
        const base = { start: '2026-12-01', days: 5 };
        expect(eventProblem(PATERNITY, { ...base, eventDate: null })).toBe('Add the date of birth or adoption.');
        expect(eventProblem(PATERNITY, { ...base, eventDate: '2027-01-15' })).toBe('Paternity leave can start from Wed 16 Dec at the earliest.');
        expect(eventProblem(PATERNITY, { ...base, eventDate: '2026-08-01' })).toBe('Paternity leave has to start by Fri 30 Oct.');
        expect(eventProblem(PATERNITY, { ...base, eventDate: '2026-12-01' })).toBeNull();
        expect(eventProblem(PATERNITY, { ...base, days: 8, eventDate: '2026-12-01' })).toBe('Paternity leave is up to 7 days (working days) for one event. Shorten the dates.');
        expect(eventProblem(PATERNITY, { ...base, eventDate: '2026-12-01', taken: true })).toBe(EVENT_MESSAGES.taken('Paternity leave'));
    });
    it('the window is about the START date only (a block can run past the window end)', () => {
        expect(eventProblem(PATERNITY, { start: '2027-02-26', days: 7, eventDate: '2026-12-01' })).toBeNull(); // starts day 87, ends later
    });
    it('the end date fills in for the full entitlement (working or calendar days)', () => {
        expect(autoEnd('2026-12-01', 7, 'working', cal)).toBe('2026-12-09');
        expect(autoEnd('2026-12-21', 5, 'working', cal)).toBe('2026-12-28'); // 25th holiday, weekend
        expect(autoEnd('2026-12-01', 182, 'calendar', cal)).toBe('2027-05-31');
        expect(startRangeText(startRange({ before: 30, after: 90 }, '2026-12-01'))).toBe('Can start between Sun 1 Nov and Mon 1 Mar');
    });
    it('Maternity: entitlement and earliest start by child (third: 84 days, 6 weeks before at most)', () => {
        expect(eventEntitlement(MATERNITY, 1)).toBe(182);
        expect(eventEntitlement(MATERNITY, 3)).toBe(84);
        expect(eventWindow(MATERNITY, 1)).toEqual({ before: 56, after: 0 });
        expect(eventWindow(MATERNITY, 3)).toEqual({ before: 42, after: 0 });
        expect(eventProblem(MATERNITY, { start: '2026-11-01', days: 84, eventDate: '2026-12-20' })).toBe(EVENT_MESSAGES.child);
        expect(eventProblem(MATERNITY, { start: '2026-11-01', days: 84, eventDate: '2026-12-20', child: 3 })).toBe('Maternity leave can start from Sun 8 Nov at the earliest.');
        expect(eventProblem(MATERNITY, { start: '2026-11-08', days: 85, eventDate: '2026-12-20', child: 3 })).toBe('Maternity leave is up to 84 days (calendar days) for one event. Shorten the dates.');
        expect(eventProblem(MATERNITY, { start: '2026-11-01', days: 182, eventDate: '2026-12-20', child: 1 })).toBeNull();
    });
    it('Maternity counts calendar days; one request per delivery date; the document is required', () => {
        const ctx = { types: [MATERNITY], cal, sandwich: 'OFF' as const, halfDayAllowed: true, existing: [], available: {}, pending: {}, onProbation: false, eventTaken: () => false };
        const ok = validateLeave({ type: 'MATERNITY', start: '2026-12-01', end: '2027-05-31', eventDate: '2026-12-20', child: 1, reason: 'Delivery', proof: { name: 'cert.pdf' } }, ctx);
        expect(ok).toMatchObject({ days: 182, eventDate: '2026-12-20', child: 1 });
        expect(() => validateLeave({ type: 'MATERNITY', start: '2026-12-01', end: '2027-06-01', eventDate: '2026-12-20', child: 1, reason: 'x', proof: { name: 'c.pdf' } }, ctx)).toThrow(/up to 182 days/);
        expect(() => validateLeave({ type: 'MATERNITY', start: '2026-12-01', end: '2026-12-31', eventDate: '2026-12-20', child: 1, reason: 'x', proof: { name: 'c.pdf' } }, { ...ctx, eventTaken: () => true })).toThrow(/taken in one go/);
        expect(() => validateLeave({ type: 'MATERNITY', start: '2026-12-01', end: '2026-12-31', eventDate: '2026-12-20', child: 1, reason: 'x' }, ctx)).toThrow(
            'Maternity leave needs a supporting document: Medical certificate with the expected date of delivery.'
        );
    });
    it('the statutory minimum and the headcount rule', () => {
        expect(maternityProblem({ d1: 182, d2: 182, d3: 84, pre: 8, post: 0 })).toBeNull();
        expect(maternityProblem({ d1: 181, d2: 182, d3: 84, pre: 8, post: 0 })).toMatch(/First child: at least 182 days/);
        expect(maternityProblem({ d1: 182, d2: 182, d3: 83, pre: 8, post: 0 })).toMatch(/Third child or later: at least 84 days/);
        expect(maternityProblem({ d1: 182, d2: 182, d3: 84, pre: 9, post: 0 })).toMatch(/at most 8 weeks/);
        expect(maternityRequired(11)).toBe(true);
        expect(maternityRequired(10)).toBe(false);
        expect(maternityOffered({ matOn: false }, 10)).toBe(false);
        expect(maternityOffered({ matOn: true }, 10)).toBe(true);
        expect(maternityOffered({ matOn: false }, 21)).toBe(true);
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
