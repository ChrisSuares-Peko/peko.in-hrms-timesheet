// PROTOTYPE-SETUP: ESS Service 1 — seed scenarios and end-to-end flows through the stateful mock store
// (the same functions the endpoints call). Dates are relative to the real today.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_FILING, addDays, addMonths, daysBetween, startTrail, toMinutes, weekStartOf } from '@src/prototype/rules/attendance';
import { findOverlaps, periodEndOf, reviewPeriod, submissionPrompt } from '@src/prototype/rules/timesheetFiling';

import { atsScenario } from '../../data/ats-seed';
import { findEmployee } from '../../data/employees';
import { isWorkingDay } from '../../data/time-calendar';
import {
    addEntry,
    deleteEntry,
    editEntry,
    attendanceMonthOf,
    checkIn,
    checkOut,
    checkOutPrevious,
    createCorrection,
    createOvertime,
    overtimeViewOf,
    endBreak,
    overviewOf,
    startBreak,
    reviewOf,
    submitWeek,
    timesheetPeriodsOf,
    updateBreakDescription,
    updateTodayBreaks,
} from '../atsEss';
import { homeOf } from '../atsHome';
import { createLeaveRequest, leaveViewOf, setEmployeeLife, withdrawLeaveRequest } from '../atsLeave';
import { createProfileRequest, myProfileOf, withdrawProfileRequest } from '../atsProfile';
import { atsLeaveRequests } from '../atsRequests';
import { atsAttendance, attendanceDay, correctionsOf, currentMonth, getSettings, lastMonth, recordOf, resetTodayCheckIn, weekView } from '../atsStore';
import {
    approveWeek,
    autoRunSubmissionDay,
    payrollApproveWeek,
    payrollSendBackWeek,
    payrollTimesheetQueue,
    decideRequest,
    level2Counts,
    level2Requests,
    payrollMonthStatus,
    processPayrollMonth,
    runSubmissionDay,
    sendBackWeek,
    teamRequests,
    teamToday,
    teamWeekGrid,
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
    it('Sneha has a sent-back week, a week edited after approval (back with the manager) and the scripted days', () => {
        expect(weekView(M, sneha, s.sentBackWeek).week.status).toBe('SENT_BACK');
        const cr = weekView(M, sneha, s.crWeek);
        expect(cr.week).toMatchObject({ status: 'SUBMITTED', editedAfter: 'APPROVED' });
        expect(cr.week.baselineEntries?.length).toBeGreaterThan(0);
        expect(cr.editMode).toBe('direct');
        expect(attendanceDay(M, sneha, s.lateDay)).toMatchObject({ status: 'late', correction: { state: 'pending' } });
        // PROTOTYPE-SETUP (HR rules, Slice 1): still checked in from the last working day; not checked in today.
        expect(attendanceDay(M, sneha, s.openDay)).toMatchObject({ checkIn: '09:31', checkOut: null, open: true, carried: true, overtimeMinutes: 0 });
        expect(recordOf(M, sneha, s.today)).toBeUndefined();
        const after = weekView(M, sneha, s.sentBackWeek).days.find(d => d.date === s.afterCheckOutDay)!;
        expect(after.outsideCheckIn?.action).toBe('request-correction');
        const open = weekView(M, sneha, weekStartOf(s.openDay)).days.find(d => d.date === s.openDay)!;
        expect(open.outsideCheckIn).toBeUndefined(); // nothing is outside while still checked in
        expect(open.window).toMatchObject({ kind: 'attendance', open: true, label: 'Checked in 9:31 AM, still checked in' });
        expect(open.expectedMinutes).toBe(0); // not counted until checked out
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
        // Sneha isn't checked in today (she's still checked in from the last working day).
        expect(by('ACME-004')).not.toMatch(/present|late/);
    });
});

