// PROTOTYPE-SETUP (Leave module): the leave rules, in one pure module. No store, no React, no "now" unless passed in.
// Screens and the mock layer call these; nothing re-derives them. Contract: docs/api/leave.md. Tests: ./__tests__/leave.test.ts.
//
//   leave year ........ company cycle (HR's start date) or each employee's joining date (29 Feb → 28 Feb)
//   credits ........... at the start of the leave cycle (the year's days at once) · monthly (days ÷ 12 on the 1st, not
//                       rounded) · daily (days × days elapsed ÷ days in the cycle)
//   pro-rata .......... a month counts if they join on or before the 15th, or leave on or after the 15th
//   probation ......... a status, not a length: while Probation each type follows its rule (credited monthly / full
//                       entitlement / not available); from the day HR marks them Active the normal rule applies and
//                       start-of-cycle types credit the rest of the year then
//   carry forward ..... min(last cycle's unused, the type's limit), the rest lapses — rolled forward automatically on
//                       the last working day of the cycle
//   exit .............. entitlement pro-rated to the last day; unused days of encashable types encashed, days taken
//                       beyond what was earned recovered
//   available ......... credited − approved − late deductions − leave in request
//   day count ......... the employee's own working days; half days 0.5 per working day of a range; the sandwich rule
//   comp off .......... half a shift or more = 0.5 day, a full shift = 1; expires N days after the day worked, oldest
//                       credit used first
//   cancellation ...... whole, or from today if it has started
//   late deduction .... each late mark from the first type in the order with enough left, else loss of pay; reversed
//                       when a dispute (correction) is approved
//   routing ........... the approval chain is rules/attendance.ts (startTrail / decide / resubmitTrail); leave
//                       cancellations and comp off use the leave approvers (routeTypeOf)
import type {
    ApprovalType,
    CompOffCheck,
    LateDeduction,
    LeaveAppliesTo,
    LeaveCredit,
    LeaveHalf,
    LeavePolicy,
    LeaveProbationRule,
    LeaveTypeConfig,
    LedgerEntry,
    Level1Approver,
    Level2Approver,
    SandwichRule,
    Weekday,
} from '@src/domains/attendanceTimesheet/types';

import { RuleError, addDays, approverPersonId, weekdayOf } from './attendance';

// ---- defaults --------------------------------------------------------------------------------------------------

export const COMP_OFF = 'COMP_OFF';
export const COMP_OFF_NAME = 'Comp off';

/**
 * The default leave types. Annual / Casual / Sick are the live policy the ESS balances already used (Final batch);
 * Maternity and Paternity come from the original Payroll leave policies (the legacy leave components), so nothing
 * from either list is lost. Every type is paid.
 */
export const DEFAULT_LEAVE_TYPES: LeaveTypeConfig[] = [
    { id: 'ANNUAL', name: 'Annual', daysPerYear: 12, credit: 'MONTHLY', probation: 'MONTHLY', carryForward: 30, encashOnExit: true, proofAfterDays: null, appliesTo: 'ALL', active: true },
    { id: 'CASUAL', name: 'Casual', daysPerYear: 8, credit: 'CYCLE_START', probation: 'MONTHLY', carryForward: 0, encashOnExit: false, proofAfterDays: null, appliesTo: 'ALL', active: true },
    { id: 'SICK', name: 'Sick', daysPerYear: 6, credit: 'CYCLE_START', probation: 'FULL', carryForward: 0, encashOnExit: false, proofAfterDays: 3, appliesTo: 'ALL', active: true },
    { id: 'MATERNITY', name: 'Maternity', daysPerYear: 182, credit: 'CYCLE_START', probation: 'NONE', carryForward: 0, encashOnExit: false, proofAfterDays: 0, appliesTo: 'FEMALE', active: true },
    { id: 'PATERNITY', name: 'Paternity', daysPerYear: 5, credit: 'CYCLE_START', probation: 'NONE', carryForward: 0, encashOnExit: false, proofAfterDays: null, appliesTo: 'MALE', active: true },
];

export const DEFAULT_POLICY: LeavePolicy = {
    year: 'COMPANY',
    cycleStart: '04-01',
    types: DEFAULT_LEAVE_TYPES,
    sandwich: 'OFF',
    compOff: { enabled: true, expiryDays: 60 },
    lateOrder: ['ANNUAL', 'CASUAL'],
};

export const DEFAULT_LATE_DAYS = 0.5;

// ---- the previous policy shape (Final batch) → this one -------------------------------------------------------

/** The leave policy as it was stored before the Leave module (three fixed types, a probation length). */
export interface LegacyLeavePolicy {
    year: 'COMPANY' | 'JOINING';
    cycleStart: string;
    probationMonths?: number;
    types: Record<string, { daysPerYear: number; credit: 'UPFRONT' | 'MONTHLY'; carryForward: number; encashOnExit: boolean }>;
}

const isLegacy = (p: unknown): p is LegacyLeavePolicy => Boolean(p && typeof p === 'object' && !Array.isArray((p as LeavePolicy).types));

/**
 * Maps a stored policy to the current shape without losing anything: each old type keeps its days, credit
 * (UPFRONT → at the start of the leave cycle), carry forward and encashment; the old sick-leave proof threshold
 * becomes Sick's supporting-document rule; types the old policy didn't have (Maternity, Paternity) are added from the
 * defaults. The probation length is dropped: probation is a status now.
 */
