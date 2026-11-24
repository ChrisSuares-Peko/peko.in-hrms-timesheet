// PROTOTYPE-SETUP (Leave module): the leave rules — one describe per rule (docs/api/leave.md).
import { describe, expect, it } from 'vitest';

import type { LeavePolicy, LeaveTypeConfig, Weekday } from '@src/domains/attendanceTimesheet/types';

import { DEFAULT_LEAVE_POLICY, DEFAULT_SETTINGS, decide, resubmitTrail, startTrail, personApprover } from '../attendance';
import {
    COMP_OFF,
    COMP_OFF_MESSAGES,
    DEFAULT_LEAVE_TYPES,
    DEFAULT_POLICY,
    LEAVE_MESSAGES,
    LEAVE_ROUTE,
    accrualText,
    adminRequestViews,
    allocateLateDeductions,
    applyCancellation,
    appliesTo,
    availableBalance,
    cancellationRange,
    carryForward,
    compOffDays,
    compOffLedger,
    compOffProblem,
    computeLeaveYear,
    countLeaveDays,
    countedMonths,
    creditSchedule,
    creditedBy,
    durationText,
    exitSettlement,
    leaveYearOf,
    leavesClash,
    lossOfPayOnApproval,
    migrateLeavePolicy,
    exitOptsOf,
    needsProof,
    newTypeId,
    rollForwardDay,
    typeLabel,
    typesForEmployee,
    validateLeave,
} from '../leave';

