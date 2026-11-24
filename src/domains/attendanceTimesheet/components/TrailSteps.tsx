// PROTOTYPE-SETUP: ESS Service 1 — a request's approval chain, e.g. "✓ Manager (Arjun Mehta) → ◷ Finance".
// Skipped level 1 (the CEO has no manager) shows as "Manager — skipped".
import { CheckCircleFilled, ClockCircleOutlined, CloseCircleFilled, MinusCircleOutlined } from '@ant-design/icons';
import { Flex, Tooltip, Typography } from 'antd';

import type { ApprovalStep, ApprovalTrail } from '../types';
import { fmtStamp } from './format';

// PROTOTYPE-SETUP (Approvers): every team shows as "Admin / HR".
const ROLE: Record<ApprovalStep['role'], string> = { MANAGER: 'Manager', HR: 'Admin / HR', FINANCE: 'Admin / HR', PAYROLL: 'Admin / HR', ADMIN: 'Admin / HR' };
const PENDING: Partial<Record<ApprovalTrail['status'], ApprovalStep['role']>> = {
    PENDING_MANAGER: 'MANAGER',
    PENDING_HR: 'HR',
    PENDING_FINANCE: 'FINANCE',
    PENDING_PAYROLL: 'PAYROLL',
    PENDING_ADMIN: 'ADMIN',
};

const iconFor = (trail: ApprovalTrail, s: ApprovalStep) => {
    if (s.skipped) return <MinusCircleOutlined className="text-[var(--peko-muted)]" />;
    if (s.decision === 'APPROVED') return <CheckCircleFilled className="text-green-500" />;
    if (s.decision === 'REJECTED') return <CloseCircleFilled className="text-red-500" />;
    // PROTOTYPE-SETUP (Leave policy settings): only the step it's waiting on (two person steps with an endorsement).
    const waiting = trail.steps.find(x => !x.decision && !x.skipped);
    if (PENDING[trail.status] === s.role && waiting === s) return <ClockCircleOutlined className="text-amber-500" />;
    return <ClockCircleOutlined className="text-gray-300" />;
};

const tooltipFor = (s: ApprovalStep) => {
    if (s.skipped) return 'Skipped — no reporting manager';
    const parts = [s.decision && `${s.decision === 'APPROVED' ? 'Approved' : 'Rejected'}${s.at ? ` ${fmtStamp(s.at)}` : ''}`, s.comment && `“${s.comment}”`];
    return parts.filter(Boolean).join(' · ') || 'Waiting';
};

const TrailSteps = ({ trail }: { trail: ApprovalTrail }) => (
    <Flex gap={6} align="center" wrap="wrap">
        {trail.steps.map((s, i) => (
            <Flex key={`${s.level}-${i}`} gap={4} align="center">
                {i > 0 && <Typography.Text type="secondary">→</Typography.Text>}
                <Tooltip title={tooltipFor(s)}>
                    <Flex gap={4} align="center">
                        {iconFor(trail, s)}
                        <Typography.Text className="text-xs">
                            {/* PROTOTYPE-SETUP (Overview, Slice 4): profile updates go straight to the HR team. */}
                            {/* PROTOTYPE-SETUP (Leave policy settings): the endorsement step is "{name} (endorsement)". */}
                            {s.endorsement && `${s.approverName ?? 'Department head'} (endorsement)`}
                            {!s.endorsement && (trail.type === 'profile' && s.role === 'HR' ? 'HR team' : ROLE[s.role])}
                            {!s.endorsement && s.role === 'MANAGER' && s.approverName ? ` (${s.approverName})` : ''}
                            {s.skipped ? ' — skipped' : ''}
                        </Typography.Text>
                    </Flex>
                </Tooltip>
            </Flex>
        ))}
        {trail.type === 'profile' && (
            <Typography.Text type="secondary" className="text-xs">
                Profile changes go straight to HR
            </Typography.Text>
        )}
    </Flex>
);

export default TrailSteps;
