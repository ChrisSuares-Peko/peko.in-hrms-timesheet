// PROTOTYPE-SETUP (Timesheet filing): the rules of timesheet filing, in one pure module — filing periods (daily /
// weekly / monthly) and when they go out automatically, overlap and gap detection, the review of a period before it
// is submitted, and which warning (if any) a manual submission shows. No store, no React, no "now" unless passed in.
// Entry-level field rules (which fields are required) live with validateEntry in ./attendance.ts.
// Unit tests: ./__tests__/timesheetFiling.test.ts.
import type {
    AtsMode,
    AtsSettings,
    FilingFrequency,
    TimesheetDay,
    TimesheetEntry,
    TimesheetFields,
    TimesheetStatus,
    TimesheetDayState,
    TimesheetWeek,
} from '@src/domains/attendanceTimesheet/types';

import {
    ENTRY_MESSAGES,
    MINUTES_PER_DAY,
    PROJECT_CODE_RE,
    WEEKDAYS,
    addDays,
    clockOf,
    displayTime,
    entryEndMinutes,
    entryStartMinutes,
    isTimed,
    monthBounds,
    monthOf,
    normaliseProjectCode,
    usesTimes,
    weekStartOf,
    weekdayOf,
} from './attendance';

// ---- frequencies & periods ----------------------------------------------------------------------------------

