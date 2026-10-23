// PROTOTYPE-SETUP: ESS Service 1 — unit tests for the Attendance & Timesheet rules.
import { describe, expect, it } from 'vitest';

import type { AttendanceDay, PersonalDetails, TimesheetEntry } from '@src/domains/attendanceTimesheet/types';

import {
    DEFAULT_SETTINGS,
    RuleError,
    decide,
    deriveDay,
    diffEntries,
    diffSummary,
    dayWindow,
    ENTRY_MESSAGES,
    editModeFor,
    breakMinutesOf,
    displayTime,
    displayTimeOn,
    entryMins,
    entryTimeText,
    shortTime,
    validateBreaks,
    workedMinutes,
    entriesOverlap,
    expectedMinutes,
    formatDuration,
    hasCheckIn,
    hasTimesheets,
    hasTracking,
    outsideCheckInFlag,
    overtimeMinutes,
    PROFILE_MESSAGES,
    profileChanges,
    profileChangeSummary,
    applyProfileChanges,
    validatePersonalDetails,
    parseHours,
    payrollBlockers,
    qualifyingOvertime,
    shouldSuggestOvertime,
    sortEntries,
    startTrail,
    tabsFor,
    titleFor,
    toMinutes,
    validateEntry,
    validateOvertimeInput,
    weekStartOf,
    weekdayOf,
    weeksOverlappingMonth,
    addLocationStamp,
    dayLocations,
    locationDetailText,
    locationTrailText,
    workingFromText,
} from '../attendance';

