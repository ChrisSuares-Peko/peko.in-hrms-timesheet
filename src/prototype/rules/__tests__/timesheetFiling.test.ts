// PROTOTYPE-SETUP (Timesheet filing): the filing rules — fields, periods, automatic submission, overlaps, gaps over
// 5 minutes, the period review and which warning a submission shows.
import { describe, expect, it } from 'vitest';

import type { DayWindow, TimesheetBreakRow, TimesheetDay, TimesheetEntry, TimesheetFields } from '@src/domains/attendanceTimesheet/types';

import { DEFAULT_FILING, DEFAULT_SETTINGS, ENTRY_MESSAGES, RuleError, filingFieldsError, validateEntry } from '../attendance';
import {
    autoSubmitDateFor,
    canSubmitPeriod,
    clipPeriod,
    dayGapCheck,
    findGaps,
    findOverlaps,
    gapCount,
    afterManagerApproval,
    editedBack,
    isAutoSubmitDay,
    isAutoSubmitDue,
    submittedStatus,
    naturalPeriod,
    periodLabel,
    periodsDueForSubmission,
    rangeText,
    reviewPeriod,
    reviewSummary,
    submissionPrompt,
    dayState,
    markDirty,
} from '../timesheetFiling';

const D = '2026-10-07'; // Wednesday
const TIMES: TimesheetFields = { projectCode: false, startTime: true, endTime: true, duration: false }; // Pattern A
const TIMES_AND_DURATION: TimesheetFields = { ...TIMES, duration: true }; // Pattern C
const DURATION: TimesheetFields = { projectCode: false, startTime: false, endTime: false, duration: true }; // Pattern B
const WITH_CODE: TimesheetFields = { ...TIMES_AND_DURATION, projectCode: true };

const entry = (id: string, start: string | null, end: string | null, extra: Partial<TimesheetEntry> = {}): TimesheetEntry => ({
    id,
    date: D,
    start,
    end,
    mins: 0,
    description: `Task ${id}`,
    ...extra,
});
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const timed = (id: string, start: string, end: string, extra: Partial<TimesheetEntry> = {}) =>
    entry(id, start, end, { mins: toMin(end) - toMin(start), ...extra });
const err = (fn: () => unknown) => {
    try {
        fn();
        return 'no error';
    } catch (e) {
        return e instanceof RuleError ? e.message : String(e);
    }
};

const attendanceWindow = (inAt: string, outAt: string, open = false): DayWindow => ({
    kind: 'attendance',
    start: inAt,
    end: outAt,
    startMinutes: toMin(inAt),
    endMinutes: toMin(outAt),
    label: '',
    expectedMinutes: 0,
    ...(open ? { open: true } : {}),
});
const lunch: TimesheetBreakRow = { index: 0, start: '13:00', end: '14:00', startMinutes: 780, endMinutes: 840, minutes: 60, description: 'Lunch', running: false };
const day = (entries: TimesheetEntry[], window: DayWindow = attendanceWindow('09:00', '18:00'), breaks: TimesheetBreakRow[] = [lunch], date = D) =>
    ({ date, window, entries: entries.map(e => ({ ...e, date })), breaks }) as Pick<TimesheetDay, 'date' | 'window' | 'entries' | 'breaks'>;

describe('fields: a valid combination', () => {
    it('start and end go together; some way of recording time is on', () => {
        expect(filingFieldsError(TIMES)).toBeNull();
        expect(filingFieldsError(TIMES_AND_DURATION)).toBeNull();
        expect(filingFieldsError(DURATION)).toBeNull();
        expect(filingFieldsError({ ...TIMES, endTime: false })).toMatch(/work as a pair/);
        expect(filingFieldsError({ projectCode: true, startTime: false, endTime: false, duration: false })).toMatch(/Turn on start and end times, or duration/);
    });
    it('defaults: weekly, start + end + visible duration, project codes off', () => {
        expect(DEFAULT_SETTINGS.timesheetFiling).toEqual(DEFAULT_FILING);
        expect(DEFAULT_FILING).toMatchObject({ frequency: 'WEEKLY', fields: { projectCode: false, startTime: true, endTime: true, duration: true } });
    });
});

