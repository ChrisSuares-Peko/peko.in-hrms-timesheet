// PROTOTYPE-SETUP: ESS Service 1 — stateful Attendance & Timesheet data (persisted per data mode, see
// persistentStore.ts) and the read-side derivations every endpoint shares. All business rules come from
// src/prototype/rules/attendance.ts; this file only looks things up and assembles views.
import type {
    AtsSettings,
    AttendanceCorrection,
    AttendanceDay,
    AttendanceRecord,
    OvertimeContext,
    OvertimeRequest,
    PeriodSummary,
    PersonRef,
    TimesheetBreakRow,
    TimesheetDay,
    TimesheetEntry,
    TimesheetStatus,
    TimesheetWeek,
    TimesheetWeekView,
} from '@src/domains/attendanceTimesheet/types';
import {
    DEFAULT_FILING,
    DEFAULT_SETTINGS,
    OPEN_SESSION_LOOKBACK_DAYS,
    addDays,
    addMonths,
    breaksAsEntries,
    dayWindow,
    deriveDay,
    editModeFor,
    entryMins,
    hasCheckIn,
    hasTimesheets,
    isWeeklyOff,
    sortEntries,
    lockReasonFor,
    toMinutes,
    monthBounds,
    monthLabel,
    monthOf,
    outsideCheckInFlag,
    overtimeBasisFor,
    overtimeMinutes,
    requestState,
    trailLabel,
} from '@src/prototype/rules/attendance';
import { LEAVE_LABEL } from '@src/prototype/rules/leavePolicy';
import {
    autoSubmitDateFor,
    canSubmitPeriod,
    clipPeriod,
    datesBetween,
    naturalPeriod,
    periodEndOf,
    periodLabel,
} from '@src/prototype/rules/timesheetFiling';


import { approvedLeaveOn } from './atsRequests';
import { createCollection } from './persistentStore';
import { buildAtsSeed, recordKey, weekId } from '../data/ats-seed';
import { isoDateTime, monthsAgo, toIsoDate } from '../data/dates';
import { EMPLOYEES, ESS_EMPLOYEE, ESS_MANAGER, MockEmployee, findEmployee, managerOf } from '../data/employees';
import { holidayOn, todayIso } from '../data/time-calendar';
import type { DataMode } from '../envelope';

// ---- collections --------------------------------------------------------------------------------------

export const atsSettings = createCollection<AtsSettings>('ats-settings', () => ({
    ...DEFAULT_SETTINGS,
    updatedAt: isoDateTime(todayIso(), '03:30:00'),
}));

export const atsAttendance = createCollection<Record<string, AttendanceRecord>>('ats-attendance', mode =>
    mode === 'empty' ? {} : buildAtsSeed().attendance
);

export const atsWeeks = createCollection<Record<string, TimesheetWeek>>('ats-weeks', mode =>
    mode === 'empty' ? {} : buildAtsSeed().weeks
);


export const atsCorrections = createCollection<AttendanceCorrection[]>('ats-corrections', mode =>
    mode === 'empty' ? [] : buildAtsSeed().corrections
);

export const atsOvertime = createCollection<OvertimeRequest[]>('ats-overtime', mode =>
    mode === 'empty' ? [] : buildAtsSeed().overtime
);

/** Payroll months processed in the demo (month → when). Months before last month count as processed. */
export const atsPayroll = createCollection<{ processed: Record<string, string>; lastSubmissionRun?: string }>(
    'ats-payroll',
    () => ({ processed: {} })
);

// ---- basics -----------------------------------------------------------------------------------------------

export const nowIso = () => new Date().toISOString();
export const nowMinutes = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
};
export const today = () => todayIso();
export const currentMonth = () => monthOf(toIsoDate(new Date()));
export const lastMonth = () => monthOf(monthsAgo(1, 1));

/**
 * PROTOTYPE-SETUP (Timesheet filing; Final batch, Slice 1): settings saved before a field existed get its default.
 */
