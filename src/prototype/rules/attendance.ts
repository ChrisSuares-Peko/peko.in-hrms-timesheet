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
    AttendanceBreak,
    AttendanceDay,
    DayStatus,
    DayWindow,
    OutsideCheckInFlag,
    OvertimeBasis,
    OvertimeInput,
    PersonalDetails,
    PersonalField,
    ProfileChange,
    TimesheetEditMode,
    TimesheetEntry,
    LeaveHalf,
    LeavePolicy,
    LocationStamp,
    WorkLocation,
    TimesheetFields,
    TimesheetFilingSettings,
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

export const MINUTES_PER_DAY = 24 * 60;

/** Any minute count → its time of day, "HH:mm" (wraps past midnight: 1500 → "01:00"). */
export const clockOf = (minutes: number) => {
    const m = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

// PROTOTYPE-SETUP (HR rules, Slice 5): every displayed time is 12-hour with AM/PM.
const twelve = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return { h: h % 12 || 12, m: pad(m), am: h % 24 < 12 };
};

/** "09:30" → "9:30 AM", "18:05" → "6:05 PM" */
export const displayTime = (hhmm: string) => {
    const t = twelve(hhmm);
    return t ? `${t.h}:${t.m} ${t.am ? 'AM' : 'PM'}` : hhmm;
};

/** Calendar cells: "09:30" → "9:30a", "18:41" → "6:41p" */
export const shortTime = (hhmm: string) => {
    const t = twelve(hhmm);
    return t ? `${t.h}:${t.m}${t.am ? 'a' : 'p'}` : hhmm;
};

/** A check-out with its day: "5:00 AM (next day)", "9:10 AM (3 days later)". */
export const displayTimeOn = (hhmm: string, days = 0) => {
    if (days === 1) return `${displayTime(hhmm)} (next day)`;
    if (days > 1) return `${displayTime(hhmm)} (${days} days later)`;
    return displayTime(hhmm);
};

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

/**
 * PROTOTYPE-SETUP (Timesheet filing): weekly filing; start and end times with a visible (calculated) duration;
 * project codes off. The suggested codes are offered when a company turns project codes on.
 */
export const DEFAULT_FILING: TimesheetFilingSettings = {
    frequency: 'WEEKLY',
    fields: { projectCode: false, startTime: true, endTime: true, duration: true },
    projectCodes: ['PAY-101', 'INV-220', 'NTF-310', 'ENG-OPS', 'SAL-120', 'OPS-210', 'FIN-300', 'HR-110', 'LDR-001'],
};

// PROTOTYPE-SETUP (Final batch, Slice 1): the leave policy defaults (rules: ./leavePolicy.ts).
/**
 * Annual 12 a year credited monthly, carry forward up to 30, encashed on exit; Casual 8 and Sick 6 credited upfront,
 * no carry forward, not encashed. Company leave cycle from 1 April; 6 months' probation.
 */
export const DEFAULT_LEAVE_POLICY: LeavePolicy = {
    year: 'COMPANY',
    cycleStart: '04-01',
    probationMonths: 6,
    types: {
        ANNUAL: { daysPerYear: 12, credit: 'MONTHLY', carryForward: 30, encashOnExit: true },
        CASUAL: { daysPerYear: 8, credit: 'UPFRONT', carryForward: 0, encashOnExit: false },
        SICK: { daysPerYear: 6, credit: 'UPFRONT', carryForward: 0, encashOnExit: false },
    },
};

/** Late check-ins deduct this many days by default (0 = off). */
export const DEFAULT_LATE_DEDUCTION_DAYS = 0.5;

export const DEFAULT_SETTINGS: AtsSettings = {
    mode: 'both',
    shift: { start: '09:30', end: '18:30' },
    breakMinutes: 60,
    graceMinutes: 10,
    halfDayThresholdMinutes: 4 * 60,
    overtimeMinimumMinutes: 30,
    weeklyOff: ['SATURDAY', 'SUNDAY'],
    // PROTOTYPE-SETUP (Final batch, Slice 1): auto-submit every Friday at 11:00 PM.
    timesheetApproval: { enabled: true, submissionWeekday: 'FRIDAY', submissionTime: '23:00' },
    lateDeductionDays: DEFAULT_LATE_DEDUCTION_DAYS,
    leavePolicy: DEFAULT_LEAVE_POLICY,
    // PROTOTYPE-SETUP (HR rules, Slice 1): attendance corrections and overtime go to the Payroll queue at level 2.
    // PROTOTYPE-SETUP (Final batch, Slice 1): timesheets go manager → Payroll; reimbursements manager → Admin.
    level2: { attendance: 'PAYROLL', overtime: 'PAYROLL', timesheet: 'PAYROLL', leave: 'HR', reimbursement: 'ADMIN' },
    timesheetFiling: DEFAULT_FILING,
    updatedAt: '',
};

/** Shift length, break included (09:30–18:30 = 540). */
export const shiftMinutes = (s: Pick<AtsSettings, 'shift'>) => toMinutes(s.shift.end) - toMinutes(s.shift.start);

/** attendance: Attendance + Overtime. both: all three. timesheet: Timesheet + Overtime. */
export const tabsFor = (mode: AtsMode): AtsTab[] => {
    if (mode === 'none') return [];
    if (mode === 'attendance') return ['attendance', 'overtime'];
    if (mode === 'timesheet') return ['timesheet', 'overtime'];
    return ['attendance', 'timesheet', 'overtime'];
};

export const titleFor = (mode: AtsMode) => {
    if (mode === 'attendance') return 'Attendance';
    if (mode === 'timesheet') return 'Timesheet';
    return 'Attendance & Timesheet';
};

// PROTOTYPE-SETUP (Overview v4, Slice 5): 'none' tracks nothing — no check-in, no timesheets, so no overtime.
// Stored data is kept; it just isn't shown until another mode is chosen again.
export const hasCheckIn = (mode: AtsMode) => mode === 'attendance' || mode === 'both';
export const hasTimesheets = (mode: AtsMode) => mode === 'timesheet' || mode === 'both';
/** Anything tracked at all (the Attendance & Timesheet section, overtime). */
export const hasTracking = (mode: AtsMode) => mode !== 'none';

