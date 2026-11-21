import StatusTag from '@src/components/peko/StatusTag';
// PROTOTYPE-SETUP: ESS Service 1 — status tags for days, weeks and requests.

import type { ApprovalTrail, DayStatus, TimesheetStatus } from '../types';
import { DAY_STATUS_COLOR, DAY_STATUS_LABEL, WEEK_STATUS } from './format';

export const DayStatusTag = ({ status, label }: { status: DayStatus; label?: string }) => (
    <StatusTag color={DAY_STATUS_COLOR[status]} className="!m-0">
        {status === 'holiday' && label ? label : DAY_STATUS_LABEL[status]}
    </StatusTag>
);

export const WeekStatusTag = ({ status, changePending }: { status: TimesheetStatus; changePending?: boolean }) => (
    <>
        <StatusTag color={WEEK_STATUS[status].color} className="!m-0">
            {WEEK_STATUS[status].label}
        </StatusTag>
        {changePending && (
            <StatusTag color="warning" className="!m-0 !ml-1">
                Change pending
            </StatusTag>
        )}
    </>
);

const TRAIL_COLOR: Record<ApprovalTrail['status'], string> = {
    PENDING_MANAGER: 'processing',
    PENDING_HR: 'processing',
    PENDING_FINANCE: 'processing',
    PENDING_PAYROLL: 'processing',
    PENDING_ADMIN: 'processing',
    APPROVED: 'success',
    REJECTED: 'error',
    CANCELLED: 'default',
    // PROTOTYPE-SETUP (My team, Slice 1): back with the employee.
    UPDATE_REQUESTED: 'warning',
};

/** `label` is the server's statusLabel, e.g. "With manager (Arjun Mehta)". */
export const RequestStatusTag = ({ trail, label }: { trail: ApprovalTrail; label: string }) => (
    <StatusTag color={TRAIL_COLOR[trail.status]} className="!m-0">
        {label}
    </StatusTag>
);
