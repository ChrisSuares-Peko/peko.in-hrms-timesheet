// PROTOTYPE-SETUP: ESS Service 1 — stateful Attendance & Timesheet data (persisted per data mode, see
// persistentStore.ts) and the read-side derivations every endpoint shares. All business rules come from
// src/prototype/rules/attendance.ts; this file only looks things up and assembles views.
import type {
    AtsSettings,
    AttendanceCorrection,
    AttendanceDay,
    AttendanceRecord,
    ChangeRequest,
    OvertimeContext,
    OvertimeRequest,
    PersonRef,
    TimesheetDay,
    TimesheetEntry,
    TimesheetStatus,
    TimesheetWeek,
    TimesheetWeekView,
} from '@src/domains/attendanceTimesheet/types';
import {
    DEFAULT_SETTINGS,
    addDays,
    addMonths,
    canSubmitWeek,
    dayWindow,
    deriveDay,
    editModeFor,
    entryMinutes,
    lockReasonFor,
    monthLabel,
    monthOf,
    outsideCheckInFlag,
    overtimeBasisFor,
    overtimeMinutes,
    requestState,
    trailLabel,
    weekDates,
    weekStartOf,
} from '@src/prototype/rules/attendance';

import { createCollection } from './persistentStore';
import { leavesLive } from './requestStores';
import { buildAtsSeed, recordKey, weekId } from '../data/ats-seed';
import { isoDateTime, monthsAgo, toIsoDate } from '../data/dates';
import { EMPLOYEES, MockEmployee, findEmployee, managerOf } from '../data/employees';
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

export const atsChangeRequests = createCollection<ChangeRequest[]>('ats-change-requests', mode =>
    mode === 'empty' ? [] : buildAtsSeed().changeRequests
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

export const getSettings = (mode: DataMode) => atsSettings.get(mode);

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

/** Full-day approved leave on the date (half-day leave is a working half-day). */
export const leaveNameOn = (mode: DataMode, e: MockEmployee, date: string) =>
    leavesLive(mode).find(
        l => l.employee.id === e.id && l.status === 'approved' && l.halfDaySelection === null && l.days.includes(date)
    )?.type.name;

export const publicHolidayOn = (date: string) => {
    const h = holidayOn(date);
    return h?.category === 'public' ? h.title : undefined;
};

// ---- weeks & entries -----------------------------------------------------------------------------------

export const weekOf = (mode: DataMode, e: MockEmployee, weekStart: string): TimesheetWeek =>
    atsWeeks.get(mode)[weekId(e.id, weekStart)] ?? {
        id: weekId(e.id, weekStart),
        employeeId: e.id,
        weekStart,
        status: 'DRAFT',
        entries: [],
        approvedEntries: null,
        history: [],
    };

export const saveWeek = (mode: DataMode, week: TimesheetWeek) =>
    atsWeeks.update(mode, all => ({ ...all, [week.id]: week }));

export const entriesOn = (mode: DataMode, e: MockEmployee, date: string) =>
    weekOf(mode, e, weekStartOf(date))
        .entries.filter(x => x.date === date)
        .sort((a, b) => a.start.localeCompare(b.start));

export const loggedOn = (mode: DataMode, e: MockEmployee, date: string) =>
    entriesOn(mode, e, date).reduce((s, x) => s + entryMinutes(x), 0);

export const pendingChangeRequest = (mode: DataMode, week: TimesheetWeek) =>
    week.pendingChangeRequestId
        ? atsChangeRequests.get(mode).find(c => c.id === week.pendingChangeRequestId && c.status === 'PENDING') ?? null
        : null;

/** The pending change request, or the most recent decided one. */
export const latestChangeRequest = (mode: DataMode, week: TimesheetWeek) =>
    pendingChangeRequest(mode, week) ??
    atsChangeRequests
        .get(mode)
        .filter(c => c.weekId === week.id)
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0] ??
    null;

export const weekStatusOf = (mode: DataMode, e: MockEmployee, weekStart: string): TimesheetStatus =>
    weekOf(mode, e, weekStart).status;

// ---- attendance days ----------------------------------------------------------------------------------

export const recordOf = (mode: DataMode, e: MockEmployee, date: string) =>
    atsAttendance.get(mode)[recordKey(e.id, date)];

