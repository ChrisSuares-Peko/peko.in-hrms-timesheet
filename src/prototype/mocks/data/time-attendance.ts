// PROTOTYPE-SETUP: generated attendance for the current and previous month for all 20 employees (never before
// their join date). Mostly on time, some late arrivals, a few WFH and half days, approved leaves shown as
// on-leave, overtime days with a late check-out. Admin Timesheet tabs and the ESS Attendance pages both
// read these same records, plus the attendance disputes and Sneha's deduction log.
import { monthsAgo } from './dates';
import { EMPLOYEES, MockEmployee, findEmployee } from './employees';
import {
    SHIFT_END_MIN,
    SHIFT_START_MIN,
    localDateTime,
    monthBounds,
    seeded,
    todayIso,
    workingDayOffset,
    workingDaysBetween,
} from './time-calendar';
import { approvedLeaveOn } from './time-leaves';
import { overtimeOn } from './time-overtime';

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'on-leave' | 'half-day';
export type DisputeStatus = 'requestedByEmployee' | 'approved' | 'rejected';

export interface MockAttendance {
    id: string;
    employee: MockEmployee;
    /** YYYY-MM-DD */
    date: string;
    /** Local date-time (no zone), or null when not checked in. */
    checkIn: string | null;
    checkOut: string | null;
    status: AttendanceStatus;
    lateMinutes: number;
    totalHours: number;
    otHours: number;
    notes: string | null;
    method: 'ess' | 'manual';
}

/** Grace period (minutes) after shift start before a check-in counts as late — matches HR settings. */
export const GRACE_PERIOD_MINUTES = 10;
const BREAK_HOURS = 1;

/** Attendance is kept from the first of last month up to today. */
export const ATTENDANCE_FROM = monthsAgo(1, 1);

type Override = { status: AttendanceStatus; inMin?: number; wfh?: boolean };

// Persona days are scripted so the ESS demo tells a clear story; everyone else is seeded-random.
const personaOverrides = (employee: MockEmployee): Record<string, Override> => {
    const t = todayIso();
    if (employee.employeeId === 'ACME-004') {
        return {
            [workingDayOffset(t, 0)]: { status: 'present', inMin: SHIFT_START_MIN - 6 },
            [workingDayOffset(t, -9)]: { status: 'late', inMin: SHIFT_START_MIN + 22 },
            [workingDayOffset(t, -23)]: { status: 'late', inMin: SHIFT_START_MIN + 14 },
            [workingDayOffset(t, -6)]: { status: 'present', inMin: SHIFT_START_MIN - 12, wfh: true },
            [workingDayOffset(t, -17)]: { status: 'present', inMin: SHIFT_START_MIN - 3, wfh: true },
        };
    }
    if (employee.employeeId === 'ACME-001') {
        return { [workingDayOffset(t, 0)]: { status: 'present', inMin: SHIFT_START_MIN - 18 } };
    }
    return {};
};

const NO_UNPLANNED_ABSENCE = new Set(['ACME-001', 'ACME-004']);

const round2 = (n: number) => Math.round(n * 100) / 100;