export const migrateLeavePolicy = (stored: unknown, legacyProofDays?: number): LeavePolicy => {
    if (!stored) return DEFAULT_POLICY;
    if (!isLegacy(stored)) {
        const p = stored as Partial<LeavePolicy>;
        return {
            ...DEFAULT_POLICY,
            ...p,
            types: (p.types ?? DEFAULT_POLICY.types).map(t => ({ ...t })),
            compOff: { ...DEFAULT_POLICY.compOff, ...p.compOff },
            lateOrder: p.lateOrder ?? DEFAULT_POLICY.lateOrder,
        };
    }
    const old = stored;
    const types = DEFAULT_LEAVE_TYPES.map(d => {
        const o = old.types[d.id];
        if (!o) return { ...d };
        return {
            ...d,
            daysPerYear: o.daysPerYear,
            credit: (o.credit === 'UPFRONT' ? 'CYCLE_START' : 'MONTHLY') as LeaveCredit,
            carryForward: o.carryForward,
            encashOnExit: o.encashOnExit,
            ...(d.id === 'SICK' && legacyProofDays !== undefined ? { proofAfterDays: legacyProofDays } : {}),
        };
    });
    return { ...DEFAULT_POLICY, year: old.year, cycleStart: old.cycleStart, types };
};

// ---- labels ---------------------------------------------------------------------------------------------------

/** 1.0833 → "1.08", 2 → "2", 0.5 → "0.5" */
export const fmtDays = (n: number) => String(Math.round(n * 100) / 100);
/** "day" for 1 or less, else "days". */
export const dayWord = (n: number) => `day${Math.abs(n) <= 1 ? '' : 's'}`;
/** "2 days" / "0.5 day" */
export const daysText = (n: number) => `${fmtDays(n)} ${dayWord(n)}`;
/** "Half a day" / "1 day" / "1.5 days" */
export const daysAmount = (n: number) => (n === 0.5 ? 'Half a day' : daysText(n));
const r2 = (n: number) => Math.round(n * 100) / 100;

/** "Annual leave", "Bereavement leave", "Comp off" — a name that already says leave (or Comp off) is kept. */
export const typeLabel = (name: string) => (/leave$/i.test(name.trim()) || name === COMP_OFF_NAME ? name : `${name} leave`);

export const CREDIT_LABEL: Record<LeaveCredit, string> = { CYCLE_START: 'At the start of the leave cycle', MONTHLY: 'Monthly', DAILY: 'Daily' };
export const PROBATION_LABEL: Record<LeaveProbationRule, string> = {
    MONTHLY: 'Credited monthly',
    FULL: 'Full entitlement straight away',
    NONE: 'Not available until confirmed',
};
export const APPLIES_LABEL: Record<LeaveAppliesTo, string> = { ALL: 'All employees', FEMALE: 'Female employees', MALE: 'Male employees' };
export const SANDWICH_LABEL: Record<SandwichRule, string> = { OFF: 'Off', WEEKLY_OFFS: 'Weekly offs count', WEEKLY_OFFS_AND_HOLIDAYS: 'Weekly offs and holidays count' };

/** "All 8 days at once" / "1 day a month" / "≈ 0.67 a month, accrued daily" */
export const accrualText = (t: Pick<LeaveTypeConfig, 'credit' | 'daysPerYear'>) => {
    const m = t.daysPerYear / 12;
    if (t.credit === 'CYCLE_START') return `All ${fmtDays(t.daysPerYear)} days at once`;
    if (t.credit === 'MONTHLY') return `${fmtDays(m)} ${dayWord(m)} a month`;
    return `≈ ${fmtDays(m)} a month, accrued daily`;
};
/** "Yes, up to 30 days" / "No" */
export const carryText = (t: Pick<LeaveTypeConfig, 'carryForward'>) => (t.carryForward ? `Yes, up to ${daysText(t.carryForward)}` : 'No');
/** "Never" / "Always" / "When longer than 3 days" */
export const proofText = (t: Pick<LeaveTypeConfig, 'proofAfterDays'>) => {
    if (t.proofAfterDays === null || t.proofAfterDays === undefined) return 'Never';
    return t.proofAfterDays === 0 ? 'Always' : `When longer than ${daysText(t.proofAfterDays)}`;
};

// ---- dates ----------------------------------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');
const parts = (iso: string) => iso.split('-').map(Number) as [number, number, number];
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();
const dayOf = (iso: string) => Number(iso.slice(8, 10));
const maxIso = (...d: string[]) => d.reduce((a, b) => (b > a ? b : a));
const minIso = (...d: string[]) => d.reduce((a, b) => (b < a ? b : a));

/** Days from a to b (b − a). */
export const daysFrom = (a: string, b: string) => {
    const [y1, m1, d1] = parts(a);
    const [y2, m2, d2] = parts(b);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};

