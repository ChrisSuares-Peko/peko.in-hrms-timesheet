// PROTOTYPE-SETUP (Final batch, Slice 1): live leave requests and reimbursement claims, each with an approval trail
// in the current shape (manager → level 2 per settings: leave → HR, reimbursements → Admin), plus each employee's
// joining / leaving date overrides for the leave demo. Seeded from the original static data (data/time-leaves.ts,
// data/time-requests.ts — "Earned" leave migrated to "Annual"). Maternity / paternity seeds aren't carried over: the
// ESS leave policy has three types (Annual, Casual, Sick). This module only depends on the rules and the seeds, so
// the attendance store can read approved leave from it.
import type { ApprovalTrail, LeaveRequest, LeaveType } from '@src/domains/attendanceTimesheet/types';
import { DEFAULT_SETTINGS, decide, startTrail } from '@src/prototype/rules/attendance';

import { createCollection } from './persistentStore';
import { MockEmployee, findEmployee, managerOf } from '../data/employees';
import { LEAVES, MockLeave } from '../data/time-leaves';
import { MockReimbursement, REIMBURSEMENTS } from '../data/time-requests';
import type { DataMode } from '../envelope';

const managerOfRef = (e: MockEmployee) => {
    const m = managerOf(e);
    return m ? { id: m.id, name: m.fullName } : null;
};

/** Seeded requests the manager already approved (waiting on level 2): lv-004 (leave → HR), rb-010 (claim → Admin). */
const WITH_LEVEL2 = new Set(['lv-004', 'rb-010']);

/** A seeded trail in the current shape: pending (with the manager, or level 2), approved, rejected or cancelled. */
const seededTrail = (
    type: 'leave' | 'reimbursement',
    e: MockEmployee,
    state: 'pending' | 'approved' | 'rejected' | 'cancelled',
    id: string,
    at: string,
    comment?: string | null
): ApprovalTrail => {
    let trail = startTrail(type, managerOfRef(e), DEFAULT_SETTINGS);
    const step = (decision: 'APPROVED' | 'REJECTED', note?: string) => {
        const role = trail.status === 'PENDING_MANAGER' ? 'MANAGER' : trail.status.replace('PENDING_', '');
        trail = decide(trail, role as Parameters<typeof decide>[1], decision, note, at);
    };
    if (state === 'cancelled') return { ...trail, status: 'CANCELLED' };
    if (state === 'rejected') {
        step('REJECTED', comment || 'Not this time.');
        return trail;
    }
    if (state === 'approved') {
        while (trail.status.startsWith('PENDING')) step('APPROVED', comment ?? undefined);
        return trail;
    }
    if (WITH_LEVEL2.has(id) && trail.status === 'PENDING_MANAGER' && trail.steps.length > 1) step('APPROVED');
    return trail;
};

// ---- leave requests -----------------------------------------------------------------------------------------

const LEAVE_TYPE_OF: Partial<Record<MockLeave['type']['key'], LeaveType>> = { annual: 'ANNUAL', casual: 'CASUAL', sick: 'SICK' };

const HALF_OF = { FIRST_HALF: 'FIRST', SECOND_HALF: 'SECOND' } as const;

const seedLeave = (l: MockLeave): LeaveRequest | null => {
    const type = LEAVE_TYPE_OF[l.type.key];
    if (!type) return null;
    const state = ({ applied: 'pending', approved: 'approved', rejected: 'rejected', cancelledByEmployee: 'cancelled' } as const)[l.status];
    return {
        id: l.id,
        employeeId: l.employee.id,
        type,
        start: l.start,
        end: l.end,
        half: l.halfDaySelection ? HALF_OF[l.halfDaySelection] : null,
        days: l.leaveCount,
        reason: l.reason,
        trail: seededTrail('leave', l.employee, state, l.id, l.updatedAt, l.reviewNote),
        ...(state === 'cancelled' ? { withdrawn: true } : {}),
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
    };
};

export const atsLeaveRequests = createCollection<LeaveRequest[]>('ats-leave-requests', mode =>
    mode === 'empty' ? [] : LEAVES.map(seedLeave).filter((x): x is LeaveRequest => x !== null)
);

export const leaveRequestsOf = (mode: DataMode, employeeId: number) =>
    atsLeaveRequests.get(mode).filter(l => l.employeeId === employeeId);

/** Approved leave covering the date (full day or half), if any. */
export const approvedLeaveOn = (mode: DataMode, employeeId: number, date: string) =>
    leaveRequestsOf(mode, employeeId).find(l => l.trail.status === 'APPROVED' && l.start <= date && l.end >= date);

// ---- reimbursements -------------------------------------------------------------------------------------------

export type StoredClaim = Omit<MockReimbursement, 'employee' | 'status'> & {
    employeeId: number;
    trail: ApprovalTrail;
    withdrawn?: boolean;
};

const seedClaim = (r: MockReimbursement): StoredClaim => {
    const state = ({ requestedByEmployee: 'pending', approved: 'approved', rejected: 'rejected', cancelledByEmployee: 'cancelled' } as const)[r.status];
    // The status lives in the trail now.
    return {
        id: r.id,
        expenseDate: r.expenseDate,
        category: r.category,
        expenseDetails: r.expenseDetails,
        totalPay: r.totalPay,
        transferMethod: r.transferMethod,
        paymentStatus: r.paymentStatus,
        supportingDocs: r.supportingDocs,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        employeeId: r.employee.id,
        trail: seededTrail('reimbursement', r.employee, state, r.id, r.updatedAt),
        ...(state === 'cancelled' ? { withdrawn: true } : {}),
    };
};

export const atsReimbursements = createCollection<StoredClaim[]>('ats-reimbursements', mode =>
    mode === 'empty' ? [] : REIMBURSEMENTS.map(seedClaim)
);

/** The claim in the shape the reimbursement screens read (status in step with the trail). */
export const legacyClaimStatus = (c: StoredClaim): MockReimbursement['status'] => {
    if (c.withdrawn || c.trail.status === 'CANCELLED') return 'cancelledByEmployee';
    if (c.trail.status === 'APPROVED') return 'approved';
    if (c.trail.status === 'REJECTED') return 'rejected';
    return 'requestedByEmployee';
};

export const claimEmployee = (c: StoredClaim) => findEmployee(c.employeeId);

// ---- joining / leaving dates (the leave demo) -------------------------------------------------------------

export const atsEmployeeLife = createCollection<Record<number, { dateOfJoin?: string; exitDate?: string | null }>>('ats-employee-life', () => ({}));

/** Joining and leaving dates: the demo override, else the employee's own (someone on notice leaves on their last day). */
export const lifeOf = (mode: DataMode, e: MockEmployee) => {
    const o = atsEmployeeLife.get(mode)[e.id] ?? {};
    return {
        dateOfJoin: o.dateOfJoin ?? e.dateOfJoin,
        exitDate: o.exitDate !== undefined ? o.exitDate : e.lastWorkingDay ?? null,
    };
};

/** Last year's closing balances (the persona: Annual 5 carried; Casual 2 and Sick 1 lapse). */
export const openingBalancesOf = (e: MockEmployee): Partial<Record<LeaveType, number>> =>
    e.employeeId === 'ACME-004' ? { ANNUAL: 5, CASUAL: 2, SICK: 1 } : { ANNUAL: 3 + (e.id % 7), CASUAL: e.id % 3, SICK: e.id % 2 };
