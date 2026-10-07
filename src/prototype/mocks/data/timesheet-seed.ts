// PROTOTYPE-SETUP: Timesheet V1 seed — 5 weeks (current + 4 previous) for all 21 employees, generated from
// each person's real day windows (attendance, holidays, approved leave, join date) so timesheets agree with
// the Attendance screens. Deterministic for a given "today"; persisted per data mode by timesheetStore.ts.
//
// Covers every status: Draft, Submitted, Approved, Rejected, and Change Requests Pending/Approved/Rejected.
// ESS - Employee persona (Sneha, ACME-004):
//   current week  Draft, incl. Monday 19:00–21:30 "Production hotfix" outside her window
//   1 week back   Approved, with a PENDING Change Request (added client call + edited description)
//   2 weeks back  Rejected ("Friday afternoon is missing")
//   3–4 back      Approved
// Arjun's other reports have Submitted weeks waiting for him; ACME-003/012/019 opted into auto-submit and have
// a complete current week, so "Simulate submission day" submits them and skips everyone else with a reason.
import type {
    ActorRef,
    ChangeRequest,
    HistoryEvent,
    TimesheetEntry,
    TimesheetPreference,
    TimesheetSettings,
    TimesheetStatus,
    TimesheetWeek,
} from '@src/domains/timesheet/types';
import {
    addDaysIso,
    fromMinutes,
    isOutsideWindow,
    toMinutes,
    weekDates,
    weekStartOf,
} from '@src/domains/timesheet/utils';

import type { DataMode } from '../envelope';
import { isoDateTime, toIsoDate as toIso, today as now } from './dates';
import { DepartmentName, EMPLOYEES, ESS_EMPLOYEE, MockEmployee, managerOf } from './employees';
import { seeded, todayIso } from './time-calendar';
import { windowFor } from './timesheet-windows';

export const defaultTimesheetSettings = (): TimesheetSettings => ({
    mode: 'both',
    submissionWeekday: 'FRIDAY',
    level2: { attendance: 'HR', overtime: 'FINANCE', leave: 'HR', reimbursement: 'FINANCE' },
    updatedAt: isoDateTime(todayIso(), '09:00:00'),
});

/** Seed windows use the default mode; at read time windows follow the live setting. */
const SEED_MODE = 'both' as const;
/**
 * At least 5 weeks (current + 4), and always back to the first week of last month, so the locked
 * (payroll-processed) month is complete in Payroll's Timesheet Summary.
 */
const weeksToSeed = () => {
    const firstOfLastMonth = toIso(new Date(now().getFullYear(), now().getMonth() - 1, 1));
    const span = Math.round(
        (new Date(`${weekStartOf(todayIso())}T00:00:00`).getTime() -
            new Date(`${weekStartOf(firstOfLastMonth)}T00:00:00`).getTime()) /
            (7 * 24 * 3600 * 1000)
    );
    return Math.max(5, span + 1);
};

const TASKS: Record<DepartmentName, string[]> = {
    Engineering: [
        'Payments service – refund API changes',
        'Code review – checkout PRs',
        'Sprint standup & planning',
        'Bug fixes – invoice export',
        'Unit tests for the payroll calculator',
        'Design review – notifications v2',
        'Pairing session – release branch',
        'On-call: production alerts triage',
    ],
    Sales: [
        'Client demo – mid-market prospects',
        'Pipeline review with Neha',
        'Proposal drafting – Zenith Bank',
        'Prospect calls – Mumbai region',
        'CRM updates & follow-ups',
        'Contract negotiation – Kotak account',
    ],
    Operations: [
        'Vendor coordination – courier partners',
        'Inventory reconciliation',
        'Dispatch planning',
        'Office facilities follow-up',
        'Process documentation – SOPs',
        'Shipment tracking & escalations',
    ],
    Finance: [
        'Month-end close – journal entries',
        'GST reconciliation',
        'Vendor payments run',
        'Expense report review',
        'Budget vs actuals – Q3',
        'TDS working for payroll',
    ],
    HR: [
        'Interviews – backend engineer role',
        'Onboarding paperwork – new joiners',
        'Policy update – leave handbook',
        'Payroll inputs verification',
        'Employee engagement – Diwali plan',
        'Exit formalities – resignation',
    ],
    Leadership: [
        'Leadership sync',
        'Board deck review',
        'Investor call',
        'Hiring plan review',
        'Customer escalation review',
        'Strategy offsite prep',
    ],
};

// ---- helpers ------------------------------------------------------------------------------------------------

