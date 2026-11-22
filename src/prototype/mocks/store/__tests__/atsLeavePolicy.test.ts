// PROTOTYPE-SETUP (Leave policy settings): the new rules on the live stores — the endorsement step for longer leave
// (department head), loss of pay, per-event leave and the Configuration settings.
import { beforeEach, describe, expect, it } from 'vitest';

import { addDays, weekdayOf } from '@src/prototype/rules/attendance';
import { LOP } from '@src/prototype/rules/leave';

import { findEmployee } from '../../data/employees';
import {
    addLeaveType,
    createLeaveRequest,
    createLopRequest,
    endorserFor,
    leaveSettingsView,
    leaveViewOf,
    requestLeaveChange,
    resubmitLeaveRequest,
    updateLeaveConfig,
    withdrawLeaveRequest,
} from '../atsLeave';
import { atsLeaveRequests } from '../atsRequests';
import { publicHolidayOn, today } from '../atsStore';
import { decideRequest, teamRequests, updateSettings } from '../atsTeam';
import { resetAllCollections } from '../persistentStore';

const M = 'dummy' as const;
const sneha = findEmployee('ACME-004')!;
const arjun = findEmployee('ACME-001')!;
const divya = findEmployee('ACME-013')!;
const imran = findEmployee('ACME-014')!;
const manish = findEmployee('ACME-012')!;

beforeEach(() => resetAllCollections());

/** The n-th working day (Mon–Fri, no holiday) after a date. */
const working = (from: string, n: number) => {
    let d = from;
    for (let k = 0; k < n; ) {
        d = addDays(d, 1);
        if (!['SATURDAY', 'SUNDAY'].includes(weekdayOf(d)) && !publicHolidayOn(M, d)) k += 1;
    }
    return d;
};

