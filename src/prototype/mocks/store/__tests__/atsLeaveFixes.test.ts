// PROTOTYPE-SETUP (Leave fixes): the live stores — holidays with ranges (add / edit / remove the whole range), Adjust
// balance, Import opening balances, negative balance (employee, HR and the approver's line) and the approver's
// read-only View (a team member's leave).
import { beforeEach, describe, expect, it } from 'vitest';

import { addDays, weekdayOf } from '@src/prototype/rules/attendance';

import { findEmployee } from '../../data/employees';
import {
    addPublicHoliday,
    adjustLeaveBalance,
    createLeaveRequest,
    hrAddLeave,
    importOpeningBalances,
    leaveViewOf,
    openingBalanceContext,
    removePublicHoliday,
    updateLeaveConfig,
    updatePublicHoliday,
} from '../atsLeave';
import { atsLeaveRequests } from '../atsRequests';
import { publicHolidayOn, today } from '../atsStore';
import { assertCanReview, decideRequest, teamRequests } from '../atsTeam';
import { resetAllCollections } from '../persistentStore';

const M = 'dummy' as const;
const sneha = findEmployee('ACME-004')!;
const imran = findEmployee('ACME-014')!;
const divya = findEmployee('ACME-013')!;
const arjun = findEmployee('ACME-001')!;

beforeEach(() => resetAllCollections());

const working = (from: string, n: number) => {
    let d = from;
    for (let k = 0; k < n; ) {
        d = addDays(d, 1);
        if (!['SATURDAY', 'SUNDAY'].includes(weekdayOf(d)) && !publicHolidayOn(M, d)) k += 1;
    }
    return d;
};
const annual = (e = imran) => leaveViewOf(M, e).balances.find(b => b.type === 'ANNUAL')!;

describe('holidays with ranges (store)', () => {
    it('adds a range as one entry per date, edits it (its own dates may stay) and removes it whole', () => {
        let v = addPublicHoliday(M, { name: 'Founders week', from: '2031-04-07', to: '2031-04-09' });
        expect(v.holidays.filter(h => h.name === 'Founders week').map(h => h.date)).toEqual(['2031-04-07', '2031-04-08', '2031-04-09']);
        expect(() => addPublicHoliday(M, { name: 'Clash', from: '2031-04-09', to: '2031-04-10' })).toThrow('9 Apr 2031 is already a holiday.');
        expect(() => addPublicHoliday(M, { name: 'Long', from: '2031-05-01', to: '2031-06-05' })).toThrow('A holiday can be at most 31 days long.');
        v = updatePublicHoliday(M, '2031-04-07', { name: 'Founders days', from: '2031-04-08', to: '2031-04-10' });
        expect(v.holidays.filter(h => h.date >= '2031-04-07' && h.date <= '2031-04-10').map(h => `${h.date} ${h.name}`)).toEqual([
            '2031-04-08 Founders days',
            '2031-04-09 Founders days',
            '2031-04-10 Founders days',
        ]);
        v = removePublicHoliday(M, '2031-04-08');
        expect(v.holidays.some(h => h.name === 'Founders days')).toBe(false);
        expect(() => removePublicHoliday(M, '2031-04-08')).toThrow('That holiday isn’t in the list any more.');
        // A one-day holiday still works with `date`.
        expect(addPublicHoliday(M, { date: '2031-04-20', name: 'One day' }).holidays.some(h => h.date === '2031-04-20')).toBe(true);
    });
});