const n = (e: MockEmployee) => e.id - 1000;
const round15 = (m: number) => Math.round(m / 15) * 15;
const SYSTEM: ActorRef = { id: null, name: 'System', role: 'SYSTEM' };
const actor = (e: MockEmployee, role: ActorRef['role']): ActorRef => ({ id: e.id, name: e.fullName, role });
const dayName = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

const task = (e: MockEmployee, date: string, i: number) => {
    const pool = TASKS[e.department];
    return pool[Math.floor(seeded(e.id, date, i) * pool.length) % pool.length];
};

/** A normal day: two blocks before a 1h lunch, two after — all inside the window, no overlaps. */
const dayEntries = (e: MockEmployee, date: string, opts: { short?: boolean } = {}): TimesheetEntry[] => {
    const w = windowFor(e, date, SEED_MODE);
    if (w.kind === 'none' || !w.start || !w.end) return [];
    // Outer edges follow the window exactly (a full day = expected hours); inner splits are on 15-minute marks.
    const s = toMinutes(w.start);
    const end = toMinutes(w.end);
    const span = end - s;
    const mk = (i: number, a: number, b: number): TimesheetEntry => ({
        id: `te-${e.id}-${date}-${i}`,
        date,
        start: fromMinutes(a),
        end: fromMinutes(b),
        description: task(e, date, i),
    });
    if (span < 180) return [mk(0, s, end)];
    const lunchStart = round15(s + (span - 60) / 2);
    const lunchEnd = lunchStart + 60;
    const mid1 = round15(s + (lunchStart - s) / 2);
    const mid2 = round15(lunchEnd + (end - lunchEnd) / 2);
    const blocks = [mk(0, s, mid1), mk(1, mid1, lunchStart), mk(2, lunchEnd, mid2), mk(3, mid2, end)];
    return opts.short ? blocks.slice(0, 3) : blocks;
};

/** Entries for the working days of a week, optionally only up to `upTo` (inclusive). */
const weekEntries = (e: MockEmployee, weekStart: string, upTo?: string, shortDays: string[] = []) =>
    weekDates(weekStart)
        .filter(d => !upTo || d <= upTo)
        .flatMap(d => dayEntries(e, d, { short: shortDays.includes(d) }));

const withExtra = (entries: TimesheetEntry[], extra: TimesheetEntry) =>
    [...entries, extra].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

/** Latest working day of the week that is not payroll-locked (falls back to the latest working day). */
const editableWorkingDay = (e: MockEmployee, weekStart: string) => {
    const working = weekDates(weekStart).filter(d => windowFor(e, d, SEED_MODE).kind !== 'none');
    const open = working.filter(d => !windowFor(e, d, SEED_MODE).locked);
    return (open.length ? open : working).slice(-1)[0];
};

const lunchGap = (entries: TimesheetEntry[], date: string) => {
    const day = entries.filter(x => x.date === date).sort((a, b) => a.start.localeCompare(b.start));
    const gapAfter = day.find((x, i) => day[i + 1] && toMinutes(day[i + 1].start) - toMinutes(x.end) >= 45);
    return gapAfter ? toMinutes(gapAfter.end) : null;
};

// ---- status plan --------------------------------------------------------------------------------------------

type Plan = { status: TimesheetStatus; cr?: 'PENDING' | 'APPROVED' | 'REJECTED'; comment?: string };

const REJECTION_COMMENTS: Record<number, string> = {
    4: 'Friday afternoon is missing — please add it and resubmit.',
    6: 'Descriptions are too vague — please say what you worked on.',
    17: 'Wednesday looks incomplete — please fill in the afternoon.',
};

const planFor = (e: MockEmployee, k: number): Plan => {
    const i = n(e);
    if (k === 0) return { status: 'DRAFT' };
    if (!managerOf(e)) return { status: 'APPROVED' }; // CEO placeholder: no reporting manager
    if (i === 4) {
        if (k === 1) return { status: 'APPROVED', cr: 'PENDING' };
        if (k === 2) return { status: 'REJECTED', comment: REJECTION_COMMENTS[4] };
        return { status: 'APPROVED' };
    }
    if (k === 1) {
        if ([2, 5, 7, 11, 13, 14, 19].includes(i)) return { status: 'SUBMITTED' };
        if ([6, 17].includes(i)) return { status: 'REJECTED', comment: REJECTION_COMMENTS[i] };
        if (i === 9) return { status: 'APPROVED', cr: 'PENDING' };
    }
    if (k === 2) {
        if ([3, 12].includes(i)) return { status: 'SUBMITTED' };
        if (i === 2) return { status: 'APPROVED', cr: 'APPROVED' };
    }
    if (k === 3 && i === 7) return { status: 'APPROVED', cr: 'REJECTED' };
    return { status: 'APPROVED' };
};