export const overtimeBasisFor = (mode: AtsMode): OvertimeBasis =>
    mode === 'timesheet' ? 'timesheet' : 'attendance';

export const isWeeklyOff = (date: string, s: Pick<AtsSettings, 'weeklyOff'>) => s.weeklyOff.includes(weekdayOf(date));

// ---- attendance ---------------------------------------------------------------------------------------------
// PROTOTYPE-SETUP (HR rules, Slice 1): there's no automatic check-out. A session stays open until the employee
// checks out — even across days and weekends — and they can't check in on a new day while an earlier one is open.
// Overnight hours count to the check-in day: the check-out is stored with outDays (0 = same day, 1 = next day, …).

/** Under the Check in / Check out buttons. */
export const REMEMBER_CHECK_OUT_NOTE = 'Remember to check out. You can’t check in on a new day until the previous day is checked out.';

/** How far back an open (not checked out) session is looked for. */
export const OPEN_SESSION_LOOKBACK_DAYS = 60;

/** Whole days from a to b ("2026-10-09" → "2026-10-12" = 3). */
export const daysBetween = (a: string, b: string) =>
    Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / (24 * 60 * 60 * 1000));

/** A check-out as minutes from the check-in day's midnight (past 1440 on a later day). */
export const checkOutMinutes = (checkOut: string, outDays = 0) => toMinutes(checkOut) + outDays * MINUTES_PER_DAY;

/**
 * Hours worked: the full time from check-in to check-out, breaks included. While still checked in, until now
 * (`nowAbs` = minutes from the check-in day's midnight); without it, 0.
 */
export const workedMinutes = (input: { checkIn: string | null; checkOut: string | null; outDays?: number; nowAbs?: number }) => {
    if (!input.checkIn) return 0;
    const start = toMinutes(input.checkIn);
    if (input.checkOut) return Math.max(0, checkOutMinutes(input.checkOut, input.outDays ?? 0) - start);
    return input.nowAbs === undefined ? 0 : Math.max(0, input.nowAbs - start);
};

/** The running break, if any (no end yet). */
export const runningBreak = (breaks: AttendanceBreak[] | undefined) => (breaks ?? []).find(b => !b.end);

/** Recorded break minutes. A running break counts until `nowMinutes` (or not at all without it). */
export const breakMinutesOf = (breaks: AttendanceBreak[] | undefined, nowMinutes?: number) =>
    (breaks ?? []).reduce((sum, b) => {
        const end = b.end ? toMinutes(b.end) : nowMinutes;
        return end === undefined ? sum : sum + Math.max(0, end - toMinutes(b.start));
    }, 0);

export const BREAK_MESSAGES = {
    time: 'Enter break times as HH:mm.',
    endBeforeStart: 'A break has to end after it starts.',
    outside: 'Breaks have to be between your check-in and your check-out (or now).',
    overlap: 'Breaks can’t overlap.',
    running: 'Only the last break can still be running, while you’re checked in.',
    notCheckedIn: 'You can take a break while you’re checked in.',
    onBreak: 'You’re already on a break.',
    noBreak: 'You’re not on a break.',
    todayOnly: 'Only today’s breaks can be edited here. To change a past break, request a correction and mention it in the reason.',
} as const;

/**
 * Today's breaks, as edited by the employee: HH:mm times within check-in → check-out (or now), no overlaps, and
 * at most one running break — the last one, only while still checked in. Returns them sorted, descriptions trimmed.
 */
export const validateBreaks = (
    breaks: AttendanceBreak[],
    session: { checkIn: string; checkOut: string | null; nowMinutes: number }
): AttendanceBreak[] => {
    const from = toMinutes(session.checkIn);
    const to = session.checkOut ? toMinutes(session.checkOut) : session.nowMinutes;
    const clean = (breaks ?? [])
        .map(b => {
            if (!HHMM_RE.test(b?.start ?? '') || (b.end && !HHMM_RE.test(b.end))) throw new RuleError(BREAK_MESSAGES.time, 400);
            const description = b.description?.trim();
            return { start: b.start, end: b.end || null, ...(description ? { description } : {}) };
        })
        .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    let prevEnd = -1;
    clean.forEach((b, i) => {
        if (!b.end && (session.checkOut || i !== clean.length - 1)) throw new RuleError(BREAK_MESSAGES.running, 400);
        const start = toMinutes(b.start);
        const end = b.end ? toMinutes(b.end) : to;
        if (b.end && end <= start) throw new RuleError(BREAK_MESSAGES.endBeforeStart, 400);
        if (start < from || end > to) throw new RuleError(BREAK_MESSAGES.outside, 400);
        if (start < prevEnd) throw new RuleError(BREAK_MESSAGES.overlap, 400);
        prevEnd = end;
    });
    return clean;
};

export interface DayInput {
    date: string;
    today: string;
    /** Minutes since midnight now — for the time at work while still checked in. */
    nowMinutes?: number;
    checkIn: string | null;
    checkOut: string | null;
    /** Days between the check-in day and the check-out (0 = same day). */
    outDays?: number;
    breaks?: AttendanceBreak[];
    settings: Pick<AtsSettings, 'shift' | 'graceMinutes' | 'halfDayThresholdMinutes' | 'weeklyOff'>;
    holidayName?: string;
    /** Full-day approved leave, e.g. "Casual Leave". */
    leaveName?: string;
    /** PROTOTYPE-SETUP (Final batch, Slice 1): approved half-day leave (first or second half). */
    halfLeave?: LeaveHalf | null;
}

export type DerivedDay = Pick<
    AttendanceDay,
    'status' | 'checkIn' | 'checkOut' | 'outDays' | 'open' | 'carried' | 'minutesAtWork' | 'lateMinutes' | 'label' | 'breaks' | 'breakMinutes' | 'onBreak' | 'halfLeave'
> & { isOffDay: boolean };

/** PROTOTYPE-SETUP (Final batch, Slice 1): "Half-day leave (first half)" */
export const halfLeaveText = (half: LeaveHalf) => `Half-day leave (${half === 'FIRST' ? 'first' : 'second'} half)`;

