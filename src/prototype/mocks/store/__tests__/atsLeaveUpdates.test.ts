// PROTOTYPE-SETUP (Leave module, update): the newest Leave flows on the live stores (docs/progress.md, VERIFY 4–5).
//   edit a pending request (restarts at level 1) · change approved leave (a change request; the original stays until
//   approved, then is replaced) · cancel from a chosen date · past leave only for days actually worked.
import { beforeEach, describe, expect, it } from 'vitest';

import { addDays, weekdayOf } from '@src/prototype/rules/attendance';

import { atsScenario } from '../../data/ats-seed';
import { findEmployee } from '../../data/employees';
import { SNEHA_WORKED_LEAVE_REASON } from '../../data/time-leaves';
import { adminRequests } from '../atsAdmin';
import {
    createLeaveRequest,
    hrCancelLeave,
    leaveCancelCheck,
    leaveViewOf,
    requestLeaveCancellation,
    requestLeaveChange,
    resubmitLeaveRequest,
    withdrawLeaveChange,
} from '../atsLeave';
import { atsLeaveRequests } from '../atsRequests';
import { attendanceDay, publicHolidayOn } from '../atsStore';
import { decideRequest, teamRequests } from '../atsTeam';
import { resetAllCollections } from '../persistentStore';

const M = 'dummy' as const;
const s = atsScenario();
const sneha = findEmployee('ACME-004')!;
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
const managerApproves = (id: string) => decideRequest(M, 'leave', id, { role: 'MANAGER', manager: arjun }, 'APPROVED');
const approve = (id: string) => {
    managerApproves(id);
    decideRequest(M, 'leave', id, { role: 'HR' }, 'APPROVED');
};
const view = () => leaveViewOf(M, sneha);
const approvedFuture = () => {
    const start = working(s.today, 20);
    const v = createLeaveRequest(M, sneha, { type: 'ANNUAL', start, end: working(start, 1), reason: 'Trip' });
    const [{ id }] = v.requests;
    approve(id);
    return { id, start };
};

describe('edit a pending request', () => {
    it('is saved in place and starts again at level 1, even after the manager approved', () => {
        const start = working(s.today, 15);
        const [{ id }] = createLeaveRequest(M, sneha, { type: 'CASUAL', start, reason: 'Errand' }).requests;
        managerApproves(id);
        expect(view().requests.find(r => r.id === id)?.trail.status).toBe('PENDING_HR');
        const next = working(start, 2);
        resubmitLeaveRequest(M, sneha, id, { start: next, end: next, reason: 'Errand, moved' });
        const r = view().requests.find(x => x.id === id)!;
        expect(r).toMatchObject({ start: next, reason: 'Errand, moved', state: 'pending' });
        expect(r.trail.status).toBe('PENDING_MANAGER');
        expect(r.trail.history?.at(-1)?.action).toBe('Edited and resubmitted');
        expect(teamRequests(M, arjun, 'leave', 'waiting').some(x => x.id === id)).toBe(true);
    });
});

describe('change approved leave', () => {
    it('is a change request; the original stays until approved, then it is replaced (Was kept)', () => {
        const { id, start } = approvedFuture();
        const newStart = working(start, 5);
        const v = requestLeaveChange(M, sneha, id, { type: 'ANNUAL', start: newStart, end: newStart, reason: 'Shorter trip' });
        const ch = v.changes[0];
        expect(ch).toMatchObject({ leaveId: id, start: newStart, days: 1, was: { start, days: 2 } });
        expect(v.requests.find(r => r.id === id)).toMatchObject({ start, state: 'approved', changePending: true });
        expect(v.requests.find(r => r.id === id)?.canChange).toBeUndefined();
        // In the approvers' queue as a leave item of kind "change", with the balance line.
        const item = teamRequests(M, arjun, 'leave', 'waiting').find(x => x.id === ch.id)!;
        expect(item.leaveKind).toBe('change');
        expect(item.detail).toContain('was Annual leave');
        expect(item.leaveBalance).toBeDefined();
        approve(ch.id);
        const after = view().requests.find(r => r.id === id)!;
        expect(after).toMatchObject({ start: newStart, end: newStart, days: 1, state: 'approved' });
        expect(after.changedFrom).toMatchObject({ start, days: 2, changeId: ch.id });
        expect(after.changePending).toBeUndefined();
    });
    it('a second follow-up is refused while one waits; a withdrawn change frees the leave', () => {
        const { id, start } = approvedFuture();
        const ch = requestLeaveChange(M, sneha, id, { start: working(start, 3), end: working(start, 3), reason: 'x' }).changes[0];
        expect(() => requestLeaveCancellation(M, sneha, id, { reason: 'y' })).toThrow('already waiting for approval');
        withdrawLeaveChange(M, sneha, ch.id);
        expect(view().requests.find(r => r.id === id)?.canChange).toBe(true);
    });
    it('the same dates and type is refused', () => {
        const { id, start } = approvedFuture();
        expect(() => requestLeaveChange(M, sneha, id, { start, end: working(start, 1), reason: 'x' })).toThrow('Nothing has changed');
    });
    it('shows in Payroll → Leave → Requests', () => {
        const { id, start } = approvedFuture();
        const ch = requestLeaveChange(M, sneha, id, { start: working(start, 3), end: working(start, 3), reason: 'x' }).changes[0];
        expect(adminRequests(M, 'leave').some(r => r.item.id === ch.id)).toBe(true);
    });
});

