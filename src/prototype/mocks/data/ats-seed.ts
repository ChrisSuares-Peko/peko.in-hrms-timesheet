// PROTOTYPE-SETUP: ESS Service 1 — seed for Attendance & Timesheet (dummy mode). Built once from the generated
// attendance (data/time-attendance.ts) so the old Payroll screens and the new ones start from the same days,
// then persisted and changed by store/atsStore.ts. Everything is relative to today.
//
// ESS - Employee (Sneha, ACME-004) scenarios — see atsScenario():
//   sentBackWeek     last full week of last month: Sent back ("Friday afternoon is missing"); blocks last
//                    month's payroll until she resubmits and Arjun approves.
//     lateDay        Wed of that week: late check-in with a pending attendance correction.
//     afterCheckOut  Thu of that week: checked out 17:45, time logged until 19:30 → "logged outside check-in hours".
//   crWeek           the week before this one: approved, then edited (a client call added) and submitted again —
//                    back with the manager, who sees "What changed" (Rahul's same week is with Payroll).
//   overtimeDay      first working day this week (else last week) without a request: out 20:05 → suggested overtime.
//   openDay          the working day before today: still checked in (no automatic check-out), so today's
//                    check-in is blocked until she checks out of it (HR rules, Slice 1). Not checked in today.
//   overnightDay     Thursday two weeks back: 9:00 AM → 5:00 AM the next day (outDays 1), with entries until
//                    5:00 AM (next day) — 20h at work, 11h overtime on the check-in day.
//   plannedDay       next working day: a planned timesheet entry (later this week, or next week on a Friday).
//   + an approved leave in the next fortnight (data/time-leaves.ts).
// Everyone: a 1:00–2:00 PM "Lunch" break on every worked day that spans it (breaks count as logged time).
// ESS - Manager (Arjun) team today: Rahul late, Karthik not checked in, Ananya on leave.
// Payroll: every week of last month is Approved except Sneha's sent-back week; a correction and an overtime
// request already approved by managers wait for HR / Finance.
import type {
    ActorRef,
    AttendanceCorrection,
    AttendanceRecord,
    HistoryEvent,
    OvertimeRequest,
    TimesheetEntry,
    TimesheetWeek,
} from '@src/domains/attendanceTimesheet/types';
import {
    DEFAULT_SETTINGS,
    MINUTES_PER_DAY,
    addDays,
    checkOutMinutes,
    fromMinutes,
    nextStatus,
    sortEntries,
    startTrail,
    toMinutes,
    weekStartOf,
} from '@src/prototype/rules/attendance';

import { isoDateTime, monthsAgo } from './dates';
import { CEO_CODE, DepartmentName, EMPLOYEES, MockEmployee, findEmployee, managerOf } from './employees';
import { ATTENDANCE, ATTENDANCE_FROM } from './time-attendance';
import { isWorkingDay, monthBounds, seeded, todayIso, workingDayOffset } from './time-calendar';
import { OVERTIME } from './time-overtime';

export const recordKey = (employeeId: number, date: string) => `${employeeId}:${date}`;
export const weekId = (employeeId: number, weekStart: string) => `${employeeId}:${weekStart}`;

const hhmm = (localDateTime: string | null) => (localDateTime ? localDateTime.slice(11, 16) : null);
const round15 = (m: number) => Math.round(m / 15) * 15;
const LUNCH_START = 13 * 60;
const LUNCH_END = 14 * 60;
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
    const openDay = workingDayOffset(today, -1);
    // PROTOTYPE-SETUP: the earliest working day of this week (else last week) that isn't the open day and has no
    // seeded overtime request for Sneha — so it is always an unclaimed suggestion, whatever today is.
    const hasSnehaOvertime = (d: string) => OVERTIME.some(o => o.employee.employeeId === SNEHA && o.date === d);
    const overtimeDay =
        [w0, crWeek]
            .flatMap(ws => [0, 1, 2, 3, 4].map(i => addDays(ws, i)))
            .find(d => d < today && d !== openDay && isWorkingDay(d) && !hasSnehaOvertime(d)) ?? firstWorkingDayIn(crWeek);
    // PROTOTYPE-SETUP (HR rules, Slice 1): the overnight day — Thursday two weeks back (or the week before, if that
    // week is already a scripted one), without an overtime request so the 11h is suggested.
    const scripted = new Set([sentBackWeek, crWeek, addDays(sentBackWeek, -7)]);
    const overnightDay =
        [14, 21, 28]
            .map(n => addDays(w0, -n))
            .filter(ws => !scripted.has(ws))
            .map(ws => firstWorkingDayIn(ws, 3))
            .find(d => !hasSnehaOvertime(d) && d !== overtimeDay) ?? firstWorkingDayIn(addDays(w0, -14), 3);
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
        openDay,
        overnightDay,
        // PROTOTYPE-SETUP: the next working day (later this week, or next week when today is the last working day).
        plannedDay: next,
        /** Vikram worked the Saturday of crWeek. */
        workedSaturday: addDays(crWeek, 5),
        /** Vikram's day with a pending correction (he left later than he checked out). */
        vikramCorrectionDay: workingDayOffset(today, -4),
        karthikCorrectionDay: workingDayOffset(today, -10),
        divyaCorrectionDay: workingDayOffset(today, -12),
    };
};