describe('flows', () => {
    it('1. resubmit → manager approves → blocker clears → process → month read-only', () => {
        const ws = s.sentBackWeek;
        const friday = weekView(M, sneha, ws).days[4].date;
        addEntry(M, sneha, { date: friday, start: '14:00', end: '18:30', description: 'Bug fixes – invoice export' });
        // PROTOTYPE-SETUP (Timesheet filing): start and end are required by default, so the hours-only entry blocks
        // the resubmission until it gets times.
        expect(() => submitWeek(M, sneha, ws)).toThrow('1 entry needs more details before you submit: Enter a start and end time.');
        const notes = weekView(M, sneha, ws).week.entries.find(x => x.description === 'Writing release notes')!;
        editEntry(M, sneha, notes.id, { date: notes.date, start: '19:30', end: '20:30', description: notes.description });
        submitWeek(M, sneha, ws);
        expect(timesheetQueue(M, arjun, 'waiting').some(i => i.weekStart === ws)).toBe(true);
        approveWeek(M, arjun, String(sneha.id), ws);
        // PROTOTYPE-SETUP (Final batch, Slice 1): With Payroll still blocks the month until Payroll approves.
        expect(payrollMonthStatus(M, lastMonth()).canProcess).toBe(false);
        payrollApproveWeek(M, String(sneha.id), ws);
        expect(payrollMonthStatus(M, lastMonth()).canProcess).toBe(true);
        processPayrollMonth(M, lastMonth());
        expect(weekView(M, sneha, ws).editMode).toBe('locked');
        expect(attendanceMonthOf(M, sneha, lastMonth()).locked).toBe(true);
        expect(() => addEntry(M, sneha, { date: friday, start: '19:00', end: '19:30', description: 'x' })).toThrow(/processed/);
    });

    it('2. overtime from a suggested day → manager → Payroll', () => {
        const suggestion = overtimeViewOf(M, sneha, currentMonth()).suggestions.find(x => x.date === s.overtimeDay)!;
        const req = createOvertime(M, sneha, { kind: 'worked', date: suggestion.date, minutes: suggestion.minutes, description: 'Release support' });
        expect(teamRequests(M, arjun, 'overtime', 'waiting').some(r => r.id === req.id)).toBe(true);
        decideRequest(M, 'overtime', req.id, { role: 'MANAGER', manager: arjun }, 'APPROVED');
        expect(level2Requests(M, 'PAYROLL', 'overtime', 'waiting').some(r => r.id === req.id)).toBe(true);
        expect(level2Requests(M, 'FINANCE', 'overtime', 'waiting').some(r => r.id === req.id)).toBe(false);
        const done = decideRequest(M, 'overtime', req.id, { role: 'PAYROLL' }, 'APPROVED');
        expect(done.trail.status).toBe('APPROVED');
    });

    it('3. a next-day check-out correction → manager → Payroll → attendance, window and overtime update', () => {
        const before = attendanceDay(M, sneha, s.overtimeDay);
        const c = createCorrection(M, sneha, { date: s.overtimeDay, checkIn: '09:20', checkOut: '01:00', outDays: 1, reason: 'Release ran past midnight' });
        expect(c.requested).toEqual({ checkIn: '09:20', checkOut: '01:00', outDays: 1 });
        // all attendance changes are requests: nothing changes until it's approved, and no suggestion meanwhile
        expect(attendanceDay(M, sneha, s.overtimeDay)).toMatchObject({ checkOut: before.checkOut, outDays: 0 });
        expect(overtimeViewOf(M, sneha, currentMonth()).suggestions.map(x => x.date)).not.toContain(s.overtimeDay);
        decideRequest(M, 'attendance', c.id, { role: 'MANAGER', manager: arjun }, 'APPROVED');
        expect(level2Requests(M, 'PAYROLL', 'attendance', 'waiting').some(r => r.id === c.id)).toBe(true);
        decideRequest(M, 'attendance', c.id, { role: 'PAYROLL' }, 'APPROVED');
        const day = attendanceDay(M, sneha, s.overtimeDay);
        expect(day).toMatchObject({ checkOut: '01:00', outDays: 1, minutesAtWork: 25 * 60 - (9 * 60 + 20) });
        expect(day.breaks).toEqual(before.breaks); // breaks are kept
        const tsDay = weekView(M, sneha, weekStartOf(s.overtimeDay)).days.find(d => d.date === s.overtimeDay)!;
        expect(tsDay.window).toMatchObject({ end: '01:00', endMinutes: 25 * 60, label: 'Checked in 9:20 AM, out 1:00 AM (next day)' });
        expect(overtimeViewOf(M, sneha, currentMonth()).suggestions.find(x => x.date === s.overtimeDay)?.minutes).toBe(25 * 60 - (9 * 60 + 20) - 9 * 60);
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
        updateSettings(M, { timesheetApproval: { enabled: false, submissionWeekday: 'FRIDAY', submissionTime: '23:00' } });
        expect(payrollMonthStatus(M, lastMonth()).blockers).toEqual([]);
        expect(weekView(M, sneha, s.crWeek).editMode).toBe('direct');
        expect(runSubmissionDay(M).submitted).toEqual([]);
    });

    it('submission day sends open weeks to the manager; the CEO’s go straight to Payroll', () => {
        const result = runSubmissionDay(M);
        expect(result.submitted.some(x => x.employeeId === sneha.id && x.weekStart === s.thisWeek)).toBe(true);
        const ceo = result.submitted.find(x => x.name === 'Rohan Malhotra')!;
        expect(weekView(M, findEmployee(ceo.employeeId)!, ceo.weekStart).week.status).toBe('WITH_PAYROLL');
        expect(weekView(M, sneha, s.sentBackWeek).week.status).toBe('SENT_BACK');
    });

    it('months before last month are processed and locked', () => {
        expect(payrollMonthStatus(M, addMonths(currentMonth(), -2)).processed).toBe(true);
    });
});

// PROTOTYPE-SETUP (V2): hours-only entries end to end. PROTOTYPE-SETUP (Timesheet filing): new ones are logged when the
// company files a duration only (Pattern B).
const DURATION_ONLY = { ...DEFAULT_FILING, fields: { projectCode: false, startTime: false, endTime: false, duration: true } };

describe('hours-only entries', () => {
    beforeEach(() => updateSettings(M, { timesheetFiling: DURATION_ONLY }));
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
    it('duration-only filing keeps the duration and invents no times', () => {
        const date = s.thisWeek < s.today ? s.thisWeek : s.today;
        const v = addEntry(M, sneha, { date, start: '21:00', mins: 45, description: 'Late call' });
        expect(v.days.find(d => d.date === date)!.entries.find(x => x.description === 'Late call')).toMatchObject({ start: null, end: null, mins: 45 });
        expect(() => addEntry(M, sneha, { date, description: 'No duration' })).toThrow('Enter how long you worked, e.g. 1:30 or 1h 30m.');
    });
    it('timesheet-only overtime counts hours-only entries', () => {
        // Approval off, so any unlocked week can be edited directly.
        updateSettings(M, { mode: 'timesheet', timesheetApproval: { enabled: false, submissionWeekday: 'FRIDAY', submissionTime: '23:00' }, timesheetFiling: DURATION_ONLY });
        const date = s.overtimeDay;
        const extraBefore = overtimeViewOf(M, sneha, currentMonth()).suggestions.find(x => x.date === date)?.minutes ?? 0;
        expect(weekView(M, sneha, weekStartOf(date)).editMode).toBe('direct');
        addEntry(M, sneha, { date, mins: 120, description: 'Extra hours, no set time' });
        const extraAfter = overtimeViewOf(M, sneha, currentMonth()).suggestions.find(x => x.date === date)?.minutes ?? 0;
        expect(extraAfter - extraBefore).toBe(120);
    });
});

