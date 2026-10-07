// PROTOTYPE-SETUP: monthly payroll ledger for Acme Technologies, derived from the MASTER employee salary
// breakup so every salary/payslip/report screen tells the same story.
//
// STORY (all relative to today)
//   - Payroll has run every month since each employee joined; every past month is PAID.
//   - The current month is the open run: every employee (incl. the new joiner and the one on notice) is
//     PENDING processing.
//   - A joining month is pro-rated by days worked (e.g. joined on the 20th → 12/31 of the month).
//   - Annual increment 6 months ago for 4 people: before it they were on the older (lower) CTC.
//   - Diwali bonus (₹10,000) for everyone on the rolls in October.
//   - Sales incentives last month for ACME-009 and ACME-011 (and an earlier one for ACME-009).
import { toIsoDate, today } from './dates';
import { EMPLOYEES, MockEmployee, SalaryBreakup, salaryFromMonthlyCtc } from './employees';

const round = (n: number) => Math.round(n);
const pad = (n: number) => String(n).padStart(2, '0');

export const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];

// ---- calendar helpers ----------------------------------------------------------------------------------

export interface PayrollMonth {
    /** 0 = current month, 1 = last month, ... */
    offset: number;
    year: number;
    /** 1-12 */
    month: number;
    daysInMonth: number;
    start: string;
    end: string;
}

export const payrollMonth = (offset: number): PayrollMonth => {
    const now = today();
    const first = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    return {
        offset,
        year: first.getFullYear(),
        month: first.getMonth() + 1,
        daysInMonth: last.getDate(),
        start: toIsoDate(first),
        end: toIsoDate(last),
    };
};

/** Offset of a (year, month 1-12) pair from the current month; negative for future months. */
export const offsetOf = (year: number | string | undefined, month: number | string | undefined) => {
    const now = today();
    const y = Number(year) || now.getFullYear();
    const m = Number(month) || now.getMonth() + 1;
    return now.getFullYear() * 12 + (now.getMonth() + 1) - (y * 12 + m);
};

/** Last weekday of the month — salaries are credited on the last working day. */
const lastWorkingDay = (pm: PayrollMonth) => {
    const d = new Date(pm.year, pm.month - 1, pm.daysInMonth);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d;
};

const atTime = (d: Date, time: string) => `${toIsoDate(d)}T${time}.000Z`;

// ---- one-offs ------------------------------------------------------------------------------------------

/** Annual increment, effective `INCREMENT_OFFSET` months ago (percentage over the previous CTC). */
export const INCREMENT_OFFSET = 6;
export const INCREMENTS: Record<string, number> = {
    'ACME-002': 0.1,
    'ACME-007': 0.12,
    'ACME-009': 0.08,
    'ACME-017': 0.1,
};

/** Diwali bonus is paid with the most recent October salary before the current month. */
export const DIWALI_OFFSET = (() => {
    const m = today().getMonth() + 1;
    return (m - 10 + 12) % 12 || 12;
})();
export const DIWALI_BONUS = 10000;

export interface IncentiveSeed {
    employeeCode: string;
    offset: number;
    amount: number;
    monthlyTarget: number;
    achievedTarget: number;
}

export const INCENTIVES: IncentiveSeed[] = [
    { employeeCode: 'ACME-009', offset: 1, amount: 12500, monthlyTarget: 1500000, achievedTarget: 1875000 },
    { employeeCode: 'ACME-011', offset: 1, amount: 8000, monthlyTarget: 600000, achievedTarget: 760000 },
    { employeeCode: 'ACME-009', offset: 4, amount: 9000, monthlyTarget: 1500000, achievedTarget: 1680000 },
];

// ---- per-employee helpers ------------------------------------------------------------------------------

/** Months since the employee joined (0 = joined this month). */
export const joinedOffset = (e: MockEmployee) => {
    const [y, m] = e.dateOfJoin.split('-').map(Number);
    return offsetOf(y, m);
};

export const isOnRollsIn = (e: MockEmployee, offset: number) => offset >= 0 && joinedOffset(e) >= offset;

/** Monthly CTC in force for that month (the 4 increment people were on a lower CTC before it). */
export const ctcAt = (e: MockEmployee, offset: number) => {
    const pct = INCREMENTS[e.employeeId];
    if (!pct || offset <= INCREMENT_OFFSET) return e.salary.monthlyCtc;
    return round(e.salary.monthlyCtc / (1 + pct) / 500) * 500;
};

const prorate = (s: SalaryBreakup, factor: number): SalaryBreakup => {
    if (factor >= 1) return s;
    const basic = round(s.basic * factor);
    const hra = round(s.hra * factor);
    const conveyance = round(s.conveyance * factor);
    const medical = round(s.medical * factor);
    const specialAllowance = round(s.specialAllowance * factor);
    const employerPf = Math.min(round(basic * 0.12), 1800);
    const grossEarnings = basic + hra + conveyance + medical + specialAllowance;
    const employeePf = employerPf;
    const tds = round(s.tds * factor);
    const totalDeductions = employeePf + s.professionalTax + tds;
    return {
        ...s,
        basic,
        hra,
        conveyance,
        medical,
        specialAllowance,
        employerPf,
        grossEarnings,
        employeePf,
        tds,
        totalDeductions,
        netPay: grossEarnings - totalDeductions,
    };
};

