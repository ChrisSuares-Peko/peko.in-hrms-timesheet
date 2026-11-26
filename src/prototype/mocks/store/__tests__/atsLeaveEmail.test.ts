// PROTOTYPE-SETUP (Leave email notifications): who gets emailed at each step — submit (first level that isn't skipped),
// approve and move on (next level, the endorsement step included), resubmit after "Ask for update" (Level 1 again) —
// for leave, loss of pay, cancellations, changes and comp off; none for HR's Add leave; once per level; logged; a failed
// email never blocks the request. Plus the trigger rules and the template.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ApprovalTrail } from '@src/domains/attendanceTimesheet/types';
import { DEFAULT_SETTINGS, addDays, personApprover, weekdayOf } from '@src/prototype/rules/attendance';
import { leaveEmailDue, leaveEmailKey } from '@src/prototype/rules/leaveEmail';
import { LEAVE_EMAIL_TEMPLATES, renderLeaveEmail } from '@src/prototype/rules/leaveEmailTemplates';

import { findEmployee } from '../../data/employees';
import { adminEmailCopyPeople } from '../atsAdmin';
import { createLeaveRequest, createLopRequest, hrAddLeave, requestLeaveCancellation, requestLeaveChange, resubmitLeaveRequest, updateLeaveConfig } from '../atsLeave';
import { approverUsers, leaveEmailLog, setEmailTransport, type EmailTransport } from '../atsLeaveEmail';
import { atsCompOffs, atsLeaveRequests } from '../atsRequests';
import { getSettings, publicHolidayOn, today } from '../atsStore';
import { decideRequest, updateSettings } from '../atsTeam';
import { resetAllCollections } from '../persistentStore';

const M = 'dummy' as const;
const imran = findEmployee('ACME-014')!; // manager Divya, Operations (department head Manish)
const divya = findEmployee('ACME-013')!;
const manish = findEmployee('ACME-012')!;
const ceo = findEmployee('ACME-021')!; // no reporting manager
const ritu = findEmployee('ACME-018')!; // HR

let restore: EmailTransport | null = null;
beforeEach(() => resetAllCollections());
afterEach(() => {
    if (restore) setEmailTransport(restore);
    restore = null;
});

