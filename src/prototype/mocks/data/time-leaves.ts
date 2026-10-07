// PROTOTYPE-SETUP: leave policy + leave applications for Acme's 20 employees. One source for both the admin
// Payroll views (Leaves tab, leave requests, leave summary) and the ESS views (balance, my requests), so a
// person's leaves and balances read identically everywhere. Attendance marks approved leave days from here.
import { COMPANY } from './company';
import { MockEmployee, findEmployee, managerOf } from './employees';
import {
    currentYear,
    parseIsoDate,
    todayIso,
    workingDayOffset,
    workingDaysFrom,
} from './time-calendar';

export type LeaveTypeKey = 'casual' | 'sick' | 'earned' | 'maternity' | 'paternity';
export type LeaveStatus = 'applied' | 'approved' | 'rejected' | 'cancelledByEmployee';
export type HalfDay = 'FIRST_HALF' | 'SECOND_HALF';

export interface MockLeaveType {
    id: string;
    key: LeaveTypeKey;
    name: string;
    accrualType: 'FIXED' | 'MONTHLY';
    accrualRate: string;
    maximumAccrual: string;
    leaveBalanceCarryover: 'ALLOWED' | 'NOT_ALLOWED';
    /** Annual entitlement (days). */
    maximumNumberOfLeaves: number;
    applicableGender: 'ALL' | 'MALE' | 'FEMALE';
    createdAt: string;
}

const POLICY_CREATED = `${currentYear() - 3}-04-01T10:00:00.000Z`;

export const LEAVE_TYPES: MockLeaveType[] = [
    { id: 'lt-casual', key: 'casual', name: 'Casual Leave', accrualType: 'FIXED', accrualRate: '', maximumAccrual: '', leaveBalanceCarryover: 'NOT_ALLOWED', maximumNumberOfLeaves: 12, applicableGender: 'ALL', createdAt: POLICY_CREATED },
    { id: 'lt-sick', key: 'sick', name: 'Sick Leave', accrualType: 'FIXED', accrualRate: '', maximumAccrual: '', leaveBalanceCarryover: 'NOT_ALLOWED', maximumNumberOfLeaves: 12, applicableGender: 'ALL', createdAt: POLICY_CREATED },
    { id: 'lt-earned', key: 'earned', name: 'Earned Leave', accrualType: 'MONTHLY', accrualRate: '1.5', maximumAccrual: '45', leaveBalanceCarryover: 'ALLOWED', maximumNumberOfLeaves: 18, applicableGender: 'ALL', createdAt: POLICY_CREATED },
    { id: 'lt-maternity', key: 'maternity', name: 'Maternity Leave', accrualType: 'FIXED', accrualRate: '', maximumAccrual: '', leaveBalanceCarryover: 'NOT_ALLOWED', maximumNumberOfLeaves: 182, applicableGender: 'FEMALE', createdAt: POLICY_CREATED },
    { id: 'lt-paternity', key: 'paternity', name: 'Paternity Leave', accrualType: 'FIXED', accrualRate: '', maximumAccrual: '', leaveBalanceCarryover: 'NOT_ALLOWED', maximumNumberOfLeaves: 5, applicableGender: 'MALE', createdAt: POLICY_CREATED },
];

export const leaveTypeByKey = (key: LeaveTypeKey) => LEAVE_TYPES.find(t => t.key === key)!;
export const leaveTypeById = (id: string | undefined) => LEAVE_TYPES.find(t => t.id === id);

export const UNPAID_LEAVE = { id: 'UNPAID', name: 'Unpaid Leave' };

export const leaveTypesFor = (employee: MockEmployee) =>
    LEAVE_TYPES.filter(
        t =>
            t.applicableGender === 'ALL' ||
            (t.applicableGender === 'MALE' && employee.gender === 'Male') ||
            (t.applicableGender === 'FEMALE' && employee.gender === 'Female')
    );

// ---- leave applications ---------------------------------------------------------------------------------

export interface MockLeave {
    id: string;
    employee: MockEmployee;
    type: MockLeaveType;
    start: string;
    end: string;
    /** Every working day the leave covers. */
    days: string[];
    leaveCount: number;
    halfDaySelection: HalfDay | null;
    status: LeaveStatus;
    reason: string;
    /** ISO timestamp the request was raised. */
    createdAt: string;
    updatedAt: string;
    reviewNote: string | null;
}

interface LeaveSeed {
    code: string;
    type: LeaveTypeKey;
    /** Working-day offset of the first leave day from today (negative = past). */
    offset: number;
    days: number;
    status: LeaveStatus;
    reason: string;
    half?: HalfDay;
    note?: string;
}