/** The middle of the shift, in minutes: where a half-day leave splits the day. */
export const midShiftMinutes = (shift: { start: string; end: string }) =>
    toMinutes(shift.start) + Math.round((toMinutes(shift.end) - toMinutes(shift.start)) / 2);

/**
 * Day status:
 * On leave → On leave. Holiday / weekly off → Holiday / Weekly off, or "Worked on weekly off/holiday" if
 * checked in. No check-in → Absent (past), not checked in (today), upcoming (future).
 * Otherwise: Half day if the (completed) time at work is under the threshold; Late if check-in is after shift
 * start + grace; else Present. A session that isn't checked out yet is never a half day.
 */
export const deriveDay = (input: DayInput): DerivedDay => {
    const { date, today, settings } = input;
    const off = input.holidayName ? 'holiday' : isWeeklyOff(date, settings) && 'weekly-off';
    const open = Boolean(input.checkIn && !input.checkOut);
    const nowAbs = input.nowMinutes === undefined || date > today ? undefined : daysBetween(date, today) * MINUTES_PER_DAY + input.nowMinutes;
    const breaks = input.checkIn ? input.breaks ?? [] : [];
    const base = {
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        outDays: input.checkOut ? input.outDays ?? 0 : 0,
        open,
        carried: open && date < today,
        isOffDay: !!off,
        breaks,
        breakMinutes: breakMinutesOf(breaks, open && date === today ? input.nowMinutes : undefined),
        onBreak: open && Boolean(runningBreak(breaks)),
    };
    const atWork = workedMinutes({ checkIn: input.checkIn, checkOut: input.checkOut, outDays: input.outDays, nowAbs: open ? nowAbs : undefined });

    if (input.leaveName && !input.checkIn) {
        return { ...base, status: 'on-leave', minutesAtWork: 0, lateMinutes: 0, label: input.leaveName };
    }
    // PROTOTYPE-SETUP (Final batch, Slice 1): half-day leave — the other half is a working half: the late mark moves
    // to mid-shift for first-half leave, there's no "half day" status, and no check-in on a past day is "Absent
    // (other half)".
    const half = !off && input.halfLeave ? input.halfLeave : null;
    if (half) {
        const label = halfLeaveText(half);
        if (!input.checkIn) {
            if (date < today) return { ...base, status: 'absent', minutesAtWork: 0, lateMinutes: 0, label: `${label} · Absent (other half)`, halfLeave: half };
            return { ...base, status: date === today ? 'not-checked-in' : 'upcoming', minutesAtWork: 0, lateMinutes: 0, label, halfLeave: half };
        }
        const startAt = half === 'FIRST' ? midShiftMinutes(settings.shift) : toMinutes(settings.shift.start);
        const lateBy = toMinutes(input.checkIn) - startAt;
        const lateMinutes = lateBy > settings.graceMinutes ? lateBy : 0;
        return { ...base, status: lateMinutes ? 'late' : 'present', minutesAtWork: atWork, lateMinutes, label, halfLeave: half };
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
    let status: DayStatus = lateMinutes ? 'late' : 'present';
    if (!open && atWork < settings.halfDayThresholdMinutes) status = 'half-day';
    return { ...base, status, minutesAtWork: atWork, lateMinutes };
};

// ---- overtime -----------------------------------------------------------------------------------------------

/**
 * Overtime = time beyond the standard day, whatever time someone checked in.
 * attendance / both: hours worked (check-in → check-out, breaks and overnight hours included, all on the check-in
 * day) − shift length (the shift includes the break). Nothing while still checked in (HR rules, Slice 1).
 * timesheet: hours logged − shift length (the timesheet target is the full shift, no break deduction — HR rules,
 * Slice 5).
 * Weekly offs and holidays: all time worked counts.
 * 'none' mode: no overtime (Overview v4, Slice 5).
 */
export const overtimeMinutes = (input: {
    mode: AtsMode;
    settings: Pick<AtsSettings, 'shift' | 'breakMinutes'>;
    isOffDay: boolean;
    checkIn: string | null;
    checkOut: string | null;
    outDays?: number;
    loggedMinutes: number;
}) => {
    if (!hasTracking(input.mode)) return 0; // 'none': nothing to calculate overtime from
    if (overtimeBasisFor(input.mode) === 'timesheet') {
        return input.isOffDay
            ? input.loggedMinutes
            : Math.max(0, input.loggedMinutes - shiftMinutes(input.settings));
    }
    if (!input.checkIn || !input.checkOut) return 0; // still checked in: nothing yet
    const worked = workedMinutes(input);
    return input.isOffDay ? worked : Math.max(0, worked - shiftMinutes(input.settings));
};

/**
 * PROTOTYPE-SETUP (Attendance tab, Slice 3): overtime counts (and shows) only once it reaches the HR minimum —
 * the same threshold as the suggestions. Under it, the day has no overtime.
 */
export const qualifyingOvertime = (extraMinutes: number, minimumMinutes: number) =>
    extraMinutes > 0 && extraMinutes >= minimumMinutes ? extraMinutes : 0;

/**
 * Suggest overtime only for past days, extra ≥ the HR minimum, and no request for that day yet.
 * PROTOTYPE-SETUP (HR rules, Slice 1): not while the day is still checked in, nor while an attendance correction
 * for it is waiting (the times may change). Overtime is only created when the employee submits a request.
 */
export const shouldSuggestOvertime = (input: {
    date: string;
    today: string;
    extraMinutes: number;
    minimumMinutes: number;
    hasRequest: boolean;
    open?: boolean;
    pendingCorrection?: boolean;
}) =>
    input.date < input.today &&
    !input.hasRequest &&
    !input.open &&
    !input.pendingCorrection &&
    input.extraMinutes > 0 &&
    input.extraMinutes >= input.minimumMinutes;

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

type TimedFields = Pick<TimesheetEntry, 'start' | 'end' | 'startNext' | 'endNext'>;

/**
 * PROTOTYPE-SETUP (HR rules, Slice 1): entries can cross midnight. Times as minutes from the day's midnight —
 * past 1440 for a next-day time (startNext / endNext).
 */
export const entryStartMinutes = (e: TimedFields) => toMinutes(e.start ?? '00:00') + (e.startNext ? MINUTES_PER_DAY : 0);
export const entryEndMinutes = (e: TimedFields) => toMinutes(e.end ?? '00:00') + (e.endNext ? MINUTES_PER_DAY : 0);

/** "10:00 PM – 2:00 AM (next day)" / "No set time" */
export const entryTimeText = (e: TimedFields) =>
    isTimed(e) ? `${displayTime(e.start)} – ${displayTime(e.end)}${e.endNext ? ' (next day)' : ''}` : 'No set time';

/** Minutes of an entry: end − start when timed, otherwise the minutes entered. */
export const entryMins = (e: Pick<TimesheetEntry, 'start' | 'end' | 'startNext' | 'endNext' | 'mins'>) =>
    isTimed(e) ? Math.max(0, entryEndMinutes(e) - entryStartMinutes(e)) : Math.max(0, Math.round(e.mins ?? 0));

/** @deprecated alias kept for existing callers — use entryMins. */
export const entryMinutes = entryMins;

export const loggedMinutesOn = (entries: TimesheetEntry[], date: string) =>
    entries.filter(e => e.date === date).reduce((s, e) => s + entryMins(e), 0);

/** By date, then timed entries by start (next-day starts last), then hours-only entries (in their original order). */
export const sortEntries = <E extends Pick<TimesheetEntry, 'date' | 'start' | 'end' | 'startNext' | 'endNext'>>(list: E[]) =>
    list
        .map((e, i) => ({ e, i }))
        .sort((a, b) => {
            if (a.e.date !== b.e.date) return a.e.date.localeCompare(b.e.date);
            const ta = isTimed(a.e);
            const tb = isTimed(b.e);
            if (ta && tb) return entryStartMinutes(a.e) - entryStartMinutes(b.e) || a.i - b.i;
            if (ta !== tb) return ta ? -1 : 1;
            return a.i - b.i;
        })
        .map(x => x.e);

/** Two timed entries on the same day that share time (next-day times included). Hours-only entries never overlap. */
export const entriesOverlap = (
    a: Pick<TimesheetEntry, 'date' | 'start' | 'end' | 'startNext' | 'endNext'>,
    b: Pick<TimesheetEntry, 'date' | 'start' | 'end' | 'startNext' | 'endNext'>
) =>
    a.date === b.date &&
    isTimed(a) &&
    isTimed(b) &&
    entryStartMinutes(a) < entryEndMinutes(b) &&
    entryStartMinutes(b) < entryEndMinutes(a);

export const findOverlap = <E extends TimesheetEntry>(
    entries: E[],
    candidate: Pick<TimesheetEntry, 'date' | 'start' | 'end' | 'startNext' | 'endNext'> & { id?: string }
) => entries.find(e => e.id !== candidate.id && entriesOverlap(e, candidate));

/** Recorded breaks as entry-like rows, so entries can be checked against them (ids "break:<index>"). */
export const breaksAsEntries = (date: string, breaks: AttendanceBreak[] | undefined, nowMinutes?: number): TimesheetEntry[] =>
    (breaks ?? []).flatMap((b, i) => {
        const end = b.end ?? (nowMinutes === undefined ? null : clockOf(Math.max(toMinutes(b.start), nowMinutes)));
        if (!end) return [];
        return [{ id: `break:${i}`, date, start: b.start, end, mins: Math.max(0, toMinutes(end) - toMinutes(b.start)), description: b.description || 'Break' }];
    });

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

export const MAX_DAY_MINUTES = 24 * 60;
const HHMM_RE = /^\d{2}:\d{2}$/;

// ---- task-entry fields (PROTOTYPE-SETUP: Timesheet filing) -------------------------------------------------

/** Start and end times are asked for (Patterns A and C): the duration is calculated from them. */
export const usesTimes = (f: Pick<TimesheetFields, 'startTime' | 'endTime'>) => f.startTime && f.endTime;

export const FILING_FIELD_MESSAGES = {
    pair: 'Start time and end time work as a pair. Turn both on or both off.',
    none: 'Turn on start and end times, or duration, so employees can record how long they worked.',
} as const;

/** Why a field combination can't work, or null. Start and end go together; some way of recording time is on. */
export const filingFieldsError = (f: TimesheetFields) => {
    if (f.startTime !== f.endTime) return FILING_FIELD_MESSAGES.pair;
    if (!f.startTime && !f.duration) return FILING_FIELD_MESSAGES.none;
    return null;
};

/** "pay-101 " → "PAY-101" */
export const normaliseProjectCode = (v: string | null | undefined) => (v ?? '').trim().toUpperCase();

/** Up to 20 letters, numbers, dots, dashes or slashes, starting with a letter or number. */
export const PROJECT_CODE_RE = /^[A-Z0-9][A-Z0-9._/-]{0,19}$/;

// ---- where the work was done (PROTOTYPE-SETUP: Final batch, Slice 1) --------------------------------------

export const LOCATION_LABEL: Record<WorkLocation, string> = { OFFICE: 'Office', HOME: 'Home', CLIENT: 'Client site' };

/** "Office", "Home", "Client: Brightline" (the entry row chip). */
export const locationChip = (location: WorkLocation | undefined, client?: string) =>
    location === 'CLIENT' ? `Client: ${client ?? ''}`.trim() : LOCATION_LABEL[location ?? 'OFFICE'];

/** "Client site (Brightline)" (the attendance trail). */
export const locationText = (location: WorkLocation, client?: string) =>
    location === 'CLIENT' && client ? `Client site (${client})` : LOCATION_LABEL[location];

/** An entry's location (default Office); a client site needs the client's name (up to 60 characters). */
export const whereOf = (input: { location?: WorkLocation | null; client?: string | null }): { location: WorkLocation; client?: string } => {
    const location: WorkLocation = input.location === 'HOME' || input.location === 'CLIENT' ? input.location : 'OFFICE';
    if (location !== 'CLIENT') return { location };
    const client = (input.client ?? '').trim().slice(0, 60);
    if (!client) throw new RuleError(ENTRY_MESSAGES.client, 400);
    return { location, client };
};

// ---- where they work from (Attendance only mode; PROTOTYPE-SETUP: Final batch, Slice 2) -------------------

/** Adds "working from … since {at}" unless it's where they already are. */
export const addLocationStamp = (trail: LocationStamp[], stamp: LocationStamp): LocationStamp[] => {
    const last = trail[trail.length - 1];
    if (last && last.location === stamp.location && (last.client ?? '') === (stamp.client ?? '')) return trail;
    return [...trail, stamp];
};

/** The day's timeline: the stored one, or Office from check-in (the default) when nothing was set. */
export const dayLocations = (stored: LocationStamp[] | undefined, checkIn: string | null): LocationStamp[] => {
    if (stored?.length) return stored;
    return checkIn ? [{ at: checkIn, location: 'OFFICE' }] : [];
};

/** "Office 9:30 AM → Client site (Brightline) 2:00 PM" */
export const locationTrailText = (trail: LocationStamp[]) => trail.map(x => `${locationText(x.location, x.client)} ${displayTime(x.at)}`).join(' → ');

/** "Office from 9:30 AM, Client site (Brightline) from 2:00 PM" (day details) */
export const locationDetailText = (trail: LocationStamp[]) => trail.map(x => `${locationText(x.location, x.client)} from ${displayTime(x.at)}`).join(', ');

/** "Working from Client site (Brightline) from 2:00 PM" (the toast) */
export const workingFromText = (w: { location: WorkLocation; client?: string }, at?: string | null) =>
    `Working from ${LOCATION_LABEL[w.location]}${w.location === 'CLIENT' && w.client ? ` (${w.client})` : ''}${at ? ` from ${displayTime(at)}` : ''}`;

/**
 * Validation messages — the prototype's wording (docs/prototypes/attendance-timesheet.html), plus `missing`
 * (nothing entered at all). PROTOTYPE-SETUP (HR rules, Slice 1): an end earlier than the start is the next morning
 * (no more "split it across two days"); the same start and end is an error.
 */
export const ENTRY_MESSAGES = {
    date: 'Pick a valid date.',
    time: 'Enter times as HH:mm.',
    endWithoutStart: 'Add a start time too, or clear the end time.',
    sameStartEnd: 'Start and end can’t be the same time.',
    startWithoutEnd: 'Add an end time or the hours.',
    unreadableHours: 'Write hours like 1:30, 1.5 or 1h 30m.',
    zeroHours: 'Add the hours worked, or a start and end time.',
    missing: 'Enter a start and end time, or just the hours.',
    over24: 'One entry can’t be more than 24 hours.',
    pastNextDay: 'An entry has to end by the next day.',
    description: 'Describe what you worked on.',
    dayOver24: 'That takes the day over 24 hours.',
    // PROTOTYPE-SETUP (Timesheet filing): per the company's fields.
    needTimes: 'Enter a start and end time.',
    needDuration: 'Enter how long you worked, e.g. 1:30 or 1h 30m.',
    projectCode: 'Pick a project code.',
    // PROTOTYPE-SETUP (Final batch, Slice 1): where the work was done.
    client: 'Add the client’s name for a client-site entry.',
    projectCodeFormat: 'Use a project code of up to 20 letters, numbers, dots, dashes or slashes.',
} as const;

/** "Overlaps with 9:00 AM – 12:00 PM (Code review)." / "Overlaps with 1:00 PM – 2:00 PM (break)." */
export const overlapMessage = (clash: Pick<TimesheetEntry, 'id' | 'start' | 'end' | 'startNext' | 'endNext' | 'description'>) =>
    `Overlaps with ${entryTimeText(clash)} (${clash.id.startsWith('break:') ? 'break' : clash.description}).`;

/**
 * Validates and normalises an entry, checking in the prototype's order. Start + end → mins = end − start (the
 * hours field is ignored); start + hours → end = start + hours; hours alone → hours-only.
 * PROTOTYPE-SETUP (HR rules, Slice 1): times are minutes from the day's midnight; `startNext` puts the start after
 * midnight, and an end earlier than (or equal to, with a next-day flag) the start is the next day. The result carries
 * startNext / endNext when true.
 * Order: end without start · same start and end · start without end or hours · unreadable hours · zero hours ·
 * over 24h · past the next day · description · project code · day over 24h · overlap with a break.
 * `others` = the day's (or week's) entries and breaks; the edited entry itself is skipped by id. `hoursText` is
 * what the user typed in Hours (or pass `mins`).
 * PROTOTYPE-SETUP (Timesheet filing): with the company's `fields`, start and end are required when times are on
 * (any typed hours are ignored — the duration comes from the times), and only a duration is taken when they are off
 * (no timestamps are invented). A project code is required when project codes are on, and kept otherwise. Overlapping
 * task entries are allowed (the employee is warned — see findOverlaps); overlapping a recorded break is not.
 */
export const validateEntry = (
    input: {
        date: string;
        start?: string | null;
        end?: string | null;
        startNext?: boolean;
        endNext?: boolean;
        mins?: number | null;
        hoursText?: string;
        description: string;
        projectCode?: string | null;
        location?: WorkLocation | null;
        client?: string | null;
        id?: string;
    },
    others: TimesheetEntry[],
    fields?: TimesheetFields
): Omit<TimesheetEntry, 'id'> => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? '')) throw new RuleError(ENTRY_MESSAGES.date, 400);
    const timesOff = Boolean(fields && !usesTimes(fields));
    const start = timesOff ? null : input.start || null;
    const typedEnd = timesOff ? null : input.end || null;
    if ((start && !HHMM_RE.test(start)) || (typedEnd && !HHMM_RE.test(typedEnd))) {
        throw new RuleError(ENTRY_MESSAGES.time, 400);
    }
    if (typedEnd && !start) throw new RuleError(ENTRY_MESSAGES.endWithoutStart, 400);
    if (fields && usesTimes(fields) && (!start || !typedEnd)) throw new RuleError(ENTRY_MESSAGES.needTimes, 400);
    if (timesOff && !input.hoursText?.trim() && input.mins == null) throw new RuleError(ENTRY_MESSAGES.needDuration, 400);
    const from = start ? toMinutes(start) + (input.startNext ? MINUTES_PER_DAY : 0) : 0;
    let to = 0;
    if (start && typedEnd) {
        if (typedEnd === start && Boolean(input.endNext) === Boolean(input.startNext)) throw new RuleError(ENTRY_MESSAGES.sameStartEnd, 400);
        to = toMinutes(typedEnd) + (input.endNext ? MINUTES_PER_DAY : 0);
        if (to <= from) to += MINUTES_PER_DAY; // an end earlier than the start is the next morning
    }

    const text = input.hoursText?.trim() ?? '';
    let hours: number | null = input.mins ?? null;
    if (text) hours = parseHours(text);
    const timed = Boolean(start && typedEnd);
    if (!timed) {
        if (start && !text && input.mins == null) throw new RuleError(ENTRY_MESSAGES.startWithoutEnd, 400);
        if (text && hours === null) throw new RuleError(ENTRY_MESSAGES.unreadableHours, 400);
        if (!start && !text && input.mins == null) throw new RuleError(ENTRY_MESSAGES.missing, 400);
    }
    const minutes = timed ? to - from : (hours ?? 0);
    if (!Number.isFinite(minutes) || minutes <= 0) throw new RuleError(ENTRY_MESSAGES.zeroHours, 400);
    if (minutes > MAX_DAY_MINUTES) throw new RuleError(ENTRY_MESSAGES.over24, 400);
    if (start && from + minutes > 2 * MINUTES_PER_DAY) throw new RuleError(ENTRY_MESSAGES.pastNextDay, 400);
    const description = input.description?.trim() ?? '';
    if (!description) throw new RuleError(ENTRY_MESSAGES.description, 400);
    const code = normaliseProjectCode(input.projectCode);
    if (fields?.projectCode && !code) throw new RuleError(ENTRY_MESSAGES.projectCode, 400);
    if (fields?.projectCode && !PROJECT_CODE_RE.test(code)) throw new RuleError(ENTRY_MESSAGES.projectCodeFormat, 400);
    // Project codes off: a code already on the entry is kept (not shown, not required).
    const projectCode = { ...(code && PROJECT_CODE_RE.test(code) ? { projectCode: code } : {}), ...whereOf(input) };

    const sameDay = others.filter(o => o.date === input.date && o.id !== input.id);
    if (sameDay.reduce((sum, o) => sum + entryMins(o), 0) + minutes > MAX_DAY_MINUTES) {
        throw new RuleError(ENTRY_MESSAGES.dayOver24, 400);
    }
    if (!start) return { date: input.date, start: null, end: null, mins: Math.round(minutes), description, ...projectCode };
    const endAbs = from + minutes;
    const flags = {
        ...(from >= MINUTES_PER_DAY ? { startNext: true } : {}),
        ...(endAbs >= MINUTES_PER_DAY ? { endNext: true } : {}),
    };
    const candidate = { id: input.id, date: input.date, start, end: clockOf(endAbs), ...flags };
    const breakClash = findOverlap(sameDay.filter(o => o.id.startsWith('break:')), candidate);
    if (breakClash && isTimed(breakClash)) throw new RuleError(overlapMessage(breakClash));
    return { date: input.date, start, end: clockOf(endAbs), ...flags, mins: Math.round(minutes), description, ...projectCode };
};

