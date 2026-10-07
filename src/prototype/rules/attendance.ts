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

export const entryMinutes = (e: Pick<TimesheetEntry, 'start' | 'end'>) =>
    Math.max(0, toMinutes(e.end) - toMinutes(e.start));

export const loggedMinutesOn = (entries: TimesheetEntry[], date: string) =>
    entries.filter(e => e.date === date).reduce((s, e) => s + entryMinutes(e), 0);

export const entriesOverlap = (
    a: Pick<TimesheetEntry, 'date' | 'start' | 'end'>,
    b: Pick<TimesheetEntry, 'date' | 'start' | 'end'>
) =>
    a.date === b.date &&
    toMinutes(a.start) < toMinutes(b.end) &&
    toMinutes(b.start) < toMinutes(a.end);

export const findOverlap = (
    entries: TimesheetEntry[],
    candidate: Pick<TimesheetEntry, 'date' | 'start' | 'end'> & { id?: string }
) => entries.find(e => e.id !== candidate.id && entriesOverlap(e, candidate));

/** Blocks end-before-start, a missing description and overlaps. Returns the cleaned fields. */
export const validateEntry = (
    input: { date: string; start: string; end: string; description: string; id?: string },
    others: TimesheetEntry[]
) => {
    const description = input.description?.trim() ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new RuleError('Pick a valid date.', 400);
    if (!/^\d{2}:\d{2}$/.test(input.start) || !/^\d{2}:\d{2}$/.test(input.end)) {
        throw new RuleError('Enter a start and end time.', 400);
    }
    if (toMinutes(input.end) <= toMinutes(input.start)) {
        throw new RuleError('End time must be after the start time.', 400);
    }
    if (!description) throw new RuleError('A description is required.', 400);
    const clash = findOverlap(others, input);
    if (clash) {
        throw new RuleError(
            `Overlaps with ${displayTime(clash.start)}–${displayTime(clash.end)} · ${clash.description}.`
        );
    }
    return { date: input.date, start: input.start, end: input.end, description };
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
}): DayWindow => {
    const { mode, settings, day } = input;
    const shiftLabel = `Shift ${displayTime(settings.shift.start)}–${displayTime(settings.shift.end)}`;
    const span = (start: string, end: string) =>
        Math.max(0, toMinutes(end) - toMinutes(start) - settings.breakMinutes);
    const offOrLeave = ['on-leave', 'holiday', 'weekly-off'].includes(day.status);

    if (mode === 'attendance') return { kind: 'none', label: 'Timesheets are off', expectedMinutes: 0 };
    if (mode === 'timesheet') {
        if (offOrLeave || day.status === 'worked-off-day') {
            return { kind: 'none', label: day.label ?? 'No working hours', expectedMinutes: 0 };
        }
        return { kind: 'shift', start: settings.shift.start, end: settings.shift.end, label: shiftLabel, expectedMinutes: span(settings.shift.start, settings.shift.end) };
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
        const expected = day.status === 'worked-off-day' ? 0 : span(day.checkIn, end);
        return { kind: 'attendance', start: day.checkIn, end, label, checkOutAuto: day.checkOutAuto, expectedMinutes: expected };
    }
    if (offOrLeave) return { kind: 'none', label: day.label ?? 'No working hours', expectedMinutes: 0 };
    if (day.date >= input.today) {
        return { kind: 'shift', start: settings.shift.start, end: settings.shift.end, label: `${shiftLabel} · not checked in yet`, expectedMinutes: span(settings.shift.start, settings.shift.end) };
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
    const earliest = Math.min(...dayEntries.map(e => toMinutes(e.start)));
    const latest = Math.max(...dayEntries.map(e => toMinutes(e.end)));
    if (!checkIn) {
        // A past day without a check-in but with time logged.
        return {
            entryIds: dayEntries.map(e => e.id),
            action: 'request-correction',
            suggested: { checkIn: fromMinutes(earliest), checkOut: fromMinutes(latest) },
        };
    }
    if (!checkOut) return undefined; // today, still on the clock
    const outside = dayEntries.filter(
        e => toMinutes(e.start) < toMinutes(checkIn) || toMinutes(e.end) > toMinutes(checkOut)
    );
    if (!outside.length) return undefined;
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

const sameEntry = (a: TimesheetEntry, b: TimesheetEntry) =>
    a.date === b.date && a.start === b.start && a.end === b.end && a.description === b.description;

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

export const canSubmitWeek = (input: { approvalEnabled: boolean; status: TimesheetStatus; allDaysLocked: boolean }) =>
    input.approvalEnabled && !input.allDaysLocked && (input.status === 'DRAFT' || input.status === 'SENT_BACK');

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
