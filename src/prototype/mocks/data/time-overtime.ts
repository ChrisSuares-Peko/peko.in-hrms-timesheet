// PROTOTYPE-SETUP: overtime requests. Shared by the admin Timesheet → Overtime tab, the employee salary
// profile's overtime list and the ESS Attendance → Overtime tab; attendance extends the check-out time on
// these dates so the hours agree.
import { MockEmployee, findEmployee } from './employees';
import { todayIso, workingDayOffset } from './time-calendar';

export type OvertimeStatus = 'requestedByEmployee' | 'approved' | 'rejected' | 'cancelledByEmployee';

export interface MockOvertime {
    id: string;
    employee: MockEmployee;
    /** YYYY-MM-DD */
    date: string;
    extraHours: number;
    /** Multiplier on the hourly rate. */
    overTimeRate: number;
    hourlyRate: number;
    overTimeAmount: number;
    totalWorkingHours: number;
    status: OvertimeStatus;
    paymentStatus: 'PAID' | 'UNPAID';
    notes: string;
    createdAt: string;
    updatedAt: string;
}

interface OvertimeSeed {
    code: string;
    offset: number;
    hours: number;
    status: OvertimeStatus;
    notes: string;
}

const SEEDS: OvertimeSeed[] = [
    { code: 'ACME-004', offset: -5, hours: 2, status: 'requestedByEmployee', notes: 'Production hotfix for the payments release' },
    { code: 'ACME-004', offset: -26, hours: 3, status: 'approved', notes: 'Month-end data migration support' },
    { code: 'ACME-007', offset: -3, hours: 2.5, status: 'requestedByEmployee', notes: 'Kubernetes cluster upgrade maintenance window' },
    { code: 'ACME-005', offset: -10, hours: 2, status: 'approved', notes: 'Sprint demo preparation' },
    { code: 'ACME-014', offset: -7, hours: 3, status: 'approved', notes: 'Quarterly warehouse stock audit' },
    { code: 'ACME-003', offset: -12, hours: 1.5, status: 'rejected', notes: 'Code review backlog' },
    { code: 'ACME-013', offset: -20, hours: 2, status: 'cancelledByEmployee', notes: 'Vendor onboarding calls' },
    { code: 'ACME-009', offset: -15, hours: 2, status: 'approved', notes: 'Client RFP submission deadline' },
    // PROTOTYPE-SETUP: overtime for the ESS - Manager persona (Arjun Mehta).
    { code: 'ACME-001', offset: -2, hours: 2, status: 'requestedByEmployee', notes: 'Incident bridge – payments gateway outage' },
    { code: 'ACME-001', offset: -22, hours: 3, status: 'approved', notes: 'Weekend production cut-over for v4.2' },
];

/** Hourly rate derived from monthly gross (30 days × 8 hours). */
export const hourlyRateOf = (employee: MockEmployee) => Math.round(employee.salary.grossEarnings / 30 / 8);

const OT_MULTIPLIER = 1.5;

/** The overtime month whose payroll has already run is marked PAID; everything else is still UNPAID. */
const paidStatus = (date: string, status: OvertimeStatus): 'PAID' | 'UNPAID' =>
    status === 'approved' && date.slice(0, 7) < todayIso().slice(0, 7) ? 'PAID' : 'UNPAID';

export const OVERTIME: MockOvertime[] = SEEDS.map((seed, i) => {
    const employee = findEmployee(seed.code)!;
    const date = workingDayOffset(todayIso(), seed.offset);
    const hourlyRate = hourlyRateOf(employee);
    const created = `${workingDayOffset(date, 1)}T05:30:00.000Z`;
    return {
        id: `ot-${String(i + 1).padStart(3, '0')}`,
        employee,
        date,
        extraHours: seed.hours,
        overTimeRate: OT_MULTIPLIER,
        hourlyRate,
        overTimeAmount: Math.round(seed.hours * hourlyRate * OT_MULTIPLIER),
        totalWorkingHours: 8 + seed.hours,
        status: seed.status,
        paymentStatus: paidStatus(date, seed.status),
        notes: seed.notes,
        createdAt: created,
        updatedAt: created,
    };
})
    .filter(o => o.date >= o.employee.dateOfJoin)
    .sort((a, b) => b.date.localeCompare(a.date));

export const overtimeOf = (employee: MockEmployee) => OVERTIME.filter(o => o.employee.id === employee.id);

/** Overtime logged on a date (any status except cancelled — the late check-out still happened). */
export const overtimeOn = (employee: MockEmployee, date: string) =>
    OVERTIME.find(o => o.employee.id === employee.id && o.date === date && o.status !== 'cancelledByEmployee');

export const findOvertime = (id: string | undefined) => OVERTIME.find(o => o.id === id);
