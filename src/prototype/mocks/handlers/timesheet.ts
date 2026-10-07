// PROTOTYPE-SETUP: Timesheet V1 endpoints. Stateful: reads and writes go through store/timesheetStore.ts and
// store/overtimeStore.ts, persisted per data mode, so ESS - Employee, ESS - Manager and Payroll see the same
// data. ESS endpoints answer as the requesting persona (requester.ts).
//   Slice 1: settings, simulate submission day.
//   Slice 2: My Timesheet (week view, entries, submit, change request, auto-submit preference) and
//            stateful ESS overtime requests.
import type {
    ChangeRequest,
    ChangeRequestInput,
    HistoryEvent,
    Level2Approver,
    Level2Component,
    TimesheetEntry,
    TimesheetEntryInput,
    TimesheetMode,
    TimesheetSettings,
    TimesheetWeek,
    TimesheetWeekView,
    Weekday,
} from '@src/domains/timesheet/types';
import {
    WEEKDAYS,
    diffEntries,
    diffSummary,
    displayTime,
    findOverlap,
    toMinutes,
    weekDates,
    weekStartOf,
} from '@src/domains/timesheet/utils';

import { MockEmployee } from '../data/employees';
import { lockFor } from '../data/payroll-processing';
import { todayIso, toLocalIsoDate } from '../data/time-calendar';
import { weekWindows } from '../data/timesheet-windows';
import type { DataMode } from '../envelope';
import { fail } from '../errors';
import { essRequester } from '../requester';
import { MockRoute, route } from '../router';
import { startTrail } from '../store/approvals';
import {
    StoredOvertime,
    level2ForOvertime,
    overtimeRequests,
    overtimeSummaryOf,
    toEssOvertime,
} from '../store/overtimeStore';
import {
    runSubmissionDay,
    timesheetChangeRequests,
    timesheetPreferences,
    timesheetSettings,
    timesheetWeeks,
} from '../store/timesheetStore';

const P = ':type/:uid/payroll/timesheet';
const ESS = ':type/:uid/payroll';

// ---- settings (Slice 1) -------------------------------------------------------------------------------------

const MODES: TimesheetMode[] = ['attendance', 'both', 'timesheet'];
const LEVEL2: Level2Approver[] = ['HR', 'FINANCE', 'NONE'];
const LEVEL2_COMPONENTS: Level2Component[] = ['attendance', 'overtime', 'leave', 'reimbursement'];

/** Merge only valid values; timesheets have no level-2 setting (level 1 only), so it is never stored. */
const sanitise = (
    current: TimesheetSettings,
    body: Partial<TimesheetSettings>
): TimesheetSettings => ({
    mode: MODES.includes(body.mode as TimesheetMode) ? (body.mode as TimesheetMode) : current.mode,
    submissionWeekday: WEEKDAYS.includes(body.submissionWeekday as Weekday)
        ? (body.submissionWeekday as Weekday)
        : current.submissionWeekday,
    level2: LEVEL2_COMPONENTS.reduce(
        (acc, c) => ({
            ...acc,
            [c]: LEVEL2.includes(body.level2?.[c] as Level2Approver)
                ? (body.level2?.[c] as Level2Approver)
                : current.level2[c],
        }),
        {} as TimesheetSettings['level2']
    ),
    updatedAt: new Date().toISOString(),
});

// ---- My Timesheet helpers (Slice 2) -------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

const dayLabel = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    });
const entryLabel = (e: Pick<TimesheetEntry, 'date' | 'start' | 'end' | 'description'>) =>
    `${dayLabel(e.date)} ${displayTime(e.start)}–${displayTime(e.end)} · ${e.description}`;
