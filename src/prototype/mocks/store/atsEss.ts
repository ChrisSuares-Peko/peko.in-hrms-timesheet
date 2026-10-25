// PROTOTYPE-SETUP: ESS Service 1 — what an employee sees and does in Attendance & Timesheet (ESS - Employee and
// ESS - Manager's own section). Rules: src/prototype/rules/attendance.ts. Rule breaks throw RuleError; the
// handlers turn them into HTTP errors.
import type {
    AtsOverview,
    AttendanceDay,
    LateDeduction,
    AttendanceCorrection,
    AttendanceBreak,
    AttendanceMonthView,
    AttendanceTotals,
    CorrectionInput,
    HistoryEvent,
    OvertimeInput,
    OvertimeRequest,
    OvertimeSuggestion,
    OvertimeView,
    TimesheetEntry,
    TimesheetEntryInput,
    TimesheetMonthView,
    TimesheetNotices,
    TimesheetWeek,
    TimesheetWeekView,
    SubmittedAttendanceDay,
    WorkLocation,
} from '@src/domains/attendanceTimesheet/types';
import {
    RuleError,
    resubmitTrail,
    addDays,
    addLocationStamp,
    dayLocations,
    whereOf,
    cancelTrail,
    BREAK_MESSAGES,
    breaksAsEntries,
    leaveRowsAsEntries,
    checkOutMinutes,
    daysBetween,
    displayTime,
    displayTimeOn,
    entryMins,
    entryTimeText,
    formatDuration,
    sortEntries,
    hasCheckIn,
    hasTimesheets,
    hasTracking,
    isWeeklyOff,
    qualifyingOvertime,
    lockReasonFor,
    monthBounds,
    monthDates,
    monthLabel,
    overtimeBasisFor,
    shouldSuggestOvertime,
    startTrail,
    tabsFor,
    titleFor,
    toMinutes,
    trailLabel,
    validateEntry,
    validateBreaks,
    validateOvertimeInput,
} from '@src/prototype/rules/attendance';
import {
    EDITED_AFTER_TEXT,
    SubmissionAcknowledgement,
    canSubmitPeriod,
    editedBack,
    submittedStatus,
    gapCount,
    periodEndOf,
    periodKind,
    periodLabel,
    datesBetween,
    dayState,
    markDirty,
    reviewPeriod,
    reviewSummary,
} from '@src/prototype/rules/timesheetFiling';
import {
    EXPORT_COLUMNS,
    ImportContext,
    ImportPreview,
    analyseImport,
    exportBreakRow,
    exportEntryRow,
    exportLeaveRow,
    exportRangeError,
    exportStatus,
} from '@src/prototype/rules/timesheetImport';

import { leaveViewOf } from './atsLeave';
import {
    activeOvertimeOn,
    atsCorrections,
    atsOvertime,
    attendanceDay,
    clockNow,
    correctionsOf,
    currentMonth,
    dayLabel,
    getSettings,
    isDayLocked,
    loggedOn,
    managerRef,
    nowIso,
    nowMinutes,
    openSessionBefore,
    overtimeContext,
    overtimeOfEmployee,
    periodDates,
    periodsBetween,
    recordOf,
    saveRecord,
    saveWeek,
    timesheetDay,
    today,
    weekOf,
    weekView,
    weeksSummary,
    atsWorkingFrom,
    breaksOn,
    leaveRowsOn,
    editedAfterSending,
    entriesOn,
    storedPeriodsOf,
} from './atsStore';
import { SYSTEM_ACTOR, actorOf } from '../data/ats-seed';
import { MockEmployee } from '../data/employees';
import type { DataMode } from '../envelope';

// PROTOTYPE-SETUP (Overview v4, Slice 5): 'none' mode — nothing is tracked.
const NOT_TRACKED = 'Your company doesn’t track attendance or timesheets.';
const checkInOffMessage = (m: Parameters<typeof hasTracking>[0]) =>
    hasTracking(m) ? 'Check-in is turned off — your company uses timesheets only.' : NOT_TRACKED;

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

const event = (e: MockEmployee, action: HistoryEvent['action'], detail?: string): HistoryEvent => ({
    at: nowIso(),
    actor: actorOf(e, 'EMPLOYEE'),
    action,
    ...(detail ? { detail } : {}),
});

// PROTOTYPE-SETUP (V2): hours-only entries have no times — label them by their hours.
const entryLabel = (x: Pick<TimesheetEntry, 'date' | 'start' | 'end' | 'startNext' | 'endNext' | 'mins'>) =>
    x.start && x.end ? `${dayLabel(x.date)} ${entryTimeText(x)}` : `${dayLabel(x.date)} ${formatDuration(entryMins(x))} (no set time)`;

// ---- overview & attendance --------------------------------------------------------------------------

/**
 * PROTOTYPE-SETUP (Final batch, Slice 5): late check-in deductions by date (this leave year), when check-in is tracked
 * and deductions are on — added to the attendance days the screens show.
 */
export const lateDeductionsByDate = (mode: DataMode, e: MockEmployee) => {
    const settings = getSettings(mode);
    if (!hasCheckIn(settings.mode) || !settings.lateDeductionDays) return new Map<string, LateDeduction>();
    return new Map(leaveViewOf(mode, e).lateDeductions.map(d => [d.date, d]));
};

const withLateDeduction =
    (late: Map<string, LateDeduction>) =>
    <D extends AttendanceDay>(d: D): D => {
        const x = late.get(d.date);
        return x ? { ...d, lateDeduction: { days: x.days, from: x.from, state: x.state, ...(x.reversedOn ? { reversedOn: x.reversedOn } : {}) } } : d;
    };

