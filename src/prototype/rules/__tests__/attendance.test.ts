// PROTOTYPE-SETUP: ESS Service 1 — unit tests for the Attendance & Timesheet rules.
import { describe, expect, it } from 'vitest';

import type { AttendanceDay, TimesheetEntry } from '@src/domains/attendanceTimesheet/types';

import {
    DEFAULT_SETTINGS,
    RuleError,
    canSubmitWeek,
    changeRequestBlockedReason,
    decide,
    deriveDay,
    diffEntries,
    diffSummary,
    dayWindow,
    editModeFor,
    effectiveCheckOut,
    formatDuration,
    isSubmissionDay,
    outsideCheckInFlag,
    overtimeMinutes,
    payrollBlockers,
    shouldSuggestOvertime,
    startTrail,
    tabsFor,
    titleFor,
    validateEntry,
    validateOvertimeInput,
    weekStartOf,
    weekdayOf,
    weeksDueForSubmission,
    weeksOverlappingMonth,
} from '../attendance';

const S = DEFAULT_SETTINGS;
const TODAY = '2026-10-07'; // Wednesday
const entry = (id: string, date: string, start: string, end: string, description = 'Work'): TimesheetEntry => ({
    id,
    date,
    start,
    end,
    description,
});
const day = (over: Partial<AttendanceDay>): AttendanceDay => ({
    date: '2026-10-05',
    status: 'present',
    checkIn: '09:30',
    checkOut: '18:30',
    checkOutAuto: false,
    minutesAtWork: 540,
    lateMinutes: 0,
    overtimeMinutes: 0,
    locked: false,
    ...over,
});

describe('dates', () => {
    it('weeks run Monday to Sunday', () => {
        expect(weekdayOf(TODAY)).toBe('WEDNESDAY');
        expect(weekStartOf(TODAY)).toBe('2026-10-05');
        expect(weekStartOf('2026-10-04')).toBe('2026-09-28');
    });
    it('lists every week overlapping a month', () => {
        expect(weeksOverlappingMonth('2026-09')).toEqual([
            '2026-08-31',
            '2026-09-07',
            '2026-09-14',
            '2026-09-21',
            '2026-09-28',
        ]);
    });
    it('formats durations', () => {
        expect(formatDuration(390)).toBe('6h 30m');
        expect(formatDuration(360)).toBe('6h');
        expect(formatDuration(45)).toBe('45m');
    });
});

describe('modes', () => {
    it('shows the right tabs and title', () => {
        expect(tabsFor('attendance')).toEqual(['attendance', 'overtime']);
        expect(tabsFor('both')).toEqual(['attendance', 'timesheet', 'overtime']);
        expect(tabsFor('timesheet')).toEqual(['timesheet', 'overtime']);
        expect(titleFor('both')).toBe('Attendance & Timesheet');
    });
});