const working = (from: string, n: number) => {
    let d = from;
    for (let k = 0; k < n; ) {
        d = addDays(d, 1);
        if (!['SATURDAY', 'SUNDAY'].includes(weekdayOf(d)) && !publicHolidayOn(M, d)) k += 1;
    }
    return d;
};
const latest = (e = imran) => [...atsLeaveRequests.get(M)].filter(l => l.employeeId === e.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
/** "level → recipients" for one request, in send order. */
const sends = (requestId: string) => leaveEmailLog(M).filter(x => x.requestId === requestId).map(x => `${x.trigger} · ${x.level} → ${x.recipient.name}`);
const team = () => approverUsers().map(u => u.name);
const getSettingsCc = () => getSettings(M).leaveEmailCc;
const HR_TEAM = () => team().map(n => `· Level 2 → ${n}`);

describe('leave email triggers (store)', () => {
    it('submit → Level 1 (the manager); approve → Level 2 (every Admin / HR user); final approval → nothing more', () => {
        const start = working(today(), 25);
        createLeaveRequest(M, imran, { type: 'CASUAL', start, end: start, half: 'FIRST', reason: 'Bank work' });
        const l = latest();
        expect(sends(l.id)).toEqual([`submitted · Level 1 → ${divya.fullName}`]);
        const mail = leaveEmailLog(M).find(x => x.requestId === l.id)!;
        expect(mail).toMatchObject({ status: 'sent', kind: 'leave', recipient: { email: divya.email } });
        expect(mail.body).toContain(`${imran.fullName} (${imran.employeeId}, Operations)`);
        expect(mail.body).toContain('First half');
        expect(mail.body).toContain(`/my-team/approvals?request=${l.id}`);
        decideRequest(M, 'leave', l.id, { role: 'MANAGER', manager: divya }, 'APPROVED');
        expect(sends(l.id).slice(1)).toEqual(HR_TEAM().map(x => `next_level ${x}`));
        expect(leaveEmailLog(M).filter(x => x.requestId === l.id).at(-1)?.body).toContain(`/payroll/services/leave?view=requests&request=${l.id}`);
        decideRequest(M, 'leave', l.id, { role: 'HR' }, 'APPROVED');
        expect(sends(l.id)).toHaveLength(1 + team().length);
    });

    it('a skipped Level 1 (no reporting manager): the first email goes to Level 2', () => {
        const start = working(today(), 25);
        createLeaveRequest(M, ceo, { type: 'CASUAL', start, end: start, reason: 'Personal' });
        const l = latest(ceo);
        expect(l.trail.steps[0].skipped).toBe(true);
        expect(sends(l.id)).toEqual(HR_TEAM().map(x => `submitted ${x}`));
    });

    it('the extra endorsement step gets its own email between the levels', () => {
        updateSettings(M, { leaveEndorsement: { enabled: true, overDays: 1, endorser: 'DEPT_HEAD' } });
        const start = working(today(), 25);
        createLeaveRequest(M, imran, { type: 'ANNUAL', start, end: working(start, 2), reason: 'Trip' });
        const l = latest();
        decideRequest(M, 'leave', l.id, { role: 'MANAGER', manager: divya }, 'APPROVED');
        expect(sends(l.id)).toEqual([`submitted · Level 1 → ${divya.fullName}`, `next_level · Endorsement → ${manish.fullName}`]);
        decideRequest(M, 'leave', l.id, { role: 'MANAGER', manager: manish }, 'APPROVED');
        expect(sends(l.id).slice(2)).toEqual(HR_TEAM().map(x => `next_level ${x}`));
    });

    it('a set person at Level 1 gets it instead of the manager; the requester never emails themselves', () => {
        updateSettings(M, { level1: { ...DEFAULT_SETTINGS.level1, leave: personApprover(ritu.id) } });
        const start = working(today(), 25);
        createLeaveRequest(M, imran, { type: 'CASUAL', start, end: start, reason: 'Errand' });
        expect(sends(latest().id)).toEqual([`submitted · Level 1 → ${ritu.fullName}`]);
        // Ritu's own leave: the HR team email leaves her out.
        updateSettings(M, { level1: { ...DEFAULT_SETTINGS.level1, leave: 'HR' } });
        createLeaveRequest(M, ritu, { type: 'CASUAL', start: working(start, 3), end: working(start, 3), reason: 'Errand' });
        expect(sends(latest(ritu).id).map(x => x.split(' → ')[1])).not.toContain(ritu.fullName);
    });

    it('Ask for update → resubmit: Level 1 again (a new round), once', () => {
        const start = working(today(), 25);
        createLeaveRequest(M, imran, { type: 'CASUAL', start, end: start, reason: 'x' });
        const l = latest();
        decideRequest(M, 'leave', l.id, { role: 'MANAGER', manager: divya }, 'UPDATE_REQUESTED', 'Add the reason');
        expect(sends(l.id)).toHaveLength(1);
        resubmitLeaveRequest(M, imran, l.id, { type: 'CASUAL', start, end: start, reason: 'Bank work' });
        expect(sends(l.id)).toEqual([`submitted · Level 1 → ${divya.fullName}`, `resubmitted · Level 1 → ${divya.fullName}`]);
        // An unrelated save of the same request (trail unchanged) sends nothing.
        atsLeaveRequests.update(M, list => list.map(x => (x.id === l.id ? { ...x, reason: 'Bank work, morning' } : x)));
        expect(sends(l.id)).toHaveLength(2);
    });

    it('HR’s Add leave is approved straight away: no email', () => {
        const start = working(today(), 25);
        hrAddLeave(M, { employeeId: imran.id, type: 'CASUAL', start, end: start, note: 'Added' });
        expect(sends(latest().id)).toEqual([]);
    });

    it('loss of pay, cancellations and changes follow the same rules', () => {
        updateLeaveConfig(M, { lop: 'ANY_TIME' });
        const start = working(today(), 25);
        createLopRequest(M, imran, { start, end: start, reason: 'Unpaid day' });
        const lop = latest();
        expect(leaveEmailLog(M).find(x => x.requestId === lop.id)?.body).toContain('Loss of pay');
        // An approved leave → its cancellation and its change each email Level 1.
        const s2 = working(start, 5);
        createLeaveRequest(M, imran, { type: 'CASUAL', start: s2, end: s2, reason: 'x' });
        const l = latest();
        decideRequest(M, 'leave', l.id, { role: 'MANAGER', manager: divya }, 'APPROVED');
        decideRequest(M, 'leave', l.id, { role: 'HR' }, 'APPROVED');
        requestLeaveChange(M, imran, l.id, { type: 'CASUAL', start: working(s2, 1), end: working(s2, 1), reason: 'Moved' });
        const change = leaveEmailLog(M).filter(x => x.kind === 'change');
        expect(change.map(x => `${x.trigger} · ${x.level} → ${x.recipient.name}`)).toEqual([`submitted · Level 1 → ${divya.fullName}`]);
        expect(change[0].subject).toContain('Leave change');
        const s3 = working(s2, 5);
        createLeaveRequest(M, imran, { type: 'CASUAL', start: s3, end: s3, reason: 'y' });
        const l3 = latest();
        decideRequest(M, 'leave', l3.id, { role: 'MANAGER', manager: divya }, 'APPROVED');
        decideRequest(M, 'leave', l3.id, { role: 'HR' }, 'APPROVED');
        requestLeaveCancellation(M, imran, l3.id, { reason: 'Not needed' });
        const cancel = leaveEmailLog(M).filter(x => x.kind === 'cancel');
        expect(cancel.map(x => `${x.trigger} · ${x.level} → ${x.recipient.name}`)).toEqual([`submitted · Level 1 → ${divya.fullName}`]);
        expect(cancel[0].subject).toContain('Leave cancellation');
    });

    it('comp off requests email their approver too', () => {
        const trail: ApprovalTrail = { type: 'leave', status: 'PENDING_MANAGER', steps: [{ level: 1, role: 'MANAGER', approverId: divya.id, approverName: divya.fullName }, { level: 2, role: 'HR' }] };
        atsCompOffs.update(M, list => [...list, { id: 'co-test', employeeId: imran.id, date: addDays(today(), -3), days: 1, workedMinutes: 480, reason: 'Release', trail, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
        expect(sends('co-test')).toEqual([`submitted · Level 1 → ${divya.fullName}`]);
        expect(leaveEmailLog(M).find(x => x.requestId === 'co-test')?.subject).toContain('Comp off request');
    });

    it('a failed email is logged as failed and never blocks the request', () => {
        restore = setEmailTransport(() => {
            throw new Error('SMTP down');
        });
        const start = working(today(), 25);
        createLeaveRequest(M, imran, { type: 'CASUAL', start, end: start, reason: 'x' });
        const l = latest();
        expect(l.trail.status).toBe('PENDING_MANAGER');
        expect(leaveEmailLog(M).find(x => x.requestId === l.id)).toMatchObject({ status: 'failed', error: 'SMTP down', level: 'Level 1' });
    });
});

// PROTOTYPE-SETUP (Leave email copies): "Also email these people".
describe('email copies (Also email these people)', () => {
    const farah = findEmployee('ACME-020')!; // HR: also a Level 2 (Admin / HR) recipient
    const copiesOf = (requestId: string) => leaveEmailLog(M).filter(x => x.requestId === requestId && x.copy).map(x => `${x.level} → ${x.recipient.name}`);
    const approversOf = (requestId: string) => leaveEmailLog(M).filter(x => x.requestId === requestId && !x.copy).map(x => x.recipient.name);

    it('off by default: approvers only', () => {
        const start = working(today(), 25);
        createLeaveRequest(M, imran, { type: 'CASUAL', start, end: start, reason: 'x' });
        expect(copiesOf(latest().id)).toEqual([]);
    });

    it('on: every level’s email also goes to the chosen people, one email each; not to an approver twice, not to the employee', () => {
        updateSettings(M, { leaveEmailCc: { on: true, people: [manish.id, farah.id, null, ceo.id] } });
        const start = working(today(), 25);
        createLeaveRequest(M, imran, { type: 'CASUAL', start, end: start, reason: 'x' });
        const l = latest();
        expect(approversOf(l.id)).toEqual([divya.fullName]);
        expect(copiesOf(l.id)).toEqual([`Level 1 → ${manish.fullName}`, `Level 1 → ${farah.fullName}`, `Level 1 → ${ceo.fullName}`]);
        // separate emails: one recipient each, the same wording as the approver's
        const level1 = leaveEmailLog(M).filter(x => x.requestId === l.id);
        expect(new Set(level1.map(x => x.recipient.email)).size).toBe(level1.length);
        expect(level1.every(x => x.subject.includes(imran.fullName))).toBe(true);
        decideRequest(M, 'leave', l.id, { role: 'MANAGER', manager: divya }, 'APPROVED');
        // Level 2: Farah is an Admin / HR approver, so she gets the approver email only (no second copy).
        expect(copiesOf(l.id).slice(3)).toEqual([`Level 2 → ${manish.fullName}`, `Level 2 → ${ceo.fullName}`]);
        expect(approversOf(l.id)).toContain(farah.fullName);
        // Manish's own leave: he isn't copied on it.
        createLeaveRequest(M, manish, { type: 'CASUAL', start: working(start, 3), end: working(start, 3), reason: 'y' });
        expect(copiesOf(latest(manish).id).map(x => x.split(' → ')[1])).not.toContain(manish.fullName);
    });

    it('a person can’t be picked twice; off keeps the choices but stops the copies', () => {
        updateSettings(M, { leaveEmailCc: { on: true, people: [manish.id, manish.id, 999999, ceo.id] } });
        expect(getSettingsCc()).toEqual({ on: true, people: [manish.id, null, null, ceo.id] });
        // Only `on` is sent: the server merges it, so the people stay.
        updateSettings(M, { leaveEmailCc: { on: false } as ReturnType<typeof getSettingsCc> });
        expect(getSettingsCc()).toEqual({ on: false, people: [manish.id, null, null, ceo.id] });
        const start = working(today(), 25);
        createLeaveRequest(M, imran, { type: 'CASUAL', start, end: start, reason: 'x' });
        expect(copiesOf(latest().id)).toEqual([]);
    });

    it('who can be copied: Managers (people with reports, and the CEO) and HR and Admin', () => {
        const list = adminEmailCopyPeople(M);
        expect(list.managers.map(x => x.id)).toEqual(expect.arrayContaining([divya.id, manish.id, ceo.id]));
        expect(list.managers.some(x => x.id === imran.id)).toBe(false);
        expect(list.hrAdmin.map(x => x.name)).toContain(farah.fullName);
        expect(list.hrAdmin.some(x => list.managers.some(m => m.id === x.id))).toBe(false);
    });
});

describe('leave email rules', () => {
    const base: ApprovalTrail = { type: 'leave', status: 'PENDING_MANAGER', steps: [{ level: 1, role: 'MANAGER', approverId: 1 }, { level: 2, role: 'HR' }] };
    it('due step, trigger and once-key per round', () => {
        expect(leaveEmailDue(base)).toMatchObject({ stepIndex: 0, trigger: 'submitted', round: 0 });
        const moved: ApprovalTrail = { ...base, status: 'PENDING_HR', steps: [{ ...base.steps[0], decision: 'APPROVED' }, base.steps[1]] };
        expect(leaveEmailDue(moved)).toMatchObject({ stepIndex: 1, trigger: 'next_level' });
        const again: ApprovalTrail = { ...base, history: [{ level: 0, by: 'x', action: 'Updated and resubmitted', at: '2026-11-26' }] };
        expect(leaveEmailDue(again)).toMatchObject({ stepIndex: 0, trigger: 'resubmitted', round: 1 });
        expect(leaveEmailKey('leave', 'lv1', leaveEmailDue(again)!)).toBe('leave:lv1:r1:s0');
        expect(leaveEmailDue({ ...base, status: 'APPROVED' })).toBeNull();
        expect(leaveEmailDue({ ...base, status: 'UPDATE_REQUESTED' })).toBeNull();
        expect(leaveEmailDue(base, true)).toBeNull();
    });
    it('templates: one per trigger, placeholders filled, unknown ones kept', () => {
        expect(Object.keys(LEAVE_EMAIL_TEMPLATES)).toEqual(['submitted', 'next_level', 'resubmitted']);
        expect(renderLeaveEmail('Hi {approver_name}, {level} {nope}', { approver_name: 'Divya', level: 'Level 1' })).toBe('Hi Divya, Level 1 {nope}');
    });
});