export const overviewOf = (mode: DataMode, e: MockEmployee): AtsOverview => {
    const settings = getSettings(mode);
    const t = today();
    const day = withLateDeduction(lateDeductionsByDate(mode, e))(attendanceDay(mode, e, t));
    const rec = recordOf(mode, e, t);
    const punch = hasCheckIn(settings.mode);
    // PROTOTYPE-SETUP (HR rules, Slice 1): an earlier day still checked in blocks today's check-in.
    const open = punch ? openSessionBefore(mode, e, t) : undefined;
    const canCheckIn = punch && !rec?.checkIn && !open && day.status !== 'on-leave';
    const canCheckOut = punch && Boolean(rec?.checkIn) && !rec?.checkOut;
    const canEndBreak = canCheckOut && day.onBreak;
    let hint: string | undefined;
    if (punch && open) hint = `Check out from ${dayLabel(open.date)} first.`;
    else if (punch && day.status === 'on-leave') hint = `You're on ${day.label ?? 'leave'} today.`;
    else if (punch && rec?.checkOut) hint = `Checked out at ${displayTime(rec.checkOut)}.`;
    const thisWeek = weekView(mode, e, t);
    const ws = thisWeek.week.weekStart;
    const view = overtimeViewOf(mode, e, currentMonth());
    return {
        mode: settings.mode,
        title: titleFor(settings.mode),
        tabs: tabsFor(settings.mode),
        today: {
            ...day,
            canCheckIn,
            canCheckOut,
            canStartBreak: canCheckOut && !day.onBreak,
            canEndBreak,
            ...(open?.checkIn ? { openFrom: { date: open.date, checkIn: open.checkIn } } : {}),
            ...(hint ? { hint } : {}),
            loggedMinutes: loggedOn(mode, e, t),
            ...(settings.mode === 'attendance' ? { workingFrom: workingFromOf(mode, e) } : {}),
        },
        shift: settings.shift,
        graceMinutes: settings.graceMinutes,
        approvalEnabled: settings.timesheetApproval.enabled,
        // PROTOTYPE-SETUP (Timesheet filing): the filing period covering today (any frequency).
        thisWeek: {
            weekStart: ws,
            periodEnd: periodEndOf(thisWeek.week),
            label: thisWeek.filing.period.label,
            frequency: periodKind(ws, periodEndOf(thisWeek.week), thisWeek.filing.frequency),
            status: thisWeek.week.status,
            loggedMinutes: thisWeek.totals.loggedMinutes,
            expectedMinutes: thisWeek.totals.expectedMinutes,
            autoSubmitOn: thisWeek.filing.autoSubmitOn,
        },
        counts: {
            pendingCorrections: correctionsOf(mode, e).filter(c => c.trail.status.startsWith('PENDING')).length,
            suggestedOvertime: view.stats.suggestedCount,
            pendingOvertime: view.stats.waitingCount,
        },
    };
};

/**
 * Ends a running break at `at`. A break that would end where it started (ended in the same minute, or a session closed
 * on a later day) is dropped — a zero-length break can't be saved in Edit breaks (HR rules, Slice 5).
 */
const endRunningBreak = (breaks: AttendanceBreak[] | undefined, at: string): AttendanceBreak[] =>
    (breaks ?? []).flatMap(b => {
        if (b.end) return [b];
        return toMinutes(at) > toMinutes(b.start) ? [{ ...b, end: at }] : [];
    });

export const checkIn = (mode: DataMode, e: MockEmployee) => {
    const settings = getSettings(mode);
    if (!hasCheckIn(settings.mode)) throw new RuleError(checkInOffMessage(settings.mode));
    const t = today();
    if (recordOf(mode, e, t)?.checkIn) throw new RuleError("You've already checked in today.");
    // PROTOTYPE-SETUP (HR rules, Slice 1): no automatic check-out — the earlier day has to be checked out first.
    const open = openSessionBefore(mode, e, t);
    if (open) throw new RuleError(`Check out from ${dayLabel(open.date)} first.`);
    if (attendanceDay(mode, e, t).status === 'on-leave') throw new RuleError("You're on approved leave today.");
    const at = clockNow();
    // PROTOTYPE-SETUP (Final batch, Slice 2): Attendance only mode — the location picked before check-in starts the trail.
    const locations = settings.mode === 'attendance' ? [{ at, ...(atsWorkingFrom.get(mode)[e.id] ?? { location: 'OFFICE' as const }) }] : undefined;
    saveRecord(mode, { employeeId: e.id, date: t, checkIn: at, checkOut: null, outDays: 0, breaks: [], source: 'ess', ...(locations ? { locations } : {}) });
    return overviewOf(mode, e);
};

// ---- where they work from (PROTOTYPE-SETUP: Final batch, Slice 2) ----------------------------------------

/** Where they're working from: the latest stamp today (checked in), else what they picked (default Office). */
const workingFromOf = (mode: DataMode, e: MockEmployee) => {
    const rec = recordOf(mode, e, today());
    const last = rec?.checkIn ? dayLocations(rec.locations, rec.checkIn).at(-1) : undefined;
    const w = last ?? atsWorkingFrom.get(mode)[e.id] ?? { location: 'OFFICE' as const };
    return { location: w.location, ...(w.client ? { client: w.client } : {}) };
};

/**
 * "Working from" (Attendance only mode): before check-in it's remembered for the check-in; while checked in a change
 * is added to today's trail with the time; after check-out the day's trail is final.
 */
export const setWorkingFrom = (mode: DataMode, e: MockEmployee, body: { location?: WorkLocation | null; client?: string | null } | undefined) => {
    if (getSettings(mode).mode !== 'attendance') throw new RuleError('Work location is only asked for when your company tracks attendance only.');
    const where = whereOf(body ?? {});
    const t = today();
    const rec = recordOf(mode, e, t);
    if (rec?.checkOut) throw new RuleError('You’ve checked out for today.');
    atsWorkingFrom.update(mode, all => ({ ...all, [e.id]: where }));
    if (rec?.checkIn) saveRecord(mode, { ...rec, locations: addLocationStamp(dayLocations(rec.locations, rec.checkIn), { at: clockNow(), ...where }) });
    return overviewOf(mode, e);
};

export const checkOut = (mode: DataMode, e: MockEmployee) => {
    const t = today();
    const rec = recordOf(mode, e, t);
    if (!rec?.checkIn) throw new RuleError("You haven't checked in today.");
    if (rec.checkOut) throw new RuleError("You've already checked out today.");
    const now = clockNow();
    const out = toMinutes(now) > toMinutes(rec.checkIn) ? now : rec.checkIn;
    // Checking out ends a running break.
    saveRecord(mode, { ...rec, checkOut: out, outDays: 0, breaks: endRunningBreak(rec.breaks, out) });
    return overviewOf(mode, e);
};

/**
 * PROTOTYPE-SETUP (HR rules, Slice 1): checks out of the earlier day still open — today's current time becomes its
 * check-out, with outDays = the days between (Friday closed on Monday = 3). A break still running is dropped.
 * The employee can request a correction if that's not when they left.
 */
