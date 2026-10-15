// PROTOTYPE-SETUP: ESS Service 1 — what an employee sees and does in Attendance & Timesheet (ESS - Employee and
// ESS - Manager's own section). Rules: src/prototype/rules/attendance.ts. Rule breaks throw RuleError; the
// handlers turn them into HTTP errors.
import type {
    AtsOverview,
    AttendanceCorrection,
    AttendanceBreak,
    AttendanceMonthView,
    AttendanceTotals,
    ChangeRequest,
    ChangeRequestInput,
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
} from '@src/domains/attendanceTimesheet/types';
import {
    RuleError,
    addDays,
    cancelTrail,
    changeRequestBlockedReason,
    BREAK_MESSAGES,
    breaksAsEntries,
    checkOutMinutes,
    datesTouched,
    daysBetween,
    diffEntries,
    diffSummary,
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
    timesheetAutoApproved,
    titleFor,
    toMinutes,
    trailLabel,
    validateEntry,
    validateBreaks,
    validateOvertimeInput,
} from '@src/prototype/rules/attendance';
import {
    SubmissionAcknowledgement,
    canSubmitPeriod,
    gapCount,
    periodEndOf,
    periodKind,
    periodLabel,
    reviewPeriod,
    reviewSummary,
} from '@src/prototype/rules/timesheetFiling';

