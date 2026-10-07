// PROTOTYPE-SETUP: ESS Service 1 — seed for Attendance & Timesheet (dummy mode). Built once from the generated
// attendance (data/time-attendance.ts) so the old Payroll screens and the new ones start from the same days,
// then persisted and changed by store/atsStore.ts. Everything is relative to today.
//
// ESS - Employee (Sneha, ACME-004) scenarios — see atsScenario():
//   sentBackWeek     last full week of last month: Sent back ("Friday afternoon is missing"); blocks last
//                    month's payroll until she resubmits and Arjun approves.
//     lateDay        Wed of that week: late check-in with a pending attendance correction.
//     afterCheckOut  Thu of that week: checked out 17:45, time logged until 19:30 → "logged outside check-in hours".
//   crWeek           the week before this one: Approved, with a pending change request (client call added).
//   overtimeDay      Monday this week: checked out 20:05, no overtime request → suggested overtime.
//   autoDay          the working day before today: no check-out (auto 18:30), entries until 20:15.
//   plannedDay       next working day this week: a planned timesheet entry.
//   + an approved leave in the next fortnight (data/time-leaves.ts) and a rejected change request in the past.
// ESS - Manager (Arjun) team today: Rahul late, Karthik not checked in, Ananya on leave; Sneha checked in.
// Payroll: every week of last month is Approved except Sneha's sent-back week; a correction and an overtime
// request already approved by managers wait for HR / Finance.
import type {
    ActorRef,
    AttendanceCorrection,
    AttendanceRecord,
    ChangeRequest,
    HistoryEvent,
    OvertimeRequest,
    TimesheetEntry,
    TimesheetWeek,
} from '@src/domains/attendanceTimesheet/types';
import {
    DEFAULT_SETTINGS,
    addDays,
    effectiveCheckOut,
    fromMinutes,
    startTrail,
    toMinutes,
    weekStartOf,
} from '@src/prototype/rules/attendance';

import { isoDateTime, monthsAgo } from './dates';
import { CEO_CODE, DepartmentName, EMPLOYEES, MockEmployee, findEmployee, managerOf } from './employees';
import { ATTENDANCE } from './time-attendance';
import { isWorkingDay, monthBounds, seeded, todayIso, workingDayOffset } from './time-calendar';
import { OVERTIME } from './time-overtime';

export const recordKey = (employeeId: number, date: string) => `${employeeId}:${date}`;
export const weekId = (employeeId: number, weekStart: string) => `${employeeId}:${weekStart}`;

const hhmm = (localDateTime: string | null) => (localDateTime ? localDateTime.slice(11, 16) : null);
const round15 = (m: number) => Math.round(m / 15) * 15;
const SHIFT_MINUTES = toMinutes(DEFAULT_SETTINGS.shift.end) - toMinutes(DEFAULT_SETTINGS.shift.start);

const SNEHA = 'ACME-004';
const code = (e: MockEmployee) => e.employeeId;
const emp = (c: string) => findEmployee(c)!;

export const actorOf = (e: MockEmployee, role: ActorRef['role']): ActorRef => ({ id: e.id, name: e.fullName, role });
export const SYSTEM_ACTOR: ActorRef = { id: null, name: 'System', role: 'SYSTEM' };

/** First Monday the seed covers: the week containing the first day of last month. */
export const seedFromWeek = () => weekStartOf(monthsAgo(1, 1));

const firstWorkingDayIn = (weekStart: string, fromIndex = 0) =>
    [0, 1, 2, 3, 4].map(i => addDays(weekStart, i)).find((d, i) => i >= fromIndex && isWorkingDay(d)) ??
    addDays(weekStart, fromIndex);