describe('fields: the entry form (validateEntry)', () => {
    it('Pattern A / C: start and end required; the duration is calculated, never typed', () => {
        [TIMES, TIMES_AND_DURATION].forEach(f => {
            expect(validateEntry({ date: D, start: '09:30', end: '11:00', hoursText: '5', description: 'x' }, [], f)).toMatchObject({ start: '09:30', end: '11:00', mins: 90 });
            expect(err(() => validateEntry({ date: D, hoursText: '1:30', description: 'x' }, [], f))).toBe(ENTRY_MESSAGES.needTimes);
            expect(err(() => validateEntry({ date: D, start: '09:30', description: 'x' }, [], f))).toBe(ENTRY_MESSAGES.needTimes);
        });
    });
    it('Pattern B: the duration only — times are dropped, nothing is invented', () => {
        expect(validateEntry({ date: D, start: '09:30', end: '11:00', hoursText: '1:15', description: 'x' }, [], DURATION)).toEqual({ date: D, start: null, end: null, mins: 75, description: 'x', location: 'OFFICE' });
        expect(err(() => validateEntry({ date: D, description: 'x' }, [], DURATION))).toBe(ENTRY_MESSAGES.needDuration);
        expect(err(() => validateEntry({ date: D, hoursText: 'soon', description: 'x' }, [], DURATION))).toBe(ENTRY_MESSAGES.unreadableHours);
    });
    it('project code: required and checked when on; kept but not required when off', () => {
        expect(err(() => validateEntry({ date: D, start: '09:00', end: '10:00', description: 'x' }, [], WITH_CODE))).toBe(ENTRY_MESSAGES.projectCode);
        expect(err(() => validateEntry({ date: D, start: '09:00', end: '10:00', description: 'x', projectCode: 'pay 101!' }, [], WITH_CODE))).toBe(ENTRY_MESSAGES.projectCodeFormat);
        expect(validateEntry({ date: D, start: '09:00', end: '10:00', description: 'x', projectCode: ' pay-101 ' }, [], WITH_CODE)).toMatchObject({ projectCode: 'PAY-101' });
        expect(err(() => validateEntry({ date: D, start: '09:00', end: '10:00', description: 'x' }, [], TIMES))).toBe('no error');
        expect(validateEntry({ date: D, start: '09:00', end: '10:00', description: 'x', projectCode: 'INV-220' }, [], TIMES)).toMatchObject({ projectCode: 'INV-220' });
    });
    it('the description is required in every pattern', () => {
        [TIMES, DURATION].forEach(f => expect(err(() => validateEntry({ date: D, start: '09:00', end: '10:00', hoursText: '1', description: '  ' }, [], f))).toBe(ENTRY_MESSAGES.description));
    });
    it('overlapping another task is saved (warned); overlapping a break is not', () => {
        const others = [timed('a', '09:00', '12:00')];
        expect(err(() => validateEntry({ date: D, start: '11:00', end: '12:30', description: 'x' }, others, TIMES))).toBe('no error');
        const brk = timed('break:0', '13:00', '14:00', { description: 'Lunch' });
        expect(err(() => validateEntry({ date: D, start: '13:30', end: '15:00', description: 'x' }, [brk], TIMES))).toBe('Overlaps with 1:00 PM – 2:00 PM (break).');
    });
});

