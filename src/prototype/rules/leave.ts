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
//   PROTOTYPE-SETUP (Leave policy settings):
//   kinds ............. yearly balance types, and per-event types (maternity, paternity): up to N days/weeks per event,
//                       within a window around the event date, no balance, never in balance tables or deduction orders
//   counting .......... per type: working days (the employee's own) or calendar days (every day in the range)
//   credit date ....... monthly credits land at the start / end of the month or on a custom day (1–28); a joiner's first
//                       credit lands on that date in their first counted month
//   rounding .......... none / nearest half day / nearest day, on credited-so-far and the year's total
//   year end .......... carry forward up to a limit / encash / lapse (a ledger line says which)
//   leaving ........... encash and/or bring the last working day forward (both = the employee's choice; none = lapses)
//   loss of pay ....... the only unpaid leave: only once every yearly balance and comp off is at 0, or any time
//   endorsement ....... longer leave gets an extra step after level 1 (department head or a person)
//   routing ........... the approval chain is rules/attendance.ts (startTrail / decide / resubmitTrail); leave
//                       cancellations and comp off use the leave approvers (routeTypeOf)
import type {
    ApprovalType,
    LateDeduction,
    LeaveAppliesTo,
    ApprovalStep,
    ApprovalTrail,
    LeaveCount,
    LeaveCredit,
    LeaveCreditDate,
    LeaveExitOpt,
    LeaveHalf,
    LeavePolicy,
    LeaveRounding,
    LeaveYearEnd,
    LeaveTrigger,
    LopRule,
    MaternityChild,
    MaternityRule,
    SandwichConfig,
    LeaveProbationRule,
    LeaveTypeConfig,
    LedgerEntry,
    Level1Approver,
    Level2Approver,
    SandwichRule,
    Weekday,
} from '@src/domains/attendanceTimesheet/types';

import { DEFAULT_LEAVE_POLICY, DEFAULT_LEAVE_TYPES, DEFAULT_MATERNITY, MATERNITY_MIN, RuleError, addDays, approverPersonId, nextStatus, weekdayOf } from './attendance';

// ---- defaults --------------------------------------------------------------------------------------------------

export const COMP_OFF = 'COMP_OFF';
/** Maternity's event date (fixed). */
export const MATERNITY_DATE_LABEL = 'Expected or actual date of delivery';
export const COMP_OFF_NAME = 'Comp off';

/** The default leave types and policy live with DEFAULT_SETTINGS (rules/attendance.ts). */
export const DEFAULT_POLICY: LeavePolicy = DEFAULT_LEAVE_POLICY;
export { DEFAULT_LEAVE_TYPES };

export const DEFAULT_LATE_DAYS = 0.5;

// ---- the previous policy shape (Final batch) → this one -------------------------------------------------------

/** The leave policy as it was stored before the Leave module (three fixed types, a probation length). */
export interface LegacyLeavePolicy {
    year: 'COMPANY' | 'JOINING';
    cycleStart: string;
    probationMonths?: number;
    types: Record<string, { daysPerYear: number; credit: 'UPFRONT' | 'MONTHLY'; carryForward: number; encashOnExit: boolean }>;
}

/**
 * PROTOTYPE-SETUP (Leave policy settings; Leave settings rework): the leaving option of a stored type — one choice now:
 * ['encash'] | ['prepone'] (bring the last working day forward) | [] (lapse). Older shapes: both ticked ("the employee
 * chooses") → ['encash']; onLeaving ENCASH / encashOnExit true → ['encash']; BRING_FORWARD / false → ['prepone'].
 */
export const exitOptsOf = (t: { exitOpts?: unknown; onLeaving?: unknown; encashOnExit?: unknown }): LeaveExitOpt[] => {
    if (Array.isArray(t.exitOpts)) {
        if (t.exitOpts.includes('encash')) return ['encash'];
        return t.exitOpts.includes('prepone') ? ['prepone'] : [];
    }
    if (t.onLeaving === 'ENCASH' || t.onLeaving === 'BRING_FORWARD') return t.onLeaving === 'ENCASH' ? ['encash'] : ['prepone'];
    return t.encashOnExit ? ['encash'] : ['prepone'];
};

const yearEndOf = (t: { yearEnd?: unknown; carryForward?: number }): LeaveYearEnd => {
    if (t.yearEnd === 'carry' || t.yearEnd === 'encash' || t.yearEnd === 'lapse') return t.yearEnd;
    return (t.carryForward ?? 0) > 0 ? 'carry' : 'lapse';
};

const TRIGGER_IDS: LeaveTrigger[] = ['birthadopt', 'birth', 'adoption', 'loss', 'procedure', 'other'];

/**
 * Maternity's rule from any stored shape: current { d1, d2, d3, pre, post }; the prototype's weeks { w1, w2, pre1 } →
 * d1 = d2 = w1 × 7, d3 = w2 × 7, pre = pre1, post = 0; the last run's limit / window (26 weeks from 56 days before) →
 * d1 = d2 = the limit in days, d3 = 84, pre = windowBefore ÷ 7. Never below the statutory minimum; pre at most 8.
 */
export const maternityRuleOf = (t: { mat?: unknown; limit?: number | null; limitUnit?: string; windowBefore?: number | null; windowAfter?: number | null }): MaternityRule => {
    const m = (t.mat ?? {}) as Partial<MaternityRule> & { w1?: number; w2?: number; pre1?: number };
    let rule: MaternityRule;
    if (typeof m.d1 === 'number') rule = { d1: m.d1, d2: m.d2 ?? m.d1, d3: m.d3 ?? MATERNITY_MIN.d3, pre: m.pre ?? 8, post: m.post ?? 0 };
    else if (typeof m.w1 === 'number') rule = { d1: m.w1 * 7, d2: m.w1 * 7, d3: (m.w2 ?? 12) * 7, pre: m.pre1 ?? 8, post: 0 };
    else {
        const limitDays = t.limit ? t.limit * (t.limitUnit === 'weeks' ? 7 : 1) : MATERNITY_MIN.d1;
        rule = { d1: limitDays, d2: limitDays, d3: MATERNITY_MIN.d3, pre: t.windowBefore ? Math.round(t.windowBefore / 7) : 8, post: t.windowAfter ? Math.round(t.windowAfter / 7) : 0 };
    }
    return {
        d1: Math.max(MATERNITY_MIN.d1, rule.d1),
        d2: Math.max(MATERNITY_MIN.d2, rule.d2),
        d3: Math.max(MATERNITY_MIN.d3, rule.d3),
        pre: Math.min(MATERNITY_MIN.preMax, Math.max(0, rule.pre)),
        post: Math.max(0, rule.post),
    };
};

export const isMaternity = (t: Pick<LeaveTypeConfig, 'id'> & Partial<Pick<LeaveTypeConfig, 'system'>> | null | undefined) => Boolean(t && (t.system === 'maternity' || t.id === 'MATERNITY'));

