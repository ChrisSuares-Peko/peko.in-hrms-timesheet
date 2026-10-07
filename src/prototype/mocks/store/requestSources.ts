// PROTOTYPE-SETUP: registry of two-level request types — overtime (Slice 3), leave, reimbursement and
// attendance disputes (Slice 5). The manager's Team Approvals and Payroll's HR / Finance queues are generic over
// these sources: each knows how to list its records, read/replace their approval trail, and describe one as
// a queue item. Approving/rejecting goes through the engine in approvals.ts.
import type {
    ApprovalQueueItem,
    ApprovalTrail,
    Level2Component,
    TimesheetEntry,
} from '@src/domains/timesheet/types';
import { displayTime } from '@src/domains/timesheet/utils';

import { findEmployee, managerOf } from '../data/employees';
import type { DataMode } from '../envelope';
import { personRef } from './approvals';
import { StoredOvertime, overtimeRequests } from './overtimeStore';
import {
    attendanceDisputes,
    decisionComment,
    leaveRequests,
    legacyLeaveStatus,
    legacyRequestStatus,
    reimbursementRequests,
} from './requestStores';
import { timesheetWeeks } from './timesheetStore';

export interface RequestSource {
    component: Level2Component;
    list: (mode: DataMode) => { id: string; employeeId: number; trail: ApprovalTrail }[];
    /** Replace the trail of one record (and keep any legacy status field in step). */
    setTrail: (mode: DataMode, id: string, trail: ApprovalTrail) => void;
    toItem: (mode: DataMode, id: string) => ApprovalQueueItem | null;
}

const sources = new Map<Level2Component, RequestSource>();

export const registerSource = (source: RequestSource) => {
    sources.set(source.component, source);
};

export const sourceFor = (component: string) => sources.get(component as Level2Component);

export const allSources = () => [...sources.values()];

/** Common queue-item fields for a record. */
export const baseItem = (
    component: Level2Component,
    record: { id: string; employeeId: number; trail: ApprovalTrail },
    fields: Pick<ApprovalQueueItem, 'title' | 'detail' | 'at'> & Partial<ApprovalQueueItem>
): ApprovalQueueItem | null => {
    const employee = findEmployee(record.employeeId);
    if (!employee) return null;
    const manager = managerOf(employee);
    return {
        component,
        id: record.id,
        employee: personRef(employee),
        ...(manager ? { manager: { id: manager.id, name: manager.fullName } } : {}),
        trail: record.trail,
        ...fields,
    };
};

// ---- overtime ---------------------------------------------------------------------------------------------

const legacyOvertimeStatus = (trail: ApprovalTrail): StoredOvertime['status'] => {
    if (trail.status === 'APPROVED') return 'approved';
    if (trail.status === 'REJECTED') return 'rejected';
    return 'requestedByEmployee';
};

/** The flagged timesheet entries an overtime request was raised from (looked up in the timesheet store). */
const flaggedEntriesOf = (mode: DataMode, o: StoredOvertime): TimesheetEntry[] => {
    if (!o.timesheetEntryIds?.length) return [];
    const ids = new Set(o.timesheetEntryIds);
    return timesheetWeeks
        .get(mode)
        .filter(w => w.employeeId === o.employeeId)
        .flatMap(w => w.entries)
        .filter(e => ids.has(e.id));
};

registerSource({
    component: 'overtime',
    list: mode => overtimeRequests.get(mode).filter(o => o.status !== 'cancelledByEmployee'),
    setTrail: (mode, id, trail) =>
        overtimeRequests.update(mode, list =>
            list.map(o =>
                o.id === id
                    ? {
                          ...o,
                          trail,
                          status: legacyOvertimeStatus(trail),
                          updatedAt: new Date().toISOString(),
                      }
                    : o
            )
        ),
    toItem: (mode, id) => {
        const o = overtimeRequests.get(mode).find(x => x.id === id);
        if (!o) return null;
        const entries = flaggedEntriesOf(mode, o);
        return baseItem('overtime', o, {
            title: `${o.extraHours} h overtime`,
            detail: new Date(`${o.date}T00:00:00`).toLocaleDateString('en-IN', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
            }),
            notes: o.notes || undefined,
            at: o.createdAt,
            ...(entries.length
                ? {
                      timesheetEntries: entries,
                      detail: `${new Date(`${o.date}T00:00:00`).toLocaleDateString('en-IN', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                      })} · from timesheet: ${entries
                          .map(e => `${displayTime(e.start)}–${displayTime(e.end)}`)
                          .join(', ')}`,
                  }
                : {}),
        });
    },
});

