// PROTOTYPE-SETUP: the two-level approval engine shared by overtime, leave, reimbursement and attendance
// disputes (Timesheet V1, Slices 3–5). Level 1 = the employee's reporting manager; level 2 = HR / Finance per
// the routing setting, or none. Rejected at either level → back to the employee with the comment.
import type {
    ApprovalStatus,
    ApprovalTrail,
    Level2Approver,
    Level2Component,
    PersonRef,
} from '@src/domains/timesheet/types';

import { MockEmployee, findEmployee, managerOf } from '../data/employees';
import { fail } from '../errors';

export const personRef = (e: MockEmployee): PersonRef => ({
    id: e.id,
    name: e.fullName,
    employeeId: e.employeeId,
    designation: e.designation,
    department: e.department,
});

const pendingStatusFor = (role: 'HR' | 'FINANCE'): ApprovalStatus =>
    role === 'HR' ? 'PENDING_HR' : 'PENDING_FINANCE';

/** A fresh trail for a new request: pending with the reporting manager. */
export const startTrail = (
    component: Level2Component,
    employeeId: number,
    level2: Level2Approver
): ApprovalTrail => {
    const manager = managerOf(findEmployee(employeeId)!);
    const steps: ApprovalTrail['steps'] = [
        { level: 1, approverRole: 'MANAGER', ...(manager ? { approverId: manager.id } : {}) },
    ];
    if (level2 !== 'NONE') steps.push({ level: 2, approverRole: level2 });
    return { component, status: 'PENDING_MANAGER', steps };
};

/** Who may act on a trail right now: the level-1 manager (by employee id) or the level-2 role. */
export const awaiting = (trail: ApprovalTrail) => {
    if (trail.status === 'PENDING_MANAGER') return { level: 1 as const, role: 'MANAGER' as const };
    if (trail.status === 'PENDING_HR') return { level: 2 as const, role: 'HR' as const };
    if (trail.status === 'PENDING_FINANCE') return { level: 2 as const, role: 'FINANCE' as const };
    return null;
};

/**
 * Apply a decision at the level that is currently pending. Throws 409 if the trail is not waiting on
 * `actingAs`, 400 if a rejection has no comment.
 */
export const decide = (
    trail: ApprovalTrail,
    actingAs: 'MANAGER' | 'HR' | 'FINANCE',
    decision: 'APPROVED' | 'REJECTED',
    comment?: string
): ApprovalTrail => {
    const pending = awaiting(trail);
    if (!pending || pending.role !== actingAs) {
        throw fail(409, 'This request is no longer waiting for your decision — refresh the list.');
    }
    const note = comment?.trim();
    if (decision === 'REJECTED' && !note)
        throw fail(400, 'Please add a comment explaining the rejection.');
    const at = new Date().toISOString();
    const steps = trail.steps.map(s =>
        s.level === pending.level ? { ...s, decision, at, ...(note ? { comment: note } : {}) } : s
    );
    if (decision === 'REJECTED') return { ...trail, status: 'REJECTED', steps };
    const next = steps.find(s => s.level === 2 && !s.decision);
    if (pending.level === 1 && next && next.approverRole !== 'MANAGER') {
        return { ...trail, status: pendingStatusFor(next.approverRole), steps };
    }
    return { ...trail, status: 'APPROVED', steps };
};

/** Map a trail to the existing two-state screens: pending | approved | rejected. */
export const legacyState = (trail: ApprovalTrail): 'pending' | 'approved' | 'rejected' => {
    if (trail.status === 'APPROVED') return 'approved';
    if (trail.status === 'REJECTED') return 'rejected';
    return 'pending';
};

/** Human label for where a request is, e.g. "With manager (Arjun Mehta)", "With Finance". */
export const trailLabel = (trail: ApprovalTrail) => {
    switch (trail.status) {
        case 'PENDING_MANAGER': {
            const id = trail.steps[0]?.approverId;
            const name = id ? findEmployee(id)?.fullName : undefined;
            return name ? `With manager (${name})` : 'With manager';
        }
        case 'PENDING_HR':
            return 'With HR';
        case 'PENDING_FINANCE':
            return 'With Finance';
        case 'APPROVED':
            return 'Approved';
        default:
            return 'Rejected';
    }
};

/** Throws 403 unless `manager` is the employee's reporting manager. */
export const assertManages = (manager: MockEmployee, employee: MockEmployee | undefined) => {
    if (!employee || employee.managerEmployeeId !== manager.employeeId) {
        throw fail(403, 'You can only review requests from your direct reports.');
    }
};