const newEntryId = (employee: MockEmployee, date: string) =>
    `te-${employee.id}-${date}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

const emptyWeek = (employee: MockEmployee, weekStart: string): TimesheetWeek => ({
    id: `${employee.id}:${weekStart}`,
    employeeId: employee.id,
    weekStart,
    status: 'DRAFT',
    entries: [],
    approvedEntries: null,
    history: [],
});

export const weekOf = (mode: DataMode, employee: MockEmployee, weekStart: string) =>
    timesheetWeeks.get(mode).find(w => w.employeeId === employee.id && w.weekStart === weekStart) ??
    emptyWeek(employee, weekStart);

export const saveWeek = (mode: DataMode, week: TimesheetWeek) =>
    timesheetWeeks.update(mode, weeks =>
        weeks.some(w => w.id === week.id)
            ? weeks.map(w => (w.id === week.id ? week : w))
            : [...weeks, week]
    );

export const viewOf = (mode: DataMode, employee: MockEmployee, weekStart: string): TimesheetWeekView => {
    const settings = timesheetSettings.get(mode);
    const week = weekOf(mode, employee, weekStart);
    const crs = timesheetChangeRequests.get(mode).filter(c => c.weekId === week.id);
    const changeRequest =
        crs.find(c => c.id === week.pendingChangeRequestId) ??
        crs.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0] ??
        null;
    return {
        employee: {
            id: employee.id,
            name: employee.fullName,
            employeeId: employee.employeeId,
            dateOfJoin: employee.dateOfJoin,
        },
        week,
        windows: weekWindows(employee, weekStart, settings.mode),
        changeRequest,
        autoSubmit: !!timesheetPreferences.get(mode).find(p => p.employeeId === employee.id)
            ?.autoSubmit,
        mode: settings.mode,
        submissionWeekday: settings.submissionWeekday,
    };
};

const asWeekStart = (value: unknown) => {
    const iso = toLocalIsoDate(value);
    if (!iso || !ISO_DATE.test(iso)) throw fail(400, 'A valid week start date is required.');
    return weekStartOf(iso);
};

/** Shared validation for one entry (fields, join date, lock). Returns the cleaned entry fields. */
const validEntry = (
    employee: MockEmployee,
    input: Partial<TimesheetEntryInput>
): TimesheetEntryInput => {
    const date = String(input.date ?? '');
    const start = String(input.start ?? '');
    const end = String(input.end ?? '');
    const description = String(input.description ?? '').trim();
    if (!ISO_DATE.test(date)) throw fail(400, 'Please pick a valid date.');
    if (!HH_MM.test(start) || !HH_MM.test(end))
        throw fail(400, 'Please enter start and end times.');
    if (toMinutes(end) <= toMinutes(start))
        throw fail(400, 'End time must be after the start time.');
    if (!description) throw fail(400, 'A description is required.');
    if (date < employee.dateOfJoin) throw fail(400, "You can't log time before your joining date.");
    const lock = lockFor(date);
    if (lock.locked) throw fail(409, lock.reason ?? 'This day is locked.');
    return { date, start, end, description };
};

const assertNoOverlap = (
    entries: TimesheetEntry[],
    candidate: TimesheetEntryInput & { id?: string }
) => {
    const clash = findOverlap(entries, candidate);
    if (clash)
        throw fail(
            409,
            `Overlaps with ${entryLabel(clash)}. Adjust the times so entries don't overlap.`
        );
};

const assertDirectlyEditable = (week: TimesheetWeek) => {
    if (week.status === 'APPROVED') {
        throw fail(409, 'This week is approved. Edits go through a change request with a reason.');
    }
};

const event = (
    employee: MockEmployee,
    action: HistoryEvent['action'],
    detail?: string
): HistoryEvent => ({
    at: new Date().toISOString(),
    actor: { id: employee.id, name: employee.fullName, role: 'EMPLOYEE' },
    action,
    ...(detail ? { detail } : {}),
});