/** The scripted dates (relative to today). */
export const atsScenario = () => {
    const today = todayIso();
    const w0 = weekStartOf(today);
    const lastMonthEnd = monthBounds(monthsAgo(1, 1)).last;
    const sentBackWeek = addDays(weekStartOf(lastMonthEnd), -7);
    const crWeekCandidate = addDays(w0, -7);
    const crWeek = crWeekCandidate === sentBackWeek ? addDays(sentBackWeek, 7) : crWeekCandidate;
    const autoDay = workingDayOffset(today, -1);
    const mondayThisWeek = firstWorkingDayIn(w0);
    const overtimeDay =
        mondayThisWeek < today && mondayThisWeek !== autoDay ? mondayThisWeek : firstWorkingDayIn(crWeek);
    const next = workingDayOffset(today, 1);
    return {
        today,
        thisWeek: w0,
        sentBackWeek,
        lateDay: firstWorkingDayIn(sentBackWeek, 2),
        afterCheckOutDay: firstWorkingDayIn(sentBackWeek, 3),
        missingFriday: firstWorkingDayIn(sentBackWeek, 4),
        crWeek,
        crDay: firstWorkingDayIn(crWeek, 2),
        rejectedCrWeek: addDays(sentBackWeek, -7),
        overtimeDay,
        autoDay,
        plannedDay: weekStartOf(next) === w0 ? next : null,
        /** Vikram worked the Saturday of crWeek. */
        workedSaturday: addDays(crWeek, 5),
        /** Vikram's auto check-out day with an Update check-out request. */
        vikramAutoDay: workingDayOffset(today, -4),
        karthikCorrectionDay: workingDayOffset(today, -10),
        divyaCorrectionDay: workingDayOffset(today, -12),
    };
};

// ---- attendance ---------------------------------------------------------------------------------------

const hasOvertimeRequest = (e: MockEmployee, date: string) =>
    OVERTIME.some(o => o.employee.id === e.id && o.date === date && o.status !== 'cancelledByEmployee');

const seedAttendance = (s: ReturnType<typeof atsScenario>): Record<string, AttendanceRecord> => {
    const records: Record<string, AttendanceRecord> = {};
    const put = (e: MockEmployee, date: string, checkIn: string | null, checkOut: string | null, source: AttendanceRecord['source'] = 'ess') => {
        if (!checkIn) {
            delete records[recordKey(e.id, date)];
            return;
        }
        records[recordKey(e.id, date)] = { employeeId: e.id, date, checkIn, checkOut, source };
    };

    ATTENDANCE.forEach(a => {
        const checkIn = hhmm(a.checkIn);
        let checkOut = hhmm(a.checkOut);
        if (!checkIn) return; // absent / on leave: no record
        // Keep unclaimed overtime rare: only scripted days (and real overtime requests) run long.
        if (checkOut && !hasOvertimeRequest(a.employee, a.date)) {
            const extra = toMinutes(checkOut) - toMinutes(checkIn) - SHIFT_MINUTES;
            if (extra >= 25) {
                checkOut = fromMinutes(toMinutes(checkIn) + SHIFT_MINUTES + Math.floor(seeded(a.employee.id, a.date, 'ats') * 20));
            }
        }
        put(a.employee, a.date, checkIn, checkOut, a.method === 'manual' ? 'manual' : 'ess');
    });

    const sneha = emp(SNEHA);
    put(sneha, s.lateDay, '09:52', '18:58');
    put(sneha, s.afterCheckOutDay, '09:24', '17:45');
    put(sneha, s.overtimeDay, '09:20', '20:05');
    put(sneha, s.autoDay, '09:31', null);
    if (isWorkingDay(s.today)) put(sneha, s.today, '09:24', null);

    // Team today (Arjun's reports): Rahul late, Karthik not checked in; Ananya's leave comes from the leave seed.
    if (isWorkingDay(s.today)) {
        put(emp('ACME-003'), s.today, '09:55', null);
        put(emp('ACME-005'), s.today, null, null);
        put(emp('ACME-002'), s.today, '09:18', null);
        put(emp('ACME-007'), s.today, '09:27', null);
    }
    put(emp('ACME-007'), s.workedSaturday, '10:00', '14:30');
    put(emp('ACME-007'), s.vikramAutoDay, '09:26', null);
    put(emp('ACME-005'), s.karthikCorrectionDay, '10:15', '18:40');
    return records;
};