const buildDay = (employee: MockEmployee, date: string, overrides: Record<string, Override>): MockAttendance => {
    const id = `att-${employee.id}-${date.replace(/-/g, '')}`;
    const isToday = date === todayIso();
    const base = { id, employee, date, lateMinutes: 0, otHours: 0, method: 'ess' as const };
    const leave = approvedLeaveOn(employee, date);

    if (leave && leave.halfDaySelection === null) {
        return { ...base, checkIn: null, checkOut: null, status: 'on-leave', totalHours: 0, notes: leave.type.name };
    }
    if (leave) {
        // Half-day leave: works the other half of the day.
        const morningOff = leave.halfDaySelection === 'FIRST_HALF';
        const inMin = morningOff ? 14 * 60 + 2 : SHIFT_START_MIN - 4;
        const outMin = morningOff ? SHIFT_END_MIN + 3 : 14 * 60;
        return {
            ...base,
            checkIn: localDateTime(date, inMin),
            checkOut: isToday ? null : localDateTime(date, outMin),
            status: 'half-day',
            totalHours: isToday ? 0 : round2((outMin - inMin) / 60),
            notes: `${leave.type.name} (${morningOff ? 'first' : 'second'} half)`,
        };
    }

    const r = seeded(employee.id, date, 'status');
    const override = overrides[date];
    let status: AttendanceStatus = 'present';
    if (override) ({ status } = override);
    else if (r < 0.025 && !NO_UNPLANNED_ABSENCE.has(employee.employeeId)) status = 'absent';
    else if (r < 0.1 && !NO_UNPLANNED_ABSENCE.has(employee.employeeId)) status = 'late';

    if (status === 'absent') {
        return { ...base, checkIn: null, checkOut: null, status, totalHours: 0, notes: null, method: 'manual' };
    }

    const inMin =
        override?.inMin ??
        (status === 'late'
            ? SHIFT_START_MIN + GRACE_PERIOD_MINUTES + 1 + Math.floor(seeded(employee.id, date, 'late') * 45)
            : SHIFT_START_MIN - 25 + Math.floor(seeded(employee.id, date, 'in') * 34));
    const ot = overtimeOn(employee, date);
    const outMin = ot
        ? SHIFT_END_MIN + Math.round(ot.extraHours * 60) + Math.floor(seeded(employee.id, date, 'out') * 6)
        : SHIFT_END_MIN + Math.floor(seeded(employee.id, date, 'out') * 45);
    const wfh = override?.wfh ?? (!override && seeded(employee.id, date, 'wfh') < 0.06);
    return {
        ...base,
        checkIn: localDateTime(date, inMin),
        checkOut: isToday ? null : localDateTime(date, outMin),
        status,
        lateMinutes: status === 'late' ? inMin - SHIFT_START_MIN : 0,
        totalHours: isToday ? 0 : round2((outMin - inMin) / 60 - BREAK_HOURS),
        otHours: ot && !isToday ? ot.extraHours : 0,
        notes: wfh ? 'Work from home' : null,
    };
};

const recordsFor = (employee: MockEmployee): MockAttendance[] => {
    const from = employee.dateOfJoin > ATTENDANCE_FROM ? employee.dateOfJoin : ATTENDANCE_FROM;
    const overrides = personaOverrides(employee);
    return workingDaysBetween(from, todayIso()).map(date => buildDay(employee, date, overrides));
};

/** All attendance records, newest date first, then by employee code. */
export const ATTENDANCE: MockAttendance[] = EMPLOYEES.flatMap(recordsFor).sort(
    (a, b) => b.date.localeCompare(a.date) || a.employee.employeeId.localeCompare(b.employee.employeeId)
);

export const attendanceOf = (employee: MockEmployee) => ATTENDANCE.filter(a => a.employee.id === employee.id);

export const findAttendance = (id: string | undefined) => ATTENDANCE.find(a => a.id === id);

export const attendanceInRange = (list: MockAttendance[], from?: string, to?: string) =>
    list.filter(a => (!from || a.date >= from) && (!to || a.date <= to));

// ---- disputes --------------------------------------------------------------------------------------------

export interface MockDispute {
    id: string;
    attendance: MockAttendance;
    disputeType: 'late' | 'absent';
    reason: string;
    status: DisputeStatus;
    remarks: string | null;
    createdAt: string;
}

interface DisputeSeed {
    code: string;
    status: DisputeStatus;
    reason: string;
    remarks?: string;
    /** Which late/absent record of that employee (0 = most recent). */
    nth: number;
}

const DISPUTE_SEEDS: DisputeSeed[] = [
    { code: 'ACME-004', nth: 1, status: 'requestedByEmployee', reason: 'ESS check-in failed at the gate (app timeout). I was at my desk by 09:28 – badge log attached.' },
    { code: 'ACME-005', nth: 0, status: 'rejected', reason: 'Traffic diversion on ORR due to metro work.', remarks: 'Late arrival confirmed by badge log. Please plan for the diversion.' },
    { code: 'ACME-013', nth: 0, status: 'approved', reason: 'Attended the vendor meeting at the client site first – manager informed.', remarks: 'Verified with Manish – client visit.' },
    { code: 'ACME-020', nth: 0, status: 'requestedByEmployee', reason: 'Was at the campus hiring drive in Pune; travel approved by HR.' },
];

