// PROTOTYPE-SETUP (Final batch, Slice 1): the leave policy engine, in one pure module — the leave year, pro-rata,
// credits (upfront, monthly, monthly during probation and the rest when probation ends), carry-forward and lapse at
// reset, leave taken, late check-in deductions (Annual first, then Casual, then loss of pay) and their reversals, the
// per-type ledger and the exit settlement. Leave requests (half days, proof, overlap, balance) are checked here too.
// No store, no React, no "now" unless passed in. Contract: docs/api/leave-policy.md. Tests: ./__tests__/leavePolicy.test.ts.
import type {
    LateDeduction,
    LeaveBalance,
    LeaveHalf,
    LeavePolicy,
    LeaveSettlement,
    LeaveType,
    LedgerEntry,
} from '@src/domains/attendanceTimesheet/types';

import { RuleError, addDays } from './attendance';

export const LEAVE_TYPES: LeaveType[] = ['ANNUAL', 'CASUAL', 'SICK'];

export const LEAVE_LABEL: Record<LeaveType, string> = { ANNUAL: 'Annual', CASUAL: 'Casual', SICK: 'Sick' };

// The defaults live with DEFAULT_SETTINGS (rules/attendance.ts) — re-exported here.
export { DEFAULT_LATE_DEDUCTION_DAYS, DEFAULT_LEAVE_POLICY } from './attendance';

/** Sick leave longer than this needs proof. */
export const SICK_PROOF_AFTER_DAYS = 3;

// ---- dates ------------------------------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');
const parts = (iso: string) => iso.split('-').map(Number) as [number, number, number];
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();