const AUTO_SUBMIT_COMPLETE_NOW = [3, 12, 19];
const autoSubmitPref = (e: MockEmployee) => {
    if (e.id === ESS_EMPLOYEE.id) return false;
    if (AUTO_SUBMIT_COMPLETE_NOW.includes(n(e)) || n(e) === 1) return true;
    return seeded(e.id, 'auto-submit') < 0.45;
};

// ---- builder ------------------------------------------------------------------------------------------------

interface SeedResult {
    weeks: TimesheetWeek[];
    changeRequests: ChangeRequest[];
    preferences: TimesheetPreference[];
}

const buildWeek = (e: MockEmployee, k: number, crOut: ChangeRequest[]): TimesheetWeek | null => {
    const today = todayIso();
    const weekStart = addDaysIso(weekStartOf(today), -7 * k);
    const weekEnd = addDaysIso(weekStart, 6);
    if (e.dateOfJoin > weekEnd) return null;

    const plan = planFor(e, k);
    const manager = managerOf(e);
    const decider = manager ? actor(manager, 'MANAGER') : SYSTEM;
    const friday = addDaysIso(weekStart, 4);
    const nextMonday = addDaysIso(weekStart, 7);
    const history: HistoryEvent[] = [];
    const id = `${e.id}:${weekStart}`;
    let entries: TimesheetEntry[];

    if (plan.status === 'DRAFT') {
        // Current week: filled up to yesterday + today's morning; opted-in "complete" employees planned the
        // whole week ahead (employees may fill future days).
        const complete = AUTO_SUBMIT_COMPLETE_NOW.includes(n(e));
        entries = complete
            ? weekEntries(e, weekStart)
            : weekEntries(e, weekStart, addDaysIso(today, -1)).concat(
                  dayEntries(e, today).slice(0, weekDates(weekStart).includes(today) ? 2 : 0)
              );
        if (e.id === ESS_EMPLOYEE.id) {
            const monday = weekStart;
            const w = windowFor(e, monday, SEED_MODE);
            const after = Math.max(toMinutes('19:00'), (w.end ? toMinutes(w.end) : 0) + 30);
            entries = withExtra(entries, {
                id: `te-${e.id}-${monday}-ot`,
                date: monday,
                start: fromMinutes(after),
                end: fromMinutes(Math.min(after + 150, 23 * 60 + 45)),
                description: 'Production hotfix – payments release',
            });
            weekDates(weekStart)
                .filter(d => d < today && entries.some(x => x.date === d))
                .forEach(d =>
                    history.push({
                        at: isoDateTime(d, '18:45:00'),
                        actor: actor(e, 'EMPLOYEE'),
                        action: 'ENTRY_ADDED',
                        detail: `${dayName(d)}: ${entries.filter(x => x.date === d).length} entries logged`,
                    })
                );
        }
        return { id, employeeId: e.id, weekStart, status: 'DRAFT', entries, approvedEntries: null, history };
    }

    const rejected = plan.status === 'REJECTED';
    entries = weekEntries(e, weekStart, undefined, rejected ? [friday] : []);
    // A couple of realistic outside-window entries in past weeks.
    if (n(e) === 7 && k === 2) {
        entries = withExtra(entries, {
            id: `te-${e.id}-${addDaysIso(weekStart, 5)}-ot`,
            date: addDaysIso(weekStart, 5),
            start: '10:00',
            end: '13:00',
            description: 'Weekend deploy – Kubernetes cluster upgrade',
        });
    }
    const auto = autoSubmitPref(e) && !rejected;
    history.push({
        at: isoDateTime(friday, auto ? '20:00:00' : '18:40:00'),
        actor: auto ? SYSTEM : actor(e, 'EMPLOYEE'),
        action: auto ? 'AUTO_SUBMITTED' : 'SUBMITTED',
        detail: auto ? 'Submitted automatically on the submission day (all hours filled)' : undefined,
    });

    const week: TimesheetWeek = {
        id,
        employeeId: e.id,
        weekStart,
        status: plan.status,
        entries,
        approvedEntries: null,
        submittedAt: isoDateTime(friday, auto ? '20:00:00' : '18:40:00'),
        autoSubmitted: auto,
        history,
    };
    if (plan.status === 'SUBMITTED') return week;

    const decision = {
        by: decider,
        at: isoDateTime(nextMonday, `1${n(e) % 8}:15:00`),
        ...(plan.comment ? { comment: plan.comment } : {}),
    };
    week.decision = decision;
    history.push({
        at: decision.at,
        actor: decider,
        action: rejected ? 'REJECTED' : 'APPROVED',
        ...(plan.comment ? { detail: plan.comment } : {}),
    });
    if (rejected) return week;

    week.approvedEntries = entries;
    if (!plan.cr) return week;

    // ---- change requests on an approved week ----
    const day = editableWorkingDay(e, weekStart);
    const base = entries;
    let proposed = base;
    let reason = '';
    const requestedAt = isoDateTime(addDaysIso(nextMonday, plan.cr === 'PENDING' ? 1 : 2), '10:30:00');
    if (plan.cr === 'PENDING') {
        const gap = lunchGap(base, day) ?? toMinutes('13:00');
        const firstOfDay = base.find(x => x.date === day);
        proposed = withExtra(
            base.map(x =>
                x.id === firstOfDay?.id
                    ? { ...x, description: `${x.description} (incl. API contract sign-off)` }
                    : x
            ),
            {
                id: `te-${e.id}-${day}-cr`,
                date: day,
                start: fromMinutes(gap),
                end: fromMinutes(gap + 45),
                description: 'Client call – Zenith Bank onboarding',
            }
        );
        reason = `Forgot to log ${dayName(day)}'s client call with Zenith Bank, and clarified one description.`;
    } else if (plan.cr === 'APPROVED') {
        const last = base.filter(x => x.date === day).slice(-1)[0];
        proposed = base.map(x =>
            x.id === last?.id ? { ...x, end: fromMinutes(Math.min(toMinutes(x.end) + 30, 23 * 60)) } : x
        );
        reason = 'Code review ran 30 minutes longer than logged.';
    } else {
        const dayList = base.filter(x => x.date === day);
        // Evening block starts an hour after the day's last entry, so it can never overlap.
        const eveningStart = Math.max(
            toMinutes('19:00'),
            toMinutes(dayList.slice(-1)[0]?.end ?? '18:30') + 60
        );
        proposed = base
            .filter(x => x.id !== dayList[1]?.id)
            .concat({
                id: `te-${e.id}-${day}-cr`,
                date: day,
                start: fromMinutes(eveningStart),
                end: fromMinutes(Math.min(eveningStart + 180, 23 * 60 + 45)),
                description: 'Late-night release deployment',
            });
        reason = 'Moved the afternoon block to the evening release deployment.';
    }
    const cr: ChangeRequest = {
        id: `cr-${e.id}-${weekStart}`,
        weekId: id,
        employeeId: e.id,
        reason,
        baseEntries: base,
        proposedEntries: proposed,
        status: plan.cr,
        requestedAt,
    };
    history.push({ at: requestedAt, actor: actor(e, 'EMPLOYEE'), action: 'CHANGE_REQUESTED', detail: reason });
    if (plan.cr === 'PENDING') {
        week.entries = proposed;
        week.pendingChangeRequestId = cr.id;
    } else {
        const decidedAt = isoDateTime(addDaysIso(nextMonday, 3), '12:00:00');
        const comment = plan.cr === 'REJECTED' ? 'Please raise the deployment as an overtime request instead.' : undefined;
        cr.decision = { by: decider, at: decidedAt, ...(comment ? { comment } : {}) };
        history.push({
            at: decidedAt,
            actor: decider,
            action: plan.cr === 'APPROVED' ? 'CHANGE_APPROVED' : 'CHANGE_REJECTED',
            ...(comment ? { detail: `${comment} The week reverted to the last approved version.` } : {}),
        });
        if (plan.cr === 'APPROVED') {
            week.entries = proposed;
            week.approvedEntries = proposed;
        }
    }
    crOut.push(cr);
    return week;
};

export const seedTimesheets = (mode: DataMode): SeedResult => {
    if (mode === 'empty') return { weeks: [], changeRequests: [], preferences: [] };
    const changeRequests: ChangeRequest[] = [];
    const weeks = EMPLOYEES.flatMap(e =>
        Array.from({ length: weeksToSeed() }, (_, k) => buildWeek(e, k, changeRequests)).filter(
            (w): w is TimesheetWeek => !!w
        )
    );
    const preferences = EMPLOYEES.map(e => ({ employeeId: e.id, autoSubmit: autoSubmitPref(e) }));
    return { weeks, changeRequests, preferences };
};

/** Used by the seed check: entries outside their window, per employee. */
export const outsideEntriesOf = (week: TimesheetWeek, employee: MockEmployee) =>
    week.entries.filter(x => isOutsideWindow(x, windowFor(employee, x.date, SEED_MODE)));