export const checkOutPrevious = (mode: DataMode, e: MockEmployee) => {
    const settings = getSettings(mode);
    if (!hasCheckIn(settings.mode)) throw new RuleError(checkInOffMessage(settings.mode));
    const t = today();
    const open = openSessionBefore(mode, e, t);
    if (!open?.checkIn) throw new RuleError("You're not checked in from an earlier day.");
    const out = clockNow();
    const outDays = daysBetween(open.date, t);
    saveRecord(mode, { ...open, checkOut: out, outDays, breaks: endRunningBreak(open.breaks, '00:00') });
    return overviewOf(mode, e);
};

// ---- breaks (PROTOTYPE-SETUP: HR rules, Slice 1) ---------------------------------------------------------

const todaysOpenRecord = (mode: DataMode, e: MockEmployee) => {
    const rec = recordOf(mode, e, today());
    if (!rec?.checkIn || rec.checkOut) throw new RuleError(BREAK_MESSAGES.notCheckedIn);
    return rec;
};

/** Start break: only while checked in today, and not already on one. */
export const startBreak = (mode: DataMode, e: MockEmployee) => {
    const rec = todaysOpenRecord(mode, e);
    if ((rec.breaks ?? []).some(b => !b.end)) throw new RuleError(BREAK_MESSAGES.onBreak);
    saveRecord(mode, { ...rec, breaks: [...(rec.breaks ?? []), { start: clockNow(), end: null }] });
    return overviewOf(mode, e);
};

/** End break: ends the running break now. */
export const endBreak = (mode: DataMode, e: MockEmployee) => {
    const rec = todaysOpenRecord(mode, e);
    if (!(rec.breaks ?? []).some(b => !b.end)) throw new RuleError(BREAK_MESSAGES.noBreak);
    saveRecord(mode, { ...rec, breaks: endRunningBreak(rec.breaks, clockNow()) });
    return overviewOf(mode, e);
};

/**
 * Edit today's breaks directly (start, end, description; no overlaps; within check-in → check-out or now).
 * Past days' breaks change only through a correction request.
 */
export const updateTodayBreaks = (mode: DataMode, e: MockEmployee, input: { breaks?: AttendanceBreak[] }) => {
    const rec = recordOf(mode, e, today());
    if (!rec?.checkIn) throw new RuleError(BREAK_MESSAGES.notCheckedIn);
    const breaks = validateBreaks(input?.breaks ?? [], { checkIn: rec.checkIn, checkOut: rec.checkOut, nowMinutes: Math.max(toMinutes(rec.checkIn), nowMinutes()) });
    saveRecord(mode, { ...rec, breaks });
    return overviewOf(mode, e);
};

/**
 * PROTOTYPE-SETUP (HR rules, Slice 3): a break's description, from the timesheet ("Add description"). Any unlocked
 * day; the times themselves don't change here.
 */
export const updateBreakDescription = (mode: DataMode, e: MockEmployee, date: string, index: number, input: { description?: string }) => {
    if (isDayLocked(mode, date)) throw new RuleError(lockReasonFor(date));
    const rec = recordOf(mode, e, date);
    const target = rec?.breaks?.[index];
    if (!rec || !target) throw new RuleError('Break not found.', 404);
    const description = input?.description?.trim().slice(0, 200) ?? '';
    saveRecord(mode, { ...rec, breaks: rec.breaks!.map((b, i) => (i === index ? { start: b.start, end: b.end, ...(description ? { description } : {}) } : b)) });
    return weekView(mode, e, date);
};

const emptyTotals = (): AttendanceTotals => ({
    present: 0,
    late: 0,
    halfDay: 0,
    absent: 0,
    onLeave: 0,
    holidays: 0,
    weeklyOff: 0,
    workedOffDays: 0,
    breakMinutes: 0,
    minutesAtWork: 0,
    overtimeMinutes: 0,
    lateMinutes: 0,
});

export const attendanceMonthOf = (
    mode: DataMode,
    e: MockEmployee,
    month: string,
    // PROTOTYPE-SETUP (Attendance tab, Slice 3): the employee's Attendance tab shows only overtime that reaches the
    // HR minimum (days and the month's total). The manager's member view is unchanged.
    opts: { overtimeAtMinimum?: boolean } = {}
): AttendanceMonthView => {
    const settings = getSettings(mode);
    const minimum = settings.overtimeMinimumMinutes;
    const late = withLateDeduction(lateDeductionsByDate(mode, e));
    const days = monthDates(month)
        .map(d => late(attendanceDay(mode, e, d)))
        .map(d => (opts.overtimeAtMinimum ? { ...d, overtimeMinutes: qualifyingOvertime(d.overtimeMinutes, minimum) } : d));
    const totals = days.reduce((acc, d) => {
        // PROTOTYPE-SETUP (HR rules, Slice 2): days still checked in aren't counted yet.
        const counted = !d.open;
        const next = {
            ...acc,
            minutesAtWork: acc.minutesAtWork + (counted ? d.minutesAtWork : 0),
            breakMinutes: acc.breakMinutes + (counted ? d.breakMinutes : 0),
            overtimeMinutes: acc.overtimeMinutes + d.overtimeMinutes,
            lateMinutes: acc.lateMinutes + d.lateMinutes,
        };
        if (d.status === 'present') next.present += 1;
        if (d.status === 'late') next.late += 1;
        if (d.status === 'half-day') next.halfDay += 1;
        if (d.status === 'absent') next.absent += 1;
        if (d.status === 'on-leave') next.onLeave += 1;
        // PROTOTYPE-SETUP (Attendance final, Slice 2): weekday holidays only.
        if (d.status === 'holiday' && !isWeeklyOff(d.date, settings)) next.holidays += 1;
        if (d.status === 'weekly-off') next.weeklyOff += 1;
        if (d.status === 'worked-off-day') next.workedOffDays += 1;
        return next;
    }, emptyTotals());
    const locked = isDayLocked(mode, monthBounds(month).first);
    return { month, monthLabel: monthLabel(month), days, totals, locked, ...(locked ? { lockReason: lockReasonFor(monthBounds(month).first) } : {}) };
};

// ---- attendance corrections ---------------------------------------------------------------------------

export const correctionsView = (mode: DataMode, e: MockEmployee) =>
    correctionsOf(mode, e).map(c => ({ ...c, statusLabel: trailLabel(c.trail) }));

const HHMM = /^\d{2}:\d{2}$/;

