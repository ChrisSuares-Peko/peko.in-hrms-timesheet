// PROTOTYPE-SETUP (Settings, Slice 5): reimbursement claims follow Payroll settings → Reimbursements.
import { describe, expect, it } from 'vitest';

import { DEFAULT_REIMBURSEMENT_CATEGORIES } from '../attendance';
import { CLAIM_MESSAGES, claimProblem, countsAgainstLimit, limitLine } from '../reimbursements';

const rules = { categories: DEFAULT_REIMBURSEMENT_CATEGORIES, claimWindowDays: 60 };
const today = '2026-10-26';
const claim = (over: Partial<Parameters<typeof claimProblem>[0]> = {}) => ({ category: 'Meals', amount: 500, date: today, hasReceipt: true, ...over });

describe('reimbursement claims', () => {
    it('the defaults', () => {
        expect(DEFAULT_REIMBURSEMENT_CATEGORIES.map(c => [c.name, c.monthlyLimit, c.receiptRequired])).toEqual([
            ['Travel', 0, true],
            ['Meals', 3000, true],
            ['Internet', 1500, false],
            ['Client entertainment', 0, true],
            ['Office supplies', 2000, true],
        ]);
    });
    it('the monthly limit counts what is already claimed', () => {
        expect(claimProblem(claim({ amount: 1000 }), { rules, today, used: 2500 })).toBe('Your Meals limit is ₹3,000 a month. You’ve already claimed ₹2,500, so you can claim up to ₹500.');
        expect(claimProblem(claim({ amount: 500 }), { rules, today, used: 2500 })).toBeNull();
        expect(claimProblem(claim({ category: 'Travel', amount: 99999 }), { rules, today, used: 0 })).toBeNull();
    });
    it('receipt required per category', () => {
        expect(claimProblem(claim({ hasReceipt: false }), { rules, today, used: 0 })).toBe('Attach the receipt for Meals claims.');
        expect(claimProblem(claim({ category: 'Internet', hasReceipt: false }), { rules, today, used: 0 })).toBeNull();
    });
    it('the claim window', () => {
        expect(claimProblem(claim({ date: '2026-08-26' }), { rules, today, used: 0 })).toBe('Claims must be made within 60 days of the expense.');
        expect(claimProblem(claim({ date: '2026-08-27' }), { rules, today, used: 0 })).toBeNull();
    });
    it('order and other checks', () => {
        expect(claimProblem(claim({ category: 'Fuel' }), { rules, today, used: 0 })).toBe(CLAIM_MESSAGES.category);
        expect(claimProblem(claim({ amount: 0 }), { rules, today, used: 0 })).toBe(CLAIM_MESSAGES.amount);
        expect(countsAgainstLimit('PENDING_MANAGER') && countsAgainstLimit('UPDATE_REQUESTED') && countsAgainstLimit('APPROVED')).toBe(true);
        expect(countsAgainstLimit('REJECTED') || countsAgainstLimit('CANCELLED')).toBe(false);
    });
    it('the line under the amount', () => {
        expect(limitLine(DEFAULT_REIMBURSEMENT_CATEGORIES[1], 1800, 'October 2026', 60)).toBe('Limit ₹3,000 a month · ₹1,200 left for October 2026 · claim within 60 days');
        expect(limitLine(DEFAULT_REIMBURSEMENT_CATEGORIES[0], 0, 'October 2026', 30)).toBe('No monthly limit · claim within 30 days');
    });
});
