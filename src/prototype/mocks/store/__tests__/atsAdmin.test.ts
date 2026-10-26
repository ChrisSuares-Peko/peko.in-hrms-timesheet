// PROTOTYPE-SETUP (Payroll admin): the admin side — all employees, level 2, one list per service.
import { beforeEach, describe, expect, it } from 'vitest';

import { atsScenario } from '../../data/ats-seed';
import { findEmployee } from '../../data/employees';
import {
    adminBulkApprove,
    adminCounts,
    adminDecide,
    adminLeaveBalances,
    adminLeaveViewOf,
    adminMonthSummary,
    adminOffToday,
    adminRemind,
    adminRequests,
    adminTimesheetOverview,
    adminWeekGrid,
} from '../atsAdmin';
import { createCorrection, submitWeek } from '../atsEss';
import { createLeaveRequest, leaveViewOf, resubmitLeaveRequest } from '../atsLeave';
import { atsLeaveRequests } from '../atsRequests';
import { attendanceDay, currentMonth, employeesFor, weekView } from '../atsStore';
import { approveWeek, decideRequest, payrollApproveWeek, payrollMonthStatus, payrollSendBackWeek, payrollTimesheetQueue, teamRequests } from '../atsTeam';
import { resetAllCollections } from '../persistentStore';

const sneha = findEmployee('ACME-004')!;
const arjun = findEmployee('ACME-001')!;
const s = atsScenario();
const M = 'dummy' as const;

beforeEach(() => resetAllCollections());

describe('payroll admin: requests', () => {
    it('every employee, every bucket; only level-2 items are waiting for you; newest first', () => {
        const rows = adminRequests(M, 'leave');
        const people = new Set(rows.map(r => r.item.employee.id));
        expect(people.size).toBeGreaterThan(1);
        rows.forEach(r => expect(r.item.waitingForYou).toBe(r.bucket === 'you'));
        expect(rows.some(r => r.bucket === 'mgr')).toBe(true);
        const ats = rows.map(r => r.item.at);
        expect([...ats].sort().reverse()).toEqual(ats);
        expect(adminCounts(M).leave).toBe(rows.filter(r => r.bucket === 'you').length);
    });

    it('can’t decide while it’s with the manager; once approved it’s final (attendance updated)', () => {
        const c = createCorrection(M, sneha, { date: s.overtimeDay, checkIn: '09:00', reason: 'Badge reader' });
        const row = adminRequests(M, 'attendance').find(r => r.item.id === c.id)!;
        expect(row.bucket).toBe('mgr');
        expect(row.managerName).toBe(arjun.fullName);
        expect(() => adminDecide(M, 'attendance', c.id, 'APPROVED')).toThrow(`Still with ${arjun.fullName}. You can decide once they approve.`);
        expect(adminRemind(M, 'attendance', c.id).message).toBe(`Reminder sent to ${arjun.fullName}`);
        decideRequest(M, 'attendance', c.id, { role: 'MANAGER', manager: arjun }, 'APPROVED');
        expect(adminRequests(M, 'attendance').find(r => r.item.id === c.id)!.bucket).toBe('you');
        const done = adminDecide(M, 'attendance', c.id, 'APPROVED');
        expect(done.trail.status).toBe('APPROVED');
        expect(attendanceDay(M, sneha, s.overtimeDay).checkIn).toBe('09:00');
        expect(() => adminDecide(M, 'attendance', c.id, 'APPROVED')).toThrow(/no longer waiting/);
    });

    it('ask for update goes to the employee; their resubmission starts again at the manager', () => {
        const row = adminRequests(M, 'leave').find(r => r.bucket === 'you' && r.item.employee.id === sneha.id)
            ?? (() => {
                const pending = teamRequests(M, arjun, 'leave', 'waiting').find(r => r.employee.id === sneha.id)!;
                decideRequest(M, 'leave', pending.id, { role: 'MANAGER', manager: arjun }, 'APPROVED');
                return adminRequests(M, 'leave').find(r => r.item.id === pending.id)!;
            })();
        expect(() => adminDecide(M, 'leave', row.item.id, 'UPDATE_REQUESTED')).toThrow(/note/);
        adminDecide(M, 'leave', row.item.id, 'UPDATE_REQUESTED', 'Pick other dates, please.');
        const asked = adminRequests(M, 'leave').find(r => r.item.id === row.item.id)!;
        expect(asked.bucket).toBe('upd');
        expect(adminRemind(M, 'leave', row.item.id).message).toBe(`Reminder sent to ${sneha.fullName}`);
        const l = atsLeaveRequests.get(M).find(x => x.id === row.item.id)!;
        resubmitLeaveRequest(M, sneha, l.id, { start: l.start, end: l.end, half: l.half, reason: 'Moved' });
        expect(adminRequests(M, 'leave').find(r => r.item.id === row.item.id)!.bucket).toBe('mgr');
    });

    it('bulk approve only takes items waiting for you', () => {
        const rows = adminRequests(M, 'reimbursement');
        const you = rows.filter(r => r.bucket === 'you').map(r => r.item.id);
        const mgr = rows.find(r => r.bucket === 'mgr');
        const ids = [...you, ...(mgr ? [mgr.item.id] : [])];
        const res = adminBulkApprove(M, 'reimbursement', { ids });
        expect(res.approved).toBe(you.length);
        expect(res.failed.map(f => f.id)).toEqual(mgr ? [mgr.item.id] : []);
        expect(adminCounts(M).reimbursement).toBe(0);
    });

    it('leave clash chips count approved leave in the same department only', () => {
        const pending = adminRequests(M, 'leave').find(r => r.bucket === 'mgr' || r.bucket === 'you')!;
        const e = findEmployee(pending.item.employee.id)!;
        const colleague = employeesFor(M).find(x => x.department === e.department && x.id !== e.id)!;
        const other = employeesFor(M).find(x => x.department !== e.department)!;
        const template = atsLeaveRequests.get(M).find(l => l.trail.status === 'APPROVED')!;
        const day = pending.item.leave!.start;
        atsLeaveRequests.update(M, list => [
            ...list,
            { ...template, id: 'lv-same', employeeId: colleague.id, start: day, end: day, half: null, days: 1, withdrawn: false },
            { ...template, id: 'lv-other', employeeId: other.id, start: day, end: day, half: null, days: 1, withdrawn: false },
        ]);
        const row = adminRequests(M, 'leave').find(r => r.item.id === pending.item.id)!;
        expect(row.deptClash).toMatchObject({ department: e.department });
        expect(row.deptClash!.names).toContain(colleague.fullName.split(' ')[0]);
        expect(row.deptClash!.names).not.toContain(other.fullName.split(' ')[0]);
    });

    it('profile updates: HR, no manager step', () => {
        const rows = adminRequests(M, 'profile');
        rows.forEach(r => expect(r.bucket).not.toBe('mgr'));
    });
});