describe('attendance status', () => {
    const base = { date: '2026-10-05', today: TODAY, settings: S };
    it('present within grace, late after it', () => {
        expect(deriveDay({ ...base, checkIn: '09:40', checkOut: '18:40' }).status).toBe('present');
        const late = deriveDay({ ...base, checkIn: '09:41', checkOut: '18:40' });
        expect(late.status).toBe('late');
        expect(late.lateMinutes).toBe(11);
    });
    it('half day when under the threshold', () => {
        expect(deriveDay({ ...base, checkIn: '09:30', checkOut: '13:00' }).status).toBe('half-day');
    });
    it('absent / not checked in / upcoming without a check-in', () => {
        expect(deriveDay({ ...base, checkIn: null, checkOut: null }).status).toBe('absent');
        expect(deriveDay({ ...base, date: TODAY, checkIn: null, checkOut: null }).status).toBe('not-checked-in');
        expect(deriveDay({ ...base, date: '2026-10-08', checkIn: null, checkOut: null }).status).toBe('upcoming');
    });
    it('leave, holiday, weekly off and worked on an off day', () => {
        expect(deriveDay({ ...base, checkIn: null, checkOut: null, leaveName: 'Casual Leave' }).status).toBe('on-leave');
        expect(deriveDay({ ...base, date: '2026-10-02', checkIn: null, checkOut: null, holidayName: 'Gandhi Jayanti' }).label).toBe('Gandhi Jayanti');
        expect(deriveDay({ ...base, date: '2026-10-03', checkIn: null, checkOut: null }).status).toBe('weekly-off');
        expect(deriveDay({ ...base, date: '2026-10-03', checkIn: '10:00', checkOut: '14:00' }).status).toBe('worked-off-day');
    });
    it('auto check-out at shift end for a past day only', () => {
        expect(effectiveCheckOut({ date: '2026-10-05', today: TODAY, checkIn: '09:35', checkOut: null, settings: S })).toEqual({ checkOut: '18:30', auto: true });
        expect(effectiveCheckOut({ date: TODAY, today: TODAY, checkIn: '09:35', checkOut: null, settings: S })).toEqual({ checkOut: null, auto: false });
        const d = deriveDay({ ...base, checkIn: '09:35', checkOut: null });
        expect(d.checkOutAuto).toBe(true);
        expect(d.minutesAtWork).toBe(535);
    });
    it('counts time on the clock today', () => {
        expect(deriveDay({ ...base, date: TODAY, nowMinutes: 12 * 60, checkIn: '09:30', checkOut: null }).minutesAtWork).toBe(150);
    });
});

describe('overtime', () => {
    it('attendance basis: time at work minus the shift (break included)', () => {
        expect(overtimeMinutes({ mode: 'both', settings: S, isOffDay: false, checkIn: '09:30', checkOut: '20:00', loggedMinutes: 0 })).toBe(90);
        // late arrival — still time beyond the standard day
        expect(overtimeMinutes({ mode: 'attendance', settings: S, isOffDay: false, checkIn: '11:00', checkOut: '20:00', loggedMinutes: 0 })).toBe(0);
    });
    it('timesheet basis: logged minus (shift − break)', () => {
        expect(overtimeMinutes({ mode: 'timesheet', settings: S, isOffDay: false, checkIn: null, checkOut: null, loggedMinutes: 9 * 60 })).toBe(60);
    });
    it('off days: all time counts', () => {
        expect(overtimeMinutes({ mode: 'both', settings: S, isOffDay: true, checkIn: '10:00', checkOut: '14:00', loggedMinutes: 0 })).toBe(240);
        expect(overtimeMinutes({ mode: 'timesheet', settings: S, isOffDay: true, checkIn: null, checkOut: null, loggedMinutes: 120 })).toBe(120);
    });
    it('suggests only past days over the minimum without a request', () => {
        const s = { date: '2026-10-05', today: TODAY, extraMinutes: 30, minimumMinutes: 30, hasRequest: false };
        expect(shouldSuggestOvertime(s)).toBe(true);
        expect(shouldSuggestOvertime({ ...s, extraMinutes: 29 })).toBe(false);
        expect(shouldSuggestOvertime({ ...s, date: TODAY })).toBe(false);
        expect(shouldSuggestOvertime({ ...s, hasRequest: true })).toBe(false);
    });
    it('worked is today or earlier; planned today or later with a description', () => {
        expect(() => validateOvertimeInput({ kind: 'worked', date: '2026-10-08', minutes: 60 }, TODAY)).toThrow(RuleError);
        expect(() => validateOvertimeInput({ kind: 'worked', date: TODAY, minutes: 60 }, TODAY)).not.toThrow();
        expect(() => validateOvertimeInput({ kind: 'planned', date: '2026-10-08', minutes: 60 }, TODAY)).toThrow(/Describe/);
        expect(() => validateOvertimeInput({ kind: 'planned', date: '2026-10-06', minutes: 60, description: 'x' }, TODAY)).toThrow(RuleError);
        expect(() => validateOvertimeInput({ kind: 'planned', date: TODAY, minutes: 60, description: 'Release' }, TODAY)).not.toThrow();
    });
});

