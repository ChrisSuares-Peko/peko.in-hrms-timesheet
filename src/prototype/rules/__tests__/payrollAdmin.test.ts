// PROTOTYPE-SETUP (Payroll admin, Slice 4): Overtime / Reimbursements totals and per-person rows.
import { describe, expect, it } from 'vitest';

import type { AdminBucket, AdminRequestRow, PersonRef } from '@src/domains/attendanceTimesheet/types';

import { inMonth, typeDetails, typeOverview } from '../payrollAdmin';

const person = (id: number, department: string): PersonRef => ({ id, name: `P${id}`, employeeId: `E${id}`, designation: 'Engineer', department });
const row = (id: string, p: PersonRef, bucket: AdminBucket, date: string, value: number, category?: string) =>
    ({ item: { id, employee: p } as AdminRequestRow['item'], bucket, department: p.department, date, value, managerName: 'M', ...(category ? { category } : {}) }) as AdminRequestRow;

const a = person(1, 'Engineering');
const b = person(2, 'Finance');
const c = person(3, 'Engineering');
const rows = [
    row('1', a, 'you', '2026-10-02', 1000, 'Travel'),
    row('2', a, 'ok', '2026-10-05', 500, 'Meals'),
    row('3', b, 'mgr', '2026-10-07', 250, 'Travel'),
    row('4', b, 'no', '2026-10-09', 100, 'Internet'),
    row('5', a, 'ok', '2026-09-30', 9999, 'Travel'),
];

describe('typeOverview', () => {
    it('totals for the month: requested, with managers, waiting for you, approved', () => {
        const o = typeOverview(rows, '2026-10');
        expect(inMonth(rows, '2026-10')).toHaveLength(4);
        expect(o.totals).toEqual({
            requested: { value: 1850, count: 4 },
            withManagers: { value: 250, count: 1 },
            waiting: { value: 1000, count: 1 },
            approved: { value: 500, count: 1 },
        });
    });
    it('departments add up to the totals; categories for reimbursements', () => {
        const o = typeOverview(rows, '2026-10');
        expect(o.departments).toEqual([
            { department: 'Engineering', requests: 2, value: 1500, waiting: 1, approved: 500 },
            { department: 'Finance', requests: 2, value: 350, waiting: 0, approved: 0 },
        ]);
        expect(o.departments.reduce((n, d) => n + d.requests, 0)).toBe(o.totals.requested.count);
        expect(o.categories).toEqual([
            { category: 'Internet', value: 100, count: 1 },
            { category: 'Meals', value: 500, count: 1 },
            { category: 'Travel', value: 1250, count: 2 },
        ]);
    });
});

describe('typeDetails', () => {
    it('every employee, with or without requests: approved and pending (manager or you)', () => {
        const d = typeDetails(rows, [a, b, c], '2026-10');
        expect(d.map(x => [x.employee.id, x.requests.length, x.approved, x.pending])).toEqual([
            [1, 2, 500, 1000],
            [2, 2, 0, 250],
            [3, 0, 0, 0],
        ]);
    });
});
