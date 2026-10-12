// PROTOTYPE-SETUP: ESS Service 1 — seed scenarios and end-to-end flows through the stateful mock store
// (the same functions the endpoints call). Dates are relative to the real today.
import { beforeEach, describe, expect, it } from 'vitest';

import { addMonths, toMinutes, weekStartOf } from '@src/prototype/rules/attendance';

import { atsScenario } from '../../data/ats-seed';
import { findEmployee } from '../../data/employees';
import { isWorkingDay } from '../../data/time-calendar';
import {
    addEntry,
    editEntry,
    attendanceMonthOf,
    checkIn,
    checkOut,
    createCorrection,
    createOvertime,
    overtimeViewOf,
    overviewOf,
    submitWeek,
} from '../atsEss';
import { homeOf } from '../atsHome';
import { createProfileRequest, myProfileOf, withdrawProfileRequest } from '../atsProfile';
import { attendanceDay, currentMonth, lastMonth, recordOf, resetTodayCheckIn, weekView } from '../atsStore';
import {
    approveWeek,
    decideRequest,
    level2Counts,
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
        expect(by('ACME-005')).toBe('not-checked-in');
        expect(by('ACME-006')).toBe('on-leave');
        // PROTOTYPE-SETUP (Overview v2, Slice 1): today's seeded punches only exist once their time has passed.
        const now = new Date().getHours() * 60 + new Date().getMinutes();
        if (now >= 9 * 60 + 55) {
            expect(by('ACME-003')).toBe('late');
            expect(view.counts.late).toBe(1);
        } else {
            expect(by('ACME-003')).toBe('not-checked-in');
        }
        // Sneha's 09:24 check-in is never ahead of the clock.
        const snehaToday = recordOf(M, sneha, s.today);
        expect(snehaToday ? toMinutes(snehaToday.checkIn!) <= now : now < 9 * 60 + 24).toBe(true);
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

// PROTOTYPE-SETUP (V2): hours-only entries end to end.
describe('hours-only entries', () => {
    it('the sent-back week has "Writing release notes" (1h, no set time)', () => {
        const e = weekView(M, sneha, s.sentBackWeek).week.entries.find(x => x.description === 'Writing release notes');
        expect(e).toMatchObject({ start: null, end: null, mins: 60 });
    });
    it('count in day and week totals and unlogged hours; edit keeps the hours', () => {
        const date = s.thisWeek < s.today ? s.thisWeek : s.today;
        const before = weekView(M, sneha, s.thisWeek);
        const dayBefore = before.days.find(d => d.date === date)!;
        const after = addEntry(M, sneha, { date, mins: 90, description: 'Reading the RFC' });
        const dayAfter = after.days.find(d => d.date === date)!;
        expect(dayAfter.loggedMinutes - dayBefore.loggedMinutes).toBe(90);
        expect(after.totals.loggedMinutes - before.totals.loggedMinutes).toBe(90);
        const added = dayAfter.entries.find(x => x.description === 'Reading the RFC')!;
        expect(added).toMatchObject({ start: null, end: null, mins: 90 });
        expect(dayAfter.entries[dayAfter.entries.length - 1].id).toBe(added.id); // after the timed entries
        const edited = editEntry(M, sneha, added.id, { date, mins: 120, description: 'Reading the RFC' });
        expect(edited.days.find(d => d.date === date)!.entries.find(x => x.id === added.id)).toMatchObject({ mins: 120, start: null });
    });
    it('start + hours is saved with the end calculated', () => {
        const date = s.thisWeek < s.today ? s.thisWeek : s.today;
        const v = addEntry(M, sneha, { date, start: '21:00', mins: 45, description: 'Late call' });
        expect(v.days.find(d => d.date === date)!.entries.find(x => x.description === 'Late call')).toMatchObject({ start: '21:00', end: '21:45', mins: 45 });
    });
    it('timesheet-only overtime counts hours-only entries', () => {
        // Approval off, so any unlocked week can be edited directly.
        updateSettings(M, { mode: 'timesheet', timesheetApproval: { enabled: false, submissionWeekday: 'FRIDAY' } });
        const date = s.overtimeDay;
        const extraBefore = overtimeViewOf(M, sneha, currentMonth()).suggestions.find(x => x.date === date)?.minutes ?? 0;
        expect(weekView(M, sneha, weekStartOf(date)).editMode).toBe('direct');
        addEntry(M, sneha, { date, mins: 120, description: 'Extra hours, no set time' });
        const extraAfter = overtimeViewOf(M, sneha, currentMonth()).suggestions.find(x => x.date === date)?.minutes ?? 0;
        expect(extraAfter - extraBefore).toBe(120);
    });
});

// PROTOTYPE-SETUP (V2): no manual submit — the message names the configured submission day.
describe('manual submit', () => {
    it('names the configured submission day', () => {
        const day = new Date().getDay() === 3 ? 'TUESDAY' : 'WEDNESDAY';
        updateSettings(M, { timesheetApproval: { enabled: true, submissionWeekday: day } });
        expect(weekView(M, sneha, s.thisWeek).week.status).toBe('DRAFT');
        const label = day === 'TUESDAY' ? 'Tuesday' : 'Wednesday';
        expect(() => submitWeek(M, sneha, s.thisWeek)).toThrow(`Weeks go to your manager automatically every ${label}.`);
    });
});

// PROTOTYPE-SETUP (Overview, Slice 1): the 11:59 PM auto check-out, one punch of each per day, profile updates.
describe('missed check-out (auto 11:59 PM)', () => {
    it('closes at 23:59 with no time at work, no overtime, the shift expected and no suggestion', () => {
        expect(attendanceDay(M, sneha, s.autoDay)).toMatchObject({ checkOut: '23:59', checkOutAuto: true, minutesAtWork: 0, overtimeMinutes: 0 });
        const d = weekView(M, sneha, weekStartOf(s.autoDay)).days.find(x => x.date === s.autoDay)!;
        expect(d.expectedMinutes).toBe(480);
        expect(d.window).toMatchObject({ start: expect.any(String), end: '18:30' });
        expect(overtimeViewOf(M, sneha, currentMonth()).suggestions.map(x => x.date)).not.toContain(s.autoDay);
    });
});

describe('one check-in and one check-out per day', () => {
    it('each works once; the server refuses a second', () => {
        resetTodayCheckIn(M);
        expect(recordOf(M, sneha, s.today)).toBeUndefined();
        expect(recordOf(M, arjun, s.today)).toBeUndefined();
        const o = overviewOf(M, sneha);
        if (o.today.status === 'on-leave') return; // the seed's leave can fall on today
        expect(o.today).toMatchObject({ canCheckIn: true, canCheckOut: false });
        expect(() => checkOut(M, sneha)).toThrow("You haven't checked in today.");
        expect(checkIn(M, sneha).today).toMatchObject({ canCheckIn: false, canCheckOut: true });
        expect(() => checkIn(M, sneha)).toThrow("You've already checked in today.");
        expect(checkOut(M, sneha).today).toMatchObject({ canCheckIn: false, canCheckOut: false });
        expect(() => checkOut(M, sneha)).toThrow("You've already checked out today.");
        expect(() => checkIn(M, sneha)).toThrow("You've already checked in today.");
    });
});

describe('profile updates', () => {
    const photo = 'data:image/png;base64,AAAA';
    it('go straight to HR, one pending at a time, and change the profile only when HR approves', () => {
        const before = myProfileOf(M, sneha);
        expect(before.work).toMatchObject({ employeeId: 'ACME-004', grade: expect.stringMatching(/^L\d$/), workEmail: sneha.email, manager: { name: arjun.fullName } });
        expect(before.personal.address).toBe(sneha.homeAddress);
        const sent = createProfileRequest(M, sneha, { mobile: '+91 98450 11111', photo });
        expect(sent.pending?.changes.map(c => c.field)).toEqual(['mobile', 'photo']);
        expect(sent.pending?.trail.steps).toEqual([{ level: 2, role: 'HR' }]);
        expect(sent.personal.mobile).toBe(before.personal.mobile);
        expect(() => createProfileRequest(M, sneha, { mobile: '+91 98450 22222' })).toThrow(/still with HR/);
        const queue = level2Requests(M, 'HR', 'profile', 'waiting');
        const item = queue.find(r => r.employee.id === sneha.id)!;
        expect(item).toMatchObject({ type: 'profile', waitingForYou: true });
        expect(level2Counts(M, 'FINANCE').profile).toBe(0);
        expect(() => decideRequest(M, 'profile', item.id, { role: 'HR' }, 'REJECTED')).toThrow(/comment/);
        decideRequest(M, 'profile', item.id, { role: 'HR' }, 'APPROVED');
        const after = myProfileOf(M, sneha);
        expect(after.personal).toMatchObject({ mobile: '+91 98450 11111', photo });
        expect(after.pending).toBeNull();
        expect(after.lastDecided?.trail.status).toBe('APPROVED');
    });
    it('a rejected update keeps the old values and shows HR’s reason; withdraw cancels', () => {
        const sent = createProfileRequest(M, sneha, { personalEmail: 'sneha@example.com' });
        decideRequest(M, 'profile', sent.pending!.id, { role: 'HR' }, 'REJECTED', 'Use your own email.');
        const after = myProfileOf(M, sneha);
        expect(after.personal.personalEmail).toBe(sneha.personalEmail);
        expect(after.lastDecided?.trail.steps[0].comment).toBe('Use your own email.');
        const again = createProfileRequest(M, sneha, { emergencyRelation: 'Mother' });
        expect(withdrawProfileRequest(M, sneha, again.pending!.id).pending).toBeNull();
    });
    it('refuse nothing changed and invalid details', () => {
        expect(() => createProfileRequest(M, sneha, { mobile: myProfileOf(M, sneha).personal.mobile })).toThrow('Nothing has changed.');
        expect(() => createProfileRequest(M, sneha, { mobile: '123' })).toThrow(/at least 10 digits/);
    });
});

// PROTOTYPE-SETUP (Overview, Slice 3): the Overview's table, notifications and shortcut summaries.
describe('overview home', () => {
    it('lists the last 10 working days, newest first, with the missed check-out and unclaimed overtime', () => {
        const h = homeOf(M, sneha);
        expect(h.recentDays.length).toBe(10);
        expect(h.recentDays[0].date).toBe(s.today);
        expect(h.recentDays.map(d => d.date)).toEqual([...h.recentDays.map(d => d.date)].sort().reverse());
        const auto = h.recentDays.find(d => d.date === s.autoDay)!;
        expect(auto.attendance).toMatchObject({ checkOutAuto: true, checkOut: '23:59' });
        expect(auto.overtime).toEqual({ kind: 'none' });
        expect(h.recentDays.find(d => d.date === s.overtimeDay)?.overtime.kind ?? 'unclaimed').toBe('unclaimed');
    });
    it('needs your action: the missed check-out and unclaimed overtime, each with a deep link', () => {
        const h = homeOf(M, sneha);
        expect(h.actions.find(a => a.kind === 'missed-check-out')).toMatchObject({ button: 'Update check-out', link: { tab: 'attendance', date: s.autoDay } });
        expect(h.actions.find(a => a.kind === 'overtime')).toMatchObject({ button: 'Review overtime', link: { tab: 'overtime' } });
        // once a correction is raised, the missed check-out is no longer an action
        createCorrection(M, sneha, { date: s.autoDay, kind: 'update-check-out', checkOut: '19:00', reason: 'Left at 7' });
        expect(homeOf(M, sneha).actions.some(a => a.kind === 'missed-check-out' && 'tab' in a.link && a.link.date === s.autoDay)).toBe(false);
    });
    it('your requests: newest first, max 6, including a profile update', () => {
        createProfileRequest(M, sneha, { emergencyRelation: 'Mother' });
        const h = homeOf(M, sneha);
        expect(h.requests.length).toBeLessThanOrEqual(6);
        expect(h.requests[0]).toMatchObject({ type: 'profile', state: 'pending', statusText: 'Waiting with HR team', link: { page: 'profile' } });
        expect(h.requests.map(r => r.at)).toEqual([...h.requests.map(r => r.at)].sort().reverse());
    });
    it('shortcuts and announcements', () => {
        const h = homeOf(M, sneha);
        expect(h.shortcuts.documents.count).toBeGreaterThan(0);
        expect(h.shortcuts.reimbursement.inApproval).toBeGreaterThanOrEqual(0);
        expect(h.announcements.length).toBeGreaterThanOrEqual(2);
        expect(h.announcements.slice(-2).map(a => a.title)).toEqual(['New: log hours without start and end times', 'Overtime policy']);
    });
});