// ---- Slice 5: leave, reimbursement, attendance disputes -------------------------------------------------

const shortDate = (iso: string) =>
    new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

registerSource({
    component: 'leave',
    list: mode =>
        leaveRequests
            .get(mode)
            .filter(l => l.status !== 'cancelledByEmployee')
            .map(l => ({ id: l.id, employeeId: l.employee.id, trail: l.trail })),
    setTrail: (mode, id, trail) =>
        leaveRequests.update(mode, list =>
            list.map(l =>
                l.id === id
                    ? {
                          ...l,
                          trail,
                          status: legacyLeaveStatus(trail, l.status),
                          reviewNote: decisionComment(trail) ?? l.reviewNote,
                          updatedAt: new Date().toISOString(),
                      }
                    : l
            )
        ),
    toItem: (mode, id) => {
        const l = leaveRequests.get(mode).find(x => x.id === id);
        if (!l) return null;
        const days = l.leaveCount === 1 ? '1 day' : `${l.leaveCount} days`;
        return baseItem('leave', { id: l.id, employeeId: l.employee.id, trail: l.trail }, {
            title: `${l.type.name} · ${days}`,
            detail: l.start === l.end ? shortDate(l.start) : `${shortDate(l.start)} – ${shortDate(l.end)}`,
            notes: l.reason,
            at: l.createdAt,
        });
    },
});

registerSource({
    component: 'reimbursement',
    list: mode =>
        reimbursementRequests
            .get(mode)
            .filter(r => r.status !== 'cancelledByEmployee')
            .map(r => ({ id: r.id, employeeId: r.employee.id, trail: r.trail })),
    setTrail: (mode, id, trail) =>
        reimbursementRequests.update(mode, list =>
            list.map(r => {
                if (r.id !== id) return r;
                const status = legacyRequestStatus(trail, r.status, 'requestedByEmployee', 'approved', 'rejected');
                let paymentStatus = r.paymentStatus;
                if (status === 'approved') paymentStatus = 'APPROVED';
                if (status === 'rejected') paymentStatus = 'REJECTED';
                return { ...r, trail, status, paymentStatus, updatedAt: new Date().toISOString() };
            })
        ),
    toItem: (mode, id) => {
        const r = reimbursementRequests.get(mode).find(x => x.id === id);
        if (!r) return null;
        return baseItem('reimbursement', { id: r.id, employeeId: r.employee.id, trail: r.trail }, {
            title: `₹${r.totalPay.toLocaleString('en-IN')} · ${r.category}`,
            detail: `${shortDate(r.expenseDate)} · ${r.expenseDetails}`,
            at: r.createdAt,
        });
    },
});

registerSource({
    component: 'attendance',
    list: mode =>
        attendanceDisputes
            .get(mode)
            .map(d => ({ id: d.id, employeeId: d.attendance.employee.id, trail: d.trail })),
    setTrail: (mode, id, trail) =>
        attendanceDisputes.update(mode, list =>
            list.map(d =>
                d.id === id
                    ? {
                          ...d,
                          trail,
                          status: legacyRequestStatus(trail, d.status, 'requestedByEmployee', 'approved', 'rejected'),
                          remarks: decisionComment(trail) ?? d.remarks,
                      }
                    : d
            )
        ),
    toItem: (mode, id) => {
        const d = attendanceDisputes.get(mode).find(x => x.id === id);
        if (!d) return null;
        const checkIn = d.attendance.checkIn ? ` · checked in ${d.attendance.checkIn.slice(11, 16)}` : '';
        return baseItem('attendance', { id: d.id, employeeId: d.attendance.employee.id, trail: d.trail }, {
            title: d.disputeType === 'late' ? 'Late-arrival dispute' : 'Absence dispute',
            detail: `${shortDate(d.attendance.date)}${checkIn}`,
            notes: d.reason,
            at: d.createdAt,
        });
    },
});
