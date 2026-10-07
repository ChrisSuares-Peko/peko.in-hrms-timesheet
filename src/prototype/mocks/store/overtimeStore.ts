// PROTOTYPE-SETUP: stateful overtime requests (Timesheet V1, Slice 2+). Seeded from data/time-overtime.ts
// and persisted per data mode, so a request raised from My Timesheet shows up in ESS Attendance → Overtime
// and (Slice 3+) in the manager's and Finance's queues. Each record carries its two-level approval trail;
// `status` keeps the existing OvertimeApiStatus values the current screens understand.
import type { OvertimeApiRecord, OvertimeSummary } from '@domains/employee/api/overtime';
import type { ApprovalStatus, ApprovalTrail } from '@src/domains/timesheet/types';

import { createCollection } from './persistentStore';
import { timesheetSettings } from './timesheetStore';
import { managerOf } from '../data/employees';
import { OVERTIME, OvertimeStatus } from '../data/time-overtime';
import type { DataMode } from '../envelope';

export interface StoredOvertime {
    id: string;
    employeeId: number;
    /** YYYY-MM-DD */
    date: string;
    extraHours: number;
    notes: string;
    status: OvertimeStatus;
    paymentStatus: 'PAID' | 'UNPAID';
    trail: ApprovalTrail;
    /** Flagged timesheet entries the request was raised from (My Timesheet → Request overtime). */
    timesheetEntryIds?: string[];
    createdAt: string;
    updatedAt: string;
}

const seededTrail = (o: (typeof OVERTIME)[number]): ApprovalTrail => {
    const manager = managerOf(o.employee);
    const at = o.updatedAt;
    const l1 = {
        level: 1 as const,
        approverRole: 'MANAGER' as const,
        ...(manager ? { approverId: manager.id } : {}),
    };
    const l2 = { level: 2 as const, approverRole: 'FINANCE' as const };
    if (o.status === 'approved') {
        return {
            component: 'overtime',
            status: 'APPROVED',
            steps: [
                { ...l1, decision: 'APPROVED', at },
                { ...l2, decision: 'APPROVED', at },
            ],
        };
    }
    if (o.status === 'rejected') {
        return {
            component: 'overtime',
            status: 'REJECTED',
            steps: [
                {
                    ...l1,
                    decision: 'REJECTED',
                    at,
                    comment: 'Not pre-approved — please discuss first.',
                },
                l2,
            ],
        };
    }
    const status: ApprovalStatus = 'PENDING_MANAGER';
    return { component: 'overtime', status, steps: [l1, l2] };
};

export const overtimeRequests = createCollection<StoredOvertime[]>(
    'overtime-requests',
    (mode: DataMode) =>
        mode === 'empty'
            ? []
            : OVERTIME.map(o => ({
                  id: o.id,
                  employeeId: o.employee.id,
                  date: o.date,
                  extraHours: o.extraHours,
                  notes: o.notes,
                  status: o.status,
                  paymentStatus: o.paymentStatus,
                  trail: seededTrail(o),
                  createdAt: o.createdAt,
                  updatedAt: o.updatedAt,
              }))
);

export const level2ForOvertime = (mode: DataMode) => timesheetSettings.get(mode).level2.overtime;

export const toEssOvertime = (o: StoredOvertime): OvertimeApiRecord => ({
    id: o.id,
    overTimeDate: o.date,
    extraHours: o.extraHours,
    notes: o.notes,
    status: o.status,
    paymentStatus: o.paymentStatus,
});

export const overtimeSummaryOf = (list: StoredOvertime[]): OvertimeSummary => ({
    totalOtHours: list.filter(o => o.status === 'approved').reduce((s, o) => s + o.extraHours, 0),
    approvedCount: list.filter(o => o.status === 'approved').length,
    pendingCount: list.filter(o => o.status === 'requestedByEmployee').length,
});
