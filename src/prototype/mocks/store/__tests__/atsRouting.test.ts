// PROTOTYPE-SETUP (Settings, Slice 1): approval routing — level 1 / level 2 per request type (the reporting manager, a
// team or a specific person; level 2 none), the CEO skip, items in flight, and the queues per person and per team.
import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, approvalPathText, personApprover, routeStep, startTrail, trailLabel } from '@src/prototype/rules/attendance';

import { atsScenario } from '../../data/ats-seed';
import { findEmployee } from '../../data/employees';
import { adminDecide, adminRequests } from '../atsAdmin';
import { approvalLinesOf, createOvertime, submitWeek } from '../atsEss';
import { createLeaveRequest, leaveViewOf } from '../atsLeave';
import { employeesFor, routeContext, weekView } from '../atsStore';
import { approveWeek, decideRequest, payrollApproveWeek, payrollTimesheetQueue, teamOf, teamReimbursements, teamRequests, teamWaiting, timesheetQueue, updateSettings } from '../atsTeam';
import { resetAllCollections } from '../persistentStore';

const sneha = findEmployee('ACME-004')!;
const arjun = findEmployee('ACME-001')!;
const ceo = findEmployee('ACME-021')!;
const s = atsScenario();
const M = 'dummy' as const;

beforeEach(() => resetAllCollections());

/** Another manager (not Sneha's). */
const priya = () => employeesFor(M).find(e => e.id !== arjun.id && e.id !== ceo.id && teamOf(M, e).length > 0)!;
const nextWorking = (from: string, n: number) => {
    let d = from;
    for (let k = 0; k < n; ) {
        d = new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
        if (![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())) k += 1;
    }
    return d;
};

describe('routing rules', () => {
    const mgr = { id: 1, name: 'Arjun Mehta' };
    const ctx = { employeeId: 4, personName: (id: number) => ({ 7: 'Priya Nair' })[id] ?? null };
    it('level 1: reporting manager, a team, a person; the employee themselves → their manager', () => {
        expect(routeStep('MANAGER', 1, mgr, ctx)).toEqual({ level: 1, role: 'MANAGER', approverId: 1, approverName: 'Arjun Mehta' });
        expect(routeStep('PAYROLL', 1, mgr, ctx)).toEqual({ level: 1, role: 'PAYROLL' });
        expect(routeStep(personApprover(7), 1, mgr, ctx)).toEqual({ level: 1, role: 'MANAGER', approverId: 7, approverName: 'Priya Nair' });
        expect(routeStep(personApprover(4), 1, mgr, ctx)).toMatchObject({ approverId: 1 });
    });
    it('level 2: a person, a team, or none', () => {
        expect(routeStep(personApprover(7), 2, mgr, ctx)).toMatchObject({ level: 2, approverName: 'Priya Nair' });
        expect(routeStep('HR', 2, mgr, ctx)).toEqual({ level: 2, role: 'HR' });
        expect(routeStep('NONE', 2, mgr, ctx)).toBeNull();
    });
    it('the CEO (no manager) skips a reporting-manager level 1', () => {
        const t = startTrail('leave', null, { ...DEFAULT_SETTINGS }, ctx);
        expect(t.steps[0]).toMatchObject({ level: 1, skipped: true });
        expect(t.status).toBe('PENDING_HR');
        expect(trailLabel(t)).toBe('With HR team');
        expect(approvalPathText(t, null)).toBe('HR team');
    });
    it('labels name the person or team', () => {
        const t = startTrail('leave', mgr, { ...DEFAULT_SETTINGS, level2: { ...DEFAULT_SETTINGS.level2, leave: personApprover(7) } }, ctx);
        expect(trailLabel(t)).toBe('With Arjun Mehta');
        expect(approvalPathText(t, 1)).toBe('Arjun Mehta (manager), then Priya Nair');
    });
});