// ---- expected hours -----------------------------------------------------------------------------------

/**
 * The day's timesheet target — the single rule behind totals, unlogged hours, the team grid and payroll.
 * PROTOTYPE-SETUP (HR rules, Slice 1): the timesheet should cover every checked-in hour, breaks included (recorded
 * breaks count as logged). See docs/api/attendance-timesheet.md ("Expected hours").
 *   attendance-only or 'none' mode, or before the joining date ......................... 0
 *   full-day leave (status on-leave) ..................................................... 0
 *   timesheet-only mode, working day .................................................... the shift length
 *   timesheet-only mode, weekly off / holiday ........................................... 0
 *   both mode, checked in and out ................ check-out (+ next-day hours) − check-in (worked off-days too)
 *   both mode, still checked in today ......................................... check-in → now (so far)
 *   both mode, still checked in from an earlier day .............................. 0 until checked out
 *   both mode, no check-in (past, today or future) ...................................... 0
 */
export const expectedMinutes = (input: {
    mode: AtsMode;
    settings: Pick<AtsSettings, 'shift' | 'breakMinutes'>;
    day: Pick<AttendanceDay, 'date' | 'status' | 'checkIn' | 'checkOut' | 'carried' | 'minutesAtWork'> & Partial<Pick<AttendanceDay, 'halfLeave'>>;
    today: string;
    dateOfJoin?: string;
}) => {
    const { mode, settings, day } = input;
    if (!hasTimesheets(mode)) return 0;
    if (input.dateOfJoin && day.date < input.dateOfJoin) return 0;
    if (day.status === 'on-leave') return 0;
    if (mode === 'timesheet') {
        if (['holiday', 'weekly-off', 'worked-off-day'].includes(day.status)) return 0;
        // PROTOTYPE-SETUP (Final batch, Slice 1): half-day leave → half the shift.
        return day.halfLeave ? Math.round(shiftMinutes(settings) / 2) : shiftMinutes(settings);
    }
    if (!day.checkIn || day.carried) return 0;
    return day.minutesAtWork;
};

