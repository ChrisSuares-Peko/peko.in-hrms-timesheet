// PROTOTYPE-SETUP: ESS Service 1 — shows or hides a Payroll screen based on the Attendance & Timesheet mode
// (e.g. the check-in based Attendance screens are hidden in 'timesheet' mode). Replaces the Timesheet V1
// ModeGate; reads the new ATS settings.
import type { ReactNode } from 'react';

import { Button, Result, Skeleton } from 'antd';
import { useNavigate } from 'react-router-dom';

import type { AtsMode } from '../types';
import { payrollLinks, useAtsSettings } from './usePayrollAts';

type AtsModeGateProps = {
    /** Mode (or modes) in which the screen is hidden. */
    hiddenIn: AtsMode | AtsMode[];
    title: string;
    subTitle: string;
    children: ReactNode;
};

const AtsModeGate = ({ hiddenIn, title, subTitle, children }: AtsModeGateProps) => {
    const navigate = useNavigate();
    const { settings, loading } = useAtsSettings();
    const hidden = Array.isArray(hiddenIn) ? hiddenIn : [hiddenIn];

    if (loading && !settings) return <Skeleton active paragraph={{ rows: 6 }} />;
    if (settings && hidden.includes(settings.mode)) {
        return (
            <Result
                status="info"
                title={title}
                subTitle={subTitle}
                extra={
                    <Button onClick={() => navigate(payrollLinks.settings)}>
                        Attendance &amp; Timesheet settings
                    </Button>
                }
            />
        );
    }
    return <>{children}</>;
};

export default AtsModeGate;