// ---- attendance ---------------------------------------------------------------------------------------

const hasOvertimeRequest = (e: MockEmployee, date: string) =>
    OVERTIME.some(o => o.employee.id === e.id && o.date === date && o.status !== 'cancelledByEmployee');

/** A session spanning the 1:00–2:00 PM lunch the way the seeded entries split it (they leave that hour free). */
const coversLunch = (start: number, end: number) => end > LUNCH_END && start < LUNCH_START - 30 && end - start >= 5 * 60;

const seedAttendance = (s: ReturnType<typeof atsScenario>): Record<string, AttendanceRecord> => {
    const records: Record<string, AttendanceRecord> = {};
    // PROTOTYPE-SETUP (Overview v2, Slice 1): today's punches are only seeded once their time has passed on the
    // real clock, so a seeded check-in is never ahead of now (the timer always counts from check-in to now).
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    const put = (e: MockEmployee, date: string, checkIn: string | null, checkOut: string | null, source: AttendanceRecord['source'] = 'ess', outDays = 0) => {
        if (date === s.today && checkIn && toMinutes(checkIn) > now) {
            delete records[recordKey(e.id, date)];
            return;
        }
        if (date === s.today && checkOut && toMinutes(checkOut) > now) {
            put(e, date, checkIn, null, source);
            return;
        }
        if (!checkIn) {
            delete records[recordKey(e.id, date)];
            return;
        }
        records[recordKey(e.id, date)] = { employeeId: e.id, date, checkIn, checkOut, outDays: checkOut ? outDays : 0, breaks: [], source };
    };

    ATTENDANCE.forEach(a => {
        const checkIn = hhmm(a.checkIn);
        let checkOut = hhmm(a.checkOut);
        if (!checkIn) return; // absent / on leave: no record
        // PROTOTYPE-SETUP (HR rules, Slice 1): no automatic check-out — every past day is checked out (only the
        // scripted open day below stays open).
        if (!checkOut && a.date < s.today) {
            checkOut = fromMinutes(toMinutes(checkIn) + SHIFT_MINUTES + Math.floor(seeded(a.employee.id, a.date, 'out') * 15));
        }
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
    put(sneha, s.overnightDay, '09:00', '05:00', 'ess', 1);
    // Still checked in from the last working day; not checked in today (check-in is blocked until she checks out).
    put(sneha, s.openDay, '09:31', null);
    put(sneha, s.today, null, null);

    // Team today (Arjun's reports): Rahul late, Karthik not checked in; Ananya's leave comes from the leave seed.
    if (isWorkingDay(s.today)) {
        put(emp('ACME-003'), s.today, '09:55', null);
        put(emp('ACME-005'), s.today, null, null);
        put(emp('ACME-002'), s.today, '09:18', null);
        put(emp('ACME-007'), s.today, '09:27', null);
    }
    put(emp('ACME-007'), s.workedSaturday, '10:00', '14:30');
    put(emp('ACME-007'), s.vikramCorrectionDay, '09:26', '18:31');
    put(emp('ACME-005'), s.karthikCorrectionDay, '10:15', '18:40');

    // PROTOTYPE-SETUP (HR rules, Slice 1): a 1:00–2:00 PM "Lunch" break on every worked day that spans it (today:
    // once 2:00 PM has passed).
    Object.values(records).forEach(r => {
        if (!r.checkIn) return;
        let end = r.checkOut ? checkOutMinutes(r.checkOut, r.outDays ?? 0) : toMinutes(DEFAULT_SETTINGS.shift.end);
        if (r.date === s.today && !r.checkOut) end = now;
        if (r.outDays) end = Math.max(end, toMinutes(DEFAULT_SETTINGS.shift.end));
        if (coversLunch(toMinutes(r.checkIn), r.outDays ? toMinutes(DEFAULT_SETTINGS.shift.end) : end)) {
            r.breaks = [{ start: fromMinutes(LUNCH_START), end: fromMinutes(LUNCH_END), description: 'Lunch' }];
        }
    });
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

/**
 * PROTOTYPE-SETUP (Timesheet filing): every seeded entry carries a project code (from DEFAULT_FILING.projectCodes), so
 * a company that turns project codes on finds its existing entries complete.
 */
const PROJECT_CODE_BY_WORD: [RegExp, string][] = [
    [/payment|refund|checkout|payroll calculator|cutover|deploy|rollback|release/i, 'PAY-101'],
    [/invoice|zenith|client call/i, 'INV-220'],
    [/notification/i, 'NTF-310'],
    [/standup|code review|on-call|unit tests|bug|sprint/i, 'ENG-OPS'],
];
const DEPARTMENT_CODE: Record<DepartmentName, string> = {
    Engineering: 'ENG-OPS',
    Sales: 'SAL-120',
    Operations: 'OPS-210',
    Finance: 'FIN-300',
    HR: 'HR-110',
    Leadership: 'LDR-001',
};
export const projectCodeFor = (department: DepartmentName, description: string) =>
    (department === 'Engineering' ? PROJECT_CODE_BY_WORD.find(([re]) => re.test(description))?.[1] : undefined) ?? DEPARTMENT_CODE[department];

const task = (e: MockEmployee, date: string, i: number) => {
    const pool = TASKS[e.department];
    return pool[Math.floor(seeded(e.id, date, i, 'task') * pool.length) % pool.length];
};


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
        mins: b - a,
        description: task(e, date, i),
        projectCode: projectCodeFor(e.department, task(e, date, i)),
    }));