/**
 * PROTOTYPE-SETUP (HR rules, Slice 1): every attendance change is a correction request — the reporting manager,
 * then Payroll. outDays: 0 = check-out the same day, 1 = the next day. A day still checked in has to be checked out
 * first. A past break's change is mentioned in the reason.
 */
/**
 * The checks an attendance correction passes (the form's, and a resubmission's): date, lock, reason, the requested
 * times. Returns the day as recorded and the requested times.
 */
const checkCorrection = (mode: DataMode, e: MockEmployee, input: CorrectionInput) => {
    const settings = getSettings(mode);
    if (!hasCheckIn(settings.mode)) {
        throw new RuleError(hasTracking(settings.mode) ? 'Attendance corrections are off — your company uses timesheets only.' : NOT_TRACKED);
    }
    const t = today();
    if (!input?.date || input.date > t) throw new RuleError('Pick today or an earlier day.', 400);
    if (input.date < e.dateOfJoin) throw new RuleError('That day is before your joining date.', 400);
    if (isDayLocked(mode, input.date)) throw new RuleError(lockReasonFor(input.date));
    const reason = input.reason?.trim();
    if (!reason) throw new RuleError('Add a reason for the correction.', 400);
    const day = attendanceDay(mode, e, input.date);
    if (day.open) {
        throw new RuleError(day.carried ? 'Still checked in. Check out from the Today panel first.' : 'Check out first, then request a correction.');
    }
    const requestedIn = input.checkIn ?? day.checkIn;
    const requestedOut = input.checkOut ?? day.checkOut;
    const outDays = input.outDays ?? (input.checkOut === undefined ? day.outDays : 0);
    if (!requestedIn && !requestedOut) throw new RuleError('Enter the check-in or check-out time.', 400);
    if ((requestedIn && !HHMM.test(requestedIn)) || (requestedOut && !HHMM.test(requestedOut))) {
        throw new RuleError('Enter times as HH:mm.', 400);
    }
    if (!Number.isInteger(outDays) || outDays < 0 || outDays > 1) throw new RuleError('Check-out can be the same day or the next day.', 400);
    if (requestedIn && requestedOut && checkOutMinutes(requestedOut, outDays) <= toMinutes(requestedIn)) {
        throw new RuleError('Check-out must be after check-in. If you left after midnight, choose “Next day”.', 400);
    }
    if (requestedIn === day.checkIn && requestedOut === day.checkOut && outDays === day.outDays) {
        throw new RuleError('Those are already the recorded times.', 400);
    }
    return { day, reason, requested: { checkIn: requestedIn, checkOut: requestedOut, outDays: requestedOut ? outDays : 0 } };
};

export const createCorrection = (mode: DataMode, e: MockEmployee, input: CorrectionInput): AttendanceCorrection => {
    const settings = getSettings(mode);
    const { day, reason, requested } = checkCorrection(mode, e, input);
    if (correctionsOf(mode, e).some(c => c.date === input.date && c.trail.status.startsWith('PENDING'))) {
        throw new RuleError(`A correction for ${dayLabel(input.date)} is already waiting for approval.`);
    }
    const at = nowIso();
    const correction: AttendanceCorrection = {
        id: `ac-${Date.now().toString(36)}`,
        employeeId: e.id,
        date: input.date,
        current: { checkIn: day.checkIn, checkOut: day.checkOut, outDays: day.outDays },
        requested,
        reason,
        ...(input.fromTimesheet ? { fromTimesheet: true } : {}),
        trail: startTrail('attendance', managerRef(e), settings),
        createdAt: at,
        updatedAt: at,
    };
    atsCorrections.update(mode, list => [correction, ...list]);
    return correction;
};

export const cancelCorrection = (mode: DataMode, e: MockEmployee, id: string) => {
    const c = atsCorrections.get(mode).find(x => x.id === id && x.employeeId === e.id);
    if (!c) throw new RuleError('Correction not found.', 404);
    const trail = cancelTrail(c.trail);
    atsCorrections.update(mode, list => list.map(x => (x.id === id ? { ...x, trail, updatedAt: nowIso() } : x)));
    return correctionsView(mode, e);
};

/**
 * PROTOTYPE-SETUP (My team, Slice 1): the employee updates a correction they were asked to update and sends it again —
 * the same checks as a new one; it starts again at the manager.
 */
export const resubmitCorrection = (mode: DataMode, e: MockEmployee, id: string, input: Partial<CorrectionInput> | undefined) => {
    const c = atsCorrections.get(mode).find(x => x.id === id && x.employeeId === e.id);
    if (!c) throw new RuleError('Correction not found.', 404);
    const { day, reason, requested } = checkCorrection(mode, e, { ...(input ?? {}), date: c.date } as CorrectionInput);
    const at = nowIso();
    const trail = resubmitTrail(c.trail, at, e.fullName);
    atsCorrections.update(mode, list =>
        list.map(x => (x.id === id ? { ...x, current: { checkIn: day.checkIn, checkOut: day.checkOut, outDays: day.outDays }, requested, reason, trail, updatedAt: at } : x))
    );
    return correctionsView(mode, e);
};

// ---- timesheet entries ------------------------------------------------------------------------------
// PROTOTYPE-SETUP (Timesheet filing): entries belong to the filing period covering their date (a day, a week or a
// month) and are validated against the company's fields (validateEntry with settings.timesheetFiling.fields).

const assertTimesheets = (mode: DataMode) => {
    if (!hasTimesheets(getSettings(mode).mode)) {
        throw new RuleError(hasTracking(getSettings(mode).mode) ? 'Timesheets are turned off — your company uses attendance only.' : NOT_TRACKED);
    }
};

const assertDayEditable = (mode: DataMode, e: MockEmployee, date: string) => {
    if (date < e.dateOfJoin) throw new RuleError('That day is before your joining date.', 400);
    if (isDayLocked(mode, date)) throw new RuleError(lockReasonFor(date));
};

/** PROTOTYPE-SETUP (HR rules, Slice 3): entries can't overlap recorded breaks either. */
const withBreaks = (mode: DataMode, e: MockEmployee, date: string | undefined, entries: TimesheetEntry[]) =>
    date
        ? [
              ...entries,
              ...breaksAsEntries(date, breaksOn(mode, e, date), date === today() ? nowMinutes() : undefined),
              // PROTOTYPE-SETUP (Leave & team, Slice 1): leave / public-holiday rows block overlapping entries.
              ...leaveRowsAsEntries(date, leaveRowsOn(mode, e, date)),
          ]
        : entries;