describe('filing periods', () => {
    it('the natural day, Monday–Sunday week and month', () => {
        expect(naturalPeriod(D, 'DAILY')).toEqual({ start: D, end: D });
        expect(naturalPeriod(D, 'WEEKLY')).toEqual({ start: '2026-10-05', end: '2026-10-11' });
        expect(naturalPeriod(D, 'MONTHLY')).toEqual({ start: '2026-10-01', end: '2026-10-31' });
        expect(naturalPeriod('2028-02-10', 'MONTHLY')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    });
    it('clipped around periods already submitted (never overlapping them)', () => {
        const fixed = [{ start: '2026-09-28', end: '2026-10-04' }, { start: '2026-10-05', end: '2026-10-11' }];
        expect(clipPeriod(naturalPeriod('2026-10-15', 'MONTHLY'), '2026-10-15', fixed)).toEqual({ start: '2026-10-12', end: '2026-10-31' });
        expect(clipPeriod(naturalPeriod('2026-10-02', 'MONTHLY'), '2026-10-02', [{ start: '2026-10-05', end: '2026-10-11' }])).toEqual({ start: '2026-10-01', end: '2026-10-04' });
    });
    it('labels', () => {
        expect(periodLabel('2026-10-15', '2026-10-15')).toBe('Thu, 15 Oct 2026');
        expect(periodLabel('2026-10-12', '2026-10-18')).toBe('12–18 Oct 2026');
        expect(periodLabel('2026-09-28', '2026-10-04')).toBe('28 Sep – 4 Oct 2026');
        expect(periodLabel('2026-10-01', '2026-10-31')).toBe('October 2026');
        expect(periodLabel('2026-12-28', '2027-01-03')).toBe('28 Dec 2026 – 3 Jan 2027');
    });
});

describe('automatic submission schedule', () => {
    const settings = (frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY') => ({
        timesheetApproval: { enabled: true, submissionWeekday: 'FRIDAY' as const, submissionTime: '23:00' },
        timesheetFiling: { ...DEFAULT_FILING, frequency },
    });
    it('runs on the submission weekday / every day / the month’s last day', () => {
        expect(isAutoSubmitDay('2026-10-09', settings('WEEKLY'))).toBe(true);
        expect(isAutoSubmitDay(D, settings('WEEKLY'))).toBe(false);
        expect(isAutoSubmitDay(D, settings('DAILY'))).toBe(true);
        expect(isAutoSubmitDay('2026-10-31', settings('MONTHLY'))).toBe(true);
        expect(isAutoSubmitDay('2026-10-30', settings('MONTHLY'))).toBe(false);
        expect(isAutoSubmitDay('2026-10-09', { ...settings('WEEKLY'), timesheetApproval: { enabled: false, submissionWeekday: 'FRIDAY', submissionTime: '23:00' } })).toBe(false);
    });
    it('sends started drafts (daily: drafts already over)', () => {
        const recs = [
            { weekStart: '2026-10-05', status: 'DRAFT' as const, entries: [1] },
            { weekStart: '2026-10-12', status: 'DRAFT' as const, entries: [1] },
            { weekStart: '2026-09-28', status: 'SUBMITTED' as const, entries: [1] },
            { weekStart: '2026-09-21', status: 'DRAFT' as const, entries: [] }, // nothing logged: left alone
        ];
        expect(periodsDueForSubmission(recs, '2026-10-09', 'WEEKLY').map(r => r.weekStart)).toEqual(['2026-10-05']);
        const days = [{ weekStart: D, periodEnd: D, status: 'DRAFT' as const, entries: [1] }, { weekStart: '2026-10-06', periodEnd: '2026-10-06', status: 'DRAFT' as const, entries: [1] }];
        expect(periodsDueForSubmission(days, D, 'DAILY').map(r => r.weekStart)).toEqual(['2026-10-06']);
    });
    it('when a draft goes out', () => {
        expect(autoSubmitDateFor({ start: '2026-10-05', end: '2026-10-11' }, settings('WEEKLY'), D)).toBe('2026-10-09');
        expect(autoSubmitDateFor({ start: D, end: D }, settings('DAILY'), D)).toBe('2026-10-08');
        expect(autoSubmitDateFor({ start: '2026-10-01', end: '2026-10-31' }, settings('MONTHLY'), D)).toBe('2026-10-31');
        expect(autoSubmitDateFor({ start: '2026-10-05', end: '2026-10-11' }, { ...settings('WEEKLY'), timesheetApproval: { enabled: false, submissionWeekday: 'FRIDAY', submissionTime: '23:00' } }, D)).toBeNull();
    });
    it('manual submission: a started draft or a sent-back period', () => {
        const base = { approvalEnabled: true, allDaysLocked: false, today: D };
        expect(canSubmitPeriod({ ...base, status: 'DRAFT', start: '2026-10-05' })).toBe(true);
        expect(canSubmitPeriod({ ...base, status: 'DRAFT', start: '2026-10-12' })).toBe(false);
        expect(canSubmitPeriod({ ...base, status: 'SENT_BACK', start: '2026-09-28' })).toBe(true);
        expect(canSubmitPeriod({ ...base, status: 'SUBMITTED', start: '2026-10-05' })).toBe(false);
        expect(canSubmitPeriod({ ...base, status: 'APPROVED', start: '2026-10-05' })).toBe(false);
        expect(canSubmitPeriod({ ...base, approvalEnabled: false, status: 'DRAFT', start: '2026-10-05' })).toBe(false);
    });
});