/** The same day n months later (clamped to the month's last day): 2026-08-31 + 1 → 2026-09-30. */
export const addMonthsTo = (iso: string, n: number) => {
    const [y, m, d] = parts(iso);
    const t = new Date(y, m - 1 + n, 1);
    const day = Math.min(d, daysInMonth(t.getFullYear(), t.getMonth() + 1));
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(day)}`;
};

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "1 Nov" */
export const dayMonth = (iso: string) => `${dayOf(iso)} ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]}`;
/** "Tue 13 Oct" */
export const shortDate = (iso: string) => {
    const [y, m, d] = parts(iso);
    return `${DAYS_SHORT[new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS_SHORT[m - 1]}`;
};
/** "November 2026" */
export const monthName = (iso: string) => `${MONTHS_LONG[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

// ---- leave year -----------------------------------------------------------------------------------------------

/** The leave year containing `asOf`: from the company cycle start, or from the joining anniversary. */
export const leaveYearOf = (asOf: string, policy: Pick<LeavePolicy, 'year' | 'cycleStart'>, dateOfJoin: string) => {
    const anniversary = dateOfJoin.slice(5) === '02-29' ? '02-28' : dateOfJoin.slice(5);
    const mmdd = policy.year === 'COMPANY' ? policy.cycleStart : anniversary;
    const y = Number(asOf.slice(0, 4));
    const start = `${y}-${mmdd}` <= asOf ? `${y}-${mmdd}` : `${y - 1}-${mmdd}`;
    return { start, end: addDays(addMonthsTo(start, 12), -1) };
};

/** The day the maths is done for: today, or the last day for someone who has left. */
export const asOfDate = (today: string, exitDate: string | null | undefined) => (exitDate && exitDate < today ? exitDate : today);

/** The year's 12 months: [start, end] of each. */
export const yearMonths = (yearStart: string) =>
    Array.from({ length: 12 }, (_, i) => ({ start: addMonthsTo(yearStart, i), end: addDays(addMonthsTo(yearStart, i + 1), -1) }));

/**
 * Pro-rata: does a month count? Joining: if they joined on or before the 15th (of a month they joined in). Exit: if
 * they leave on or after the 15th. Months fully before joining or after leaving don't.
 */
export const monthCounts = (m: { start: string; end: string }, dateOfJoin: string, exitDate?: string | null) => {
    if (dateOfJoin > m.end) return false;
    if (dateOfJoin > m.start && dayOf(dateOfJoin) > 15) return false;
    if (exitDate) {
        if (exitDate < m.start) return false;
        if (exitDate <= m.end && dayOf(exitDate) < 15) return false;
    }
    return true;
};

export const countedMonths = (yearStart: string, dateOfJoin: string, exitDate?: string | null) =>
    yearMonths(yearStart).filter(m => monthCounts(m, dateOfJoin, exitDate));

/** The last working day of a leave cycle: when balances roll forward (carry forward and lapse) automatically. */
export const rollForwardDay = (cycleEnd: string, isWorkingDay: (d: string) => boolean) => {
    for (let d = cycleEnd, i = 0; i < 31; d = addDays(d, -1), i += 1) if (isWorkingDay(d)) return d;
    return cycleEnd;
};

/** At a cycle's start: what was unused carries forward up to the limit; the rest lapses. */
export const carryForward = (unused: number, limit: number) => {
    const u = Math.max(0, unused);
    const carried = Math.min(u, Math.max(0, limit));
    return { carried, lapsed: r2(u - carried) };
};

// ---- who a type applies to ------------------------------------------------------------------------------------

export const appliesTo = (t: Pick<LeaveTypeConfig, 'appliesTo'>, gender: 'Male' | 'Female') =>
    t.appliesTo === 'ALL' || (t.appliesTo === 'FEMALE' && gender === 'Female') || (t.appliesTo === 'MALE' && gender === 'Male');

/** The types someone can see and apply for: active, and for their gender if the type is limited. */
export const typesForEmployee = (policy: Pick<LeavePolicy, 'types'>, gender: 'Male' | 'Female') => policy.types.filter(t => t.active && appliesTo(t, gender));

/** A new type's id from its name: "Bereavement leave" → "LT-BEREAVEMENT-LEAVE" (unique among the existing ids). */
export const newTypeId = (name: string, existing: string[]) => {
    const base = `LT-${name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'TYPE'}`;
    let id = base;
    for (let i = 2; existing.includes(id); i += 1) id = `${base}-${i}`;
    return id;
};

// ---- credits --------------------------------------------------------------------------------------------------

export interface EmploymentFacts {
    dateOfJoin: string;
    exitDate?: string | null;
    status: 'PROBATION' | 'ACTIVE';
    /** The day HR marked them Active (null if they were never on probation). */
    confirmedOn?: string | null;
}

export interface Credit {
    date: string;
    kind: LedgerEntry['kind'];
    amount: number;
    text: string;
}

/**
 * Every credit of the year for one type (future ones included), in date order, and the year's entitlement.
 * While on probation: "credited monthly" types get days ÷ 12 per counted month (the rest of the year when they're
 * confirmed, for start-of-cycle types); "full" types ignore probation; "not available" types get nothing until
 * confirmed, then the months from confirmation (a month counts if confirmed on or before the 15th).
 */
export const creditSchedule = (type: Pick<LeaveTypeConfig, 'daysPerYear' | 'credit' | 'probation'>, year: { start: string; end: string }, facts: EmploymentFacts) => {
    const { dateOfJoin: doj } = facts;
    const exit = facts.exitDate ?? null;
    // Probation lasts until HR marks the employee Active.
    const probEnd = facts.status === 'PROBATION' ? '9999-12-31' : facts.confirmedOn ?? null;
    const rule = type.probation;
    const inProb = (m: { start: string }) => rule !== 'FULL' && Boolean(probEnd) && probEnd! > addDays(m.start, 14);
    const all = countedMonths(year.start, doj, exit);
    const months = rule === 'NONE' ? all.filter(m => !inProb(m)) : all;
    const monthly = type.daysPerYear / 12;
    const cycleDays = daysFrom(year.start, year.end) + 1;
    const credits: Credit[] = [];

    if (type.credit === 'DAILY') {
        const amountOf = (m: { start: string; end: string }) => {
            const a0 = maxIso(doj, m.start);
            const a1 = exit && exit < m.end ? exit : m.end;
            return a1 >= a0 ? (type.daysPerYear * (daysFrom(a0, a1) + 1)) / cycleDays : 0;
        };
        months.forEach(m => {
            const amount = amountOf(m);
            if (amount > 0) credits.push({ date: m.end, kind: 'DAILY', amount, text: `Daily accrual, ${monthName(m.start)}` });
        });
        return { entitlement: credits.reduce((s, c) => s + c.amount, 0), credits, daily: { amountOf, months } };
    }

    const entitlement = monthly * months.length;
    let given = 0;
    months.forEach(m => {
        if (type.credit === 'MONTHLY' || inProb(m)) {
            credits.push({ date: maxIso(doj, m.start), kind: inProb(m) ? 'PROBATION_MONTHLY' : 'MONTHLY', amount: monthly, text: inProb(m) ? 'Monthly credit during probation' : 'Monthly credit' });
            given += monthly;
        }
    });
    if (type.credit === 'CYCLE_START' && (facts.status !== 'PROBATION' || rule === 'FULL') && entitlement - given > 0.0001) {
        const confirmedThisYear = Boolean(probEnd && probEnd > year.start && probEnd <= year.end && rule !== 'FULL');
        const date = maxIso(year.start, doj, confirmedThisYear ? probEnd! : year.start);
        let kind: Credit['kind'] = 'YEARLY';
        let text = 'Yearly credit';
        if (given > 0) [kind, text] = ['PROBATION_REST', 'Rest of the year, credited when probation ended'];
        else if (confirmedThisYear) [kind, text] = ['PROBATION_REST', 'Credited when probation ended (pro-rated from then)'];
        else if (doj > year.start) [kind, text] = ['PRORATED_JOIN', 'Pro-rated for the months left after joining'];
        else if (exit && exit <= year.end) [kind, text] = ['PRORATED_EXIT', 'Pro-rated to your last day'];
        credits.push({ date, kind, amount: entitlement - given, text });
    }
    credits.sort((a, b) => a.date.localeCompare(b.date));
    return { entitlement, credits, daily: null };
};

/** Credited up to and including `asOf` (daily types: the days elapsed in the current month too). */
export const creditedBy = (schedule: ReturnType<typeof creditSchedule>, type: Pick<LeaveTypeConfig, 'daysPerYear'>, asOf: string, year: { start: string; end: string }, doj: string) => {
    if (!schedule.daily) return schedule.credits.filter(c => c.date <= asOf).reduce((s, c) => s + c.amount, 0);
    const cycleDays = daysFrom(year.start, year.end) + 1;
    return schedule.daily.months.reduce((s, m) => {
        if (m.end <= asOf) return s + schedule.daily!.amountOf(m);
        if (m.start > asOf) return s;
        const a0 = maxIso(doj, m.start);
        return asOf >= a0 ? s + (type.daysPerYear * (daysFrom(a0, asOf) + 1)) / cycleDays : s;
    }, 0);
};

// ---- the balance ----------------------------------------------------------------------------------------------

/** Available = credited so far − approved leave − late deductions − leave still in request. 10 − 4 − 0 − 2 = 4. */
export const availableBalance = (b: { credited: number; approved: number; late: number; inRequest: number }) => r2(b.credited - b.approved - b.late - b.inRequest);

/** Exit: unused days of an encashable type are encashed; days taken beyond what was earned are recovered. */
export const exitSettlement = (b: { earned: number; approved: number; late: number }, encashOnExit: boolean) => {
    const left = r2(b.earned - b.approved - b.late);
    return { encash: left > 0 && encashOnExit ? left : 0, recover: left < 0 ? -left : 0 };
};

// ---- counting leave days ----------------------------------------------------------------------------------------

/** One employee's calendar: their own weekly offs and the company's public holidays. */
export interface WorkCalendar {
    weeklyOff: Weekday[];
    isHoliday: (date: string) => boolean;
}

export const isWeeklyOffFor = (cal: Pick<WorkCalendar, 'weeklyOff'>, date: string) => cal.weeklyOff.includes(weekdayOf(date));
export const isWorkingDayFor = (cal: WorkCalendar, date: string) => !isWeeklyOffFor(cal, date) && !cal.isHoliday(date);

/**
 * Leave days in a range. Only the employee's working days count (weekly offs and public holidays don't). Half days:
 * 0.5 for every working day in the range. Sandwich rule (full days only): days off strictly between the first and the
 * last working day of the request count too — weekly offs (and, with "weekly offs and holidays", public holidays on
 * working weekdays); never days off at the edges.
 */
export const countLeaveDays = (start: string, end: string, half: LeaveHalf | null, cal: WorkCalendar, sandwich: SandwichRule = 'OFF') => {
    const all: string[] = [];
    if (start && end && end >= start) for (let d = start; d <= end; d = addDays(d, 1)) all.push(d);
    const work = all.filter(d => isWorkingDayFor(cal, d));
    if (half) return { working: work.length, sandwich: 0, days: work.length * 0.5, workDates: work };
    let sand = 0;
    if (sandwich !== 'OFF' && work.length >= 2) {
        const first = work[0];
        const last = work[work.length - 1];
        all.forEach(d => {
            if (d <= first || d >= last || isWorkingDayFor(cal, d)) return;
            if (isWeeklyOffFor(cal, d) || sandwich === 'WEEKLY_OFFS_AND_HOLIDAYS') sand += 1;
        });
    }
    return { working: work.length, sandwich: sand, days: work.length + sand, workDates: work };
};

/** "3 working days (weekly offs and public holidays aren’t counted)." / "4 days: 2 working days + 2 days off in between (sandwich rule)." */
export const durationText = (c: { working: number; sandwich: number; days: number }, half: LeaveHalf | null) => {
    if (!c.working) return '';
    if (half) return `${c.working} half day${c.working === 1 ? '' : 's'} = ${daysText(c.days)} of leave. ${half === 'FIRST' ? 'You start work at mid-shift each day.' : 'You finish at mid-shift each day.'}`;
    if (c.sandwich) return `${fmtDays(c.days)} days: ${c.working} working day${c.working === 1 ? '' : 's'} + ${c.sandwich} day${c.sandwich === 1 ? '' : 's'} off in between (sandwich rule).`;
    return `${c.working} working day${c.working === 1 ? '' : 's'} (weekly offs and public holidays aren’t counted).`;
};

// ---- applying -------------------------------------------------------------------------------------------------

export interface ExistingLeave {
    start: string;
    end: string;
    half: LeaveHalf | null;
    summary: string;
}

/**
 * Two requests clash on a day both cover, unless both are half days of opposite halves (first half of one, second
 * half of the other, each day).
 */
export const leavesClash = (a: Omit<ExistingLeave, 'summary'>, b: Omit<ExistingLeave, 'summary'>) =>
    a.start <= b.end && b.start <= a.end && !(a.half && b.half && a.half !== b.half);

/** Does a type need a supporting document for this many days? (null = never, 0 = always). */
export const needsProof = (t: Pick<LeaveTypeConfig, 'proofAfterDays'>, days: number) =>
    t.proofAfterDays !== null && t.proofAfterDays !== undefined && days > 0 && (t.proofAfterDays === 0 || days > t.proofAfterDays);

export const LEAVE_MESSAGES = {
    type: 'Pick a leave type.',
    date: 'Pick a valid date.',
    endBeforeStart: 'The end date is before the start date.',
    noWorkingDays: 'Those dates are all weekly offs or holidays.',
    halfOff: 'Half-day leave is turned off. Apply for full days.',
    overlap: (summary: string, who?: string) => `${who ? `${who} already has` : 'You already have'} leave on these dates (${summary}).`,
    probation: (label: string, who?: string) =>
        who ? `${label} isn’t available while ${who} is on probation.` : `${label} isn’t available during probation. You can use it once HR confirms you.`,
    balance: (available: number, label: string, pending: number, who?: string) =>
        who
            ? `${who} has ${daysText(Math.max(0, available))} of ${label} available.`
            : `You have ${daysText(Math.max(0, available))} of ${label} available${pending ? ` (${fmtDays(pending)} more already waiting for approval)` : ''}. Apply for fewer days or pick another leave type.`,
    proof: (label: string, after: number) => (after === 0 ? `${label} needs a supporting document.` : `${label} of more than ${daysText(after)} needs a supporting document.`),
    reason: 'Add a short reason.',
    note: 'Add a short note.',
} as const;

/**
 * Checks a leave request, in this order: type · dates · working days · overlap with leave that's approved, pending or
 * waiting for an update · not available during probation · balance (available, which already takes off leave in
 * request) · supporting document · reason. `who` words the messages for HR adding leave for someone.
 */
export const validateLeave = (
    input: { type?: string; start?: string; end?: string; half?: LeaveHalf | null; reason?: string; proof?: { name: string } | null },
    ctx: {
        types: LeaveTypeConfig[];
        cal: WorkCalendar;
        sandwich: SandwichRule;
        halfDayAllowed: boolean;
        existing: ExistingLeave[];
        /** Available per type (credited − approved − late − in request; the request itself left out when resubmitting). */
        available: Record<string, number>;
        pending: Record<string, number>;
        onProbation: boolean;
        who?: string;
        reasonMessage?: string;
    }
) => {
    const type = ctx.types.find(t => t.id === input.type);
    if (!type) throw new RuleError(LEAVE_MESSAGES.type, 400);
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!iso.test(input.start ?? '')) throw new RuleError(LEAVE_MESSAGES.date, 400);
    const start = input.start!;
    const end = input.end || start;
    if (!iso.test(end)) throw new RuleError(LEAVE_MESSAGES.date, 400);
    const half = input.half === 'FIRST' || input.half === 'SECOND' ? input.half : null;
    if (half && !ctx.halfDayAllowed) throw new RuleError(LEAVE_MESSAGES.halfOff, 400);
    if (end < start) throw new RuleError(LEAVE_MESSAGES.endBeforeStart, 400);
    const count = countLeaveDays(start, end, half, ctx.cal, ctx.sandwich);
    if (!count.working) throw new RuleError(LEAVE_MESSAGES.noWorkingDays, 400);
    const clash = ctx.existing.find(x => leavesClash(x, { start, end, half }));
    if (clash) throw new RuleError(LEAVE_MESSAGES.overlap(clash.summary, ctx.who), 409);
    const label = typeLabel(type.name);
    if (ctx.onProbation && type.probation === 'NONE' && type.id !== COMP_OFF) throw new RuleError(LEAVE_MESSAGES.probation(label, ctx.who), 409);
    const available = ctx.available[type.id] ?? 0;
    if (count.days > available + 1e-9) throw new RuleError(LEAVE_MESSAGES.balance(available, label, ctx.pending[type.id] ?? 0, ctx.who), 409);
    if (needsProof(type, count.days) && !input.proof?.name) throw new RuleError(LEAVE_MESSAGES.proof(label, type.proofAfterDays!), 400);
    const reason = input.reason?.trim() ?? '';
    if (!reason) throw new RuleError(ctx.reasonMessage ?? LEAVE_MESSAGES.reason, 400);
    return { type: type.id, start, end, half, days: count.days, reason, ...(input.proof?.name ? { proof: { name: input.proof.name } } : {}) };
};

// ---- cancelling approved leave ------------------------------------------------------------------------------------

/**
 * What cancelling approved leave covers: all of it before it starts; once it has started, only the days from today
 * (today included). Null once it's over.
 */
export const cancellationRange = (leave: { start: string; end: string }, today: string) => {
    if (leave.end < today) return null;
    const from = leave.start > today ? leave.start : today;
    return { from, to: leave.end, whole: from <= leave.start };
};

/** Approved leave after a cancellation from `from`: cancelled (whole) or ending the day before (re-counted). */
export const applyCancellation = <L extends { start: string; end: string; half: LeaveHalf | null; days: number }>(leave: L, from: string, recount: (start: string, end: string, half: LeaveHalf | null) => number) => {
    if (from <= leave.start) return { whole: true as const, leave };
    const end = addDays(from, -1);
    return { whole: false as const, leave: { ...leave, end, days: recount(leave.start, end, leave.half) } };
};

// ---- comp off ---------------------------------------------------------------------------------------------------

/** Half a shift or more = 0.5 day; a full shift = 1 day; less = nothing. */
export const compOffDays = (workedMinutes: number, shiftMinutes: number): 0 | 0.5 | 1 => {
    if (workedMinutes >= shiftMinutes) return 1;
    if (workedMinutes >= shiftMinutes / 2) return 0.5;
    return 0;
};

export const COMP_OFF_MESSAGES = {
    pick: 'Pick the day you worked.',
    future: 'Pick a day you’ve already worked.',
    workingDay: (day: string) => `${day} is a working day. Comp off is only for weekly offs and public holidays.`,
    tooOld: (days: number) => `Comp off has to be claimed within ${days} days.`,
    notWorked: (attendance: boolean) => `There’s no ${attendance ? 'check-in and check-out' : 'timesheet'} for that day.`,
    tooShort: (worked: string) => `You worked ${worked}, less than half a shift.`,
    claimed: 'You’ve already claimed comp off for that day.',
    overtime: 'You’ve claimed overtime for that day. A day can be overtime or comp off, not both.',
    reason: 'Add what you worked on.',
} as const;

/** Why a day can't be claimed as comp off, in this order (null = it can). */
export const compOffProblem = (input: {
    date: string;
    today: string;
    isOffDay: boolean;
    dayText: string;
    expiryDays: number;
    workedMinutes: number;
    workedText: string;
    shiftMinutes: number;
    attendance: boolean;
    alreadyClaimed: boolean;
    overtimeClaimed: boolean;
}) => {
    if (input.date > input.today) return COMP_OFF_MESSAGES.future;
    if (!input.isOffDay) return COMP_OFF_MESSAGES.workingDay(input.dayText);
    if (input.expiryDays && daysFrom(input.date, input.today) > input.expiryDays) return COMP_OFF_MESSAGES.tooOld(input.expiryDays);
    if (!input.workedMinutes) return COMP_OFF_MESSAGES.notWorked(input.attendance);
    if (!compOffDays(input.workedMinutes, input.shiftMinutes)) return COMP_OFF_MESSAGES.tooShort(input.workedText);
    if (input.alreadyClaimed) return COMP_OFF_MESSAGES.claimed;
    if (input.overtimeClaimed) return COMP_OFF_MESSAGES.overtime;
    return null;
};

/**
 * The comp off ledger: each approved claim is a credit on the day it was approved; leave taken as comp off uses the
 * oldest credits first; what's left of a credit expires `expiryDays` after the day worked (0 = never).
 */
export const compOffLedger = (credits: { worked: string; approvedOn: string; days: number }[], used: number, expiryDays: number, today: string) => {
    const sorted = [...credits].sort((a, b) => a.worked.localeCompare(b.worked));
    let toUse = Math.max(0, used);
    let credited = 0;
    let expired = 0;
    const ledger: LedgerEntry[] = [];
    let expiring: { date: string; amount: number } | null = null;
    sorted.forEach(c => {
        if (c.approvedOn <= today) {
            ledger.push({ date: c.approvedOn, kind: 'COMP_OFF_EARNED', amount: c.days, text: `Earned for working ${dayMonth(c.worked)}` });
            credited += c.days;
        }
        const use = Math.min(c.days, toUse);
        toUse -= use;
        const rest = r2(c.days - use);
        if (!expiryDays || rest <= 0) return;
        const on = addDays(c.worked, expiryDays);
        if (on <= today) {
            ledger.push({ date: on, kind: 'COMP_OFF_EXPIRED', amount: -rest, text: `Expired unused (earned ${dayMonth(c.worked)})` });
            expired += rest;
        } else if (!expiring || on < expiring.date) expiring = { date: on, amount: rest };
    });
    return { credited: r2(credited - expired), earned: credited, expired, ledger, expiring: expiring as { date: string; amount: number } | null };
};

/** What a comp-off claim's day was: "Diwali" / "weekly off". */
export const offDayName = (holidayName: string | undefined | null) => holidayName || 'weekly off';

// ---- late check-in deductions -----------------------------------------------------------------------------------

export interface LateMark {
    date: string;
    lateMinutes: number;
    /** pending = a dispute (correction) is waiting: still deducted. reversed = a dispute was approved. */
    state: 'deducted' | 'pending' | 'reversed';
    reversedOn?: string;
}

/**
 * Each late mark, in date order, deducts `days` from the first type in `order` that still has that much left (after
 * earlier deductions), else it's loss of pay. A reversed mark is shown ("+0.5 reversed") but takes nothing.
 */
export const allocateLateDeductions = (marks: LateMark[], days: number, order: string[], leftOf: (type: string) => number, labelOf: (type: string) => string) => {
    if (!(days > 0)) return { deductions: [] as Omit<LateDeduction, 'dispute'>[], byType: {} as Record<string, number>, lossOfPay: 0 };
    const byType: Record<string, number> = {};
    let lossOfPay = 0;
    const deductions = [...marks]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(m => {
            if (m.state === 'reversed') {
                const from = order.find(t => leftOf(t) - (byType[t] ?? 0) >= days) ?? 'LOP';
                return { date: m.date, lateMinutes: m.lateMinutes, days, from, fromLabel: from === 'LOP' ? 'Loss of pay' : labelOf(from), state: m.state, ...(m.reversedOn ? { reversedOn: m.reversedOn } : {}) };
            }
            const from = order.find(t => leftOf(t) - (byType[t] ?? 0) >= days - 1e-9) ?? 'LOP';
            if (from === 'LOP') lossOfPay += days;
            else byType[from] = (byType[from] ?? 0) + days;
            return { date: m.date, lateMinutes: m.lateMinutes, days, from, fromLabel: from === 'LOP' ? 'Loss of pay' : labelOf(from), state: m.state };
        });
    return { deductions, byType, lossOfPay };
};

/** The Notes panel's amount: "Half a day of Annual leave" / "Half a day (loss of pay)". */
export const lateAmountText = (d: Pick<LateDeduction, 'days' | 'from' | 'fromLabel'>) =>
    `${daysAmount(d.days)}${d.from === 'LOP' ? ' (loss of pay)' : ` of ${typeLabel(d.fromLabel)}`}`;

/** The Today card: "Late by 25m. Half a day of Annual leave has been deducted. If you weren’t late, raise a dispute. …" */
export const lateTodayNote = (d: Pick<LateDeduction, 'days' | 'from' | 'fromLabel' | 'state'>, lateText: string) => {
    const what = d.from === 'LOP' ? `${daysAmount(d.days)} is marked as loss of pay (no leave left).` : `${daysAmount(d.days)} of ${typeLabel(d.fromLabel)} has been deducted.`;
    const next = d.state === 'pending' ? 'Your dispute is waiting for approval. It’s reversed automatically if approved.' : 'If you weren’t late, raise a dispute. It’s reversed automatically once approved.';
    return `Late by ${lateText}. ${what} ${next}`;
};

/** Day details: "0.5 day · Annual leave" / "0.5 day · Loss of pay" (+ pending / reversed). */
export const lateDayDetail = (d: Pick<LateDeduction, 'days' | 'from' | 'fromLabel' | 'state'>) => {
    const amount = daysText(d.days);
    if (d.state === 'reversed') return `${amount} · reversed (dispute approved)`;
    const where = d.from === 'LOP' ? 'Loss of pay' : typeLabel(d.fromLabel);
    return `${amount} · ${where}${d.state === 'pending' ? ' (reversed if your dispute is approved)' : ''}`;
};

/** Overview notification: "Late on Fri 23 Oct · −0.5 day" / "Deducted from Annual leave. If you weren’t late, …" */
export const lateNotification = (d: Pick<LateDeduction, 'days' | 'from' | 'fromLabel'>, dayText: string) => ({
    title: `Late on ${dayText} · −${daysText(d.days)}`,
    text: `${d.from === 'LOP' ? 'No leave left, so it’s loss of pay.' : `Deducted from ${typeLabel(d.fromLabel)}.`} If you weren’t late, raise a dispute.`,
});

/** Ledger line: "−0.5 · Annual" (+ " · dispute pending") or "+0.5 · reversed". */
export const lateLedgerText = (d: Pick<LateDeduction, 'days' | 'from' | 'fromLabel' | 'state'>) => {
    if (d.state === 'reversed') return `+${fmtDays(d.days)} · reversed`;
    return `−${fmtDays(d.days)} · ${d.from === 'LOP' ? 'Loss of pay' : d.fromLabel}${d.state === 'pending' ? ' · dispute pending' : ''}`;
};

/** "0.5 day is deducted automatically for every check-in after the grace period, Annual leave first. …" */
export const lateDeductionIntro = (days: number, firstLabel: string) =>
    `${daysText(days)} ${days <= 1 ? 'is' : 'are'} deducted automatically for every check-in after the grace period, ${typeLabel(firstLabel)} first. If a dispute is approved, it’s reversed automatically.`;

// ---- approval routing -------------------------------------------------------------------------------------------

/** Leave, leave cancellations and comp off requests all use the leave approvers (settings.level1/level2.leave). */
export const LEAVE_ROUTE: ApprovalType = 'leave';

/** Payroll → Leave → Requests: which views make sense for the approval setup (a view also stays while items sit in it). */
export const adminRequestViews = (level1: Level1Approver, level2: Level2Approver, counts: { you: number; mgr: number }) => {
    const isPerson = (v: string) => approverPersonId(v) !== null;
    const teamStep = (level1 !== 'MANAGER' && !isPerson(level1)) || (level2 !== 'NONE' && !isPerson(level2));
    const personStep = level1 === 'MANAGER' || isPerson(level1) || isPerson(level2);
    const mgrLabel = level1 === 'MANAGER' && !isPerson(level2) ? 'With managers' : 'With approvers';
    return [
        ...(teamStep || counts.you ? [{ key: 'you' as const, label: 'Waiting for you' }] : []),
        ...(personStep || counts.mgr ? [{ key: 'mgr' as const, label: mgrLabel }] : []),
        { key: 'upd' as const, label: 'Update requested' },
        { key: 'no' as const, label: 'Rejected' },
        { key: 'all' as const, label: 'All' },
    ];
};

// ---- loss of pay -----------------------------------------------------------------------------------------------

/** Approving leave beyond what's left: the days past the balance are loss of pay (flagged, not paid out here). */
export const lossOfPayOnApproval = (left: number, days: number) => (days > left ? r2(days - Math.max(0, left)) : 0);

// ---- one employee's leave year ------------------------------------------------------------------------------------

export interface LeaveYearInput {
    policy: LeavePolicy;
    today: string;
    facts: EmploymentFacts & { gender: 'Male' | 'Female' };
    /** Last cycle's unused days per type (what rolled forward: carried up to the limit, the rest lapsed). */
    opening: Record<string, number>;
    /** Approved leave (not cancelled), and leave in request (pending or update requested). */
    leave: { type: string; start: string; end: string; half: LeaveHalf | null; days: number; state: 'approved' | 'in_request' }[];
    late: LateMark[];
    lateDays: number;
    /** Approved comp off claims (worked day, approval day, days). */
    compOff: { worked: string; approvedOn: string; days: number }[];
}

const takenText = (l: { start: string; end: string; half: LeaveHalf | null }) =>
    `${l.half ? 'Half-day leave' : 'Leave'} taken${l.end > l.start ? ` (to ${dayMonth(l.end)})` : ''}`;

/**
 * Every applicable type's balance this leave year (active types for their gender, plus Comp off when it's on), the
 * late deductions, loss of pay and — for someone leaving this year — the exit settlement.
 */
export const computeLeaveYear = (input: LeaveYearInput) => {
    const { policy, facts } = input;
    const asOf = asOfDate(input.today, facts.exitDate);
    const year = leaveYearOf(asOf, policy, facts.dateOfJoin);
    const types = typesForEmployee(policy, facts.gender);
    const inYear = (l: { start: string; end: string }) => l.end >= year.start && l.start <= year.end;
    const sumOf = (type: string, state: 'approved' | 'in_request') =>
        input.leave.filter(l => l.type === type && l.state === state && (type === COMP_OFF || inYear(l))).reduce((s, l) => s + l.days, 0);
    const onProbation = facts.status === 'PROBATION';

    const base = types.map(t => {
        const sched = creditSchedule(t, year, facts);
        const ledger: LedgerEntry[] = [];
        let carried = 0;
        if (facts.dateOfJoin < year.start) {
            const cf = carryForward(input.opening[t.id] ?? 0, t.carryForward);
            carried = cf.carried;
            if (cf.carried > 0) ledger.push({ date: year.start, kind: 'CARRIED', amount: cf.carried, text: 'Carried forward from last year' });
            if (cf.lapsed > 0)
                ledger.push({
                    date: year.start,
                    kind: 'LAPSED',
                    amount: null,
                    text: `${fmtDays(cf.lapsed)} unused ${dayWord(cf.lapsed)} lapsed (${t.carryForward ? `carry-forward limit ${fmtDays(t.carryForward)}` : 'no carry forward'})`,
                });
        }
        if (sched.daily) {
            const { amountOf, months } = sched.daily;
            months.forEach(m => {
                if (m.start > asOf) return;
                const amount = m.end <= asOf ? amountOf(m) : creditedBy({ ...sched, daily: { amountOf, months: [m] } }, t, asOf, year, facts.dateOfJoin);
                if (amount > 0) ledger.push({ date: m.end <= asOf ? m.end : asOf, kind: 'DAILY', amount, text: `Daily accrual, ${monthName(m.start)}${m.end > asOf ? ' so far' : ''}` });
            });
        } else sched.credits.filter(c => c.date <= asOf).forEach(c => ledger.push({ date: c.date, kind: c.kind, amount: c.amount, text: c.text }));
        input.leave
            .filter(l => l.type === t.id && l.state === 'approved' && inYear(l))
            .forEach(l => ledger.push({ date: l.start, kind: 'TAKEN', amount: -l.days, text: takenText(l) }));
        const credited = carried + creditedBy(sched, t, asOf, year, facts.dateOfJoin);
        const nextCredit = sched.daily ? null : sched.credits.find(c => c.date > asOf) ?? null;
        return {
            t,
            credited,
            approved: sumOf(t.id, 'approved'),
            inRequest: sumOf(t.id, 'in_request'),
            allocated: sched.entitlement + carried,
            carried,
            next: nextCredit ? { date: nextCredit.date, amount: nextCredit.amount } : null,
            ledger,
            entitlement: sched.entitlement,
        };
    });

    const late = allocateLateDeductions(
        input.late.filter(m => m.date >= year.start && m.date <= asOf && m.date >= facts.dateOfJoin),
        input.lateDays,
        policy.lateOrder.filter(id => base.some(b => b.t.id === id)),
        id => {
            const b = base.find(x => x.t.id === id);
            return b ? b.credited - b.approved : 0;
        },
        id => base.find(x => x.t.id === id)?.t.name ?? id
    );

    const balances = base.map(b => {
        const lateDays = late.byType[b.t.id] ?? 0;
        late.deductions
            .filter(d => d.from === b.t.id && d.state !== 'reversed')
            .forEach(d => b.ledger.push({ date: d.date, kind: 'LATE', amount: -d.days, text: `Late check-in deduction${d.state === 'pending' ? ' (dispute pending)' : ''}` }));
        late.deductions
            .filter(d => d.state === 'reversed' && d.from === b.t.id)
            .forEach(d =>
                b.ledger.push({ date: d.reversedOn ?? d.date, kind: 'LATE_REVERSED', amount: null, text: `Late check-in on ${dayMonth(d.date)}: +${fmtDays(d.days)} reversed (dispute approved)` })
            );
        return {
            type: b.t.id,
            name: b.t.name,
            label: typeLabel(b.t.name),
            credit: b.t.credit as LeaveCredit | 'COMP_OFF',
            probation: b.t.probation,
            proofAfterDays: b.t.proofAfterDays,
            credited: r2(b.credited),
            approved: r2(b.approved),
            late: r2(lateDays),
            inRequest: r2(b.inRequest),
            available: availableBalance({ credited: b.credited, approved: b.approved, late: lateDays, inRequest: b.inRequest }),
            left: r2(b.credited - b.approved - lateDays),
            allocated: r2(b.allocated),
            carried: r2(b.carried),
            next: b.next,
            expiring: null as { date: string; amount: number } | null,
            notAvailable: onProbation && b.t.probation === 'NONE',
            ledger: b.ledger.sort((x, y) => y.date.localeCompare(x.date)),
            entitlement: b.entitlement,
            encashOnExit: b.t.encashOnExit,
        };
    });

    if (policy.compOff.enabled) {
        const used = sumOf(COMP_OFF, 'approved');
        const inRequest = sumOf(COMP_OFF, 'in_request');
        const co = compOffLedger(input.compOff, used, policy.compOff.expiryDays, asOf);
        const ledger: LedgerEntry[] = [
            ...co.ledger,
            ...input.leave.filter(l => l.type === COMP_OFF && l.state === 'approved').map(l => ({ date: l.start, kind: 'TAKEN' as const, amount: -l.days, text: takenText(l) })),
        ].sort((x, y) => y.date.localeCompare(x.date));
        balances.push({
            type: COMP_OFF,
            name: COMP_OFF_NAME,
            label: COMP_OFF_NAME,
            credit: 'COMP_OFF',
            probation: 'FULL',
            proofAfterDays: null,
            credited: r2(co.credited),
            approved: r2(used),
            late: 0,
            inRequest: r2(inRequest),
            available: availableBalance({ credited: co.credited, approved: used, late: 0, inRequest }),
            left: r2(co.credited - used),
            allocated: r2(co.earned),
            carried: 0,
            next: null,
            expiring: co.expiring,
            notAvailable: false,
            ledger,
            entitlement: co.earned,
            encashOnExit: false,
        });
    }

    const exit = facts.exitDate && facts.exitDate >= year.start && facts.exitDate <= year.end ? facts.exitDate : null;
    const settlement = exit
        ? balances
              .filter(b => b.type !== COMP_OFF)
              .map(b => ({ type: b.type, name: b.name, ...exitSettlement({ earned: b.entitlement + b.carried, approved: b.approved, late: b.late }, b.encashOnExit) }))
        : null;

    return { year, asOf, balances, lateDeductions: late.deductions, lossOfPay: late.lossOfPay, settlement };
};

export { maxIso, minIso };