const fieldsOf = (mode: DataMode) => getSettings(mode).timesheetFiling.fields;

/**
 * PROTOTYPE-SETUP (Final batch, Slice 1): every entry change saves straight away, in any status, until payroll is
 * processed for the month. A change to a period that's with the manager, with Payroll or approved moves it back to
 * Draft with a baseline (what reviewers compare with) — it has to be submitted again.
 */
const saveEdited = (mode: DataMode, e: MockEmployee, week: TimesheetWeek, entries: TimesheetEntry[], change: HistoryEvent, dates: string[]) => {
    // PROTOTYPE-SETUP (Timesheet v6, Slice 1): the changed dates show as "Saved" until the next submission.
    const back = { ...editedBack(week), dirtyDates: markDirty(week.dirtyDates, dates) };
    const history = [...week.history, change];
    if (back !== week) {
        history.push(event(e, 'EDITED_AFTER_SENDING', `Edited after it was ${EDITED_AFTER_TEXT[back.editedAfter!]}. Needs submitting again.`));
    }
    saveWeek(mode, { ...back, entries: sortEntries(entries), history });
};

export const addEntry = (mode: DataMode, e: MockEmployee, input: TimesheetEntryInput) => {
    assertTimesheets(mode);
    const week = weekOf(mode, e, input?.date ?? '');
    const clean = validateEntry(input, withBreaks(mode, e, input?.date, week.entries), fieldsOf(mode));
    assertDayEditable(mode, e, clean.date);
    const entry: TimesheetEntry = { id: uid('te'), ...clean };
    saveEdited(mode, e, week, [...week.entries, entry], event(e, 'ENTRY_ADDED', `${entryLabel(entry)} · ${entry.description}`), [entry.date]);
    return weekView(mode, e, week.weekStart);
};

// ---- template upload (PROTOTYPE-SETUP: Final batch, Slice 3) --------------------------------------------

const importContext = (mode: DataMode, e: MockEmployee): ImportContext => {
    const filing = getSettings(mode).timesheetFiling;
    return {
        today: today(),
        fields: filing.fields,
        projectCodes: filing.projectCodes,
        isLocked: d => isDayLocked(mode, d),
        dateOfJoin: e.dateOfJoin,
        existingOn: d => withBreaks(mode, e, d, weekOf(mode, e, d).entries.filter(x => x.date === d)),
    };
};

/** Checks an uploaded CSV (nothing is saved): matched columns, and each row ready or why not. */
export const previewImport = (mode: DataMode, e: MockEmployee, body: { csv?: string } | undefined): ImportPreview => {
    assertTimesheets(mode);
    return analyseImport(body?.csv ?? '', importContext(mode, e));
};

/** Imports the ready rows as draft entries (each period they touch is edited, as by hand). */
export const importTimesheet = (mode: DataMode, e: MockEmployee, body: { csv?: string } | undefined) => {
    const preview = previewImport(mode, e, body);
    const ready = (preview.rows ?? []).filter(r => r.ready && r.entry);
    if (!ready.length) throw new RuleError(preview.error ?? 'Nothing in the file is ready to import.', 400);
    ready.forEach(r => {
        const week = weekOf(mode, e, r.entry!.date);
        // PROTOTYPE-SETUP (Timesheet v6, Slice 4): a downloaded row with a new description updates that entry.
        const old = r.replaces ? week.entries.find(x => x.id === r.replaces) : undefined;
        if (old) {
            const after: TimesheetEntry = { ...old, ...r.entry!, id: old.id };
            saveEdited(mode, e, week, week.entries.map(x => (x.id === r.replaces ? after : x)), event(e, 'ENTRY_EDITED', `Imported from a file: ${entryLabel(after)} · ${after.description}`), [after.date]);
            return;
        }
        const entry: TimesheetEntry = { id: uid('te'), ...r.entry! };
        saveEdited(mode, e, week, [...week.entries, entry], event(e, 'ENTRY_ADDED', `Imported from a file: ${entryLabel(entry)} · ${entry.description}`), [entry.date]);
    });
    return { imported: ready.length };
};

/**
 * PROTOTYPE-SETUP (Timesheet v6, Slice 4): "Download timesheet" — every entry from → to (at most a year), with its
 * Status, and the recorded breaks as rows with Location "Break"; sorted by date and time.
 */
export const timesheetExportOf = (mode: DataMode, e: MockEmployee, from: string, to: string) => {
    assertTimesheets(mode);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? '')) throw new RuleError('Pick a valid date range.', 400);
    const why = exportRangeError(from, to);
    if (why) throw new RuleError(why, 400);
    const projectsOn = fieldsOf(mode).projectCode;
    const start = from < e.dateOfJoin ? e.dateOfJoin : from;
    const rows: { key: string; cells: string[] }[] = [];
    let entries = 0;
    let loggedMinutes = 0;
    if (start <= to) {
        periodsBetween(mode, e, start, to).forEach(w => {
            w.entries
                .filter(x => x.date >= start && x.date <= to)
                .forEach(x => {
                    entries += 1;
                    loggedMinutes += x.mins;
                    rows.push({ key: `${x.date} ${x.start ?? '99:99'} 1`, cells: exportEntryRow(x, exportStatus(w, x.date), projectsOn) });
                });
        });
        datesBetween(start, to < today() ? to : today()).forEach(d =>
            breaksAsEntries(d, breaksOn(mode, e, d)).forEach(b => rows.push({ key: `${d} ${b.start} 0`, cells: exportBreakRow(b) }))
        );
        // PROTOTYPE-SETUP (Leave & team, Slice 1): leave / public-holiday rows (Location "Leave" / "Public holiday").
        datesBetween(start, to).forEach(d =>
            leaveRowsOn(mode, e, d).forEach(r => rows.push({ key: `${d} ${r.start} 0`, cells: exportLeaveRow(d, r, exportStatus(weekOf(mode, e, d), d)) }))
        );
    }
    rows.sort((a, b) => a.key.localeCompare(b.key));
    return { rows: [[...EXPORT_COLUMNS] as string[], ...rows.map(r => r.cells)], entries, loggedMinutes };
};

/** The stored period holding an entry (any period of the employee's). */
const weekWithEntry = (mode: DataMode, e: MockEmployee, entryId: string) => {
    const week = storedPeriodsOf(mode, e).find(w => w.entries.some(x => x.id === entryId));
    if (!week) throw new RuleError('Entry not found.', 404);
    return week;
};