export const getSettings = (mode: DataMode): AtsSettings => {
    const s = atsSettings.get(mode);
    return {
        ...DEFAULT_SETTINGS,
        ...s,
        timesheetFiling: s.timesheetFiling ?? DEFAULT_FILING,
        timesheetApproval: { ...DEFAULT_SETTINGS.timesheetApproval, ...s.timesheetApproval },
        level2: { ...DEFAULT_SETTINGS.level2, ...s.level2 },
        leavePolicy: s.leavePolicy ?? DEFAULT_SETTINGS.leavePolicy,
        lateDeductionDays: s.lateDeductionDays ?? DEFAULT_SETTINGS.lateDeductionDays,
    };
};

/** Employees in this data set (none in Empty mode; the ESS personas still work on their own data). */
export const employeesFor = (mode: DataMode) => (mode === 'empty' ? [] : EMPLOYEES);

export const personRef = (e: MockEmployee): PersonRef => ({
    id: e.id,
    name: e.fullName,
    employeeId: e.employeeId,
    designation: e.designation,
    department: e.department,
});

export const managerRef = (e: MockEmployee) => {
    const m = managerOf(e);
    return m ? { id: m.id, name: m.fullName } : null;
};

const pad = (n: number) => String(n).padStart(2, '0');
export const clockNow = () => {
    const m = nowMinutes();
    return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

/** "Wed, 23 Sep" */
export const dayLabel = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

// ---- payroll locks ------------------------------------------------------------------------------------

export const isProcessed = (mode: DataMode, month: string) =>
    month < lastMonth() || Boolean(atsPayroll.get(mode).processed[month]);

/** Processed months, newest first (two years back is plenty for any view). */
export const processedMonths = (mode: DataMode) =>
    Array.from({ length: 24 }, (_, i) => addMonths(currentMonth(), -i)).filter(m => isProcessed(mode, m));

export const isDayLocked = (mode: DataMode, date: string) => isProcessed(mode, monthOf(date));

/** The earliest month whose payroll hasn't been processed. */
export const firstUnprocessedMonth = (mode: DataMode) =>
    [lastMonth(), currentMonth()].find(m => !isProcessed(mode, m)) ?? addMonths(currentMonth(), 1);

// ---- leave & holidays ---------------------------------------------------------------------------------

/**
 * Full-day approved leave on the date (half-day leave is a working half-day). PROTOTYPE-SETUP (Final batch, Slice 1):
 * read from the live leave requests, so approving leave updates attendance and the timesheet straight away.
 */
export const leaveNameOn = (mode: DataMode, e: MockEmployee, date: string) => {
    // Weekly offs and holidays inside a leave stay what they are (they aren't counted as leave days).
    if (isWeeklyOff(date, getSettings(mode)) || publicHolidayOn(date)) return undefined;
    const l = approvedLeaveOn(mode, e.id, date);
    return l && !l.half ? `${LEAVE_LABEL[l.type]} leave` : undefined;
};

/** PROTOTYPE-SETUP (Final batch, Slice 1): approved half-day leave on the date (first or second half). */
export const halfLeaveOn = (mode: DataMode, e: MockEmployee, date: string) => approvedLeaveOn(mode, e.id, date)?.half ?? null;

export const publicHolidayOn = (date: string) => {
    const h = holidayOn(date);
    return h?.category === 'public' ? h.title : undefined;
};

// ---- filing periods & entries (PROTOTYPE-SETUP: Timesheet filing) -------------------------------------------
// A filing period is a stored record (TimesheetWeek: weekStart … periodEnd) or, where none is stored, the natural
// period for the company's frequency (day / Monday–Sunday week / month), clipped so it never overlaps a stored one.
// Changing the frequency regroups drafts (regroupDrafts); submitted, approved and sent-back periods keep their dates.

/** An employee's stored periods, sorted by start — cached per stored object (it's replaced on every write). */
const periodIndex = new WeakMap<Record<string, TimesheetWeek>, Map<number, TimesheetWeek[]>>();

export const storedPeriodsOf = (mode: DataMode, e: Pick<MockEmployee, 'id'>): TimesheetWeek[] => {
    const all = atsWeeks.get(mode);
    let index = periodIndex.get(all);
    if (!index) {
        index = new Map();
        Object.values(all)
            .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
            .forEach(w => index!.set(w.employeeId, [...(index!.get(w.employeeId) ?? []), w]));
        periodIndex.set(all, index);
    }
    return index.get(e.id) ?? [];
};

/** The period covering a date: the stored one, else the natural period clipped by the stored ones. */
export const periodBoundsFor = (mode: DataMode, e: Pick<MockEmployee, 'id'>, date: string) => {
    const stored = storedPeriodsOf(mode, e);
    const hit = stored.find(w => w.weekStart <= date && periodEndOf(w) >= date);
    if (hit) return { start: hit.weekStart, end: periodEndOf(hit) };
    const natural = naturalPeriod(date, getSettings(mode).timesheetFiling.frequency);
    return clipPeriod(natural, date, stored.map(w => ({ start: w.weekStart, end: periodEndOf(w) })));
};

/** The filing period (record) covering a date — a new, empty draft when nothing is stored yet. */
export const weekOf = (mode: DataMode, e: MockEmployee, date: string): TimesheetWeek => {
    const { start, end } = periodBoundsFor(mode, e, date);
    return (
        atsWeeks.get(mode)[weekId(e.id, start)] ?? {
            id: weekId(e.id, start),
            employeeId: e.id,
            weekStart: start,
            ...(end !== addDays(start, 6) ? { periodEnd: end } : {}),
            status: 'DRAFT',
            entries: [],
            approvedEntries: null,
            history: [],
        }
    );
};

/** Every filing period overlapping from → to, in order. */
export const periodsBetween = (mode: DataMode, e: MockEmployee, from: string, to: string): TimesheetWeek[] => {
    const out: TimesheetWeek[] = [];
    for (let d = from; d <= to; ) {
        const w = weekOf(mode, e, d);
        out.push(w);
        d = addDays(periodEndOf(w), 1);
    }
    return out;
};

export const periodDates = (w: Pick<TimesheetWeek, 'weekStart' | 'periodEnd'>) => datesBetween(w.weekStart, periodEndOf(w));

export const saveWeek = (mode: DataMode, week: TimesheetWeek) =>
    atsWeeks.update(mode, all => ({ ...all, [week.id]: week }));

/**
 * After the filing frequency changes: every draft period is regrouped into the new periods — its entries move to the
 * period now covering their date, with the draft's history. Submitted, approved and sent-back periods keep their
 * dates (the new periods are clipped around them).
 */
export const regroupDrafts = (mode: DataMode) => {
    const all = atsWeeks.get(mode);
    const drafts = Object.values(all).filter(w => w.status === 'DRAFT');
    if (!drafts.length) return;
    atsWeeks.set(mode, Object.fromEntries(Object.entries(all).filter(([, w]) => w.status !== 'DRAFT')));
    const regrouped: Record<string, TimesheetWeek> = {};
    [...new Set(drafts.map(w => w.employeeId))].forEach(id => {
        const e = findEmployee(id);
        if (!e) return;
        const mine = drafts.filter(w => w.employeeId === id);
        mine.flatMap(w => w.entries).forEach(x => {
            const base = weekOf(mode, e, x.date);
            const end = periodEndOf(base);
            const cur = regrouped[base.id] ?? {
                ...base,
                history: mine
                    .filter(w => w.weekStart <= end && periodEndOf(w) >= base.weekStart)
                    .flatMap(w => w.history)
                    .sort((a, b) => a.at.localeCompare(b.at)),
            };
            regrouped[base.id] = { ...cur, entries: sortEntries([...cur.entries, x]) };
        });
    });
    atsWeeks.update(mode, kept => ({ ...kept, ...regrouped }));
};

export const entriesOn = (mode: DataMode, e: MockEmployee, date: string) =>
    weekOf(mode, e, date).entries.filter(x => x.date === date);

/**
 * PROTOTYPE-SETUP (HR rules, Slice 3): recorded breaks count as logged time (so every checked-in hour is accounted
 * for). Today's running break counts until now.
 */
export const breaksOn = (mode: DataMode, e: MockEmployee, date: string) =>
    hasCheckIn(getSettings(mode).mode) ? recordOf(mode, e, date)?.breaks ?? [] : [];

export const breakRowsOn = (mode: DataMode, e: MockEmployee, date: string): TimesheetBreakRow[] =>
    breaksAsEntries(date, breaksOn(mode, e, date), date === today() ? nowMinutes() : undefined).map(x => {
        const index = Number(x.id.slice('break:'.length));
        const startMinutes = toMinutes(x.start!);
        const endMinutes = Math.max(startMinutes, toMinutes(x.end!));
        const b = breaksOn(mode, e, date)[index];
        return { index, start: x.start!, end: x.end!, startMinutes, endMinutes, minutes: endMinutes - startMinutes, description: b?.description ?? '', running: !b?.end };
    });

/** Entries plus recorded breaks. */
export const loggedOn = (mode: DataMode, e: MockEmployee, date: string) =>
    entriesOn(mode, e, date).reduce((s, x) => s + entryMins(x), 0) + breakRowsOn(mode, e, date).reduce((s, b) => s + b.minutes, 0);

/**
 * PROTOTYPE-SETUP (Final batch, Slice 1): no change requests any more. A period edited after it was sent is a Draft
 * with a baseline; lists flag it ("changePending" = edited after it was sent, until it's approved again).
 */
export const editedAfterSending = (week: TimesheetWeek) => Boolean(week.editedAfter && week.baselineEntries);

export const weekStatusOf = (mode: DataMode, e: MockEmployee, weekStart: string): TimesheetStatus =>
    weekOf(mode, e, weekStart).status;

// ---- attendance days ----------------------------------------------------------------------------------

export const recordOf = (mode: DataMode, e: MockEmployee, date: string) =>
    atsAttendance.get(mode)[recordKey(e.id, date)];

export const saveRecord = (mode: DataMode, record: AttendanceRecord) =>
    atsAttendance.update(mode, all => ({ ...all, [recordKey(record.employeeId, record.date)]: record }));

/**
 * PROTOTYPE-SETUP (HR rules, Slice 1): the latest earlier day (up to 60 days back) the employee is still checked in
 * from — they have to check out of it before checking in again.
 */
export const openSessionBefore = (mode: DataMode, e: MockEmployee, date: string) =>
    Array.from({ length: OPEN_SESSION_LOOKBACK_DAYS }, (_, i) => addDays(date, -(i + 1)))
        .map(d => recordOf(mode, e, d))
        .find(r => r?.checkIn && !r.checkOut);

/** PROTOTYPE-SETUP (Overview, Slice 1) — demo control: clear today's check-in and check-out for both personas. */
export const resetTodayCheckIn = (mode: DataMode) => {
    const keys = [ESS_EMPLOYEE, ESS_MANAGER].map(e => recordKey(e.id, today()));
    atsAttendance.update(mode, all => Object.fromEntries(Object.entries(all).filter(([k]) => !keys.includes(k))));
    return { cleared: keys.length };
};

export const correctionsOf = (mode: DataMode, e: MockEmployee) =>
    atsCorrections
        .get(mode)
        .filter(c => c.employeeId === e.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

const latestCorrectionOn = (mode: DataMode, e: MockEmployee, date: string) =>
    correctionsOf(mode, e).find(c => c.date === date && c.trail.status !== 'CANCELLED');

/** One day of attendance with status, overtime and lock — what every screen shows. */
export const attendanceDay = (mode: DataMode, e: MockEmployee, date: string): AttendanceDay => {
    const settings = getSettings(mode);
    const t = today();
    const locked = isDayLocked(mode, date);
    const lock = locked ? { locked: true, lockReason: lockReasonFor(date) } : { locked: false };
    if (date < e.dateOfJoin) {
        return { date, status: 'upcoming', checkIn: null, checkOut: null, outDays: 0, open: false, carried: false, minutesAtWork: 0, breaks: [], breakMinutes: 0, onBreak: false, lateMinutes: 0, overtimeMinutes: 0, label: 'Before joining', ...lock };
    }
    const timesheetOnly = settings.mode === 'timesheet';
    // PROTOTYPE-SETUP (Overview v4, Slice 5): check-in records are only read when check-in is tracked
    // ('none' keeps them stored but hides them).
    const rec = hasCheckIn(settings.mode) ? recordOf(mode, e, date) : undefined;
    const d = deriveDay({
        date,
        today: t,
        nowMinutes: nowMinutes(),
        checkIn: rec?.checkIn ?? null,
        checkOut: rec?.checkOut ?? null,
        outDays: rec?.outDays ?? 0,
        breaks: rec?.breaks ?? [],
        settings,
        holidayName: publicHolidayOn(date),
        leaveName: leaveNameOn(mode, e, date),
        halfLeave: halfLeaveOn(mode, e, date),
    });
    const logged = loggedOn(mode, e, date);
    let { status, label } = d;
    if (timesheetOnly && logged > 0) {
        if (d.isOffDay) {
            status = 'worked-off-day';
            label = 'Worked on weekly off/holiday';
        } else if (status === 'absent' || status === 'not-checked-in' || status === 'upcoming') status = 'present';
    }
    if (timesheetOnly && status === 'not-checked-in') status = 'upcoming';
    const correction = latestCorrectionOn(mode, e, date);
    return {
        date,
        status,
        checkIn: d.checkIn,
        checkOut: d.checkOut,
        outDays: d.outDays,
        open: d.open,
        carried: d.carried,
        minutesAtWork: d.minutesAtWork,
        breaks: d.breaks,
        breakMinutes: d.breakMinutes,
        onBreak: d.onBreak,
        lateMinutes: d.lateMinutes,
        ...(d.halfLeave ? { halfLeave: d.halfLeave } : {}),
        // PROTOTYPE-SETUP (HR rules, Slice 1): overtime counts to the check-in day, once checked out.
        overtimeMinutes:
            date < t || (date === t && d.checkOut)
                ? overtimeMinutes({ mode: settings.mode, settings, isOffDay: d.isOffDay, checkIn: d.checkIn, checkOut: d.checkOut, outDays: d.outDays, loggedMinutes: logged })
                : 0,
        ...(label ? { label } : {}),
        ...lock,
        ...(correction
            ? { correction: { id: correction.id, state: requestState(correction.trail), statusLabel: trailLabel(correction.trail) } }
            : {}),
    };
};

// ---- timesheet days & weeks -----------------------------------------------------------------------------

export const timesheetDay = (mode: DataMode, e: MockEmployee, date: string, entries: TimesheetEntry[]): TimesheetDay => {
    const settings = getSettings(mode);
    const t = today();
    const attendance = attendanceDay(mode, e, date);
    const dayEntries = sortEntries(entries.filter(x => x.date === date));
    const breaks = hasTimesheets(settings.mode) ? breakRowsOn(mode, e, date) : [];
    const window =
        date < e.dateOfJoin
            ? { kind: 'none' as const, label: 'Before joining', expectedMinutes: 0 }
            : dayWindow({ mode: settings.mode, settings, day: attendance, today: t, dateOfJoin: e.dateOfJoin });
    // PROTOTYPE-SETUP (HR rules, Slice 3): breaks count as logged.
    const logged = dayEntries.reduce((s, x) => s + entryMins(x), 0) + breaks.reduce((s, b) => s + b.minutes, 0);
    const flag = outsideCheckInFlag({ mode: settings.mode, day: attendance, entries: dayEntries });
    const pending = attendance.correction?.state === 'pending' ? attendance.correction : undefined;
    let { locked } = attendance;
    let { lockReason } = attendance;
    if (date < e.dateOfJoin) {
        locked = true;
        lockReason = 'Before your joining date.';
    }
    return {
        date,
        window,
        attendance,
        entries: dayEntries,
        breaks,
        loggedMinutes: logged,
        expectedMinutes: window.expectedMinutes,
        unloggedMinutes: date < t ? Math.max(0, window.expectedMinutes - logged) : 0,
        ...(flag ? { outsideCheckIn: { ...flag, ...(pending ? { pendingCorrection: { id: pending.id, statusLabel: pending.statusLabel } } : {}) } } : {}),
        locked,
        ...(lockReason ? { lockReason } : {}),
    };
};

/** The filing period covering `date` (any day in it), with its days. */
export const weekView = (
    mode: DataMode,
    e: MockEmployee,
    date: string,
    opts: { readOnly?: boolean } = {}
): TimesheetWeekView => {
    const settings = getSettings(mode);
    const week = weekOf(mode, e, date);
    const start = week.weekStart;
    const end = periodEndOf(week);
    const days = periodDates(week).map(d => timesheetDay(mode, e, d, week.entries));
    const allDaysLocked = days.every(d => d.locked);
    const approvalEnabled = settings.timesheetApproval.enabled;
    const manager = managerOf(e);
    const t = today();
    const tracked = hasTimesheets(settings.mode);
    return {
        employee: { ...personRef(e), dateOfJoin: e.dateOfJoin, managerName: manager?.fullName ?? null },
        week,
        days,
        level2: settings.level2.timesheet,
        approvalEnabled,
        submissionWeekday: settings.timesheetApproval.submissionWeekday,
        mode: settings.mode,
        editMode: !hasTimesheets(settings.mode) ? 'read-only' : editModeFor({ approvalEnabled, status: week.status, allDaysLocked, readOnly: opts.readOnly }),
        // PROTOTYPE-SETUP (Timesheet filing): a started draft can be submitted by hand; a sent-back one resubmitted.
        canSubmit: !opts.readOnly && tracked && canSubmitPeriod({ approvalEnabled, status: week.status, allDaysLocked, start, today: t }),
        totals: days.reduce(
            (acc, d) => ({
                loggedMinutes: acc.loggedMinutes + d.loggedMinutes,
                expectedMinutes: acc.expectedMinutes + d.expectedMinutes,
                unloggedMinutes: acc.unloggedMinutes + d.unloggedMinutes,
            }),
            { loggedMinutes: 0, expectedMinutes: 0, unloggedMinutes: 0 }
        ),
        filing: {
            frequency: settings.timesheetFiling.frequency,
            fields: settings.timesheetFiling.fields,
            projectCodes: settings.timesheetFiling.projectCodes,
            period: { start, end, label: periodLabel(start, end) },
            autoSubmitOn: tracked && week.status === 'DRAFT' ? autoSubmitDateFor({ start, end }, settings, t) : null,
            autoSubmitAt: settings.timesheetApproval.submissionTime,
        },
    };
};

/** Every filing period overlapping from → to, as full views. */
export const periodViews = (mode: DataMode, e: MockEmployee, from: string, to: string, opts: { readOnly?: boolean } = {}) =>
    periodsBetween(mode, e, from, to).map(w => weekView(mode, e, w.weekStart, opts));

// ---- overtime ---------------------------------------------------------------------------------------------

export const overtimeOfEmployee = (mode: DataMode, e: MockEmployee) =>
    atsOvertime
        .get(mode)
        .filter(o => o.employeeId === e.id)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

export const overtimeContext = (mode: DataMode, e: MockEmployee, date: string): OvertimeContext => {
    const settings = getSettings(mode);
    const day = attendanceDay(mode, e, date);
    const t = today();
    return {
        date,
        basis: overtimeBasisFor(settings.mode),
        checkIn: day.checkIn,
        checkOut: day.checkOut,
        outDays: day.outDays,
        open: day.open,
        pendingCorrection: day.correction?.state === 'pending',
        minutesAtWork: day.minutesAtWork,
        loggedMinutes: loggedOn(mode, e, date),
        extraMinutes: day.overtimeMinutes,
        dayCompleted: date < t || (date === t && Boolean(day.checkOut)),
    };
};

/** Requests that still count (not rejected or cancelled). */
export const activeOvertimeOn = (mode: DataMode, e: MockEmployee, date: string) =>
    overtimeOfEmployee(mode, e).find(o => o.date === date && o.trail.status !== 'REJECTED' && o.trail.status !== 'CANCELLED');

// ---- helpers for views -------------------------------------------------------------------------------

export const monthLabelOf = monthLabel;

export const findEmployeeOr404 = (id: string | number | undefined) => findEmployee(id);

/** An employee's filing periods overlapping a month (from their joining date), with their status. */
export const weeksSummary = (mode: DataMode, e: MockEmployee, month: string): PeriodSummary[] => {
    const { first, last } = monthBounds(month);
    const from = e.dateOfJoin > first ? e.dateOfJoin : first;
    if (from > last) return [];
    return periodsBetween(mode, e, from, last).map(w => ({
        weekStart: w.weekStart,
        periodEnd: periodEndOf(w),
        status: w.status,
        changePending: editedAfterSending(w),
    }));
};