/**
 * The day's timesheet window.
 * timesheet mode: the shift. both mode: check-in → check-out (next-day check-outs run past midnight: endMinutes >
 * 1440); still checked in runs until now; no check-in yet (today / future) falls back to the shift; a past day
 * without a check-in has no window. Leave, holidays and weekly offs have no window (time logged there still counts).
 */
export const dayWindow = (input: {
    mode: AtsMode;
    settings: Pick<AtsSettings, 'shift' | 'breakMinutes'>;
    day: Pick<AttendanceDay, 'date' | 'status' | 'checkIn' | 'checkOut' | 'outDays' | 'open' | 'carried' | 'minutesAtWork' | 'label'>;
    today: string;
    dateOfJoin?: string;
}): DayWindow => {
    const { mode, settings, day } = input;
    const shiftLabel = `Shift ${displayTime(settings.shift.start)} – ${displayTime(settings.shift.end)}`;
    const shift = {
        start: settings.shift.start,
        end: settings.shift.end,
        startMinutes: toMinutes(settings.shift.start),
        endMinutes: toMinutes(settings.shift.end),
    };
    const expected = expectedMinutes(input);
    const offOrLeave = ['on-leave', 'holiday', 'weekly-off'].includes(day.status);

    if (!hasTimesheets(mode)) return { kind: 'none', label: 'Timesheets are off', expectedMinutes: 0 };
    if (input.dateOfJoin && day.date < input.dateOfJoin) return { kind: 'none', label: 'Before joining', expectedMinutes: 0 };
    if (mode === 'timesheet') {
        if (offOrLeave || day.status === 'worked-off-day') {
            return { kind: 'none', label: day.label ?? 'No working hours', expectedMinutes: 0 };
        }
        return { kind: 'shift', ...shift, label: shiftLabel, expectedMinutes: expected };
    }
    // both
    if (day.checkIn) {
        const startMinutes = toMinutes(day.checkIn);
        if (day.checkOut) {
            const endMinutes = checkOutMinutes(day.checkOut, day.outDays);
            const label = `Checked in ${displayTime(day.checkIn)}, out ${displayTimeOn(day.checkOut, day.outDays)}`;
            return { kind: 'attendance', start: day.checkIn, end: day.checkOut, startMinutes, endMinutes, label, expectedMinutes: expected };
        }
        const endMinutes = startMinutes + day.minutesAtWork;
        const label = `Checked in ${displayTime(day.checkIn)}, still checked in`;
        return { kind: 'attendance', start: day.checkIn, end: clockOf(endMinutes), startMinutes, endMinutes, label, open: true, expectedMinutes: expected };
    }
    if (offOrLeave) return { kind: 'none', label: day.label ?? 'No working hours', expectedMinutes: 0 };
    if (day.date >= input.today) {
        return { kind: 'shift', ...shift, label: `${shiftLabel} · not checked in yet`, expectedMinutes: expected };
    }
    return { kind: 'none', label: 'No check-in recorded', expectedMinutes: 0 };
};