export const DISPUTES: MockDispute[] = DISPUTE_SEEDS.flatMap((seed, i) => {
    const employee = findEmployee(seed.code);
    if (!employee) return [];
    const record = attendanceOf(employee).filter(a => a.status === 'late')[seed.nth];
    if (!record) return [];
    return [
        {
            id: `dsp-${String(i + 1).padStart(3, '0')}`,
            attendance: record,
            disputeType: record.status === 'absent' ? ('absent' as const) : ('late' as const),
            reason: seed.reason,
            status: seed.status,
            remarks: seed.remarks ?? null,
            createdAt: `${workingDayOffset(record.date, 1)}T06:10:00.000Z`,
        },
    ];
}).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const disputeFor = (attendanceId: string) => DISPUTES.find(d => d.attendance.id === attendanceId);

// ---- deduction log (late / absent days → salary deduction) ----------------------------------------------

/** Mirrors the backend's DEDUCTION_DAYS: half a day for a late arrival, a full day for an absence. */
export const DEDUCTION_DAYS = { late: 0.5, absent: 1 } as const;

export const dailySalaryOf = (employee: MockEmployee) => employee.salary.grossEarnings / 30;

export const deductionLogOf = (employee: MockEmployee) =>
    attendanceOf(employee)
        .filter((a): a is MockAttendance & { status: 'late' | 'absent' } => a.status === 'late' || a.status === 'absent')
        .map(a => {
            const dispute = disputeFor(a.id);
            return {
                id: a.id,
                date: a.date,
                type: a.status === 'late' ? 'Late Arrival' : 'Absent',
                status: a.status,
                lateMinutes: a.status === 'late' ? a.lateMinutes : undefined,
                deduction:
                    dispute?.status === 'approved'
                        ? 0
                        : Math.round(dailySalaryOf(employee) * DEDUCTION_DAYS[a.status]),
                disputeRaised: Boolean(dispute),
                disputeStatus: dispute?.status,
            };
        });

// ---- summaries ---------------------------------------------------------------------------------------------

export interface AttendanceTotals {
    present: number;
    late: number;
    absent: number;
    onLeave: number;
    halfDay: number;
    totalHours: number;
    totalLateMinutes: number;
    otHours: number;
    workingDays: number;
}

export const totalsOf = (records: MockAttendance[]): AttendanceTotals =>
    records.reduce<AttendanceTotals>(
        (acc, a) => ({
            present: acc.present + (a.status === 'present' ? 1 : 0),
            late: acc.late + (a.status === 'late' ? 1 : 0),
            absent: acc.absent + (a.status === 'absent' ? 1 : 0),
            onLeave: acc.onLeave + (a.status === 'on-leave' ? 1 : 0),
            halfDay: acc.halfDay + (a.status === 'half-day' ? 1 : 0),
            totalHours: Math.round((acc.totalHours + a.totalHours) * 100) / 100,
            totalLateMinutes: acc.totalLateMinutes + a.lateMinutes,
            otHours: acc.otHours + a.otHours,
            workingDays: acc.workingDays + 1,
        }),
        { present: 0, late: 0, absent: 0, onLeave: 0, halfDay: 0, totalHours: 0, totalLateMinutes: 0, otHours: 0, workingDays: 0 }
    );

/** Records of one employee in a 'YYYY-MM' month. */
export const monthRecordsOf = (employee: MockEmployee, month: string) => {
    const { first, last } = monthBounds(month);
    return attendanceInRange(attendanceOf(employee), first, last);
};

/**
 * Admin employee-profile attendance metrics for a month — exported for the employee area's
 * `payroll/employee/:employeeId/attendance/metrics` handler so the profile tab agrees with the Timesheet.
 */
export const employeeAttendanceMetrics = (employee: MockEmployee, month: string) => {
    const totals = totalsOf(monthRecordsOf(employee, month));
    const { first, last } = monthBounds(month);
    return {
        present: totals.present + totals.halfDay,
        late: totals.late,
        absent: totals.absent,
        onLeave: totals.onLeave,
        otHours: totals.otHours,
        month: { from: first, to: last },
    };
};

/** Today's headcount for the dashboard tiles. */
export const todaySummary = () => {
    const todays = ATTENDANCE.filter(a => a.date === todayIso());
    const totals = totalsOf(todays);
    return {
        present: totals.present + totals.halfDay,
        late: totals.late,
        absent: totals.absent,
        onLeave: totals.onLeave,
    };
};
