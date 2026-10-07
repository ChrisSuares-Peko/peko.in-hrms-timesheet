// PROTOTYPE-SETUP: which months' payroll has been processed — those months are locked for timesheet edits
// (view only). Matches the salary ledger (data/salary-payroll.ts): every month before the current one is
// processed and paid, so last month is the most recent locked month; the current month is the open run.
import { today } from './dates';

const MONTH_NAMES = [
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

const currentMonthKey = () => {
    const d = today();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** "2026-09" → "September 2026" */
export const monthLabel = (month: string) => {
    const [y, m] = month.split('-').map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
};

/** Payroll processed for the month of this date (YYYY-MM-DD or YYYY-MM)? */
export const isPayrollProcessed = (isoDateOrMonth: string) => isoDateOrMonth.slice(0, 7) < currentMonthKey();

export const lockFor = (isoDate: string) =>
    isPayrollProcessed(isoDate)
        ? {
              locked: true,
              reason: `Payroll for ${monthLabel(isoDate.slice(0, 7))} has been processed — this day can be viewed but not edited.`,
          }
        : { locked: false };