describe('Adjust balance and Import opening balances (store)', () => {
    it('adds and deducts with a reason; shows in the ledger; a deduction stops at zero unless negative balance allows', () => {
        const before = annual().available;
        expect(adjustLeaveBalance(M, imran.id, { type: 'ANNUAL', direction: 'add', days: 2, reason: 'Special leave approved by management' }).message).toBe(
            '2 days added to Imran’s Annual leave'
        );
        expect(annual().available).toBe(before + 2);
        expect(annual().ledger[0]).toMatchObject({ kind: 'ADJUST_ADD', amount: 2, text: 'Added by HR: Special leave approved by management' });
        expect(() => adjustLeaveBalance(M, imran.id, { type: 'ANNUAL', direction: 'deduct', days: 1, reason: '' })).toThrow('Add a reason.');
        expect(() => adjustLeaveBalance(M, imran.id, { type: 'MATERNITY', direction: 'add', days: 1, reason: 'x' })).toThrow('Pick a leave type.');
        expect(() => adjustLeaveBalance(M, imran.id, { type: 'ANNUAL', direction: 'deduct', days: before + 2.5, reason: 'x' })).toThrow('so you can deduct at most');
        updateLeaveConfig(M, { negative: { on: true, max: 1 } });
        adjustLeaveBalance(M, imran.id, { type: 'ANNUAL', direction: 'deduct', days: before + 2.5, reason: 'Correction' });
        // Below zero is allowed now; a late check-in deduction that no longer fits moves to loss of pay instead.
        expect(annual().available).toBeLessThanOrEqual(0);
        expect(annual().ledger.some(l => l.kind === 'ADJUST_DEDUCT' && l.amount === -(before + 2.5))).toBe(true);
    });

    it('imports Ready rows as opening balances; the same employee and type is "Already imported" next time', () => {
        const ctx = openingBalanceContext(M);
        expect(ctx.types.map(t => t.id)).toEqual(['ANNUAL', 'CASUAL', 'SICK']);
        const before = annual(sneha).available;
        const res = importOpeningBalances(M, {
            rows: [
                { employeeId: sneha.employeeId, type: 'Annual', days: 3, asOf: today() },
                { employeeId: 'NOPE-1', type: 'Annual', days: 3, asOf: today() },
            ],
        });
        expect(res).toMatchObject({ imported: 1, skipped: 1, message: '1 opening balance imported' });
        expect(annual(sneha).available).toBe(before + 3);
        expect(annual(sneha).ledger.some(l => l.kind === 'OPENING' && l.amount === 3)).toBe(true);
        expect(openingBalanceContext(M).imported).toContain(`${sneha.employeeId}:ANNUAL`);
        expect(() => importOpeningBalances(M, { rows: [{ employeeId: sneha.employeeId, type: 'Annual', days: 1, asOf: today() }] })).toThrow('already imported');
    });
});

describe('negative balance (store)', () => {
    it('employees and HR can go below zero up to the limit; the approver sees it as a negative balance, not loss of pay', () => {
        const left = annual().available;
        const start = working(today(), 20);
        const tooMany = { type: 'ANNUAL', start, end: working(start, Math.ceil(left) + 1), reason: 'Trip' };
        expect(() => createLeaveRequest(M, imran, tooMany)).toThrow('Apply for fewer days');
        updateLeaveConfig(M, { negative: { on: true, max: 5 } });
        createLeaveRequest(M, imran, tooMany);
        const l = [...atsLeaveRequests.get(M)].filter(x => x.employeeId === imran.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        const item = teamRequests(M, divya, 'leave', 'waiting').find(r => r.id === l.id)!;
        expect(item.leaveBalance).toMatchObject({ negativeOk: true });
        expect(item.leaveBalance!.after).toBeLessThan(0);
        decideRequest(M, 'leave', l.id, { role: 'MANAGER', manager: divya }, 'APPROVED');
        decideRequest(M, 'leave', l.id, { role: 'HR' }, 'APPROVED');
        expect(atsLeaveRequests.get(M).find(x => x.id === l.id)?.lossOfPayDays ?? 0).toBe(0);
        // HR is held to the same limit.
        const s2 = working(start, 30);
        expect(() => hrAddLeave(M, { employeeId: imran.id, type: 'ANNUAL', start: s2, end: working(s2, 6), note: 'Trip' })).toThrow('Even with the negative balance allowance of 5 days');
    });
});

describe('approver’s View (store)', () => {
    it('a manager can load a team member’s leave; someone unrelated can’t', () => {
        expect(assertCanReview(M, divya, imran)).toBe(imran);
        expect(() => assertCanReview(M, sneha, arjun)).toThrow();
    });
});
