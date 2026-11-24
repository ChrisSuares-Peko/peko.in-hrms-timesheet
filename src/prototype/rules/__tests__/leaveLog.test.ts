// PROTOTYPE-SETUP (Leave module, update): past leave, restarting an open request, and the leave log / recent activity.
import { describe, expect, it } from 'vitest';

import type { ApprovalTrail, LeaveBalance, LeaveRequestRow, LeaveView } from '@src/domains/attendanceTimesheet/types';

import { restartTrail } from '../attendance';
import { PAST_LEAVE_MESSAGES, pastLeaveProblem, removedPastDays, type WorkCalendar } from '../leave';
import { filterLog, logCounts, recentActivity, typeLog } from '../leaveLog';

const cal: WorkCalendar = { weeklyOff: ['SATURDAY', 'SUNDAY'], isHoliday: d => d === '2026-11-11' };

describe('removedPastDays', () => {
    // Mon 9 Nov – Fri 13 Nov 2026; Wed 11 Nov is a holiday; today is Thu 12 Nov.
    const leave = { start: '2026-11-09', end: '2026-11-13', half: null };
    it('cancelling the whole leave takes off every past working day (not holidays, not today or later)', () => {
        expect(removedPastDays(leave, null, '2026-11-12', cal)).toEqual(['2026-11-09', '2026-11-10']);
    });
    it('cancelling from a date keeps the earlier days', () => {
        expect(removedPastDays(leave, { start: '2026-11-09', end: '2026-11-09', half: null }, '2026-11-12', cal)).toEqual(['2026-11-10']);
    });
    it('a full day becoming a half day is taken off; the same half kept is not', () => {
        expect(removedPastDays(leave, { start: '2026-11-09', end: '2026-11-13', half: 'FIRST' }, '2026-11-12', cal)).toEqual(['2026-11-09', '2026-11-10']);
        const halfLeave = { ...leave, half: 'FIRST' as const };
        expect(removedPastDays(halfLeave, { start: '2026-11-09', end: '2026-11-13', half: 'FIRST' }, '2026-11-12', cal)).toEqual([]);
    });
    it('future leave has no past days', () => {
        expect(removedPastDays(leave, null, '2026-11-01', cal)).toEqual([]);
    });
});

describe('pastLeaveProblem', () => {
    const worked = (d: string) => d === '2026-11-10';
    it('refuses days without a check-in and points to an attendance correction', () => {
        const p = pastLeaveProblem(['2026-11-09', '2026-11-10'], worked, 'attendance');
        expect(p).toBe(PAST_LEAVE_MESSAGES.notWorked(['2026-11-09'], 'attendance'));
        expect(p).toContain('Mon 9 Nov');
        expect(p).toContain('attendance correction');
    });
    it('timesheet-only mode asks for timesheet entries', () => {
        expect(pastLeaveProblem(['2026-11-09'], () => false, 'timesheet')).toContain('no timesheet entries');
    });
    it('every past day worked: no problem', () => {
        expect(pastLeaveProblem(['2026-11-10'], worked, 'attendance')).toBeNull();
        expect(pastLeaveProblem([], worked, 'none')).toBeNull();
    });
    it('no tracking at all: past days go to HR', () => {
        expect(pastLeaveProblem(['2026-11-10'], worked, 'none')).toContain('ask HR');
    });
});

describe('restartTrail', () => {
    const pendingL2: ApprovalTrail = {
        type: 'leave',
        status: 'PENDING_HR',
        steps: [
            { level: 1, role: 'MANAGER', approverId: 1, approverName: 'Arjun Mehta', decision: 'APPROVED', at: '2026-11-10T10:00:00.000Z' },
            { level: 2, role: 'HR' },
        ],
    };
    it('an edited request starts again at level 1; the approval moves to the history', () => {
        const t = restartTrail(pendingL2, '2026-11-11T09:00:00.000Z', 'Sneha Iyer');
        expect(t.status).toBe('PENDING_MANAGER');
        expect(t.steps.every(s => !s.decision)).toBe(true);
        expect(t.history?.map(h => h.action)).toEqual(['Approved', 'Edited and resubmitted']);
    });
    it('an approved request can’t be edited', () => {
        expect(() => restartTrail({ ...pendingL2, status: 'APPROVED' }, 'x', 'y')).toThrow('Only an open request can be edited.');
    });
});

// ---- the log -------------------------------------------------------------------------------------------------