describe('overlaps', () => {
    it('finds the shared time; adjacent entries don’t overlap', () => {
        const list = [timed('a', '09:30', '11:00'), timed('b', '10:30', '11:30'), timed('c', '11:30', '12:00')];
        expect(findOverlaps(list)).toEqual([{ a: 'a', b: 'b', date: D, from: 630, to: 660 }]);
        expect(rangeText(630, 660)).toBe('10:30 AM – 11:00 AM');
    });
    it('several overlapping entries give every pair', () => {
        const list = [timed('a', '09:00', '12:00'), timed('b', '10:00', '11:00'), timed('c', '10:30', '11:30')];
        expect(findOverlaps(list).map(o => `${o.a}-${o.b}`)).toEqual(['a-b', 'a-c', 'b-c']);
    });
    it('entries on different dates never overlap at the same clock time', () => {
        expect(findOverlaps([timed('a', '09:00', '10:00'), timed('b', '09:00', '10:00', { date: '2026-10-08' })])).toEqual([]);
    });
    it('overnight: a 10 PM – 2 AM entry meets the next day’s 1 AM entry', () => {
        const night = timed('n', '22:00', '02:00', { endNext: true, mins: 240 });
        const next = timed('m', '01:00', '03:00', { date: '2026-10-08' });
        expect(findOverlaps([night, next])).toEqual([{ a: 'n', b: 'm', date: D, from: 25 * 60, to: 26 * 60 }]);
        expect(rangeText(25 * 60, 26 * 60)).toBe('1:00 AM – 2:00 AM (next day)');
    });
    it('hours-only entries and breaks never overlap', () => {
        expect(findOverlaps([timed('a', '09:00', '12:00'), entry('h', null, null, { mins: 120 }), timed('break:0', '10:00', '11:00')])).toEqual([]);
    });
});

describe('gaps over 5 minutes', () => {
    const bounds = { start: 540, end: 1080 };
    it('exactly 5 minutes doesn’t warn; 6 minutes does', () => {
        expect(findGaps(bounds, [{ start: 540, end: 600 }, { start: 605, end: 1080 }])).toEqual([]);
        expect(findGaps(bounds, [{ start: 540, end: 600 }, { start: 606, end: 1080 }])).toEqual([{ from: 600, to: 606, minutes: 6 }]);
    });
    it('several gaps, including at the start and end of the day; overlapping intervals merge', () => {
        const gaps = findGaps(bounds, [{ start: 560, end: 700 }, { start: 650, end: 760 }, { start: 800, end: 1000 }]);
        expect(gaps).toEqual([
            { from: 540, to: 560, minutes: 20 },
            { from: 760, to: 800, minutes: 40 },
            { from: 1000, to: 1080, minutes: 80 },
        ]);
    });
    it('a day: entries and breaks cover time, check-in → check-out bounds it', () => {
        const check = dayGapCheck(day([timed('a', '09:00', '13:00'), timed('b', '14:00', '17:00')]), { fields: TIMES, mode: 'both', today: '2026-10-08' });
        expect(check).toEqual({ checked: true, bounds: { start: 540, end: 1080 }, gaps: [{ from: 1020, to: 1080, minutes: 60 }] });
    });
    it('overnight days run past midnight', () => {
        const w = { ...attendanceWindow('21:00', '02:00'), endMinutes: 26 * 60 };
        const check = dayGapCheck(day([timed('n', '21:00', '01:00', { endNext: true })], w, []), { fields: TIMES, mode: 'both', today: '2026-10-09' });
        expect(check).toMatchObject({ checked: true, gaps: [{ from: 25 * 60, to: 26 * 60, minutes: 60 }] });
    });
    it('no reliable boundary, no claim: duration-only, still checked in, future, no workday, untimed entries', () => {
        const ok = { mode: 'both' as const, today: '2026-10-08' };
        expect(dayGapCheck(day([]), { ...ok, fields: DURATION })).toEqual({ checked: false, reason: 'duration-only' });
        expect(dayGapCheck(day([], attendanceWindow('09:00', '12:00', true)), { ...ok, fields: TIMES })).toEqual({ checked: false, reason: 'still-checked-in' });
        expect(dayGapCheck(day([], undefined, [], '2026-10-09'), { ...ok, fields: TIMES })).toEqual({ checked: false, reason: 'not-finished' });
        expect(dayGapCheck(day([], { kind: 'none', label: 'Leave', expectedMinutes: 0 }), { ...ok, fields: TIMES })).toEqual({ checked: false, reason: 'no-workday' });
        expect(dayGapCheck(day([entry('h', null, null, { mins: 60 })]), { ...ok, fields: TIMES })).toEqual({ checked: false, reason: 'untimed-entries' });
    });
    it('timesheet-only: the shift bounds a past working day; not today; never in both mode', () => {
        const shift: DayWindow = { kind: 'shift', start: '09:30', end: '18:30', startMinutes: 570, endMinutes: 1110, label: '', expectedMinutes: 540 };
        expect(dayGapCheck(day([timed('a', '09:30', '18:30')], shift, []), { fields: TIMES, mode: 'timesheet', today: '2026-10-08' })).toMatchObject({ checked: true, gaps: [] });
        expect(dayGapCheck(day([], shift, []), { fields: TIMES, mode: 'timesheet', today: D })).toEqual({ checked: false, reason: 'not-finished' });
        expect(dayGapCheck(day([], shift, []), { fields: TIMES, mode: 'both', today: '2026-10-08' })).toEqual({ checked: false, reason: 'not-finished' });
    });
});

