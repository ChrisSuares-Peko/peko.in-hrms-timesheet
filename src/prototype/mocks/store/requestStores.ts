// PROTOTYPE-SETUP: Timesheet V1, Slice 5 — leave applications, reimbursement claims and attendance disputes
// become stateful, each with a two-level approval trail (manager → HR / Finance). Same record shapes as the
// original static data (data/time-leaves.ts, time-requests.ts, time-attendance.ts), so every existing screen
// keeps working; handlers read these live, mode-aware lists instead of the static arrays.
//
// Seeded states: approved/rejected history as before; requests still pending sit with the manager, except a
// few that the manager already approved — so the HR and Finance queues in Payroll have work in them.
import type { ApprovalTrail, Level2Component } from '@src/domains/timesheet/types';

import { MockEmployee, managerOf } from '../data/employees';
import { DISPUTES, DisputeStatus, MockDispute } from '../data/time-attendance';
import { LEAVES, LeaveStatus, MockLeave } from '../data/time-leaves';
import { MockReimbursement, REIMBURSEMENTS, ReimbursementStatus } from '../data/time-requests';
import type { DataMode } from '../envelope';
import { createCollection } from './persistentStore';

export type StoredLeave = MockLeave & { trail: ApprovalTrail };
export type StoredReimbursement = MockReimbursement & { trail: ApprovalTrail };
export type StoredDispute = MockDispute & { trail: ApprovalTrail };

// PROTOTYPE-SETUP: ESS Service 1 — this V1 Slice 5 store is DORMANT: not registered with any approval queue
// and not read by any endpoint. Kept (with its V1 types) for when leave / reimbursement join the new approval
// chain. Level 2 used to come from the V1 timesheet settings; it is fixed here.
const DORMANT_LEVEL2: Record<Level2Component, 'HR' | 'FINANCE' | 'NONE'> = {
    attendance: 'HR',
    overtime: 'FINANCE',
    leave: 'HR',
    reimbursement: 'FINANCE',
};

/** Seeded requests the manager already approved (waiting on level 2), by id. */
// lv-004 Divya Menon (leave → HR), rb-010 Imran Shaikh (claim → Finance), dsp-004 Farah Khan (dispute → HR).
const WITH_LEVEL2 = new Set(['lv-004', 'rb-010', 'dsp-004']);

const seededTrail = (
    component: Level2Component,
    employee: MockEmployee,
    state: 'pending' | 'approved' | 'rejected',
    id: string,
    at: string,
    comment?: string | null
): ApprovalTrail => {
    const manager = managerOf(employee);
    const level2 = DORMANT_LEVEL2[component];
    const l1 = { level: 1 as const, approverRole: 'MANAGER' as const, ...(manager ? { approverId: manager.id } : {}) };
    const l2 = level2 === 'NONE' ? null : { level: 2 as const, approverRole: level2 };
    const steps = (s1: ApprovalTrail['steps'][number], s2?: ApprovalTrail['steps'][number]) =>
        (s2 ? [s1, s2] : [s1]) as ApprovalTrail['steps'];
    if (state === 'approved') {
        return {
            component,
            status: 'APPROVED',
            steps: steps({ ...l1, decision: 'APPROVED', at }, l2 ? { ...l2, decision: 'APPROVED', at } : undefined),
        };
    }
    if (state === 'rejected') {
        return {
            component,
            status: 'REJECTED',
            steps: steps({ ...l1, decision: 'REJECTED', at, ...(comment ? { comment } : {}) }, l2 ?? undefined),
        };
    }
    if (WITH_LEVEL2.has(id) && l2) {
        return {
            component,
            status: l2.approverRole === 'HR' ? 'PENDING_HR' : 'PENDING_FINANCE',
            steps: steps({ ...l1, decision: 'APPROVED', at }, l2),
        };
    }
    return { component, status: 'PENDING_MANAGER', steps: steps(l1, l2 ?? undefined) };
};

const leaveState = (s: LeaveStatus) => (s === 'applied' ? 'pending' : s === 'approved' ? 'approved' : 'rejected');
const reimbursementState = (s: ReimbursementStatus) =>
    s === 'requestedByEmployee' ? 'pending' : s === 'approved' ? 'approved' : 'rejected';
const disputeState = (s: DisputeStatus) =>
    s === 'requestedByEmployee' ? 'pending' : s === 'approved' ? 'approved' : 'rejected';

export const leaveRequests = createCollection<StoredLeave[]>('leave-requests', mode =>
    mode === 'empty'
        ? []
        : LEAVES.map(l => ({
              ...l,
              trail: seededTrail('leave', l.employee, leaveState(l.status), l.id, l.updatedAt, l.reviewNote),
          }))
);

export const reimbursementRequests = createCollection<StoredReimbursement[]>('reimbursement-requests', mode =>
    mode === 'empty'
        ? []
        : REIMBURSEMENTS.map(r => ({
              ...r,
              trail: seededTrail('reimbursement', r.employee, reimbursementState(r.status), r.id, r.updatedAt),
          }))
);

export const attendanceDisputes = createCollection<StoredDispute[]>('attendance-disputes', mode =>
    mode === 'empty'
        ? []
        : DISPUTES.map(d => ({
              ...d,
              trail: seededTrail('attendance', d.attendance.employee, disputeState(d.status), d.id, d.createdAt, d.remarks),
          }))
);

// ---- live, mode-aware lookups (replace the static LEAVES / REIMBURSEMENTS / DISPUTES reads) ---------------

export const leavesLive = (mode: DataMode) => leaveRequests.get(mode);
export const leavesOfLive = (mode: DataMode, employee: MockEmployee) =>
    leavesLive(mode).filter(l => l.employee.id === employee.id);
export const findLeaveLive = (mode: DataMode, id: string | undefined) => leavesLive(mode).find(l => l.id === id);

export const reimbursementsLive = (mode: DataMode) => reimbursementRequests.get(mode);
export const reimbursementsOfLive = (mode: DataMode, employee: MockEmployee) =>
    reimbursementsLive(mode).filter(r => r.employee.id === employee.id);
export const findReimbursementLive = (mode: DataMode, id: string | undefined) =>
    reimbursementsLive(mode).find(r => r.id === id);

export const disputesLive = (mode: DataMode) => attendanceDisputes.get(mode);
export const disputeForLive = (mode: DataMode, attendanceId: string) =>
    disputesLive(mode).find(d => d.attendance.id === attendanceId);

// ---- legacy status kept in step with the trail (existing screens read these fields) -----------------------

export const legacyLeaveStatus = (trail: ApprovalTrail, current: LeaveStatus): LeaveStatus => {
    if (current === 'cancelledByEmployee') return current;
    if (trail.status === 'APPROVED') return 'approved';
    if (trail.status === 'REJECTED') return 'rejected';
    return 'applied';
};

export const legacyRequestStatus = <S extends string>(
    trail: ApprovalTrail,
    current: S,
    pending: S,
    approved: S,
    rejected: S
): S => {
    if (current === ('cancelledByEmployee' as S)) return current;
    if (trail.status === 'APPROVED') return approved;
    if (trail.status === 'REJECTED') return rejected;
    return pending;
};

/** The comment of the step that decided (for reviewNote / remarks fields). */
export const decisionComment = (trail: ApprovalTrail) =>
    [...trail.steps].reverse().find(s => s.decision)?.comment ?? null;