/**
 * A stored type in the current shape. Missing fields get the yearly defaults (kind yearly, working days, year end
 * 'carry' when a carry-forward limit is set, else 'lapse'; excess 'lapse'); half days take the company-wide setting it
 * used to be (`companyHalfDay`); per-event types without a trigger are 'other' (their eventLabel stays the date label),
 * with a document required when they had a document rule; Maternity becomes the statutory system type.
 */
export const migrateLeaveType = (stored: unknown, companyHalfDay = true): LeaveTypeConfig => {
    const t = stored as Partial<LeaveTypeConfig> & { onLeaving?: unknown; encashOnExit?: unknown; mat?: unknown };
    const maternity = isMaternity(t as LeaveTypeConfig);
    const kind = maternity || t.kind === 'event' ? 'event' : 'yearly';
    const out: LeaveTypeConfig & { onLeaving?: unknown; encashOnExit?: unknown } = {
        ...(t as LeaveTypeConfig),
        kind,
        count: maternity || t.count === 'calendar' ? 'calendar' : 'working',
        yearEnd: yearEndOf(t),
        excess: t.excess === 'encash' ? 'encash' : 'lapse',
        carryForward: t.carryForward ?? 0,
        exitOpts: kind === 'event' ? [] : exitOptsOf(t),
        limit: kind === 'event' ? t.limit ?? null : null,
        limitUnit: t.limitUnit === 'weeks' ? 'weeks' : 'days',
        eventLabel: t.eventLabel ?? '',
        windowBefore: t.windowBefore ?? null,
        windowAfter: t.windowAfter ?? null,
        halfDay: kind === 'event' ? false : typeof t.halfDay === 'boolean' ? t.halfDay : companyHalfDay,
        trigger: TRIGGER_IDS.includes(t.trigger as LeaveTrigger) ? (t.trigger as LeaveTrigger) : 'other',
        docRequired: typeof t.docRequired === 'boolean' ? t.docRequired : kind === 'event' && t.proofAfterDays !== null && t.proofAfterDays !== undefined,
        docName: t.docName ?? '',
    };
    if (maternity) {
        out.system = 'maternity';
        out.appliesTo = 'FEMALE';
        out.trigger = 'birth';
        out.eventLabel = MATERNITY_DATE_LABEL;
        out.mat = maternityRuleOf(t);
        out.docRequired = typeof t.docRequired === 'boolean' ? t.docRequired : true;
    }
    delete out.onLeaving;
    delete out.encashOnExit;
    return out;
};

/** "Encash in F&F" / "Bring last working day forward" / "Lapses" — what happens to unused leave on leaving. */
export const exitText = (t: Pick<LeaveTypeConfig, 'exitOpts' | 'kind'>) => {
    if (t.kind === 'event') return '—';
    if (t.exitOpts.includes('encash')) return 'Encash in F&F';
    if (t.exitOpts.includes('prepone')) return 'Bring last working day forward';
    return 'Lapses';
};

export const EXIT_OPT_LABEL: Record<LeaveExitOpt, string> = {
    encash: 'Encash in full & final settlement',
    prepone: 'Use it to bring the last working day forward',
};

/** PROTOTYPE-SETUP (Leave settings rework): the sandwich settings from any stored shape (the old enum too). */
export const sandwichOf = (v: unknown): SandwichConfig => {
    const base = DEFAULT_LEAVE_POLICY.sandwich;
    if (v && typeof v === 'object') {
        const c = v as Partial<SandwichConfig>;
        return {
            on: Boolean(c.on),
            when: c.when === 'longer' ? 'longer' : 'always',
            overDays: Number.isFinite(c.overDays) ? Math.max(0, Math.round(c.overDays as number)) : base.overDays,
            weeklyOffs: typeof c.weeklyOffs === 'boolean' ? c.weeklyOffs : base.weeklyOffs,
            holidays: typeof c.holidays === 'boolean' ? c.holidays : base.holidays,
        };
    }
    if (v === 'WEEKLY_OFFS') return { ...base, on: true, when: 'always', weeklyOffs: true, holidays: false };
    if (v === 'WEEKLY_OFFS_AND_HOLIDAYS') return { ...base, on: true, when: 'always', weeklyOffs: true, holidays: true };
    return { ...base, on: false };
};

const isLegacy = (p: unknown): p is LegacyLeavePolicy => Boolean(p && typeof p === 'object' && !Array.isArray((p as LeavePolicy).types));

/**
 * Maps a stored policy to the current shape without losing anything: each old type keeps its days, credit
 * (UPFRONT → at the start of the leave cycle), carry forward and encashment; the old sick-leave proof threshold
 * becomes Sick's supporting-document rule; types the old policy didn't have (Maternity, Paternity) are added from the
 * defaults. The probation length is dropped: probation is a status now. PROTOTYPE-SETUP (Leave settings rework): the
 * company-wide half-day setting becomes each yearly type's halfDay; the sandwich enum becomes its settings object; a
 * company without the Maternity type gets the statutory default.
 */