describe('the period review and the submission prompt', () => {
    const today = '2026-10-08';
    const fullDay = day([timed('a', '09:00', '13:00'), timed('b', '14:00', '18:00')]);
    it('a clean period: no prompt', () => {
        const r = reviewPeriod({ days: [fullDay], fields: TIMES, mode: 'both', today });
        expect(r).toMatchObject({ issues: [], overlaps: [], gaps: [], timelineChecks: true });
        expect(submissionPrompt(r, 'manual')).toBeNull();
        expect(reviewSummary(r)).toBe('');
    });
    it('an overlap: warn, then Continue anyway (acknowledged) → no prompt; Review entries keeps the overlap', () => {
        const r = reviewPeriod({ days: [day([timed('a', '09:00', '13:00'), timed('b', '12:30', '18:00')])], fields: TIMES, mode: 'both', today });
        expect(r.overlaps).toHaveLength(1);
        expect(submissionPrompt(r, 'manual')).toBe('overlaps');
        expect(submissionPrompt(r, 'manual', { overlaps: true })).toBeNull();
        expect(reviewSummary(r)).toBe('1 overlap');
    });
    // PROTOTYPE-SETUP (Final batch, Slice 3): checked-in hours not logged (15 min or more, days up to today) come last.
    it('unlogged hours: "Submit for approval?" after the other checks, then Submit anyway', () => {
        // Hours-only filing: no timeline checks, so only the unlogged hours are reviewed.
        const d1 = { ...fullDay, date: '2026-10-07', entries: [], expectedMinutes: 540, loggedMinutes: 400 };
        const d2 = { ...fullDay, date: '2026-10-08', entries: [], expectedMinutes: 540, loggedMinutes: 530 };
        const d3 = { ...fullDay, date: '2026-10-09', entries: [], expectedMinutes: 540, loggedMinutes: 0 };
        const r = reviewPeriod({ days: [d1, d2, d3], fields: DURATION, mode: 'both', today });
        expect(r.unlogged).toEqual([{ date: '2026-10-07', minutes: 140 }]);
        expect(submissionPrompt(r, 'manual')).toBe('unlogged');
        expect(submissionPrompt(r, 'manual', { unlogged: true })).toBeNull();
        expect(submissionPrompt(r, 'auto')).toBeNull();
        const both = reviewPeriod({ days: [{ ...d1, date: D, entries: [timed('a', '09:00', '13:00'), timed('b', '12:30', '18:00')] }], fields: TIMES, mode: 'both', today });
        expect(submissionPrompt(both, 'manual')).toBe('overlaps');
        expect(submissionPrompt(both, 'manual', { overlaps: true })).toBe('unlogged');
    });
    it('a qualifying gap: warn, then Submit anyway → no prompt', () => {
        const r = reviewPeriod({ days: [day([timed('a', '09:00', '13:00'), timed('b', '14:00', '17:00')])], fields: TIMES, mode: 'both', today });
        expect(gapCount(r)).toBe(1);
        expect(submissionPrompt(r, 'manual')).toBe('gaps');
        expect(submissionPrompt(r, 'manual', { gaps: true })).toBeNull();
        expect(reviewSummary(r)).toBe('1 gap over 5 min');
    });
    it('overlaps come before gaps; both are acknowledged separately', () => {
        const r = reviewPeriod({ days: [day([timed('a', '09:00', '13:00'), timed('b', '12:30', '17:00')])], fields: TIMES, mode: 'both', today });
        expect(submissionPrompt(r, 'manual')).toBe('overlaps');
        expect(submissionPrompt(r, 'manual', { overlaps: true })).toBe('gaps');
        expect(submissionPrompt(r, 'manual', { overlaps: true, gaps: true })).toBeNull();
    });
    it('missing details block a manual submission (no acknowledging them)', () => {
        const r = reviewPeriod({ days: [day([timed('a', '09:00', '13:00'), timed('b', '14:00', '18:00')])], fields: WITH_CODE, mode: 'both', today });
        expect(r.issues.map(i => i.message)).toEqual([ENTRY_MESSAGES.projectCode, ENTRY_MESSAGES.projectCode]);
        expect(submissionPrompt(r, 'manual', { overlaps: true, gaps: true })).toBe('issues');
    });
    it('automatic submission never prompts and never waits for an acknowledgement', () => {
        const r = reviewPeriod({ days: [day([timed('a', '09:00', '12:00'), timed('b', '11:00', '15:00')])], fields: WITH_CODE, mode: 'both', today });
        expect(r.overlaps.length + gapCount(r) + r.issues.length).toBeGreaterThan(0);
        expect(submissionPrompt(r, 'auto')).toBeNull();
        expect(reviewSummary(r)).toBe('1 overlap · 1 gap over 5 min · 2 entries missing details');
    });
    it('duration-only filing: no invented overlaps or gaps', () => {
        const r = reviewPeriod({ days: [day([entry('h', null, null, { mins: 120 }), entry('i', null, null, { mins: 60 })])], fields: DURATION, mode: 'both', today });
        expect(r).toMatchObject({ overlaps: [], gaps: [], timelineChecks: false, issues: [] });
        expect(submissionPrompt(r, 'manual')).toBeNull();
    });
    it('start + end filing: a legacy hours-only entry needs times (blocking); its day isn’t gap-checked', () => {
        const r = reviewPeriod({ days: [day([timed('a', '09:00', '13:00'), entry('h', null, null, { mins: 60 })])], fields: TIMES, mode: 'both', today });
        expect(r.issues).toEqual([{ entryId: 'h', date: D, message: ENTRY_MESSAGES.needTimes }]);
        expect(r.gaps).toEqual([]);
        expect(r.skipped).toEqual([{ date: D, reason: 'untimed-entries' }]);
    });
});