/**
 * 'both' mode: timed entries outside check-in / check-out (next-day times included) are flagged "logged outside
 * check-in hours" — the flag offers an attendance correction pre-filled from the entries. Never overtime. Nothing
 * while the day is still checked in.
 */
export const outsideCheckInFlag = (input: {
    mode: AtsMode;
    day: Pick<AttendanceDay, 'date' | 'status' | 'checkIn' | 'checkOut' | 'outDays' | 'open'>;
    entries: TimesheetEntry[];
}): OutsideCheckInFlag | undefined => {
    if (input.mode !== 'both') return undefined;
    const dayEntries = input.entries.filter(e => e.date === input.day.date && !e.id.startsWith('break:'));
    if (!dayEntries.length) return undefined;
    const { checkIn, checkOut } = input.day;
    if (['on-leave', 'holiday', 'weekly-off', 'upcoming', 'not-checked-in'].includes(input.day.status)) return undefined;
    // Only timed entries can be outside check-in hours — hours-only entries have no times.
    const timed = dayEntries.filter(isTimed);
    const earliest = timed.length ? Math.min(...timed.map(entryStartMinutes)) : null;
    const latest = timed.length ? Math.max(...timed.map(entryEndMinutes)) : null;
    const out = (m: number) => ({ checkOut: clockOf(m), outDays: Math.floor(m / MINUTES_PER_DAY) });
    if (!checkIn) {
        // A past day with time logged (timed or hours-only) but no check-in: prompt a correction, pre-filled
        // from the timed entries when there are any.
        return {
            entryIds: dayEntries.map(e => e.id),
            action: 'request-correction',
            suggested: {
                checkIn: earliest === null ? null : clockOf(earliest),
                ...(latest === null ? { checkOut: null, outDays: 0 } : out(latest)),
            },
        };
    }
    if (!checkOut || input.day.open) return undefined; // still checked in
    const inMin = toMinutes(checkIn);
    const outMin = checkOutMinutes(checkOut, input.day.outDays);
    const outside = timed.filter(e => entryStartMinutes(e) < inMin || entryEndMinutes(e) > outMin);
    if (!outside.length || earliest === null || latest === null) return undefined;
    const afterOut = latest > outMin;
    const beforeIn = earliest < inMin;
    return {
        entryIds: outside.map(e => e.id),
        action: 'request-correction',
        suggested: {
            checkIn: beforeIn ? clockOf(earliest) : checkIn,
            ...(afterOut ? out(latest) : { checkOut, outDays: input.day.outDays }),
        },
    };
};

