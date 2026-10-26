// PROTOTYPE-SETUP (Payroll admin, Slice 4): Overtime and Reimbursements — the Overview totals and breakdowns and the
// Details rows, from the admin's requests list (pure, so the screens and the tests share it). A request belongs to the
// month of the day it's about (overtime: the day worked; reimbursement: the expense date). Values are minutes for
// overtime and ₹ for reimbursements.
import type { AdminRequestRow, PersonRef } from '@src/domains/attendanceTimesheet/types';

export interface Total {
    value: number;
    count: number;
}

const total = (rows: AdminRequestRow[]): Total => ({ value: rows.reduce((n, r) => n + r.value, 0), count: rows.length });

export const inMonth = (rows: AdminRequestRow[], month: string) => rows.filter(r => r.date.slice(0, 7) === month);

/** Requested · With managers · Waiting for you · Approved; departments; categories (reimbursements). */
export const typeOverview = (rows: AdminRequestRow[], month: string) => {
    const m = inMonth(rows, month);
    const departments = [...new Set(m.map(r => r.department))].sort().map(department => {
        const d = m.filter(r => r.department === department);
        return {
            department,
            requests: d.length,
            value: total(d).value,
            waiting: d.filter(r => r.bucket === 'you').length,
            approved: total(d.filter(r => r.bucket === 'ok')).value,
        };
    });
    const categories = [...new Set(m.map(r => r.category).filter((c): c is string => Boolean(c)))].sort().map(category => ({
        category,
        ...total(m.filter(r => r.category === category)),
    }));
    return {
        totals: {
            requested: total(m),
            withManagers: total(m.filter(r => r.bucket === 'mgr')),
            waiting: total(m.filter(r => r.bucket === 'you')),
            approved: total(m.filter(r => r.bucket === 'ok')),
        },
        departments,
        categories,
    };
};

/** Every employee's requests for the month: how many, approved and pending (with the manager or with you). */
export const typeDetails = (rows: AdminRequestRow[], people: PersonRef[], month: string) => {
    const m = inMonth(rows, month);
    return people.map(employee => {
        const mine = m.filter(r => r.item.employee.id === employee.id);
        return {
            employee,
            requests: mine,
            approved: total(mine.filter(r => r.bucket === 'ok')).value,
            pending: total(mine.filter(r => r.bucket === 'you' || r.bucket === 'mgr')).value,
        };
    });
};