// PROTOTYPE-SETUP (Timesheet filing): the employee submits a period by hand; automatic submission still runs.
describe('timesheet filing: submission', () => {
    /** A past working day of this week (else last week) other than the open day. */
    const pastDay = () =>
        [0, 1, 2, 3, 4, -7, -6, -5, -4, -3].map(i => addDays(s.thisWeek, i)).find(d => d < s.today && d !== s.openDay && isWorkingDay(d))!;

    it('a draft can be submitted by hand once it has started; a second click is refused, not duplicated', () => {
        const view = weekView(M, sneha, s.today);
        expect(view.week.status).toBe('DRAFT');
        expect(view.canSubmit).toBe(true);
        expect(view.filing).toMatchObject({ frequency: 'WEEKLY', period: { start: s.thisWeek, end: addDays(s.thisWeek, 6) } });
        const done = submitWeek(M, sneha, s.thisWeek, { acknowledged: { overlaps: true, gaps: true } });
        expect(done.week.status).toBe('SUBMITTED');
        expect(done.week.history.filter(h => h.action === 'SUBMITTED')).toHaveLength(1);
        expect(() => submitWeek(M, sneha, s.thisWeek)).toThrow(`This timesheet is already with ${arjun.fullName}.`);
        expect(weekView(M, sneha, s.thisWeek).week.history.filter(h => h.action === 'SUBMITTED')).toHaveLength(1);
        expect(timesheetQueue(M, arjun, 'waiting').some(i => i.weekStart === s.thisWeek && i.periodEnd === addDays(s.thisWeek, 6))).toBe(true);
    });

    it('a future period can’t be submitted', () => {
        expect(() => submitWeek(M, sneha, addDays(s.thisWeek, 7))).toThrow("You can't submit a period that hasn't started.");
    });

    it('overlaps are saved and warned, never blocking; the acknowledgement goes in the history', () => {
        const date = pastDay();
        addEntry(M, sneha, { date, start: '10:00', end: '10:45', description: 'Extra sync' });
        const view = weekView(M, sneha, date);
        const review = reviewOf(view);
        expect(review.overlaps.length).toBeGreaterThan(0);
        expect(submissionPrompt(review, 'manual')).toBe('overlaps');
        expect(submissionPrompt(review, 'manual', { overlaps: true })).not.toBe('overlaps');
        const done = submitWeek(M, sneha, view.week.weekStart, { acknowledged: { overlaps: true, gaps: true } });
        expect(done.week.status).toBe('SUBMITTED');
        expect(done.week.history.at(-1)).toMatchObject({ action: 'SUBMITTED', detail: expect.stringMatching(/^Submitted with \d+ overlaps?/) });
    });

    it('a gap over 5 minutes warns before a manual submission; Submit anyway still submits', () => {
        const date = pastDay();
        const view = weekView(M, sneha, date);
        const day = view.days.find(d => d.date === date)!;
        // Delete the day's last entry: the end of the day is no longer covered.
        const last = day.entries[day.entries.length - 1];
        const after = deleteEntry(M, sneha, last.id);
        const review = reviewOf(after);
        expect(review.gaps.find(g => g.date === date)?.gaps[0]).toMatchObject({ minutes: last.mins });
        expect(submissionPrompt(review, 'manual', { overlaps: true })).toBe('gaps');
        expect(submitWeek(M, sneha, after.week.weekStart, { acknowledged: { gaps: true, overlaps: true } }).week.status).toBe('SUBMITTED');
    });

    it('automatic submission never waits for warnings: gaps are noted in the history, the period still goes', () => {
        const date = pastDay();
        const day = weekView(M, sneha, date).days.find(d => d.date === date)!;
        deleteEntry(M, sneha, day.entries[day.entries.length - 1].id);
        const before = weekView(M, sneha, date);
        expect(submissionPrompt(reviewOf(before), 'auto')).toBeNull();
        const result = runSubmissionDay(M);
        expect(result.submitted.some(x => x.employeeId === sneha.id && x.weekStart === before.week.weekStart)).toBe(true);
        const sent = weekView(M, sneha, date).week;
        expect(sent.status).toBe('SUBMITTED');
        expect(sent.history.at(-1)).toMatchObject({ action: 'AUTO_SUBMITTED', detail: expect.stringMatching(/not reviewed: .*gaps? over 5 min/) });
    });

    it('sent back → resubmitted → manager → With Payroll → Payroll approves (Final batch)', () => {
        submitWeek(M, sneha, s.thisWeek, { acknowledged: { overlaps: true, gaps: true } });
        sendBackWeek(M, arjun, String(sneha.id), s.thisWeek, 'Please add the standup.');
        expect(weekView(M, sneha, s.thisWeek)).toMatchObject({ week: { status: 'SENT_BACK', sentBackBy: 'MANAGER' }, canSubmit: true });
        submitWeek(M, sneha, s.thisWeek, { acknowledged: { overlaps: true, gaps: true } });
        approveWeek(M, arjun, String(sneha.id), s.thisWeek);
        expect(weekView(M, sneha, s.thisWeek).week).toMatchObject({ status: 'WITH_PAYROLL', managerDecision: { by: { name: arjun.fullName } } });
        expect(payrollTimesheetQueue(M, 'waiting').find(i => i.employee.id === sneha.id && i.weekStart === s.thisWeek)).toMatchObject({ approvedBy: arjun.fullName, waitingForYou: true });
        payrollApproveWeek(M, String(sneha.id), s.thisWeek);
        expect(weekView(M, sneha, s.thisWeek)).toMatchObject({ week: { status: 'APPROVED' }, editMode: 'direct', canSubmit: false });
    });
});