const withStudy = () => addLeaveType(M, { name: 'Study', daysPerYear: 30, credit: 'CYCLE_START', probation: 'FULL', yearEnd: 'lapse', carryForward: 0, exitOpts: [], proofAfterDays: null, appliesTo: 'ALL' });
const mine = (e = imran) => [...atsLeaveRequests.get(M)].filter(l => l.employeeId === e.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

describe('extra approval for longer leave', () => {
    beforeEach(() => {
        withStudy();
        updateSettings(M, { leaveEndorsement: { enabled: true, overDays: 5, endorser: 'DEPT_HEAD' } });
    });

    it('the department head resolves from the org: the person in the department whose own manager is outside it', () => {
        expect(endorserFor(M, imran)).toEqual({ id: manish.id, name: manish.fullName });
        expect(endorserFor(M, sneha)).toEqual({ id: arjun.id, name: arjun.fullName });
    });

    it('longer than N days: manager → department head (endorsement) → Admin / HR', () => {
        const start = working(today(), 30);
        createLeaveRequest(M, imran, { type: 'LT-STUDY', start, end: working(start, 5), reason: 'Exam' });
        const l = mine();
        expect(l.days).toBe(6);
        expect(l.trail.steps.map(st => [st.role, st.approverId ?? null, Boolean(st.endorsement)])).toEqual([
            ['MANAGER', divya.id, false],
            ['MANAGER', manish.id, true],
            ['HR', null, false],
        ]);
        expect(leaveViewOf(M, imran).requests[0].statusLabel).toBe(`With ${divya.fullName}`);
        expect(teamRequests(M, manish, 'leave', 'waiting').some(r => r.id === l.id)).toBe(false);
        decideRequest(M, 'leave', l.id, { role: 'MANAGER', manager: divya }, 'APPROVED');
        // now with the department head, in their My team → Approvals
        expect(teamRequests(M, manish, 'leave', 'waiting').find(r => r.id === l.id)?.waitingForYou).toBe(true);
        decideRequest(M, 'leave', l.id, { role: 'MANAGER', manager: manish }, 'APPROVED');
        expect(mine().trail.status).toBe('PENDING_HR');
        decideRequest(M, 'leave', l.id, { role: 'HR' }, 'APPROVED');
        expect(mine().trail.status).toBe('APPROVED');
    });

    it('N days or fewer: no endorsement', () => {
        const start = working(today(), 30);
        createLeaveRequest(M, imran, { type: 'LT-STUDY', start, end: working(start, 4), reason: 'Exam' });
        expect(mine().trail.steps.some(st => st.endorsement)).toBe(false);
    });

    it('skipped when the department head is the level 1 approver (Sneha → Arjun) or the employee', () => {
        const start = working(today(), 30);
        createLeaveRequest(M, sneha, { type: 'LT-STUDY', start, end: working(start, 6), reason: 'Exam' });
        expect(mine(sneha).trail.steps.some(st => st.endorsement)).toBe(false);
    });

    it('ask for update and resubmit restart from level 1 (the endorsement stays for the longer leave)', () => {
        const start = working(today(), 30);
        createLeaveRequest(M, imran, { type: 'LT-STUDY', start, end: working(start, 5), reason: 'Exam' });
        const { id } = mine();
        decideRequest(M, 'leave', id, { role: 'MANAGER', manager: divya }, 'APPROVED');
        decideRequest(M, 'leave', id, { role: 'MANAGER', manager: manish }, 'UPDATE_REQUESTED', 'Split it in two');
        expect(mine().trail.status).toBe('UPDATE_REQUESTED');
        resubmitLeaveRequest(M, imran, id, { reason: 'Exam week' });
        const again = mine();
        expect(again.trail.status).toBe('PENDING_MANAGER');
        expect(again.trail.steps.every(st => !st.decision)).toBe(true);
        expect(again.trail.steps.filter(st => st.endorsement)).toHaveLength(1);
        // shortened to 3 days: the endorsement goes
        resubmitLeaveRequest(M, imran, id, { end: working(start, 2) });
        expect(mine().trail.steps.some(st => st.endorsement)).toBe(false);
    });

    it('a specific person can be the endorser', () => {
        const ritu = findEmployee('ACME-018')!;
        updateSettings(M, { leaveEndorsement: { enabled: true, overDays: 5, endorser: `person:${ritu.id}` } });
        const start = working(today(), 30);
        createLeaveRequest(M, sneha, { type: 'LT-STUDY', start, end: working(start, 6), reason: 'Exam' });
        expect(mine(sneha).trail.steps.map(st => st.approverId ?? st.role)).toEqual([arjun.id, ritu.id, 'HR']);
    });
});

describe('loss of pay', () => {
    it('blocked while paid leave is left (default); allowed with "Any time"; unpaid for approvers; withdraw / cancel only', () => {
        const start = working(today(), 40);
        expect(() => createLopRequest(M, sneha, { start, end: working(start, 1), reason: 'Personal' })).toThrow(/You still have paid leave: .*Annual/);
        updateLeaveConfig(M, { lop: 'ANY_TIME' });
        createLopRequest(M, sneha, { start, end: working(start, 1), reason: 'Personal' });
        const l = mine(sneha);
        expect(l).toMatchObject({ type: LOP, lop: true, days: 2 });
        const row = leaveViewOf(M, sneha).requests.find(r => r.id === l.id)!;
        expect(row.typeName).toBe('Loss of pay');
        const item = teamRequests(M, arjun, 'leave', 'waiting').find(r => r.id === l.id)!;
        expect(item.unpaid).toBe(true);
        expect(item.leaveBalance).toBeUndefined();
        expect(item.title).toMatch(/^Loss of pay · /);
        expect(() => resubmitLeaveRequest(M, sneha, l.id, { reason: 'x' })).toThrow(/only be withdrawn or cancelled/);
        // overlap with other leave is checked
        expect(() => createLopRequest(M, sneha, { start, end: start, reason: 'Again' })).toThrow(/already have leave/);
        decideRequest(M, 'leave', l.id, { role: 'MANAGER', manager: arjun }, 'APPROVED');
        decideRequest(M, 'leave', l.id, { role: 'HR' }, 'APPROVED');
        expect(mine(sneha).lossOfPayDays).toBeUndefined(); // lop = true is the flag payroll reads
        expect(() => requestLeaveChange(M, sneha, l.id, { start: working(start, 3), reason: 'x' })).toThrow(/only be withdrawn or cancelled/);
    });

    it('a pending loss of pay can be withdrawn', () => {
        updateLeaveConfig(M, { lop: 'ANY_TIME' });
        createLopRequest(M, sneha, { start: working(today(), 40), reason: 'Personal' });
        withdrawLeaveRequest(M, sneha, mine(sneha).id);
        expect(mine(sneha).withdrawn).toBe(true);
    });
});

describe('per-event leave', () => {
    it('Paternity: an event date, the 30 / 90-day window, up to 7 working days per event (leave already booked counts)', () => {
        const birth = working(today(), 45);
        const start = working(today(), 40);
        expect(() => createLeaveRequest(M, arjun, { type: 'PATERNITY', start, end: working(start, 2), reason: 'Baby', proof: { name: 'b.pdf' } })).toThrow('Add the date of birth or adoption.');
        createLeaveRequest(M, arjun, { type: 'PATERNITY', start, end: working(start, 4), reason: 'Baby', proof: { name: 'b.pdf' }, eventDate: birth });
        expect(mine(arjun)).toMatchObject({ type: 'PATERNITY', days: 5, eventDate: birth });
        const later = working(start, 7);
        expect(() => createLeaveRequest(M, arjun, { type: 'PATERNITY', start: later, end: working(later, 2), reason: 'Baby', proof: { name: 'b.pdf' }, eventDate: birth })).toThrow(
            /up to 7 days per event\. 5 days already booked/
        );
        const far = addDays(birth, 120);
        expect(() => createLeaveRequest(M, arjun, { type: 'PATERNITY', start: far, end: far, reason: 'Baby', proof: { name: 'b.pdf' }, eventDate: birth })).toThrow(/within 90 days after/);
        // no yearly balance
        expect(leaveViewOf(M, arjun).balances.some(b => b.type === 'PATERNITY')).toBe(false);
    });

    it('Maternity counts calendar days; more than 182 days for one delivery date is refused', () => {
        const delivery = addDays(today(), 120);
        const start = addDays(today(), 90);
        expect(() => createLeaveRequest(M, sneha, { type: 'MATERNITY', start, end: addDays(start, 182), reason: 'Delivery', proof: { name: 'c.pdf' }, eventDate: delivery })).toThrow(
            /up to 26 weeks per event/
        );
        createLeaveRequest(M, sneha, { type: 'MATERNITY', start, end: addDays(start, 181), reason: 'Delivery', proof: { name: 'c.pdf' }, eventDate: delivery });
        expect(mine(sneha)).toMatchObject({ type: 'MATERNITY', days: 182 });
    });

    it('the ESS view lists per-event types for the employee (not as balances)', () => {
        const v = leaveViewOf(M, sneha);
        expect(v.eventTypes.map(t => t.id)).toEqual(['MATERNITY']);
        expect(leaveViewOf(M, arjun).eventTypes.map(t => t.id)).toEqual(['PATERNITY']);
    });
});

describe('configuration', () => {
    it('credit date, rounding and loss of pay are saved (invalid values keep the current ones)', () => {
        updateLeaveConfig(M, { creditDate: 'CUSTOM', creditDay: 25, rounding: 'HALF', lop: 'ANY_TIME' });
        expect(leaveSettingsView(M).policy).toMatchObject({ creditDate: 'CUSTOM', creditDay: 25, rounding: 'HALF', lop: 'ANY_TIME' });
        updateLeaveConfig(M, { creditDate: 'NOPE' as never, creditDay: 31, rounding: 'X' as never });
        expect(leaveSettingsView(M).policy).toMatchObject({ creditDate: 'CUSTOM', creditDay: 25, rounding: 'HALF' });
        expect(leaveSettingsView(M).endorsement).toEqual({ enabled: false, overDays: 5, endorser: 'DEPT_HEAD' });
    });
});