/** Entry mutations: validate, apply to the week (creating it if needed), add history, persist, return view. */
const mutateEntries = (
    mode: DataMode,
    employee: MockEmployee,
    weekStart: string,
    apply: (week: TimesheetWeek) => { entries: TimesheetEntry[]; history: HistoryEvent }
) => {
    const week = weekOf(mode, employee, weekStart);
    assertDirectlyEditable(week);
    const { entries, history } = apply(week);
    saveWeek(mode, {
        ...week,
        entries: entries.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
        history: [...week.history, history],
    });
    return viewOf(mode, employee, weekStart);
};

const findEntryWeek = (mode: DataMode, employee: MockEmployee, entryId: string | undefined) => {
    const week = timesheetWeeks
        .get(mode)
        .find(w => w.employeeId === employee.id && w.entries.some(e => e.id === entryId));
    const entry = week?.entries.find(e => e.id === entryId);
    if (!week || !entry) throw fail(404, 'That entry no longer exists — refresh the week.');
    return { week, entry };
};

// ---- change requests ----------------------------------------------------------------------------------------

const submitChangeRequest = (
    mode: DataMode,
    employee: MockEmployee,
    weekStart: string,
    body: Partial<ChangeRequestInput>
) => {
    const week = weekOf(mode, employee, weekStart);
    if (week.status !== 'APPROVED') {
        throw fail(409, 'Only approved weeks use change requests — edit this week directly.');
    }
    const reason = String(body.reason ?? '').trim();
    if (!reason) throw fail(400, 'A reason is required for a change request.');
    const days = new Set(weekDates(weekStart));
    const base = week.approvedEntries ?? week.entries;

    const proposed: TimesheetEntry[] = (body.entries ?? []).map(raw => {
        const fields = {
            date: String(raw.date ?? ''),
            start: String(raw.start ?? ''),
            end: String(raw.end ?? ''),
            description: String(raw.description ?? '').trim(),
        };
        const existing = raw.id ? base.find(e => e.id === raw.id) : undefined;
        const unchangedLocked =
            existing &&
            lockFor(fields.date).locked &&
            existing.date === fields.date &&
            existing.start === fields.start &&
            existing.end === fields.end &&
            existing.description === fields.description;
        if (!days.has(fields.date)) throw fail(400, 'Every entry must fall within this week.');
        const clean = unchangedLocked ? fields : validEntry(employee, fields);
        return { id: raw.id && existing ? raw.id : newEntryId(employee, clean.date), ...clean };
    });
    proposed.forEach(e => assertNoOverlap(proposed, e));
    // Locked days must stay exactly as approved (removed entries included).
    const lockedTouched = base.some(
        b =>
            lockFor(b.date).locked &&
            !proposed.some(
                p =>
                    p.id === b.id &&
                    p.start === b.start &&
                    p.end === b.end &&
                    p.description === b.description
            )
    );
    if (lockedTouched) {
        throw fail(
            409,
            `${lockFor(base.find(b => lockFor(b.date).locked)!.date).reason} Changes to those days aren't allowed.`
        );
    }
    const diff = diffEntries(base, proposed);
    if (!diff.added.length && !diff.removed.length && !diff.edited.length) {
        throw fail(400, 'Nothing has changed compared with the approved week.');
    }

    const now = new Date().toISOString();
    const pending = timesheetChangeRequests
        .get(mode)
        .find(c => c.id === week.pendingChangeRequestId);
    const cr: ChangeRequest = pending
        ? { ...pending, reason, proposedEntries: proposed, requestedAt: now }
        : {
              id: `cr-${employee.id}-${weekStart}-${Date.now().toString(36)}`,
              weekId: week.id,
              employeeId: employee.id,
              reason,
              baseEntries: base,
              proposedEntries: proposed,
              status: 'PENDING',
              requestedAt: now,
          };
    timesheetChangeRequests.update(mode, list =>
        pending ? list.map(c => (c.id === cr.id ? cr : c)) : [...list, cr]
    );
    saveWeek(mode, {
        ...week,
        entries: proposed,
        pendingChangeRequestId: cr.id,
        history: [
            ...week.history,
            event(
                employee,
                'CHANGE_REQUESTED',
                `${pending ? 'Updated' : 'Requested'}: ${diffSummary(diff)} — “${reason}”`
            ),
        ],
    });
    return viewOf(mode, employee, weekStart);
};