// Story: Sneha (ESS persona) has a pending casual leave plus a history; Arjun's Engineering team has a
// couple more requests waiting for him. Approved leaves inside the last two months show up as on-leave
// days in attendance.
const SEEDS: LeaveSeed[] = [
    // ---- pending approval ----
    { code: 'ACME-004', type: 'casual', offset: 6, days: 2, status: 'applied', reason: "Cousin's wedding in Chennai" },
    { code: 'ACME-005', type: 'earned', offset: 12, days: 3, status: 'applied', reason: 'Family trip to Coorg' },
    { code: 'ACME-007', type: 'casual', offset: 4, days: 0.5, status: 'applied', reason: 'Bank appointment for home loan paperwork', half: 'SECOND_HALF' },
    { code: 'ACME-013', type: 'casual', offset: 4, days: 1, status: 'applied', reason: 'Personal work' },
    { code: 'ACME-020', type: 'earned', offset: 15, days: 2, status: 'applied', reason: 'Visiting parents in Lucknow' },
    // ---- approved, upcoming ----
    { code: 'ACME-003', type: 'earned', offset: 8, days: 5, status: 'approved', reason: 'Vacation – Himachal Pradesh', note: 'Approved. Please hand over the release checklist to Priya.' },
    { code: 'ACME-008', type: 'casual', offset: 3, days: 1, status: 'approved', reason: "Child's school annual day" },
    // ---- approved, within the attendance window ----
    { code: 'ACME-004', type: 'sick', offset: -14, days: 1, status: 'approved', reason: 'Fever and cold' },
    { code: 'ACME-002', type: 'earned', offset: -20, days: 3, status: 'approved', reason: 'Onam with family in Kochi' },
    { code: 'ACME-009', type: 'casual', offset: -8, days: 1, status: 'approved', reason: 'Vehicle registration at RTO' },
    { code: 'ACME-017', type: 'sick', offset: -3, days: 2, status: 'approved', reason: 'Viral infection – doctor advised rest' },
    { code: 'ACME-007', type: 'casual', offset: -27, days: 0.5, status: 'approved', reason: 'Parent-teacher meeting', half: 'FIRST_HALF' },
    { code: 'ACME-012', type: 'earned', offset: -11, days: 2, status: 'approved', reason: 'Family function in Ahmedabad' },
    { code: 'ACME-019', type: 'casual', offset: -2, days: 1, status: 'approved', reason: 'Moving to a new flat' },
    { code: 'ACME-015', type: 'sick', offset: -1, days: 1, status: 'approved', reason: 'Migraine' },
    // ---- older history ----
    { code: 'ACME-004', type: 'casual', offset: -60, days: 2, status: 'approved', reason: 'Family visit to Mysuru' },
    { code: 'ACME-004', type: 'earned', offset: -95, days: 3, status: 'approved', reason: 'Trip to Goa with friends' },
    { code: 'ACME-004', type: 'sick', offset: -80, days: 2, status: 'approved', reason: 'Dental surgery' },
    { code: 'ACME-004', type: 'casual', offset: -40, days: 1, status: 'cancelledByEmployee', reason: 'Personal errand' },
    { code: 'ACME-001', type: 'earned', offset: -32, days: 2, status: 'approved', reason: 'Long weekend with family' },
    // PROTOTYPE-SETUP: ESS - Manager persona (Arjun Mehta) gets a full ESS leave history of his own.
    { code: 'ACME-001', type: 'earned', offset: 18, days: 3, status: 'applied', reason: 'Annual family vacation – Munnar' },
    { code: 'ACME-001', type: 'sick', offset: -6, days: 1, status: 'approved', reason: 'Migraine' },
    { code: 'ACME-001', type: 'casual', offset: -75, days: 1, status: 'approved', reason: "Daughter's school admission interview" },
    { code: 'ACME-001', type: 'casual', offset: -110, days: 2, status: 'approved', reason: 'Housewarming in Pune' },
    { code: 'ACME-005', type: 'sick', offset: -45, days: 1, status: 'approved', reason: 'Food poisoning' },
    { code: 'ACME-016', type: 'earned', offset: -70, days: 4, status: 'approved', reason: 'Summer vacation – Shimla' },
    { code: 'ACME-018', type: 'casual', offset: -50, days: 1, status: 'approved', reason: 'Personal work' },
    { code: 'ACME-014', type: 'sick', offset: -38, days: 2, status: 'approved', reason: 'Back pain – physiotherapy' },
    { code: 'ACME-006', type: 'casual', offset: -55, days: 1, status: 'approved', reason: 'Sister’s graduation ceremony' },
    // ---- rejected ----
    { code: 'ACME-005', type: 'casual', offset: -18, days: 1, status: 'rejected', reason: 'Personal work', note: 'Release week – please pick another date.' },
    { code: 'ACME-011', type: 'earned', offset: -25, days: 2, status: 'rejected', reason: 'Short break', note: 'Quarter-end targets – can we move this to next month?' },
];