// ---- timesheet entries --------------------------------------------------------------------------------

const TASKS: Record<DepartmentName, string[]> = {
    Engineering: ['Payments service – refund API changes', 'Code review – checkout PRs', 'Sprint standup & planning', 'Bug fixes – invoice export', 'Unit tests for the payroll calculator', 'Design review – notifications v2', 'On-call: production alerts triage'],
    Sales: ['Client demo – mid-market prospects', 'Pipeline review', 'Proposal drafting – Zenith Bank', 'Prospect calls – Mumbai region', 'CRM updates & follow-ups'],
    Operations: ['Vendor coordination – courier partners', 'Inventory reconciliation', 'Dispatch planning', 'Process documentation – SOPs', 'Shipment tracking & escalations'],
    Finance: ['Month-end close – journal entries', 'GST reconciliation', 'Vendor payments run', 'Expense report review', 'Budget vs actuals – Q3'],
    HR: ['Interviews – backend engineer role', 'Onboarding paperwork – new joiners', 'Policy update – leave handbook', 'Payroll inputs verification', 'Employee engagement – Diwali plan'],
    Leadership: ['Leadership sync', 'Board deck review', 'Investor call', 'Hiring plan review', 'Customer escalation review'],
};

const task = (e: MockEmployee, date: string, i: number) => {
    const pool = TASKS[e.department];
    return pool[Math.floor(seeded(e.id, date, i, 'task') * pool.length) % pool.length];
};

const LUNCH_START = 13 * 60;
const LUNCH_END = 14 * 60;

/** Blocks covering [start, end] with a 13:00–14:00 lunch when the day spans it. */
const blocksFor = (s: number, e: number): [number, number][] => {
    if (e <= s) return [];
    if (e <= LUNCH_START || s >= LUNCH_START - 30 || e - s < 5 * 60) {
        const mid = s + round15((e - s) / 2);
        return mid > s && mid < e ? [[s, mid], [mid, e]] : [[s, e]];
    }
    const m1 = s + round15((LUNCH_START - s) / 2);
    const m2 = LUNCH_END + round15((e - LUNCH_END) / 2);
    return ([[s, m1], [m1, LUNCH_START], [LUNCH_END, m2], [m2, e]] as [number, number][]).filter(([a, b]) => b > a);
};

const entriesFor = (e: MockEmployee, date: string, start: string, end: string): TimesheetEntry[] =>
    blocksFor(toMinutes(start), toMinutes(end)).map(([a, b], i) => ({
        id: `te-${e.id}-${date}-${i}`,
        date,
        start: fromMinutes(a),
        end: fromMinutes(b),
        description: task(e, date, i),
    }));

/** Entries for a past day: the check-in → (effective) check-out window. Today: none (filled in by scenario). */
const dayEntries = (e: MockEmployee, record: AttendanceRecord | undefined, today: string): TimesheetEntry[] => {
    if (!record?.checkIn || record.date >= today) return [];
    const { checkOut } = effectiveCheckOut({ date: record.date, today, checkIn: record.checkIn, checkOut: record.checkOut, settings: DEFAULT_SETTINGS });
    return checkOut ? entriesFor(e, record.date, record.checkIn, checkOut) : [];
};

// ---- weeks ------------------------------------------------------------------------------------------------

const history = (at: string, actor: ActorRef, action: HistoryEvent['action'], detail?: string): HistoryEvent => ({
    at,
    actor,
    action,
    ...(detail ? { detail } : {}),
});

