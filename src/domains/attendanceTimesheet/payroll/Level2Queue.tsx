// PROTOTYPE-SETUP: ESS Service 1 — one level-2 queue (HR or Finance, attendance corrections or overtime) on top
// of the shared RequestQueue. Used by Payroll → Approvals and the Overtime / Attendance corrections tabs of
// Payroll → Attendance. Approve / Reject only show on requests waiting for that role.
import { useCallback } from 'react';

import { type AtsRequestType, decideLevel2, getLevel2Queue } from '../api';
import { usePayrollScope } from './usePayrollAts';
import RequestQueue from '../components/RequestQueue';
import type { Level2Role, QueueScope, RequestItem } from '../types';

export const ROLE_NAME: Record<Level2Role, 'HR' | 'Finance'> = { HR: 'HR', FINANCE: 'Finance' };

export const TYPE_LABEL: Record<AtsRequestType, string> = {
    attendance: 'Attendance corrections',
    overtime: 'Overtime',
};

type Level2QueueProps = {
    role: Level2Role;
    type: AtsRequestType;
    defaultScope?: QueueScope;
    onChanged?: () => void;
};

const Level2Queue = ({ role, type, defaultScope, onChanged }: Level2QueueProps) => {
    const scope = usePayrollScope();
    const load = useCallback(
        (s: QueueScope) => getLevel2Queue(scope, role, type, s),
        [scope, role, type]
    );
    const decide = useCallback(
        (item: RequestItem, d: 'approve' | 'reject', comment?: string) =>
            decideLevel2(scope, role, type, item.id, d, comment),
        [scope, role, type]
    );
    return (
        <RequestQueue
            key={`${role}:${type}`}
            type={type}
            load={load}
            decide={decide}
            onChanged={onChanged}
            defaultScope={defaultScope}
            actingAs={ROLE_NAME[role]}
        />
    );
};

export default Level2Queue;
