// PROTOTYPE-SETUP: ESS Service 1 — status tags for days, weeks and requests.
import { Tag } from 'antd';

import type { ApprovalTrail, DayStatus, TimesheetStatus } from '../types';
import { DAY_STATUS_COLOR, DAY_STATUS_LABEL, WEEK_STATUS } from './format';

export const DayStatusTag = ({ status, label }: { status: DayStatus; label?: string }) => (
    <Tag color={DAY_STATUS_COLOR[status]} className="!m-0">
        {status === 'holiday' && label ? label : DAY_STATUS_LABEL[status]}
    </Tag>
);

export const WeekStatusTag = ({ status, changePending }: { status: TimesheetStatus; changePending?: boolean }) => (
    <>
        <Tag color={WEEK_STATUS[status].color} className="!m-0">
            {WEEK_STATUS[status].label}
        </Tag>
        {changePending && (
            <Tag color="warning" className="!m-0 !ml-1">
                Change pending
            </Tag>
        )}
    </>
);

const TRAIL_COLOR: Record<ApprovalTrail['status'], string> = {
    PENDING_MANAGER: 'processing',
    PENDING_HR: 'processing',
    PENDING_FINANCE: 'processing',
    APPROVED: 'success',
    REJECTED: 'error',
    CANCELLED: 'default',
};

/** `label` is the server's statusLabel, e.g. "With manager (Arjun Mehta)". */
export const RequestStatusTag = ({ trail, label }: { trail: ApprovalTrail; label: string }) => (
    <Tag color={TRAIL_COLOR[trail.status]} className="!m-0">
        {label}
    </Tag>
);
