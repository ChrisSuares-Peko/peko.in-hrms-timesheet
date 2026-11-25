// PROTOTYPE-SETUP (Leave fixes): holidays with ranges, negative balance, balance adjustments and the opening balances
// import (rules only; the stores are tested in mocks/store/__tests__/atsLeaveFixes.test.ts).
import { describe, expect, it } from 'vitest';

import type { LeaveTypeConfig, Weekday } from '@src/domains/attendanceTimesheet/types';

import { DEFAULT_LEAVE_POLICY, DEFAULT_LEAVE_TYPES } from '../attendance';
import { datesBetween, holidayGroups, holidayRangeProblem, HOLIDAY_RANGE_MESSAGES } from '../holidayImport';
import { COMP_OFF, LEAVE_MESSAGES, computeLeaveYear, migrateLeavePolicy, negativeOf, negativeRoom, validateLeave } from '../leave';
import { typeLog } from '../leaveLog';
import { ADJUST_MESSAGES, OPENING_STATUS, adjustedBalance, adjustmentProblem, openingReviewSummary, openingToImport, reviewOpeningRows } from '../openingBalances';

const WEEKEND: Weekday[] = ['SATURDAY', 'SUNDAY'];
const cal = { weeklyOff: WEEKEND, isHoliday: () => false };