export const FREQUENCY_LABEL: Record<FilingFrequency, string> = { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly' };

/** "day" / "week" / "month" — for copy like "this week". */
export const PERIOD_NOUN: Record<FilingFrequency, string> = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month' };

export interface PeriodRange {
    start: string;
    end: string;
}

/** The calendar period a date falls in: the day, its Monday–Sunday week, or its month. */
export const naturalPeriod = (date: string, frequency: FilingFrequency): PeriodRange => {
    if (frequency === 'DAILY') return { start: date, end: date };
    if (frequency === 'MONTHLY') {
        const { first, last } = monthBounds(monthOf(date));
        return { start: first, end: last };
    }
    const start = weekStartOf(date);
    return { start, end: addDays(start, 6) };
};

/**
 * What a period is by its dates — one day, a Monday–Sunday week or a calendar month — else (a period shortened
 * around submitted ones) the company's frequency. A week submitted before the company moved to monthly filing is
 * still a weekly timesheet.
 */
export const periodKind = (start: string, end: string, fallback: FilingFrequency): FilingFrequency => {
    if (start === end) return 'DAILY';
    if (start === weekStartOf(start) && end === addDays(start, 6)) return 'WEEKLY';
    const month = monthBounds(monthOf(start));
    if (start === month.first && end === month.last) return 'MONTHLY';
    return fallback;
};

/** A record's last day: `periodEnd`, or Monday + 6 for weekly records (stored before filing periods). */
export const periodEndOf = (w: { weekStart: string; periodEnd?: string }) => w.periodEnd ?? addDays(w.weekStart, 6);

/** Every date from start to end, inclusive. */
export const datesBetween = (start: string, end: string) => {
    const out: string[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
};

/**
 * The period for `date` when no stored period covers it: the natural period, clipped so it never overlaps a fixed
 * period (one already submitted, approved or sent back). `fixed` must not contain `date`.
 * E.g. monthly filing after weekly weeks up to 11 Oct were submitted: 15 Oct → 12–31 Oct.
 */
export const clipPeriod = (natural: PeriodRange, date: string, fixed: PeriodRange[]): PeriodRange =>
    fixed.reduce(
        (p, f) => {
            if (f.end < date && f.end >= p.start) return { ...p, start: addDays(f.end, 1) };
            if (f.start > date && f.start <= p.end) return { ...p, end: addDays(f.start, -1) };
            return p;
        },
        { ...natural }
    );

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const parts = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return { y, m, d, dow: new Date(y, m - 1, d).getDay() };
};

/**
 * "Thu, 15 Oct 2026" (one day) · "October 2026" (a whole month) · "12–18 Oct 2026" · "28 Sep – 4 Oct 2026" ·
 * "29 Dec 2026 – 4 Jan 2027".
 */
export const periodLabel = (start: string, end: string) => {
    const a = parts(start);
    const b = parts(end);
    if (start === end) return `${DAYS_SHORT[a.dow]}, ${a.d} ${MONTHS_SHORT[a.m - 1]} ${a.y}`;
    const month = monthBounds(monthOf(start));
    if (start === month.first && end === month.last) return `${MONTHS_LONG[a.m - 1]} ${a.y}`;
    if (a.y !== b.y) return `${a.d} ${MONTHS_SHORT[a.m - 1]} ${a.y} – ${b.d} ${MONTHS_SHORT[b.m - 1]} ${b.y}`;
    if (a.m !== b.m) return `${a.d} ${MONTHS_SHORT[a.m - 1]} – ${b.d} ${MONTHS_SHORT[b.m - 1]} ${b.y}`;
    return `${a.d}–${b.d} ${MONTHS_SHORT[b.m - 1]} ${b.y}`;
};

// ---- automatic submission ------------------------------------------------------------------------------------

type FilingSchedule = Pick<AtsSettings, 'timesheetApproval' | 'timesheetFiling'>;

/**
 * The days the automatic submission runs (approval on): weekly — the submission weekday; daily — every day (it sends
 * the days already over); monthly — the last day of the month.
 */
export const isAutoSubmitDay = (today: string, s: FilingSchedule) => {
    if (!s.timesheetApproval.enabled) return false;
    if (s.timesheetFiling.frequency === 'DAILY') return true;
    if (s.timesheetFiling.frequency === 'MONTHLY') return today === monthBounds(monthOf(today)).last;
    return weekdayOf(today) === s.timesheetApproval.submissionWeekday;
};

/** "23:00" → 1380 */
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * PROTOTYPE-SETUP (Final batch, Slice 1): the automatic submission runs on the auto-submit day once its time has come
 * (HR sets a weekday and a time; default Friday 11:00 PM).
 */
export const isAutoSubmitDue = (today: string, nowMinutes: number, s: FilingSchedule) =>
    isAutoSubmitDay(today, s) && nowMinutes >= minutesOf(s.timesheetApproval.submissionTime || '23:00');

/**
 * On an auto-submit day, the drafts that go: every draft that has started (weekly and monthly — this period
 * included, as before), or that has ended (daily — today is still being worked). PROTOTYPE-SETUP (Final batch,
 * Slice 1): only drafts with entries; anything already sent is left alone.
 */
export const periodsDueForSubmission = <W extends { weekStart: string; periodEnd?: string; status: TimesheetStatus; entries: unknown[] }>(
    records: W[],
    today: string,
    frequency: FilingFrequency
) =>
    records.filter(
        w => w.status === 'DRAFT' && w.entries.length > 0 && (frequency === 'DAILY' ? periodEndOf(w) < today : w.weekStart <= today)
    );

// ---- the approval path (PROTOTYPE-SETUP: Final batch, Slice 1) ---------------------------------------------

/** Statuses a period is "sent" in: an edit moves it back to Draft. */
export const SENT_STATUSES = ['SUBMITTED', 'WITH_PAYROLL', 'APPROVED'] as const;

/**
 * Where a submission goes: to the manager, or — with no manager (the CEO) — straight to level 2 (Payroll), or
 * approved when there's no level 2 either.
 */
export const submittedStatus = (hasManager: boolean, level2: string): TimesheetStatus => {
    if (hasManager) return 'SUBMITTED';
    return level2 === 'NONE' ? 'APPROVED' : 'WITH_PAYROLL';
};

/** After the manager approves: on to level 2 (Payroll), or approved when there's none. */
export const afterManagerApproval = (level2: string): TimesheetStatus => (level2 === 'NONE' ? 'APPROVED' : 'WITH_PAYROLL');

/**
 * An edit to a period: a sent or approved one goes back to Draft and keeps a baseline — the last approved version,
 * or the version as submitted — so reviewers can see what changed. A draft or sent-back period just changes (an
 * earlier baseline is kept).
 */
export const editedBack = <W extends { status: TimesheetStatus; entries: TimesheetEntry[]; approvedEntries: TimesheetEntry[] | null; baselineEntries?: TimesheetEntry[] | null; editedAfter?: 'SUBMITTED' | 'WITH_PAYROLL' | 'APPROVED' }>(
    w: W
): W => {
    if (!(SENT_STATUSES as readonly string[]).includes(w.status)) return w;
    const baseline = w.baselineEntries ?? (w.status === 'APPROVED' ? w.approvedEntries ?? w.entries : w.entries);
    return { ...w, status: 'DRAFT', baselineEntries: baseline, editedAfter: w.status as 'SUBMITTED' | 'WITH_PAYROLL' | 'APPROVED' };
};

export const EDITED_AFTER_TEXT: Record<'SUBMITTED' | 'WITH_PAYROLL' | 'APPROVED', string> = {
    SUBMITTED: 'with manager',
    WITH_PAYROLL: 'with payroll',
    APPROVED: 'approved',
};

/** When a draft period goes out automatically (on or after today), or null with approval off. */
export const autoSubmitDateFor = (period: PeriodRange, s: FilingSchedule, today: string): string | null => {
    if (!s.timesheetApproval.enabled) return null;
    const { frequency } = s.timesheetFiling;
    if (frequency === 'DAILY') {
        const after = addDays(period.end, 1);
        return after > today ? after : today;
    }
    const from = period.start > today ? period.start : today;
    if (frequency === 'MONTHLY') return monthBounds(monthOf(from)).last;
    const offset = (WEEKDAYS.indexOf(s.timesheetApproval.submissionWeekday) - WEEKDAYS.indexOf(weekdayOf(from)) + 7) % 7;
    return addDays(from, offset);
};

/**
 * PROTOTYPE-SETUP (Timesheet filing): the employee can submit a draft period once it has started, and resubmit one
 * that was sent back (approval on, not every day locked). Submitted and approved periods can't be submitted again.
 */
export const canSubmitPeriod = (input: {
    approvalEnabled: boolean;
    status: TimesheetStatus;
    allDaysLocked: boolean;
    start: string;
    today: string;
}) =>
    input.approvalEnabled &&
    !input.allDaysLocked &&
    (input.status === 'SENT_BACK' || (input.status === 'DRAFT' && input.start <= input.today));

// ---- overlaps -------------------------------------------------------------------------------------------------

/** Two task entries sharing time. `from` / `to` are minutes from `date`'s midnight (past 1440 = the next day). */
export interface EntryOverlap {
    a: string;
    b: string;
    date: string;
    from: number;
    to: number;
}

const dayNumber = (iso: string) => {
    const { y, m, d } = parts(iso);
    return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};

/** An entry on one timeline across days (minutes from 1 Jan 1970), so overnight entries meet the next day's. */
const span = (e: TimesheetEntry) => {
    const base = dayNumber(e.date) * MINUTES_PER_DAY;
    return { start: base + entryStartMinutes(e), end: base + entryEndMinutes(e) };
};

/**
 * Every pair of timed task entries that share time. Entries are placed on one timeline (date + next-day times), so a
 * 10:00 PM – 2:00 AM entry overlaps a 1:00 AM entry logged on the next day, and the same clock time on two dates
 * never does. Touching entries (one ends as the next starts), hours-only entries and breaks never overlap.
 */
export const findOverlaps = (entries: TimesheetEntry[]): EntryOverlap[] => {
    const timed = entries
        .filter(e => isTimed(e) && !e.id.startsWith('break:'))
        .map(e => ({ e, ...span(e) }))
        .sort((x, y) => x.start - y.start || x.end - y.end);
    const out: EntryOverlap[] = [];
    timed.forEach((x, i) => {
        for (let j = i + 1; j < timed.length && timed[j].start < x.end; j += 1) {
            const y = timed[j];
            const from = Math.max(x.start, y.start);
            const to = Math.min(x.end, y.end);
            if (to > from) {
                const base = dayNumber(x.e.date) * MINUTES_PER_DAY;
                out.push({ a: x.e.id, b: y.e.id, date: x.e.date, from: from - base, to: to - base });
            }
        }
    });
    return out;
};

/** 600 → "10:00 AM", 1500 → "1:00 AM (next day)" */
export const minuteText = (m: number) => `${displayTime(clockOf(m))}${m >= MINUTES_PER_DAY ? ' (next day)' : ''}`;

/** "10:30 AM – 11:00 AM", "11:30 PM – 1:00 AM (next day)" — like entryTimeText. */
export const rangeText = (from: number, to: number) =>
    `${displayTime(clockOf(from))} – ${displayTime(clockOf(to))}${to >= MINUTES_PER_DAY ? ' (next day)' : ''}`;

// ---- gaps -----------------------------------------------------------------------------------------------------

/** A gap has to be longer than this to warn: exactly 5 minutes doesn't. */
export const GAP_THRESHOLD_MINUTES = 5;

export interface TimeGap {
    from: number;
    to: number;
    minutes: number;
}

/**
 * The parts of `bounds` no interval covers, longer than `threshold` minutes (strictly). Intervals may overlap or
 * reach outside the bounds; minutes are from the day's midnight.
 */
export const findGaps = (
    bounds: { start: number; end: number },
    intervals: { start: number; end: number }[],
    threshold = GAP_THRESHOLD_MINUTES
): TimeGap[] => {
    const sorted = intervals
        .map(i => ({ start: Math.max(i.start, bounds.start), end: Math.min(i.end, bounds.end) }))
        .filter(i => i.end > i.start)
        .sort((x, y) => x.start - y.start);
    const gaps: TimeGap[] = [];
    let cursor = bounds.start;
    sorted.forEach(i => {
        if (i.start > cursor) gaps.push({ from: cursor, to: i.start, minutes: i.start - cursor });
        cursor = Math.max(cursor, i.end);
    });
    if (cursor < bounds.end) gaps.push({ from: cursor, to: bounds.end, minutes: bounds.end - cursor });
    return gaps.filter(g => g.minutes > threshold);
};

/** Why a day's timeline can't be checked for gaps. */
export type GapSkip = 'duration-only' | 'no-workday' | 'not-finished' | 'still-checked-in' | 'untimed-entries';

export const GAP_SKIP_TEXT: Record<GapSkip, string> = {
    'duration-only': 'Entries have no times, so gaps can’t be checked.',
    'no-workday': 'No working hours that day.',
    'not-finished': 'The day isn’t over yet.',
    'still-checked-in': 'Still checked in, so the day has no end yet.',
    'untimed-entries': 'Some entries have no times, so gaps can’t be checked.',
};

export type DayGapCheck = { checked: true; gaps: TimeGap[]; bounds: { start: number; end: number } } | { checked: false; reason: GapSkip };

/**
 * A day's gaps over 5 minutes — only where the workday has reliable boundaries:
 *   both mode ........... check-in → check-out (not while still checked in; nothing without a check-in)
 *   timesheet-only ...... the shift, on a past working day
 * Not for future days, days without working hours, duration-only filing, or a day with entries that have no times
 * (where they fall is unknown). Entries and recorded breaks both cover time.
 */
export const dayGapCheck = (
    day: Pick<TimesheetDay, 'date' | 'window' | 'entries' | 'breaks'>,
    input: { fields: TimesheetFields; mode: AtsMode; today: string }
): DayGapCheck => {
    if (!usesTimes(input.fields)) return { checked: false, reason: 'duration-only' };
    if (day.date > input.today) return { checked: false, reason: 'not-finished' };
    const w = day.window;
    if (w.kind === 'none' || w.startMinutes === undefined || w.endMinutes === undefined) return { checked: false, reason: 'no-workday' };
    if (w.kind === 'attendance' && w.open) return { checked: false, reason: 'still-checked-in' };
    if (w.kind === 'shift' && (input.mode !== 'timesheet' || day.date >= input.today)) return { checked: false, reason: 'not-finished' };
    if (day.entries.some(e => !isTimed(e))) return { checked: false, reason: 'untimed-entries' };
    const bounds = { start: w.startMinutes, end: w.endMinutes };
    const intervals = [
        ...day.entries.map(e => ({ start: entryStartMinutes(e), end: entryEndMinutes(e) })),
        ...day.breaks.map(b => ({ start: b.startMinutes, end: b.endMinutes })),
    ];
    return { checked: true, gaps: findGaps(bounds, intervals), bounds };
};

// ---- the period review before submitting ------------------------------------------------------------------

export interface EntryIssue {
    entryId: string;
    date: string;
    message: string;
}

/** What an entry is missing for the company's fields (blocking at manual submission). */
export const entryIssues = (e: TimesheetEntry, fields: TimesheetFields): string[] => {
    const out: string[] = [];
    if (!e.description?.trim()) out.push(ENTRY_MESSAGES.description);
    if (usesTimes(fields) && !isTimed(e)) out.push(ENTRY_MESSAGES.needTimes);
    if (fields.projectCode && !PROJECT_CODE_RE.test(normaliseProjectCode(e.projectCode))) out.push(ENTRY_MESSAGES.projectCode);
    return out;
};

export interface PeriodReview {
    issues: EntryIssue[];
    overlaps: EntryOverlap[];
    gaps: { date: string; gaps: TimeGap[] }[];
    /** False with duration-only filing: no timeline, so no overlap or gap checks. */
    timelineChecks: boolean;
    /** Days that couldn't be checked for gaps, and why. */
    skipped: { date: string; reason: GapSkip }[];
    /**
     * PROTOTYPE-SETUP (Final batch, Slice 3): days up to today with at least UNLOGGED_REVIEW_MINUTES of expected time
     * not logged (the manager may send the period back).
     */
    unlogged: { date: string; minutes: number }[];
}

/** Unlogged time worth a look before submitting. */
export const UNLOGGED_REVIEW_MINUTES = 15;

/** Checks a period's days before it is submitted: missing fields (blocking), overlaps and gaps (warnings). */
export const reviewPeriod = (input: {
    days: (Pick<TimesheetDay, 'date' | 'window' | 'entries' | 'breaks'> & Partial<Pick<TimesheetDay, 'loggedMinutes' | 'expectedMinutes'>>)[];
    fields: TimesheetFields;
    mode: AtsMode;
    today: string;
}): PeriodReview => {
    const timelineChecks = usesTimes(input.fields);
    const entries = input.days.flatMap(d => d.entries);
    const issues = entries.flatMap(e => entryIssues(e, input.fields).map(message => ({ entryId: e.id, date: e.date, message })));
    const gaps: PeriodReview['gaps'] = [];
    const skipped: PeriodReview['skipped'] = [];
    if (timelineChecks) {
        input.days.forEach(d => {
            const check = dayGapCheck(d, input);
            if (check.checked) {
                if (check.gaps.length) gaps.push({ date: d.date, gaps: check.gaps });
            } else if (check.reason !== 'no-workday' && check.reason !== 'not-finished') skipped.push({ date: d.date, reason: check.reason });
        });
    }
    const unlogged = input.days
        .filter(d => d.date <= input.today)
        .map(d => ({ date: d.date, minutes: (d.expectedMinutes ?? 0) - (d.loggedMinutes ?? 0) }))
        .filter(u => u.minutes >= UNLOGGED_REVIEW_MINUTES);
    return { issues, overlaps: timelineChecks ? findOverlaps(entries) : [], gaps, timelineChecks, skipped, unlogged };
};

export const gapCount = (r: Pick<PeriodReview, 'gaps'>) => r.gaps.reduce((s, d) => s + d.gaps.length, 0);

/** The warnings the employee has acknowledged for this submission. */
export interface SubmissionAcknowledgement {
    overlaps?: boolean;
    gaps?: boolean;
    /** PROTOTYPE-SETUP (Final batch, Slice 3): "Submit anyway" with checked-in hours not logged. */
    unlogged?: boolean;
}

export type SubmissionPrompt = 'issues' | 'overlaps' | 'gaps' | 'unlogged' | null;

/**
 * What a submission shows before it goes. Manual: entries missing a required field block it ('issues' — review
 * entries); then overlaps and then gaps over 5 minutes warn until acknowledged (review entries, or continue / submit
 * anyway). Automatic submission never shows a warning and never waits for one — it goes as it is, and what wasn't
 * reviewed is noted in the period's history (reviewSummary).
 */
export const submissionPrompt = (
    review: PeriodReview,
    trigger: 'manual' | 'auto',
    ack: SubmissionAcknowledgement = {}
): SubmissionPrompt => {
    if (trigger === 'auto') return null;
    if (review.issues.length) return 'issues';
    if (review.overlaps.length && !ack.overlaps) return 'overlaps';
    if (gapCount(review) && !ack.gaps) return 'gaps';
    if (review.unlogged?.length && !ack.unlogged) return 'unlogged';
    return null;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "1 overlap · 2 gaps over 5 min · 1 entry missing details" (empty when there is nothing). */
export const reviewSummary = (r: PeriodReview) =>
    [
        r.overlaps.length && plural(r.overlaps.length, 'overlap'),
        gapCount(r) && `${plural(gapCount(r), 'gap')} over 5 min`,
        r.issues.length && `${plural(new Set(r.issues.map(i => i.entryId)).size, 'entry', 'entries')} missing details`,
    ]
        .filter(Boolean)
        .join(' · ');

// ---- day states (PROTOTYPE-SETUP: Timesheet v6, Slice 1) --------------------------------------------------------

/** The states that are an approval concept: with approval off, only leave shows. */
export const dayState = (input: {
    date: string;
    hasEntries: boolean;
    /** Approved full-day or half-day leave. */
    onLeave: boolean;
    /** Weekly off or holiday (keeps its grey unless something else applies). */
    offDay: boolean;
    approvalEnabled: boolean;
    period: Pick<TimesheetWeek, 'status' | 'dirtyDates' | 'submittedAt' | 'editedAfter'> | null;
}): TimesheetDayState | undefined => {
    if (input.onLeave) return 'leave';
    const p = input.period;
    if (!input.approvalEnabled || !p) return undefined;
    if (p.dirtyDates?.includes(input.date)) return 'saved';
    const everSent = Boolean(p.submittedAt || p.editedAfter);
    if (input.hasEntries && !everSent) return 'saved';
    if (p.status === 'SENT_BACK' && !input.offDay) return 'update';
    const sent = p.status === 'SUBMITTED' || p.status === 'WITH_PAYROLL' || p.status === 'APPROVED' || (p.status === 'DRAFT' && Boolean(p.editedAfter));
    if (input.hasEntries && sent) return 'submitted';
    return undefined;
};

/** Adds the dates to a period's changed-since-submission set (sorted, no repeats). */
export const markDirty = (dirty: string[] | undefined, dates: string[]) => [...new Set([...(dirty ?? []), ...dates])].sort();
