// PROTOTYPE-SETUP: ESS Service 1 — what an employee sees and does in Attendance & Timesheet (ESS - Employee and
// ESS - Manager's own section). Rules: src/prototype/rules/attendance.ts. Rule breaks throw RuleError; the
// handlers turn them into HTTP errors.
import type {
    AtsOverview,
    AttendanceCorrection,
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
    TimesheetWeek,
} from '@src/domains/attendanceTimesheet/types';
import {
    RuleError,
    addDays,
    cancelTrail,
    canSubmitWeek,
    changeRequestBlockedReason,
    datesTouched,
    diffEntries,
    diffSummary,
    displayTime,
    formatDuration,
    hasCheckIn,
    hasTimesheets,
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
    validateOvertimeInput,
    weekDates,
    weekStartOf,
    weeksOverlappingMonth,
} from '@src/prototype/rules/attendance';

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
    overtimeContext,
    overtimeOfEmployee,
    pendingChangeRequest,
    recordOf,
    saveRecord,
    saveWeek,
    timesheetDay,
    today,
    weekOf,
    weekView,
    weeksSummary,
} from './atsStore';
import { SYSTEM_ACTOR, actorOf } from '../data/ats-seed';
import { MockEmployee } from '../data/employees';
import type { DataMode } from '../envelope';

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

const event = (e: MockEmployee, action: HistoryEvent['action'], detail?: string): HistoryEvent => ({
    at: nowIso(),
    actor: actorOf(e, 'EMPLOYEE'),
    action,
    ...(detail ? { detail } : {}),
});

const entryLabel = (x: Pick<TimesheetEntry, 'date' | 'start' | 'end'>) =>
    `${dayLabel(x.date)} ${displayTime(x.start)}–${displayTime(x.end)}`;

// ---- overview & attendance --------------------------------------------------------------------------

export const overviewOf = (mode: DataMode, e: MockEmployee): AtsOverview => {
    const settings = getSettings(mode);
    const t = today();
    const day = attendanceDay(mode, e, t);
    const rec = recordOf(mode, e, t);
    const punch = hasCheckIn(settings.mode);
    const canCheckIn = punch && !rec?.checkIn && day.status !== 'on-leave';
    const canCheckOut = punch && Boolean(rec?.checkIn) && !rec?.checkOut;
    let hint: string | undefined;
    if (punch && day.status === 'on-leave') hint = `You're on ${day.label ?? 'leave'} today.`;
    else if (punch && rec?.checkOut) hint = `Checked out at ${displayTime(rec.checkOut)}.`;
    const ws = weekStartOf(t);
    const thisWeek = weekView(mode, e, ws);
    const view = overtimeViewOf(mode, e, currentMonth());
    return {
        mode: settings.mode,
        title: titleFor(settings.mode),
        tabs: tabsFor(settings.mode),
        today: { ...day, canCheckIn, canCheckOut, ...(hint ? { hint } : {}), loggedMinutes: loggedOn(mode, e, t) },
        shift: settings.shift,
        graceMinutes: settings.graceMinutes,
        approvalEnabled: settings.timesheetApproval.enabled,
        thisWeek: { weekStart: ws, status: thisWeek.week.status, loggedMinutes: thisWeek.totals.loggedMinutes, expectedMinutes: thisWeek.totals.expectedMinutes },
        counts: {
            pendingCorrections: correctionsOf(mode, e).filter(c => c.trail.status.startsWith('PENDING')).length,
            suggestedOvertime: view.stats.suggestedCount,
            pendingOvertime: view.stats.waitingCount,
        },
    };
};

export const checkIn = (mode: DataMode, e: MockEmployee) => {
    const settings = getSettings(mode);
    if (!hasCheckIn(settings.mode)) throw new RuleError('Check-in is turned off — your company uses timesheets only.');
    const t = today();
    if (recordOf(mode, e, t)?.checkIn) throw new RuleError("You've already checked in today.");
    if (attendanceDay(mode, e, t).status === 'on-leave') throw new RuleError("You're on approved leave today.");
    saveRecord(mode, { employeeId: e.id, date: t, checkIn: clockNow(), checkOut: null, source: 'ess' });
    return overviewOf(mode, e);
};

export const checkOut = (mode: DataMode, e: MockEmployee) => {
    const t = today();
    const rec = recordOf(mode, e, t);
    if (!rec?.checkIn) throw new RuleError("You haven't checked in today.");
    if (rec.checkOut) throw new RuleError("You've already checked out today.");
    const now = clockNow();
    const out = toMinutes(now) > toMinutes(rec.checkIn) ? now : rec.checkIn;
    saveRecord(mode, { ...rec, checkOut: out });
    return overviewOf(mode, e);
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
    minutesAtWork: 0,
    overtimeMinutes: 0,
    lateMinutes: 0,
});