export const migrateLeavePolicy = (stored: unknown, legacyProofDays?: number, companyHalfDay = true): LeavePolicy => {
    if (!stored) return DEFAULT_POLICY;
    const withMaternity = (types: LeaveTypeConfig[]) => (types.some(t => isMaternity(t)) ? types : [...types, { ...DEFAULT_MATERNITY }]);
    if (!isLegacy(stored)) {
        const p = stored as Partial<LeavePolicy> & { sandwich?: unknown };
        return {
            ...DEFAULT_POLICY,
            ...p,
            types: withMaternity((p.types ?? DEFAULT_POLICY.types).map(t => migrateLeaveType(t, companyHalfDay))),
            sandwich: sandwichOf(p.sandwich),
            compOff: { ...DEFAULT_POLICY.compOff, ...p.compOff },
            lateOrder: p.lateOrder ?? DEFAULT_POLICY.lateOrder,
            creditTime: /^\d{2}:\d{2}$/.test(p.creditTime ?? '') ? p.creditTime! : DEFAULT_POLICY.creditTime,
            matOn: typeof p.matOn === 'boolean' ? p.matOn : DEFAULT_POLICY.matOn,
        };
    }
    const old = stored;
    const types = DEFAULT_LEAVE_TYPES.map(d => {
        const o = old.types[d.id];
        if (!o) return { ...d, ...(d.kind === 'yearly' ? { halfDay: companyHalfDay } : {}) };
        return {
            ...d,
            daysPerYear: o.daysPerYear,
            credit: (o.credit === 'UPFRONT' ? 'CYCLE_START' : 'MONTHLY') as LeaveCredit,
            yearEnd: (o.carryForward > 0 ? 'carry' : 'lapse') as LeaveYearEnd,
            carryForward: o.carryForward,
            exitOpts: (o.encashOnExit ? ['encash'] : ['prepone']) as LeaveExitOpt[],
            halfDay: companyHalfDay,
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
export const typeLabel = (name: string) => (/leave$/i.test(name.trim()) || name === COMP_OFF_NAME || name === 'Loss of pay' ? name : `${name} leave`);

export const CREDIT_LABEL: Record<LeaveCredit, string> = { CYCLE_START: 'At the start of the leave cycle', MONTHLY: 'Monthly', DAILY: 'Daily' };
export const PROBATION_LABEL: Record<LeaveProbationRule, string> = {
    MONTHLY: 'Credited monthly',
    DAILY: 'Credited daily',
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
export const carryText = (t: Pick<LeaveTypeConfig, 'carryForward'> & Partial<Pick<LeaveTypeConfig, 'yearEnd'>>) =>
    (t.yearEnd ?? 'carry') === 'carry' && t.carryForward ? `Yes, up to ${daysText(t.carryForward)}` : 'No';

// ---- per-event and yearly wording (PROTOTYPE-SETUP: Leave policy settings) --------------------------------------

export const COUNT_LABEL: Record<LeaveCount, string> = { working: 'Working days', calendar: 'Calendar days' };
export const isEventType = (t: Pick<LeaveTypeConfig, 'kind'> | undefined | null) => t?.kind === 'event';

// ---- per-event leave (PROTOTYPE-SETUP: Leave settings rework) -----------------------------------------------------

/** What triggers a per-event type, and the date asked on the request. */
export const TRIGGERS: Record<LeaveTrigger, { label: string; date: string }> = {
    birthadopt: { label: 'Childbirth or adoption', date: 'Date of birth or adoption' },
    birth: { label: 'Childbirth', date: 'Date of birth' },
    adoption: { label: 'Adoption', date: 'Date of adoption' },
    loss: { label: 'Miscarriage or medical termination', date: 'Date of the miscarriage or termination' },
    procedure: { label: 'Surgery or medical procedure', date: 'Date of the procedure' },
    other: { label: 'Other event', date: 'Date of the event' },
};
export const MATERNITY_CHILD_LABEL: Record<MaternityChild, string> = { 1: 'First child', 2: 'Second child', 3: 'Third child or later' };

/** The event date's label: Maternity's fixed one, the custom one for "Other event", else the trigger's. */
export const eventDateLabel = (t: Pick<LeaveTypeConfig, 'id' | 'trigger' | 'eventLabel'> & Partial<Pick<LeaveTypeConfig, 'system'>>) => {
    if (isMaternity(t)) return MATERNITY_DATE_LABEL;
    if (t.trigger === 'other' || !t.trigger) return t.eventLabel || TRIGGERS.other.date;
    return TRIGGERS[t.trigger].date;
};

/** A per-event limit in days (weeks × 7). */
export const eventLimitDays = (t: Pick<LeaveTypeConfig, 'limit' | 'limitUnit'>) => (t.limit ?? 0) * (t.limitUnit === 'weeks' ? 7 : 1);
/** Maternity days for the child (first / second / third or later). */
export const maternityDays = (mat: MaternityRule, child: MaternityChild = 1) => (child === 1 ? mat.d1 : child === 2 ? mat.d2 : mat.d3);
/** Weeks before the delivery date Maternity can start: the setting, at most 8 — 6 for the third child or later. */
export const maternityPreWeeks = (mat: MaternityRule, child: MaternityChild = 1) => Math.min(mat.pre, child >= 3 ? MATERNITY_MIN.preMaxThird : MATERNITY_MIN.preMax);

/** The days of leave for one event (Maternity: by child). */
export const eventEntitlement = (t: Pick<LeaveTypeConfig, 'id' | 'limit' | 'limitUnit'> & Partial<Pick<LeaveTypeConfig, 'system' | 'mat'>>, child?: MaternityChild | null) =>
    isMaternity(t) && t.mat ? maternityDays(t.mat, child ?? 1) : eventLimitDays(t);

/** Days before / after the event the leave can START (null = no limit). Maternity: from its weeks, by child. */
export const eventWindow = (
    t: Pick<LeaveTypeConfig, 'id' | 'windowBefore' | 'windowAfter'> & Partial<Pick<LeaveTypeConfig, 'system' | 'mat'>>,
    child?: MaternityChild | null
): { before: number | null; after: number | null } =>
    isMaternity(t) && t.mat ? { before: maternityPreWeeks(t.mat, child ?? 1) * 7, after: t.mat.post * 7 } : { before: t.windowBefore, after: t.windowAfter };

/** The first and last allowed start dates around an event date (null = no limit that side). */
export const startRange = (window: { before: number | null; after: number | null }, eventDate: string) => ({
    from: window.before === null ? null : addDays(eventDate, -window.before),
    to: window.after === null ? null : addDays(eventDate, window.after),
});

/** "Can start between Mon 6 Oct and Mon 1 Dec" / "Can start from …" / "Can start until …" / "Can start any time". */
export const startRangeText = (range: { from: string | null; to: string | null }) => {
    if (range.from && range.to) return `Can start between ${shortDate(range.from)} and ${shortDate(range.to)}`;
    if (range.from) return `Can start from ${shortDate(range.from)}`;
    if (range.to) return `Can start until ${shortDate(range.to)}`;
    return 'Can start any time';
};

/** "182 days" / "7 days" / "26 weeks" */
export const limitText = (t: Pick<LeaveTypeConfig, 'limit' | 'limitUnit'>) => {
    const n = t.limit ?? 0;
    return t.limitUnit === 'weeks' ? `${fmtDays(n)} week${n === 1 ? '' : 's'}` : daysText(n);
};
/** The table's "Number of days": "12 days a year" / "7 days per event" / "182 days per birth" (Maternity, first child). */
export const entitlementText = (t: Pick<LeaveTypeConfig, 'id' | 'kind' | 'daysPerYear' | 'limit' | 'limitUnit'> & Partial<Pick<LeaveTypeConfig, 'system' | 'mat'>>) => {
    if (isMaternity(t) && t.mat) return `${daysText(t.mat.d1)} per birth`;
    return t.kind === 'event' ? `${limitText(t)} per event` : `${fmtDays(t.daysPerYear)} ${dayWord(t.daysPerYear)} a year`;
};
/** "Monthly · 1.5 days a month" / "Per event" */
export const creditedText = (t: Pick<LeaveTypeConfig, 'kind' | 'credit' | 'daysPerYear'>) => (t.kind === 'event' ? 'Per event' : `${CREDIT_LABEL[t.credit]} · ${accrualText(t)}`);
/** "Carry forward up to 45 days" / "Carry forward up to 45 days, the rest encashed" / "All encashed" / "All lapse" */
export const yearEndText = (t: Pick<LeaveTypeConfig, 'kind' | 'yearEnd' | 'carryForward'> & Partial<Pick<LeaveTypeConfig, 'excess'>>) => {
    if (t.kind === 'event') return '—';
    if (t.yearEnd === 'carry' && t.carryForward > 0) return `Carry forward up to ${daysText(t.carryForward)}${t.excess === 'encash' ? ', the rest encashed' : ', the rest lapses'}`;
    if (t.yearEnd === 'encash') return 'All encashed';
    return 'All lapse';
};
/** "Up to 7 days per event · Working days" */
export const eventInfoText = (t: Pick<LeaveTypeConfig, 'id' | 'limit' | 'limitUnit' | 'count'> & Partial<Pick<LeaveTypeConfig, 'system' | 'mat'>>) =>
    `Up to ${isMaternity(t) && t.mat ? daysText(t.mat.d1) : limitText(t)} per event · ${COUNT_LABEL[t.count]}`;
/** "From 30 days before to 90 days after the date of birth or adoption" / "Any time" — when the leave can START. */
export const windowText = (t: Pick<LeaveTypeConfig, 'id' | 'windowBefore' | 'windowAfter' | 'eventLabel' | 'trigger'> & Partial<Pick<LeaveTypeConfig, 'system' | 'mat'>>, child?: MaternityChild | null) => {
    const ev = eventDateLabel(t).toLowerCase();
    const { before, after } = eventWindow(t, child);
    if (before === null && after === null) return 'Can start any time';
    if (before !== null && after !== null) return after === 0 ? `Can start up to ${daysText(before)} before the ${ev}` : `Can start from ${daysText(before)} before to ${daysText(after)} after the ${ev}`;
    if (before !== null) return `Can start from ${daysText(before)} before the ${ev}`;
    return `Can start up to ${daysText(after as number)} after the ${ev}`;
};

/**
 * The end date for the full entitlement from a start date: calendar days → start + N − 1; working days → the N-th
 * working day of the employee's calendar from the start. The employee can shorten it, never extend it.
 */
export const autoEnd = (start: string, days: number, count: LeaveCount, cal: WorkCalendar) => {
    if (days <= 0) return start;
    if (count === 'calendar') return addDays(start, Math.ceil(days) - 1);
    let d = start;
    let n = isWorkingDayFor(cal, d) ? 1 : 0;
    for (let i = 0; n < days && i < 800; i += 1) {
        d = addDays(d, 1);
        if (isWorkingDayFor(cal, d)) n += 1;
    }
    return d;
};

/** Maternity's days by child can't go below the statutory minimum; "before" is at most 8 weeks. Null when fine. */
export const maternityProblem = (mat: Partial<MaternityRule>) => {
    if ((mat.d1 ?? 0) < MATERNITY_MIN.d1) return `First child: at least ${MATERNITY_MIN.d1} days (the legal minimum).`;
    if ((mat.d2 ?? 0) < MATERNITY_MIN.d2) return `Second child: at least ${MATERNITY_MIN.d2} days (the legal minimum).`;
    if ((mat.d3 ?? 0) < MATERNITY_MIN.d3) return `Third child or later: at least ${MATERNITY_MIN.d3} days (the legal minimum).`;
    if ((mat.pre ?? 0) > MATERNITY_MIN.preMax || (mat.pre ?? 0) < 0) return `Leave can start at most ${MATERNITY_MIN.preMax} weeks before the delivery date.`;
    if ((mat.post ?? 0) < 0) return 'Weeks after the delivery date can’t be negative.';
    return null;
};

/** Maternity is required with more than 10 current employees; optional (off by default) with 10 or fewer. */
export const MATERNITY_HEADCOUNT = 10;
export const maternityRequired = (headcount: number) => headcount > MATERNITY_HEADCOUNT;
/** Is Maternity offered: required by headcount, or turned on by HR (matOn) — and the type is active. */
export const maternityOffered = (policy: Pick<LeavePolicy, 'matOn'>, headcount: number) => maternityRequired(headcount) || Boolean(policy.matOn);

// ---- credit date and rounding (PROTOTYPE-SETUP: Leave policy settings) -------------------------------------------

export const CREDIT_DATE_LABEL: Record<LeaveCreditDate, string> = { START: 'Start of the month', END: 'End of the month', CUSTOM: 'Custom date' };
export const ROUNDING_LABEL: Record<LeaveRounding, string> = { NONE: 'No rounding', HALF: 'Nearest half day', DAY: 'Nearest day' };
export const LOP_RULE_LABEL: Record<LopRule, string> = { USED_UP: 'Only once paid leave is used up', ANY_TIME: 'Any time, even with paid leave left' };

/** The day a month's credit lands: the month's first day, its last day, or the custom day (1–28) within it. */
export const creditDateIn = (m: { start: string; end: string }, rule: LeaveCreditDate = 'START', day = 1) => {
    if (rule === 'END') return m.end;
    if (rule === 'CUSTOM') {
        for (let d = m.start; d <= m.end; d = addDays(d, 1)) if (dayOf(d) === day) return d;
        return m.end;
    }
    return m.start;
};

/** 1.1667 → 1 (nearest half day) or 1 (nearest day); 1.3 → 1.5 or 1. */
export const roundDays = (n: number, mode: LeaveRounding = 'NONE') => {
    if (mode === 'HALF') return Math.round(n * 2 + 1e-9) / 2;
    if (mode === 'DAY') return Math.round(n + 1e-9);
    return n;
};

/**
 * Credits with rounding applied to the running total: each credit becomes the change in the rounded total, so the
 * ledger adds up to the rounded credited-so-far (14 a year by month, nearest half day: 1, 1.5, 1, 1.5, …).
 */
export const roundCredits = <C extends { amount: number }>(credits: C[], mode: LeaveRounding) => {
    if (mode === 'NONE') return credits;
    let raw = 0;
    let shown = 0;
    return credits.map(c => {
        raw += c.amount;
        const next = roundDays(raw, mode);
        const amount = r2(next - shown);
        shown = next;
        return { ...c, amount };
    });
};
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
export const creditSchedule = (
    type: Pick<LeaveTypeConfig, 'daysPerYear' | 'credit' | 'probation'>,
    year: { start: string; end: string },
    facts: EmploymentFacts,
    /** PROTOTYPE-SETUP (Leave policy settings): when monthly credits land (default: the start of the month). */
    when: { creditDate?: LeaveCreditDate; creditDay?: number } = {}
) => {
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
    // PROTOTYPE-SETUP (Leave settings rework): "Daily" during probation — while the employee is on probation the type
    // accrues day by day; once they're Active the months they spent on probation count as monthly credits.
    const credit = facts.status === 'PROBATION' && rule === 'DAILY' ? 'DAILY' : type.credit;

    if (credit === 'DAILY') {
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
            credits.push({ date: maxIso(doj, creditDateIn(m, when.creditDate, when.creditDay)), kind: inProb(m) ? 'PROBATION_MONTHLY' : 'MONTHLY', amount: monthly, text: inProb(m) ? 'Monthly credit during probation' : 'Monthly credit' });
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

/**
 * Credited up to `asOf` (daily types: the days elapsed in the current month too). PROTOTYPE-SETUP (Leave settings
 * rework): `todayCounts` — whether today's daily credit has landed (credit date Start: at the start of the day; End:
 * not until the day is over; Custom: from the set time). See dailyCreditToday.
 */
export const creditedBy = (
    schedule: ReturnType<typeof creditSchedule>,
    type: Pick<LeaveTypeConfig, 'daysPerYear'>,
    asOf: string,
    year: { start: string; end: string },
    doj: string,
    todayCounts = true
) => {
    if (!schedule.daily) return schedule.credits.filter(c => c.date <= asOf).reduce((s, c) => s + c.amount, 0);
    const cycleDays = daysFrom(year.start, year.end) + 1;
    return schedule.daily.months.reduce((s, m) => {
        if (m.end < asOf || (m.end === asOf && todayCounts)) return s + schedule.daily!.amountOf(m);
        if (m.start > asOf) return s;
        const a0 = maxIso(doj, m.start);
        const days = daysFrom(a0, asOf) + (todayCounts ? 1 : 0);
        return asOf >= a0 && days > 0 ? s + (type.daysPerYear * days) / cycleDays : s;
    }, 0);
};

/** Has today's daily credit landed? Start: yes (start of the day). End: no (once the day is over). Custom: from the set time. */
export const dailyCreditToday = (rule: LeaveCreditDate = 'START', nowTime = '00:00', creditTime = '12:00') => {
    if (rule === 'END') return false;
    if (rule === 'CUSTOM') return nowTime >= creditTime;
    return true;
};

// ---- the balance ----------------------------------------------------------------------------------------------

/** Available = credited so far − approved leave − late deductions − leave still in request. 10 − 4 − 0 − 2 = 4. */
export const availableBalance = (b: { credited: number; approved: number; late: number; inRequest: number }) => r2(b.credited - b.approved - b.late - b.inRequest);

/**
 * Exit: unused days (pro-rated to the last working day) follow the type's leaving option — encashed in full & final
 * settlement, used to bring the last working day forward, or lapse. Stored only: F&F is a later module. Days taken
 * beyond what was earned are recovered. (`choice` stays for older stored settlements where both were ticked.)
 */
export const exitSettlement = (b: { earned: number; approved: number; late: number }, exitOpts: LeaveExitOpt[]) => {
    const left = r2(b.earned - b.approved - b.late);
    const unused = left > 0 ? left : 0;
    const [opt] = exitOptsOf({ exitOpts });
    return {
        encash: opt === 'encash' ? unused : 0,
        bringForward: opt === 'prepone' ? unused : 0,
        recover: left < 0 ? -left : 0,
        ...(!opt ? { lapse: unused } : {}),
    };
};

/**
 * PROTOTYPE-SETUP (Leave policy settings; Leave settings rework): the end of a leave cycle for one yearly type
 * (employees still working; run automatically on the last working day), four options: all lapse · all encashed ·
 * carry forward up to the limit, the rest lapses · carry forward up to the limit, the rest is encashed.
 */
export const yearEndRule = (unused: number, t: Pick<LeaveTypeConfig, 'yearEnd' | 'carryForward'> & Partial<Pick<LeaveTypeConfig, 'excess'>>) => {
    const u = Math.max(0, r2(unused));
    if (t.yearEnd === 'carry') {
        const cf = carryForward(u, t.carryForward);
        return t.excess === 'encash' ? { carried: cf.carried, encashed: cf.lapsed, lapsed: 0 } : { carried: cf.carried, encashed: 0, lapsed: cf.lapsed };
    }
    if (t.yearEnd === 'encash') return { carried: 0, encashed: u, lapsed: 0 };
    return { carried: 0, encashed: 0, lapsed: u };
};

/** The ledger lines a year end leaves on the new cycle's first day: carried / encashed / lapsed, with the limit. */
export const yearEndLedger = (date: string, unused: number, t: Pick<LeaveTypeConfig, 'yearEnd' | 'carryForward'> & Partial<Pick<LeaveTypeConfig, 'excess'>>): LedgerEntry[] => {
    const y = yearEndRule(unused, t);
    const lines: LedgerEntry[] = [];
    const limited = t.yearEnd === 'carry' && t.carryForward > 0;
    if (y.carried > 0) lines.push({ date, kind: 'CARRIED', amount: y.carried, text: `Carried forward from last year${limited ? ` (limit ${fmtDays(t.carryForward)})` : ''}` });
    if (y.encashed > 0)
        lines.push({
            date,
            kind: 'ENCASHED',
            amount: null,
            text: `${fmtDays(y.encashed)} unused ${dayWord(y.encashed)} encashed at the end of last year${limited ? ` (above the carry-forward limit of ${fmtDays(t.carryForward)})` : ''} (paid by payroll)`,
        });
    if (y.lapsed > 0) {
        const why = limited ? `carry-forward limit ${fmtDays(t.carryForward)}` : 'no carry forward';
        lines.push({ date, kind: 'LAPSED', amount: null, text: `${fmtDays(y.lapsed)} unused ${dayWord(y.lapsed)} lapsed (${why})` });
    }
    return lines;
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
export const countLeaveDays = (
    start: string,
    end: string,
    half: LeaveHalf | null,
    cal: WorkCalendar,
    /** The sandwich rule (settings object; the older enum values still work). */
    sandwich: SandwichConfig | SandwichRule = 'OFF',
    /** PROTOTYPE-SETUP (Leave policy settings): 'calendar' = every day in the range counts (statutory leave). */
    count: LeaveCount = 'working'
) => {
    const all: string[] = [];
    if (start && end && end >= start) for (let d = start; d <= end; d = addDays(d, 1)) all.push(d);
    if (count === 'calendar') return { working: all.length, sandwich: 0, days: all.length * (half ? 0.5 : 1), workDates: all, calendar: true as const };
    const work = all.filter(d => isWorkingDayFor(cal, d));
    if (half) return { working: work.length, sandwich: 0, days: work.length * 0.5, workDates: work };
    const sand = sandwichDays(all, work, cal, sandwichOf(sandwich));
    return { working: work.length, sandwich: sand, days: work.length + sand, workDates: work };
};

/**
 * PROTOTYPE-SETUP (Leave settings rework): days off the sandwich rule adds — only those between the first and the last
 * working day of the request, weekly offs and/or public holidays as set; "Only for longer leave" applies it only when
 * the request covers more than N days in total (first to last day). Example: 1st–9th with the 6th and 7th weekly offs
 * and the 4th a holiday = 6 working days; with weekly offs and holidays counting (and a threshold under 9) = 9.
 */
export const sandwichDays = (all: string[], work: string[], cal: WorkCalendar, rule: SandwichConfig) => {
    if (!rule.on || work.length < 2 || (!rule.weeklyOffs && !rule.holidays)) return 0;
    if (rule.when === 'longer' && all.length <= rule.overDays) return 0;
    const first = work[0];
    const last = work[work.length - 1];
    return all.filter(d => {
        if (d <= first || d >= last || isWorkingDayFor(cal, d)) return false;
        // A holiday on a weekly off is a weekly off.
        return isWeeklyOffFor(cal, d) ? rule.weeklyOffs : rule.holidays;
    }).length;
};

/** "3 working days (weekly offs and public holidays aren’t counted)." / "4 days: 2 working days + 2 days off in between (sandwich rule)." */
export const durationText = (c: { working: number; sandwich: number; days: number; calendar?: boolean }, half: LeaveHalf | null) => {
    if (!c.working) return '';
    // PROTOTYPE-SETUP (Leave policy settings): calendar-day types count every day.
    if (c.calendar && !half) return `${c.working} calendar day${c.working === 1 ? '' : 's'}, weekends and public holidays included.`;
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
    halfOffFor: (label: string) => `${label} can’t be taken in half days. Apply for full days.`,
    document: (label: string, docName: string) => `${label} needs a supporting document${docName ? `: ${docName}` : ''}.`,
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
 * Checks a leave request, in this order: type · dates · half days (per type) · working days · overlap with leave that's
 * approved, pending or waiting for an update · not available during probation · balance (yearly: available, which
 * already takes off leave in request) or the per-event rules (event date, start window, limit, one request per event)
 * · supporting document · reason. `who` words the messages for HR adding leave for someone.
 */
export const validateLeave = (
    input: {
        type?: string;
        start?: string;
        end?: string;
        half?: LeaveHalf | null;
        reason?: string;
        proof?: { name: string } | null;
        eventDate?: string | null;
        child?: MaternityChild | null;
    },
    ctx: {
        types: LeaveTypeConfig[];
        cal: WorkCalendar;
        sandwich: SandwichConfig | SandwichRule;
        /** Fallback when a type has no halfDay setting (comp off: the company default). */
        halfDayAllowed: boolean;
        existing: ExistingLeave[];
        /** Available per type (credited − approved − late − in request; the request itself left out when resubmitting). */
        available: Record<string, number>;
        pending: Record<string, number>;
        onProbation: boolean;
        who?: string;
        reasonMessage?: string;
        /** PROTOTYPE-SETUP (Leave settings rework): per-event types — is there already an active request (approved or in
         *  request) for this type and event date (the request itself left out)? */
        eventTaken?: (type: string, eventDate: string) => boolean;
    }
) => {
    const type = ctx.types.find(t => t.id === input.type);
    if (!type) throw new RuleError(LEAVE_MESSAGES.type, 400);
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!iso.test(input.start ?? '')) throw new RuleError(LEAVE_MESSAGES.date, 400);
    const start = input.start!;
    const end = input.end || start;
    if (!iso.test(end)) throw new RuleError(LEAVE_MESSAGES.date, 400);
    const event = isEventType(type);
    const half = input.half === 'FIRST' || input.half === 'SECOND' ? input.half : null;
    const halfAllowed = event ? false : typeof type.halfDay === 'boolean' ? type.halfDay : ctx.halfDayAllowed;
    if (half && !halfAllowed) throw new RuleError(LEAVE_MESSAGES.halfOffFor(typeLabel(type.name)), 400);
    if (end < start) throw new RuleError(LEAVE_MESSAGES.endBeforeStart, 400);
    const count = countLeaveDays(start, end, half, ctx.cal, event || type.count === 'calendar' ? 'OFF' : ctx.sandwich, type.count ?? 'working');
    if (!count.working) throw new RuleError(LEAVE_MESSAGES.noWorkingDays, 400);
    const clash = ctx.existing.find(x => leavesClash(x, { start, end, half }));
    if (clash) throw new RuleError(LEAVE_MESSAGES.overlap(clash.summary, ctx.who), 409);
    const label = typeLabel(type.name);
    if (ctx.onProbation && type.probation === 'NONE' && type.id !== COMP_OFF && !event) throw new RuleError(LEAVE_MESSAGES.probation(label, ctx.who), 409);
    let eventDate: string | null = null;
    let child: MaternityChild | null = null;
    if (event) {
        // PROTOTYPE-SETUP (Leave settings rework): per-event leave has no balance: one block per event, within the
        // limit, starting inside the window around the event date.
        eventDate = input.eventDate && iso.test(input.eventDate) ? input.eventDate : null;
        child = isMaternity(type) ? (input.child === 2 || input.child === 3 ? input.child : input.child === 1 ? 1 : null) : null;
        const problem = eventProblem(type, { start, days: count.days, eventDate, child, taken: eventDate ? Boolean(ctx.eventTaken?.(type.id, eventDate)) : false });
        if (problem) throw new RuleError(problem, eventDate && (!isMaternity(type) || child) ? 409 : 400);
        if (type.docRequired && !input.proof?.name) throw new RuleError(LEAVE_MESSAGES.document(label, type.docName), 400);
    } else {
        const available = ctx.available[type.id] ?? 0;
        if (count.days > available + 1e-9) throw new RuleError(LEAVE_MESSAGES.balance(available, label, ctx.pending[type.id] ?? 0, ctx.who), 409);
        if (needsProof(type, count.days) && !input.proof?.name) throw new RuleError(LEAVE_MESSAGES.proof(label, type.proofAfterDays!), 400);
    }
    const reason = input.reason?.trim() ?? '';
    if (!reason) throw new RuleError(ctx.reasonMessage ?? LEAVE_MESSAGES.reason, 400);
    return {
        type: type.id,
        start,
        end,
        half,
        days: count.days,
        reason,
        ...(input.proof?.name ? { proof: { name: input.proof.name } } : {}),
        ...(eventDate ? { eventDate } : {}),
        ...(child ? { child } : {}),
    };
};

// ---- per-event leave checks (PROTOTYPE-SETUP: Leave policy settings; Leave settings rework) --------------------------

export const EVENT_MESSAGES = {
    eventDate: (dateLabel: string) => `Add the ${dateLabel.charAt(0).toLowerCase()}${dateLabel.slice(1)}.`,
    child: 'Pick which child this is (first, second, third or later).',
    tooEarly: (label: string, from: string) => `${label} can start from ${shortDate(from)} at the earliest.`,
    tooLate: (label: string, to: string) => `${label} has to start by ${shortDate(to)}.`,
    limit: (label: string, days: number, count: LeaveCount) => `${label} is up to ${daysText(days)} (${COUNT_LABEL[count].toLowerCase()}) for one event. Shorten the dates.`,
    taken: (label: string) => `There’s already a ${label.toLowerCase()} request for this event. It has to be taken in one go; change that request instead.`,
} as const;

/**
 * A per-event request: the event date is required (and, for Maternity, which child); the START date has to fall in
 * [event − before, event + after] (null = no limit that side; Maternity: its weeks, 6 before at most for the third child
 * or later); the duration is at most the entitlement (Maternity: by child); and only one active request per type and
 * event date. Null when it's fine.
 */
export const eventProblem = (
    t: Pick<LeaveTypeConfig, 'id' | 'name' | 'count' | 'limit' | 'limitUnit' | 'eventLabel' | 'windowBefore' | 'windowAfter' | 'trigger'> & Partial<Pick<LeaveTypeConfig, 'system' | 'mat'>>,
    r: { start: string; days: number; eventDate: string | null; child?: MaternityChild | null; taken?: boolean }
) => {
    const label = typeLabel(t.name);
    if (!r.eventDate) return EVENT_MESSAGES.eventDate(eventDateLabel(t));
    if (isMaternity(t) && !r.child) return EVENT_MESSAGES.child;
    const range = startRange(eventWindow(t, r.child), r.eventDate);
    if (range.from && r.start < range.from) return EVENT_MESSAGES.tooEarly(label, range.from);
    if (range.to && r.start > range.to) return EVENT_MESSAGES.tooLate(label, range.to);
    const limit = eventEntitlement(t, r.child);
    if (limit > 0 && r.days > limit + 1e-9) return EVENT_MESSAGES.limit(label, limit, t.count);
    if (r.taken) return EVENT_MESSAGES.taken(label);
    return null;
};

// ---- loss of pay (PROTOTYPE-SETUP: Leave policy settings) ---------------------------------------------------------

/** Loss of pay: the only unpaid leave. A leave request with this type and lop = true. */
export const LOP = 'LOP';
export const LOP_NAME = 'Loss of pay';
export const LOP_UNPAID_LINE = 'Unpaid: payroll treats these days as loss of pay.';

/** The paid balances still above 0 (yearly types and comp off; per-event types have no balance). */
export const paidLeaveLeft = (balances: { name: string; label?: string; available: number }[]) => balances.filter(b => b.available > 1e-9);

/** "You still have paid leave: 9.5 Annual · 6.5 Casual. …" when the rule is "only once paid leave is used up". */
export const lopProblem = (rule: LopRule, balances: { name: string; available: number }[]) => {
    if (rule === 'ANY_TIME') return null;
    const left = paidLeaveLeft(balances);
    if (!left.length) return null;
    return `You still have paid leave: ${left.map(b => `${fmtDays(b.available)} ${b.name}`).join(' · ')}. Loss of pay is only once all of it is used up.`;
};

/**
 * A loss-of-pay request: dates · half days · working days only · overlap with other leave · the LOP rule · reason. No
 * balance and no limit. Same approvers as leave.
 */
export const validateLop = (
    input: { start?: string; end?: string; half?: LeaveHalf | null; reason?: string },
    ctx: { cal: WorkCalendar; halfDayAllowed: boolean; existing: ExistingLeave[]; rule: LopRule; balances: { name: string; available: number }[] }
) => {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!iso.test(input.start ?? '')) throw new RuleError(LEAVE_MESSAGES.date, 400);
    const start = input.start!;
    const end = input.end || start;
    if (!iso.test(end)) throw new RuleError(LEAVE_MESSAGES.date, 400);
    const half = input.half === 'FIRST' || input.half === 'SECOND' ? input.half : null;
    if (half && !ctx.halfDayAllowed) throw new RuleError(LEAVE_MESSAGES.halfOff, 400);
    if (end < start) throw new RuleError(LEAVE_MESSAGES.endBeforeStart, 400);
    const count = countLeaveDays(start, end, half, ctx.cal, 'OFF');
    if (!count.working) throw new RuleError(LEAVE_MESSAGES.noWorkingDays, 400);
    const clash = ctx.existing.find(x => leavesClash(x, { start, end, half }));
    if (clash) throw new RuleError(LEAVE_MESSAGES.overlap(clash.summary), 409);
    const problem = lopProblem(ctx.rule, ctx.balances);
    if (problem) throw new RuleError(problem, 409);
    const reason = input.reason?.trim() ?? '';
    if (!reason) throw new RuleError(LEAVE_MESSAGES.reason, 400);
    return { type: LOP, lop: true as const, start, end, half, days: count.days, reason };
};

// ---- endorsement for longer leave (PROTOTYPE-SETUP: Leave policy settings) ----------------------------------------

/** Does a leave request of this many days need the extra endorsement step? */
export const needsEndorsement = (cfg: { enabled: boolean; overDays: number } | undefined, days: number) => Boolean(cfg?.enabled && days > cfg.overDays + 1e-9);

/**
 * The department head: the person in the department whose own manager is outside it (or who has none). Several such
 * people → the one with the most people in the department reporting to them (directly or further down), then the
 * lowest id. Null for a department with nobody in it.
 */
export const departmentHead = <P extends { id: number; department: string; managerId: number | null }>(people: P[], department: string): P | null => {
    const inDept = people.filter(p => p.department === department);
    const ids = new Set(inDept.map(p => p.id));
    const heads = inDept.filter(p => p.managerId === null || !ids.has(p.managerId));
    if (!heads.length) return null;
    const below = (id: number): number => inDept.filter(p => p.managerId === id).reduce((n, p) => n + 1 + below(p.id), 0);
    return [...heads].sort((a, b) => below(b.id) - below(a.id) || a.id - b.id)[0];
};

/**
 * Adds the endorsement step after level 1 and before level 2 — unless the endorser is the employee, or is the level 1
 * approver. Shown in the chain as "{name} (endorsement)"; it waits in that person's My team → Approvals.
 */
export const withEndorsement = (trail: ApprovalTrail, endorser: { id: number; name: string } | null, employeeId: number): ApprovalTrail => {
    if (!endorser || endorser.id === employeeId) return trail;
    const [l1, ...rest] = trail.steps;
    if (!l1 || l1.level === 2) return trail;
    if (!l1.skipped && l1.role === 'MANAGER' && l1.approverId === endorser.id) return trail;
    const step: ApprovalStep = { level: 1, role: 'MANAGER', approverId: endorser.id, approverName: endorser.name, endorsement: true };
    const steps = [l1, step, ...rest];
    return { ...trail, steps, status: nextStatus(steps) };
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
    // PROTOTYPE-SETUP (Leave module, update): end on the last working day before `from` (not on a weekly off).
    let end = addDays(from, -1);
    while (end > leave.start && recount(end, end, leave.half) === 0) end = addDays(end, -1);
    return { whole: false as const, leave: { ...leave, end, days: recount(leave.start, end, leave.half) } };
};

// ---- past leave: cancelling or changing days already gone --------------------------------------------------------

/** How a company tracks work: check-ins (attendance or both), timesheets only, or neither. */
export type WorkEvidence = 'attendance' | 'timesheet' | 'none';

/** "Tue 10 Nov", "Tue 10 Nov and Wed 11 Nov", "Mon 9 Nov, Tue 10 Nov and Wed 11 Nov" */
export const dayList = (days: string[]) => {
    const names = days.map(shortDate);
    return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

export const PAST_LEAVE_MESSAGES = {
    notWorked: (days: string[], evidence: WorkEvidence) => {
        const list = dayList(days);
        const one = days.length === 1;
        if (evidence === 'attendance')
            return `You didn’t check in on ${list}, so ${one ? 'it stays' : 'they stay'} as leave. If you worked ${one ? 'that day' : 'those days'}, request an attendance correction first, then try again.`;
        if (evidence === 'timesheet')
            return `There are no timesheet entries on ${list}, so ${one ? 'it stays' : 'they stay'} as leave. If you worked ${one ? 'that day' : 'those days'}, log your hours first, then try again.`;
        return `${list} ${one ? 'is' : 'are'} already past and your company doesn’t track attendance, so ask HR to change it.`;
    },
} as const;

/**
 * The past working days (before today) of approved leave that a cancellation or change would take off. A day still
 * fully covered by the new leave isn't taken off; a full day becoming a half day (or the other half) is.
 */
export const removedPastDays = (
    original: { start: string; end: string; half: LeaveHalf | null },
    next: { start: string; end: string; half: LeaveHalf | null } | null,
    today: string,
    cal: WorkCalendar
) => {
    const out: string[] = [];
    for (let d = original.start; d <= original.end && d < today; d = addDays(d, 1)) {
        const covered = Boolean(next && next.start <= d && d <= next.end && (next.half === null || next.half === original.half));
        if (isWorkingDayFor(cal, d) && !covered) out.push(d);
    }
    return out;
};

/**
 * Past leave can only be taken off for days the employee actually worked: a check-in (attendance modes) or timesheet
 * entries (timesheet-only mode) on each past working day being removed. Returns why not, or null. HR isn't limited.
 */
export const pastLeaveProblem = (days: string[], worked: (date: string) => boolean, evidence: WorkEvidence) => {
    const missing = evidence === 'none' ? days : days.filter(d => !worked(d));
    return missing.length ? PAST_LEAVE_MESSAGES.notWorked(missing, evidence) : null;
};

/** Where a cancellation can start: any day of the leave (the whole leave = its first day). */
export const CANCEL_FROM_MESSAGES = {
    outside: 'Pick a date inside the leave.',
    nothing: 'There are no working days left to cancel from that date.',
} as const;

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

/** PROTOTYPE-SETUP (Comp off calendar): a day can be picked in the calendar only if it's a weekly off or public holiday
 *  (on the employee's own schedule), not in the future, inside the expiry window (0 = never expires) and not already
 *  claimed. Working days never can: extra hours on a working day are overtime. Hours worked are checked after picking
 *  (compOffProblem), so a day off with no work can still be picked and is then refused with the reason. */
export const compOffDayAvailable = (d: { date: string; today: string; kind: 'HOLIDAY' | 'WEEKLY_OFF' | 'WORKING'; expiryDays: number; claimed: boolean }) =>
    d.kind !== 'WORKING' && d.date <= d.today && !(d.expiryDays && daysFrom(d.date, d.today) > d.expiryDays) && !d.claimed;

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
        .map((m): Omit<LateDeduction, 'dispute'> => {
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
    const isPerson = (v: string) => approverPersonId(v) !== null || v === 'MANAGER';
    const teamStep = !isPerson(level1) || (level2 !== 'NONE' && !isPerson(level2));
    const personStep = isPerson(level1) || isPerson(level2);
    const mgrLabel = level1 === 'MANAGER' && !(isPerson(level2) && level2 !== 'MANAGER') ? 'With managers' : 'With approvers';
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
    /** PROTOTYPE-SETUP (Leave settings rework): the time now ("HH:mm", company time zone) for the custom credit time. */
    nowTime?: string;
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
    // PROTOTYPE-SETUP (Leave policy settings): per-event types have no yearly balance.
    const types = typesForEmployee(policy, facts.gender).filter(t => !isEventType(t));
    const rounding = policy.rounding ?? 'NONE';
    // Daily credits follow the credit date: today's lands at the start of the day / once it's over / from the set time.
    const todayCounts = dailyCreditToday(policy.creditDate, input.nowTime ?? '23:59', policy.creditTime);
    const inYear = (l: { start: string; end: string }) => l.end >= year.start && l.start <= year.end;
    const sumOf = (type: string, state: 'approved' | 'in_request') =>
        input.leave.filter(l => l.type === type && l.state === state && (type === COMP_OFF || inYear(l))).reduce((s, l) => s + l.days, 0);
    const onProbation = facts.status === 'PROBATION';

    const base = types.map(t => {
        const raw = creditSchedule(t, year, facts, { creditDate: policy.creditDate, creditDay: policy.creditDay });
        // PROTOTYPE-SETUP (Leave policy settings): rounding applies to credited-so-far and the year's total.
        const sched = { ...raw, entitlement: roundDays(raw.entitlement, rounding), credits: raw.daily ? raw.credits : roundCredits(raw.credits, rounding) };
        const ledger: LedgerEntry[] = [];
        let carried = 0;
        if (facts.dateOfJoin < year.start) {
            // The year-end rule of the type: carried forward (up to the limit), encashed or lapsed.
            ({ carried } = yearEndRule(input.opening[t.id] ?? 0, t));
            ledger.push(...yearEndLedger(year.start, input.opening[t.id] ?? 0, t));
        }
        if (sched.daily) {
            const { amountOf, months } = sched.daily;
            months.forEach(m => {
                if (m.start > asOf) return;
                const amount = m.end < asOf || (m.end === asOf && todayCounts) ? amountOf(m) : creditedBy({ ...sched, daily: { amountOf, months: [m] } }, t, asOf, year, facts.dateOfJoin, todayCounts);
                if (amount > 0) ledger.push({ date: m.end <= asOf ? m.end : asOf, kind: 'DAILY', amount, text: `Daily accrual, ${monthName(m.start)}${m.end > asOf ? ' so far' : ''}` });
            });
        } else sched.credits.filter(c => c.date <= asOf).forEach(c => ledger.push({ date: c.date, kind: c.kind, amount: c.amount, text: c.text }));
        input.leave
            .filter(l => l.type === t.id && l.state === 'approved' && inYear(l))
            .forEach(l => ledger.push({ date: l.start, kind: 'TAKEN', amount: -l.days, text: takenText(l) }));
        const credited = carried + (sched.daily ? roundDays(creditedBy(sched, t, asOf, year, facts.dateOfJoin, todayCounts), rounding) : creditedBy(sched, t, asOf, year, facts.dateOfJoin));
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
            carryForward: b.t.carryForward,
            next: b.next,
            expiring: null as { date: string; amount: number } | null,
            notAvailable: onProbation && b.t.probation === 'NONE',
            ledger: b.ledger.sort((x, y) => y.date.localeCompare(x.date)),
            entitlement: b.entitlement,
            exitOpts: b.t.exitOpts,
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
            carryForward: 0,
            next: null,
            expiring: co.expiring,
            notAvailable: false,
            ledger,
            entitlement: co.earned,
            exitOpts: ['encash'] as LeaveExitOpt[],
        });
    }

    const exit = facts.exitDate && facts.exitDate >= year.start && facts.exitDate <= year.end ? facts.exitDate : null;
    const settlement = exit
        ? balances
              .filter(b => b.type !== COMP_OFF)
              .map(b => ({ type: b.type, name: b.name, ...exitSettlement({ earned: b.entitlement + b.carried, approved: b.approved, late: b.late }, b.exitOpts) }))
        : null;

    return { year, asOf, balances, lateDeductions: late.deductions, lossOfPay: late.lossOfPay, settlement };
};

export { maxIso, minIso };