const isoTimestamp = (iso: string, time = '10:15:00') => `${iso}T${time}.000Z`;

const buildLeave = (seed: LeaveSeed, index: number): MockLeave | null => {
    const employee = findEmployee(seed.code);
    if (!employee) return null;
    const start = workingDayOffset(todayIso(), seed.offset);
    if (start < employee.dateOfJoin) return null;
    const days = workingDaysFrom(start, Math.ceil(seed.days));
    // Sick leave is raised the same day; planned leave about a week ahead (or 2 days ago for future ones).
    const appliedOn =
        seed.type === 'sick'
            ? start
            : workingDayOffset(seed.offset > 0 ? todayIso() : start, seed.offset > 0 ? -(2 + (index % 3)) : -5);
    const reviewedOn = seed.status === 'applied' ? appliedOn : workingDayOffset(appliedOn, 1);
    return {
        id: `lv-${String(index + 1).padStart(3, '0')}`,
        employee,
        type: leaveTypeByKey(seed.type),
        start,
        end: days[days.length - 1],
        days,
        leaveCount: seed.days,
        halfDaySelection: seed.half ?? null,
        status: seed.status,
        reason: seed.reason,
        createdAt: isoTimestamp(appliedOn, '04:45:00'),
        updatedAt: isoTimestamp(reviewedOn > todayIso() ? todayIso() : reviewedOn, '06:20:00'),
        reviewNote: seed.note ?? null,
    };
};

/** Every leave application, newest request first. */
export const LEAVES: MockLeave[] = SEEDS.map(buildLeave)
    .filter((l): l is MockLeave => l !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.start.localeCompare(a.start));

export const leavesOf = (employee: MockEmployee) => LEAVES.filter(l => l.employee.id === employee.id);

export const findLeave = (id: string | undefined) => LEAVES.find(l => l.id === id);

/** Approved leave covering `date` for this employee (full or half day). */
export const approvedLeaveOn = (employee: MockEmployee, date: string) =>
    LEAVES.find(l => l.employee.id === employee.id && l.status === 'approved' && l.days.includes(date));

// ---- balances --------------------------------------------------------------------------------------------

const roundHalf = (n: number) => Math.round(n * 2) / 2;

/** Months of the current year the employee has been with Acme (fractional months ignored). */
const monthsServedThisYear = (employee: MockEmployee) => {
    const join = parseIsoDate(employee.dateOfJoin);
    const now = parseIsoDate(todayIso());
    const startMonth = join.getFullYear() < now.getFullYear() ? 0 : join.getMonth();
    return { startMonth, completed: Math.max(0, now.getMonth() - startMonth) };
};

/** Carry-forward of unused earned leave from last year (Earned Leave is the only carry-over type). */
export const carryOverOf = (employee: MockEmployee, type: MockLeaveType) => {
    if (type.leaveBalanceCarryover !== 'ALLOWED') return 0;
    const joinedBeforeThisYear = parseIsoDate(employee.dateOfJoin).getFullYear() < currentYear();
    return joinedBeforeThisYear ? 3 + (employee.id % 7) : 0;
};

/** Entitlement for the current year, pro-rated for people who joined this year. */
export const entitlementOf = (employee: MockEmployee, type: MockLeaveType) => {
    if (!leaveTypesFor(employee).includes(type)) return 0;
    const { startMonth, completed } = monthsServedThisYear(employee);
    if (type.key === 'earned') return roundHalf(1.5 * completed) + carryOverOf(employee, type);
    if (type.key === 'casual' || type.key === 'sick') {
        return roundHalf((type.maximumNumberOfLeaves * (12 - startMonth)) / 12);
    }
    return type.maximumNumberOfLeaves;
};

/** Approved leave of this type taken (or booked) in the current year. */
export const takenOf = (employee: MockEmployee, type: MockLeaveType) =>
    leavesOf(employee)
        .filter(l => l.type.id === type.id && l.status === 'approved' && l.start.startsWith(String(currentYear())))
        .reduce((sum, l) => sum + l.leaveCount, 0);

export const balanceOf = (employee: MockEmployee, type: MockLeaveType) =>
    Math.max(0, entitlementOf(employee, type) - takenOf(employee, type));

export const managerEmailOf = (employee: MockEmployee) =>
    managerOf(employee)?.email ?? `hr@${COMPANY.emailDomain}`;
