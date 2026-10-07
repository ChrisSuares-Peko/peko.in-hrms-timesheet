// PROTOTYPE-SETUP: Timesheet V1, Slice 4 — shows or hides a Payroll screen based on the Attendance &
// Timesheet mode (e.g. the punch-based Attendance screens are off in 'timesheet' mode).
import { Result, Skeleton } from 'antd';

import { useTimesheetSettings } from '@src/domains/timesheet/hooks/useTimesheetSettings';
import type { TimesheetMode } from '@src/domains/timesheet/types';

type ModeGateProps = {
    /** Mode in which the screen is hidden. */
    hiddenIn: TimesheetMode;
    title: string;
    subTitle: string;
    children: React.ReactNode;
};

const ModeGate = ({ hiddenIn, title, subTitle, children }: ModeGateProps) => {
    const { settings, loading } = useTimesheetSettings();
    if (loading && !settings) return <Skeleton active paragraph={{ rows: 6 }} />;
    if (settings?.mode === hiddenIn)
        return <Result status="info" title={title} subTitle={subTitle} />;
    return <>{children}</>;
};

export default ModeGate;