const approvedWeek = (e: MockEmployee, weekStart: string, entries: TimesheetEntry[]): TimesheetWeek => {
    const manager = managerOf(e);
    const submittedAt = isoDateTime(addDays(weekStart, 4), '12:30:00');
    const decidedAt = isoDateTime(addDays(weekStart, 7), '05:00:00');
    const decider = manager ? actorOf(manager, 'MANAGER') : SYSTEM_ACTOR;
    return {
        id: weekId(e.id, weekStart),
        employeeId: e.id,
        weekStart,
        status: 'APPROVED',
        entries,
        approvedEntries: entries,
        submittedAt,
        autoSubmitted: true,
        decision: { by: decider, at: decidedAt, ...(manager ? {} : { comment: 'Auto-approved — no reporting manager.' }) },
        history: [
            history(submittedAt, SYSTEM_ACTOR, 'AUTO_SUBMITTED', 'Sent to the manager on submission day'),
            history(decidedAt, decider, 'APPROVED', manager ? undefined : 'Auto-approved — no reporting manager'),
        ],
    };
};

const draftWeek = (e: MockEmployee, weekStart: string, entries: TimesheetEntry[]): TimesheetWeek => ({
    id: weekId(e.id, weekStart),
    employeeId: e.id,
    weekStart,
    status: 'DRAFT',
    entries,
    approvedEntries: null,
    history: [],
});

export interface AtsSeed {
    attendance: Record<string, AttendanceRecord>;
    weeks: Record<string, TimesheetWeek>;
    changeRequests: ChangeRequest[];
    corrections: AttendanceCorrection[];
    overtime: OvertimeRequest[];
}

const byDate = (a: TimesheetEntry, b: TimesheetEntry) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start);

const buildWeeks = (s: ReturnType<typeof atsScenario>, attendance: AtsSeed['attendance']) => {
    const weeks: Record<string, TimesheetWeek> = {};
    const from = seedFromWeek();
    const weekStarts = Array.from({ length: 12 }, (_, i) => addDays(from, i * 7)).filter(w => w <= s.thisWeek);
    EMPLOYEES.forEach(e => {
        weekStarts
            .filter(ws => addDays(ws, 6) >= e.dateOfJoin)
            .forEach(ws => {
                const entries = [0, 1, 2, 3, 4, 5, 6]
                    .map(i => addDays(ws, i))
                    .flatMap(d => dayEntries(e, attendance[recordKey(e.id, d)], s.today));
                weeks[weekId(e.id, ws)] = ws < s.thisWeek ? approvedWeek(e, ws, entries) : draftWeek(e, ws, entries);
            });
    });
    return weeks;
};