export const editEntry = (mode: DataMode, e: MockEmployee, entryId: string, input: TimesheetEntryInput) => {
    assertTimesheets(mode);
    const week = weekWithEntry(mode, e, entryId);
    const before = week.entries.find(x => x.id === entryId)!;
    assertDayEditable(mode, e, before.date);
    const date = input?.date ?? '';
    if (date < week.weekStart || date > periodEndOf(week)) throw new RuleError('Keep the entry within the same filing period.', 400);
    const clean = validateEntry({ ...input, id: entryId }, withBreaks(mode, e, date, week.entries), fieldsOf(mode));
    assertDayEditable(mode, e, clean.date);
    const after = { id: entryId, ...clean };
    saveEdited(mode, e, week, week.entries.map(x => (x.id === entryId ? after : x)), event(e, 'ENTRY_EDITED', `${entryLabel(after)} · ${after.description}`), [before.date, after.date]);
    return weekView(mode, e, week.weekStart);
};

export const deleteEntry = (mode: DataMode, e: MockEmployee, entryId: string) => {
    assertTimesheets(mode);
    const week = weekWithEntry(mode, e, entryId);
    const entry = week.entries.find(x => x.id === entryId)!;
    assertDayEditable(mode, e, entry.date);
    saveEdited(mode, e, week, week.entries.filter(x => x.id !== entryId), event(e, 'ENTRY_DELETED', `${entryLabel(entry)} · ${entry.description}`), [entry.date]);
    return weekView(mode, e, week.weekStart);
};

/** PROTOTYPE-SETUP (Timesheet filing): a period's review (missing fields, overlaps, gaps over 5 minutes). */
export const reviewOf = (view: TimesheetWeekView) =>
    reviewPeriod({ days: view.days, fields: view.filing.fields, mode: view.mode, today: today() });

/** PROTOTYPE-SETUP (Final batch, Slice 1): the period's attendance, sent with the timesheet (days up to today). */
export const attendanceSnapshot = (mode: DataMode, e: MockEmployee, week: TimesheetWeek): SubmittedAttendanceDay[] | undefined => {
    if (!hasCheckIn(getSettings(mode).mode)) return undefined;
    return periodDates(week)
        .filter(d => d <= today() && d >= e.dateOfJoin)
        .map(d => attendanceDay(mode, e, d))
        .map(d => ({ date: d.date, status: d.status, checkIn: d.checkIn, checkOut: d.checkOut, outDays: d.outDays, minutesAtWork: d.minutesAtWork, breakMinutes: d.breakMinutes }));
};

/**
 * Submitting a period, with its attendance. PROTOTYPE-SETUP (Final batch, Slice 1): it goes to the manager; with no
 * manager (the CEO) straight to Payroll, or approved when the company has no level 2 for timesheets. `note` = the
 * review summary: what an automatic submission didn't stop for, or what the employee acknowledged.
 */
export const submitWeekRecord = (
    mode: DataMode,
    week: TimesheetWeek,
    e: MockEmployee,
    auto: boolean,
    note?: string
): TimesheetWeek => {
    const at = nowIso();
    const settings = getSettings(mode);
    const level2 = settings.level2.timesheet;
    const status = submittedStatus(Boolean(managerRef(e)), level2);
    let again = week.editedAfter ? 'Submitted again after edits' : 'Submitted';
    if (week.status === 'SENT_BACK') again = 'Resubmitted after changes';
    const skipped = managerRef(e) ? '' : ' No reporting manager, so it skipped level 1.';
    const t = settings.timesheetApproval;
    const submitted: TimesheetWeek = {
        ...week,
        status,
        submittedAt: at,
        autoSubmitted: auto,
        attendance: attendanceSnapshot(mode, e, week),
        // PROTOTYPE-SETUP (My team, Slice 1): a new round — the manager approves it again before Payroll sees it.
        managerDecision: undefined,
        // PROTOTYPE-SETUP (Timesheet v6, Slice 1): submitted — nothing is "Saved" any more.
        dirtyDates: [],
        ...(status === 'APPROVED'
            ? { approvedEntries: week.entries, baselineEntries: null, editedAfter: undefined, decision: { by: SYSTEM_ACTOR, at, comment: 'Auto-approved — no reporting manager.' } }
            : { decision: undefined, sentBackBy: undefined }),
        history: [
            ...week.history,
            auto
                ? {
                      at,
                      actor: SYSTEM_ACTOR,
                      action: 'AUTO_SUBMITTED',
                      detail: `Auto-submitted ${weekdayName(t.submissionWeekday)} at ${displayTime(t.submissionTime)}${note ? ` · not reviewed: ${note}` : ''}.${skipped}`,
                  }
                : event(e, 'SUBMITTED', `${again}${note ? ` with ${note}` : ''}.${skipped}`),
        ],
    };
    return submitted;
};

const weekdayName = (w: string) => w.charAt(0) + w.slice(1).toLowerCase();

/**
 * PROTOTYPE-SETUP (Timesheet filing): the employee submits a draft period (once it has started) or resubmits a
 * sent-back one. Entries missing a required field stop it (the screen shows them first); overlaps and gaps don't —
 * the screen warns and the employee acknowledges, and what they acknowledged goes in the history. A period that is
 * already sent can't be submitted again (a repeated click gets an error, not a second submission).
 */
export const submitWeek = (mode: DataMode, e: MockEmployee, periodStart: string, body?: { acknowledged?: SubmissionAcknowledgement }) => {
    assertTimesheets(mode);
    const settings = getSettings(mode);
    const view = weekView(mode, e, periodStart);
    const { week } = view;
    if (!settings.timesheetApproval.enabled) throw new RuleError('Timesheet approval is off — your hours are recorded as you log them.');
    if (week.weekStart > today()) throw new RuleError("You can't submit a period that hasn't started.");
    if (!canSubmitPeriod({ approvalEnabled: true, status: week.status, allDaysLocked: view.days.every(d => d.locked), start: week.weekStart, today: today() })) {
        const why: Record<string, string> = {
            SUBMITTED: `This timesheet is already with ${view.employee.managerName ?? 'your manager'}.`,
            WITH_PAYROLL: 'This timesheet is already with Payroll.',
            APPROVED: 'This timesheet is already approved. Edit an entry if something needs to change.',
        };
        throw new RuleError(why[week.status] ?? 'This timesheet can no longer be submitted.');
    }
    const review = reviewOf(view);
    if (review.issues.length) {
        const n = new Set(review.issues.map(i => i.entryId)).size;
        throw new RuleError(`${n} ${n === 1 ? 'entry needs' : 'entries need'} more details before you submit: ${review.issues[0].message}`, 400);
    }
    const ack = body?.acknowledged ?? {};
    const acknowledged = reviewSummary({ ...review, overlaps: ack.overlaps ? review.overlaps : [], gaps: ack.gaps ? review.gaps : [] });
    saveWeek(mode, submitWeekRecord(mode, week, e, false, acknowledged || undefined));
    return weekView(mode, e, week.weekStart);
};