describe('timesheet filing: settings drive the fields and periods', () => {
    it('project codes: required when on (and normalised), not asked for when off', () => {
        const date = s.thisWeek < s.today ? s.thisWeek : s.today;
        expect(() => updateSettings(M, { timesheetFiling: { ...DEFAULT_FILING, fields: { ...DEFAULT_FILING.fields, endTime: false } } })).toThrow(/work as a pair/);
        updateSettings(M, { timesheetFiling: { ...DEFAULT_FILING, fields: { ...DEFAULT_FILING.fields, projectCode: true } } });
        expect(() => addEntry(M, sneha, { date, start: '20:00', end: '20:30', description: 'x' })).toThrow('Pick a project code.');
        const v = addEntry(M, sneha, { date, start: '20:00', end: '20:30', description: 'x', projectCode: ' pay-101 ' });
        expect(v.days.find(d => d.date === date)!.entries.find(x => x.start === '20:00')).toMatchObject({ projectCode: 'PAY-101' });
        updateSettings(M, { timesheetFiling: DEFAULT_FILING });
        expect(() => addEntry(M, sneha, { date, start: '20:30', end: '21:00', description: 'y' })).not.toThrow();
    });

    it('start + end filing requires both times; the duration comes from them', () => {
        const date = s.thisWeek < s.today ? s.thisWeek : s.today;
        expect(() => addEntry(M, sneha, { date, mins: 60, description: 'x' })).toThrow('Enter a start and end time.');
        const v = addEntry(M, sneha, { date, start: '21:00', end: '22:30', mins: 15, description: 'Release checks' });
        expect(v.days.find(d => d.date === date)!.entries.find(x => x.description === 'Release checks')).toMatchObject({ mins: 90 });
    });

    it('daily filing: one day per period; drafts regroup, submitted periods keep their dates', () => {
        submitWeek(M, sneha, s.thisWeek, { acknowledged: { overlaps: true, gaps: true } });
        updateSettings(M, { timesheetFiling: { ...DEFAULT_FILING, frequency: 'DAILY' } });
        expect(getSettings(M).timesheetFiling.frequency).toBe('DAILY');
        // This week was submitted: it keeps its Monday–Sunday dates.
        expect(weekView(M, sneha, s.today).filing.period).toMatchObject({ start: s.thisWeek, end: addDays(s.thisWeek, 6) });
        const next = addDays(s.thisWeek, 9);
        expect(weekView(M, sneha, next).filing.period).toMatchObject({ start: next, end: next, label: expect.stringMatching(/^\w{3}, \d{1,2} \w{3} \d{4}$/) });
    });

    it('monthly filing: the month, clipped after periods already submitted', () => {
        updateSettings(M, { timesheetFiling: { ...DEFAULT_FILING, frequency: 'MONTHLY' } });
        const view = weekView(M, sneha, s.today);
        const p = view.filing.period;
        expect(p.end).toBe(`${s.today.slice(0, 7)}-${String(new Date(Number(s.today.slice(0, 4)), Number(s.today.slice(5, 7)), 0).getDate()).padStart(2, '0')}`);
        // The draft weeks of this month were regrouped into it: its start is the day after the last submitted week.
        expect(p.start <= s.thisWeek).toBe(true);
        expect(view.week.entries.length).toBeGreaterThan(0);
        const periods = timesheetPeriodsOf(M, sneha, `${s.today.slice(0, 7)}-01`, s.today);
        periods.slice(1).forEach((x, i) => expect(x.filing.period.start).toBe(addDays(periods[i].filing.period.end, 1)));
        // Monthly drafts go out on the month's last day.
        expect(view.filing.autoSubmitOn).toBe(p.end);
    });

    it('the team grid shows one status for the periods a week touches', () => {
        updateSettings(M, { timesheetFiling: { ...DEFAULT_FILING, frequency: 'DAILY' } });
        const row = teamWeekGrid(M, arjun, s.thisWeek).rows.find(r => r.employee.id === sneha.id)!;
        expect(row.status).toBe('DRAFT');
    });

    it('the automatic run respects the frequency (daily: the days already over)', () => {
        updateSettings(M, { timesheetFiling: { ...DEFAULT_FILING, frequency: 'DAILY' } });
        const result = runSubmissionDay(M);
        const mine = result.submitted.filter(x => x.employeeId === sneha.id);
        expect(mine.length).toBeGreaterThan(0);
        mine.forEach(x => {
            expect(x.periodEnd).toBe(x.weekStart);
            expect(x.periodEnd < s.today).toBe(true);
        });
        expect(weekView(M, sneha, s.today).week.status).toBe('DRAFT');
        expect(() => autoRunSubmissionDay(M)).not.toThrow();
    });

    it('edits after sending validate against the fields like any edit', () => {
        updateSettings(M, { timesheetFiling: { ...DEFAULT_FILING, fields: { ...DEFAULT_FILING.fields, projectCode: true } } });
        const {date} = weekView(M, sneha, s.crWeek).days[0];
        expect(() => addEntry(M, sneha, { date, start: '20:00', end: '20:30', description: 'Call' })).toThrow('Pick a project code.');
        const ok = addEntry(M, sneha, { date, start: '20:00', end: '20:30', description: 'Call', projectCode: 'INV-220' });
        expect(periodEndOf(ok.week)).toBe(addDays(s.crWeek, 6));
    });
});

// PROTOTYPE-SETUP (HR rules, Slice 1): no automatic check-out — open sessions, one punch of each per day, breaks.
describe('open sessions (no automatic check-out)', () => {
    it("check-in is blocked while an earlier day is still open; checking out of it sets outDays", () => {
        resetTodayCheckIn(M);
        const o = overviewOf(M, sneha);
        expect(o.today).toMatchObject({ canCheckIn: false, openFrom: { date: s.openDay, checkIn: '09:31' } });
        expect(() => checkIn(M, sneha)).toThrow(/^Check out from .+ first\.$/);
        const after = checkOutPrevious(M, sneha);
        const closed = recordOf(M, sneha, s.openDay)!;
        expect(closed.checkOut).toMatch(/^\d{2}:\d{2}$/);
        expect(closed.outDays).toBe(daysBetween(s.openDay, s.today));
        expect(after.today.openFrom).toBeUndefined();
        expect(attendanceDay(M, sneha, s.openDay)).toMatchObject({ open: false, outDays: closed.outDays });
        expect(() => checkOutPrevious(M, sneha)).toThrow(/not checked in from an earlier day/);
        if (after.today.status === 'on-leave') return; // the seed's leave can fall on today
        expect(after.today.canCheckIn).toBe(true);
        expect(checkIn(M, sneha).today).toMatchObject({ canCheckIn: false, canCheckOut: true, canStartBreak: true });
    });

    it('a Friday closed on Monday is 3 days later; its hours and overtime stay on Friday', () => {
        const friday = addDays(weekStartOf(s.today), -3);
        atsAttendance.update(M, all => ({ ...all, [`${sneha.id}:${friday}`]: { employeeId: sneha.id, date: friday, checkIn: '09:30', checkOut: '10:00', outDays: 3, source: 'ess' } }));
        const d = attendanceDay(M, sneha, friday);
        expect(d.minutesAtWork).toBe(3 * 24 * 60 + 30);
        expect(d.outDays).toBe(3);
    });

    it('each punch works once; the server refuses a second', () => {
        resetTodayCheckIn(M);
        checkOutPrevious(M, sneha);
        const o = overviewOf(M, sneha);
        if (o.today.status === 'on-leave') return;
        expect(o.today).toMatchObject({ canCheckIn: true, canCheckOut: false });
        expect(() => checkOut(M, sneha)).toThrow("You haven't checked in today.");
        expect(checkIn(M, sneha).today).toMatchObject({ canCheckIn: false, canCheckOut: true });
        expect(() => checkIn(M, sneha)).toThrow("You've already checked in today.");
        expect(checkOut(M, sneha).today).toMatchObject({ canCheckIn: false, canCheckOut: false, canStartBreak: false });
        expect(() => checkOut(M, sneha)).toThrow("You've already checked out today.");
        expect(() => checkIn(M, sneha)).toThrow("You've already checked in today.");
    });
});