const bal = (over: Partial<LeaveBalance>): LeaveBalance => ({
    type: 'ANNUAL',
    name: 'Annual',
    halfDay: true,
    label: 'Annual leave',
    credit: 'MONTHLY',
    probation: 'MONTHLY',
    proofAfterDays: null,
    credited: 10,
    approved: 4,
    late: 0.5,
    inRequest: 2,
    available: 3.5,
    left: 5.5,
    allocated: 18,
    carried: 2,
    carryForward: 30,
    next: null,
    expiring: null,
    notAvailable: false,
    ledger: [
        { date: '2026-04-01', kind: 'CARRIED', amount: 2, text: 'Carried forward from last year' },
        { date: '2026-04-01', kind: 'LAPSED', amount: null, text: '3 unused days lapsed' },
        { date: '2026-11-01', kind: 'MONTHLY', amount: 1, text: 'Monthly credit, November' },
        { date: '2026-11-05', kind: 'LATE', amount: -0.5, text: 'Late check-in Thu 5 Nov' },
        { date: '2026-11-06', kind: 'TAKEN', amount: -2, text: 'Leave taken' },
        { date: '2026-12-01', kind: 'MONTHLY', amount: 1, text: 'Monthly credit, December' },
    ],
    ...over,
});

const trail = (status: ApprovalTrail['status'], at?: string): ApprovalTrail => ({
    type: 'leave',
    status,
    steps: [{ level: 1, role: 'MANAGER', approverName: 'Arjun Mehta', ...(at ? { decision: 'APPROVED' as const, at } : {}) }, { level: 2, role: 'HR', ...(status === 'APPROVED' ? { decision: 'APPROVED' as const, at } : {}) }],
});

const req = (id: string, over: Partial<LeaveRequestRow>): LeaveRequestRow => ({
    id,
    employeeId: 4,
    type: 'ANNUAL',
    typeName: 'Annual',
    start: '2026-11-06',
    end: '2026-11-07',
    half: null,
    days: 2,
    reason: 'Trip',
    trail: trail('APPROVED', '2026-11-03T10:00:00.000Z'),
    createdAt: '2026-11-02T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
    statusLabel: 'Approved',
    state: 'approved',
    ...over,
});

const view: Pick<LeaveView, 'balances' | 'requests' | 'cancellations' | 'changes' | 'compOffs'> = {
    balances: [bal({}), bal({ type: 'CASUAL', name: 'Casual', label: 'Casual leave', ledger: [{ date: '2026-11-15', kind: 'YEARLY', amount: 8, text: 'Yearly credit' }] })],
    requests: [
        req('a', {}),
        req('b', { start: '2026-11-20', end: '2026-11-20', days: 1, trail: trail('PENDING_MANAGER'), state: 'pending', statusLabel: 'Pending with Arjun', createdAt: '2026-11-10T10:00:00.000Z', updatedAt: '2026-11-10T10:00:00.000Z' }),
        req('c', { trail: trail('REJECTED'), state: 'rejected', statusLabel: 'Rejected', createdAt: '2026-10-01T10:00:00.000Z' }),
    ],
    cancellations: [],
    changes: [],
    compOffs: [],
};

describe('typeLog', () => {
    const rows = typeLog(view, 'ANNUAL', '2026-11-12');
    it('one table: requests, credits, carry forward, lapse and late deductions — not "taken" rows or future credits', () => {
        expect(rows.map(r => r.entry)).toEqual(['Leave request', 'Late check-in', 'Leave request', 'Monthly credit', 'Leave request', 'Carried forward', 'Lapsed']);
    });
    it('approved / in-request leave takes days off; rejected leave shows its days unsigned', () => {
        expect(rows.find(r => r.open?.id === 'a')?.days).toBe(-2);
        expect(rows.find(r => r.open?.id === 'b')?.days).toBe(-1);
        const rejected = rows.find(r => r.open?.id === 'c')!;
        expect(rejected.days).toBeNull();
        expect(rejected.plainDays).toBe(2);
    });
    it('Show / status / date filters, with counts', () => {
        expect(logCounts(rows)).toEqual({ all: 7, leave: 3, credit: 2, deduction: 2 });
        expect(filterLog(rows, { show: 'deduction' }).map(r => r.entry)).toEqual(['Late check-in', 'Lapsed']);
        expect(filterLog(rows, { status: 'in_progress' }).map(r => r.open?.id)).toEqual(['b']);
        expect(filterLog(rows, { from: '2026-11-01', to: '2026-11-30' }).length).toBe(4);
    });
});

describe('recentActivity', () => {
    it('the last changes across every type, newest first, leave rows open the drawer', () => {
        const rows = recentActivity(view, '2026-11-15', 10);
        expect(rows[0]).toMatchObject({ typeName: 'Casual leave', entry: 'Yearly credit' });
        expect(rows[1]).toMatchObject({ what: 'Leave request sent', open: { kind: 'leave', id: 'b' } });
        expect(rows.some(r => r.what === 'Leave request approved by Arjun Mehta')).toBe(true);
        expect(rows.map(r => r.at)).toEqual([...rows.map(r => r.at)].sort((x, y) => y.localeCompare(x)));
    });
    it('keeps only the last N', () => {
        expect(recentActivity(view, '2026-11-15', 3)).toHaveLength(3);
    });
});
