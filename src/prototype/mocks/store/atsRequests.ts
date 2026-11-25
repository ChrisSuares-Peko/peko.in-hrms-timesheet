// PROTOTYPE-SETUP (Final batch, Slice 1): live leave requests and reimbursement claims, each with an approval trail
// in the current shape (manager → level 2 per settings: leave → HR, reimbursements → Admin), plus each employee's
// joining / leaving date overrides for the leave demo. Seeded from the original static data (data/time-leaves.ts,
// data/time-requests.ts — "Earned" leave migrated to "Annual"). This module only depends on the rules and the seeds,
// so the attendance store can read approved leave from it.
// PROTOTYPE-SETUP (Leave module): HR's leave types (Maternity / Paternity too), leave cancellation requests, comp off
// requests, and each employee's status (Probation until HR marks them Active).
import type { ApprovalTrail, CompOffRequest, EmployeeLeaveStatus, LeaveCancellation, LeaveChange, LeaveRequest, LeaveType } from '@src/domains/attendanceTimesheet/types';
import { DEFAULT_SETTINGS, RuleError, addDays, decide, resubmitTrail, startTrail } from '@src/prototype/rules/attendance';
import { addMonthsTo } from '@src/prototype/rules/leave';


import { createCollection } from './persistentStore';
import { atsScenario } from '../data/ats-seed';
import { MockEmployee, findEmployee, managerOf } from '../data/employees';
import { todayIso } from '../data/time-calendar';
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

const LEAVE_TYPE_OF: Partial<Record<MockLeave['type']['key'], LeaveType>> = { annual: 'ANNUAL', casual: 'CASUAL', sick: 'SICK', maternity: 'MATERNITY', paternity: 'PATERNITY' };

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

// ---- leave cancellations and comp off (PROTOTYPE-SETUP: Leave module) ------------------------------------------------

export const atsLeaveCancels = createCollection<LeaveCancellation[]>('ats-leave-cancels', () => []);

/** PROTOTYPE-SETUP (Leave module): requests to change approved leave (the original stays until one is approved). */
export const atsLeaveChanges = createCollection<LeaveChange[]>('ats-leave-changes', () => []);

/**
 * PROTOTYPE-SETUP (Leave fixes): HR's balance adjustments ({employee, type, ±days, reason, date, by}) and imported
 * opening balances (`opening`, dated by their "as of" date). The engine counts them as credits / deductions.
 */
export interface LeaveAdjustment {
    id: string;
    employeeId: number;
    type: string;
    days: number;
    reason: string;
    date: string;
    by: string;
    opening?: boolean;
    createdAt: string;
}

export const atsLeaveAdjustments = createCollection<LeaveAdjustment[]>('ats-leave-adjustments', () => []);

/** Seeded: Vikram's half day of comp off for the Saturday he worked (waiting for his manager). */
export const atsCompOffs = createCollection<CompOffRequest[]>('ats-comp-offs', mode => {
    if (mode === 'empty') return [];
    const vikram = findEmployee('ACME-007');
    if (!vikram) return [];
    const at = `${addDays(todayIso(), -1)}T11:20:00.000Z`;
    const worked = atsScenario().workedSaturday;
    if (worked >= todayIso()) return [];
    return [
        {
            id: 'co-001',
            employeeId: vikram.id,
            date: worked,
            days: 0.5,
            workedMinutes: 270,
            reason: 'Production release support over the weekend',
            trail: startTrail('leave', managerOfRef(vikram), DEFAULT_SETTINGS),
            createdAt: at,
            updatedAt: at,
        },
    ];
});

// ---- reimbursements -------------------------------------------------------------------------------------------

export type StoredClaim = Omit<MockReimbursement, 'employee' | 'status' | 'category'> & {
    /** PROTOTYPE-SETUP (Settings, Slice 5): a category from Payroll settings → Reimbursements (seeds keep theirs). */
    category: string;
    /** PROTOTYPE-SETUP (Settings, Slice 5): a receipt was attached. */
    receipt?: boolean;
    employeeId: number;
    trail: ApprovalTrail;
    withdrawn?: boolean;
};