const S = DEFAULT_SETTINGS;
const TODAY = '2026-10-07'; // Wednesday
const entry = (id: string, date: string, start: string, end: string, description = 'Work'): TimesheetEntry => ({
    id,
    date,
    start,
    end,
    mins: toMinutes(end) - toMinutes(start),
    description,
});
/** PROTOTYPE-SETUP (V2): an hours-only entry. */
const hoursOnly = (id: string, date: string, mins: number, description = 'Work'): TimesheetEntry => ({
    id,
    date,
    start: null,
    end: null,
    mins,
    description,
});
const day = (over: Partial<AttendanceDay>): AttendanceDay => {
    const d: AttendanceDay = {
        date: '2026-10-05',
        status: 'present',
        checkIn: '09:30',
        checkOut: '18:30',
        outDays: 0,
        open: false,
        carried: false,
        minutesAtWork: 0,
        breaks: [],
        breakMinutes: 0,
        onBreak: false,
        lateMinutes: 0,
        overtimeMinutes: 0,
        locked: false,
        ...over,
    };
    // hours worked follow the times unless given
    if (over.minutesAtWork === undefined) d.minutesAtWork = workedMinutes({ checkIn: d.checkIn, checkOut: d.checkOut, outDays: d.outDays });
    return d;
};

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
    // PROTOTYPE-SETUP (HR rules, Slice 5): 12-hour times everywhere.
    it('shows 12-hour times', () => {
        expect(displayTime('09:30')).toBe('9:30 AM');
        expect(displayTime('00:05')).toBe('12:05 AM');
        expect(displayTime('12:00')).toBe('12:00 PM');
        expect(displayTime('18:41')).toBe('6:41 PM');
        expect(shortTime('09:30')).toBe('9:30a');
        expect(shortTime('18:41')).toBe('6:41p');
        expect(displayTimeOn('05:00', 1)).toBe('5:00 AM (next day)');
        expect(displayTimeOn('09:10', 3)).toBe('9:10 AM (3 days later)');
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
    // PROTOTYPE-SETUP (HR rules, Slice 1): no automatic check-out — an earlier day stays open.
    it('no automatic check-out: an earlier day without a check-out stays open (still checked in)', () => {
        const d = deriveDay({ ...base, checkIn: '09:35', checkOut: null, nowMinutes: 10 * 60 });
        expect(d).toMatchObject({ checkOut: null, open: true, carried: true, status: 'present' });
        // so far: two days (Mon → Wed 10:00) — never a half day while open
        expect(d.minutesAtWork).toBe(2 * 24 * 60 + 25);
        expect(deriveDay({ ...base, checkIn: '15:00', checkOut: null }).status).toBe('late');
    });
    it('overnight: hours count to the check-in day (check-out + outDays × 24h − check-in)', () => {
        const d = deriveDay({ ...base, checkIn: '09:00', checkOut: '05:00', outDays: 1 });
        expect(d).toMatchObject({ outDays: 1, open: false, minutesAtWork: 20 * 60, status: 'present' });
        expect(workedMinutes({ checkIn: '09:30', checkOut: '10:00', outDays: 3 })).toBe(3 * 24 * 60 + 30); // Friday closed on Monday
    });
    it('breaks: hours worked include them; a running break counts until now (today only)', () => {
        const breaks = [{ start: '13:00', end: '14:00' }, { start: '16:00', end: null }];
        expect(breakMinutesOf(breaks)).toBe(60);
        expect(breakMinutesOf(breaks, 16 * 60 + 20)).toBe(80);
        const d = deriveDay({ ...base, date: TODAY, nowMinutes: 16 * 60 + 20, checkIn: '09:30', checkOut: null, breaks });
        expect(d).toMatchObject({ onBreak: true, breakMinutes: 80, minutesAtWork: 6 * 60 + 50 });
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
    it('timesheet basis: logged minus the shift length (no break deduction)', () => {
        expect(overtimeMinutes({ mode: 'timesheet', settings: S, isOffDay: false, checkIn: null, checkOut: null, loggedMinutes: 9 * 60 })).toBe(0);
        expect(overtimeMinutes({ mode: 'timesheet', settings: S, isOffDay: false, checkIn: null, checkOut: null, loggedMinutes: 10 * 60 })).toBe(60);
    });
    it('nothing while still checked in; overnight hours count to the check-in day', () => {
        expect(overtimeMinutes({ mode: 'both', settings: S, isOffDay: false, checkIn: '09:30', checkOut: null, loggedMinutes: 0 })).toBe(0);
        expect(overtimeMinutes({ mode: 'both', settings: S, isOffDay: false, checkIn: '09:00', checkOut: '05:00', outDays: 1, loggedMinutes: 0 })).toBe(11 * 60);
        expect(overtimeMinutes({ mode: 'attendance', settings: S, isOffDay: true, checkIn: '20:00', checkOut: '02:00', outDays: 1, loggedMinutes: 0 })).toBe(6 * 60);
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
        // PROTOTYPE-SETUP (HR rules, Slice 1): not while still checked in, nor while a correction is pending
        expect(shouldSuggestOvertime({ ...s, open: true })).toBe(false);
        expect(shouldSuggestOvertime({ ...s, pendingCorrection: true })).toBe(false);
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
    it('an end earlier than the start is the next morning; a description is required', () => {
        expect(validateEntry({ date: '2026-10-05', start: '22:00', end: '01:00', description: 'x' }, [])).toMatchObject({ start: '22:00', end: '01:00', endNext: true, mins: 180 });
        expect(() => validateEntry({ date: '2026-10-05', start: '13:00', end: '14:00', description: ' ' }, [])).toThrow(/Describe what you worked on/);
    });
    // PROTOTYPE-SETUP (Timesheet filing): overlapping task entries are saved (the employee is warned — findOverlaps).
    it('allows overlapping, touching and self-editing entries', () => {
        expect(() => validateEntry({ date: '2026-10-05', start: '11:00', end: '13:00', description: 'x' }, existing)).not.toThrow();
        expect(() => validateEntry({ date: '2026-10-05', start: '12:00', end: '13:00', description: 'x' }, existing)).not.toThrow();
        expect(() => validateEntry({ id: 'a', date: '2026-10-05', start: '10:00', end: '12:30', description: 'x' }, existing)).not.toThrow();
    });
});

describe('day window', () => {
    it('timesheet mode uses the shift (the target is the shift length)', () => {
        const w = dayWindow({ mode: 'timesheet', settings: S, day: day({}), today: TODAY });
        expect(w).toMatchObject({ kind: 'shift', start: '09:30', end: '18:30', startMinutes: 570, endMinutes: 1110, expectedMinutes: 540 });
    });
    it('both mode uses check-in to check-out, breaks included', () => {
        const w = dayWindow({ mode: 'both', settings: S, day: day({ checkIn: '09:42', checkOut: '19:12' }), today: TODAY });
        expect(w).toMatchObject({ kind: 'attendance', start: '09:42', end: '19:12', expectedMinutes: 570 });
        expect(w.label).toBe('Checked in 9:42 AM, out 7:12 PM');
    });
    it('an overnight day runs past midnight', () => {
        const w = dayWindow({ mode: 'both', settings: S, day: day({ checkIn: '09:00', checkOut: '05:00', outDays: 1 }), today: TODAY });
        expect(w).toMatchObject({ startMinutes: 540, endMinutes: 1740, expectedMinutes: 1200, label: 'Checked in 9:00 AM, out 5:00 AM (next day)' });
    });
    it('still checked in: the window runs until now', () => {
        const w = dayWindow({ mode: 'both', settings: S, day: day({ date: TODAY, checkIn: '09:40', checkOut: null, open: true, minutesAtWork: 100 }), today: TODAY });
        expect(w).toMatchObject({ open: true, endMinutes: 680, expectedMinutes: 100, label: 'Checked in 9:40 AM, still checked in' });
    });
});

describe('logged outside check-in hours (both mode)', () => {
    it('flags entries after the check-out as a correction, never overtime', () => {
        const f = outsideCheckInFlag({ mode: 'both', day: day({ checkOut: '18:00' }), entries: [entry('a', '2026-10-05', '09:30', '13:00'), entry('b', '2026-10-05', '17:00', '19:30')] });
        expect(f).toEqual({ entryIds: ['b'], action: 'request-correction', suggested: { checkIn: '09:30', checkOut: '19:30', outDays: 0 } });
    });
    it('entries after midnight suggest a next-day check-out', () => {
        const late = { ...entry('n', '2026-10-05', '22:00', '01:00'), endNext: true, mins: 180 };
        const f = outsideCheckInFlag({ mode: 'both', day: day({ checkOut: '23:00' }), entries: [late] });
        expect(f?.suggested).toEqual({ checkIn: '09:30', checkOut: '01:00', outDays: 1 });
        // inside an overnight session: nothing to flag
        expect(outsideCheckInFlag({ mode: 'both', day: day({ checkIn: '09:00', checkOut: '05:00', outDays: 1 }), entries: [late] })).toBeUndefined();
    });
    it('nothing while still checked in, in timesheet mode or inside the window', () => {
        expect(outsideCheckInFlag({ mode: 'both', day: day({ checkOut: null, open: true }), entries: [entry('b', '2026-10-05', '17:00', '23:30')] })).toBeUndefined();
        expect(outsideCheckInFlag({ mode: 'timesheet', day: day({ checkOut: '18:00' }), entries: [entry('b', '2026-10-05', '17:00', '19:30')] })).toBeUndefined();
        expect(outsideCheckInFlag({ mode: 'both', day: day({}), entries: [entry('b', '2026-10-05', '10:00', '18:30')] })).toBeUndefined();
    });
});

// PROTOTYPE-SETUP (HR rules, Slice 1): breaks edited by the employee (today only).
describe('breaks', () => {
    const session = { checkIn: '09:00', checkOut: '18:00', nowMinutes: 18 * 60 };
    it('sorted, trimmed, within check-in → check-out, no overlaps', () => {
        expect(validateBreaks([{ start: '15:00', end: '15:15' }, { start: '13:00', end: '14:00', description: ' Lunch ' }], session)).toEqual([
            { start: '13:00', end: '14:00', description: 'Lunch' },
            { start: '15:00', end: '15:15' },
        ]);
        expect(() => validateBreaks([{ start: '13:00', end: '14:00' }, { start: '13:59', end: '14:30' }], session)).toThrow(/overlap/);
        expect(() => validateBreaks([{ start: '08:30', end: '09:30' }], session)).toThrow(/between your check-in/);
        expect(() => validateBreaks([{ start: '17:30', end: '18:30' }], session)).toThrow(/between your check-in/);
        expect(() => validateBreaks([{ start: '14:00', end: '13:00' }], session)).toThrow(/end after it starts/);
        expect(() => validateBreaks([{ start: '1pm', end: '2pm' }], session)).toThrow(/HH:mm/);
    });
    it('a running break only as the last one, while still checked in (until now)', () => {
        const open = { checkIn: '09:00', checkOut: null, nowMinutes: 16 * 60 };
        expect(validateBreaks([{ start: '13:00', end: '14:00' }, { start: '15:30', end: null }], open)).toHaveLength(2);
        expect(() => validateBreaks([{ start: '15:30', end: null }, { start: '15:45', end: '15:50' }], open)).toThrow(/still be running/);
        expect(() => validateBreaks([{ start: '15:30', end: null }], session)).toThrow(/still be running/);
        expect(() => validateBreaks([{ start: '15:30', end: '16:30' }], open)).toThrow(/between your check-in/);
    });
});

describe('periods and locks', () => {
    // PROTOTYPE-SETUP (Final batch, Slice 1): no change requests — every status edits directly until payroll.
    it('edit modes', () => {
        expect(editModeFor({ approvalEnabled: true, status: 'APPROVED', allDaysLocked: false })).toBe('direct');
        expect(editModeFor({ approvalEnabled: true, status: 'WITH_PAYROLL', allDaysLocked: false })).toBe('direct');
        expect(editModeFor({ approvalEnabled: false, status: 'DRAFT', allDaysLocked: false })).toBe('direct');
        expect(editModeFor({ approvalEnabled: true, status: 'SENT_BACK', allDaysLocked: true })).toBe('locked');
    });
    it('describes a change against the baseline', () => {
        const base = [entry('a', '2026-09-30', '09:30', '18:30'), entry('b', '2026-10-01', '09:30', '18:30')];
        const proposed = [entry('a', '2026-09-30', '09:30', '17:30'), entry('c', '2026-10-02', '10:00', '11:00')];
        expect(diffSummary(diffEntries(base, proposed))).toBe('1 added · 1 edited · 1 removed');
    });
    it('payroll is blocked until every overlapping week is approved', () => {
        const employees = [{ id: 1, dateOfJoin: '2024-01-01' }, { id: 2, dateOfJoin: '2026-12-01' }];
        const blockers = payrollBlockers({
            month: '2026-09',
            approvalEnabled: true,
            employees,
            statusOf: (_id, ws) => (ws === '2026-09-21' ? 'SENT_BACK' : 'APPROVED'),
        });
        expect(blockers).toEqual([{ employee: employees[0], weekStart: '2026-09-21', periodEnd: '2026-09-27', status: 'SENT_BACK' }]);
        // PROTOTYPE-SETUP (Timesheet filing): any frequency — the employee's periods overlapping the month.
        const monthly = payrollBlockers({
            month: '2026-09',
            approvalEnabled: true,
            employees,
            statusOf: () => 'APPROVED',
            periodsOf: () => [{ weekStart: '2026-09-01', periodEnd: '2026-09-30', status: 'SUBMITTED' }],
        });
        expect(monthly).toEqual([{ employee: employees[0], weekStart: '2026-09-01', periodEnd: '2026-09-30', status: 'SUBMITTED' }]);
        expect(payrollBlockers({ month: '2026-09', approvalEnabled: false, employees, statusOf: () => 'DRAFT' })).toEqual([]);
    });
});

describe('approval chain', () => {
    const manager = { id: 1001, name: 'Arjun Mehta' };
    // PROTOTYPE-SETUP (HR rules, Slice 1): level 2 for attendance and overtime is the Payroll queue.
    it('manager then Payroll for attendance, then approved', () => {
        let t = startTrail('attendance', manager, S);
        expect(t.status).toBe('PENDING_MANAGER');
        expect(t.steps.map(x => x.role)).toEqual(['MANAGER', 'PAYROLL']);
        t = decide(t, 'MANAGER', 'APPROVED', undefined, 'now');
        expect(t.status).toBe('PENDING_PAYROLL');
        t = decide(t, 'PAYROLL', 'APPROVED', undefined, 'now');
        expect(t.status).toBe('APPROVED');
    });
    it('overtime goes to Payroll; rejection needs a comment and is final', () => {
        const t = startTrail('overtime', manager, S);
        expect(() => decide(t, 'MANAGER', 'REJECTED', '', 'now')).toThrow(/comment/);
        expect(decide(t, 'MANAGER', 'REJECTED', 'No', 'now').status).toBe('REJECTED');
        expect(decide(decide(t, 'MANAGER', 'APPROVED', undefined, 'now'), 'PAYROLL', 'APPROVED', undefined, 'now').status).toBe('APPROVED');
    });
    // PROTOTYPE-SETUP (Final batch, Slice 1): leave → HR; reimbursements → Admin; timesheets → Payroll.
    it('the wrong role cannot decide; leave → HR, reimbursements → Admin', () => {
        expect(() => decide(startTrail('overtime', manager, S), 'PAYROLL', 'APPROVED', undefined, 'now')).toThrow(RuleError);
        expect(() => decide(decide(startTrail('overtime', manager, S), 'MANAGER', 'APPROVED', undefined, 'now'), 'FINANCE', 'APPROVED', undefined, 'now')).toThrow(RuleError);
        expect(startTrail('leave', manager, S).steps[1].role).toBe('HR');
        expect(startTrail('reimbursement', manager, S).steps[1].role).toBe('ADMIN');
        expect(startTrail('reimbursement', manager, S).status).toBe('PENDING_MANAGER');
        expect(decide(startTrail('reimbursement', manager, S), 'MANAGER', 'APPROVED', undefined, 'now').status).toBe('PENDING_ADMIN');
    });
    it('the CEO skips straight to level 2; timesheets go to Payroll at level 2', () => {
        expect(startTrail('overtime', null, S).status).toBe('PENDING_PAYROLL');
        expect(startTrail('timesheet', null, S).status).toBe('PENDING_PAYROLL');
        expect(startTrail('timesheet', manager, S).steps.map(x => x.role)).toEqual(['MANAGER', 'PAYROLL']);
    });
});

// ---- PROTOTYPE-SETUP (V2): hours-only entries, the entry form's rules and expected hours -----------------

describe('entry minutes and sorting', () => {
    it('uses the times when present, otherwise the minutes entered', () => {
        expect(entryMins(entry('a', '2026-10-05', '09:30', '11:00'))).toBe(90);
        expect(entryMins(hoursOnly('h', '2026-10-05', 60))).toBe(60);
        expect(entryMins({ start: '09:00', end: '10:00', mins: 999 })).toBe(60);
    });
    it('sorts timed entries by start (next-day starts last), then hours-only entries', () => {
        const night = { ...entry('n', '2026-10-05', '02:00', '05:00'), startNext: true, endNext: true };
        const list = [hoursOnly('h1', '2026-10-05', 30), night, entry('b', '2026-10-05', '14:00', '15:00'), hoursOnly('h2', '2026-10-05', 15), entry('a', '2026-10-05', '09:00', '10:00'), entry('z', '2026-10-04', '16:00', '17:00')];
        expect(sortEntries(list).map(e => e.id)).toEqual(['z', 'a', 'b', 'n', 'h1', 'h2']);
    });
    // PROTOTYPE-SETUP (HR rules, Slice 1): entries can cross midnight.
    it('next-day entries: minutes and overlap across midnight', () => {
        const cross = { ...entry('c', '2026-10-05', '22:00', '02:00'), endNext: true };
        const night = { ...entry('n', '2026-10-05', '01:00', '03:00'), startNext: true, endNext: true };
        expect(entryMins(cross)).toBe(240);
        expect(entryMins(night)).toBe(120);
        expect(entriesOverlap(cross, night)).toBe(true);
        expect(entriesOverlap(cross, entry('e', '2026-10-05', '09:00', '10:00'))).toBe(false);
        expect(entryTimeText(cross)).toBe('10:00 PM – 2:00 AM (next day)');
    });
    it('hours-only entries never overlap', () => {
        expect(entriesOverlap(hoursOnly('h', '2026-10-05', 600), entry('a', '2026-10-05', '09:00', '10:00'))).toBe(false);
    });
});

describe('parseHours', () => {
    it('reads 1:30, 1.5, 1,5, 1h 30m, 1h, 90m and 2', () => {
        expect(parseHours('1:30')).toBe(90);
        expect(parseHours('1.5')).toBe(90);
        expect(parseHours('1,5')).toBe(90);
        expect(parseHours('1h 30m')).toBe(90);
        expect(parseHours('1h30m')).toBe(90);
        expect(parseHours('1h')).toBe(60);
        expect(parseHours('90m')).toBe(90);
        expect(parseHours('2')).toBe(120);
        expect(parseHours('0:45')).toBe(45);
    });
    it('returns null when it can’t read the value', () => {
        expect(parseHours('abc')).toBeNull();
        expect(parseHours('1:75')).toBeNull();
        expect(parseHours('')).toBeNull();
    });
});

describe('validateEntry (entry form)', () => {
    const D = '2026-10-05';
    const ok = (input: Parameters<typeof validateEntry>[0], others: TimesheetEntry[] = []) => validateEntry(input, others);
    const msg = (input: Parameters<typeof validateEntry>[0], others: TimesheetEntry[] = []) => {
        try {
            validateEntry(input, others);
            return 'no error';
        } catch (e) {
            return (e as Error).message;
        }
    };
    it('start + end → minutes calculated', () => {
        expect(ok({ date: D, start: '09:00', end: '10:30', description: 'x' })).toMatchObject({ start: '09:00', end: '10:30', mins: 90 });
    });
    it('start + hours → end calculated', () => {
        expect(ok({ date: D, start: '14:00', hoursText: '1h 30m', description: 'x' })).toMatchObject({ start: '14:00', end: '15:30', mins: 90 });
    });
    it('hours only → saved as hours-only', () => {
        expect(ok({ date: D, hoursText: '1.5', description: 'x' })).toMatchObject({ start: null, end: null, mins: 90 });
        expect(ok({ date: D, mins: 60, description: 'x' })).toMatchObject({ start: null, end: null, mins: 60 });
    });
    it('start + end wins over the hours field', () => {
        expect(ok({ date: D, start: '09:00', end: '10:00', hoursText: 'abc', description: 'x' })).toMatchObject({ mins: 60 });
    });
    it('rejects each invalid combination with its message', () => {
        expect(msg({ date: D, start: '12:00', end: '12:00', description: 'x' })).toBe(ENTRY_MESSAGES.sameStartEnd);
        expect(msg({ date: D, end: '12:00', description: 'x' })).toBe(ENTRY_MESSAGES.endWithoutStart);
        expect(msg({ date: D, start: '12:00', description: 'x' })).toBe(ENTRY_MESSAGES.startWithoutEnd);
        expect(msg({ date: D, hoursText: 'abc', description: 'x' })).toBe(ENTRY_MESSAGES.unreadableHours);
        expect(msg({ date: D, hoursText: '0', description: 'x' })).toBe(ENTRY_MESSAGES.zeroHours);
        expect(msg({ date: D, hoursText: '25', description: 'x' })).toBe(ENTRY_MESSAGES.over24);
        expect(msg({ date: D, hoursText: '1', description: ' ' })).toBe(ENTRY_MESSAGES.description);
        expect(msg({ date: D, description: 'x' })).toBe(ENTRY_MESSAGES.missing);
        // PROTOTYPE-SETUP (HR rules, Slice 1): no more "split it across two days" — start + hours wraps past midnight
        expect(ok({ date: D, start: '23:00', hoursText: '2', description: 'x' })).toMatchObject({ start: '23:00', end: '01:00', endNext: true, mins: 120 });
        expect(ok({ date: D, start: '01:00', startNext: true, end: '03:00', description: 'x' })).toMatchObject({ startNext: true, endNext: true, mins: 120 });
        expect(msg({ date: D, start: '20:00', startNext: true, hoursText: '6', description: 'x' })).toBe(ENTRY_MESSAGES.pastNextDay);
    });
    it('rejects a day over 24h (hours-only entries count)', () => {
        expect(msg({ date: D, hoursText: '5', description: 'x' }, [hoursOnly('h', D, 20 * 60)])).toBe(ENTRY_MESSAGES.dayOver24);
        expect(msg({ date: D, hoursText: '4', description: 'x' }, [hoursOnly('h', D, 20 * 60)])).toBe('no error');
    });
    it('overlapping a task entry is allowed; overlapping a recorded break is not', () => {
        const others = [entry('a', D, '09:00', '12:00'), hoursOnly('h', D, 120)];
        expect(msg({ date: D, start: '11:00', end: '13:00', description: 'x' }, others)).toBe('no error');
        const lunch = { ...entry('break:0', D, '13:00', '14:00', 'Lunch') };
        expect(msg({ date: D, start: '13:30', end: '15:00', description: 'x' }, [lunch])).toBe('Overlaps with 1:00 PM – 2:00 PM (break).');
        expect(msg({ date: D, hoursText: '2', description: 'x' }, others)).toBe('no error');
        expect(msg({ id: 'a', date: D, start: '10:00', end: '12:30', description: 'x' }, others)).toBe('no error');
    });
});

describe('hours-only entries in the other rules', () => {
    it('are never outside check-in hours', () => {
        const f = outsideCheckInFlag({ mode: 'both', day: day({ checkOut: '18:00' }), entries: [hoursOnly('h', '2026-10-05', 600)] });
        expect(f).toBeUndefined();
    });
    it('still prompt a correction on a past day with no check-in', () => {
        const f = outsideCheckInFlag({ mode: 'both', day: day({ status: 'absent', checkIn: null, checkOut: null }), entries: [hoursOnly('h', '2026-10-05', 60)] });
        expect(f).toEqual({ entryIds: ['h'], action: 'request-correction', suggested: { checkIn: null, checkOut: null, outDays: 0 } });
    });
    it('count toward timesheet-only overtime', () => {
        const logged = entryMins(entry('a', '2026-10-05', '09:30', '17:30')) + entryMins(hoursOnly('h', '2026-10-05', 90));
        expect(overtimeMinutes({ mode: 'timesheet', settings: S, isOffDay: false, checkIn: null, checkOut: null, loggedMinutes: logged })).toBe(30);
    });
    it('the change diff compares minutes too', () => {
        const before = hoursOnly('h', '2026-10-05', 60);
        expect(diffSummary(diffEntries([before], [{ ...before, mins: 90 }]))).toBe('1 edited');
        expect(diffSummary(diffEntries([before], [before]))).toBe('no changes');
    });
});

// PROTOTYPE-SETUP (HR rules, Slice 1): the timesheet target = every checked-in hour, breaks included.
describe('expected hours (the timesheet target)', () => {
    const exp = (over: Partial<AttendanceDay>, mode: 'both' | 'timesheet' | 'attendance' = 'both', dateOfJoin?: string) =>
        expectedMinutes({ mode, settings: S, day: day(over), today: TODAY, dateOfJoin });
    it('checked in and out: hours worked, breaks included (was: minus the break)', () => {
        expect(exp({ checkIn: '09:30', checkOut: '19:00' })).toBe(570);
        expect(exp({ status: 'half-day', checkIn: '14:00', checkOut: '18:30' })).toBe(270);
        expect(exp({ checkIn: '18:40', checkOut: '19:10' })).toBe(30); // was 0 (window shorter than the break)
    });
    it('overnight: until the next-day check-out', () => {
        expect(exp({ checkIn: '09:00', checkOut: '05:00', outDays: 1 })).toBe(20 * 60);
    });
    it('timesheet-only: the shift length, no break deduction (was shift − break); off days 0', () => {
        expect(exp({}, 'timesheet')).toBe(540);
        expect(exp({ status: 'weekly-off', checkIn: null, checkOut: null }, 'timesheet')).toBe(0);
        expect(exp({}, 'timesheet', '2026-10-06')).toBe(0);
    });
    it('still checked in: today so far; an earlier day 0 until checked out', () => {
        expect(exp({ date: TODAY, checkIn: '09:00', checkOut: null, open: true, minutesAtWork: 125 })).toBe(125);
        expect(exp({ checkIn: '09:00', checkOut: null, open: true, carried: true, minutesAtWork: 3000 })).toBe(0);
    });
    it('no check-in: 0 whatever the day (was shift − break today and later)', () => {
        expect(exp({ status: 'absent', checkIn: null, checkOut: null })).toBe(0);
        expect(exp({ date: TODAY, status: 'not-checked-in', checkIn: null, checkOut: null })).toBe(0);
        expect(exp({ date: '2026-10-08', status: 'upcoming', checkIn: null, checkOut: null })).toBe(0);
    });
    it('leave, weekly off, holiday: 0; worked on an off day: the hours worked (was 0)', () => {
        expect(exp({ status: 'on-leave', checkIn: null, checkOut: null })).toBe(0);
        expect(exp({ status: 'weekly-off', checkIn: null, checkOut: null })).toBe(0);
        expect(exp({ status: 'holiday', checkIn: null, checkOut: null })).toBe(0);
        expect(exp({ status: 'worked-off-day', checkIn: '10:00', checkOut: '14:00' })).toBe(240);
        expect(exp({ status: 'present', label: 'Casual Leave', checkIn: '10:00', checkOut: '15:00' })).toBe(300);
    });
    it('attendance-only mode, before joining: 0', () => {
        expect(exp({}, 'attendance')).toBe(0);
        expect(exp({}, 'both', '2026-10-06')).toBe(0);
    });
    it('dayWindow uses the same number', () => {
        expect(dayWindow({ mode: 'both', settings: S, day: day({ status: 'absent', checkIn: null, checkOut: null }), today: TODAY }).expectedMinutes).toBe(0);
        expect(dayWindow({ mode: 'both', settings: S, day: day({ checkIn: '09:42', checkOut: '19:12' }), today: TODAY }).expectedMinutes).toBe(570);
    });
});

// PROTOTYPE-SETUP (Overview, Slice 1): profile updates go straight to HR and hold only the changed fields.
describe('profile updates', () => {
    const current: PersonalDetails = {
        mobile: '+91 98450 23817',
        personalEmail: 'sneha.iyer96@gmail.com',
        address: '32, 3rd Cross, Indiranagar',
        emergencyName: 'Ramesh Iyer',
        emergencyRelation: 'Father',
        emergencyPhone: '+91 97410 00000',
        photo: null,
    };
    it('skip the manager: HR is the only step', () => {
        const t = startTrail('profile', { id: 1001, name: 'Arjun Mehta' }, S);
        expect(t).toMatchObject({ type: 'profile', status: 'PENDING_HR' });
        expect(t.steps).toEqual([{ level: 2, role: 'HR' }]);
        expect(decide(t, 'HR', 'APPROVED', undefined, 'now').status).toBe('APPROVED');
        expect(() => decide(t, 'MANAGER', 'APPROVED', undefined, 'now')).toThrow(RuleError);
    });
    it('hold only the changed fields, old → new (photo included)', () => {
        const changes = profileChanges(current, { mobile: '+91 98450 11111', personalEmail: current.personalEmail, photo: 'data:image/png;base64,AAAA' });
        expect(changes).toEqual([
            { field: 'mobile', label: 'Mobile number', from: '+91 98450 23817', to: '+91 98450 11111' },
            { field: 'photo', label: 'Photo', from: null, to: 'data:image/png;base64,AAAA' },
        ]);
        expect(profileChangeSummary(changes)).toBe('Mobile number: +91 98450 23817 → +91 98450 11111; New photo');
        expect(applyProfileChanges(current, changes)).toMatchObject({ mobile: '+91 98450 11111', photo: 'data:image/png;base64,AAAA' });
        expect(profileChanges(current, { mobile: ' +91 98450 23817 ' })).toEqual([]);
    });
    it('validate mobile, personal email, emergency contact and photo size', () => {
        const err = (over: Partial<PersonalDetails>) => {
            try {
                validatePersonalDetails({ ...current, ...over });
                return 'ok';
            } catch (e) {
                return (e as Error).message;
            }
        };
        expect(err({})).toBe('ok');
        expect(err({ mobile: '98450' })).toBe(PROFILE_MESSAGES.mobile);
        expect(err({ personalEmail: 'sneha@' })).toBe(PROFILE_MESSAGES.personalEmail);
        expect(err({ emergencyName: ' ' })).toBe(PROFILE_MESSAGES.emergency);
        expect(err({ emergencyPhone: '12345' })).toBe(PROFILE_MESSAGES.emergency);
        expect(err({ photo: `data:image/png;base64,${'A'.repeat(1_500_000)}` })).toBe(PROFILE_MESSAGES.photo);
    });
});

// PROTOTYPE-SETUP (Overview v4, Slice 5): the 'none' mode rules.
describe("'none' mode rules", () => {
    it('tracks nothing: no tabs, no check-in, no timesheets, no overtime, nothing expected', () => {
        expect(tabsFor('none')).toEqual([]);
        expect([hasCheckIn('none'), hasTimesheets('none'), hasTracking('none')]).toEqual([false, false, false]);
        expect([hasCheckIn('both'), hasTimesheets('both'), hasTracking('both')]).toEqual([true, true, true]);
        expect(overtimeMinutes({ mode: 'none', settings: S, isOffDay: true, checkIn: '09:00', checkOut: '20:00', loggedMinutes: 600 })).toBe(0);
        expect(expectedMinutes({ mode: 'none', settings: S, day: day({}), today: TODAY })).toBe(0);
    });
});

// PROTOTYPE-SETUP (Attendance tab, Slice 3): overtime shows only once it reaches the HR minimum (default 30 min).
describe('overtime at the HR minimum', () => {
    const extra = (checkOut: string) =>
        overtimeMinutes({ mode: 'both', settings: S, isOffDay: false, checkIn: '09:30', checkOut, loggedMinutes: 0 });
    it('a 9h 4m day shows no overtime; a 9h 40m day shows 40m', () => {
        expect(S.overtimeMinimumMinutes).toBe(30);
        expect(extra('18:34')).toBe(4);
        expect(qualifyingOvertime(extra('18:34'), S.overtimeMinimumMinutes)).toBe(0);
        expect(qualifyingOvertime(extra('19:10'), S.overtimeMinimumMinutes)).toBe(40);
    });
    it('exactly the minimum counts; no minimum counts everything above 0', () => {
        expect(qualifyingOvertime(30, 30)).toBe(30);
        expect(qualifyingOvertime(29, 30)).toBe(0);
        expect(qualifyingOvertime(4, 0)).toBe(4);
        expect(qualifyingOvertime(0, 0)).toBe(0);
    });
});

// PROTOTYPE-SETUP (Final batch, Slice 2): where they work from (Attendance only mode).
describe('working from (location timeline)', () => {
    it('adds a stamp only when the place changes; the default is Office from check-in', () => {
        expect(dayLocations(undefined, '09:30')).toEqual([{ at: '09:30', location: 'OFFICE' }]);
        expect(dayLocations(undefined, null)).toEqual([]);
        let trail = dayLocations([], '09:30');
        trail = addLocationStamp(trail, { at: '11:00', location: 'OFFICE' });
        expect(trail).toHaveLength(1);
        trail = addLocationStamp(trail, { at: '14:00', location: 'CLIENT', client: 'Brightline' });
        trail = addLocationStamp(trail, { at: '15:00', location: 'CLIENT', client: 'Brightline' });
        expect(trail).toHaveLength(2);
        trail = addLocationStamp(trail, { at: '16:00', location: 'CLIENT', client: 'Zenith' });
        expect(trail).toHaveLength(3);
    });

    it('reads as the prototype words it', () => {
        const trail = [
            { at: '09:30', location: 'OFFICE' as const },
            { at: '14:00', location: 'CLIENT' as const, client: 'Brightline' },
        ];
        expect(locationTrailText(trail)).toBe('Office 9:30 AM → Client site (Brightline) 2:00 PM');
        expect(locationDetailText(trail)).toBe('Office from 9:30 AM, Client site (Brightline) from 2:00 PM');
        expect(workingFromText({ location: 'CLIENT', client: 'Brightline' }, '14:00')).toBe('Working from Client site (Brightline) from 2:00 PM');
        expect(workingFromText({ location: 'HOME' })).toBe('Working from Home');
    });
});
