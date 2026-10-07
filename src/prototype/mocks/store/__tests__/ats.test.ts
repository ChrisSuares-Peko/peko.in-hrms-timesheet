// PROTOTYPE-SETUP: ESS Service 1 — seed scenarios and end-to-end flows through the stateful mock store
// (the same functions the endpoints call). Dates are relative to the real today.
import { beforeEach, describe, expect, it } from 'vitest';

import { addMonths, weekStartOf } from '@src/prototype/rules/attendance';

import { atsScenario } from '../../data/ats-seed';
import { findEmployee } from '../../data/employees';
import { isWorkingDay } from '../../data/time-calendar';
import {
    addEntry,
    attendanceMonthOf,
    createCorrection,
    createOvertime,
    overtimeViewOf,
    overviewOf,
    submitWeek,
} from '../atsEss';
import { attendanceDay, currentMonth, lastMonth, weekView } from '../atsStore';
import {
    approveWeek,
    decideRequest,
    level2Requests,
    payrollMonthStatus,
    processPayrollMonth,
    runSubmissionDay,
    teamRequests,
    teamToday,
    timesheetQueue,
    updateSettings,
} from '../atsTeam';
import { resetAllCollections } from '../persistentStore';

const sneha = findEmployee('ACME-004')!;
const arjun = findEmployee('ACME-001')!;
const s = atsScenario();
const M = 'dummy' as const;

beforeEach(() => resetAllCollections());

describe('seed scenarios', () => {
    it('Sneha has a sent-back week, an approved week with a pending change and the scripted days', () => {
        expect(weekView(M, sneha, s.sentBackWeek).week.status).toBe('SENT_BACK');
        const cr = weekView(M, sneha, s.crWeek);
        expect(cr.week.status).toBe('APPROVED');
        expect(cr.editMode).toBe('change-request');
        expect(cr.changeRequest?.status).toBe('PENDING');
        expect(attendanceDay(M, sneha, s.lateDay)).toMatchObject({ status: 'late', correction: { state: 'pending' } });
        expect(attendanceDay(M, sneha, s.autoDay).checkOutAuto).toBe(true);
        const after = weekView(M, sneha, s.sentBackWeek).days.find(d => d.date === s.afterCheckOutDay)!;
        expect(after.outsideCheckIn?.action).toBe('request-correction');
        const auto = weekView(M, sneha, weekStartOf(s.autoDay)).days.find(d => d.date === s.autoDay)!;
        expect(auto.outsideCheckIn?.action).toBe('update-check-out');
        expect(overtimeViewOf(M, sneha, currentMonth()).suggestions.map(x => x.date)).toContain(s.overtimeDay);
    });

    it('last month is blocked only by the sent-back week', () => {
        const status = payrollMonthStatus(M, lastMonth());
        expect(status.processed).toBe(false);
        expect(status.blockers).toEqual([expect.objectContaining({ weekStart: s.sentBackWeek, status: 'SENT_BACK', employee: expect.objectContaining({ name: 'Sneha Iyer' }) })]);
    });

    it("Arjun's team today", () => {
        if (!isWorkingDay(s.today)) return;
        const view = teamToday(M, arjun);
        const by = (code: string) => view.rows.find(r => r.employee.employeeId === code)!.status;
        expect(by('ACME-003')).toBe('late');
        expect(by('ACME-005')).toBe('not-checked-in');
        expect(by('ACME-006')).toBe('on-leave');
        expect(view.counts.late).toBe(1);
    });
});