const seedClaim = (r: MockReimbursement): StoredClaim => {
    const state = ({ requestedByEmployee: 'pending', updateRequested: 'pending', approved: 'approved', rejected: 'rejected', cancelledByEmployee: 'cancelled' } as const)[r.status];
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

/**
 * PROTOTYPE-SETUP (My team, Slice 1): update a claim that was sent back (amount, date, description) and send it again;
 * it starts again at the manager.
 */
export const resubmitClaim = (mode: DataMode, employeeId: number, id: string, input: { amount?: number; date?: string; description?: string } | undefined, by: string) => {
    const c = atsReimbursements.get(mode).find(x => x.id === id && x.employeeId === employeeId);
    if (!c) throw new RuleError('Claim not found.', 404);
    const amount = Math.round(Number(input?.amount ?? c.totalPay));
    const date = input?.date ?? c.expenseDate;
    const description = (input?.description ?? c.expenseDetails).trim();
    if (!(amount > 0)) throw new RuleError('Enter the amount.', 400);
    if (!/^\d{4}-\d{2}-\d{2}/.test(date) || date.slice(0, 10) > todayIso()) throw new RuleError('Pick the date you spent it (today or earlier).', 400);
    if (!description) throw new RuleError('Say what it was for.', 400);
    const at = new Date().toISOString();
    const trail = resubmitTrail(c.trail, at, by);
    const next = { ...c, totalPay: amount, expenseDate: date, expenseDetails: description, trail, updatedAt: at };
    atsReimbursements.update(mode, list => list.map(x => (x.id === id ? next : x)));
    return next;
};

/** The claim in the shape the reimbursement screens read (status in step with the trail). */
export const legacyClaimStatus = (c: StoredClaim): MockReimbursement['status'] => {
    if (c.withdrawn || c.trail.status === 'CANCELLED') return 'cancelledByEmployee';
    if (c.trail.status === 'UPDATE_REQUESTED') return 'updateRequested';
    if (c.trail.status === 'APPROVED') return 'approved';
    if (c.trail.status === 'REJECTED') return 'rejected';
    return 'requestedByEmployee';
};

// ---- joining / leaving dates and status (the leave demo) ------------------------------------------------------------

export interface EmployeeLife {
    dateOfJoin?: string;
    exitDate?: string | null;
    /** PROTOTYPE-SETUP (Leave module): Probation until HR marks them Active (confirmedOn = that day). */
    status?: EmployeeLeaveStatus;
    confirmedOn?: string | null;
}

export const atsEmployeeLife = createCollection<Record<number, EmployeeLife>>('ats-employee-life', () => ({}));

/**
 * Seeded on probation (HR hasn't marked them Active yet): the new joiner (ACME-015) and Farah Khan (ACME-020, six months
 * in). Everyone else was confirmed six months after joining.
 */
const PROBATION_SEED = new Set(['ACME-020']);

/** Joining and leaving dates and status: the demo override, else the employee's own (someone on notice leaves on their last day). */
export const lifeOf = (mode: DataMode, e: MockEmployee) => {
    const o = atsEmployeeLife.get(mode)[e.id] ?? {};
    const dateOfJoin = o.dateOfJoin ?? e.dateOfJoin;
    const seededProbation = !e.probationEnded || PROBATION_SEED.has(e.employeeId);
    const status: EmployeeLeaveStatus = o.status ?? (seededProbation ? 'PROBATION' : 'ACTIVE');
    const seededConfirmation = status === 'ACTIVE' && !seededProbation ? addMonthsTo(dateOfJoin, 6) : null;
    const confirmedOn = o.confirmedOn !== undefined ? o.confirmedOn : seededConfirmation;
    return {
        dateOfJoin,
        exitDate: o.exitDate !== undefined ? o.exitDate : e.lastWorkingDay ?? null,
        status,
        confirmedOn: status === 'ACTIVE' ? confirmedOn : null,
    };
};

/** Last year's closing balances (the persona: Annual 5 carried; Casual 2 and Sick 1 lapse). */
export const openingBalancesOf = (e: MockEmployee): Record<string, number> =>
    e.employeeId === 'ACME-004' ? { ANNUAL: 5, CASUAL: 2, SICK: 1 } : { ANNUAL: 3 + (e.id % 7), CASUAL: e.id % 3, SICK: e.id % 2 };
