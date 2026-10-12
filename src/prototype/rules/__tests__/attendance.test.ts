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
    ENTRY_MESSAGES,
    editModeFor,
    effectiveCheckOut,
    entryMins,
    entriesOverlap,
    expectedMinutes,
    formatDuration,
    isSubmissionDay,
    outsideCheckInFlag,
    overtimeMinutes,
    parseHours,
    payrollBlockers,
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
        expect(() => validateEntry({ date: '2026-10-05', start: '13:00', end: '14:00', description: ' ' }, [])).toThrow(/Describe what you worked on/);
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
    it('the employee only resubmits sent-back weeks (drafts go out on submission day), only with approval on', () => {
        expect(canSubmitWeek({ approvalEnabled: true, status: 'SENT_BACK', allDaysLocked: false })).toBe(true);
        expect(canSubmitWeek({ approvalEnabled: true, status: 'DRAFT', allDaysLocked: false })).toBe(false);
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

// ---- PROTOTYPE-SETUP (V2): hours-only entries, the entry form's rules and expected hours -----------------

describe('entry minutes and sorting', () => {
    it('uses the times when present, otherwise the minutes entered', () => {
        expect(entryMins(entry('a', '2026-10-05', '09:30', '11:00'))).toBe(90);
        expect(entryMins(hoursOnly('h', '2026-10-05', 60))).toBe(60);
        expect(entryMins({ start: '09:00', end: '10:00', mins: 999 })).toBe(60);
    });
    it('sorts timed entries by start, then hours-only entries', () => {
        const list = [hoursOnly('h1', '2026-10-05', 30), entry('b', '2026-10-05', '14:00', '15:00'), hoursOnly('h2', '2026-10-05', 15), entry('a', '2026-10-05', '09:00', '10:00'), entry('z', '2026-10-04', '16:00', '17:00')];
        expect(sortEntries(list).map(e => e.id)).toEqual(['z', 'a', 'b', 'h1', 'h2']);
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
        expect(msg({ date: D, start: '13:00', end: '12:00', description: 'x' })).toBe(ENTRY_MESSAGES.endBeforeStart);
        expect(msg({ date: D, end: '12:00', description: 'x' })).toBe(ENTRY_MESSAGES.endWithoutStart);
        expect(msg({ date: D, start: '12:00', description: 'x' })).toBe(ENTRY_MESSAGES.startWithoutEnd);
        expect(msg({ date: D, hoursText: 'abc', description: 'x' })).toBe(ENTRY_MESSAGES.unreadableHours);
        expect(msg({ date: D, hoursText: '0', description: 'x' })).toBe(ENTRY_MESSAGES.zeroHours);
        expect(msg({ date: D, hoursText: '25', description: 'x' })).toBe(ENTRY_MESSAGES.over24);
        expect(msg({ date: D, hoursText: '1', description: ' ' })).toBe(ENTRY_MESSAGES.description);
        expect(msg({ date: D, description: 'x' })).toBe(ENTRY_MESSAGES.missing);
        expect(msg({ date: D, start: '23:00', hoursText: '2', description: 'x' })).toBe(ENTRY_MESSAGES.pastMidnight);
    });
    it('rejects a day over 24h (hours-only entries count)', () => {
        expect(msg({ date: D, hoursText: '5', description: 'x' }, [hoursOnly('h', D, 20 * 60)])).toBe(ENTRY_MESSAGES.dayOver24);
        expect(msg({ date: D, hoursText: '4', description: 'x' }, [hoursOnly('h', D, 20 * 60)])).toBe('no error');
    });
    it('overlap applies to timed entries only', () => {
        const others = [entry('a', D, '09:00', '12:00'), hoursOnly('h', D, 120)];
        expect(msg({ date: D, start: '11:00', end: '13:00', description: 'x' }, others)).toBe('Overlaps with 09:00–12:00 (Work).');
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
        expect(f).toEqual({ entryIds: ['h'], action: 'request-correction', suggested: { checkIn: null, checkOut: null } });
    });
    it('count toward timesheet-only overtime', () => {
        const logged = entryMins(entry('a', '2026-10-05', '09:30', '17:30')) + entryMins(hoursOnly('h', '2026-10-05', 90));
        expect(overtimeMinutes({ mode: 'timesheet', settings: S, isOffDay: false, checkIn: null, checkOut: null, loggedMinutes: logged })).toBe(90);
    });
    it('the change diff compares minutes too', () => {
        const before = hoursOnly('h', '2026-10-05', 60);
        expect(diffSummary(diffEntries([before], [{ ...before, mins: 90 }]))).toBe('1 edited');
        expect(diffSummary(diffEntries([before], [before]))).toBe('no changes');
    });
});

describe('expected hours — one rule, eight edge cases', () => {
    const exp = (over: Partial<AttendanceDay>, mode: 'both' | 'timesheet' | 'attendance' = 'both', dateOfJoin?: string) =>
        expectedMinutes({ mode, settings: S, day: day(over), today: TODAY, dateOfJoin });
    it('normal days: both = window − break, timesheet = shift − break, off/holiday/leave = 0', () => {
        expect(exp({ checkIn: '09:30', checkOut: '19:00' })).toBe(510);
        expect(exp({}, 'timesheet')).toBe(480);
        expect(exp({ status: 'weekly-off', checkIn: null, checkOut: null })).toBe(0);
        expect(exp({ status: 'holiday', checkIn: null, checkOut: null })).toBe(0);
        expect(exp({ status: 'on-leave', checkIn: null, checkOut: null })).toBe(0);
        expect(exp({ date: '2026-10-08', status: 'upcoming', checkIn: null, checkOut: null })).toBe(480);
    });
    it('#1 both mode, past working day with no check-in (absent) → 0', () => {
        expect(exp({ status: 'absent', checkIn: null, checkOut: null })).toBe(0);
    });
    it('#2 both mode, today, checked in and not out → check-in to shift end, minus break', () => {
        expect(exp({ date: TODAY, status: 'present', checkIn: '09:00', checkOut: null })).toBe(510);
    });
    it('#3 approved leave but checked in → the check-in window applies', () => {
        // status isn't on-leave when there's a check-in (deriveDay), so the window is used
        expect(exp({ status: 'present', label: 'Casual Leave', checkIn: '10:00', checkOut: '15:00' })).toBe(240);
    });
    it('#4 half-day leave (works the other half) → the check-in window', () => {
        expect(exp({ status: 'half-day', checkIn: '14:00', checkOut: '18:30' })).toBe(210);
    });
    it('#5 worked on a weekly off or holiday → 0 (all that time is overtime instead)', () => {
        expect(exp({ status: 'worked-off-day', checkIn: '10:00', checkOut: '14:00' })).toBe(0);
        expect(overtimeMinutes({ mode: 'both', settings: S, isOffDay: true, checkIn: '10:00', checkOut: '14:00', loggedMinutes: 0 })).toBe(240);
    });
    it('#6 before the joining date → 0', () => {
        expect(exp({}, 'timesheet', '2026-10-06')).toBe(0);
    });
    it('#7 check-in after the shift ends (window shorter than the break) → 0, never negative', () => {
        expect(exp({ checkIn: '18:40', checkOut: '19:10' })).toBe(0);
    });
    it('#8 attendance-only mode → 0', () => {
        expect(exp({}, 'attendance')).toBe(0);
    });
    it('dayWindow uses the same number', () => {
        expect(dayWindow({ mode: 'both', settings: S, day: day({ status: 'absent', checkIn: null, checkOut: null }), today: TODAY }).expectedMinutes).toBe(0);
        expect(dayWindow({ mode: 'both', settings: S, day: day({ checkIn: '09:42', checkOut: '19:12' }), today: TODAY }).expectedMinutes).toBe(510);
    });
});