describe('timesheet entries', () => {
    const existing = [entry('a', '2026-10-05', '09:30', '12:00')];
    it('requires end after start and a description', () => {
        expect(() => validateEntry({ date: '2026-10-05', start: '13:00', end: '12:00', description: 'x' }, [])).toThrow(/after the start/);
        expect(() => validateEntry({ date: '2026-10-05', start: '13:00', end: '14:00', description: ' ' }, [])).toThrow(/description/);
    });
    it('blocks overlaps but allows touching entries and editing itself', () => {
        expect(() => validateEntry({ date: '2026-10-05', start: '11:00', end: '13:00', description: 'x' }, existing)).toThrow(/Overlaps/);
        expect(() => validateEntry({ date: '2026-10-05', start: '12:00', end: '13:00', description: 'x' }, existing)).not.toThrow();
        expect(() => validateEntry({ id: 'a', date: '2026-10-05', start: '10:00', end: '12:30', description: 'x' }, existing)).not.toThrow();
    });
});

describe('day window', () => {
    it('timesheet mode uses the shift', () => {
        const w = dayWindow({ mode: 'timesheet', settings: S, day: day({}), today: TODAY });
        expect(w).toMatchObject({ kind: 'shift', start: '09:30', end: '18:30', expectedMinutes: 480 });
    });
    it('both mode uses check-in to check-out', () => {
        const w = dayWindow({ mode: 'both', settings: S, day: day({ checkIn: '09:42', checkOut: '19:12' }), today: TODAY });
        expect(w).toMatchObject({ kind: 'attendance', start: '09:42', end: '19:12', expectedMinutes: 510 });
        expect(w.label).toBe('Checked in 9:42 – out 19:12');
    });
    it('labels auto check-out', () => {
        const w = dayWindow({ mode: 'both', settings: S, day: day({ checkIn: '09:31', checkOutAuto: true }), today: TODAY });
        expect(w.label).toBe('Checked in 9:31 – auto check-out 18:30');
    });
});

describe('logged outside check-in hours (both mode)', () => {
    it('flags entries after a manual check-out as a correction, never overtime', () => {
        const f = outsideCheckInFlag({ mode: 'both', day: day({ checkOut: '18:00' }), entries: [entry('a', '2026-10-05', '09:30', '13:00'), entry('b', '2026-10-05', '17:00', '19:30')] });
        expect(f).toEqual({ entryIds: ['b'], action: 'request-correction', suggested: { checkIn: '09:30', checkOut: '19:30' } });
    });
    it('offers Update check-out on an auto check-out day', () => {
        const f = outsideCheckInFlag({ mode: 'both', day: day({ checkOutAuto: true }), entries: [entry('b', '2026-10-05', '18:00', '20:15')] });
        expect(f?.action).toBe('update-check-out');
        expect(f?.suggested.checkOut).toBe('20:15');
    });
    it('does nothing in timesheet mode or inside the window', () => {
        expect(outsideCheckInFlag({ mode: 'timesheet', day: day({ checkOut: '18:00' }), entries: [entry('b', '2026-10-05', '17:00', '19:30')] })).toBeUndefined();
        expect(outsideCheckInFlag({ mode: 'both', day: day({}), entries: [entry('b', '2026-10-05', '10:00', '18:30')] })).toBeUndefined();
    });
});