/**
 * Entries for a past day: the check-in → check-out window (a day still checked in, or one checked out the next day:
 * up to the shift end — the scenarios add the rest). Today: none (filled in by scenario).
 */
const dayEntries = (e: MockEmployee, record: AttendanceRecord | undefined, today: string): TimesheetEntry[] => {
    if (!record?.checkIn || record.date >= today) return [];
    const end = !record.checkOut || record.outDays ? DEFAULT_SETTINGS.shift.end : record.checkOut;
    return entriesFor(e, record.date, record.checkIn, end);
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
    corrections: AttendanceCorrection[];
    overtime: OvertimeRequest[];
}

/** A timed seed entry (mins = end − start; next-day times past midnight). */
const timedEntry = (
    id: string,
    date: string,
    start: string,
    end: string,
    description: string,
    next: { startNext?: boolean; endNext?: boolean } = {}
): TimesheetEntry => ({
    id,
    date,
    start,
    end,
    ...(next.startNext ? { startNext: true } : {}),
    ...(next.endNext ? { endNext: true } : {}),
    mins: toMinutes(end) + (next.endNext ? MINUTES_PER_DAY : 0) - toMinutes(start) - (next.startNext ? MINUTES_PER_DAY : 0),
    description,
    projectCode: projectCodeFor('Engineering', description),
});

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
    const sbEntries = sortEntries([
        ...sb.entries.filter(x => !(x.date === s.missingFriday && toMinutes(x.start ?? '00:00') >= LUNCH_START)),
        timedEntry(`te-${sneha.id}-${s.afterCheckOutDay}-x`, s.afterCheckOutDay, '18:15', '19:30', 'Production support – release verification'),
        // PROTOTYPE-SETUP (V2): an hours-only entry — no set times.
        { id: `te-${sneha.id}-${s.lateDay}-h`, date: s.lateDay, start: null, end: null, mins: 60, description: 'Writing release notes', projectCode: 'PAY-101' },
    ]);
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

    // PROTOTYPE-SETUP (Final batch, Slice 1): an approved week edited afterwards (a client call added out of the last
    // block of a day) and submitted again — it's back with the manager, who sees "What changed" against the approved
    // version.
    const cw = weeks[weekId(sneha.id, s.crWeek)];
    const dayBlocks = cw.entries.filter(x => x.date === s.crDay);
    const last = dayBlocks[dayBlocks.length - 1];
    if (last) {
        const callStart = fromMinutes(toMinutes(last.end ?? '18:30') - 60);
        const edited = sortEntries([
            ...cw.entries.map(x => (x.id === last.id ? { ...x, end: callStart, mins: toMinutes(callStart) - toMinutes(x.start ?? callStart) } : x)),
            timedEntry(`te-${sneha.id}-${s.crDay}-cr`, s.crDay, callStart, last.end ?? '18:30', 'Client call – Zenith Bank integration'),
        ]);
        const editedAt = isoDateTime(addDays(s.crWeek, 7), '09:30:00');
        const resubmittedAt = isoDateTime(addDays(s.crWeek, 7), '09:40:00');
        weeks[cw.id] = {
            ...cw,
            status: 'SUBMITTED',
            entries: edited,
            baselineEntries: cw.approvedEntries ?? cw.entries,
            editedAfter: 'APPROVED',
            submittedAt: resubmittedAt,
            autoSubmitted: false,
            decision: undefined,
            history: [
                ...cw.history,
                history(editedAt, actorOf(sneha, 'EMPLOYEE'), 'EDITED_AFTER_SENDING', 'Edited after it was approved. Needs submitting again.'),
                history(resubmittedAt, actorOf(sneha, 'EMPLOYEE'), 'SUBMITTED', 'Submitted again after edits.'),
            ],
        };
    }

    // PROTOTYPE-SETUP (HR rules, Slice 1): the overnight day — work until 5:00 AM the next day.
    const ow = weeks[weekId(sneha.id, weekStartOf(s.overnightDay))];
    if (ow) {
        const night = [
            timedEntry(`te-${sneha.id}-${s.overnightDay}-n1`, s.overnightDay, '18:30', '22:00', 'Production cutover prep'),
            timedEntry(`te-${sneha.id}-${s.overnightDay}-n2`, s.overnightDay, '22:00', '02:00', 'Production cutover', { endNext: true }),
            timedEntry(`te-${sneha.id}-${s.overnightDay}-n3`, s.overnightDay, '02:00', '05:00', 'Monitoring and rollback checks', { startNext: true, endNext: true }),
        ];
        const entries = sortEntries([...ow.entries, ...night]);
        weeks[ow.id] = { ...ow, entries, approvedEntries: ow.approvedEntries ? entries : null };
    }

    // This week: the open day runs past the shift end; a planned entry later.
    const tw = weeks[weekId(sneha.id, s.thisWeek)];
    if (tw && s.openDay >= s.thisWeek) {
        const x = timedEntry(`te-${sneha.id}-${s.openDay}-x`, s.openDay, '18:30', '20:15', 'Production deploy – payments v4.3');
        weeks[tw.id] = { ...tw, entries: sortEntries([...tw.entries, x]) };
    }
    // The planned entry goes in its own week (next week when today is the last working day).
    const plannedWeekStart = weekStartOf(s.plannedDay);
    const planned: TimesheetEntry = timedEntry(`te-${sneha.id}-${s.plannedDay}-0`, s.plannedDay, '10:00', '11:30', 'Sprint demo – payments release');
    const pwk = weeks[weekId(sneha.id, plannedWeekStart)] ?? draftWeek(sneha, plannedWeekStart, []);
    weeks[pwk.id] = { ...pwk, entries: sortEntries([...pwk.entries, planned]) };
    if (s.openDay < s.thisWeek) {
        // The open day fell in last week (today is Monday): the entry goes there.
        const pw = weeks[weekId(sneha.id, weekStartOf(s.openDay))];
        if (pw) {
            const x = timedEntry(`te-${sneha.id}-${s.openDay}-x`, s.openDay, '18:30', '20:15', 'Production deploy – payments v4.3');
            weeks[pw.id] = { ...pw, entries: sortEntries([...pw.entries, x]), approvedEntries: sortEntries([...pw.entries, x]) };
        }
    }
};

