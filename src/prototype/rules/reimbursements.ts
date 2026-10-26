// PROTOTYPE-SETUP (Settings, Slice 5): reimbursement claims follow Payroll settings → Reimbursements — the categories,
// each one's monthly limit per employee (0 = none) and whether a receipt is needed, and the claim window. Pure, so the
// employee's form and the mock server check a claim the same way, in this order: amount · claim window · monthly
// limit · receipt. The limit counts approved, pending and update-requested claims in the same category and month.
import type { ReimbursementCategory, ReimbursementRules } from '@src/domains/attendanceTimesheet/types';

import { daysBetween } from './attendance';

/** ₹12,345 */
export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export const CLAIM_MESSAGES = {
    amount: 'Enter the amount you spent.',
    category: 'Pick a category.',
    date: 'Pick the date you spent it (today or earlier).',
    window: (days: number) => `Claims must be made within ${days} days of the expense.`,
    limit: (category: string, limit: number, used: number) =>
        `Your ${category} limit is ${inr(limit)} a month. You’ve already claimed ${inr(used)}, so you can claim up to ${inr(Math.max(0, limit - used))}.`,
    receipt: (category: string) => `Attach the receipt for ${category} claims.`,
} as const;

/** Trail statuses a claim counts against the monthly limit in: approved, pending at any level, update requested. */
export const countsAgainstLimit = (status: string) => status === 'APPROVED' || status === 'UPDATE_REQUESTED' || status.startsWith('PENDING');

export const categoryOf = (rules: ReimbursementRules, name: string): ReimbursementCategory | undefined =>
    rules.categories.find(c => c.name.toLowerCase() === name.trim().toLowerCase());

/** The line under the amount: "Limit ₹3,000 a month · ₹1,200 left for October 2026 · claim within 60 days". */
export const limitLine = (cat: ReimbursementCategory | undefined, used: number, monthLabel: string, claimWindowDays: number) =>
    `${cat?.monthlyLimit ? `Limit ${inr(cat.monthlyLimit)} a month · ${inr(Math.max(0, cat.monthlyLimit - used))} left for ${monthLabel}` : 'No monthly limit'} · claim within ${claimWindowDays} days`;

/** Why a claim can't be sent, or null. `used` = already claimed in that category and month. */
export const claimProblem = (
    input: { category: string; amount: number | null | undefined; date: string; hasReceipt: boolean },
    ctx: { rules: ReimbursementRules; today: string; used: number }
): string | null => {
    const cat = categoryOf(ctx.rules, input.category);
    if (!cat) return CLAIM_MESSAGES.category;
    if (!(Number(input.amount) > 0)) return CLAIM_MESSAGES.amount;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date > ctx.today) return CLAIM_MESSAGES.date;
    if (daysBetween(input.date, ctx.today) > ctx.rules.claimWindowDays) return CLAIM_MESSAGES.window(ctx.rules.claimWindowDays);
    if (cat.monthlyLimit && ctx.used + Number(input.amount) > cat.monthlyLimit) return CLAIM_MESSAGES.limit(cat.name, cat.monthlyLimit, ctx.used);
    if (cat.receiptRequired && !input.hasReceipt) return CLAIM_MESSAGES.receipt(cat.name);
    return null;
};