describe('payroll admin: timesheet', () => {
    it('the overview counts add up and match the payroll blockers', () => {
        const month = currentMonth();
        const o = adminTimesheetOverview(M, month);
        const status = payrollMonthStatus(M, month);
        expect(o.blockedEmployees).toBe(new Set(status.blockers.map(b => b.employee.id)).size);
        const sum = (k: 'submitted' | 'withYou' | 'approved') => o.departments.reduce((n, d) => n + d[k], 0);
        expect(sum('submitted')).toBe(o.counts.submitted);
        expect(sum('withYou')).toBe(o.counts.withYou);
        expect(sum('approved')).toBe(o.counts.approved);
        expect(o.departments.reduce((n, d) => n + d.people, 0)).toBeGreaterThan(1);
        expect(o.counts.withYou).toBeLessThanOrEqual(payrollTimesheetQueue(M, 'waiting').length);
    });
    it('details list everyone (or one department)', () => {
        const all = employeesFor(M);
        expect(adminWeekGrid(M, s.today).rows).toHaveLength(all.length);
        const dept = all[0].department;
        expect(adminMonthSummary(M, currentMonth(), dept).rows.every(r => r.employee.department === dept)).toBe(true);
    });
    it('a period approved by the manager waits for the admin; approve is final; ask for update goes back to the manager first', () => {
        const ws = s.thisWeek;
        submitWeek(M, sneha, ws, { acknowledged: { overlaps: true, gaps: true, unlogged: true } });
        approveWeek(M, arjun, String(sneha.id), ws);
        expect(weekView(M, sneha, ws).week.status).toBe('WITH_PAYROLL');
        const before = adminCounts(M).timesheet;
        payrollSendBackWeek(M, String(sneha.id), ws, 'Fix Friday');
        expect(adminCounts(M).timesheet).toBe(before - 1);
        submitWeek(M, sneha, ws, { acknowledged: { overlaps: true, gaps: true, unlogged: true } });
        expect(weekView(M, sneha, ws).week.status).toBe('SUBMITTED');
        approveWeek(M, arjun, String(sneha.id), ws);
        payrollApproveWeek(M, String(sneha.id), ws);
        expect(weekView(M, sneha, ws).week.status).toBe('APPROVED');
    });
});

describe('payroll admin: leave', () => {
    it('balances per employee match their leave view; one employee’s ledger', () => {
        const rows = adminLeaveBalances(M);
        expect(rows).toHaveLength(employeesFor(M).length);
        const mine = rows.find(r => r.employee.id === sneha.id)!;
        const v = leaveViewOf(M, sneha);
        expect(mine.available.ANNUAL).toBe(v.balances.find(b => b.type === 'ANNUAL')!.available);
        expect(mine.lossOfPayDays).toBe(v.lossOfPayDays);
        expect(adminLeaveViewOf(M, sneha.id).balances[0].ledger.length).toBeGreaterThan(0);
    });
    it('off today lists approved leave covering today', () => {
        createLeaveRequest(M, sneha, { type: 'CASUAL', start: s.today, end: s.today, reason: 'x' });
        expect(adminOffToday(M).some(o => o.employee.id === sneha.id)).toBe(false);
    });
});