/** The review behind an automatic submission's history note (nothing is stopped or asked). */
export const autoSubmitNote = (mode: DataMode, e: MockEmployee, week: TimesheetWeek) => {
    const review = reviewOf(weekView(mode, e, week.weekStart));
    return review.overlaps.length || gapCount(review) || review.issues.length ? reviewSummary(review) : undefined;
};

// ---- timesheet notices (PROTOTYPE-SETUP: HR rules, Slice 3) ------------------------------------------

/** How far back "Needs your action" looks for sent-back periods and pending changes. */
const NOTICE_LOOKBACK_DAYS = 26 * 7;

/** "Needs your action" for the Timesheet tab, across all filing periods (the last 26 weeks). */
export const timesheetNoticesOf = (mode: DataMode, e: MockEmployee): TimesheetNotices => {
    const settings = getSettings(mode);
    const t = today();
    const manager = managerRef(e)?.name ?? 'HR';
    const from = addDays(t, -NOTICE_LOOKBACK_DAYS) > e.dateOfJoin ? addDays(t, -NOTICE_LOOKBACK_DAYS) : e.dateOfJoin;
    const weeks =
        settings.timesheetApproval.enabled && hasTimesheets(settings.mode) && from <= t
            ? periodsBetween(mode, e, from, t).flatMap((w): TimesheetNotices['weeks'] => {
                  const periodEnd = periodEndOf(w);
                  // PROTOTYPE-SETUP (Timesheet v6, Slice 3): "Go to day" — the first changed date, else the first working day.
                  const goTo = () =>
                      w.dirtyDates?.[0] ?? periodDates(w).find(d => d <= t && timesheetDay(mode, e, d, entriesOn(mode, e, d)).expectedMinutes > 0) ?? w.weekStart;
                  if (w.status === 'SENT_BACK')
                      return [{ weekStart: w.weekStart, periodEnd, kind: 'sent-back' as const, text: w.decision?.comment ?? 'Your manager asked for an update.', goTo: goTo() }];
                  // PROTOTYPE-SETUP (Final batch, Slice 1): edited after it was sent — it needs submitting again.
                  return w.status === 'DRAFT' && editedAfterSending(w)
                      ? [{ weekStart: w.weekStart, periodEnd, kind: 'edited' as const, text: `Edited after it was sent. Submit it again so ${manager} can re-approve it.`, goTo: goTo() }]
                      : [];
              })
            : [];
    const open = settings.mode === 'both' ? openSessionBefore(mode, e, t) : undefined;
    const { suggestions } = overtimeViewOf(mode, e, currentMonth());
    return {
        weeks,
        ...(open?.checkIn ? { openFrom: { date: open.date, checkIn: open.checkIn } } : {}),
        ...(suggestions.length
            ? { overtime: { days: suggestions.length, minutes: suggestions.reduce((s, x) => s + x.minutes, 0), goTo: suggestions.map(x => x.date).sort()[0] } }
            : {}),
    };
};

// ---- timesheet month --------------------------------------------------------------------------------

export const timesheetMonthOf = (mode: DataMode, e: MockEmployee, month: string): TimesheetMonthView => {
    const t = today();
    const days = monthDates(month).map(date => {
        const d = timesheetDay(mode, e, date, entriesOn(mode, e, date));
        const period = weekOf(mode, e, date);
        const state = dayState({
            date,
            hasEntries: d.entries.length > 0,
            onLeave: d.attendance.status === 'on-leave' || Boolean(d.attendance.halfLeave),
            offDay: ['holiday', 'weekly-off'].includes(d.attendance.status),
            approvalEnabled: getSettings(mode).timesheetApproval.enabled,
            period,
        });
        // PROTOTYPE-SETUP (Leave & team, Slice 2): a weekday public holiday with nothing logged by hand.
        const publicHoliday = d.attendance.status === 'holiday' && !isWeeklyOff(date, getSettings(mode)) && d.entries.length === 0;
        return {
            date,
            ...(state ? { state } : {}),
            ...(publicHoliday ? { publicHoliday } : {}),
            loggedMinutes: d.loggedMinutes,
            expectedMinutes: d.expectedMinutes,
            status: d.attendance.status,
            ...(d.attendance.label ? { label: d.attendance.label } : {}),
            hasOutsideFlag: Boolean(d.outsideCheckIn),
            locked: d.locked,
            extra: d.attendance.overtimeMinutes,
        };
    });
    return {
        employee: { id: e.id, name: e.fullName, employeeId: e.employeeId, designation: e.designation, department: e.department },
        month,
        monthLabel: monthLabel(month),
        days: days.map(({ extra, ...d }) => d),
        weeks: weeksSummary(mode, e, month),
        totals: days.reduce(
            (acc, d) => ({
                loggedMinutes: acc.loggedMinutes + d.loggedMinutes,
                expectedMinutes: acc.expectedMinutes + (d.date < t ? d.expectedMinutes : 0),
                daysNothingLogged: acc.daysNothingLogged + (d.date < t && d.expectedMinutes > 0 && d.loggedMinutes === 0 ? 1 : 0),
                extraMinutes: acc.extraMinutes + d.extra,
            }),
            { loggedMinutes: 0, expectedMinutes: 0, daysNothingLogged: 0, extraMinutes: 0 }
        ),
    };
};

/** PROTOTYPE-SETUP (Timesheet filing): every filing period overlapping from → to (the Timesheet tab loads a range). */
export const timesheetPeriodsOf = (mode: DataMode, e: MockEmployee, from: string, to: string, opts: { readOnly?: boolean } = {}) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) throw new RuleError('Pick a valid date range.', 400);
    if (addDays(from, 62) < to) throw new RuleError('Ask for at most two months at a time.', 400);
    return periodsBetween(mode, e, from, to).map(w => weekView(mode, e, w.weekStart, opts));
};