describe('breaks', () => {
    const openToday = () => {
        resetTodayCheckIn(M);
        if (overviewOf(M, sneha).today.openFrom) checkOutPrevious(M, sneha);
        if (overviewOf(M, sneha).today.status === 'on-leave') return false;
        checkIn(M, sneha);
        return true;
    };

    // Today at a fixed time of day, so breaks have a length (only Date is faked).
    const at = (hhmm: string) => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(`${s.today}T${hhmm}:00`));
    };
    afterEach(() => vi.useRealTimers());

    it('start / end only while checked in; checking out ends a running break', () => {
        at('10:00');
        resetTodayCheckIn(M);
        checkOutPrevious(M, sneha);
        expect(() => startBreak(M, sneha)).toThrow(/while you’re checked in/);
        if (!openToday()) return;
        at('10:05');
        const on = startBreak(M, sneha);
        at('10:20');
        expect(on.today).toMatchObject({ onBreak: true, canStartBreak: false, canEndBreak: true });
        expect(() => startBreak(M, sneha)).toThrow(/already on a break/);
        const off = endBreak(M, sneha);
        expect(off.today).toMatchObject({ onBreak: false, canStartBreak: true, canEndBreak: false });
        expect(off.today.breaks).toHaveLength(1);
        expect(off.today.breaks[0]).toMatchObject({ start: '10:05', end: '10:20' });
        expect(() => endBreak(M, sneha)).toThrow(/not on a break/);
        startBreak(M, sneha);
        at('10:40');
        const out = checkOut(M, sneha);
        expect(out.today.breaks).toEqual([{ start: '10:05', end: '10:20' }, { start: '10:20', end: '10:40' }]);
        expect(() => startBreak(M, sneha)).toThrow(/while you’re checked in/);
    });

    it('a break ended in the minute it started is dropped, so Edit breaks can still save', () => {
        at('11:00');
        if (!openToday()) return;
        startBreak(M, sneha);
        const off = endBreak(M, sneha);
        expect(off.today.breaks).toEqual([]);
        expect(off.today).toMatchObject({ onBreak: false, canStartBreak: true });
    });

    it("today's breaks are edited directly: no overlaps, within check-in → check-out", () => {
        const key = `${sneha.id}:${s.today}`;
        atsAttendance.update(M, all => ({ ...all, [key]: { employeeId: sneha.id, date: s.today, checkIn: '08:00', checkOut: '20:00', outDays: 0, breaks: [], source: 'ess' } }));
        const v = updateTodayBreaks(M, sneha, { breaks: [{ start: '16:00', end: '16:15' }, { start: '13:00', end: '13:45', description: ' Lunch ' }] });
        expect(v.today.breaks).toEqual([{ start: '13:00', end: '13:45', description: 'Lunch' }, { start: '16:00', end: '16:15' }]);
        expect(v.today.breakMinutes).toBe(60);
        expect(() => updateTodayBreaks(M, sneha, { breaks: [{ start: '13:00', end: '14:00' }, { start: '13:30', end: '14:30' }] })).toThrow(/overlap/);
        expect(() => updateTodayBreaks(M, sneha, { breaks: [{ start: '19:30', end: '20:30' }] })).toThrow(/between your check-in/);
        expect(() => updateTodayBreaks(M, sneha, { breaks: [{ start: '07:30', end: '08:30' }] })).toThrow(/between your check-in/);
        expect(() => updateTodayBreaks(M, sneha, { breaks: [{ start: '14:00', end: '13:00' }] })).toThrow(/end after it starts/);
        expect(() => updateTodayBreaks(M, sneha, { breaks: [{ start: '14:00', end: null }] })).toThrow(/still be running/);
    });

    it("past breaks: only the description changes here (times go through a correction)", () => {
        const date = s.overtimeDay;
        const before = recordOf(M, sneha, date)!.breaks!;
        expect(before).toEqual([{ start: '13:00', end: '14:00', description: 'Lunch' }]);
        const v = updateBreakDescription(M, sneha, date, 0, { description: 'Team lunch' });
        expect(v.days.find(d => d.date === date)!.breaks[0]).toMatchObject({ start: '13:00', end: '14:00', description: 'Team lunch', minutes: 60 });
        expect(recordOf(M, sneha, date)!.breaks).toEqual([{ start: '13:00', end: '14:00', description: 'Team lunch' }]);
    });

    it('breaks count as logged time and entries can’t overlap them', () => {
        const date = s.overtimeDay;
        const view = weekView(M, sneha, weekStartOf(date));
        const day = view.days.find(d => d.date === date)!;
        const entries = day.entries.reduce((sum, x) => sum + x.mins, 0);
        expect(day.loggedMinutes).toBe(entries + 60);
        if (view.editMode !== 'direct') return;
        expect(() => addEntry(M, sneha, { date, start: '13:15', end: '13:45', description: 'x' })).toThrow('Overlaps with 1:00 PM – 2:00 PM (break).');
    });
});

// PROTOTYPE-SETUP (HR rules, Slice 1): an overnight day — all hours count to the check-in day.
describe('overnight day', () => {
    it('9:00 AM → 5:00 AM (next day): 20h worked, 11h overtime suggested, all on the check-in day', () => {
        const d = attendanceDay(M, sneha, s.overnightDay);
        expect(d).toMatchObject({ checkIn: '09:00', checkOut: '05:00', outDays: 1, minutesAtWork: 20 * 60, overtimeMinutes: 11 * 60, breakMinutes: 60 });
        expect(overtimeViewOf(M, sneha, currentMonth()).suggestions.find(x => x.date === s.overnightDay)?.minutes ?? 660).toBe(660);
        const t = weekView(M, sneha, weekStartOf(s.overnightDay)).days.find(x => x.date === s.overnightDay)!;
        expect(t.window).toMatchObject({ startMinutes: 9 * 60, endMinutes: 29 * 60, label: 'Checked in 9:00 AM, out 5:00 AM (next day)' });
        expect(t.entries.filter(e => e.endNext).map(e => [e.start, e.end, Boolean(e.startNext), e.mins])).toEqual([
            ['22:00', '02:00', false, 240],
            ['02:00', '05:00', true, 180],
        ]);
        expect(t.expectedMinutes).toBe(20 * 60);
        expect(t.loggedMinutes).toBe(20 * 60);
        expect(t.unloggedMinutes).toBe(0);
        expect(t.outsideCheckIn).toBeUndefined();
    });

    it('next-day entries: an end before the start ends the next morning; overlaps count across midnight', () => {
        const date = [0, 1, 2, 3, 4].map(i => addDays(s.thisWeek, i)).find(d => d < s.today && d !== s.openDay) ?? s.thisWeek;
        const v = addEntry(M, sneha, { date, start: '22:00', end: '01:00', description: 'Night release' });
        expect(v.days.find(d => d.date === date)!.entries.find(x => x.description === 'Night release')).toMatchObject({ start: '22:00', end: '01:00', endNext: true, mins: 180 });
        // PROTOTYPE-SETUP (Timesheet filing): an overlap is saved and warned about (across midnight too).
        const both = addEntry(M, sneha, { date, start: '00:30', startNext: true, end: '02:00', description: 'x' });
        const night = both.days.find(d => d.date === date)!.entries;
        const overlaps = findOverlaps(night).filter(o => [o.a, o.b].every(id => night.find(e => e.id === id)!.start !== null && ['Night release', 'x'].includes(night.find(e => e.id === id)!.description)));
        expect(overlaps).toEqual([expect.objectContaining({ date, from: 24 * 60 + 30, to: 25 * 60 })]);
        expect(() => addEntry(M, sneha, { date, start: '23:30', end: '23:30', description: 'x' })).toThrow('Start and end can’t be the same time.');
        const checks = addEntry(M, sneha, { date, start: '01:30', startNext: true, end: '02:30', description: 'Checks' });
        expect(checks.days.find(d => d.date === date)!.entries.find(x => x.description === 'Checks')).toMatchObject({ start: '01:30', end: '02:30', startNext: true, endNext: true, mins: 60 });
        expect(reviewPeriod({ days: checks.days, fields: DEFAULT_FILING.fields, mode: 'both', today: s.today }).overlaps.length).toBeGreaterThan(0);
    });
});