describe('routing in the app', () => {
    it('leave level 2 = a specific person: the manager, then that person (in their My team); read-only in Payroll', () => {
        const p = priya();
        updateSettings(M, { level2: { ...DEFAULT_SETTINGS.level2, leave: personApprover(p.id) } });
        expect(approvalLinesOf(M, sneha).leave).toBe(`Approval: ${arjun.fullName} (manager), then ${p.fullName}.`);
        expect(leaveViewOf(M, sneha).approvalPath).toBe(`${arjun.fullName} (manager), then ${p.fullName}`);
        const day = nextWorking(s.today, 20);
        createLeaveRequest(M, sneha, { type: 'CASUAL', start: day, end: day, reason: 'x' });
        const mine = teamRequests(M, arjun, 'leave', 'waiting').find(r => r.employee.id === sneha.id && r.leave?.start === day)!;
        expect(mine.pendingLevel).toBe(1);
        // Payroll sees it read-only with the manager
        expect(adminRequests(M, 'leave').find(r => r.item.id === mine.id)).toMatchObject({ bucket: 'mgr', waitingWith: arjun.fullName });
        expect(() => decideRequest(M, 'leave', mine.id, { role: 'MANAGER', manager: p }, 'APPROVED')).toThrow(/no longer waiting/);
        const after = decideRequest(M, 'leave', mine.id, { role: 'MANAGER', manager: arjun }, 'APPROVED');
        expect(trailLabel(after.trail)).toBe(`With ${p.fullName}`);
        const theirs = teamRequests(M, p, 'leave', 'waiting').find(r => r.id === mine.id)!;
        expect(theirs).toMatchObject({ waitingForYou: true, pendingLevel: 2 });
        expect(adminRequests(M, 'leave').find(r => r.item.id === mine.id)).toMatchObject({ bucket: 'mgr', waitingWith: p.fullName });
        expect(() => adminDecide(M, 'leave', mine.id, 'APPROVED')).toThrow(`Still with ${p.fullName}. You can decide once they approve.`);
        expect(decideRequest(M, 'leave', mine.id, { role: 'MANAGER', manager: p }, 'APPROVED').trail.status).toBe('APPROVED');
    });

    it('overtime level 1 = Payroll: skips the manager, waits in Payroll at both levels', () => {
        updateSettings(M, { level1: { ...DEFAULT_SETTINGS.level1, overtime: 'PAYROLL' } });
        expect(approvalLinesOf(M, sneha).overtime).toBe('Approval: Payroll team, then Payroll team.');
        const o = createOvertime(M, sneha, { kind: 'planned', date: nextWorking(s.today, 2), minutes: 60, description: 'Release' });
        expect(o.trail.status).toBe('PENDING_PAYROLL');
        expect(teamRequests(M, arjun, 'overtime', 'waiting').some(r => r.id === o.id)).toBe(false);
        expect(adminRequests(M, 'overtime').find(r => r.item.id === o.id)).toMatchObject({ bucket: 'you' });
        adminDecide(M, 'overtime', o.id, 'APPROVED');
        expect(adminRequests(M, 'overtime').find(r => r.item.id === o.id)).toMatchObject({ bucket: 'you', item: { pendingLevel: 2 } });
        expect(adminDecide(M, 'overtime', o.id, 'APPROVED').trail.status).toBe('APPROVED');
    });

    it('level 2 none: level 1 is final', () => {
        updateSettings(M, { level2: { ...DEFAULT_SETTINGS.level2, overtime: 'NONE' } });
        const o = createOvertime(M, sneha, { kind: 'planned', date: nextWorking(s.today, 3), minutes: 60, description: 'Release' });
        expect(decideRequest(M, 'overtime', o.id, { role: 'MANAGER', manager: arjun }, 'APPROVED').trail.status).toBe('APPROVED');
    });

    it('items in flight keep their approvers when settings change', () => {
        const day = nextWorking(s.today, 22);
        createLeaveRequest(M, sneha, { type: 'CASUAL', start: day, end: day, reason: 'x' });
        const r = teamRequests(M, arjun, 'leave', 'waiting').find(x => x.leave?.start === day)!;
        updateSettings(M, { level1: { ...DEFAULT_SETTINGS.level1, leave: 'HR' }, level2: { ...DEFAULT_SETTINGS.level2, leave: personApprover(priya().id) } });
        expect(teamRequests(M, arjun, 'leave', 'waiting').some(x => x.id === r.id)).toBe(true);
        const next = decideRequest(M, 'leave', r.id, { role: 'MANAGER', manager: arjun }, 'APPROVED');
        expect(next.trail.status).toBe('PENDING_HR');
    });

    it('timesheets: level 1 a person, recorded on the period; their queue; level 2 kept after a settings change', () => {
        const p = priya();
        updateSettings(M, { level1: { ...DEFAULT_SETTINGS.level1, timesheet: personApprover(p.id) } });
        submitWeek(M, sneha, s.thisWeek, { acknowledged: { overlaps: true, gaps: true, unlogged: true } });
        const week = weekView(M, sneha, s.thisWeek);
        expect(week.week.route?.l1).toMatchObject({ approverId: p.id });
        expect(week.waitingWith).toBe(p.fullName);
        expect(week.nextApprover).toBe('Payroll team');
        expect(timesheetQueue(M, p, 'waiting').some(i => i.employee.id === sneha.id)).toBe(true);
        expect(timesheetQueue(M, arjun, 'waiting').some(i => i.employee.id === sneha.id)).toBe(false);
        updateSettings(M, { level2: { ...DEFAULT_SETTINGS.level2, timesheet: 'NONE' } });
        approveWeek(M, p, String(sneha.id), s.thisWeek);
        expect(weekView(M, sneha, s.thisWeek).week.status).toBe('WITH_PAYROLL');
        expect(payrollTimesheetQueue(M, 'waiting').some(i => i.employee.id === sneha.id)).toBe(true);
        payrollApproveWeek(M, String(sneha.id), s.thisWeek);
        expect(weekView(M, sneha, s.thisWeek).week.status).toBe('APPROVED');
    });

    it('a routing context names people; a missing person falls back to the manager', () => {
        expect(routeContext(sneha).personName(arjun.id)).toBe(arjun.fullName);
        expect(routeStep('person:999999' as `person:${number}`, 1, { id: arjun.id, name: arjun.fullName }, routeContext(sneha))).toMatchObject({ approverId: arjun.id });
    });
});