describe('weeks, change requests and locks', () => {
    it('edit modes', () => {
        expect(editModeFor({ approvalEnabled: true, status: 'APPROVED', allDaysLocked: false })).toBe('change-request');
        expect(editModeFor({ approvalEnabled: true, status: 'SUBMITTED', allDaysLocked: false })).toBe('direct');
        expect(editModeFor({ approvalEnabled: false, status: 'DRAFT', allDaysLocked: false })).toBe('direct');
        expect(editModeFor({ approvalEnabled: true, status: 'SENT_BACK', allDaysLocked: true })).toBe('locked');
    });
    it('submit only drafts and sent-back weeks, only with approval on', () => {
        expect(canSubmitWeek({ approvalEnabled: true, status: 'SENT_BACK', allDaysLocked: false })).toBe(true);
        expect(canSubmitWeek({ approvalEnabled: true, status: 'SUBMITTED', allDaysLocked: false })).toBe(false);
        expect(canSubmitWeek({ approvalEnabled: false, status: 'DRAFT', allDaysLocked: false })).toBe(false);
    });
    it('submission day sends every open week up to this one', () => {
        expect(isSubmissionDay('2026-10-09', S)).toBe(true);
        expect(isSubmissionDay(TODAY, S)).toBe(false);
        const weeks = [
            { weekStart: '2026-09-28', status: 'DRAFT' as const },
            { weekStart: '2026-10-05', status: 'DRAFT' as const },
            { weekStart: '2026-10-12', status: 'DRAFT' as const },
            { weekStart: '2026-09-21', status: 'SENT_BACK' as const },
        ];
        expect(weeksDueForSubmission(weeks, '2026-10-09').map(w => w.weekStart)).toEqual(['2026-09-28', '2026-10-05']);
    });
    it('describes the change and blocks one touching a processed month', () => {
        const base = [entry('a', '2026-09-30', '09:30', '18:30'), entry('b', '2026-10-01', '09:30', '18:30')];
        const proposed = [entry('a', '2026-09-30', '09:30', '17:30'), entry('c', '2026-10-02', '10:00', '11:00')];
        expect(diffSummary(diffEntries(base, proposed))).toBe('1 added · 1 edited · 1 removed');
        expect(changeRequestBlockedReason({ baseEntries: base, proposedEntries: proposed }, ['2026-09'])).toMatch(/September 2026/);
        expect(changeRequestBlockedReason({ baseEntries: base, proposedEntries: proposed }, [])).toBeNull();
    });
    it('payroll is blocked until every overlapping week is approved', () => {
        const employees = [{ id: 1, dateOfJoin: '2024-01-01' }, { id: 2, dateOfJoin: '2026-12-01' }];
        const blockers = payrollBlockers({
            month: '2026-09',
            approvalEnabled: true,
            employees,
            statusOf: (_id, ws) => (ws === '2026-09-21' ? 'SENT_BACK' : 'APPROVED'),
        });
        expect(blockers).toEqual([{ employee: employees[0], weekStart: '2026-09-21', status: 'SENT_BACK' }]);
        expect(payrollBlockers({ month: '2026-09', approvalEnabled: false, employees, statusOf: () => 'DRAFT' })).toEqual([]);
    });
});

describe('approval chain', () => {
    const manager = { id: 1001, name: 'Arjun Mehta' };
    it('manager then HR for attendance, then approved', () => {
        let t = startTrail('attendance', manager, S);
        expect(t.status).toBe('PENDING_MANAGER');
        t = decide(t, 'MANAGER', 'APPROVED', undefined, 'now');
        expect(t.status).toBe('PENDING_HR');
        t = decide(t, 'HR', 'APPROVED', undefined, 'now');
        expect(t.status).toBe('APPROVED');
    });
    it('overtime goes to Finance; rejection needs a comment and is final', () => {
        const t = startTrail('overtime', manager, S);
        expect(() => decide(t, 'MANAGER', 'REJECTED', '', 'now')).toThrow(/comment/);
        expect(decide(t, 'MANAGER', 'REJECTED', 'No', 'now').status).toBe('REJECTED');
        expect(decide(decide(t, 'MANAGER', 'APPROVED', undefined, 'now'), 'FINANCE', 'APPROVED', undefined, 'now').status).toBe('APPROVED');
    });
    it('the wrong role cannot decide', () => {
        expect(() => decide(startTrail('overtime', manager, S), 'FINANCE', 'APPROVED', undefined, 'now')).toThrow(RuleError);
    });
    it('the CEO skips straight to level 2; timesheets have no level 2', () => {
        expect(startTrail('overtime', null, S).status).toBe('PENDING_FINANCE');
        expect(startTrail('timesheet', null, S).status).toBe('APPROVED');
        expect(startTrail('timesheet', manager, S).steps).toHaveLength(1);
    });
});
