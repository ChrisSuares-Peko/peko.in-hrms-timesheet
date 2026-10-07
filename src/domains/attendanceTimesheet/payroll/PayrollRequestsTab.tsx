// PROTOTYPE-SETUP: ESS Service 1 — the Overtime and "Attendance corrections" tabs of Payroll → Attendance. Read-only
// history of every request plus the level-2 decision: Payroll acts as whoever Settings → Approval matrix routes
// the request type to (overtime → Finance, attendance corrections → HR by default). Approve / Reject only show
// on requests waiting for that role. Replaces the old OvertimeTab (approve) and DisputeTab (review).
import { Alert, Flex, Skeleton, Typography } from 'antd';
import { Link } from 'react-router-dom';

import type { AtsRequestType } from '../api';
import Level2Queue, { ROLE_NAME, TYPE_LABEL } from './Level2Queue';
import { payrollLinks, useAtsSettings } from './usePayrollAts';

const { Text } = Typography;

const PayrollRequestsTab = ({ type }: { type: AtsRequestType }) => {
    const { settings, loading } = useAtsSettings();

    if (loading && !settings) return <Skeleton active paragraph={{ rows: 6 }} />;
    if (!settings) return null;

    const role = settings.level2[type];
    const what = TYPE_LABEL[type].toLowerCase();

    if (role === 'NONE') {
        return (
            <Alert
                type="info"
                showIcon
                message={`The reporting manager's approval is final for ${what}`}
                description={
                    <>
                        No level 2 is set, so nothing comes to HR or Finance. Change this in{' '}
                        <Link to={payrollLinks.settings}>Settings → Attendance &amp; Timesheet</Link>.
                    </>
                }
            />
        );
    }

    return (
        <Flex vertical gap={12} className="w-full min-w-0">
            <Text type="secondary" className="text-xs sm:text-sm">
                Every {type === 'overtime' ? 'overtime request' : 'attendance correction'} that
                goes through {ROLE_NAME[role]}. Employees raise them from ESS; the reporting
                manager approves first, then {ROLE_NAME[role]} gives the final approval here.
            </Text>
            <Level2Queue role={role} type={type} defaultScope="all" />
        </Flex>
    );
};

export default PayrollRequestsTab;