// ---- change diff --------------------------------------------------------------------------------------------

export interface EntryDiff {
    added: TimesheetEntry[];
    removed: TimesheetEntry[];
    edited: { before: TimesheetEntry; after: TimesheetEntry }[];
}

/** Compares date, start, end, minutes, description and project code. */
const sameEntry = (a: TimesheetEntry, b: TimesheetEntry) =>
    (a.projectCode ?? '') === (b.projectCode ?? '') &&
    a.date === b.date &&
    a.start === b.start &&
    a.end === b.end &&
    Boolean(a.startNext) === Boolean(b.startNext) &&
    Boolean(a.endNext) === Boolean(b.endNext) &&
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

// ---- timesheet lifecycle --------------------------------------------------------------------------------

/**
 * PROTOTYPE-SETUP (Final batch, Slice 1): entries are edited directly in every status until payroll is processed for
 * the month (an edit to a sent or approved period moves it back to Draft — see editedBack). A period whose days are
 * all locked is locked.
 */
export const editModeFor = (input: {
    approvalEnabled: boolean;
    status: TimesheetStatus;
    allDaysLocked: boolean;
    readOnly?: boolean;
}): TimesheetEditMode => {
    if (input.readOnly) return 'read-only';
    if (input.allDaysLocked) return 'locked';
    return 'direct';
};

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
    /**
     * PROTOTYPE-SETUP (Timesheet filing): the employee's filing periods overlapping the month (any frequency). Without
     * it, the Monday–Sunday weeks overlapping the month.
     */
    periodsOf?: (employee: E) => { weekStart: string; periodEnd: string; status: TimesheetStatus }[];
}) => {
    if (!input.approvalEnabled) return [];
    const { last } = monthBounds(input.month);
    const weeks = weeksOverlappingMonth(input.month);
    return input.employees
        .filter(e => e.dateOfJoin <= last)
        .flatMap(e =>
            (input.periodsOf
                ? input.periodsOf(e)
                : weeks.map(ws => ({ weekStart: ws, periodEnd: addDays(ws, 6), status: input.statusOf(e.id, ws) })))
                .filter(p => p.periodEnd >= e.dateOfJoin)
                .map(p => ({ employee: e, weekStart: p.weekStart, periodEnd: p.periodEnd, status: p.status }))
                .filter(x => x.status !== 'APPROVED')
        );
};