// ---- overtime (ESS, stateful) ---------------------------------------------------------------------------

const positive = (value: unknown, fallback: number) => {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : fallback;
};

export const essOvertimeRoutes: MockRoute[] = [
    route('GET', `${ESS}/overtime-requests`, ({ mode, query }) => {
        const me = essRequester();
        const from = toLocalIsoDate(query.from);
        const to = toLocalIsoDate(query.to);
        const mine = overtimeRequests
            .get(mode)
            .filter(
                o => o.employeeId === me.id && (!from || o.date >= from) && (!to || o.date <= to)
            )
            .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
        const list = mine.filter(o => !query.status || o.status === query.status);
        const limit = positive(query.limit, 10);
        const page = positive(query.page, 1);
        // The store is per data mode: empty mode only holds what the demo created there.
        return {
            records: list.slice((page - 1) * limit, page * limit).map(toEssOvertime),
            total: list.length,
            summary: overtimeSummaryOf(mine),
        };
    }),
    route('POST', `${ESS}/overtime-requests`, ({ mode, body }) => {
        const me = essRequester();
        const date = toLocalIsoDate(body?.date);
        const hours = Number(body?.hours);
        if (!date) throw fail(400, 'Please select the date.');
        if (date > todayIso()) throw fail(400, 'Overtime can be requested once the day is done.');
        if (!(hours > 0) || hours > 24) throw fail(400, 'Please enter the extra hours (up to 24).');
        const now = new Date().toISOString();
        const record: StoredOvertime = {
            id: `ot-${me.id}-${Date.now().toString(36)}`,
            employeeId: me.id,
            date,
            extraHours: Math.round(hours * 100) / 100,
            notes: String(body?.notes ?? '').trim(),
            status: 'requestedByEmployee',
            paymentStatus: 'UNPAID',
            trail: startTrail('overtime', me.id, level2ForOvertime(mode)),
            ...(Array.isArray(body?.timesheetEntryIds)
                ? { timesheetEntryIds: body.timesheetEntryIds }
                : {}),
            createdAt: now,
            updatedAt: now,
        };
        overtimeRequests.update(mode, list => [record, ...list]);
        return toEssOvertime(record);
    }),
    route('PATCH', `${ESS}/overtime-requests/:overtimeId/cancel`, ({ mode, params }) => {
        const me = essRequester();
        const found = overtimeRequests
            .get(mode)
            .find(o => o.id === params.overtimeId && o.employeeId === me.id);
        if (!found) throw fail(404, 'That overtime request no longer exists.');
        if (found.status !== 'requestedByEmployee')
            throw fail(409, 'Only pending requests can be cancelled.');
        const updated: StoredOvertime = {
            ...found,
            status: 'cancelledByEmployee',
            updatedAt: new Date().toISOString(),
        };
        overtimeRequests.update(mode, list => list.map(o => (o.id === updated.id ? updated : o)));
        return toEssOvertime(updated);
    }),
];

// ---- routes -------------------------------------------------------------------------------------------------

