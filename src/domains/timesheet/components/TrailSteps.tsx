// PROTOTYPE-SETUP: compact view of a request's approval chain, e.g. "Manager ✓ → Finance (pending)".
import { CheckCircleFilled, ClockCircleOutlined, CloseCircleFilled } from '@ant-design/icons';
import { Flex, Tooltip, Typography } from 'antd';

import type { ApprovalStep, ApprovalTrail } from '../types';

const ROLE: Record<ApprovalStep['approverRole'], string> = {
    MANAGER: 'Manager',
    HR: 'HR',
    FINANCE: 'Finance',
};

const pendingRole = (trail: ApprovalTrail) =>
    ({ PENDING_MANAGER: 'MANAGER', PENDING_HR: 'HR', PENDING_FINANCE: 'FINANCE' })[
        trail.status as 'PENDING_MANAGER'
    ];

const TrailSteps = ({ trail }: { trail: ApprovalTrail }) => (
    <Flex gap={6} align="center" wrap="wrap">
        {trail.steps.map((s, i) => {
            let icon = <ClockCircleOutlined className="text-gray-300" />;
            if (s.decision === 'APPROVED') icon = <CheckCircleFilled className="text-green-500" />;
            else if (s.decision === 'REJECTED')
                icon = <CloseCircleFilled className="text-red-500" />;
            else if (pendingRole(trail) === s.approverRole)
                icon = <ClockCircleOutlined className="text-amber-500" />;
            return (
                <Flex key={s.level} gap={4} align="center">
                    {i > 0 && <Typography.Text type="secondary">→</Typography.Text>}
                    <Tooltip title={s.comment}>
                        <Flex gap={4} align="center">
                            {icon}
                            <Typography.Text className="text-xs">
                                {ROLE[s.approverRole]}
                            </Typography.Text>
                        </Flex>
                    </Tooltip>
                </Flex>
            );
        })}
    </Flex>
);

export default TrailSteps;