describe('flows', () => {
    it('1. resubmit → manager approves → blocker clears → process → month read-only', () => {
        const ws = s.sentBackWeek;
        const friday = weekView(M, sneha, ws).days[4].date;
        addEntry(M, sneha, { date: friday, start: '14:00', end: '18:30', description: 'Bug fixes – invoice export' });
        submitWeek(M, sneha, ws);
        expect(timesheetQueue(M, arjun, 'waiting').some(i => i.weekStart === ws)).toBe(true);
        approveWeek(M, arjun, String(sneha.id), ws);
        expect(payrollMonthStatus(M, lastMonth()).canProcess).toBe(true);
        processPayrollMonth(M, lastMonth());
        expect(weekView(M, sneha, ws).editMode).toBe('locked');
        expect(attendanceMonthOf(M, sneha, lastMonth()).locked).toBe(true);
        expect(() => addEntry(M, sneha, { date: friday, start: '19:00', end: '19:30', description: 'x' })).toThrow(/processed/);
    });

    it('2. overtime from a suggested day → manager → Finance', () => {
        const suggestion = overtimeViewOf(M, sneha, currentMonth()).suggestions.find(x => x.date === s.overtimeDay)!;
        const req = createOvertime(M, sneha, { kind: 'worked', date: suggestion.date, minutes: suggestion.minutes, description: 'Release support' });
        expect(teamRequests(M, arjun, 'overtime', 'waiting').some(r => r.id === req.id)).toBe(true);
        decideRequest(M, 'overtime', req.id, { role: 'MANAGER', manager: arjun }, 'APPROVED');
        expect(level2Requests(M, 'FINANCE', 'overtime', 'waiting').some(r => r.id === req.id)).toBe(true);
        const done = decideRequest(M, 'overtime', req.id, { role: 'FINANCE' }, 'APPROVED');
        expect(done.trail.status).toBe('APPROVED');
    });

    it('3. update check-out on an auto day → manager → HR → attendance and window update', () => {
        const c = createCorrection(M, sneha, { date: s.autoDay, kind: 'update-check-out', checkOut: '20:15', reason: 'Deploy ran late', fromTimesheet: true });
        decideRequest(M, 'attendance', c.id, { role: 'MANAGER', manager: arjun }, 'APPROVED');
        decideRequest(M, 'attendance', c.id, { role: 'HR' }, 'APPROVED');
        const day = attendanceDay(M, sneha, s.autoDay);
        expect(day).toMatchObject({ checkOut: '20:15', checkOutAuto: false });
        const tsDay = weekView(M, sneha, weekStartOf(s.autoDay)).days.find(d => d.date === s.autoDay)!;
        expect(tsDay.window.end).toBe('20:15');
        expect(tsDay.outsideCheckIn).toBeUndefined();
    });

    it('4. modes change tabs, title and overtime basis', () => {
        updateSettings(M, { mode: 'attendance' });
        expect(overviewOf(M, sneha)).toMatchObject({ title: 'Attendance', tabs: ['attendance', 'overtime'] });
        updateSettings(M, { mode: 'timesheet' });
        const o = overviewOf(M, sneha);
        expect(o).toMatchObject({ title: 'Timesheet', tabs: ['timesheet', 'overtime'] });
        expect(o.today.canCheckIn).toBe(false);
        expect(overtimeViewOf(M, sneha, currentMonth()).basis).toBe('timesheet');
        expect(weekView(M, sneha, s.thisWeek).days[0].window.kind).toMatch(/shift|none/);
    });

    it('5. approval off: nothing to submit, payroll not blocked', () => {
        updateSettings(M, { timesheetApproval: { enabled: false, submissionWeekday: 'FRIDAY' } });
        expect(payrollMonthStatus(M, lastMonth()).blockers).toEqual([]);
        expect(weekView(M, sneha, s.crWeek).editMode).toBe('direct');
        expect(runSubmissionDay(M).submitted).toEqual([]);
    });

    it('submission day sends open weeks to the manager; the CEO is auto-approved', () => {
        const result = runSubmissionDay(M);
        expect(result.submitted.some(x => x.employeeId === sneha.id && x.weekStart === s.thisWeek)).toBe(true);
        expect(result.submitted.find(x => x.name === 'Rohan Malhotra')?.autoApproved).toBe(true);
        expect(weekView(M, sneha, s.sentBackWeek).week.status).toBe('SENT_BACK');
    });

    it('months before last month are processed and locked', () => {
        expect(payrollMonthStatus(M, addMonths(currentMonth(), -2)).processed).toBe(true);
    });
});