const snehaScenarios = (s: ReturnType<typeof atsScenario>, seed: AtsSeed) => {
    const sneha = emp(SNEHA);
    const arjun = managerOf(sneha)!;
    const { weeks } = seed;

    // Sent-back week: Friday afternoon missing; time logged after the 17:45 check-out on Thursday.
    const sb = weeks[weekId(sneha.id, s.sentBackWeek)];
    const sbEntries = [
        ...sb.entries.filter(x => !(x.date === s.missingFriday && toMinutes(x.start) >= LUNCH_START)),
        { id: `te-${sneha.id}-${s.afterCheckOutDay}-x`, date: s.afterCheckOutDay, start: '18:15', end: '19:30', description: 'Production support – release verification' },
    ].sort(byDate);
    const submittedAt = isoDateTime(addDays(s.sentBackWeek, 4), '12:30:00');
    const sentBackAt = isoDateTime(addDays(s.sentBackWeek, 7), '05:10:00');
    const comment = 'Friday afternoon is missing — please add it and resubmit.';
    weeks[sb.id] = {
        ...sb,
        status: 'SENT_BACK',
        entries: sbEntries,
        approvedEntries: null,
        submittedAt,
        autoSubmitted: true,
        decision: { by: actorOf(arjun, 'MANAGER'), at: sentBackAt, comment },
        history: [
            history(submittedAt, SYSTEM_ACTOR, 'AUTO_SUBMITTED', 'Sent to the manager on submission day'),
            history(sentBackAt, actorOf(arjun, 'MANAGER'), 'SENT_BACK', comment),
        ],
    };

    // Approved week with a pending change request: last block on crDay shortened, a client call added.
    const cw = weeks[weekId(sneha.id, s.crWeek)];
    const dayBlocks = cw.entries.filter(x => x.date === s.crDay);
    const last = dayBlocks[dayBlocks.length - 1];
    if (last) {
        const callStart = fromMinutes(toMinutes(last.end) - 60);
        const proposed = [
            ...cw.entries.map(x => (x.id === last.id ? { ...x, end: callStart } : x)),
            { id: `te-${sneha.id}-${s.crDay}-cr`, date: s.crDay, start: callStart, end: last.end, description: 'Client call – Zenith Bank integration' },
        ].sort(byDate);
        const requestedAt = isoDateTime(addDays(s.crWeek, 7), '09:40:00');
        seed.changeRequests.push({
            id: 'cr-001',
            weekId: cw.id,
            employeeId: sneha.id,
            reason: 'Forgot to log the Zenith Bank client call — it came out of the last block of the day.',
            baseEntries: cw.entries,
            proposedEntries: proposed,
            status: 'PENDING',
            requestedAt,
        });
        weeks[cw.id] = {
            ...cw,
            pendingChangeRequestId: 'cr-001',
            history: [...cw.history, history(requestedAt, actorOf(sneha, 'EMPLOYEE'), 'CHANGE_REQUESTED', 'Client call added')],
        };
    }

    // A rejected change request in the past.
    const rw = weeks[weekId(sneha.id, s.rejectedCrWeek)];
    if (rw?.entries.length) {
        const first = rw.entries[0];
        const at = isoDateTime(addDays(s.rejectedCrWeek, 8), '06:00:00');
        const decidedAt = isoDateTime(addDays(s.rejectedCrWeek, 9), '05:30:00');
        const rejectComment = 'These hours are already billed to the client — keep the original split.';
        seed.changeRequests.push({
            id: 'cr-000',
            weekId: rw.id,
            employeeId: sneha.id,
            reason: 'Re-label the first block as design review.',
            baseEntries: rw.entries,
            proposedEntries: rw.entries.map(x => (x.id === first.id ? { ...x, description: 'Design review – notifications v2' } : x)),
            status: 'REJECTED',
            requestedAt: at,
            decision: { by: actorOf(arjun, 'MANAGER'), at: decidedAt, comment: rejectComment },
        });
        weeks[rw.id] = {
            ...rw,
            history: [
                ...rw.history,
                history(at, actorOf(sneha, 'EMPLOYEE'), 'CHANGE_REQUESTED', 'Description change'),
                history(decidedAt, actorOf(arjun, 'MANAGER'), 'CHANGE_REJECTED', rejectComment),
            ],
        };
    }

    // This week: the auto check-out day runs past 18:30; a morning block today; a planned entry later.
    const tw = weeks[weekId(sneha.id, s.thisWeek)];
    if (tw) {
        const extra: TimesheetEntry[] = [];
        if (s.autoDay >= s.thisWeek) {
            extra.push({ id: `te-${sneha.id}-${s.autoDay}-x`, date: s.autoDay, start: '18:30', end: '20:15', description: 'Production deploy – payments v4.3' });
        }
        if (isWorkingDay(s.today)) {
            extra.push({ id: `te-${sneha.id}-${s.today}-0`, date: s.today, start: '09:30', end: '11:00', description: 'Sprint standup & planning' });
        }
        if (s.plannedDay) {
            extra.push({ id: `te-${sneha.id}-${s.plannedDay}-0`, date: s.plannedDay, start: '10:00', end: '11:30', description: 'Sprint demo – payments release' });
        }
        weeks[tw.id] = { ...tw, entries: [...tw.entries, ...extra].sort(byDate) };
    }
    if (s.autoDay < s.thisWeek) {
        // Auto day fell in last week (today is Monday): the entry goes there.
        const pw = weeks[weekId(sneha.id, weekStartOf(s.autoDay))];
        if (pw) {
            const x = { id: `te-${sneha.id}-${s.autoDay}-x`, date: s.autoDay, start: '18:30', end: '20:15', description: 'Production deploy – payments v4.3' };
            weeks[pw.id] = { ...pw, entries: [...pw.entries, x].sort(byDate), approvedEntries: [...pw.entries, x].sort(byDate) };
        }
    }
};