const type = (over: Partial<LeaveTypeConfig> = {}): LeaveTypeConfig => ({
    id: 'T',
    name: 'Test',
    daysPerYear: 12,
    credit: 'MONTHLY',
    probation: 'MONTHLY',
    kind: 'yearly',
    count: 'working',
    yearEnd: 'lapse',
    carryForward: 0,
    exitOpts: ['prepone'],
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
const YEAR = { start: '2026-04-01', end: '2027-03-31' };
const ACTIVE = { dateOfJoin: '2020-01-10', status: 'ACTIVE' as const };
const MON_FRI: Weekday[] = ['SATURDAY', 'SUNDAY'];
const cal = (holidays: string[] = [], weeklyOff: Weekday[] = MON_FRI) => ({ weeklyOff, isHoliday: (d: string) => holidays.includes(d) });

describe('leave year', () => {
    it('company cycle: the year containing the day, from the cycle start', () => {
        expect(leaveYearOf('2026-11-20', { year: 'COMPANY', cycleStart: '04-01' }, '2020-01-10')).toEqual(YEAR);
        expect(leaveYearOf('2026-02-01', { year: 'COMPANY', cycleStart: '04-01' }, '2020-01-10')).toEqual({ start: '2025-04-01', end: '2026-03-31' });
    });
    it('joining date: from the joining anniversary (29 Feb → 28 Feb)', () => {
        expect(leaveYearOf('2026-11-20', { year: 'JOINING', cycleStart: '04-01' }, '2022-07-15')).toEqual({ start: '2026-07-15', end: '2027-07-14' });
        expect(leaveYearOf('2026-03-10', { year: 'JOINING', cycleStart: '04-01' }, '2024-02-29')).toEqual({ start: '2026-02-28', end: '2027-02-27' });
    });
});

describe('credits', () => {
    it('at the start of the leave cycle: the whole year at once', () => {
        const s = creditSchedule(type({ credit: 'CYCLE_START', daysPerYear: 8 }), YEAR, ACTIVE);
        expect(s.entitlement).toBe(8);
        expect(s.credits).toEqual([{ date: '2026-04-01', kind: 'YEARLY', amount: 8, text: 'Yearly credit' }]);
    });
    it('monthly: days ÷ 12 on the 1st, not rounded', () => {
        const s = creditSchedule(type({ daysPerYear: 13 }), YEAR, ACTIVE);
        expect(s.credits).toHaveLength(12);
        expect(s.credits[0]).toMatchObject({ date: '2026-04-01', amount: 13 / 12 });
        expect(creditedBy(s, type({ daysPerYear: 13 }), '2026-11-20', YEAR, ACTIVE.dateOfJoin)).toBeCloseTo((13 / 12) * 8);
    });
    it('daily: days × days elapsed ÷ days in the cycle', () => {
        const t = type({ credit: 'DAILY', daysPerYear: 365 });
        const s = creditSchedule(t, YEAR, ACTIVE);
        // 1 Apr → 10 Apr = 10 days of a 365-day cycle.
        expect(creditedBy(s, t, '2026-04-10', YEAR, ACTIVE.dateOfJoin)).toBeCloseTo(10);
        expect(s.entitlement).toBeCloseTo(365);
    });
});

describe('15th-of-the-month pro-rata', () => {
    it('joining on or before the 15th counts the month; after it, it doesn’t', () => {
        expect(countedMonths('2026-04-01', '2026-06-15')).toHaveLength(10);
        expect(countedMonths('2026-04-01', '2026-06-16')).toHaveLength(9);
    });
    it('leaving on or after the 15th counts the month; before it, it doesn’t', () => {
        expect(countedMonths('2026-04-01', '2020-01-01', '2026-06-15')).toHaveLength(3);
        expect(countedMonths('2026-04-01', '2020-01-01', '2026-06-14')).toHaveLength(2);
    });
    it('a start-of-cycle type is pro-rated for a joiner, credited on the joining day', () => {
        const s = creditSchedule(type({ credit: 'CYCLE_START', daysPerYear: 12, probation: 'FULL' }), YEAR, { dateOfJoin: '2026-06-10', status: 'ACTIVE' });
        expect(s.credits).toEqual([{ date: '2026-06-10', kind: 'PRORATED_JOIN', amount: 10, text: 'Pro-rated for the months left after joining' }]);
    });
});

describe('status-based probation', () => {
    const joiner = { dateOfJoin: '2026-07-01', status: 'PROBATION' as const };
    it('credited monthly: monthly credits while on probation, nothing upfront', () => {
        const s = creditSchedule(type({ credit: 'CYCLE_START', probation: 'MONTHLY' }), YEAR, joiner);
        expect(s.credits.every(c => c.kind === 'PROBATION_MONTHLY')).toBe(true);
        expect(creditedBy(s, type(), '2026-11-20', YEAR, joiner.dateOfJoin)).toBeCloseTo(5);
    });
    it('full entitlement: probation doesn’t matter', () => {
        const s = creditSchedule(type({ credit: 'CYCLE_START', probation: 'FULL' }), YEAR, joiner);
        expect(s.credits).toHaveLength(1);
        expect(s.credits[0].amount).toBe(9);
    });
    it('not available: nothing while on probation', () => {
        const s = creditSchedule(type({ credit: 'CYCLE_START', probation: 'NONE' }), YEAR, joiner);
        expect(s.credits).toEqual([]);
    });
    it('marked Active: the normal rule from that day; start-of-cycle types credit the rest of the year then', () => {
        const confirmed = { dateOfJoin: '2026-07-01', status: 'ACTIVE' as const, confirmedOn: '2026-11-20' };
        const none = creditSchedule(type({ credit: 'CYCLE_START', probation: 'NONE' }), YEAR, confirmed);
        // Confirmed after the 15th: December to March count (4 of 12).
        expect(none.credits).toEqual([{ date: '2026-11-20', kind: 'PROBATION_REST', amount: 4, text: 'Credited when probation ended (pro-rated from then)' }]);
        const monthly = creditSchedule(type({ credit: 'CYCLE_START', probation: 'MONTHLY' }), YEAR, confirmed);
        expect(monthly.credits.at(-1)).toMatchObject({ date: '2026-11-20', kind: 'PROBATION_REST', amount: 4, text: 'Rest of the year, credited when probation ended' });
        expect(monthly.entitlement).toBe(9);
    });
});

describe('carry forward and lapse', () => {
    it('carries up to the limit; the rest lapses', () => {
        expect(carryForward(5, 30)).toEqual({ carried: 5, lapsed: 0 });
        expect(carryForward(5, 2)).toEqual({ carried: 2, lapsed: 3 });
        expect(carryForward(2, 0)).toEqual({ carried: 0, lapsed: 2 });
    });
    it('rolls forward automatically on the last working day of the cycle', () => {
        // 31 Mar 2027 is a Wednesday; with 31 Mar a holiday it's the 30th.
        expect(rollForwardDay('2027-03-31', d => !cal().isHoliday(d) && !['2027-03-27', '2027-03-28'].includes(d))).toBe('2027-03-31');
        expect(rollForwardDay('2027-03-31', d => d !== '2027-03-31')).toBe('2027-03-30');
    });
});

describe('exit settlement', () => {
    it('unused days follow the leaving option: encash, bring forward or lapse (both ticked in older data = encash); days taken beyond what was earned are recovered', () => {
        expect(exitSettlement({ earned: 6, approved: 2, late: 0.5 }, ['encash'])).toEqual({ encash: 3.5, bringForward: 0, recover: 0 });
        expect(exitSettlement({ earned: 6, approved: 2, late: 0 }, ['prepone'])).toEqual({ encash: 0, bringForward: 4, recover: 0 });
        expect(exitSettlement({ earned: 6, approved: 2, late: 0 }, ['encash', 'prepone'])).toEqual({ encash: 4, bringForward: 0, recover: 0 });
        expect(exitSettlement({ earned: 6, approved: 2, late: 0 }, [])).toEqual({ encash: 0, bringForward: 0, recover: 0, lapse: 4 });
        expect(exitSettlement({ earned: 3, approved: 5, late: 0 }, ['encash'])).toEqual({ encash: 0, bringForward: 0, recover: 2 });
        expect(exitSettlement({ earned: 3, approved: 5, late: 0 }, ['prepone'])).toEqual({ encash: 0, bringForward: 0, recover: 2 });
    });
    it('maps the old leaving fields: encash true / ENCASH → [encash], false / BRING_FORWARD → [prepone] (stored policies too)', () => {
        expect(exitOptsOf({ encashOnExit: true })).toEqual(['encash']);
        expect(exitOptsOf({ encashOnExit: false })).toEqual(['prepone']);
        expect(exitOptsOf({ onLeaving: 'ENCASH', encashOnExit: false })).toEqual(['encash']);
        expect(exitOptsOf({ onLeaving: 'BRING_FORWARD' })).toEqual(['prepone']);
        expect(exitOptsOf({ exitOpts: ['prepone', 'encash'] })).toEqual(['encash']);
        const stored = { ...DEFAULT_LEAVE_POLICY, types: DEFAULT_LEAVE_POLICY.types.map(({ exitOpts: _o, ...t }) => ({ ...t, encashOnExit: t.id === 'ANNUAL' })) };
        const p = migrateLeavePolicy(stored);
        expect(p.types.find(t => t.id === 'ANNUAL')?.exitOpts).toEqual(['encash']);
        expect(p.types.find(t => t.id === 'CASUAL')?.exitOpts).toEqual(['prepone']);
        expect(p.types.some(t => 'encashOnExit' in t)).toBe(false);
    });
});

describe('available', () => {
    it('credited − approved − late deductions − leave in request (10 − 4 − 0 − 2 = 4)', () => {
        expect(availableBalance({ credited: 10, approved: 4, late: 0, inRequest: 2 })).toBe(4);
        expect(availableBalance({ credited: 10, approved: 4, late: 0.5, inRequest: 2 })).toBe(3.5);
    });
});

describe('day counting', () => {
    it('counts only the employee’s own working days (weekly offs and holidays don’t count)', () => {
        // Mon 16 – Fri 20 Nov 2026, Wednesday a holiday.
        expect(countLeaveDays('2026-11-16', '2026-11-20', null, cal(['2026-11-18'])).days).toBe(4);
        // Someone who works Sunday–Thursday: Fri and Sat are off.
        expect(countLeaveDays('2026-11-16', '2026-11-22', null, cal([], ['FRIDAY', 'SATURDAY'])).days).toBe(5);
    });
    it('half days over a range: 0.5 per working day (Mon–Fri = 2.5)', () => {
        const c = countLeaveDays('2026-11-16', '2026-11-20', 'FIRST', cal());
        expect(c).toMatchObject({ working: 5, days: 2.5 });
        expect(durationText(c, 'FIRST')).toBe('5 half days = 2.5 days of leave. You start work at mid-shift each day.');
    });
    it('sandwich rule: weekly offs between two leave days count (Fri + Mon = 4); off = 2', () => {
        expect(countLeaveDays('2026-11-20', '2026-11-23', null, cal(), 'WEEKLY_OFFS').days).toBe(4);
        expect(countLeaveDays('2026-11-20', '2026-11-23', null, cal(), 'OFF').days).toBe(2);
        expect(durationText(countLeaveDays('2026-11-20', '2026-11-23', null, cal(), 'WEEKLY_OFFS'), null)).toBe('4 days: 2 working days + 2 days off in between (sandwich rule).');
    });
    it('sandwich rule: never at the edges, never for half days; holidays only with "weekly offs and holidays"', () => {
        expect(countLeaveDays('2026-11-21', '2026-11-23', null, cal(), 'WEEKLY_OFFS').days).toBe(1);
        expect(countLeaveDays('2026-11-20', '2026-11-23', 'FIRST', cal(), 'WEEKLY_OFFS').days).toBe(1);
        // Tue 17 a holiday between Mon 16 and Wed 18.
        expect(countLeaveDays('2026-11-16', '2026-11-18', null, cal(['2026-11-17']), 'WEEKLY_OFFS').days).toBe(2);
        expect(countLeaveDays('2026-11-16', '2026-11-18', null, cal(['2026-11-17']), 'WEEKLY_OFFS_AND_HOLIDAYS').days).toBe(3);
    });
});

describe('comp off', () => {
    it('half a shift or more = 0.5 day; a full shift = 1', () => {
        expect(compOffDays(540, 540)).toBe(1);
        expect(compOffDays(300, 540)).toBe(0.5);
        expect(compOffDays(200, 540)).toBe(0);
    });
    const ok = { date: '2026-11-15', today: '2026-11-20', isOffDay: true, dayText: 'Sun 15 Nov', expiryDays: 60, workedMinutes: 540, workedText: '9h', shiftMinutes: 540, attendance: true, alreadyClaimed: false, overtimeClaimed: false };
    it('refuses working days, days not worked, already claimed, too old and overtime days', () => {
        expect(compOffProblem(ok)).toBeNull();
        expect(compOffProblem({ ...ok, isOffDay: false })).toBe(COMP_OFF_MESSAGES.workingDay('Sun 15 Nov'));
        expect(compOffProblem({ ...ok, workedMinutes: 0 })).toBe(COMP_OFF_MESSAGES.notWorked(true));
        expect(compOffProblem({ ...ok, alreadyClaimed: true })).toBe(COMP_OFF_MESSAGES.claimed);
        expect(compOffProblem({ ...ok, date: '2026-09-01' })).toBe(COMP_OFF_MESSAGES.tooOld(60));
        expect(compOffProblem({ ...ok, overtimeClaimed: true })).toBe(COMP_OFF_MESSAGES.overtime);
        expect(compOffProblem({ ...ok, date: '2026-11-21' })).toBe(COMP_OFF_MESSAGES.future);
    });
    it('expires after the setting; the oldest credit is used first', () => {
        const credits = [
            { worked: '2026-08-01', approvedOn: '2026-08-03', days: 1 },
            { worked: '2026-10-10', approvedOn: '2026-10-12', days: 1 },
        ];
        // One day used: it comes out of the August credit, so nothing from August expires.
        expect(compOffLedger(credits, 1, 60, '2026-11-20')).toMatchObject({ credited: 2, expired: 0, expiring: { date: '2026-12-09', amount: 1 } });
        // Nothing used: August's day expired on 30 Sep.
        const unused = compOffLedger(credits, 0, 60, '2026-11-20');
        expect(unused).toMatchObject({ credited: 1, expired: 1 });
        expect(unused.ledger.find(l => l.kind === 'COMP_OFF_EXPIRED')).toMatchObject({ date: '2026-09-30', amount: -1 });
        // 0 = never expires.
        expect(compOffLedger(credits, 0, 0, '2026-11-20').credited).toBe(2);
    });
});

describe('leave cancellation', () => {
    const leave = { start: '2026-11-23', end: '2026-11-27', half: null, days: 5 };
    it('before it starts: all of it', () => {
        expect(cancellationRange(leave, '2026-11-20')).toEqual({ from: '2026-11-23', to: '2026-11-27', whole: true });
        expect(applyCancellation(leave, '2026-11-23', () => 0).whole).toBe(true);
    });
    it('once started: only the days from today; the rest stays as leave', () => {
        expect(cancellationRange(leave, '2026-11-25')).toEqual({ from: '2026-11-25', to: '2026-11-27', whole: false });
        const after = applyCancellation(leave, '2026-11-25', (s, e) => countLeaveDays(s, e, null, cal()).days);
        expect(after).toMatchObject({ whole: false, leave: { start: '2026-11-23', end: '2026-11-24', days: 2 } });
    });
    it('once over: nothing to cancel', () => {
        expect(cancellationRange(leave, '2026-11-30')).toBeNull();
    });
});

describe('late check-in deductions', () => {
    const left: Record<string, number> = { ANNUAL: 0.5, CASUAL: 3 };
    it('in the order set (Annual, then Casual), then loss of pay', () => {
        const r = allocateLateDeductions(
            [
                { date: '2026-11-02', lateMinutes: 20, state: 'deducted' },
                { date: '2026-11-03', lateMinutes: 20, state: 'deducted' },
            ],
            0.5,
            ['ANNUAL', 'CASUAL'],
            t => left[t] ?? 0,
            t => t
        );
        expect(r.deductions.map(d => d.from)).toEqual(['ANNUAL', 'CASUAL']);
        expect(r.byType).toEqual({ ANNUAL: 0.5, CASUAL: 0.5 });
        const lop = allocateLateDeductions([{ date: '2026-11-02', lateMinutes: 20, state: 'deducted' }], 0.5, ['ANNUAL'], () => 0, t => t);
        expect(lop).toMatchObject({ lossOfPay: 0.5, deductions: [{ from: 'LOP', fromLabel: 'Loss of pay' }] });
    });
    it('stays deducted while a dispute is pending; reversed automatically when it’s approved', () => {
        const r = allocateLateDeductions(
            [
                { date: '2026-11-02', lateMinutes: 20, state: 'pending' },
                { date: '2026-11-03', lateMinutes: 20, state: 'reversed', reversedOn: '2026-11-05' },
            ],
            0.5,
            ['ANNUAL'],
            () => 5,
            t => t
        );
        expect(r.byType).toEqual({ ANNUAL: 0.5 });
        expect(r.deductions[1]).toMatchObject({ state: 'reversed', reversedOn: '2026-11-05' });
    });
    it('0 days = off', () => {
        expect(allocateLateDeductions([{ date: '2026-11-02', lateMinutes: 20, state: 'deducted' }], 0, ['ANNUAL'], () => 5, t => t).deductions).toEqual([]);
    });
});

describe('approval routing (leave, leave cancellation, comp off)', () => {
    const manager = { id: 1001, name: 'Arjun Mehta' };
    const ctx = { employeeId: 1004, personName: (id: number) => (id === 1018 ? 'Neha Kapoor' : null) };
    it('all three use the leave approvers', () => {
        expect(LEAVE_ROUTE).toBe('leave');
    });
    it('level 1 reporting manager, level 2 a team; resolved and fixed when submitted', () => {
        const trail = startTrail(LEAVE_ROUTE, manager, DEFAULT_SETTINGS, ctx);
        expect(trail.steps).toEqual([
            { level: 1, role: 'MANAGER', approverId: 1001, approverName: 'Arjun Mehta' },
            { level: 2, role: 'HR' },
        ]);
        // Settings changing later doesn't touch the stored steps.
        const after = decide(trail, 'MANAGER', 'APPROVED', undefined, '2026-11-20T10:00:00', 'Arjun Mehta', 1001);
        expect(after.status).toBe('PENDING_HR');
    });
    it('a team at level 1, or a specific person', () => {
        const team = startTrail(LEAVE_ROUTE, manager, { ...DEFAULT_SETTINGS, level1: { ...DEFAULT_SETTINGS.level1, leave: 'HR' }, level2: { ...DEFAULT_SETTINGS.level2, leave: 'NONE' } }, ctx);
        expect(team.status).toBe('PENDING_HR');
        const person = startTrail(LEAVE_ROUTE, manager, { ...DEFAULT_SETTINGS, level2: { ...DEFAULT_SETTINGS.level2, leave: personApprover(1018) } }, ctx);
        expect(person.steps[1]).toEqual({ level: 2, role: 'MANAGER', approverId: 1018, approverName: 'Neha Kapoor' });
    });
    it('no manager: level 1 is skipped', () => {
        expect(startTrail(LEAVE_ROUTE, null, DEFAULT_SETTINGS, ctx).status).toBe('PENDING_HR');
    });
    it('Ask for update goes back to the employee; resubmitting starts again at level 1', () => {
        const trail = decide(
            decide(startTrail(LEAVE_ROUTE, manager, DEFAULT_SETTINGS, ctx), 'MANAGER', 'APPROVED', undefined, 'a', 'Arjun', 1001),
            'HR',
            'UPDATE_REQUESTED',
            'Pick other dates',
            'b'
        );
        expect(trail.status).toBe('UPDATE_REQUESTED');
        expect(resubmitTrail(trail, 'c', 'Sneha').status).toBe('PENDING_MANAGER');
    });
    it('Requests views depend on the setup (a team only at both levels: no "With managers")', () => {
        expect(adminRequestViews('HR', 'PAYROLL', { you: 0, mgr: 0 }).map(v => v.key)).toEqual(['you', 'upd', 'no', 'all']);
        expect(adminRequestViews('MANAGER', 'HR', { you: 0, mgr: 0 }).map(v => v.label)).toEqual(['Waiting for you', 'With managers', 'Update requested', 'Rejected', 'All']);
        expect(adminRequestViews('MANAGER', personApprover(1018), { you: 0, mgr: 0 }).map(v => v.label)).toEqual(['With approvers', 'Update requested', 'Rejected', 'All']);
        // A view stays while older items still sit in it.
        expect(adminRequestViews('HR', 'PAYROLL', { you: 0, mgr: 2 }).map(v => v.key)).toContain('mgr');
    });
});

describe('applying', () => {
    const types = DEFAULT_LEAVE_TYPES;
    const ctx = {
        types,
        cal: cal(),
        sandwich: 'OFF' as const,
        halfDayAllowed: true,
        existing: [{ start: '2026-11-30', end: '2026-11-30', half: null, summary: 'Casual leave, 30 Nov' }],
        available: { ANNUAL: 4, CASUAL: 1, SICK: 6, MATERNITY: 0 },
        pending: { ANNUAL: 2 },
        onProbation: false,
    };
    const ok = { type: 'ANNUAL', start: '2026-11-23', end: '2026-11-24', reason: 'Trip' };
    it('passes with the counted days', () => {
        expect(validateLeave(ok, ctx)).toMatchObject({ type: 'ANNUAL', days: 2 });
    });
    it('blocks overlap, short balance, probation, missing document and reason, in order', () => {
        expect(() => validateLeave({ ...ok, end: '2026-11-30' }, ctx)).toThrow(LEAVE_MESSAGES.overlap('Casual leave, 30 Nov'));
        expect(() => validateLeave({ ...ok, end: '2026-11-27' }, ctx)).toThrow('You have 4 days of Annual leave available (2 more already waiting for approval).');
        const notOnProbation = type({ id: 'NA', name: 'Study', probation: 'NONE' });
        expect(() => validateLeave({ ...ok, type: 'NA' }, { ...ctx, types: [...ctx.types, notOnProbation], available: { ...ctx.available, NA: 5 }, onProbation: true })).toThrow(
            LEAVE_MESSAGES.probation('Study leave')
        );
        expect(() => validateLeave({ ...ok, type: 'SICK', end: '2026-11-27' }, ctx)).toThrow('Sick leave of more than 3 days needs a supporting document.');
        expect(() => validateLeave({ ...ok, reason: ' ' }, ctx)).toThrow(LEAVE_MESSAGES.reason);
        expect(() => validateLeave({ ...ok, start: '2026-11-21', end: '2026-11-22' }, ctx)).toThrow(LEAVE_MESSAGES.noWorkingDays);
    });
    it('half days of opposite halves don’t clash', () => {
        expect(leavesClash({ start: '2026-11-23', end: '2026-11-27', half: 'FIRST' }, { start: '2026-11-25', end: '2026-11-25', half: 'SECOND' })).toBe(false);
        expect(leavesClash({ start: '2026-11-23', end: '2026-11-27', half: 'FIRST' }, { start: '2026-11-25', end: '2026-11-25', half: 'FIRST' })).toBe(true);
    });
    it('supporting document: empty = never, 0 = always, N = longer than N days', () => {
        expect(needsProof({ proofAfterDays: null }, 10)).toBe(false);
        expect(needsProof({ proofAfterDays: 0 }, 0.5)).toBe(true);
        expect(needsProof({ proofAfterDays: 3 }, 3)).toBe(false);
        expect(needsProof({ proofAfterDays: 3 }, 3.5)).toBe(true);
    });
});

describe('leave types', () => {
    it('only active types for the employee’s gender', () => {
        const policy: Pick<LeavePolicy, 'types'> = { types: [...DEFAULT_LEAVE_TYPES, type({ id: 'X', active: false })] };
        expect(typesForEmployee(policy, 'Male').map(t => t.id)).toEqual(['ANNUAL', 'CASUAL', 'SICK', 'PATERNITY']);
        expect(typesForEmployee(policy, 'Female').map(t => t.id)).toEqual(['ANNUAL', 'CASUAL', 'SICK', 'MATERNITY']);
        expect(appliesTo({ appliesTo: 'FEMALE' }, 'Male')).toBe(false);
    });
    it('labels and ids', () => {
        expect(typeLabel('Annual')).toBe('Annual leave');
        expect(typeLabel('Bereavement leave')).toBe('Bereavement leave');
        expect(typeLabel('Comp off')).toBe('Comp off');
        expect(newTypeId('Bereavement leave', ['LT-BEREAVEMENT-LEAVE'])).toBe('LT-BEREAVEMENT-LEAVE-2');
        expect(accrualText({ credit: 'MONTHLY', daysPerYear: 12 })).toBe('1 day a month');
    });
    it('maps the earlier stored policy without losing anything', () => {
        const migrated = migrateLeavePolicy(
            {
                year: 'COMPANY',
                cycleStart: '01-01',
                probationMonths: 6,
                types: {
                    ANNUAL: { daysPerYear: 18, credit: 'MONTHLY', carryForward: 45, encashOnExit: true },
                    CASUAL: { daysPerYear: 12, credit: 'UPFRONT', carryForward: 0, encashOnExit: false },
                    SICK: { daysPerYear: 12, credit: 'UPFRONT', carryForward: 0, encashOnExit: false },
                },
            },
            5
        );
        expect(migrated.cycleStart).toBe('01-01');
        expect(migrated.types.find(t => t.id === 'ANNUAL')).toMatchObject({ kind: 'yearly', count: 'working', daysPerYear: 18, credit: 'MONTHLY', yearEnd: 'carry', carryForward: 45, exitOpts: ['encash'] });
        expect(migrated.types.find(t => t.id === 'CASUAL')).toMatchObject({ kind: 'yearly', daysPerYear: 12, credit: 'CYCLE_START', yearEnd: 'lapse', exitOpts: ['prepone'] });
        expect(migrated.types.find(t => t.id === 'SICK')).toMatchObject({ proofAfterDays: 5 });
        expect(migrated.types.map(t => t.id)).toEqual(['ANNUAL', 'CASUAL', 'SICK', 'MATERNITY', 'PATERNITY']);
        expect(migrateLeavePolicy(null)).toBe(DEFAULT_POLICY);
    });
});

describe('one employee’s year', () => {
    const base = {
        policy: { ...DEFAULT_POLICY, types: [type({ id: 'X', name: 'Annual', credit: 'CYCLE_START', daysPerYear: 10 })], lateOrder: ['X'] },
        today: '2026-11-20',
        facts: { ...ACTIVE, gender: 'Female' as const },
        opening: {},
        late: [],
        lateDays: 0.5,
        compOff: [],
    };
    it('10 credited, 4 approved, 2 pending = 4 available (and 6 left for an approver)', () => {
        const y = computeLeaveYear({
            ...base,
            leave: [
                { type: 'X', start: '2026-10-05', end: '2026-10-08', half: null, days: 4, state: 'approved' },
                { type: 'X', start: '2026-12-01', end: '2026-12-02', half: null, days: 2, state: 'in_request' },
            ],
        });
        const b = y.balances.find(x => x.type === 'X')!;
        expect(b).toMatchObject({ credited: 10, approved: 4, inRequest: 2, available: 4, left: 6, allocated: 10 });
    });
    it('a late mark takes from the balance; a reversed one gives it back', () => {
        const y = computeLeaveYear({ ...base, leave: [], late: [{ date: '2026-11-02', lateMinutes: 25, state: 'deducted' }] });
        expect(y.balances[0]).toMatchObject({ late: 0.5, available: 9.5 });
        const r = computeLeaveYear({ ...base, leave: [], late: [{ date: '2026-11-02', lateMinutes: 25, state: 'reversed', reversedOn: '2026-11-04' }] });
        expect(r.balances[0]).toMatchObject({ late: 0, available: 10 });
    });
    it('comp off becomes a balance when it’s on', () => {
        const y = computeLeaveYear({ ...base, leave: [], compOff: [{ worked: '2026-11-15', approvedOn: '2026-11-16', days: 1 }] });
        expect(y.balances.find(b => b.type === COMP_OFF)).toMatchObject({ available: 1, expiring: { date: '2027-01-14', amount: 1 } });
        const off = computeLeaveYear({ ...base, policy: { ...base.policy, compOff: { enabled: false, expiryDays: 60 } }, leave: [] });
        expect(off.balances.some(b => b.type === COMP_OFF)).toBe(false);
    });
    it('leaving this year: a settlement per type', () => {
        const y = computeLeaveYear({ ...base, facts: { ...base.facts, exitDate: '2026-09-20' }, policy: { ...base.policy, types: [type({ id: 'X', name: 'Annual', daysPerYear: 12, exitOpts: ['encash'] })] }, leave: [] });
        expect(y.settlement).toEqual([{ type: 'X', name: 'Annual', encash: 6, bringForward: 0, recover: 0 }]);
    });
});

describe('loss of pay', () => {
    it('approving beyond what’s left flags the extra days', () => {
        expect(lossOfPayOnApproval(1.5, 3)).toBe(1.5);
        expect(lossOfPayOnApproval(5, 3)).toBe(0);
        expect(lossOfPayOnApproval(-1, 2)).toBe(2);
    });
});
