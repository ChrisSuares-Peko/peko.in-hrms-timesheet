// PROTOTYPE-SETUP: ESS Service 1 — every Attendance & Timesheet business rule, in one pure module.
// No store, no React, no dates "now" unless passed in: callers (mock layer, screens) give the inputs and use
// the results, so the same rule applies everywhere. Unit tests: ./__tests__/attendance.test.ts.
import type {
    ApprovalStatus,
    ApprovalTrail,
    ApprovalType,
    ApproverRole,
    AtsMode,
    AtsSettings,
    AtsTab,
    AttendanceDay,
    ChangeRequest,
    DayStatus,
    DayWindow,
    OutsideCheckInFlag,
    OvertimeBasis,
    OvertimeInput,
    TimesheetEditMode,
    TimesheetEntry,
    TimesheetStatus,
    Weekday,
} from '@src/domains/attendanceTimesheet/types';

// ---- errors -------------------------------------------------------------------------------------------------

/** A rule was broken. `status` is the HTTP status the mock layer answers with. */
export class RuleError extends Error {
    constructor(
        message: string,
        public readonly status = 409
    ) {
        super(message);
    }
}

// ---- time & dates -----------------------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

/** "09:30" → 570 */
export const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + (m || 0);
};

/** 570 → "09:30" (clamped to 00:00–23:59) */
export const fromMinutes = (minutes: number) => {
    const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
    return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

/** "09:30" → "9:30" */
export const displayTime = (hhmm: string) => hhmm.replace(/^0(\d)/, '$1');

/** 390 → "6h 30m", 360 → "6h", 45 → "45m", 0 → "0m" */
export const formatDuration = (minutes: number) => {
    const total = Math.max(0, Math.round(minutes));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (!h) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
};

const parseIso = (iso: string) => {
    const [y, mo, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, mo - 1, d);
};
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const addDays = (iso: string, days: number) => {
    const d = parseIso(iso);
    d.setDate(d.getDate() + days);
    return toIso(d);
};

export const WEEKDAYS: Weekday[] = [
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
];

export const weekdayOf = (iso: string): Weekday => WEEKDAYS[(parseIso(iso).getDay() + 6) % 7];

/** Weeks run Monday–Sunday. */
export const weekStartOf = (iso: string) => addDays(iso, -((parseIso(iso).getDay() + 6) % 7));

export const weekDates = (weekStart: string) => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

export const monthOf = (iso: string) => iso.slice(0, 7);

export const monthBounds = (month: string) => {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return { first: `${month}-01`, last: `${month}-${pad(last)}` };
};

export const monthDates = (month: string) => {
    const { first, last } = monthBounds(month);
    const days: string[] = [];
    let d = first;
    while (d <= last) {
        days.push(d);
        d = addDays(d, 1);
    }
    return days;
};

/** Every Monday whose week overlaps the month. */
export const weeksOverlappingMonth = (month: string) => {
    const { first, last } = monthBounds(month);
    const weeks: string[] = [];
    let ws = weekStartOf(first);
    while (ws <= last) {
        weeks.push(ws);
        ws = addDays(ws, 7);
    }
    return weeks;
};

export const addMonths = (month: string, delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

// ---- settings & modes ---------------------------------------------------------------------------------------

export const DEFAULT_SETTINGS: AtsSettings = {
    mode: 'both',
    shift: { start: '09:30', end: '18:30' },
    breakMinutes: 60,
    graceMinutes: 10,
    halfDayThresholdMinutes: 4 * 60,
    overtimeMinimumMinutes: 30,
    weeklyOff: ['SATURDAY', 'SUNDAY'],
    timesheetApproval: { enabled: true, submissionWeekday: 'FRIDAY' },
    level2: { attendance: 'HR', overtime: 'FINANCE', timesheet: 'NONE', leave: 'HR', reimbursement: 'FINANCE' },
    updatedAt: '',
};

/** Shift length, break included (09:30–18:30 = 540). */
export const shiftMinutes = (s: Pick<AtsSettings, 'shift'>) => toMinutes(s.shift.end) - toMinutes(s.shift.start);

/** The working part of the shift (shift − break). */
export const workMinutes = (s: Pick<AtsSettings, 'shift' | 'breakMinutes'>) =>
    Math.max(0, shiftMinutes(s) - s.breakMinutes);

/** attendance: Attendance + Overtime. both: all three. timesheet: Timesheet + Overtime. */
export const tabsFor = (mode: AtsMode): AtsTab[] => {
    if (mode === 'attendance') return ['attendance', 'overtime'];
    if (mode === 'timesheet') return ['timesheet', 'overtime'];
    return ['attendance', 'timesheet', 'overtime'];
};

export const titleFor = (mode: AtsMode) => {
    if (mode === 'attendance') return 'Attendance';
    if (mode === 'timesheet') return 'Timesheet';
    return 'Attendance & Timesheet';
};

export const hasCheckIn = (mode: AtsMode) => mode !== 'timesheet';
export const hasTimesheets = (mode: AtsMode) => mode !== 'attendance';

export const overtimeBasisFor = (mode: AtsMode): OvertimeBasis =>
    mode === 'timesheet' ? 'timesheet' : 'attendance';

export const isWeeklyOff = (date: string, s: Pick<AtsSettings, 'weeklyOff'>) => s.weeklyOff.includes(weekdayOf(date));

// ---- attendance ---------------------------------------------------------------------------------------------

/**
 * Auto check-out: a past day with a check-in but no check-out closes at shift end, marked "auto".
 * (If the check-in was after shift end, the day closes at the check-in time.)
 */
export const effectiveCheckOut = (input: {
    date: string;
    today: string;
    checkIn: string | null;
    checkOut: string | null;
    settings: Pick<AtsSettings, 'shift'>;
}) => {
    if (input.checkOut) return { checkOut: input.checkOut, auto: false };
    if (input.checkIn && input.date < input.today) {
        const end = Math.max(toMinutes(input.checkIn), toMinutes(input.settings.shift.end));
        return { checkOut: fromMinutes(end), auto: true };
    }
    return { checkOut: null, auto: false };
};

export interface DayInput {
    date: string;
    today: string;
    /** Minutes since midnight now — only used for today's time-at-work while on the clock. */
    nowMinutes?: number;
    checkIn: string | null;
    checkOut: string | null;
    settings: Pick<AtsSettings, 'shift' | 'graceMinutes' | 'halfDayThresholdMinutes' | 'weeklyOff'>;
    holidayName?: string;
    /** Full-day approved leave, e.g. "Casual Leave". */
    leaveName?: string;
}

export type DerivedDay = Pick<
    AttendanceDay,
    'status' | 'checkIn' | 'checkOut' | 'checkOutAuto' | 'minutesAtWork' | 'lateMinutes' | 'label'
> & { isOffDay: boolean };

/**
 * Day status:
 * On leave → On leave. Holiday / weekly off → Holiday / Weekly off, or "Worked on weekly off/holiday" if
 * checked in. No check-in → Absent (past), not checked in (today), upcoming (future).
 * Otherwise: Half day if the (completed) time at work is under the threshold; Late if check-in is after shift
 * start + grace; else Present.
 */
export const deriveDay = (input: DayInput): DerivedDay => {
    const { date, today, settings } = input;
    const off = input.holidayName ? 'holiday' : isWeeklyOff(date, settings) && 'weekly-off';
    const { checkOut, auto } = effectiveCheckOut(input);
    const base = { checkIn: input.checkIn, checkOut, checkOutAuto: auto, isOffDay: !!off };
    const atWork = (() => {
        if (!input.checkIn) return 0;
        if (checkOut) return Math.max(0, toMinutes(checkOut) - toMinutes(input.checkIn));
        if (date === today && input.nowMinutes !== undefined) {
            return Math.max(0, input.nowMinutes - toMinutes(input.checkIn));
        }
        return 0;
    })();

    if (input.leaveName && !input.checkIn) {
        return { ...base, status: 'on-leave', minutesAtWork: 0, lateMinutes: 0, label: input.leaveName };
    }
    if (off) {
        const label = off === 'holiday' ? input.holidayName : 'Weekly off';
        if (input.checkIn) {
            return {
                ...base,
                status: 'worked-off-day',
                minutesAtWork: atWork,
                lateMinutes: 0,
                label: `Worked on ${off === 'holiday' ? 'holiday' : 'weekly off'}`,
            };
        }
        return { ...base, status: off, minutesAtWork: 0, lateMinutes: 0, label };
    }
    if (!input.checkIn) {
        let status: DayStatus = 'absent';
        if (date === today) status = 'not-checked-in';
        if (date > today) status = 'upcoming';
        return { ...base, status, minutesAtWork: 0, lateMinutes: 0 };
    }
    const lateBy = toMinutes(input.checkIn) - toMinutes(settings.shift.start);
    const lateMinutes = lateBy > settings.graceMinutes ? lateBy : 0;
    const completed = !!checkOut;
    let status: DayStatus = lateMinutes ? 'late' : 'present';
    if (completed && atWork < settings.halfDayThresholdMinutes) status = 'half-day';
    return { ...base, status, minutesAtWork: atWork, lateMinutes };
};

// ---- overtime -----------------------------------------------------------------------------------------------

/**
 * Overtime = time beyond the standard day, whatever time someone checked in.
 * attendance / both: (check-out − check-in) − shift length (the shift includes the break).
 * timesheet: hours logged − (shift length − break).
 * Weekly offs and holidays: all time worked counts.
 */
export const overtimeMinutes = (input: {
    mode: AtsMode;
    settings: Pick<AtsSettings, 'shift' | 'breakMinutes'>;
    isOffDay: boolean;
    checkIn: string | null;
    checkOut: string | null;
    loggedMinutes: number;
}) => {
    if (overtimeBasisFor(input.mode) === 'timesheet') {
        return input.isOffDay
            ? input.loggedMinutes
            : Math.max(0, input.loggedMinutes - workMinutes(input.settings));
    }
    if (!input.checkIn || !input.checkOut) return 0;
    const worked = Math.max(0, toMinutes(input.checkOut) - toMinutes(input.checkIn));
    return input.isOffDay ? worked : Math.max(0, worked - shiftMinutes(input.settings));
};

/** Suggest overtime only for past days, extra ≥ the HR minimum, and no request for that day yet. */
export const shouldSuggestOvertime = (input: {
    date: string;
    today: string;
    extraMinutes: number;
    minimumMinutes: number;
    hasRequest: boolean;
}) => input.date < input.today && !input.hasRequest && input.extraMinutes >= input.minimumMinutes;

/** worked: date today or earlier. planned: today or later, with the work described. */
export const validateOvertimeInput = (input: OvertimeInput, today: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new RuleError('Pick a valid date.', 400);
    if (!(input.minutes > 0) || input.minutes > 16 * 60) {
        throw new RuleError('Enter the extra time (more than 0, up to 16 hours).', 400);
    }
    if (input.kind === 'worked' && input.date > today) {
        throw new RuleError('Worked overtime can only be for today or earlier — use Plan overtime for a future date.', 400);
    }
    if (input.kind === 'planned') {
        if (input.date < today) {
            throw new RuleError('Planned overtime must be for today or later — use Request overtime for a past day.', 400);
        }
        if (!input.description?.trim()) throw new RuleError('Describe the work you plan to do.', 400);
    }
};

// ---- timesheet entries ----------------------------------------------------------------------------------
// PROTOTYPE-SETUP (ESS Service 1, V2): entries are timed (start + end) or hours-only (start = end = null, mins
// as entered). Hours-only entries count in every total but never overlap, never fall "outside check-in" and
// aren't drawn on a time bar.

/** A timed entry has both times. */
export const isTimed = <E extends Pick<TimesheetEntry, 'start' | 'end'>>(e: E): e is E & { start: string; end: string } =>
    Boolean(e.start && e.end);

/** Minutes of an entry: end − start when timed, otherwise the minutes entered. */
export const entryMins = (e: Pick<TimesheetEntry, 'start' | 'end' | 'mins'>) =>
    isTimed(e) ? Math.max(0, toMinutes(e.end) - toMinutes(e.start)) : Math.max(0, Math.round(e.mins ?? 0));

/** @deprecated alias kept for existing callers — use entryMins. */
export const entryMinutes = entryMins;

export const loggedMinutesOn = (entries: TimesheetEntry[], date: string) =>
    entries.filter(e => e.date === date).reduce((s, e) => s + entryMins(e), 0);

/** By date, then timed entries by start, then hours-only entries (in their original order). */
export const sortEntries = <E extends Pick<TimesheetEntry, 'date' | 'start' | 'end'>>(list: E[]) =>
    list
        .map((e, i) => ({ e, i }))
        .sort((a, b) => {
            if (a.e.date !== b.e.date) return a.e.date.localeCompare(b.e.date);
            const ta = isTimed(a.e);
            const tb = isTimed(b.e);
            if (ta && tb) return (a.e.start ?? '').localeCompare(b.e.start ?? '') || a.i - b.i;
            if (ta !== tb) return ta ? -1 : 1;
            return a.i - b.i;
        })
        .map(x => x.e);

/** Two timed entries on the same day that share time. Hours-only entries never overlap. */
export const entriesOverlap = (
    a: Pick<TimesheetEntry, 'date' | 'start' | 'end'>,
    b: Pick<TimesheetEntry, 'date' | 'start' | 'end'>
) =>
    a.date === b.date &&
    isTimed(a) &&
    isTimed(b) &&
    toMinutes(a.start) < toMinutes(b.end) &&
    toMinutes(b.start) < toMinutes(a.end);

export const findOverlap = <E extends TimesheetEntry>(
    entries: E[],
    candidate: Pick<TimesheetEntry, 'date' | 'start' | 'end'> & { id?: string }
) => entries.find(e => e.id !== candidate.id && entriesOverlap(e, candidate));

/**
 * Reads an hours value: "1:30", "1.5", "1,5", "1h 30m", "1h", "90m", "2". Returns minutes, or null when it
 * can't be read. (Zero comes back as 0 — validateEntry rejects it with its own message.)
 */
export const parseHours = (text: string | null | undefined): number | null => {
    const t = (text ?? '').trim().toLowerCase();
    if (!t) return null;
    const colon = /^(\d{1,2}):([0-5]\d)$/.exec(t);
    if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
    const decimal = /^(\d{1,2}(?:[.,]\d{1,2})?)\s*h?$/.exec(t);
    if (decimal) return Math.round(Number(decimal[1].replace(',', '.')) * 60);
    const hm = /^(?:(\d{1,2})\s*h(?:rs?|ours?)?)?\s*(?:(\d{1,4})\s*m(?:ins?)?)?$/.exec(t);
    if (hm && (hm[1] || hm[2])) return Number(hm[1] ?? 0) * 60 + Number(hm[2] ?? 0);
    return null;
};

/** 90 → "1:30" (the form's Hours field). */
export const formatHoursInput = (mins: number) => `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;

const MAX_DAY_MINUTES = 24 * 60;
const HHMM_RE = /^\d{2}:\d{2}$/;

/**
 * Validation messages — the prototype's wording (docs/prototypes/attendance-timesheet.html), plus two of ours:
 * `missing` (nothing entered at all) and `pastMidnight` (start + hours would run past midnight).
 */
export const ENTRY_MESSAGES = {
    date: 'Pick a valid date.',
    time: 'Enter times as HH:mm.',
    endWithoutStart: 'Add a start time too, or clear the end time.',
    endBeforeStart: 'End time must be after the start time.',
    startWithoutEnd: 'Add an end time or the hours.',
    unreadableHours: 'Write hours like 1:30, 1.5 or 1h 30m.',
    zeroHours: 'Add the hours worked, or a start and end time.',
    missing: 'Enter a start and end time, or just the hours.',
    over24: 'One entry can’t be more than 24 hours.',
    pastMidnight: 'This entry would run past midnight. Split it across two days.',
    description: 'Describe what you worked on.',
    dayOver24: 'That takes the day over 24 hours.',
} as const;

/** "Overlaps with 09:00–12:00 (Code review)." */
export const overlapMessage = (clash: { start: string; end: string; description: string }) =>
    `Overlaps with ${clash.start}–${clash.end} (${clash.description}).`;

/**
 * Validates and normalises an entry, checking in the prototype's order. Start + end → mins = end − start (the
 * hours field is ignored); start + hours → end = start + hours; hours alone → hours-only.
 * Order: end without start · end before start · start without end or hours · unreadable hours · zero hours ·
 * over 24h · past midnight · description · day over 24h · overlap with another timed entry.
 * `others` = the day's (or week's) entries; the edited entry itself is skipped by id. `hoursText` is what the
 * user typed in Hours (or pass `mins`).
 */
export const validateEntry = (
    input: {
        date: string;
        start?: string | null;
        end?: string | null;
        mins?: number | null;
        hoursText?: string;
        description: string;
        id?: string;
    },
    others: TimesheetEntry[]
): Omit<TimesheetEntry, 'id'> => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? '')) throw new RuleError(ENTRY_MESSAGES.date, 400);
    const start = input.start || null;
    const typedEnd = input.end || null;
    if ((start && !HHMM_RE.test(start)) || (typedEnd && !HHMM_RE.test(typedEnd))) {
        throw new RuleError(ENTRY_MESSAGES.time, 400);
    }
    if (typedEnd && !start) throw new RuleError(ENTRY_MESSAGES.endWithoutStart, 400);
    if (start && typedEnd && toMinutes(typedEnd) <= toMinutes(start)) throw new RuleError(ENTRY_MESSAGES.endBeforeStart, 400);

    const text = input.hoursText?.trim() ?? '';
    let hours: number | null = input.mins ?? null;
    if (text) hours = parseHours(text);
    const timed = Boolean(start && typedEnd);
    if (!timed) {
        if (start && !text && input.mins == null) throw new RuleError(ENTRY_MESSAGES.startWithoutEnd, 400);
        if (text && hours === null) throw new RuleError(ENTRY_MESSAGES.unreadableHours, 400);
        if (!start && !text && input.mins == null) throw new RuleError(ENTRY_MESSAGES.missing, 400);
    }
    const minutes = timed ? toMinutes(typedEnd as string) - toMinutes(start as string) : (hours ?? 0);
    if (!Number.isFinite(minutes) || minutes <= 0) throw new RuleError(ENTRY_MESSAGES.zeroHours, 400);
    if (minutes > MAX_DAY_MINUTES) throw new RuleError(ENTRY_MESSAGES.over24, 400);
    if (start && !timed && toMinutes(start) + minutes > MAX_DAY_MINUTES) throw new RuleError(ENTRY_MESSAGES.pastMidnight, 400);
    const description = input.description?.trim() ?? '';
    if (!description) throw new RuleError(ENTRY_MESSAGES.description, 400);

    const sameDay = others.filter(o => o.date === input.date && o.id !== input.id);
    if (sameDay.reduce((sum, o) => sum + entryMins(o), 0) + minutes > MAX_DAY_MINUTES) {
        throw new RuleError(ENTRY_MESSAGES.dayOver24, 400);
    }
    const end = start ? typedEnd ?? fromMinutes(toMinutes(start) + minutes) : null;
    const clash = findOverlap(sameDay, { id: input.id, date: input.date, start, end });
    if (clash && isTimed(clash)) throw new RuleError(overlapMessage(clash));
    return { date: input.date, start, end, mins: Math.round(minutes), description };
};

// ---- expected hours -----------------------------------------------------------------------------------

/**
 * Expected minutes for a day — the single rule behind totals, unlogged hours, the team grid and payroll.
 * See docs/api/attendance-timesheet.md ("Expected hours") for the eight edge cases.
 *   attendance-only mode, or before the joining date ............................. 0
 *   weekly off, holiday, full-day leave (status on-leave), worked on an off day .. 0
 *   timesheet-only mode .......................................................... shift − break
 *   both mode, checked in ............................... (check-out − check-in) − break, never below 0
 *       (still on the clock today → check-out = shift end; an auto check-out is the shift end;
 *        approved leave but checked in, or half-day leave → the check-in window applies)
 *   both mode, no check-in, today or later ...................................... shift − break
 *   both mode, no check-in, past working day (absent) ........................... 0 (absence shows in Attendance)
 */
export const expectedMinutes = (input: {
    mode: AtsMode;
    settings: Pick<AtsSettings, 'shift' | 'breakMinutes'>;
    day: Pick<AttendanceDay, 'date' | 'status' | 'checkIn' | 'checkOut'>;
    today: string;
    dateOfJoin?: string;
}) => {
    const { mode, settings, day } = input;
    const span = (start: string, end: string) => Math.max(0, toMinutes(end) - toMinutes(start) - settings.breakMinutes);
    if (mode === 'attendance') return 0;
    if (input.dateOfJoin && day.date < input.dateOfJoin) return 0;
    if (['on-leave', 'holiday', 'weekly-off', 'worked-off-day'].includes(day.status)) return 0;
    if (mode === 'timesheet') return span(settings.shift.start, settings.shift.end);
    if (day.checkIn) return span(day.checkIn, day.checkOut ?? settings.shift.end);
    if (day.date < input.today) return 0;
    return span(settings.shift.start, settings.shift.end);
};

/**
 * The day's timesheet window.
 * timesheet mode: the shift. both mode: check-in → check-out (auto check-out included); today while on the
 * clock runs to shift end; no check-in yet (today / future) falls back to the shift; a past day without a
 * check-in has no window. Leave, holidays and weekly offs have no window (time logged there still counts).
 */
export const dayWindow = (input: {
    mode: AtsMode;
    settings: Pick<AtsSettings, 'shift' | 'breakMinutes'>;
    day: Pick<AttendanceDay, 'date' | 'status' | 'checkIn' | 'checkOut' | 'checkOutAuto' | 'label'>;
    today: string;
    dateOfJoin?: string;
}): DayWindow => {
    const { mode, settings, day } = input;
    const shiftLabel = `Shift ${displayTime(settings.shift.start)}–${displayTime(settings.shift.end)}`;
    const expected = expectedMinutes(input);
    const offOrLeave = ['on-leave', 'holiday', 'weekly-off'].includes(day.status);

    if (mode === 'attendance') return { kind: 'none', label: 'Timesheets are off', expectedMinutes: 0 };
    if (input.dateOfJoin && day.date < input.dateOfJoin) return { kind: 'none', label: 'Before joining', expectedMinutes: 0 };
    if (mode === 'timesheet') {
        if (offOrLeave || day.status === 'worked-off-day') {
            return { kind: 'none', label: day.label ?? 'No working hours', expectedMinutes: 0 };
        }
        return { kind: 'shift', start: settings.shift.start, end: settings.shift.end, label: shiftLabel, expectedMinutes: expected };
    }
    // both
    if (day.checkIn) {
        const end = day.checkOut ?? settings.shift.end;
        let label = `Checked in ${displayTime(day.checkIn)} – not checked out yet`;
        if (day.checkOut) {
            label = day.checkOutAuto
                ? `Checked in ${displayTime(day.checkIn)} – auto check-out ${displayTime(day.checkOut)}`
                : `Checked in ${displayTime(day.checkIn)} – out ${displayTime(day.checkOut)}`;
        }
        return { kind: 'attendance', start: day.checkIn, end, label, checkOutAuto: day.checkOutAuto, expectedMinutes: expected };
    }
    if (offOrLeave) return { kind: 'none', label: day.label ?? 'No working hours', expectedMinutes: 0 };
    if (day.date >= input.today) {
        return { kind: 'shift', start: settings.shift.start, end: settings.shift.end, label: `${shiftLabel} · not checked in yet`, expectedMinutes: expected };
    }
    return { kind: 'none', label: 'No check-in', expectedMinutes: 0 };
};

/**
 * 'both' mode: entries outside check-in / check-out are flagged "logged outside check-in hours". The flag
 * offers an attendance correction pre-filled from the entries — or "Update check-out" on an auto-closed day
 * when the entries run past the auto check-out. Never overtime.
 */
export const outsideCheckInFlag = (input: {
    mode: AtsMode;
    day: Pick<AttendanceDay, 'date' | 'status' | 'checkIn' | 'checkOut' | 'checkOutAuto'>;
    entries: TimesheetEntry[];
}): OutsideCheckInFlag | undefined => {
    if (input.mode !== 'both') return undefined;
    const dayEntries = input.entries.filter(e => e.date === input.day.date);
    if (!dayEntries.length) return undefined;
    const { checkIn, checkOut } = input.day;
    if (['on-leave', 'holiday', 'weekly-off', 'upcoming', 'not-checked-in'].includes(input.day.status)) return undefined;
    // Only timed entries can be outside check-in hours — hours-only entries have no times.
    const timed = dayEntries.filter(isTimed);
    const earliest = timed.length ? Math.min(...timed.map(e => toMinutes(e.start))) : null;
    const latest = timed.length ? Math.max(...timed.map(e => toMinutes(e.end))) : null;
    if (!checkIn) {
        // A past day with time logged (timed or hours-only) but no check-in: prompt a correction, pre-filled
        // from the timed entries when there are any.
        return {
            entryIds: dayEntries.map(e => e.id),
            action: 'request-correction',
            suggested: {
                checkIn: earliest === null ? null : fromMinutes(earliest),
                checkOut: latest === null ? null : fromMinutes(latest),
            },
        };
    }
    if (!checkOut) return undefined; // today, still on the clock
    const outside = timed.filter(e => toMinutes(e.start) < toMinutes(checkIn) || toMinutes(e.end) > toMinutes(checkOut));
    if (!outside.length || earliest === null || latest === null) return undefined;
    const afterOut = latest > toMinutes(checkOut);
    const beforeIn = earliest < toMinutes(checkIn);
    if (input.day.checkOutAuto && afterOut && !beforeIn) {
        return {
            entryIds: outside.map(e => e.id),
            action: 'update-check-out',
            suggested: { checkIn, checkOut: fromMinutes(latest) },
        };
    }
    return {
        entryIds: outside.map(e => e.id),
        action: 'request-correction',
        suggested: {
            checkIn: beforeIn ? fromMinutes(earliest) : checkIn,
            checkOut: afterOut ? fromMinutes(latest) : checkOut,
        },
    };
};

// ---- change diff --------------------------------------------------------------------------------------------

export interface EntryDiff {
    added: TimesheetEntry[];
    removed: TimesheetEntry[];
    edited: { before: TimesheetEntry; after: TimesheetEntry }[];
}

/** Compares date, start, end, minutes and description. */
const sameEntry = (a: TimesheetEntry, b: TimesheetEntry) =>
    a.date === b.date &&
    a.start === b.start &&
    a.end === b.end &&
    entryMins(a) === entryMins(b) &&
    a.description === b.description;

export const diffEntries = (base: TimesheetEntry[], proposed: TimesheetEntry[]): EntryDiff => {
    const byId = new Map(base.map(e => [e.id, e]));
    const ids = new Set(proposed.map(e => e.id));
    return {
        added: proposed.filter(e => !byId.has(e.id)),
        removed: base.filter(e => !ids.has(e.id)),
        edited: proposed
            .filter(e => byId.has(e.id) && !sameEntry(byId.get(e.id)!, e))
            .map(after => ({ before: byId.get(after.id)!, after })),
    };
};

export const diffSummary = (d: EntryDiff) =>
    [
        d.added.length && `${d.added.length} added`,
        d.edited.length && `${d.edited.length} edited`,
        d.removed.length && `${d.removed.length} removed`,
    ]
        .filter(Boolean)
        .join(' · ') || 'no changes';

/** Dates a change touches (added, removed or edited entries — old and new dates). */
export const datesTouched = (d: EntryDiff) =>
    [
        ...new Set([
            ...d.added.map(e => e.date),
            ...d.removed.map(e => e.date),
            ...d.edited.flatMap(x => [x.before.date, x.after.date]),
        ]),
    ].sort();

// ---- locks (payroll processed) ----------------------------------------------------------------------------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-09" → "September 2026" */
export const monthLabel = (month: string) => {
    const [y, m] = month.split('-').map(Number);
    return `${MONTHS[m - 1]} ${y}`;
};

/** Once payroll is processed for a month, its days are read-only everywhere. */
export const isLocked = (date: string, processedMonths: string[]) => processedMonths.includes(monthOf(date));

export const lockReasonFor = (date: string) =>
    `Payroll for ${monthLabel(monthOf(date))} has been processed — this day is read-only.`;

/** A change request touching a locked day can't be approved. Returns why, or null. */
export const changeRequestBlockedReason = (
    cr: Pick<ChangeRequest, 'baseEntries' | 'proposedEntries'>,
    processedMonths: string[]
) => {
    const locked = datesTouched(diffEntries(cr.baseEntries, cr.proposedEntries)).filter(d =>
        isLocked(d, processedMonths)
    );
    if (!locked.length) return null;
    return `It changes ${locked.length === 1 ? 'a day' : 'days'} in ${[...new Set(locked.map(d => monthLabel(monthOf(d))))].join(' and ')}, whose payroll has already been processed.`;
};

// ---- timesheet lifecycle --------------------------------------------------------------------------------

/**
 * With approval off, weeks are just recorded and editable until payroll is processed. With approval on:
 * Draft / Submitted / Sent back edit directly (a submitted week just updates); an Approved week is edited
 * through a change request. A week whose days are all locked is locked.
 */
export const editModeFor = (input: {
    approvalEnabled: boolean;
    status: TimesheetStatus;
    allDaysLocked: boolean;
    readOnly?: boolean;
}): TimesheetEditMode => {
    if (input.readOnly) return 'read-only';
    if (input.allDaysLocked) return 'locked';
    if (!input.approvalEnabled) return 'direct';
    return input.status === 'APPROVED' ? 'change-request' : 'direct';
};

/**
 * PROTOTYPE-SETUP (V2): timesheets go out on the submission day only (weeksDueForSubmission). The employee's one
 * manual action is resubmitting a week the manager sent back.
 */
export const canSubmitWeek = (input: { approvalEnabled: boolean; status: TimesheetStatus; allDaysLocked: boolean }) =>
    input.approvalEnabled && !input.allDaysLocked && input.status === 'SENT_BACK';

export const isSubmissionDay = (today: string, s: Pick<AtsSettings, 'timesheetApproval'>) =>
    s.timesheetApproval.enabled && weekdayOf(today) === s.timesheetApproval.submissionWeekday;

/** On the submission weekday every open week (Draft) up to and including this week goes to the manager. */
export const weeksDueForSubmission = <W extends { weekStart: string; status: TimesheetStatus }>(
    weeks: W[],
    today: string
) => weeks.filter(w => w.status === 'DRAFT' && w.weekStart <= weekStartOf(today));

/** The CEO has no manager: their timesheets are auto-approved. */
export const timesheetAutoApproved = (managerId: number | null | undefined) => !managerId;

// ---- payroll blockers ---------------------------------------------------------------------------------------

/**
 * With approval on, payroll for a month can't be processed until every week overlapping it is Approved
 * (an approved week with a pending change still counts as approved). Returns the blocking weeks.
 */
export const payrollBlockers = <E extends { id: number; dateOfJoin: string }>(input: {
    month: string;
    approvalEnabled: boolean;
    employees: E[];
    statusOf: (employeeId: number, weekStart: string) => TimesheetStatus;
}) => {
    if (!input.approvalEnabled) return [];
    const { last } = monthBounds(input.month);
    const weeks = weeksOverlappingMonth(input.month);
    return input.employees
        .filter(e => e.dateOfJoin <= last)
        .flatMap(e =>
            weeks
                .filter(ws => addDays(ws, 6) >= e.dateOfJoin)
                .map(ws => ({ employee: e, weekStart: ws, status: input.statusOf(e.id, ws) }))
                .filter(x => x.status !== 'APPROVED')
        );
};

// ---- approval chain -----------------------------------------------------------------------------------------

/**
 * Level 1 is always the reporting manager; level 2 per HR settings (timesheets: none). The CEO has no
 * manager: level 1 is skipped and the request goes straight to level 2 (or is approved if there is none).
 */
export const startTrail = (
    type: ApprovalType,
    manager: { id: number; name: string } | null,
    settings: Pick<AtsSettings, 'level2'>
): ApprovalTrail => {
    const l2 = type === 'timesheet' ? 'NONE' : settings.level2[type];
    const steps: ApprovalTrail['steps'] = [
        manager
            ? { level: 1, role: 'MANAGER', approverId: manager.id, approverName: manager.name }
            : { level: 1, role: 'MANAGER', skipped: true },
    ];
    if (l2 !== 'NONE') steps.push({ level: 2, role: l2 });
    return { type, status: nextStatus(steps), steps };
};

/** The first undecided, non-skipped step decides the status. */
export function nextStatus(steps: ApprovalTrail['steps']): ApprovalStatus {
    if (steps.some(s => s.decision === 'REJECTED')) return 'REJECTED';
    const pending = steps.find(s => !s.decision && !s.skipped);
    if (!pending) return 'APPROVED';
    if (pending.role === 'MANAGER') return 'PENDING_MANAGER';
    return pending.role === 'HR' ? 'PENDING_HR' : 'PENDING_FINANCE';
}

/** The role a trail is waiting for, if any. */
export const awaiting = (trail: ApprovalTrail): ApproverRole | null => {
    if (trail.status === 'PENDING_MANAGER') return 'MANAGER';
    if (trail.status === 'PENDING_HR') return 'HR';
    if (trail.status === 'PENDING_FINANCE') return 'FINANCE';
    return null;
};

/** Decide at the pending level. Rejecting needs a comment. */
export const decide = (
    trail: ApprovalTrail,
    actingAs: ApproverRole,
    decision: 'APPROVED' | 'REJECTED',
    comment: string | undefined,
    at: string
): ApprovalTrail => {
    if (awaiting(trail) !== actingAs) {
        throw new RuleError('This request is no longer waiting for your decision — refresh the list.');
    }
    const note = comment?.trim();
    if (decision === 'REJECTED' && !note) throw new RuleError('Add a comment explaining why.', 400);
    let applied = false;
    const steps = trail.steps.map(s => {
        if (applied || s.decision || s.skipped) return s;
        applied = true;
        return { ...s, decision, at, ...(note ? { comment: note } : {}) };
    });
    return { ...trail, status: nextStatus(steps), steps };
};

export const cancelTrail = (trail: ApprovalTrail): ApprovalTrail => {
    if (!awaiting(trail)) throw new RuleError('Only pending requests can be cancelled.');
    return { ...trail, status: 'CANCELLED' };
};

export const requestState = (trail: ApprovalTrail) => {
    if (trail.status === 'APPROVED') return 'approved' as const;
    if (trail.status === 'REJECTED') return 'rejected' as const;
    if (trail.status === 'CANCELLED') return 'cancelled' as const;
    return 'pending' as const;
};

/** "With manager (Arjun Mehta)", "With HR", "With Finance", "Approved", "Rejected", "Cancelled". */
export const trailLabel = (trail: ApprovalTrail) => {
    switch (trail.status) {
        case 'PENDING_MANAGER': {
            const name = trail.steps[0]?.approverName;
            return name ? `With manager (${name})` : 'With manager';
        }
        case 'PENDING_HR':
            return 'With HR';
        case 'PENDING_FINANCE':
            return 'With Finance';
        case 'APPROVED':
            return 'Approved';
        case 'CANCELLED':
            return 'Cancelled';
        default:
            return 'Rejected';
    }
};

// ---- team today -------------------------------------------------------------------------------------------

export const teamTodayCounts = (statuses: DayStatus[]) => ({
    checkedIn: statuses.filter(s => ['present', 'late', 'half-day', 'worked-off-day'].includes(s)).length,
    late: statuses.filter(s => s === 'late').length,
    notCheckedIn: statuses.filter(s => s === 'not-checked-in' || s === 'absent').length,
    onLeave: statuses.filter(s => s === 'on-leave').length,
});

/** Human labels for day statuses. */
export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
    present: 'Present',
    late: 'Late',
    'half-day': 'Half day',
    absent: 'Absent',
    'on-leave': 'On leave',
    holiday: 'Holiday',
    'weekly-off': 'Weekly off',
    'worked-off-day': 'Worked on weekly off/holiday',
    'not-checked-in': 'Not checked in',
    upcoming: 'Upcoming',
};
