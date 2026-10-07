// PROTOTYPE-SETUP: ESS Service 1 — a request's approval chain, e.g. "✓ Manager (Arjun Mehta) → ◷ Finance".
// Skipped level 1 (the CEO has no manager) shows as "Manager — skipped".
import { CheckCircleFilled, ClockCircleOutlined, CloseCircleFilled, MinusCircleOutlined } from '@ant-design/icons';
import { Flex, Tooltip, Typography } from 'antd';

import type { ApprovalStep, ApprovalTrail } from '../types';
import { fmtStamp } from './format';

const ROLE: Record<ApprovalStep['role'], string> = { MANAGER: 'Manager', HR: 'HR', FINANCE: 'Finance' };
const PENDING: Partial<Record<ApprovalTrail['status'], ApprovalStep['role']>> = {
    PENDING_MANAGER: 'MANAGER',
    PENDING_HR: 'HR',
    PENDING_FINANCE: 'FINANCE',
};

const iconFor = (trail: ApprovalTrail, s: ApprovalStep) => {
    if (s.skipped) return <MinusCircleOutlined className="text-gray-400" />;
    if (s.decision === 'APPROVED') return <CheckCircleFilled className="text-green-500" />;
    if (s.decision === 'REJECTED') return <CloseCircleFilled className="text-red-500" />;
    if (PENDING[trail.status] === s.role) return <ClockCircleOutlined className="text-amber-500" />;
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
            <Flex key={s.level} gap={4} align="center">
                {i > 0 && <Typography.Text type="secondary">→</Typography.Text>}
                <Tooltip title={tooltipFor(s)}>
                    <Flex gap={4} align="center">
                        {iconFor(trail, s)}
                        <Typography.Text className="text-xs">
                            {ROLE[s.role]}
                            {s.role === 'MANAGER' && s.approverName ? ` (${s.approverName})` : ''}
                            {s.skipped ? ' — skipped' : ''}
                        </Typography.Text>
                    </Flex>
                </Tooltip>
            </Flex>
        ))}
    </Flex>
);

export default TrailSteps;