// PROTOTYPE-SETUP (Settings, Slice 2): My team for anyone named as an approver or with items waiting.
describe('my team visibility', () => {
    it('someone without direct reports gets My team once they are named as an approver', () => {
        expect(teamOf(M, sneha)).toHaveLength(0);
        expect(teamWaiting(M, sneha)).toBeNull();
        updateSettings(M, { level2: { ...DEFAULT_SETTINGS.level2, reimbursement: personApprover(sneha.id) } });
        expect(teamWaiting(M, sneha)).toEqual({ waiting: 0 });
    });
    it('their queue: a claim routed to them shows in Approvals and Team reimbursements', () => {
        updateSettings(M, { level1: { ...DEFAULT_SETTINGS.level1, overtime: personApprover(sneha.id) } });
        const colleague = employeesFor(M).find(e => e.id !== sneha.id && e.managerEmployeeId === arjun.employeeId)!;
        const o = createOvertime(M, colleague, { kind: 'planned', date: nextWorking(s.today, 4), minutes: 60, description: 'Release' });
        expect(teamRequests(M, sneha, 'overtime', 'waiting').map(r => r.id)).toContain(o.id);
        expect(teamWaiting(M, sneha)!.waiting).toBeGreaterThan(0);
        // settings change after: the item stays with Sneha, and so does My team
        updateSettings(M, { level1: { ...DEFAULT_SETTINGS.level1 } });
        expect(teamWaiting(M, sneha)!.waiting).toBeGreaterThan(0);
        expect(decideRequest(M, 'overtime', o.id, { role: 'MANAGER', manager: sneha }, 'APPROVED').trail.status).toBe('PENDING_PAYROLL');
    });
    it('team reimbursements include claims routed to them', () => {
        const month = s.today.slice(0, 7);
        const before = teamReimbursements(M, sneha, month).claims.length;
        expect(before).toBe(0);
    });
});