export const timesheetRoutes: MockRoute[] = [
    // Slice 1 — settings & demo control
    route('GET', `${P}/settings`, ({ mode }) => timesheetSettings.get(mode)),
    route('PUT', `${P}/settings`, ({ mode, body }) =>
        timesheetSettings.update(mode, current => sanitise(current, body ?? {}))
    ),
    route('POST', `${P}/simulate-submission-day`, ({ mode }) => runSubmissionDay(mode)),

    // Slice 2 — My Timesheet (ESS persona)
    route('GET', `${P}/week`, ({ mode, query }) =>
        viewOf(mode, essRequester(), asWeekStart(query.weekStart ?? todayIso()))
    ),
    route('POST', `${P}/entries`, ({ mode, body }) => {
        const me = essRequester();
        const fields = validEntry(me, body ?? {});
        return mutateEntries(mode, me, weekStartOf(fields.date), week => {
            assertNoOverlap(week.entries, fields);
            const entry: TimesheetEntry = { id: newEntryId(me, fields.date), ...fields };
            return {
                entries: [...week.entries, entry],
                history: event(me, 'ENTRY_ADDED', entryLabel(entry)),
            };
        });
    }),
    route('PUT', `${P}/entries/:entryId`, ({ mode, params, body }) => {
        const me = essRequester();
        const { week, entry } = findEntryWeek(mode, me, params.entryId);
        if (lockFor(entry.date).locked)
            throw fail(409, lockFor(entry.date).reason ?? 'This day is locked.');
        const fields = validEntry(me, { ...entry, ...(body ?? {}) });
        if (weekStartOf(fields.date) !== week.weekStart)
            throw fail(400, 'An entry can only move within its week.');
        return mutateEntries(mode, me, week.weekStart, w => {
            assertNoOverlap(w.entries, { ...fields, id: entry.id });
            const updated = { ...entry, ...fields };
            return {
                entries: w.entries.map(e => (e.id === entry.id ? updated : e)),
                history: event(
                    me,
                    'ENTRY_EDITED',
                    `${entryLabel(entry)} → ${displayTime(updated.start)}–${displayTime(updated.end)} · ${updated.description}`
                ),
            };
        });
    }),
    route('DELETE', `${P}/entries/:entryId`, ({ mode, params }) => {
        const me = essRequester();
        const { week, entry } = findEntryWeek(mode, me, params.entryId);
        if (lockFor(entry.date).locked)
            throw fail(409, lockFor(entry.date).reason ?? 'This day is locked.');
        return mutateEntries(mode, me, week.weekStart, w => ({
            entries: w.entries.filter(e => e.id !== entry.id),
            history: event(me, 'ENTRY_DELETED', entryLabel(entry)),
        }));
    }),
    route('POST', `${P}/week/:weekStart/submit`, ({ mode, params }) => {
        const me = essRequester();
        const weekStart = asWeekStart(params.weekStart);
        const week = weekOf(mode, me, weekStart);
        if (week.status !== 'DRAFT' && week.status !== 'REJECTED') {
            throw fail(409, `This week is already ${week.status.toLowerCase()}.`);
        }
        if (!week.entries.length) throw fail(400, 'Add at least one entry before submitting.');
        const windows = weekWindows(me, weekStart, timesheetSettings.get(mode).mode);
        if (windows.every(w => w.locked)) {
            throw fail(409, windows[0].lockReason ?? 'This week is locked.');
        }
        const resubmit = week.status === 'REJECTED';
        saveWeek(mode, {
            ...week,
            status: 'SUBMITTED',
            submittedAt: new Date().toISOString(),
            autoSubmitted: false,
            history: [
                ...week.history,
                event(me, 'SUBMITTED', resubmit ? 'Resubmitted after rejection' : undefined),
            ],
        });
        return viewOf(mode, me, weekStart);
    }),
    route('POST', `${P}/week/:weekStart/change-request`, ({ mode, params, body }) =>
        submitChangeRequest(mode, essRequester(), asWeekStart(params.weekStart), body ?? {})
    ),
    route('PUT', `${P}/preferences`, ({ mode, body }) => {
        const me = essRequester();
        const autoSubmit = !!body?.autoSubmit;
        timesheetPreferences.update(mode, prefs =>
            prefs.some(p => p.employeeId === me.id)
                ? prefs.map(p => (p.employeeId === me.id ? { ...p, autoSubmit } : p))
                : [...prefs, { employeeId: me.id, autoSubmit }]
        );
        return { autoSubmit };
    }),
];