export const saveRecord = (mode: DataMode, record: AttendanceRecord) =>
    atsAttendance.update(mode, all => ({ ...all, [recordKey(record.employeeId, record.date)]: record }));

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
        return { date, status: 'upcoming', checkIn: null, checkOut: null, checkOutAuto: false, minutesAtWork: 0, lateMinutes: 0, overtimeMinutes: 0, label: 'Before joining', ...lock };
    }
    const timesheetOnly = settings.mode === 'timesheet';
    const rec = timesheetOnly ? undefined : recordOf(mode, e, date);
    const d = deriveDay({
        date,
        today: t,
        nowMinutes: nowMinutes(),
        checkIn: rec?.checkIn ?? null,
        checkOut: rec?.checkOut ?? null,
        settings,
        holidayName: publicHolidayOn(date),
        leaveName: leaveNameOn(mode, e, date),
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
        checkOutAuto: d.checkOutAuto,
        minutesAtWork: d.minutesAtWork,
        lateMinutes: d.lateMinutes,
        overtimeMinutes:
            date < t || (date === t && d.checkOut)
                ? overtimeMinutes({ mode: settings.mode, settings, isOffDay: d.isOffDay, checkIn: d.checkIn, checkOut: d.checkOut, loggedMinutes: logged })
                : 0,
        ...(label ? { label } : {}),
        ...lock,
        ...(correction
            ? { correction: { id: correction.id, kind: correction.kind, state: requestState(correction.trail), statusLabel: trailLabel(correction.trail) } }
            : {}),
    };
};

// ---- timesheet days & weeks -----------------------------------------------------------------------------

export const timesheetDay = (mode: DataMode, e: MockEmployee, date: string, entries: TimesheetEntry[]): TimesheetDay => {
    const settings = getSettings(mode);
    const t = today();
    const attendance = attendanceDay(mode, e, date);
    const dayEntries = entries.filter(x => x.date === date).sort((a, b) => a.start.localeCompare(b.start));
    const window =
        date < e.dateOfJoin
            ? { kind: 'none' as const, label: 'Before joining', expectedMinutes: 0 }
            : dayWindow({ mode: settings.mode, settings, day: attendance, today: t });
    const logged = dayEntries.reduce((s, x) => s + entryMinutes(x), 0);
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
        loggedMinutes: logged,
        expectedMinutes: window.expectedMinutes,
        unloggedMinutes: date < t ? Math.max(0, window.expectedMinutes - logged) : 0,
        ...(flag ? { outsideCheckIn: { ...flag, ...(pending ? { pendingCorrection: { id: pending.id, statusLabel: pending.statusLabel } } : {}) } } : {}),
        locked,
        ...(lockReason ? { lockReason } : {}),
    };
};

export const weekView = (
    mode: DataMode,
    e: MockEmployee,
    weekStart: string,
    opts: { readOnly?: boolean } = {}
): TimesheetWeekView => {
    const settings = getSettings(mode);
    const week = weekOf(mode, e, weekStart);
    const days = weekDates(weekStart).map(d => timesheetDay(mode, e, d, week.entries));
    const allDaysLocked = days.every(d => d.locked);
    const approvalEnabled = settings.timesheetApproval.enabled;
    const manager = managerOf(e);
    return {
        employee: { ...personRef(e), dateOfJoin: e.dateOfJoin, managerName: manager?.fullName ?? null },
        week,
        days,
        changeRequest: latestChangeRequest(mode, week),
        approvalEnabled,
        submissionWeekday: settings.timesheetApproval.submissionWeekday,
        mode: settings.mode,
        editMode: settings.mode === 'attendance' ? 'read-only' : editModeFor({ approvalEnabled, status: week.status, allDaysLocked, readOnly: opts.readOnly }),
        canSubmit:
            !opts.readOnly &&
            settings.mode !== 'attendance' &&
            weekStart <= weekStartOf(today()) &&
            canSubmitWeek({ approvalEnabled, status: week.status, allDaysLocked }),
        totals: days.reduce(
            (acc, d) => ({
                loggedMinutes: acc.loggedMinutes + d.loggedMinutes,
                expectedMinutes: acc.expectedMinutes + d.expectedMinutes,
                unloggedMinutes: acc.unloggedMinutes + d.unloggedMinutes,
            }),
            { loggedMinutes: 0, expectedMinutes: 0, unloggedMinutes: 0 }
        ),
    };
};

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
        checkOutAuto: day.checkOutAuto,
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

/** Weeks of an employee overlapping a month, with their status. */
export const weeksSummary = (mode: DataMode, e: MockEmployee, weekStarts: string[]) =>
    weekStarts
        .filter(ws => addDays(ws, 6) >= e.dateOfJoin)
        .map(ws => {
            const w = weekOf(mode, e, ws);
            return { weekStart: ws, status: w.status, changePending: Boolean(pendingChangeRequest(mode, w)) };
        });
