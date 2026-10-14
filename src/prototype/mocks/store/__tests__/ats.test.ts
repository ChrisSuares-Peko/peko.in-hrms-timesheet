// PROTOTYPE-SETUP: ESS Service 1 — seed scenarios and end-to-end flows through the stateful mock store
// (the same functions the endpoints call). Dates are relative to the real today.
import { beforeEach, describe, expect, it } from 'vitest';

import { addDays, addMonths, toMinutes, weekStartOf } from '@src/prototype/rules/attendance';

import { atsScenario } from '../../data/ats-seed';
import { findEmployee } from '../../data/employees';
import { isWorkingDay } from '../../data/time-calendar';
import { LEAVES } from '../../data/time-leaves';
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
    ownCheckOutsOf,
    submitWeek,
    updateOwnCheckOut,
} from '../atsEss';
import { homeOf } from '../atsHome';
import { createProfileRequest, myProfileOf, withdrawProfileRequest } from '../atsProfile';
import { atsAttendance, attendanceDay, currentMonth, lastMonth, recordOf, resetTodayCheckIn, weekView } from '../atsStore';
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
    it("lists this week's and last week's working days up to today, newest first", () => {
        const h = homeOf(M, sneha);
        expect(h.recentDays.length).toBeGreaterThan(0);
        expect(h.recentDays[0].date).toBe(s.today);
        expect(h.recentDays.every(d => d.date >= addDays(weekStartOf(s.today), -7) && d.date <= s.today)).toBe(true);
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
    it('announcements: the next holiday (with its date) and two notices', () => {
        const h = homeOf(M, sneha);
        expect(h.announcements.length).toBeGreaterThanOrEqual(2);
        if (h.announcements.length === 3) expect(h.announcements[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(h.announcements.slice(-2).map(a => a.title)).toEqual(['New: log hours without start and end times', 'Overtime policy']);
    });
});

// PROTOTYPE-SETUP (Overview v4, Slice 4): Recent days — hours worked and "X of Y" hours logged.
describe('overview recent days: hours worked and expected', () => {
    it('a missed check-out: hours worked unknown (0), expected = shift − break', () => {
        const auto = homeOf(M, sneha).recentDays.find(d => d.date === s.autoDay)!;
        expect(auto.attendance).toMatchObject({ checkOutAuto: true, minutesAtWork: 0 });
        expect(auto.timesheet.expectedMinutes).toBe(480);
    });
    it('a normal past day: hours worked = check-out − check-in, expected = window − break', () => {
        const day = homeOf(M, sneha).recentDays.find(d => d.date < s.today && d.attendance.checkIn && d.attendance.checkOut && !d.attendance.checkOutAuto)!;
        const worked = toMinutes(day.attendance.checkOut!) - toMinutes(day.attendance.checkIn!);
        expect(day.attendance.minutesAtWork).toBe(worked);
        expect(day.timesheet.expectedMinutes).toBe(Math.max(0, worked - 60));
    });
});

describe('overview recent days: leave and absent', () => {
    it('leave and absent days: no hours worked', () => {
        const days = homeOf(M, sneha).recentDays.filter(d => d.date < s.today && d.attendance.checkIn && !d.attendance.checkOutAuto);
        const [absentDay, leaveDay] = days.map(d => d.date);
        atsAttendance.update(M, all => {
            const next = { ...all };
            delete next[`${sneha.id}:${absentDay}`];
            delete next[`${sneha.id}:${leaveDay}`];
            return next;
        });
        const template = LEAVES.find(l => l.employee.id === sneha.id && l.status === 'approved')!;
        LEAVES.push({ ...template, id: 'lv-test', start: leaveDay, end: leaveDay, days: [leaveDay], leaveCount: 1, halfDaySelection: null });
        try {
            const after = homeOf(M, sneha).recentDays;
            expect(after.find(d => d.date === absentDay)!.attendance).toMatchObject({ status: 'absent', checkIn: null, minutesAtWork: 0 });
            expect(after.find(d => d.date === leaveDay)!.attendance).toMatchObject({ status: 'on-leave', checkIn: null, minutesAtWork: 0 });
            expect(after.find(d => d.date === leaveDay)!.timesheet.expectedMinutes).toBe(0);
        } finally {
            LEAVES.splice(LEAVES.findIndex(l => l.id === 'lv-test'), 1);
        }
    });
});

// PROTOTYPE-SETUP (Overview v4, Slice 5): the fourth mode, 'none' — nothing tracked, data kept.
describe("'none' mode", () => {
    it('no check-in, no timesheets, no overtime, no payroll blockers', () => {
        const before = weekView(M, sneha, s.thisWeek).week.entries.length;
        updateSettings(M, { mode: 'none' });
        const o = overviewOf(M, sneha);
        expect(o.tabs).toEqual([]);
        expect(o.today).toMatchObject({ canCheckIn: false, canCheckOut: false });
        expect(() => checkIn(M, sneha)).toThrow(/doesn’t track attendance or timesheets/);
        expect(() => addEntry(M, sneha, { date: s.thisWeek, mins: 30, description: 'x' })).toThrow(/doesn’t track/);
        expect(overtimeViewOf(M, sneha, currentMonth()).suggestions).toEqual([]);
        expect(() => createOvertime(M, sneha, { kind: 'worked', date: s.overtimeDay, minutes: 60 })).toThrow(/doesn’t track/);
        expect(payrollMonthStatus(M, lastMonth()).blockers).toEqual([]);
        expect(runSubmissionDay(M).submitted).toEqual([]);
        const h = homeOf(M, sneha);
        expect(h.recentDays).toEqual([]);
        expect(h.actions).toEqual([]);
        expect(h.requests.every(r => ['leave', 'reimbursement', 'profile'].includes(r.type))).toBe(true);
        expect(h.announcements.every(a => a.title.startsWith('Office closed') && !/check-in/.test(a.text))).toBe(true);
        // switching back shows the stored data again
        updateSettings(M, { mode: 'both' });
        expect(weekView(M, sneha, s.thisWeek).week.entries.length).toBe(before);
        expect(weekView(M, sneha, s.sentBackWeek).week.status).toBe('SENT_BACK');
        expect(homeOf(M, sneha).recentDays.length).toBeGreaterThan(0);
    });
});

// PROTOTYPE-SETUP (Attendance tab, Slice 3): the Attendance tab's month view counts overtime only at the HR minimum.
describe('attendance month: overtime at the HR minimum', () => {
    it('a 9h 4m day shows no overtime; a 9h 40m day shows 40m; the total sums qualifying days only', () => {
        const month = addMonths(currentMonth(), -1);
        const [short, long] = attendanceMonthOf(M, sneha, month)
            .days.filter(d => d.status === 'present' || d.status === 'late')
            .map(d => d.date);
        atsAttendance.update(M, all => ({
            ...all,
            [`${sneha.id}:${short}`]: { employeeId: sneha.id, date: short, checkIn: '09:30', checkOut: '18:34', source: 'manual' },
            [`${sneha.id}:${long}`]: { employeeId: sneha.id, date: long, checkIn: '09:30', checkOut: '19:10', source: 'manual' },
        }));
        expect(attendanceMonthOf(M, sneha, month).days.find(d => d.date === short)!.overtimeMinutes).toBe(4); // raw (manager view)
        const view = attendanceMonthOf(M, sneha, month, { overtimeAtMinimum: true });
        expect(view.days.find(d => d.date === short)!.overtimeMinutes).toBe(0);
        expect(view.days.find(d => d.date === long)!.overtimeMinutes).toBe(40);
        expect(view.days.every(d => d.overtimeMinutes === 0 || d.overtimeMinutes >= 30)).toBe(true);
        expect(view.totals.overtimeMinutes).toBe(view.days.reduce((sum, d) => sum + d.overtimeMinutes, 0));
    });
});

// PROTOTYPE-SETUP (Overview v5, Slice 4): self-service check-out for an auto-closed day — saved, no approval.
describe('self-service check-out update', () => {
    const correctionsCount = () => attendanceMonthOf(M, sneha, s.autoDay.slice(0, 7)).days.filter(d => d.correction).length;

    it('a valid update saves straight away, without a request, and everything recalculates', () => {
        const before = attendanceDay(M, sneha, s.autoDay);
        expect(before).toMatchObject({ checkOutAuto: true, checkIn: '09:31', overtimeMinutes: 0 });
        // the seeded entries run to 20:15, past the shift end → the timesheet's "Update check-out" flag
        const flagBefore = weekView(M, sneha, weekStartOf(s.autoDay)).days.find(d => d.date === s.autoDay)!.outsideCheckIn;
        expect(flagBefore?.action).toBe('update-check-out');
        const requests = correctionsCount();
        const day = updateOwnCheckOut(M, sneha, { date: s.autoDay, checkOut: '20:15', note: 'Release night' });
        expect(day).toMatchObject({ checkOutAuto: false, checkOut: '20:15', minutesAtWork: 20 * 60 + 15 - (9 * 60 + 31) });
        expect(day.checkOutByEmployee).toMatchObject({ note: 'Release night' });
        expect(recordOf(M, sneha, s.autoDay)).toMatchObject({ checkOut: '20:15', checkOutSource: 'employee' });
        expect(correctionsCount()).toBe(requests); // no request created
        // PROTOTYPE-SETUP (Attendance layout, Slice 3): listed in "My correction requests" as entered by the employee
        expect(ownCheckOutsOf(M, sneha)).toEqual([expect.objectContaining({ date: s.autoDay, checkIn: '09:31', checkOut: '20:15', note: 'Release night' })]);
        // overtime: 10h 44m at work − 9h shift = 1h 44m, now suggested (still claimed and approved as usual)
        expect(day.overtimeMinutes).toBe(104);
        expect(overtimeViewOf(M, sneha, currentMonth()).suggestions.find(x => x.date === s.autoDay)?.minutes).toBe(104);
        // the timesheet window ends at the new check-out and the "after shift end" flag is gone
        const tsDay = weekView(M, sneha, weekStartOf(s.autoDay)).days.find(d => d.date === s.autoDay)!;
        expect(tsDay.window).toMatchObject({ kind: 'attendance', end: '20:15' });
        expect(tsDay.outsideCheckIn).toBeUndefined();
    });

    it('rejects times before the check-in or past 23:59', () => {
        expect(() => updateOwnCheckOut(M, sneha, { date: s.autoDay, checkOut: '09:00' })).toThrow(/after your check-in/);
        expect(() => updateOwnCheckOut(M, sneha, { date: s.autoDay, checkOut: '24:10' })).toThrow(/23:59/);
        expect(() => updateOwnCheckOut(M, sneha, { date: s.autoDay, checkOut: '' })).toThrow(/23:59/);
        expect(attendanceDay(M, sneha, s.autoDay).checkOutAuto).toBe(true);
    });

    it('only once per day: a second change needs a correction (with approval)', () => {
        updateOwnCheckOut(M, sneha, { date: s.autoDay, checkOut: '19:00' });
        expect(() => updateOwnCheckOut(M, sneha, { date: s.autoDay, checkOut: '19:30' })).toThrow(/request a correction/);
        const c = createCorrection(M, sneha, { date: s.autoDay, kind: 'correction', checkIn: '09:31', checkOut: '19:30', reason: 'Left later' });
        expect(c.trail.status).toBe('PENDING_MANAGER');
        expect(attendanceDay(M, sneha, s.autoDay).checkOut).toBe('19:00');
    });

    it('a payroll-processed month is rejected', () => {
        const month = [1, 2, 3].map(n => addMonths(currentMonth(), -n)).find(m => attendanceMonthOf(M, sneha, m).locked)!;
        expect(month).toBeDefined();
        const { date } = attendanceMonthOf(M, sneha, month).days.find(d => isWorkingDay(d.date) && d.status !== 'on-leave')!;
        atsAttendance.update(M, all => ({ ...all, [`${sneha.id}:${date}`]: { employeeId: sneha.id, date, checkIn: '09:30', checkOut: null, source: 'ess' } }));
        expect(attendanceDay(M, sneha, date).checkOutAuto).toBe(true);
        expect(() => updateOwnCheckOut(M, sneha, { date, checkOut: '18:30' })).toThrow(/processed/);
    });
});

// PROTOTYPE-SETUP (Attendance final, Slice 2): month totals — missed check-outs and weekday holidays.
describe('attendance month totals', () => {
    it('counts missed check-outs not yet updated, and leaves them out of time at work', () => {
        const month = s.autoDay.slice(0, 7);
        const before = attendanceMonthOf(M, sneha, month, { overtimeAtMinimum: true });
        expect(before.totals.missedCheckOuts).toBe(before.days.filter(d => d.checkOutAuto).length);
        expect(before.totals.missedCheckOuts).toBeGreaterThanOrEqual(1);
        updateOwnCheckOut(M, sneha, { date: s.autoDay, checkOut: '18:31' });
        const after = attendanceMonthOf(M, sneha, month, { overtimeAtMinimum: true });
        expect(after.totals.missedCheckOuts).toBe(before.totals.missedCheckOuts - 1);
        expect(after.totals.minutesAtWork).toBe(before.totals.minutesAtWork + (18 * 60 + 31 - (9 * 60 + 31)));
    });
    it('counts holidays on working weekdays only', () => {
        [0, -1, -2, -3].forEach(n => {
            const v = attendanceMonthOf(M, sneha, addMonths(currentMonth(), n));
            const weekday = v.days.filter(d => d.status === 'holiday' && ![0, 6].includes(new Date(`${d.date}T00:00:00`).getDay()));
            expect(v.totals.holidays).toBe(weekday.length);
        });
    });
});