const teamScenarios = (s: ReturnType<typeof atsScenario>, seed: AtsSeed) => {
    const { weeks } = seed;
    // Rahul: crWeek edited after approval (a description fixed), resubmitted, approved by Arjun — now with Payroll.
    const rahul = emp('ACME-003');
    const rw = weeks[weekId(rahul.id, s.crWeek)];
    const target = rw?.entries.find(x => x.date >= s.crDay);
    const mgr = managerOf(rahul);
    if (rw && target && mgr) {
        const resubmittedAt = isoDateTime(addDays(s.crWeek, 7), '11:05:00');
        const approvedAt = isoDateTime(addDays(s.crWeek, 7), '15:20:00');
        const decision = { by: actorOf(mgr, 'MANAGER'), at: approvedAt };
        weeks[rw.id] = {
            ...rw,
            status: 'WITH_PAYROLL',
            entries: rw.entries.map(x => (x.id === target.id ? { ...x, description: 'Payments service – refund API changes' } : x)),
            baselineEntries: rw.approvedEntries ?? rw.entries,
            editedAfter: 'APPROVED',
            submittedAt: resubmittedAt,
            managerDecision: decision,
            decision,
            history: [
                ...rw.history,
                history(resubmittedAt, actorOf(rahul, 'EMPLOYEE'), 'SUBMITTED', 'Submitted again after edits.'),
                history(approvedAt, actorOf(mgr, 'MANAGER'), 'APPROVED', 'Approved, sent to Payroll'),
            ],
        };
    }
    // Vikram: time logged after his check-out (his correction to 8:10 PM is pending).
    const vikram = emp('ACME-007');
    const vw = weeks[weekId(vikram.id, weekStartOf(s.vikramCorrectionDay))];
    if (vw) {
        const x = timedEntry(`te-${vikram.id}-${s.vikramCorrectionDay}-x`, s.vikramCorrectionDay, '18:35', '20:10', 'Release support – database migration');
        const entries = sortEntries([...vw.entries, x]);
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
    // PROTOTYPE-SETUP (HR rules, Slice 1): level 2 is the Payroll queue for attendance and overtime.
    return { ...trail, status: nextStatus(steps), steps };
};

const seedCorrections = (s: ReturnType<typeof atsScenario>, attendance: AtsSeed['attendance']): AttendanceCorrection[] => {
    const make = (
        id: string,
        c: string,
        date: string,
        requested: { checkIn: string | null; checkOut: string | null },
        reason: string,
        state: Parameters<typeof trailFor>[2],
        extra: Partial<AttendanceCorrection> = {}
    ): AttendanceCorrection | null => {
        const e = emp(c);
        const r = attendance[recordKey(e.id, date)];
        if (date < e.dateOfJoin) return null;
        const createdAt = isoDateTime(workingDayOffset(date, 1), '04:30:00');
        return {
            id,
            employeeId: e.id,
            date,
            current: { checkIn: r?.checkIn ?? null, checkOut: r?.checkOut ?? null, outDays: r?.outDays ?? 0 },
            requested: { ...requested, outDays: 0 },
            reason,
            trail: trailFor('attendance', e, state, isoDateTime(workingDayOffset(date, 1), '07:00:00')),
            createdAt,
            updatedAt: createdAt,
            ...extra,
        };
    };
    return [
        make('ac-001', SNEHA, s.lateDay, { checkIn: '09:28', checkOut: '18:58' }, 'Badge log shows 9:26 AM — the ESS check-in timed out at the gate.', 'pending-manager'),
        make('ac-002', 'ACME-007', s.vikramCorrectionDay, { checkIn: '09:26', checkOut: '20:10' }, 'Stayed for the database migration — I tapped Check out by mistake at 6:31 PM.', 'pending-manager', { fromTimesheet: true }),
        make('ac-003', 'ACME-005', s.karthikCorrectionDay, { checkIn: '09:30', checkOut: '18:40' }, 'Was at the client site first — Arjun knew.', 'pending-l2'),
        make('ac-004', 'ACME-013', s.divyaCorrectionDay, { checkIn: '09:20', checkOut: '18:30' }, 'Biometric reader was down in the morning.', 'approved'),
    ].filter((c): c is AttendanceCorrection => c !== null);
};

const OT_STATE: Record<string, Parameters<typeof trailFor>[2]> = {
    requestedByEmployee: 'pending-manager',
    approved: 'approved',
    rejected: 'rejected',
    cancelledByEmployee: 'cancelled',
};

const seedOvertime = (s: ReturnType<typeof atsScenario>): OvertimeRequest[] => {
    // Only days the seeded attendance covers, so every request has that day's hours as context.
    const fromOld = OVERTIME.filter(o => o.date >= ATTENDANCE_FROM).map((o): OvertimeRequest => {
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
// PROTOTYPE-SETUP: per day — the seed is built around the real current date (see persistentStore demoDay()).
let cached: { day: string; seed: AtsSeed } | null = null;

export const buildAtsSeed = (): AtsSeed => {
    const day = todayIso();
    if (cached?.day === day) return cached.seed;
    const s = atsScenario();
    const attendance = seedAttendance(s);
    const seed: AtsSeed = {
        attendance,
        weeks: buildWeeks(s, attendance),
        corrections: seedCorrections(s, attendance),
        overtime: seedOvertime(s),
    };
    snehaScenarios(s, seed);
    teamScenarios(s, seed);
    cached = { day, seed };
    return seed;
};

/** CEO code re-exported for the store (timesheets auto-approved, requests skip to level 2). */
export const isCeo = (e: MockEmployee) => code(e) === CEO_CODE;