const teamScenarios = (s: ReturnType<typeof atsScenario>, seed: AtsSeed) => {
    const { weeks } = seed;
    // Rahul: a pending change request on crWeek (description edit).
    const rahul = emp('ACME-003');
    const rw = weeks[weekId(rahul.id, s.crWeek)];
    const target = rw?.entries.find(x => x.date >= s.crDay);
    if (rw && target) {
        const requestedAt = isoDateTime(addDays(s.crWeek, 7), '11:05:00');
        seed.changeRequests.push({
            id: 'cr-002',
            weekId: rw.id,
            employeeId: rahul.id,
            reason: 'Wrong project on this block — it was the refund API, not code review.',
            baseEntries: rw.entries,
            proposedEntries: rw.entries.map(x => (x.id === target.id ? { ...x, description: 'Payments service – refund API changes' } : x)),
            status: 'PENDING',
            requestedAt,
        });
        weeks[rw.id] = {
            ...rw,
            pendingChangeRequestId: 'cr-002',
            history: [...rw.history, history(requestedAt, actorOf(rahul, 'EMPLOYEE'), 'CHANGE_REQUESTED', 'Description change')],
        };
    }
    // Vikram: time logged after the auto check-out (his Update check-out request is pending).
    const vikram = emp('ACME-007');
    const vw = weeks[weekId(vikram.id, weekStartOf(s.vikramAutoDay))];
    if (vw) {
        const x = { id: `te-${vikram.id}-${s.vikramAutoDay}-x`, date: s.vikramAutoDay, start: '18:30', end: '20:10', description: 'Release support – database migration' };
        const entries = [...vw.entries, x].sort(byDate);
        weeks[vw.id] = { ...vw, entries, approvedEntries: vw.status === 'APPROVED' ? entries : vw.approvedEntries };
    }
};

// ---- requests -------------------------------------------------------------------------------------------

const trailFor = (
    type: 'attendance' | 'overtime',
    e: MockEmployee,
    state: 'pending-manager' | 'pending-l2' | 'approved' | 'rejected' | 'cancelled',
    at: string,
    comment?: string
) => {
    const manager = managerOf(e);
    const trail = startTrail(type, manager ? { id: manager.id, name: manager.fullName } : null, DEFAULT_SETTINGS);
    if (state === 'pending-manager') return trail;
    if (state === 'cancelled') return { ...trail, status: 'CANCELLED' as const };
    if (state === 'rejected') {
        const steps = trail.steps.map((st, i) => (i === 0 && !st.skipped ? { ...st, decision: 'REJECTED' as const, at, comment: comment ?? 'Not approved.' } : st));
        return { ...trail, status: 'REJECTED' as const, steps };
    }
    const steps = trail.steps.map(st => {
        if (st.skipped) return st;
        if (st.level === 1 || state === 'approved') return { ...st, decision: 'APPROVED' as const, at };
        return st;
    });
    const pendingL2 = steps.find(st => !st.decision && !st.skipped);
    let status: OvertimeRequest['trail']['status'] = 'APPROVED';
    if (pendingL2) status = pendingL2.role === 'HR' ? 'PENDING_HR' : 'PENDING_FINANCE';
    return { ...trail, status, steps };
};