// PROTOTYPE-SETUP (Final batch, Slice 1): Draft → With manager → With Payroll → Approved; edits after sending.
describe('the approval path and edits after sending', () => {
    const e1 = timed('a', '09:00', '10:00');
    const e2 = timed('b', '10:00', '11:00');
    it('submitted → with the manager; the CEO (no manager) → straight to Payroll (or approved with no level 2)', () => {
        expect(submittedStatus(true, 'PAYROLL')).toBe('SUBMITTED');
        expect(submittedStatus(false, 'PAYROLL')).toBe('WITH_PAYROLL');
        expect(submittedStatus(false, 'NONE')).toBe('APPROVED');
    });
    it('the manager approves → With Payroll (or Approved when there is no level 2)', () => {
        expect(afterManagerApproval('PAYROLL')).toBe('WITH_PAYROLL');
        expect(afterManagerApproval('NONE')).toBe('APPROVED');
    });
    it('an edit to a sent or approved period → Draft with a baseline', () => {
        const approved = { status: 'APPROVED' as const, entries: [e1, e2], approvedEntries: [e1] };
        expect(editedBack(approved)).toMatchObject({ status: 'DRAFT', baselineEntries: [e1], editedAfter: 'APPROVED' });
        const withManager = { status: 'SUBMITTED' as const, entries: [e1, e2], approvedEntries: null };
        expect(editedBack(withManager)).toMatchObject({ status: 'DRAFT', baselineEntries: [e1, e2], editedAfter: 'SUBMITTED' });
        const withPayroll = { status: 'WITH_PAYROLL' as const, entries: [e2], approvedEntries: null, baselineEntries: [e1] };
        expect(editedBack(withPayroll)).toMatchObject({ status: 'DRAFT', baselineEntries: [e1], editedAfter: 'WITH_PAYROLL' });
        const draft = { status: 'DRAFT' as const, entries: [e1], approvedEntries: null };
        expect(editedBack(draft)).toBe(draft);
        const sentBack = { status: 'SENT_BACK' as const, entries: [e1], approvedEntries: null };
        expect(editedBack(sentBack)).toBe(sentBack);
    });
    it('auto-submit is due on the day once its time has come (Friday 11:00 PM by default)', () => {
        const s = { timesheetApproval: { enabled: true, submissionWeekday: 'FRIDAY' as const, submissionTime: '23:00' }, timesheetFiling: DEFAULT_FILING };
        expect(isAutoSubmitDue('2026-10-09', 22 * 60 + 59, s)).toBe(false);
        expect(isAutoSubmitDue('2026-10-09', 23 * 60, s)).toBe(true);
        expect(isAutoSubmitDue('2026-10-08', 23 * 60 + 30, s)).toBe(false);
    });
});