/** The same day n months later (clamped to the month's last day): 2026-08-31 + 1 → 2026-09-30. */
export const addMonthsTo = (iso: string, n: number) => {
    const [y, m, d] = parts(iso);
    const t = new Date(y, m - 1 + n, 1);
    const day = Math.min(d, daysInMonth(t.getFullYear(), t.getMonth() + 1));
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(day)}`;
};

/** The leave year containing `today`: from the company cycle start, or from the joining anniversary. */
export const leaveYearOf = (today: string, policy: Pick<LeavePolicy, 'year' | 'cycleStart'>, dateOfJoin: string) => {
    const anniversary = dateOfJoin.slice(5) === '02-29' ? '02-28' : dateOfJoin.slice(5);
    const mmdd = policy.year === 'COMPANY' ? policy.cycleStart : anniversary;
    const y = Number(today.slice(0, 4));
    const start = `${y}-${mmdd}` <= today ? `${y}-${mmdd}` : `${y - 1}-${mmdd}`;
    return { start, end: addDays(addMonthsTo(start, 12), -1) };
};

/** The year's 12 months: [start, end] of each. */
export const yearMonths = (yearStart: string) =>
    Array.from({ length: 12 }, (_, i) => ({ start: addMonthsTo(yearStart, i), end: addDays(addMonthsTo(yearStart, i + 1), -1) }));

const dayOf = (iso: string) => Number(iso.slice(8, 10));

/**
 * Pro-rata: the months of the year that count. Joining: the month counts if they joined on or before the 15th.
 * Exit: the month counts if they leave on or after the 15th. Months fully before joining or after leaving don't.
 */
export const countedMonths = (yearStart: string, dateOfJoin: string, exitDate?: string | null) =>
    yearMonths(yearStart).filter(m => {
        if (dateOfJoin > m.end) return false;
        if (dateOfJoin > m.start && dayOf(dateOfJoin) > 15) return false;
        if (exitDate) {
            if (exitDate < m.start) return false;
            if (exitDate <= m.end && dayOf(exitDate) < 15) return false;
        }
        return true;
    });

/** Entitlement = days per year × counted months ÷ 12 (not rounded). */
export const entitlementOf = (daysPerYear: number, counted: number) => (daysPerYear * counted) / 12;

/** 1.0833 → "1.08", 2 → "2", 0.5 → "0.5" */
export const fmtDays = (n: number) => String(Math.round(n * 100) / 100);
/** "0.5 day" / "1 day" / "1.5 days" (a day or less is singular). */
export const dayWord = (n: number) => `day${n <= 1 ? '' : 's'}`;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "1 Nov" */
export const dayMonth = (iso: string) => `${dayOf(iso)} ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]}`;

// ---- the ledger ------------------------------------------------------------------------------------------

export interface TakenLeave {
    type: LeaveType;
    start: string;
    end: string;
    half: LeaveHalf | null;
    days: number;
}

export interface LateEvent {
    date: string;
    lateMinutes: number;
    /** 'pending' = a correction is waiting (still deducted); 'reversed' = an approved correction cleared it. */
    state: 'deducted' | 'pending' | 'reversed';
    reversedOn?: string;
}

export interface LeaveInput {
    policy: LeavePolicy;
    today: string;
    dateOfJoin: string;
    exitDate?: string | null;
    /** Last year's closing balance per type (what's carried, up to the limit). */
    opening?: Partial<Record<LeaveType, number>>;
    /** Approved leave. */
    taken: TakenLeave[];
    late: LateEvent[];
    /** Days deducted per late check-in (0 = off). */
    lateDays: number;
}

interface Scheduled {
    date: string;
    kind: LedgerEntry['kind'];
    amount: number;
    text: string;
}

const LAPSE_TEXT = (n: number, limit: number) =>
    `${fmtDays(n)} unused ${dayWord(n)} lapsed (${limit ? `carry-forward limit ${fmtDays(limit)}` : 'no carry forward'})`;

/** Every credit of the year for one type (future ones included), in date order. */
const creditsOf = (input: LeaveInput, type: LeaveType, year: { start: string; end: string }): { credits: Scheduled[]; entitlement: number } => {
    const tp = input.policy.types[type];
    const counted = countedMonths(year.start, input.dateOfJoin, input.exitDate);
    const entitlement = entitlementOf(tp.daysPerYear, counted.length);
    const monthly = tp.daysPerYear / 12;
    const probationEnd = input.policy.probationMonths > 0 ? addMonthsTo(input.dateOfJoin, input.policy.probationMonths) : null;
    const creditDate = (m: { start: string }) => (input.dateOfJoin > m.start ? input.dateOfJoin : m.start);
    const credits: Scheduled[] = [];
    const inProbation = (d: string) => Boolean(probationEnd && d < probationEnd);
    const probationTouchesYear = Boolean(probationEnd && probationEnd > year.start);

    if (probationTouchesYear) {
        counted.filter(m => inProbation(creditDate(m))).forEach(m =>
            credits.push({ date: creditDate(m), kind: 'PROBATION_MONTHLY', amount: monthly, text: 'Monthly credit during probation' })
        );
        if (probationEnd! <= year.end && (!input.exitDate || probationEnd! <= input.exitDate)) {
            const rest = entitlement - credits.reduce((s, c) => s + c.amount, 0);
            if (rest > 0) credits.push({ date: probationEnd!, kind: 'PROBATION_REST', amount: rest, text: 'Rest of the year, credited when probation ended' });
        }
        return { credits, entitlement };
    }
    if (tp.credit === 'MONTHLY') {
        counted.forEach(m => credits.push({ date: creditDate(m), kind: 'MONTHLY', amount: monthly, text: 'Monthly credit' }));
        return { credits, entitlement };
    }
    if (entitlement > 0) {
        const joinedThisYear = input.dateOfJoin > year.start;
        const leavesThisYear = Boolean(input.exitDate && input.exitDate <= year.end);
        let kind: LedgerEntry['kind'] = 'YEARLY';
        let text = 'Yearly credit';
        if (joinedThisYear) [kind, text] = ['PRORATED_JOIN', 'Pro-rated for the months left after joining'];
        else if (leavesThisYear) [kind, text] = ['PRORATED_EXIT', 'Pro-rated to your last day'];
        credits.push({ date: joinedThisYear ? input.dateOfJoin : year.start, kind, amount: entitlement, text });
    }
    return { credits, entitlement };
};

const takenText = (t: TakenLeave) => {
    if (t.half) return 'Half-day leave taken';
    return t.end > t.start ? `Leave taken (to ${dayMonth(t.end)})` : 'Leave taken';
};

export interface LeaveComputation {
    year: { start: string; end: string };
    probationUntil: string | null;
    balances: Omit<LeaveBalance, 'label'>[];
    lateDeductions: LateDeduction[];
    lossOfPayDays: number;
    settlement: LeaveSettlement[] | null;
}

/**
 * The year's ledger per type, as of `today`. Credits count once their date has come; carried-forward days at the
 * start of the year (only for someone who joined before it); approved leave counts from the moment it's approved
 * (future leave included); late deductions are taken in date order from Annual, then Casual, then loss of pay —
 * still deducted while a correction is pending, and reversed (same amounts) once one is approved.
 */
export const computeLeave = (input: LeaveInput): LeaveComputation => {
    const year = leaveYearOf(input.today, input.policy, input.dateOfJoin);
    const probationEnd = input.policy.probationMonths > 0 ? addMonthsTo(input.dateOfJoin, input.policy.probationMonths) : null;
    const entries: Record<LeaveType, (LedgerEntry & { order: number })[]> = { ANNUAL: [], CASUAL: [], SICK: [] };
    const scheduled: Record<LeaveType, Scheduled[]> = { ANNUAL: [], CASUAL: [], SICK: [] };
    const entitlement: Record<LeaveType, number> = { ANNUAL: 0, CASUAL: 0, SICK: 0 };
    const carried: Record<LeaveType, number> = { ANNUAL: 0, CASUAL: 0, SICK: 0 };
    let order = 0;
    const push = (type: LeaveType, e: LedgerEntry) => {
        order += 1;
        entries[type].push({ ...e, order });
    };

    LEAVE_TYPES.forEach(type => {
        const tp = input.policy.types[type];
        if (input.dateOfJoin < year.start) {
            const opening = Math.max(0, input.opening?.[type] ?? 0);
            carried[type] = Math.min(opening, tp.carryForward);
            if (carried[type] > 0) push(type, { date: year.start, kind: 'CARRIED', amount: carried[type], text: 'Carried forward from last year' });
            const lapsed = opening - carried[type];
            if (lapsed > 0) push(type, { date: year.start, kind: 'LAPSED', amount: null, text: LAPSE_TEXT(lapsed, tp.carryForward) });
        }
        const c = creditsOf(input, type, year);
        entitlement[type] = c.entitlement;
        scheduled[type] = c.credits;
        c.credits.filter(x => x.date <= input.today).forEach(x => push(type, x));
        input.taken
            .filter(t => t.type === type && t.start >= year.start && t.start <= year.end)
            .forEach(t => push(type, { date: t.start, kind: 'TAKEN', amount: -t.days, text: takenText(t) }));
    });

    // Late deductions, in date order, against the balance on that day.
    const balanceOn = (type: LeaveType, date: string) =>
        entries[type].filter(e => e.amount !== null && e.date <= date && e.kind !== 'LATE_REVERSED').reduce((s, e) => s + (e.amount ?? 0), 0);
    let lossOfPay = 0;
    const lateDeductions: LateDeduction[] = [];
    if (input.lateDays > 0) {
        [...input.late]
            .filter(l => l.date >= year.start && l.date <= input.today && l.date >= input.dateOfJoin)
            .sort((a, b) => a.date.localeCompare(b.date))
            .forEach(l => {
                let left = input.lateDays;
                const from: LateDeduction['from'] = [];
                (['ANNUAL', 'CASUAL'] as LeaveType[]).forEach(type => {
                    if (left <= 0) return;
                    const take = Math.min(left, Math.max(0, balanceOn(type, l.date)));
                    if (take <= 0) return;
                    from.push({ type, days: take });
                    push(type, { date: l.date, kind: 'LATE', amount: -take, text: `Late check-in deduction${l.state === 'pending' ? ' (correction pending)' : ''}` });
                    left -= take;
                });
                if (left > 0) {
                    from.push({ type: 'LOP', days: left });
                    if (l.state !== 'reversed') lossOfPay += left;
                }
                if (l.state === 'reversed') {
                    const on = l.reversedOn ?? l.date;
                    from.filter(f => f.type !== 'LOP').forEach(f =>
                        push(f.type as LeaveType, { date: on, kind: 'LATE_REVERSED', amount: f.days, text: 'Late check-in deduction reversed (correction approved)' })
                    );
                }
                lateDeductions.push({ date: l.date, lateMinutes: l.lateMinutes, days: input.lateDays, from, state: l.state, ...(l.reversedOn ? { reversedOn: l.reversedOn } : {}) });
            });
    }

    const balances = LEAVE_TYPES.map(type => {
        const list = entries[type];
        const sum = (kinds: LedgerEntry['kind'][]) => list.filter(e => kinds.includes(e.kind)).reduce((s, e) => s + (e.amount ?? 0), 0);
        const creditKinds: LedgerEntry['kind'][] = ['CARRIED', 'MONTHLY', 'PROBATION_MONTHLY', 'PROBATION_REST', 'PRORATED_JOIN', 'PRORATED_EXIT', 'YEARLY'];
        const next = scheduled[type].find(x => x.date > input.today);
        return {
            type,
            available: list.reduce((s, e) => s + (e.amount ?? 0), 0),
            creditedSoFar: sum(creditKinds),
            totalThisYear: entitlement[type] + carried[type],
            carried: carried[type],
            // (+ 0 turns -0 into 0)
            taken: -sum(['TAKEN']) + 0,
            late: -(sum(['LATE']) + sum(['LATE_REVERSED'])) + 0,
            next: next ? { date: next.date, amount: next.amount } : null,
            ledger: [...list].sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order).map(({ order: _o, ...e }) => e),
        };
    });

    const settlement =
        input.exitDate && input.exitDate >= year.start && input.exitDate <= year.end
            ? LEAVE_TYPES.map(type => {
                  const b = balances.find(x => x.type === type)!;
                  const final = entitlement[type] + carried[type] - b.taken - b.late;
                  const tp = input.policy.types[type];
                  return { type, encash: tp.encashOnExit && final > 0 ? final : 0, recover: final < 0 ? -final : 0 };
              })
            : null;

    return {
        year,
        probationUntil: probationEnd && probationEnd > input.today ? probationEnd : null,
        balances,
        lateDeductions,
        lossOfPayDays: lossOfPay,
        settlement,
    };
};

// ---- leave requests ---------------------------------------------------------------------------------------

export const LEAVE_MESSAGES = {
    endBeforeStart: 'The end date is before the start date.',
    noWorkingDays: 'Those dates are all weekly offs or holidays.',
    overlap: (summary: string) => `You already have leave on these dates (${summary}).`,
    balance: (n: number, type: LeaveType) =>
        `You have ${fmtDays(n)} ${dayWord(n)} of ${LEAVE_LABEL[type]} leave available right now. Apply for fewer days or pick another leave type.`,
    proof: 'Sick leave of more than 3 days needs a medical certificate or proof.',
    reason: 'Add a short reason.',
    date: 'Pick a valid date.',
    type: 'Pick a leave type.',
} as const;

/** Working days of a request: weekly offs and holidays aren't counted; a half day is 0.5. */
export const leaveDays = (start: string, end: string, half: LeaveHalf | null, isWorkingDay: (d: string) => boolean) => {
    if (half) return isWorkingDay(start) ? 0.5 : 0;
    let n = 0;
    for (let d = start; d <= end; d = addDays(d, 1)) if (isWorkingDay(d)) n += 1;
    return n;
};

export interface ExistingLeave {
    start: string;
    end: string;
    half: LeaveHalf | null;
    summary: string;
}

/** Two leaves clash on a day unless both are opposite halves of it. */
const clashes = (a: { start: string; end: string; half: LeaveHalf | null }, b: { start: string; end: string; half: LeaveHalf | null }) =>
    a.start <= b.end && b.start <= a.end && !(a.half && b.half && a.start === b.start && a.half !== b.half);

/**
 * Checks a leave request, in this order: dates · working days · overlap with pending or approved leave · balance
 * (available minus pending requests of the same type) · proof for sick leave over 3 days · reason. Returns the
 * normalised request with its working-day count.
 */
export const validateLeaveRequest = (
    input: { type?: LeaveType; start?: string; end?: string; half?: LeaveHalf | null; reason?: string; proof?: { name: string } | null },
    ctx: { isWorkingDay: (d: string) => boolean; existing: ExistingLeave[]; available: Record<LeaveType, number> }
) => {
    if (!input.type || !LEAVE_TYPES.includes(input.type)) throw new RuleError(LEAVE_MESSAGES.type, 400);
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!iso.test(input.start ?? '')) throw new RuleError(LEAVE_MESSAGES.date, 400);
    const half = input.half === 'FIRST' || input.half === 'SECOND' ? input.half : null;
    const start = input.start!;
    const end = half ? start : input.end || start;
    if (!iso.test(end)) throw new RuleError(LEAVE_MESSAGES.date, 400);
    if (end < start) throw new RuleError(LEAVE_MESSAGES.endBeforeStart, 400);
    const days = leaveDays(start, end, half, ctx.isWorkingDay);
    if (days <= 0) throw new RuleError(LEAVE_MESSAGES.noWorkingDays, 400);
    const clash = ctx.existing.find(x => clashes(x, { start, end, half }));
    if (clash) throw new RuleError(LEAVE_MESSAGES.overlap(clash.summary), 409);
    const available = ctx.available[input.type];
    if (days > available + 1e-9) throw new RuleError(LEAVE_MESSAGES.balance(Math.max(0, available), input.type), 409);
    if (input.type === 'SICK' && days > SICK_PROOF_AFTER_DAYS && !input.proof?.name) throw new RuleError(LEAVE_MESSAGES.proof, 400);
    const reason = input.reason?.trim() ?? '';
    if (!reason) throw new RuleError(LEAVE_MESSAGES.reason, 400);
    return { type: input.type, start, end, half, days, reason, ...(input.proof?.name ? { proof: { name: input.proof.name } } : {}) };
};

// ---- leave on the attendance day -------------------------------------------------------------------------------

/**
 * A half-day leave moves the working day: first half off → the day (and the late mark) starts at mid-shift;
 * second half off → it ends at mid-shift. Returns the shift's start / end for that day ("HH:mm").
 */
export const shiftWithHalfLeave = (shift: { start: string; end: string }, half: LeaveHalf | null) => {
    if (!half) return shift;
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const mid = toMin(shift.start) + Math.round((toMin(shift.end) - toMin(shift.start)) / 2);
    const hhmm = `${pad(Math.floor(mid / 60))}:${pad(mid % 60)}`;
    return half === 'FIRST' ? { start: hhmm, end: shift.end } : { start: shift.start, end: hhmm };
};

/** "Half-day leave (first half)" */
export const halfLeaveLabel = (half: LeaveHalf) => `Half-day leave (${half === 'FIRST' ? 'first' : 'second'} half)`;

// ---- late check-in deductions: wording (PROTOTYPE-SETUP: Final batch, Slice 5) ------------------------------

type DeductionLike = Pick<LateDeduction, 'days' | 'from' | 'state'>;


const onlyLossOfPay = (d: DeductionLike) => d.from.every(f => f.type === 'LOP');
/** The leave type it came from first (Annual, then Casual). */
const firstType = (d: DeductionLike) => d.from.find(f => f.type !== 'LOP')?.type as LeaveType | undefined;

/** "Half a day" / "1 day" / "1.5 days" */
export const daysAmount = (n: number) => {
    if (n === 0.5) return 'Half a day';
    return `${fmtDays(n)} ${dayWord(n)}`;
};

/** The Today card: "Late by 25m. Half a day of Annual leave has been deducted. If you weren’t late, …" */
export const lateTodayNote = (d: DeductionLike, lateText: string) => {
    const what = onlyLossOfPay(d)
        ? `${daysAmount(d.days)} is marked as loss of pay (no leave left).`
        : `${daysAmount(d.days)} of ${LEAVE_LABEL[firstType(d)!]} leave has been deducted.`;
    const next =
        d.state === 'pending'
            ? 'Your correction is with your manager. It’s reversed automatically if approved.'
            : 'If you weren’t late, request a correction. It’s reversed automatically once approved.';
    return `Late by ${lateText}. ${what} ${next}`;
};

/** Day details: "0.5 day · Annual leave" / "0.5 day · Loss of pay" (+ pending / reversed). */
export const lateDayDetail = (d: DeductionLike) => {
    const amount = `${fmtDays(d.days)} ${dayWord(d.days)}`;
    if (d.state === 'reversed') return `${amount} · reversed (correction approved)`;
    const where = onlyLossOfPay(d) ? 'Loss of pay' : `${LEAVE_LABEL[firstType(d)!]} leave`;
    return `${amount} · ${where}${d.state === 'pending' ? ' (reversed if your pending correction is approved)' : ''}`;
};

/** Overview notification: "Late on Fri 23 Oct · −0.5 day" / "Deducted from Annual leave. If you weren’t late, …" */
export const lateNotification = (d: DeductionLike & { date: string }, dayText: string) => ({
    title: `Late on ${dayText} · −${fmtDays(d.days)} ${dayWord(d.days)}`,
    text: `${onlyLossOfPay(d) ? 'No leave left, so it’s loss of pay.' : `Deducted from ${LEAVE_LABEL[firstType(d)!]} leave.`} If you weren’t late, request a correction.`,
});

/** Leave page: "−0.5 · Annual" / "−0.5 · Loss of pay" (+ " · correction pending") or "+0.5 · reversed". */
export const lateLedgerText = (d: DeductionLike) => {
    if (d.state === 'reversed') return `+${fmtDays(d.days)} · reversed`;
    const where = d.from.map(f => (f.type === 'LOP' ? 'Loss of pay' : LEAVE_LABEL[f.type])).join(' + ');
    return `−${fmtDays(d.days)} · ${where}${d.state === 'pending' ? ' · correction pending' : ''}`;
};

/** "0.5 day is deducted automatically for every check-in after the grace period, Annual leave first. …" */
export const lateDeductionIntro = (days: number) =>
    `${fmtDays(days)} ${dayWord(days)} ${days <= 1 ? 'is' : 'are'} deducted automatically for every check-in after the grace period, Annual leave first. If a correction is approved, it’s reversed automatically.`;