/** "12–18 Oct 2026" for a period record. */
export const periodLabelOf = (w: TimesheetWeek) => periodLabel(w.weekStart, periodEndOf(w));

// ---- overtime ---------------------------------------------------------------------------------------------

const SUGGESTION_LOOKBACK_DAYS = 45;

const suggestionsOf = (mode: DataMode, e: MockEmployee): OvertimeSuggestion[] => {
    const settings = getSettings(mode);
    if (!hasTracking(settings.mode)) return []; // 'none': nothing to calculate overtime from
    const t = today();
    const basis = overtimeBasisFor(settings.mode);
    return Array.from({ length: SUGGESTION_LOOKBACK_DAYS }, (_, i) => addDays(t, -(i + 1)))
        .filter(d => d >= e.dateOfJoin && !isDayLocked(mode, d))
        .map(d => ({ d, ctx: overtimeContext(mode, e, d) }))
        .filter(({ d, ctx }) =>
            shouldSuggestOvertime({
                date: d,
                today: t,
                extraMinutes: ctx.extraMinutes,
                minimumMinutes: settings.overtimeMinimumMinutes,
                hasRequest: Boolean(activeOvertimeOn(mode, e, d)),
                open: ctx.open,
                pendingCorrection: ctx.pendingCorrection,
            })
        )
        .map(({ d, ctx }) => {
            let reason = `Logged ${formatDuration(ctx.loggedMinutes)} — ${formatDuration(ctx.extraMinutes)} over the day`;
            if (basis === 'attendance' && ctx.checkIn && ctx.checkOut) {
                reason = `Checked in ${displayTime(ctx.checkIn)}, out ${displayTimeOn(ctx.checkOut, ctx.outDays)} — ${formatDuration(ctx.extraMinutes)} beyond your shift`;
            }
            const day = attendanceDay(mode, e, d);
            if (day.status === 'worked-off-day') reason = `Worked ${formatDuration(ctx.extraMinutes)} on a ${day.label?.includes('holiday') ? 'holiday' : 'weekly off'}`;
            return { date: d, minutes: ctx.extraMinutes, basis, reason };
        });
};

export const overtimeViewOf = (mode: DataMode, e: MockEmployee, month: string): OvertimeView => {
    const settings = getSettings(mode);
    const requests = overtimeOfEmployee(mode, e);
    const suggestions = suggestionsOf(mode, e);
    return {
        month,
        stats: {
            approvedMinutesThisMonth: requests.filter(o => o.trail.status === 'APPROVED' && o.date.startsWith(month)).reduce((s, o) => s + o.minutes, 0),
            waitingCount: requests.filter(o => o.trail.status.startsWith('PENDING')).length,
            suggestedCount: suggestions.length,
        },
        suggestions,
        requests: requests.map(o => ({ ...o, context: overtimeContext(mode, e, o.date), statusLabel: trailLabel(o.trail) })),
        basis: overtimeBasisFor(settings.mode),
        minimumMinutes: settings.overtimeMinimumMinutes,
    };
};

export const createOvertime = (mode: DataMode, e: MockEmployee, input: OvertimeInput): OvertimeRequest => {
    const settings = getSettings(mode);
    if (!hasTracking(settings.mode)) throw new RuleError(NOT_TRACKED);
    const t = today();
    validateOvertimeInput(input, t);
    if (input.date < e.dateOfJoin) throw new RuleError('That day is before your joining date.', 400);
    if (isDayLocked(mode, input.date)) throw new RuleError(lockReasonFor(input.date));
    if (activeOvertimeOn(mode, e, input.date)) throw new RuleError(`You already have an overtime request for ${dayLabel(input.date)}.`);
    const at = nowIso();
    const request: OvertimeRequest = {
        id: `ot-${Date.now().toString(36)}`,
        employeeId: e.id,
        kind: input.kind,
        date: input.date,
        minutes: Math.round(input.minutes),
        description: input.description?.trim() || (input.kind === 'worked' ? 'Extra hours worked' : ''),
        basis: overtimeBasisFor(settings.mode),
        trail: startTrail('overtime', managerRef(e), settings),
        createdAt: at,
        updatedAt: at,
    };
    atsOvertime.update(mode, list => [request, ...list]);
    return request;
};

/**
 * PROTOTYPE-SETUP (My team, Slice 1): update an overtime request that was sent back (date, time, note) and send it
 * again — the same checks as a new one; it starts again at the manager.
 */
export const resubmitOvertime = (mode: DataMode, e: MockEmployee, id: string, input: Partial<OvertimeInput> | undefined) => {
    const o = atsOvertime.get(mode).find(x => x.id === id && x.employeeId === e.id);
    if (!o) throw new RuleError('Overtime request not found.', 404);
    const next: OvertimeInput = {
        kind: o.kind,
        date: input?.date ?? o.date,
        minutes: Math.round(Number(input?.minutes ?? o.minutes)),
        description: input?.description ?? o.description,
    };
    validateOvertimeInput(next, today());
    if (next.date < e.dateOfJoin) throw new RuleError('That day is before your joining date.', 400);
    if (isDayLocked(mode, next.date)) throw new RuleError(lockReasonFor(next.date));
    const other = activeOvertimeOn(mode, e, next.date);
    if (other && other.id !== id) throw new RuleError(`You already have an overtime request for ${dayLabel(next.date)}.`);
    const at = nowIso();
    const trail = resubmitTrail(o.trail, at, e.fullName);
    atsOvertime.update(mode, list =>
        list.map(x => (x.id === id ? { ...x, date: next.date, minutes: next.minutes, description: next.description?.trim() || x.description, trail, updatedAt: at } : x))
    );
    return overtimeViewOf(mode, e, currentMonth());
};

export const cancelOvertime = (mode: DataMode, e: MockEmployee, id: string) => {
    const o = atsOvertime.get(mode).find(x => x.id === id && x.employeeId === e.id);
    if (!o) throw new RuleError('Overtime request not found.', 404);
    const trail = cancelTrail(o.trail);
    atsOvertime.update(mode, list => list.map(x => (x.id === id ? { ...x, trail, updatedAt: nowIso() } : x)));
    return overtimeViewOf(mode, e, currentMonth());
};