// PROTOTYPE-SETUP (Final batch, Slice 1): where the work was done.
describe('entry location', () => {
    it('defaults to Office; a client site needs the client’s name', () => {
        expect(validateEntry({ date: D, start: '09:00', end: '10:00', description: 'x' }, [], TIMES)).toMatchObject({ location: 'OFFICE' });
        expect(validateEntry({ date: D, start: '09:00', end: '10:00', description: 'x', location: 'HOME' }, [], TIMES)).toMatchObject({ location: 'HOME' });
        expect(err(() => validateEntry({ date: D, start: '09:00', end: '10:00', description: 'x', location: 'CLIENT' }, [], TIMES))).toBe(ENTRY_MESSAGES.client);
        expect(validateEntry({ date: D, start: '09:00', end: '10:00', description: 'x', location: 'CLIENT', client: ' Brightline ' }, [], TIMES)).toMatchObject({ location: 'CLIENT', client: 'Brightline' });
    });
});

// PROTOTYPE-SETUP (Timesheet v6, Slice 1): per-day states.
describe('day states', () => {
    const base = { date: '2026-10-07', hasEntries: true, onLeave: false, offDay: false, approvalEnabled: true };
    it('in priority order: leave, saved, update requested, submitted', () => {
        expect(dayState({ ...base, onLeave: true, period: { status: 'APPROVED', dirtyDates: ['2026-10-07'], submittedAt: 'x' } })).toBe('leave');
        expect(dayState({ ...base, period: { status: 'APPROVED', dirtyDates: ['2026-10-07'], submittedAt: 'x' } })).toBe('saved');
        expect(dayState({ ...base, period: { status: 'DRAFT', submittedAt: undefined } })).toBe('saved');
        expect(dayState({ ...base, hasEntries: false, period: { status: 'SENT_BACK', submittedAt: 'x' } })).toBe('update');
        expect(dayState({ ...base, offDay: true, hasEntries: false, period: { status: 'SENT_BACK', submittedAt: 'x' } })).toBeUndefined();
        expect(dayState({ ...base, period: { status: 'WITH_PAYROLL', submittedAt: 'x' } })).toBe('submitted');
        // edited after it was sent: the unchanged days stay Submitted, only the changed ones are Saved
        expect(dayState({ ...base, date: '2026-10-06', period: { status: 'DRAFT', editedAfter: 'APPROVED', dirtyDates: ['2026-10-07'], submittedAt: 'x' } })).toBe('submitted');
        expect(dayState({ ...base, hasEntries: false, period: { status: 'APPROVED', submittedAt: 'x' } })).toBeUndefined();
        expect(dayState({ ...base, approvalEnabled: false, period: { status: 'DRAFT' } })).toBeUndefined();
    });
    it('dirty dates: sorted, no repeats', () => {
        expect(markDirty(['2026-10-07'], ['2026-10-05', '2026-10-07'])).toEqual(['2026-10-05', '2026-10-07']);
    });
});