// ---- the ledger ----------------------------------------------------------------------------------------

export type LineStatus = 'PAID' | 'PENDING';

export interface PayrollLine {
    salaryId: string;
    employee: MockEmployee;
    pm: PayrollMonth;
    breakup: SalaryBreakup;
    /** Days actually paid (pro-rated joining month). */
    paidDays: number;
    bonus: number;
    incentive: number;
    /** Earnings incl. one-offs. */
    gross: number;
    deductions: number;
    netPayable: number;
    status: LineStatus;
    payingDate: string | null;
    processedOn: string | null;
}

export const salaryIdFor = (e: MockEmployee, pm: PayrollMonth) => `sal-${e.id}-${pm.year}${pad(pm.month)}`;

const buildLine = (e: MockEmployee, offset: number): PayrollLine => {
    const pm = payrollMonth(offset);
    let paidDays = pm.daysInMonth;
    if (joinedOffset(e) === offset) {
        const joinDay = Number(e.dateOfJoin.split('-')[2]);
        paidDays = pm.daysInMonth - joinDay + 1;
    }
    const breakup = prorate(salaryFromMonthlyCtc(ctcAt(e, offset)), paidDays / pm.daysInMonth);
    const bonus = offset === DIWALI_OFFSET ? DIWALI_BONUS : 0;
    const incentive = INCENTIVES.filter(i => i.employeeCode === e.employeeId && i.offset === offset).reduce(
        (sum, i) => sum + i.amount,
        0
    );
    const gross = breakup.grossEarnings + bonus + incentive;
    const deductions = breakup.totalDeductions;
    const paid = offset >= 1;
    const payDay = lastWorkingDay(pm);
    const processed = new Date(payDay);
    processed.setDate(processed.getDate() - 2);
    return {
        salaryId: salaryIdFor(e, pm),
        employee: e,
        pm,
        breakup,
        paidDays,
        bonus,
        incentive,
        gross,
        deductions,
        netPayable: gross - deductions,
        status: paid ? 'PAID' : 'PENDING',
        payingDate: paid ? atTime(payDay, '10:30:00') : null,
        processedOn: paid ? atTime(processed, '11:00:00') : null,
    };
};

/** How far back the ledger goes: the earliest joiner's first month. */
export const HISTORY_MONTHS = Math.max(...EMPLOYEES.map(joinedOffset));

const LEDGER: PayrollLine[][] = Array.from({ length: HISTORY_MONTHS + 1 }, (_, offset) =>
    EMPLOYEES.filter(e => isOnRollsIn(e, offset)).map(e => buildLine(e, offset))
);

/** All payroll lines of a month (empty for future months or before the company's first payroll). */
export const linesForOffset = (offset: number): PayrollLine[] => LEDGER[offset] ?? [];

export const linesFor = (year: number | string | undefined, month: number | string | undefined) =>
    linesForOffset(offsetOf(year, month));

/** Every month of the given calendar year that has payroll, oldest first. */
export const offsetsInYear = (year: number | string | undefined) =>
    Array.from({ length: 12 }, (_, i) => offsetOf(year, i + 1)).filter(o => linesForOffset(o).length > 0);

export const linesForEmployee = (e: MockEmployee) =>
    LEDGER.map(lines => lines.find(l => l.employee.id === e.id)).filter((l): l is PayrollLine => Boolean(l));

export const findLineBySalaryId = (salaryId: string | undefined) =>
    LEDGER.flat().find(l => l.salaryId === salaryId);

export interface MonthTotals {
    employees: number;
    gross: number;
    deductions: number;
    netPayable: number;
    employerPf: number;
}

export const monthTotals = (lines: PayrollLine[]): MonthTotals =>
    lines.reduce(
        (acc, l) => ({
            employees: acc.employees + 1,
            gross: acc.gross + l.gross,
            deductions: acc.deductions + l.deductions,
            netPayable: acc.netPayable + l.netPayable,
            employerPf: acc.employerPf + l.breakup.employerPf,
        }),
        { employees: 0, gross: 0, deductions: 0, netPayable: 0, employerPf: 0 }
    );

/** Rupee formatting for generated documents (PDF/Excel) — ASCII only. */
export const inr = (n: number) => `INR ${round(n).toLocaleString('en-IN')}`;

export const monthLabel = (pm: Pick<PayrollMonth, 'year' | 'month'>) => `${MONTH_NAMES[pm.month - 1]} ${pm.year}`;

/** Indian financial year label (April–March) for a month, e.g. "2026-27". */
export const financialYearOf = (year: number, month: number) => {
    const start = month >= 4 ? year : year - 1;
    return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};