const seedCorrections = (s: ReturnType<typeof atsScenario>, attendance: AtsSeed['attendance']): AttendanceCorrection[] => {
    const make = (
        id: string,
        c: string,
        date: string,
        kind: AttendanceCorrection['kind'],
        requested: { checkIn: string | null; checkOut: string | null },
        reason: string,
        state: Parameters<typeof trailFor>[2],
        extra: Partial<AttendanceCorrection> = {}
    ): AttendanceCorrection | null => {
        const e = emp(c);
        const r = attendance[recordKey(e.id, date)];
        if (date < e.dateOfJoin) return null;
        const eff = effectiveCheckOut({ date, today: s.today, checkIn: r?.checkIn ?? null, checkOut: r?.checkOut ?? null, settings: DEFAULT_SETTINGS });
        const createdAt = isoDateTime(workingDayOffset(date, 1), '04:30:00');
        return {
            id,
            employeeId: e.id,
            date,
            kind,
            current: { checkIn: r?.checkIn ?? null, checkOut: eff.checkOut, checkOutAuto: eff.auto },
            requested,
            reason,
            trail: trailFor('attendance', e, state, isoDateTime(workingDayOffset(date, 1), '07:00:00')),
            createdAt,
            updatedAt: createdAt,
            ...extra,
        };
    };
    return [
        make('ac-001', SNEHA, s.lateDay, 'correction', { checkIn: '09:28', checkOut: '18:58' }, 'Badge log shows 09:26 — the ESS check-in timed out at the gate.', 'pending-manager'),
        make('ac-002', 'ACME-007', s.vikramAutoDay, 'update-check-out', { checkIn: '09:26', checkOut: '20:10' }, 'Stayed for the database migration and forgot to check out.', 'pending-manager', { fromTimesheet: true }),
        make('ac-003', 'ACME-005', s.karthikCorrectionDay, 'correction', { checkIn: '09:30', checkOut: '18:40' }, 'Was at the client site first — Arjun knew.', 'pending-l2'),
        make('ac-004', 'ACME-013', s.divyaCorrectionDay, 'correction', { checkIn: '09:20', checkOut: '18:30' }, 'Biometric reader was down in the morning.', 'approved'),
    ].filter((c): c is AttendanceCorrection => c !== null);
};

const OT_STATE: Record<string, Parameters<typeof trailFor>[2]> = {
    requestedByEmployee: 'pending-manager',
    approved: 'approved',
    rejected: 'rejected',
    cancelledByEmployee: 'cancelled',
};

const seedOvertime = (s: ReturnType<typeof atsScenario>): OvertimeRequest[] => {
    const fromOld = OVERTIME.map((o): OvertimeRequest => {
        // Imran's approved overtime: the manager approved, Finance hasn't yet.
        const state = o.employee.employeeId === 'ACME-014' ? 'pending-l2' : OT_STATE[o.status];
        return {
            id: o.id,
            employeeId: o.employee.id,
            kind: 'worked',
            date: o.date,
            minutes: Math.round(o.extraHours * 60),
            description: o.notes,
            basis: 'attendance',
            trail: trailFor('overtime', o.employee, state, o.updatedAt, 'Please plan this within working hours.'),
            createdAt: o.createdAt,
            updatedAt: o.updatedAt,
        };
    });
    const priya = emp('ACME-002');
    const planned: OvertimeRequest[] = s.plannedDay
        ? [
              {
                  id: 'ot-101',
                  employeeId: priya.id,
                  kind: 'planned',
                  date: s.plannedDay,
                  minutes: 120,
                  description: 'Release cut-over support for payments v4.3 after business hours.',
                  basis: 'attendance',
                  trail: trailFor('overtime', priya, 'pending-manager', isoDateTime(s.today, '04:00:00')),
                  createdAt: isoDateTime(s.today, '04:00:00'),
                  updatedAt: isoDateTime(s.today, '04:00:00'),
              },
          ]
        : [];
    return [...planned, ...fromOld];
};

/** The whole dummy-mode seed, built once per page load. */
let cached: AtsSeed | null = null;

export const buildAtsSeed = (): AtsSeed => {
    if (cached) return cached;
    const s = atsScenario();
    const attendance = seedAttendance(s);
    const seed: AtsSeed = {
        attendance,
        weeks: buildWeeks(s, attendance),
        changeRequests: [],
        corrections: seedCorrections(s, attendance),
        overtime: seedOvertime(s),
    };
    snehaScenarios(s, seed);
    teamScenarios(s, seed);
    cached = seed;
    return seed;
};

/** CEO code re-exported for the store (timesheets auto-approved, requests skip to level 2). */
export const isCeo = (e: MockEmployee) => code(e) === CEO_CODE;