export const attendanceMonthOf = (mode: DataMode, e: MockEmployee, month: string): AttendanceMonthView => {
    const days = monthDates(month).map(d => attendanceDay(mode, e, d));
    const totals = days.reduce((acc, d) => {
        const next = { ...acc, minutesAtWork: acc.minutesAtWork + d.minutesAtWork, overtimeMinutes: acc.overtimeMinutes + d.overtimeMinutes, lateMinutes: acc.lateMinutes + d.lateMinutes };
        if (d.status === 'present') next.present += 1;
        if (d.status === 'late') next.late += 1;
        if (d.status === 'half-day') next.halfDay += 1;
        if (d.status === 'absent') next.absent += 1;
        if (d.status === 'on-leave') next.onLeave += 1;
        if (d.status === 'holiday') next.holidays += 1;
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

export const createCorrection = (mode: DataMode, e: MockEmployee, input: CorrectionInput): AttendanceCorrection => {
    const settings = getSettings(mode);
    if (!hasCheckIn(settings.mode)) throw new RuleError('Attendance corrections are off — your company uses timesheets only.');
    const t = today();
    if (!input?.date || input.date > t) throw new RuleError('Pick today or an earlier day.', 400);
    if (input.date < e.dateOfJoin) throw new RuleError('That day is before your joining date.', 400);
    if (isDayLocked(mode, input.date)) throw new RuleError(lockReasonFor(input.date));
    const reason = input.reason?.trim();
    if (!reason) throw new RuleError('Add a reason for the correction.', 400);
    const day = attendanceDay(mode, e, input.date);
    const requestedIn = input.kind === 'update-check-out' ? day.checkIn : input.checkIn ?? day.checkIn;
    const requestedOut = input.checkOut ?? (input.kind === 'update-check-out' ? null : day.checkOut);
    if (input.kind === 'update-check-out') {
        if (!day.checkOutAuto) throw new RuleError('Update check-out is only for a day that was checked out automatically.');
        if (!requestedOut) throw new RuleError('Enter the time you actually left.', 400);
    }
    if (!requestedIn && !requestedOut) throw new RuleError('Enter the check-in or check-out time.', 400);
    if ((requestedIn && !HHMM.test(requestedIn)) || (requestedOut && !HHMM.test(requestedOut))) {
        throw new RuleError('Enter times as HH:mm.', 400);
    }
    if (requestedIn && requestedOut && toMinutes(requestedOut) <= toMinutes(requestedIn)) {
        throw new RuleError('Check-out must be after check-in.', 400);
    }
    if (requestedIn === day.checkIn && requestedOut === day.checkOut && !day.checkOutAuto) {
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
        kind: input.kind === 'update-check-out' ? 'update-check-out' : 'correction',
        current: { checkIn: day.checkIn, checkOut: day.checkOut, checkOutAuto: day.checkOutAuto },
        requested: { checkIn: requestedIn, checkOut: requestedOut },
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

const assertTimesheets = (mode: DataMode) => {
    if (!hasTimesheets(getSettings(mode).mode)) throw new RuleError('Timesheets are turned off — your company uses attendance only.');
};

const assertDayEditable = (mode: DataMode, e: MockEmployee, date: string) => {
    if (date < e.dateOfJoin) throw new RuleError('That day is before your joining date.', 400);
    if (isDayLocked(mode, date)) throw new RuleError(lockReasonFor(date));
};

const assertWeekDirect = (mode: DataMode, week: TimesheetWeek) => {
    if (getSettings(mode).timesheetApproval.enabled && week.status === 'APPROVED') {
        throw new RuleError('This week is approved — use "Request a change" to edit it.');
    }
};

const sortEntries = (list: TimesheetEntry[]) =>
    [...list].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

export const addEntry = (mode: DataMode, e: MockEmployee, input: TimesheetEntryInput) => {
    assertTimesheets(mode);
    const week = weekOf(mode, e, weekStartOf(input?.date ?? ''));
    const clean = validateEntry(input, week.entries);
    assertDayEditable(mode, e, clean.date);
    assertWeekDirect(mode, week);
    const entry: TimesheetEntry = { id: uid('te'), ...clean };
    saveWeek(mode, { ...week, entries: sortEntries([...week.entries, entry]), history: [...week.history, event(e, 'ENTRY_ADDED', `${entryLabel(entry)} · ${entry.description}`)] });
    return weekView(mode, e, week.weekStart);
};

const weekWithEntry = (mode: DataMode, e: MockEmployee, entryId: string, hintDate?: string) => {
    const candidates = [hintDate && weekStartOf(hintDate), ...Array.from({ length: 16 }, (_, i) => addDays(weekStartOf(today()), (1 - i) * 7))].filter(Boolean) as string[];
    const ws = candidates.find(w => weekOf(mode, e, w).entries.some(x => x.id === entryId));
    if (!ws) throw new RuleError('Entry not found.', 404);
    return weekOf(mode, e, ws);
};

export const editEntry = (mode: DataMode, e: MockEmployee, entryId: string, input: TimesheetEntryInput) => {
    assertTimesheets(mode);
    const week = weekWithEntry(mode, e, entryId, input?.date);
    const before = week.entries.find(x => x.id === entryId)!;
    assertDayEditable(mode, e, before.date);
    assertWeekDirect(mode, week);
    if (weekStartOf(input?.date ?? '') !== week.weekStart) throw new RuleError('Keep the entry within the same week.', 400);
    const clean = validateEntry({ ...input, id: entryId }, week.entries);
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

/** Submitting (and auto-approving for someone without a manager, i.e. the CEO). */
export const submitWeekRecord = (week: TimesheetWeek, e: MockEmployee, auto: boolean): TimesheetWeek => {
    const at = nowIso();
    const submitted: TimesheetWeek = {
        ...week,
        status: 'SUBMITTED',
        submittedAt: at,
        autoSubmitted: auto,
        history: [...week.history, auto ? { at, actor: SYSTEM_ACTOR, action: 'AUTO_SUBMITTED', detail: 'Sent to the manager on submission day' } : event(e, 'SUBMITTED')],
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

export const submitWeek = (mode: DataMode, e: MockEmployee, weekStart: string) => {
    assertTimesheets(mode);
    const settings = getSettings(mode);
    const ws = weekStartOf(weekStart);
    const view = weekView(mode, e, ws);
    if (!settings.timesheetApproval.enabled) throw new RuleError('Timesheet approval is off — your hours are recorded as you log them.');
    if (ws > weekStartOf(today())) throw new RuleError("You can't submit a future week.");
    if (!canSubmitWeek({ approvalEnabled: true, status: view.week.status, allDaysLocked: view.days.every(d => d.locked) })) {
        throw new RuleError(view.week.status === 'SUBMITTED' ? 'This week is already with your manager.' : 'This week can no longer be submitted.');
    }
    saveWeek(mode, submitWeekRecord(view.week, e, false));
    return weekView(mode, e, ws);
};

// ---- change requests --------------------------------------------------------------------------------

export const requestChange = (mode: DataMode, e: MockEmployee, weekStart: string, input: ChangeRequestInput) => {
    assertTimesheets(mode);
    const settings = getSettings(mode);
    const ws = weekStartOf(weekStart);
    const week = weekOf(mode, e, ws);
    if (!settings.timesheetApproval.enabled || week.status !== 'APPROVED') {
        throw new RuleError('Only an approved week needs a change request — edit this week directly.');
    }
    const reason = input?.reason?.trim();
    if (!reason) throw new RuleError('Add a reason for the change.', 400);
    const base = week.approvedEntries ?? week.entries;
    const dates = new Set(weekDates(ws));
    const proposed = (input.entries ?? []).reduce<TimesheetEntry[]>((acc, x) => {
        const clean = validateEntry({ ...x, id: x.id }, acc);
        if (!dates.has(clean.date)) throw new RuleError('Every entry must be in this week.', 400);
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
    return weekView(mode, e, ws);
};

export const cancelChangeRequest = (mode: DataMode, e: MockEmployee, weekStart: string) => {
    const ws = weekStartOf(weekStart);
    const week = weekOf(mode, e, ws);
    const cr = pendingChangeRequest(mode, week);
    if (!cr) throw new RuleError('There is no pending change request for this week.');
    atsChangeRequests.update(mode, list => list.filter(c => c.id !== cr.id));
    saveWeek(mode, { ...week, pendingChangeRequestId: undefined });
    return weekView(mode, e, ws);
};

// ---- timesheet month --------------------------------------------------------------------------------

export const timesheetMonthOf = (mode: DataMode, e: MockEmployee, month: string): TimesheetMonthView => {
    const t = today();
    const days = monthDates(month).map(date => {
        const d = timesheetDay(mode, e, date, weekOf(mode, e, weekStartOf(date)).entries);
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
        weeks: weeksSummary(mode, e, weeksOverlappingMonth(month)),
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

// ---- overtime ---------------------------------------------------------------------------------------------

const SUGGESTION_LOOKBACK_DAYS = 45;

const suggestionsOf = (mode: DataMode, e: MockEmployee): OvertimeSuggestion[] => {
    const settings = getSettings(mode);
    const t = today();
    const basis = overtimeBasisFor(settings.mode);
    return Array.from({ length: SUGGESTION_LOOKBACK_DAYS }, (_, i) => addDays(t, -(i + 1)))
        .filter(d => d >= e.dateOfJoin && !isDayLocked(mode, d))
        .map(d => ({ d, ctx: overtimeContext(mode, e, d) }))
        .filter(({ d, ctx }) =>
            shouldSuggestOvertime({ date: d, today: t, extraMinutes: ctx.extraMinutes, minimumMinutes: settings.overtimeMinimumMinutes, hasRequest: Boolean(activeOvertimeOn(mode, e, d)) })
        )
        .map(({ d, ctx }) => {
            let reason = `Logged ${formatDuration(ctx.loggedMinutes)} — ${formatDuration(ctx.extraMinutes)} over the day`;
            if (basis === 'attendance' && ctx.checkIn && ctx.checkOut) {
                reason = `Checked in ${displayTime(ctx.checkIn)}, out ${displayTime(ctx.checkOut)} — ${formatDuration(ctx.extraMinutes)} beyond your shift`;
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