import {
    activeOvertimeOn,
    atsChangeRequests,
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
    pendingChangeRequest,
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
    breaksOn,
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

export const overviewOf = (mode: DataMode, e: MockEmployee): AtsOverview => {
    const settings = getSettings(mode);
    const t = today();
    const day = attendanceDay(mode, e, t);
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
    saveRecord(mode, { employeeId: e.id, date: t, checkIn: clockNow(), checkOut: null, outDays: 0, breaks: [], source: 'ess' });
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
    const days = monthDates(month)
        .map(d => attendanceDay(mode, e, d))
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
export const createCorrection = (mode: DataMode, e: MockEmployee, input: CorrectionInput): AttendanceCorrection => {
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
    if (correctionsOf(mode, e).some(c => c.date === input.date && c.trail.status.startsWith('PENDING'))) {
        throw new RuleError(`A correction for ${dayLabel(input.date)} is already waiting for approval.`);
    }
    const at = nowIso();
    const correction: AttendanceCorrection = {
        id: `ac-${Date.now().toString(36)}`,
        employeeId: e.id,
        date: input.date,
        current: { checkIn: day.checkIn, checkOut: day.checkOut, outDays: day.outDays },
        requested: { checkIn: requestedIn, checkOut: requestedOut, outDays: requestedOut ? outDays : 0 },
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

const assertWeekDirect = (mode: DataMode, week: TimesheetWeek) => {
    if (getSettings(mode).timesheetApproval.enabled && week.status === 'APPROVED') {
        throw new RuleError('This period is approved — use "Request a change" to edit it.');
    }
};

/** PROTOTYPE-SETUP (HR rules, Slice 3): entries can't overlap recorded breaks either. */
const withBreaks = (mode: DataMode, e: MockEmployee, date: string | undefined, entries: TimesheetEntry[]) =>
    date ? [...entries, ...breaksAsEntries(date, breaksOn(mode, e, date), date === today() ? nowMinutes() : undefined)] : entries;

const fieldsOf = (mode: DataMode) => getSettings(mode).timesheetFiling.fields;

export const addEntry = (mode: DataMode, e: MockEmployee, input: TimesheetEntryInput) => {
    assertTimesheets(mode);
    const week = weekOf(mode, e, input?.date ?? '');
    const clean = validateEntry(input, withBreaks(mode, e, input?.date, week.entries), fieldsOf(mode));
    assertDayEditable(mode, e, clean.date);
    assertWeekDirect(mode, week);
    const entry: TimesheetEntry = { id: uid('te'), ...clean };
    saveWeek(mode, { ...week, entries: sortEntries([...week.entries, entry]), history: [...week.history, event(e, 'ENTRY_ADDED', `${entryLabel(entry)} · ${entry.description}`)] });
    return weekView(mode, e, week.weekStart);
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
    assertWeekDirect(mode, week);
    const date = input?.date ?? '';
    if (date < week.weekStart || date > periodEndOf(week)) throw new RuleError('Keep the entry within the same filing period.', 400);
    const clean = validateEntry({ ...input, id: entryId }, withBreaks(mode, e, date, week.entries), fieldsOf(mode));
    assertDayEditable(mode, e, clean.date);
    const after = { id: entryId, ...clean };
    saveWeek(mode, {
        ...week,
        entries: sortEntries(week.entries.map(x => (x.id === entryId ? after : x))),
        history: [...week.history, event(e, 'ENTRY_EDITED', `${entryLabel(after)} · ${after.description}`)],
    });
    return weekView(mode, e, week.weekStart);
};

export const deleteEntry = (mode: DataMode, e: MockEmployee, entryId: string) => {
    assertTimesheets(mode);
    const week = weekWithEntry(mode, e, entryId);
    const entry = week.entries.find(x => x.id === entryId)!;
    assertDayEditable(mode, e, entry.date);
    assertWeekDirect(mode, week);
    saveWeek(mode, {
        ...week,
        entries: week.entries.filter(x => x.id !== entryId),
        history: [...week.history, event(e, 'ENTRY_DELETED', `${entryLabel(entry)} · ${entry.description}`)],
    });
    return weekView(mode, e, week.weekStart);
};

/** PROTOTYPE-SETUP (Timesheet filing): a period's review (missing fields, overlaps, gaps over 5 minutes). */
export const reviewOf = (view: TimesheetWeekView) =>
    reviewPeriod({ days: view.days, fields: view.filing.fields, mode: view.mode, today: today() });

/**
 * Submitting (and auto-approving for someone without a manager, i.e. the CEO). `note` = the review summary: what an
 * automatic submission didn't stop for, or what the employee acknowledged.
 */
export const submitWeekRecord = (week: TimesheetWeek, e: MockEmployee, auto: boolean, note?: string): TimesheetWeek => {
    const at = nowIso();
    const submitted: TimesheetWeek = {
        ...week,
        status: 'SUBMITTED',
        submittedAt: at,
        autoSubmitted: auto,
        history: [
            ...week.history,
            auto
                ? { at, actor: SYSTEM_ACTOR, action: 'AUTO_SUBMITTED', detail: `Sent to the manager automatically${note ? ` · not reviewed: ${note}` : ''}` }
                : event(e, 'SUBMITTED', note ? `Submitted with ${note}` : undefined),
        ],
    };
    if (!timesheetAutoApproved(managerRef(e)?.id)) return submitted;
    return {
        ...submitted,
        status: 'APPROVED',
        approvedEntries: submitted.entries,
        decision: { by: SYSTEM_ACTOR, at, comment: 'Auto-approved — no reporting manager.' },
        history: [...submitted.history, { at, actor: SYSTEM_ACTOR, action: 'APPROVED', detail: 'Auto-approved — no reporting manager' }],
    };
};

/**
 * PROTOTYPE-SETUP (Timesheet filing): the employee submits a draft period (once it has started) or resubmits a
 * sent-back one. Entries missing a required field stop it (the screen shows them first); overlaps and gaps don't —
 * the screen warns and the employee acknowledges, and what they acknowledged goes in the history. A period that is
 * already submitted can't be submitted again (a repeated click gets an error, not a second submission).
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
            APPROVED: 'This timesheet is approved — use "Request a change" to edit it.',
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
    saveWeek(mode, submitWeekRecord(week, e, false, acknowledged || undefined));
    return weekView(mode, e, week.weekStart);
};

/** The review behind an automatic submission's history note (nothing is stopped or asked). */
export const autoSubmitNote = (mode: DataMode, e: MockEmployee, week: TimesheetWeek) => {
    const review = reviewOf(weekView(mode, e, week.weekStart));
    return review.overlaps.length || gapCount(review) || review.issues.length ? reviewSummary(review) : undefined;
};

// ---- change requests --------------------------------------------------------------------------------

export const requestChange = (mode: DataMode, e: MockEmployee, periodStart: string, input: ChangeRequestInput) => {
    assertTimesheets(mode);
    const settings = getSettings(mode);
    const week = weekOf(mode, e, periodStart);
    if (!settings.timesheetApproval.enabled || week.status !== 'APPROVED') {
        throw new RuleError('Only an approved period needs a change request — edit this period directly.');
    }
    const reason = input?.reason?.trim();
    if (!reason) throw new RuleError('Add a reason for the change.', 400);
    const base = week.approvedEntries ?? week.entries;
    const dates = new Set(periodDates(week));
    const { fields } = settings.timesheetFiling;
    const proposed = (input.entries ?? []).reduce<TimesheetEntry[]>((acc, x) => {
        // The company's fields apply to added and edited entries; untouched ones stay as they were approved.
        const others = [...acc, ...withBreaks(mode, e, x.date, [])];
        const asIs = validateEntry({ ...x, id: x.id }, others);
        const before = x.id ? base.find(b => b.id === x.id) : undefined;
        const untouched = before && !diffEntries([before], [{ ...asIs, id: before.id }]).edited.length;
        const clean = untouched ? asIs : validateEntry({ ...x, id: x.id }, others, fields);
        if (!dates.has(clean.date)) throw new RuleError('Every entry must be in this period.', 400);
        if (clean.date < e.dateOfJoin) throw new RuleError('That day is before your joining date.', 400);
        const id = x.id && base.some(b => b.id === x.id) ? x.id : uid('te');
        return [...acc, { id, ...clean }];
    }, []);
    const diff = diffEntries(base, proposed);
    if (!datesTouched(diff).length) throw new RuleError('Nothing has changed yet.', 400);
    const blocked = changeRequestBlockedReason({ baseEntries: base, proposedEntries: proposed }, [...new Set(datesTouched(diff).filter(d => isDayLocked(mode, d)).map(d => d.slice(0, 7)))]);
    if (blocked) throw new RuleError(blocked);
    const existing = pendingChangeRequest(mode, week);
    const at = nowIso();
    const cr: ChangeRequest = existing
        ? { ...existing, reason, proposedEntries: sortEntries(proposed), requestedAt: at }
        : { id: uid('cr'), weekId: week.id, employeeId: e.id, reason, baseEntries: base, proposedEntries: sortEntries(proposed), status: 'PENDING', requestedAt: at };
    const autoApprove = timesheetAutoApproved(managerRef(e)?.id);
    const finalCr: ChangeRequest = autoApprove ? { ...cr, status: 'APPROVED', decision: { by: SYSTEM_ACTOR, at, comment: 'Auto-approved — no reporting manager.' } } : cr;
    atsChangeRequests.update(mode, list => [finalCr, ...list.filter(c => c.id !== cr.id)]);
    const history = [...week.history, event(e, 'CHANGE_REQUESTED', `${diffSummary(diff)} — ${reason}`)];
    saveWeek(
        mode,
        autoApprove
            ? { ...week, entries: finalCr.proposedEntries, approvedEntries: finalCr.proposedEntries, pendingChangeRequestId: undefined, history: [...history, { at, actor: SYSTEM_ACTOR, action: 'CHANGE_APPROVED' }] }
            : { ...week, pendingChangeRequestId: cr.id, history }
    );
    return weekView(mode, e, week.weekStart);
};

export const cancelChangeRequest = (mode: DataMode, e: MockEmployee, periodStart: string) => {
    const week = weekOf(mode, e, periodStart);
    const cr = pendingChangeRequest(mode, week);
    if (!cr) throw new RuleError('There is no pending change request for this period.');
    atsChangeRequests.update(mode, list => list.filter(c => c.id !== cr.id));
    saveWeek(mode, { ...week, pendingChangeRequestId: undefined });
    return weekView(mode, e, week.weekStart);
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
                  if (w.status === 'SENT_BACK') return [{ weekStart: w.weekStart, periodEnd, kind: 'sent-back' as const, text: w.decision?.comment ?? 'Your manager asked for an update.' }];
                  const cr = pendingChangeRequest(mode, w);
                  return cr ? [{ weekStart: w.weekStart, periodEnd, kind: 'change-pending' as const, text: `With ${manager}. ${cr.reason}` }] : [];
              })
            : [];
    const open = settings.mode === 'both' ? openSessionBefore(mode, e, t) : undefined;
    const { suggestions } = overtimeViewOf(mode, e, currentMonth());
    return {
        weeks,
        ...(open?.checkIn ? { openFrom: { date: open.date, checkIn: open.checkIn } } : {}),
        ...(suggestions.length ? { overtime: { days: suggestions.length, minutes: suggestions.reduce((s, x) => s + x.minutes, 0) } } : {}),
    };
};

// ---- timesheet month --------------------------------------------------------------------------------

export const timesheetMonthOf = (mode: DataMode, e: MockEmployee, month: string): TimesheetMonthView => {
    const t = today();
    const days = monthDates(month).map(date => {
        const d = timesheetDay(mode, e, date, entriesOn(mode, e, date));
        return {
            date,
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

export const cancelOvertime = (mode: DataMode, e: MockEmployee, id: string) => {
    const o = atsOvertime.get(mode).find(x => x.id === id && x.employeeId === e.id);
    if (!o) throw new RuleError('Overtime request not found.', 404);
    const trail = cancelTrail(o.trail);
    atsOvertime.update(mode, list => list.map(x => (x.id === id ? { ...x, trail, updatedAt: nowIso() } : x)));
    return overtimeViewOf(mode, e, currentMonth());
};
