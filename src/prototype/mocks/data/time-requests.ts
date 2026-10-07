// PROTOTYPE-SETUP: employee requests HR handles — reimbursement claims, company announcements, document
// requests and profile-update requests. Admin lists and the ESS views read the same records.
import { COMPANY } from './company';
import { daysFromToday } from './dates';
import { MockEmployee, findEmployee } from './employees';
import { HOLIDAYS, todayIso, workingDayOffset } from './time-calendar';
import { managerEmailOf } from './time-leaves';

// ---- reimbursements --------------------------------------------------------------------------------------

export type ReimbursementStatus = 'requestedByEmployee' | 'approved' | 'rejected' | 'cancelledByEmployee';
export type ReimbursementPaymentStatus = 'UNPAID' | 'APPROVED' | 'PAID' | 'REJECTED';

export interface MockReimbursement {
    id: string;
    employee: MockEmployee;
    expenseDate: string;
    category: 'Travel' | 'Internet' | 'Meals' | 'Fuel' | 'Equipment';
    expenseDetails: string;
    totalPay: number;
    transferMethod: string;
    /** Employee-submission lifecycle (ESS). */
    status: ReimbursementStatus;
    paymentStatus: ReimbursementPaymentStatus;
    supportingDocs: string;
    createdAt: string;
    updatedAt: string;
}

interface ReimbursementSeed {
    code: string;
    offset: number;
    category: MockReimbursement['category'];
    details: string;
    amount: number;
    status: ReimbursementStatus;
}

const SEEDS: ReimbursementSeed[] = [
    { code: 'ACME-004', offset: -2, category: 'Internet', details: 'Home broadband – ACT Fibernet (monthly WFH allowance)', amount: 1179, status: 'requestedByEmployee' },
    { code: 'ACME-004', offset: -24, category: 'Travel', details: 'Cab to client office, Whitefield – sprint review', amount: 864, status: 'approved' },
    { code: 'ACME-004', offset: -38, category: 'Meals', details: 'Team lunch after release', amount: 1450, status: 'rejected' },
    { code: 'ACME-001', offset: -4, category: 'Travel', details: 'Flight BLR → BOM for leadership offsite', amount: 8640, status: 'approved' },
    { code: 'ACME-008', offset: -1, category: 'Meals', details: 'Client dinner – Tata Steel procurement team', amount: 3200, status: 'requestedByEmployee' },
    { code: 'ACME-009', offset: -19, category: 'Travel', details: 'Local travel – client visits in Andheri and BKC', amount: 2150, status: 'approved' },
    { code: 'ACME-014', offset: -3, category: 'Fuel', details: 'Fuel for warehouse runs (Bhiwandi)', amount: 1800, status: 'requestedByEmployee' },
    { code: 'ACME-007', offset: -7, category: 'Internet', details: 'Mobile data top-up during on-call week', amount: 999, status: 'approved' },
    { code: 'ACME-020', offset: -21, category: 'Travel', details: 'Train tickets – campus hiring drive, Pune', amount: 1250, status: 'approved' },
    { code: 'ACME-005', offset: -9, category: 'Meals', details: 'Late-night dinner during release', amount: 650, status: 'cancelledByEmployee' },
    { code: 'ACME-002', offset: -2, category: 'Equipment', details: 'USB-C dock for the office monitor', amount: 4599, status: 'requestedByEmployee' },
];

/** Paid with the payroll of the month after the expense; approved claims this month are still awaiting it. */
const paymentStatusOf = (status: ReimbursementStatus, expenseDate: string): ReimbursementPaymentStatus => {
    if (status === 'rejected') return 'REJECTED';
    if (status !== 'approved') return 'UNPAID';
    return expenseDate.slice(0, 7) < todayIso().slice(0, 7) ? 'PAID' : 'APPROVED';
};

export const REIMBURSEMENTS: MockReimbursement[] = SEEDS.map((seed, i) => {
    const employee = findEmployee(seed.code)!;
    const expenseDate = workingDayOffset(todayIso(), seed.offset);
    const created = `${expenseDate}T12:40:00.000Z`;
    return {
        id: `rb-${String(i + 1).padStart(3, '0')}`,
        employee,
        expenseDate,
        category: seed.category,
        expenseDetails: seed.details,
        totalPay: seed.amount,
        transferMethod: 'With Salary',
        status: seed.status,
        paymentStatus: paymentStatusOf(seed.status, expenseDate),
        supportingDocs: `https://files.${COMPANY.emailDomain}/receipts/rb-${String(i + 1).padStart(3, '0')}.pdf`,
        createdAt: created,
        updatedAt: created,
    };
}).sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));

export const reimbursementsOf = (employee: MockEmployee) =>
    REIMBURSEMENTS.filter(r => r.employee.id === employee.id);

export const findReimbursement = (id: string | undefined) => REIMBURSEMENTS.find(r => r.id === id);

export const reimbursementManagerEmail = (r: MockReimbursement) => managerEmailOf(r.employee);

// ---- announcements ---------------------------------------------------------------------------------------

export interface MockAnnouncement {
    id: string;
    subject: string;
    details: string;
    status: 'PENDING' | 'MAILED';
    createdAt: string;
    excludedEmployeeCodes: string[];
}

const nextPublicHoliday = HOLIDAYS.find(h => h.category === 'public' && h.date > todayIso());
const longDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

export const ANNOUNCEMENTS: MockAnnouncement[] = [
    {
        id: 'ann-004',
        subject: nextPublicHoliday ? `Office closed: ${nextPublicHoliday.title}` : 'Holiday calendar published',
        details: nextPublicHoliday
            ? `Both the Bengaluru and Mumbai offices will remain closed on ${longDate(nextPublicHoliday.date)} for ${nextPublicHoliday.title}. Please plan deliverables and on-call cover accordingly.`
            : 'The holiday calendar for next year is now available under Leaves → Public Holidays.',
        status: 'MAILED',
        createdAt: `${daysFromToday(-1)}T04:30:00.000Z`,
        excludedEmployeeCodes: [],
    },
    {
        id: 'ann-003',
        subject: 'Q3 Town Hall – Friday, 4:00 PM',
        details: 'Join the leadership team for the quarterly town hall: business update, Q3 wins and the hiring plan. Bengaluru: Cafeteria, 4th floor. Mumbai: Board room. Teams link in the calendar invite.',
        status: 'MAILED',
        createdAt: `${daysFromToday(-6)}T05:00:00.000Z`,
        excludedEmployeeCodes: [],
    },
    {
        id: 'ann-002',
        subject: 'Revised hybrid work policy',
        details: 'From next month, teams work from office on Tuesdays, Wednesdays and Thursdays. Monday and Friday are flexible (WFH allowed with manager approval in ESS). The full policy is in the Employee Handbook.',
        status: 'MAILED',
        createdAt: `${daysFromToday(-15)}T06:15:00.000Z`,
        excludedEmployeeCodes: [],
    },
    {
        id: 'ann-001',
        subject: 'Group health insurance – top-up enrolment open',
        details: 'You can now add parents to the group mediclaim policy (₹5 lakh top-up) at a subsidised premium deducted from salary. Enrol via HR by the 25th of this month.',
        status: 'MAILED',
        createdAt: `${daysFromToday(-28)}T07:45:00.000Z`,
        excludedEmployeeCodes: ['ACME-010'],
    },
];