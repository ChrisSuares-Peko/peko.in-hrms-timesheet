// PROTOTYPE-SETUP (Leave fixes — notes pay:leave:details → "Adjust, import, export"): HR's balance adjustments and the
// opening balances import (for companies moving to Peko mid-year).
//   Adjust balance ... a leave type, Add days / Deduct days, days, a reason (shown in the employee's ledger and Recent
//                      activity); counted by the engine as a credit or deduction in that cycle (computeLeaveYear)
//   Import ........... upload → review → import, like the holiday upload. Template columns: Employee ID, Leave type,
//                      Opening balance (days), As of date. Each row gets a status: Ready or the problem. Ready rows
//                      become "Opening balance" ledger lines.
import { parseHolidayDate } from './holidayImport';
import { daysText, fmtDays } from './leave';

// ---- Adjust balance ---------------------------------------------------------------------------------------------------

export const ADJUST_MESSAGES = {
    type: 'Pick a leave type.',
    days: 'Enter the number of days.',
    step: 'Use whole or half days.',
    tooMany: 'Adjust at most 365 days at a time.',
    reason: 'Add a reason. It shows in the employee’s ledger.',
    belowZero: (first: string, available: number, label: string, room: number) =>
        room === Infinity
            ? ''
            : `${first} has ${daysText(Math.max(0, available))} of ${label} available, so you can deduct at most ${fmtDays(Math.max(0, available + room))}${room ? ` (including the ${daysText(room)} negative balance allowance)` : ''}.`,
} as const;

/** The balance after an adjustment ("9.5 → 11.5 days available after this"). */
export const adjustedBalance = (available: number, direction: 'add' | 'deduct', days: number) => Math.round((available + (direction === 'add' ? days : -days)) * 100) / 100;

/**
 * Checks an adjustment: days > 0 in half days (at most 365), a reason, and a deduction can't take the balance below
 * zero past the negative balance allowance (`room`: 0 = not allowed, Infinity = no limit). Returns the problem or null.
 */
export const adjustmentProblem = (a: { direction: 'add' | 'deduct'; days: number; reason: string }, ctx: { first: string; available: number; label: string; room: number }) => {
    if (!(a.days > 0)) return ADJUST_MESSAGES.days;
    if (Math.round(a.days * 2) !== a.days * 2) return ADJUST_MESSAGES.step;
    if (a.days > 365) return ADJUST_MESSAGES.tooMany;
    if (!a.reason.trim()) return ADJUST_MESSAGES.reason;
    if (a.direction === 'deduct' && ctx.room !== Infinity && adjustedBalance(ctx.available, 'deduct', a.days) < -ctx.room - 1e-9) return ADJUST_MESSAGES.belowZero(ctx.first, ctx.available, ctx.label, ctx.room);
    return null;
};

// ---- Import opening balances --------------------------------------------------------------------------------------------

export const OPENING_TEMPLATE_COLUMNS = ['Employee ID', 'Leave type', 'Opening balance (days)', 'As of date'] as const;

export const OPENING_STATUS = {
    ready: 'Ready',
    employee: 'Employee ID not found',
    type: 'Leave type not found (yearly types only)',
    notApplicable: 'This type doesn’t apply to the employee',
    number: 'Opening balance isn’t a number',
    duplicate: 'Duplicate row',
    imported: 'Already imported',
} as const;

export type OpeningStatus = keyof typeof OPENING_STATUS;

export interface OpeningRow {
    /** The spreadsheet row number (the header is row 1). */
    row: number;
    employeeId: string;
    employeeName: string;
    /** The leave type's id when found, otherwise what the file said. */
    type: string;
    typeName: string;
    days: number | null;
    asOf: string;
    status: OpeningStatus;
}

export interface OpeningContext {
    employees: { id: number; employeeId: string; name: string; types: string[] }[];
    /** The company's yearly types (per-event leave and comp off have no opening balance). */
    types: { id: string; name: string }[];
    /** "employee code:type" pairs that already have an imported opening balance. */
    imported: Set<string>;
    today: string;
}

/** The template: the header and two sample rows. */
export const openingTemplateRows = (ctx: Pick<OpeningContext, 'employees' | 'types' | 'today'>): (string | number)[][] => [
    [...OPENING_TEMPLATE_COLUMNS],
    ...ctx.employees.slice(0, 2).map((e, i) => [e.employeeId, ctx.types[i % Math.max(1, ctx.types.length)]?.name ?? 'Annual', i ? 2.5 : 5, ctx.today]),
];

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+leave$/, '');

/** Each row of the file (the header row and blank rows skipped) with its status. */
export const reviewOpeningRows = (rows: string[][], ctx: OpeningContext): OpeningRow[] => {
    const byCode = new Map(ctx.employees.map(e => [e.employeeId.toLowerCase(), e]));
    const seen = new Set<string>();
    const out: OpeningRow[] = [];
    rows.forEach((cells, i) => {
        const [rawId = '', rawType = '', rawDays = '', rawAsOf = ''] = cells.map(c => String(c ?? '').trim());
        if (![rawId, rawType, rawDays, rawAsOf].some(Boolean)) return;
        if (i === 0 && /employee/i.test(rawId)) return;
        const e = byCode.get(rawId.toLowerCase());
        const t = ctx.types.find(x => norm(x.name) === norm(rawType) || x.id.toLowerCase() === rawType.toLowerCase());
        const n = rawDays === '' ? NaN : Number(rawDays);
        const asOf = parseHolidayDate(rawAsOf) ?? ctx.today;
        let status: OpeningStatus = 'ready';
        if (!e) status = 'employee';
        else if (!t) status = 'type';
        else if (!e.types.includes(t.id)) status = 'notApplicable';
        else if (!Number.isFinite(n) || n < 0) status = 'number';
        else if (seen.has(`${e.employeeId}:${t.id}`)) status = 'duplicate';
        else if (ctx.imported.has(`${e.employeeId}:${t.id}`)) status = 'imported';
        if (e && t) seen.add(`${e.employeeId}:${t.id}`);
        out.push({
            row: i + 1,
            employeeId: e?.employeeId ?? rawId,
            employeeName: e?.name ?? '',
            type: t?.id ?? rawType,
            typeName: t?.name ?? rawType,
            days: Number.isFinite(n) ? Math.round(n * 100) / 100 : null,
            asOf,
            status,
        });
    });
    return out;
};

/** "12 rows · 9 ready · 3 with problems" */
export const openingReviewSummary = (rows: OpeningRow[]) => {
    const ready = rows.filter(r => r.status === 'ready').length;
    return `${rows.length} row${rows.length === 1 ? '' : 's'} · ${ready} ready · ${rows.length - ready} with problems`;
};

/** What "Import N rows" sends: the Ready rows. */
export const openingToImport = (rows: OpeningRow[]) =>
    rows.filter(r => r.status === 'ready').map(r => ({ employeeId: r.employeeId, type: r.type, days: r.days ?? 0, asOf: r.asOf }));