describe('holidays with ranges', () => {
    const list = [
        { date: '2026-11-08', name: 'Diwali' },
        { date: '2026-11-09', name: 'Diwali' },
        { date: '2026-11-10', name: 'Diwali' },
        { date: '2026-11-11', name: 'Govardhan Puja' },
        { date: '2026-01-26', name: 'Republic Day' },
        { date: '2026-12-25', name: 'Christmas' },
        { date: '2026-12-27', name: 'Christmas' },
    ];
    it('groups consecutive dates with the same name (sorted); a gap or another name starts a new holiday', () => {
        expect(holidayGroups(list)).toEqual([
            { name: 'Republic Day', from: '2026-01-26', to: '2026-01-26', days: 1 },
            { name: 'Diwali', from: '2026-11-08', to: '2026-11-10', days: 3 },
            { name: 'Govardhan Puja', from: '2026-11-11', to: '2026-11-11', days: 1 },
            { name: 'Christmas', from: '2026-12-25', to: '2026-12-25', days: 1 },
            { name: 'Christmas', from: '2026-12-27', to: '2026-12-27', days: 1 },
        ]);
        expect(datesBetween('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    });
    it('checks start, order, 31 days, name and overlap; an edit may keep its own dates', () => {
        const taken = list.map(h => h.date);
        const ok = { name: 'Holi', from: '2026-03-04', to: '2026-03-05' };
        expect(holidayRangeProblem(ok, taken)).toBeNull();
        expect(holidayRangeProblem({ ...ok, to: '' }, taken)).toBeNull();
        expect(holidayRangeProblem({ ...ok, from: '' }, taken)?.message).toBe(HOLIDAY_RANGE_MESSAGES.from);
        expect(holidayRangeProblem({ ...ok, to: '2026-03-01' }, taken)?.message).toBe(HOLIDAY_RANGE_MESSAGES.order);
        expect(holidayRangeProblem({ ...ok, to: '2026-04-04' }, taken)?.message).toBe(HOLIDAY_RANGE_MESSAGES.long);
        expect(holidayRangeProblem({ ...ok, to: '2026-04-03' }, taken)).toBeNull();
        expect(holidayRangeProblem({ ...ok, name: ' ' }, taken)?.message).toBe(HOLIDAY_RANGE_MESSAGES.name);
        expect(holidayRangeProblem({ name: 'Diwali', from: '2026-11-07', to: '2026-11-08' }, taken)).toEqual({ message: 'is already a holiday.', clash: '2026-11-08' });
        // Editing Diwali (8–10 Nov) to 7–10 Nov keeps its own dates; it still can't take Govardhan Puja's.
        const own = datesBetween('2026-11-08', '2026-11-10');
        expect(holidayRangeProblem({ name: 'Diwali', from: '2026-11-07', to: '2026-11-10' }, taken, own)).toBeNull();
        expect(holidayRangeProblem({ name: 'Diwali', from: '2026-11-08', to: '2026-11-11' }, taken, own)?.clash).toBe('2026-11-11');
    });
});

describe('negative balance', () => {
    it('older settings get it off with a 5-day preset; the room is 0 off, N on, Infinity without a limit', () => {
        expect(migrateLeavePolicy({ ...DEFAULT_LEAVE_POLICY, negative: undefined }).negative).toEqual({ on: false, max: 5 });
        expect(negativeOf({ on: true, max: 2.3 })).toEqual({ on: true, max: 2.5 });
        expect(negativeOf({ on: true, max: null })).toEqual({ on: true, max: null });
        expect(negativeRoom({ on: false, max: 5 })).toBe(0);
        expect(negativeRoom({ on: true, max: 3 })).toBe(3);
        expect(negativeRoom({ on: true, max: null })).toBe(Infinity);
    });
    it('lets yearly types go below zero up to the limit (not comp off); the message names the allowance', () => {
        const types = [...DEFAULT_LEAVE_TYPES, { ...DEFAULT_LEAVE_TYPES[0], id: COMP_OFF, name: 'Comp off' } as LeaveTypeConfig];
        const ctx = { types, cal, sandwich: 'OFF' as const, halfDayAllowed: true, existing: [], available: { ANNUAL: 1, [COMP_OFF]: 1 }, pending: {}, onProbation: false };
        const three = { type: 'ANNUAL', start: '2026-11-23', end: '2026-11-25', reason: 'Trip' };
        expect(() => validateLeave(three, ctx)).toThrow('You have 1 day of Annual leave available.');
        expect(validateLeave(three, { ...ctx, negative: { on: true, max: 2 } })).toMatchObject({ days: 3 });
        expect(() => validateLeave({ ...three, end: '2026-11-26' }, { ...ctx, negative: { on: true, max: 2 } })).toThrow(
            'Even with the negative balance allowance of 2 days, you have 1 day of Annual leave available. Apply for fewer days or pick another leave type.'
        );
        expect(validateLeave({ ...three, end: '2026-12-04' }, { ...ctx, negative: { on: true, max: null } })).toMatchObject({ days: 10 });
        expect(() => validateLeave({ ...three, type: COMP_OFF }, { ...ctx, negative: { on: true, max: null } })).toThrow(LEAVE_MESSAGES.balance(1, 'Comp off', 0));
        // HR's wording
        expect(() => validateLeave({ ...three, end: '2026-11-26' }, { ...ctx, negative: { on: true, max: 2 }, who: 'Sneha' })).toThrow(
            'Even with the negative balance allowance of 2 days, Sneha has 1 day of Annual leave available.'
        );
    });
});

describe('balance adjustments', () => {
    it('previews the balance and checks days, half days, reason and how far a deduction may go', () => {
        expect(adjustedBalance(9.5, 'add', 2)).toBe(11.5);
        expect(adjustedBalance(9.5, 'deduct', 2)).toBe(7.5);
        const ctx = { first: 'Sneha', available: 3, label: 'Annual leave', room: 0 };
        const ok = { direction: 'add' as const, days: 2, reason: 'Correction for March' };
        expect(adjustmentProblem(ok, ctx)).toBeNull();
        expect(adjustmentProblem({ ...ok, days: 0 }, ctx)).toBe(ADJUST_MESSAGES.days);
        expect(adjustmentProblem({ ...ok, days: 1.3 }, ctx)).toBe(ADJUST_MESSAGES.step);
        expect(adjustmentProblem({ ...ok, days: 400 }, ctx)).toBe(ADJUST_MESSAGES.tooMany);
        expect(adjustmentProblem({ ...ok, reason: '  ' }, ctx)).toBe(ADJUST_MESSAGES.reason);
        expect(adjustmentProblem({ ...ok, direction: 'deduct', days: 3 }, ctx)).toBeNull();
        expect(adjustmentProblem({ ...ok, direction: 'deduct', days: 3.5 }, ctx)).toBe('Sneha has 3 days of Annual leave available, so you can deduct at most 3.');
        expect(adjustmentProblem({ ...ok, direction: 'deduct', days: 5 }, { ...ctx, room: 2 })).toBeNull();
        expect(adjustmentProblem({ ...ok, direction: 'deduct', days: 6 }, { ...ctx, room: 2 })).toBe(
            'Sneha has 3 days of Annual leave available, so you can deduct at most 5 (including the 2 days negative balance allowance).'
        );
        expect(adjustmentProblem({ ...ok, direction: 'deduct', days: 300 }, { ...ctx, room: Infinity })).toBeNull();
    });

    const type: LeaveTypeConfig = { ...DEFAULT_LEAVE_TYPES[0], id: 'X', name: 'Annual', credit: 'CYCLE_START', daysPerYear: 10 };
    const base = {
        policy: { ...DEFAULT_LEAVE_POLICY, types: [type], lateOrder: ['X'] },
        today: '2026-11-20',
        facts: { dateOfJoin: '2020-01-10', status: 'ACTIVE' as const, gender: 'Female' as const },
        opening: {},
        leave: [],
        late: [],
        lateDays: 0.5,
        compOff: [],
    };
    it('count as credits / deductions this cycle, with ledger lines; an earlier opening balance counts from the start', () => {
        const y = computeLeaveYear({
            ...base,
            adjustments: [
                { type: 'X', days: 2, date: '2026-11-03', reason: 'Special leave approved by management' },
                { type: 'X', days: -0.5, date: '2026-11-10', reason: 'Correction for March' },
                { type: 'X', days: 4, date: '2025-12-15', reason: 'Opening balance', opening: true },
                { type: 'X', days: 9, date: '2026-12-01', reason: 'Later' },
                { type: 'Y', days: 9, date: '2026-11-01', reason: 'Other type' },
            ],
        });
        const b = y.balances[0];
        expect(b).toMatchObject({ credited: 15.5, available: 15.5, allocated: 15.5 });
        expect(b.ledger.filter(l => ['ADJUST_ADD', 'ADJUST_DEDUCT', 'OPENING'].includes(l.kind)).map(l => [l.date, l.kind, l.amount, l.text])).toEqual([
            ['2026-11-10', 'ADJUST_DEDUCT', -0.5, 'Deducted by HR: Correction for March'],
            ['2026-11-03', 'ADJUST_ADD', 2, 'Added by HR: Special leave approved by management'],
            ['2026-04-01', 'OPENING', 4, 'Opening balance (imported, as of 15 Dec)'],
        ]);
        // In the employee's ledger (and Recent activity): a credit and a deduction, with the reason.
        const log = typeLog({ balances: y.balances as never, requests: [], cancellations: [], changes: [], compOffs: [] }, 'X', '2026-11-20');
        expect(log.filter(r => r.entry === 'Balance adjusted').map(r => [r.group, r.status, r.reason])).toEqual([
            ['deduction', 'Deducted', 'Deducted by HR: Correction for March'],
            ['credit', 'Credited', 'Added by HR: Special leave approved by management'],
        ]);
        expect(log.find(r => r.entry === 'Opening balance')).toMatchObject({ group: 'credit', days: 4 });
    });
});

describe('opening balances import', () => {
    const ctx = {
        employees: [
            { id: 1, employeeId: 'ACME-001', name: 'Arjun Mehta', types: ['ANNUAL', 'CASUAL', 'SICK'] },
            { id: 4, employeeId: 'ACME-004', name: 'Sneha Rao', types: ['ANNUAL', 'CASUAL'] },
        ],
        types: [
            { id: 'ANNUAL', name: 'Annual' },
            { id: 'CASUAL', name: 'Casual' },
            { id: 'SICK', name: 'Sick' },
        ],
        imported: new Set(['ACME-001:CASUAL']),
        today: '2026-11-20',
    };
    it('gives each row a status (header and blank rows skipped)', () => {
        const rows = reviewOpeningRows(
            [
                ['Employee ID', 'Leave type', 'Opening balance (days)', 'As of date'],
                ['ACME-001', 'Annual leave', '5', '2026-10-01'],
                ['acme-004', 'casual', '2.5', ''],
                ['', '', '', ''],
                ['ACME-999', 'Annual', '1', ''],
                ['ACME-001', 'Maternity', '1', ''],
                ['ACME-004', 'Sick', '1', ''],
                ['ACME-001', 'Sick', 'five', ''],
                ['ACME-001', 'Annual', '2', ''],
                ['ACME-001', 'Casual', '2', ''],
            ],
            ctx
        );
        expect(rows.map(r => [r.row, r.status])).toEqual([
            [2, 'ready'],
            [3, 'ready'],
            [5, 'employee'],
            [6, 'type'],
            [7, 'notApplicable'],
            [8, 'number'],
            [9, 'duplicate'],
            [10, 'imported'],
        ]);
        expect(rows[1]).toMatchObject({ employeeId: 'ACME-004', employeeName: 'Sneha Rao', type: 'CASUAL', days: 2.5, asOf: '2026-11-20' });
        expect(OPENING_STATUS.type).toBe('Leave type not found (yearly types only)');
        expect(openingReviewSummary(rows)).toBe('8 rows · 2 ready · 6 with problems');
        expect(openingToImport(rows)).toEqual([
            { employeeId: 'ACME-001', type: 'ANNUAL', days: 5, asOf: '2026-10-01' },
            { employeeId: 'ACME-004', type: 'CASUAL', days: 2.5, asOf: '2026-11-20' },
        ]);
    });
});