// ---- approval chain -----------------------------------------------------------------------------------------

/**
 * Level 1 is always the reporting manager; level 2 per HR settings (timesheets: none). The CEO has no
 * manager: level 1 is skipped and the request goes straight to level 2 (or is approved if there is none).
 * PROTOTYPE-SETUP (Overview, Slice 1): a profile update has no manager step — HR only.
 */
export const startTrail = (
    type: ApprovalType,
    manager: { id: number; name: string } | null,
    settings: Pick<AtsSettings, 'level2'>
): ApprovalTrail => {
    if (type === 'profile') {
        const hrOnly: ApprovalTrail['steps'] = [{ level: 2, role: 'HR' }];
        return { type, status: nextStatus(hrOnly), steps: hrOnly };
    }
    const l2 = settings.level2[type];
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
    if (pending.role === 'PAYROLL') return 'PENDING_PAYROLL';
    if (pending.role === 'ADMIN') return 'PENDING_ADMIN';
    return pending.role === 'HR' ? 'PENDING_HR' : 'PENDING_FINANCE';
}

/** The role a trail is waiting for, if any. */
export const awaiting = (trail: ApprovalTrail): ApproverRole | null => {
    if (trail.status === 'PENDING_MANAGER') return 'MANAGER';
    if (trail.status === 'PENDING_HR') return 'HR';
    if (trail.status === 'PENDING_FINANCE') return 'FINANCE';
    if (trail.status === 'PENDING_PAYROLL') return 'PAYROLL';
    if (trail.status === 'PENDING_ADMIN') return 'ADMIN';
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

/** "With manager (Arjun Mehta)", "With HR", "With Finance", "With Payroll", "Approved", "Rejected", "Cancelled". */
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
        case 'PENDING_ADMIN':
            return 'With Admin';
        case 'PENDING_PAYROLL':
            return 'With Payroll';
        case 'APPROVED':
            return 'Approved';
        case 'CANCELLED':
            return 'Cancelled';
        default:
            return 'Rejected';
    }
};

// ---- profile updates (PROTOTYPE-SETUP: Overview, Slice 1) -------------------------------------------------

export const PROFILE_LABEL: Record<PersonalField, string> = {
    mobile: 'Mobile number',
    personalEmail: 'Personal email',
    address: 'Current address',
    emergencyName: 'Emergency contact',
    emergencyRelation: 'Relationship',
    emergencyPhone: 'Emergency phone',
    photo: 'Photo',
};

const PROFILE_FIELDS = Object.keys(PROFILE_LABEL) as PersonalField[];

/** A photo may be at most 1 MB. */
export const MAX_PHOTO_BYTES = 1024 * 1024;

export const PROFILE_MESSAGES = {
    mobile: 'Enter a mobile number with at least 10 digits.',
    personalEmail: 'That personal email doesn’t look right.',
    emergency: 'Add an emergency contact name and a 10-digit number.',
    photo: 'Pick a photo under 1 MB.',
    nothing: 'Nothing has changed.',
    pending: 'Your last update is still with HR. You can make more changes once HR responds.',
};

const digits = (v: string) => v.replace(/\D/g, '').length;
/** Bytes in a data URL's payload. */
const dataUrlBytes = (url: string) => Math.floor(((url.split(',')[1] ?? '').length * 3) / 4);

/** Throws the first problem, in the prototype's order (mobile, personal email, emergency contact, photo). */
export const validatePersonalDetails = (p: PersonalDetails) => {
    if (digits(p.mobile) < 10) throw new RuleError(PROFILE_MESSAGES.mobile, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.personalEmail.trim())) throw new RuleError(PROFILE_MESSAGES.personalEmail, 400);
    if (!p.emergencyName.trim() || digits(p.emergencyPhone) < 10) throw new RuleError(PROFILE_MESSAGES.emergency, 400);
    if (p.photo && dataUrlBytes(p.photo) > MAX_PHOTO_BYTES) throw new RuleError(PROFILE_MESSAGES.photo, 400);
};

/** Only the fields that changed, old → new (text trimmed). */
export const profileChanges = (current: PersonalDetails, next: Partial<PersonalDetails>): ProfileChange[] =>
    PROFILE_FIELDS.filter(f => f in next).flatMap(field => {
        const to = field === 'photo' ? next.photo ?? null : String(next[field] ?? '').trim();
        const from = current[field];
        return to === from ? [] : [{ field, label: PROFILE_LABEL[field], from, to }];
    });

/** "Mobile number: +91 98450 23817 → +91 98450 11111; New photo" */
export const profileChangeSummary = (changes: ProfileChange[]) =>
    changes
        .map(c => {
            if (c.field === 'photo') return c.to ? 'New photo' : 'Photo removed';
            return `${c.label}: ${c.from || '—'} → ${c.to || '—'}`;
        })
        .join('; ');

/** HR approved: the new values replace the old ones. */
export const applyProfileChanges = (current: PersonalDetails, changes: ProfileChange[]): PersonalDetails =>
    changes.reduce((acc, c) => ({ ...acc, [c.field]: c.to }), current);

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