describe('cancel from a chosen date', () => {
    it('cancels only the days from that date; the earlier ones stay as leave after approval', () => {
        const { id, start } = approvedFuture();
        const second = working(start, 1);
        expect(leaveCancelCheck(M, sneha, id, second)).toMatchObject({ from: second, days: 1, whole: false, problem: null });
        const c = requestLeaveCancellation(M, sneha, id, { reason: 'Back a day early', from: second }).cancellations[0];
        expect(c).toMatchObject({ from: second, days: 1 });
        approve(c.id);
        expect(view().requests.find(r => r.id === id)).toMatchObject({ start, end: start, days: 1, state: 'approved' });
    });
    it('a date outside the leave is refused', () => {
        const { id } = approvedFuture();
        expect(leaveCancelCheck(M, sneha, id, s.today).problem).toBe('Pick a date inside the leave.');
    });
});

describe('past leave', () => {
    const worked = () => view().requests.find(r => r.reason === SNEHA_WORKED_LEAVE_REASON)!;
    it('the seeded past leave has a check-in on its second day only', () => {
        const l = worked();
        expect(l.state).toBe('approved');
        expect(l.days).toBe(2);
        expect(l.cancelFrom).toBe(l.start);
    });
    it('cancelling a past day with no check-in is refused and points to an attendance correction', () => {
        const l = worked();
        const check = leaveCancelCheck(M, sneha, l.id);
        expect(check.problem).toContain('didn’t check in');
        expect(check.problem).toContain('attendance correction');
        expect(() => requestLeaveCancellation(M, sneha, l.id, { reason: 'x' })).toThrow('attendance correction');
    });
    it('the day with a check-in can be cancelled; once approved, attendance shows the day worked', () => {
        const l = worked();
        const second = addDays(l.start, 1) <= l.end ? l.end : l.start;
        expect(attendanceDay(M, sneha, second).status).toBe('on-leave');
        const c = requestLeaveCancellation(M, sneha, l.id, { reason: 'I came in that day', from: second }).cancellations[0];
        expect(attendanceDay(M, sneha, second).status).toBe('on-leave'); // stays until approved
        approve(c.id);
        expect(view().requests.find(r => r.id === l.id)).toMatchObject({ end: l.start, days: 1 });
        expect(attendanceDay(M, sneha, second).status).not.toBe('on-leave');
        expect(attendanceDay(M, sneha, second).checkIn).toBe('10:05');
    });
    it('changing past leave to drop an unworked day is refused too', () => {
        const l = worked();
        expect(() => requestLeaveChange(M, sneha, l.id, { start: l.end, end: l.end, reason: 'x' })).toThrow('attendance correction');
    });
    it('HR cancelling from Payroll is not limited by this', () => {
        const start = working(s.today, 30);
        const v = createLeaveRequest(M, sneha, { type: 'CASUAL', start, reason: 'x' });
        approve(v.requests[0].id);
        expect(hrCancelLeave(M, v.requests[0].id, { reason: 'Wrong dates' }).message).toContain('cancelled');
        expect(atsLeaveRequests.get(M).find(x => x.id === v.requests[0].id)?.trail.status).toBe('CANCELLED');
    });
});