// PROTOTYPE-SETUP (HR rules, Slice 1): level 2 for attendance corrections and overtime is the Payroll queue.
describe('approvals: level 2 = Payroll', () => {
    it('attendance and overtime go manager → Payroll; leave and reimbursement are unchanged', () => {
        const settings = { level2: { attendance: 'PAYROLL', overtime: 'PAYROLL', leave: 'HR', reimbursement: 'FINANCE', timesheet: 'NONE' } as const };
        const trail = startTrail('attendance', { id: arjun.id, name: arjun.fullName }, settings);
        expect(trail.steps.map(st => st.role)).toEqual(['MANAGER', 'PAYROLL']);
        const c = createCorrection(M, sneha, { date: s.overtimeDay, checkIn: '09:00', reason: 'Badge reader' });
        expect(c.trail.steps.map(st => st.role)).toEqual(['MANAGER', 'PAYROLL']);
        const approved = decideRequest(M, 'attendance', c.id, { role: 'MANAGER', manager: arjun }, 'APPROVED');
        expect(approved.trail.status).toBe('PENDING_PAYROLL');
        expect(level2Counts(M, 'PAYROLL').attendance).toBeGreaterThanOrEqual(1);
        expect(level2Requests(M, 'HR', 'attendance', 'waiting').some(r => r.id === c.id)).toBe(false);
        expect(startTrail('leave', { id: arjun.id, name: arjun.fullName }, settings).steps[1].role).toBe('HR');
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
        const open = h.recentDays.find(d => d.date === s.openDay)!;
        expect(open.attendance).toMatchObject({ open: true, carried: true, checkOut: null });
        expect(open.overtime).toEqual({ kind: 'none' });
        expect(h.recentDays.find(d => d.date === s.overtimeDay)?.overtime.kind ?? 'unclaimed').toBe('unclaimed');
    });
    it('needs your action: still checked in (first) and unclaimed overtime, each with a link', () => {
        const h = homeOf(M, sneha);
        expect(h.actions[0]).toMatchObject({ kind: 'still-checked-in', button: 'Go to attendance', link: { tab: 'attendance' } });
        expect(h.actions[0].title).toMatch(/^You’re still checked in from /);
        expect(h.actions.find(a => a.kind === 'overtime')).toMatchObject({ button: 'Review overtime', link: { tab: 'overtime' } });
        // once checked out of that day, it's no longer an action
        checkOutPrevious(M, sneha);
        expect(homeOf(M, sneha).actions.some(a => a.kind === 'still-checked-in')).toBe(false);
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
    it('still checked in from an earlier day: counted once checked out (target 0 until then)', () => {
        const open = homeOf(M, sneha).recentDays.find(d => d.date === s.openDay)!;
        expect(open.attendance).toMatchObject({ open: true, carried: true });
        expect(open.timesheet.expectedMinutes).toBe(0);
    });
    it('a normal past day: hours worked = check-out − check-in (breaks included) = the timesheet target', () => {
        const day = homeOf(M, sneha).recentDays.find(d => d.date < s.today && d.attendance.checkIn && d.attendance.checkOut && !d.attendance.outDays)!;
        const worked = toMinutes(day.attendance.checkOut!) - toMinutes(day.attendance.checkIn!);
        expect(day.attendance.minutesAtWork).toBe(worked);
        expect(day.timesheet.expectedMinutes).toBe(worked);
    });
});

describe('overview recent days: leave and absent', () => {
    it('leave and absent days: no hours worked', () => {
        const days = homeOf(M, sneha).recentDays.filter(d => d.date < s.today && d.attendance.checkIn && !d.attendance.open);
        const [absentDay, leaveDay] = days.map(d => d.date);
        atsAttendance.update(M, all => {
            const next = { ...all };
            delete next[`${sneha.id}:${absentDay}`];
            delete next[`${sneha.id}:${leaveDay}`];
            return next;
        });
        // PROTOTYPE-SETUP (Final batch, Slice 1): approved leave comes from the live leave requests.
        const template = atsLeaveRequests.get(M).find(l => l.employeeId === sneha.id && l.trail.status === 'APPROVED')!;
        atsLeaveRequests.update(M, list => [...list, { ...template, id: 'lv-test', start: leaveDay, end: leaveDay, half: null, days: 1 }]);
        const after = homeOf(M, sneha).recentDays;
        expect(after.find(d => d.date === absentDay)!.attendance).toMatchObject({ status: 'absent', checkIn: null, minutesAtWork: 0 });
        expect(after.find(d => d.date === leaveDay)!.attendance).toMatchObject({ status: 'on-leave', checkIn: null, minutesAtWork: 0 });
        expect(after.find(d => d.date === leaveDay)!.timesheet.expectedMinutes).toBe(0);
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

// PROTOTYPE-SETUP (Attendance final, Slice 2; HR rules, Slice 2): month totals — break time and weekday holidays.
describe('attendance month totals', () => {
    it('break time is the recorded breaks; days still checked in aren’t counted yet', () => {
        const month = s.openDay.slice(0, 7);
        const v = attendanceMonthOf(M, sneha, month, { overtimeAtMinimum: true });
        const counted = v.days.filter(d => !d.open);
        expect(v.totals.breakMinutes).toBe(counted.reduce((sum, d) => sum + d.breakMinutes, 0));
        expect(v.totals.minutesAtWork).toBe(counted.reduce((sum, d) => sum + d.minutesAtWork, 0));
        checkOutPrevious(M, sneha);
        const after = attendanceMonthOf(M, sneha, month, { overtimeAtMinimum: true });
        expect(after.totals.minutesAtWork).toBeGreaterThan(v.totals.minutesAtWork);
    });
    it('counts holidays on working weekdays only', () => {
        [0, -1, -2, -3].forEach(n => {
            const v = attendanceMonthOf(M, sneha, addMonths(currentMonth(), n));
            const weekday = v.days.filter(d => d.status === 'holiday' && ![0, 6].includes(new Date(`${d.date}T00:00:00`).getDay()));
            expect(v.totals.holidays).toBe(weekday.length);
        });
    });
});

// ---- PROTOTYPE-SETUP (Final batch, Slice 1) -----------------------------------------------------------------

describe('final batch: the approval path and edits after sending', () => {
    const pastDay = () =>
        [0, 1, 2, 3, 4, -7, -6, -5, -4, -3].map(i => addDays(s.thisWeek, i)).find(d => d < s.today && d !== s.openDay && isWorkingDay(d))!;

    it('an entry saves straight away; the period stays Draft until submitted', () => {
        const date = pastDay();
        const v = addEntry(M, sneha, { date, start: '20:00', end: '20:30', description: 'Notes' });
        expect(v.week.status).toBe('DRAFT');
        expect(v.week.entries.some(x => x.description === 'Notes')).toBe(true);
    });

    it('editing an approved period → Draft with the approved version as the baseline; resubmit → the manager sees it', () => {
        submitWeek(M, sneha, s.thisWeek, { acknowledged: { overlaps: true, gaps: true } });
        approveWeek(M, arjun, String(sneha.id), s.thisWeek);
        payrollApproveWeek(M, String(sneha.id), s.thisWeek);
        const approved = weekView(M, sneha, s.thisWeek).week;
        const date = pastDay() >= s.thisWeek ? pastDay() : s.thisWeek;
        const v = addEntry(M, sneha, { date, start: '20:00', end: '20:30', description: 'Late fix' });
        expect(v.week).toMatchObject({ status: 'DRAFT', editedAfter: 'APPROVED' });
        expect(v.week.baselineEntries).toEqual(approved.approvedEntries);
        expect(v.week.history.at(-1)).toMatchObject({ action: 'EDITED_AFTER_SENDING', detail: 'Edited after it was approved. Needs submitting again.' });
        submitWeek(M, sneha, s.thisWeek, { acknowledged: { overlaps: true, gaps: true } });
        const item = timesheetQueue(M, arjun, 'waiting').find(i => i.weekStart === s.thisWeek && i.employee.id === sneha.id)!;
        expect(item).toMatchObject({ editedAfter: 'APPROVED', diffSummary: '1 added' });
    });

    it('an edit while with the manager or with Payroll also moves it back to Draft', () => {
        submitWeek(M, sneha, s.thisWeek, { acknowledged: { overlaps: true, gaps: true } });
        const date = pastDay() >= s.thisWeek ? pastDay() : s.thisWeek;
        expect(addEntry(M, sneha, { date, start: '20:00', end: '20:15', description: 'x' }).week).toMatchObject({ status: 'DRAFT', editedAfter: 'SUBMITTED' });
        submitWeek(M, sneha, s.thisWeek, { acknowledged: { overlaps: true, gaps: true } });
        approveWeek(M, arjun, String(sneha.id), s.thisWeek);
        expect(addEntry(M, sneha, { date, start: '20:15', end: '20:30', description: 'y' }).week).toMatchObject({ status: 'DRAFT', editedAfter: 'WITH_PAYROLL' });
    });

    it('Payroll can send it back too; payroll is blocked while any period isn’t approved (With Payroll included)', () => {
        submitWeek(M, sneha, s.thisWeek, { acknowledged: { overlaps: true, gaps: true } });
        approveWeek(M, arjun, String(sneha.id), s.thisWeek);
        const {blockers} = payrollMonthStatus(M, currentMonth());
        if (s.thisWeek.slice(0, 7) === currentMonth()) expect(blockers.some(b => b.employee.id === sneha.id && b.status === 'WITH_PAYROLL')).toBe(true);
        payrollSendBackWeek(M, String(sneha.id), s.thisWeek, 'Missing project for Tuesday.');
        expect(weekView(M, sneha, s.thisWeek).week).toMatchObject({ status: 'SENT_BACK', sentBackBy: 'PAYROLL' });
        expect(() => payrollSendBackWeek(M, String(sneha.id), s.thisWeek, 'again')).toThrow(/no longer waiting for Payroll/);
    });

    it('the CEO (no manager) goes straight to Payroll', () => {
        const ceo = findEmployee('ACME-021')!;
        const result = runSubmissionDay(M);
        const mine = result.submitted.find(x => x.employeeId === ceo.id);
        expect(mine).toBeTruthy();
        expect(weekView(M, ceo, mine!.weekStart).week.status).toBe('WITH_PAYROLL');
        expect(weekView(M, ceo, mine!.weekStart).week.history.at(-1)?.detail).toMatch(/No reporting manager, so it skipped level 1\./);
    });

    it('auto-submit sends only drafts with entries, with their attendance; anything already sent is left alone', () => {
        const result = runSubmissionDay(M);
        const mine = result.submitted.find(x => x.employeeId === sneha.id && x.weekStart === s.thisWeek);
        expect(mine).toBeTruthy();
        const sent = weekView(M, sneha, s.thisWeek).week;
        expect(sent.status).toBe('SUBMITTED');
        expect(sent.attendance?.length).toBeGreaterThan(0);
        expect(sent.history.at(-1)?.detail).toMatch(/^Auto-submitted Friday at 11:00 PM/);
        expect(result.submitted.some(x => x.employeeId === sneha.id && x.weekStart === s.sentBackWeek)).toBe(false);
        // A draft with no entries isn't sent.
        expect(result.submitted.every(x => weekView(M, findEmployee(x.employeeId)!, x.weekStart).week.entries.length > 0)).toBe(true);
    });
});

describe('final batch: leave requests and the leave page', () => {
    const nextWorking = (from: string, n = 1) => {
        let d = from;
        for (let k = 0; k < n; ) {
            d = addDays(d, 1);
            if (isWorkingDay(d)) k += 1;
        }
        return d;
    };
    it('the persona: Annual 5 carried; Casual 2 and Sick 1 lapse', () => {
        const v = leaveViewOf(M, sneha);
        const annual = v.balances.find(b => b.type === 'ANNUAL')!;
        expect(annual.carried).toBe(5);
        expect(v.balances.find(b => b.type === 'CASUAL')!.ledger.some(e => e.kind === 'LAPSED')).toBe(true);
        expect(v.year.basis).toBe('COMPANY');
    });
    it('half day (first or second), withdraw, overlap blocked, balance checked, sick over 3 days needs proof', () => {
        const day = nextWorking(s.today, 20);
        const v = createLeaveRequest(M, sneha, { type: 'CASUAL', start: day, half: 'FIRST', reason: 'Bank' });
        const req = v.requests.find(r => r.start === day)!;
        expect(req).toMatchObject({ half: 'FIRST', days: 0.5, trail: { status: 'PENDING_MANAGER' } });
        expect(() => createLeaveRequest(M, sneha, { type: 'CASUAL', start: day, end: day, reason: 'x' })).toThrow(/already have leave/);
        expect(() => createLeaveRequest(M, sneha, { type: 'CASUAL', start: day, half: 'SECOND', reason: 'x' })).not.toThrow();
        expect(withdrawLeaveRequest(M, sneha, req.id).requests.find(r => r.id === req.id)).toMatchObject({ withdrawn: true, statusLabel: 'Withdrawn' });
        const far = nextWorking(s.today, 45);
        // More sick days than the persona has: the balance check comes first.
        expect(() => createLeaveRequest(M, sneha, { type: 'SICK', start: far, end: nextWorking(far, 3), reason: 'Flu' })).toThrow(/available right now/);
        const policy = getSettings(M).leavePolicy;
        updateSettings(M, { leavePolicy: { ...policy, types: { ...policy.types, SICK: { ...policy.types.SICK, daysPerYear: 12 } } } });
        expect(() => createLeaveRequest(M, sneha, { type: 'SICK', start: far, end: nextWorking(far, 3), reason: 'Flu' })).toThrow('Sick leave of more than 3 days needs a medical certificate or proof.');
        expect(() => createLeaveRequest(M, sneha, { type: 'SICK', start: far, end: nextWorking(far, 3), reason: 'Flu', proof: { name: 'certificate.pdf' } })).not.toThrow();
        expect(() => createLeaveRequest(M, sneha, { type: 'ANNUAL', start: nextWorking(far, 10), end: nextWorking(far, 50), reason: 'Long trip' })).toThrow(/available right now/);
    });
    it('manager → HR; approved leave shows in attendance and the timesheet (full and half day)', () => {
        const full = nextWorking(s.today, 25);
        const half = nextWorking(full, 2);
        createLeaveRequest(M, sneha, { type: 'CASUAL', start: full, end: full, reason: 'Wedding' });
        createLeaveRequest(M, sneha, { type: 'CASUAL', start: half, half: 'SECOND', reason: 'Doctor' });
        leaveViewOf(M, sneha)
            .requests.filter(r => r.trail.status === 'PENDING_MANAGER' && (r.start === full || r.start === half))
            .forEach(r => {
                const mid = decideRequest(M, 'leave', r.id, { role: 'MANAGER', manager: arjun }, 'APPROVED');
                expect(mid.trail.status).toBe('PENDING_HR');
                expect(level2Requests(M, 'HR', 'leave', 'waiting').some(x => x.id === r.id)).toBe(true);
                decideRequest(M, 'leave', r.id, { role: 'HR' }, 'APPROVED');
            });
        expect(attendanceDay(M, sneha, full)).toMatchObject({ status: 'on-leave', label: 'Casual leave' });
        expect(weekView(M, sneha, full).days.find(d => d.date === full)!.expectedMinutes).toBe(0);
        expect(attendanceDay(M, sneha, half)).toMatchObject({ halfLeave: 'SECOND', label: 'Half-day leave (second half)' });
    });
    it('half-day leave in Timesheet-only mode expects half the shift', () => {
        const half = nextWorking(s.today, 35);
        createLeaveRequest(M, sneha, { type: 'CASUAL', start: half, half: 'FIRST', reason: 'x' });
        const r = leaveViewOf(M, sneha).requests.find(x => x.start === half)!;
        decideRequest(M, 'leave', r.id, { role: 'MANAGER', manager: arjun }, 'APPROVED');
        decideRequest(M, 'leave', r.id, { role: 'HR' }, 'APPROVED');
        updateSettings(M, { mode: 'timesheet' });
        expect(weekView(M, sneha, half).days.find(d => d.date === half)!.expectedMinutes).toBe(270);
    });
    it('the leave demo: joining and leaving dates drive the maths (exit settlement)', () => {
        const join = `${s.today.slice(0, 4)}-${s.today.slice(5, 7) >= '04' ? '04' : '01'}-10`;
        const exit = addDays(s.today, 30);
        const v = setEmployeeLife(M, sneha, { dateOfJoin: join, exitDate: exit });
        expect(v.dateOfJoin).toBe(join);
        expect(v.exit?.date).toBe(exit);
        expect(v.exit?.settlement.map(x => x.type)).toEqual(['ANNUAL', 'CASUAL', 'SICK']);
    });
});

describe('final batch: late check-in deductions', () => {
    it('a late check-in deducts from Annual first; a pending correction keeps it; approved → reversed', () => {
        const v = leaveViewOf(M, sneha);
        const late = v.lateDeductions.find(l => l.date === s.lateDay);
        if (!late) return; // the scripted late day may fall before this leave year
        expect(late.state).toBe('pending'); // its correction is waiting
        expect(late.from[0].type).toBe('ANNUAL');
        const c = correctionsOf(M, sneha).find(x => x.date === s.lateDay && x.trail.status.startsWith('PENDING'))!;
        decideRequest(M, 'attendance', c.id, { role: 'MANAGER', manager: arjun }, 'APPROVED');
        decideRequest(M, 'attendance', c.id, { role: 'PAYROLL' }, 'APPROVED');
        const after = leaveViewOf(M, sneha).lateDeductions.find(l => l.date === s.lateDay)!;
        expect(after.state).toBe('reversed');
        expect(leaveViewOf(M, sneha).balances.find(b => b.type === 'ANNUAL')!.ledger.some(e => e.kind === 'LATE_REVERSED')).toBe(true);
    });
    it('0 days per late check-in turns it off', () => {
        updateSettings(M, { lateDeductionDays: 0 });
        expect(leaveViewOf(M, sneha).lateDeductions).toEqual([]);
    });
});

describe('final batch: reimbursements go manager → Admin', () => {
    it('a pending claim waits for the manager, then Admin', () => {
        const pending = teamRequests(M, arjun, 'reimbursement', 'waiting').find(r => r.employee.id === sneha.id)!;
        expect(pending.trail.steps.map(x => x.role)).toEqual(['MANAGER', 'ADMIN']);
        const mid = decideRequest(M, 'reimbursement', pending.id, { role: 'MANAGER', manager: arjun }, 'APPROVED');
        expect(mid.trail.status).toBe('PENDING_ADMIN');
        expect(level2Requests(M, 'ADMIN', 'reimbursement', 'waiting').some(r => r.id === pending.id)).toBe(true);
        expect(level2Counts(M, 'ADMIN').reimbursement).toBeGreaterThanOrEqual(1);
        expect(decideRequest(M, 'reimbursement', pending.id, { role: 'ADMIN' }, 'APPROVED').trail.status).toBe('APPROVED');
    });
});
