import { useState } from 'react';

import { Button, Row, Tabs, TabsProps, Typography } from 'antd';

// PROTOTYPE-SETUP: ESS Service 1 — Overtime and Attendance corrections are read-only history plus the level-2
// (HR / Finance) decision.
import PayrollRequestsTab from '@src/domains/attendanceTimesheet/payroll/PayrollRequestsTab';
import useScreenSize from '@src/hooks/useScreenSize';

import AddHolidaysModal from '../components/modals/AddHolidaysModal';
import MarkAttendanceModal from '../components/modals/MarkAttendanceModal';
import DailyLogTab from '../components/timesheet/DailyLogTab';
import HolidaysTab from '../components/timesheet/HolidaysTab';
import MonthlySummaryTab from '../components/timesheet/MonthlySummaryTab';
import ShiftScheduleTab from '../components/timesheet/ShiftScheduleTab';
// PROTOTYPE-SETUP: ESS Service 1 — the old OvertimeTab (approve) and DisputeTab (review) are isolated: no longer
// rendered here, left in place under ../components/timesheet/ until the cleanup.

const tabItems: TabsProps['items'] = [
    { key: '1', label: 'Daily Log' },
    { key: '2', label: 'Monthly Summary' },
    { key: '3', label: 'Overtime' },
    { key: '4', label: 'Holidays' },
    { key: '5', label: 'Shift Schedule' },
    // PROTOTYPE-SETUP: ESS Service 1 — renamed from "Dispute".
    { key: '6', label: 'Attendance corrections' },
];

const Timesheet = () => {
    const [activeTab, setActiveTab] = useState('1');
    const [markAttendanceOpen, setMarkAttendanceOpen] = useState(false);
    const [addHolidayOpen, setAddHolidayOpen] = useState(false);
    const [dailyRefetchTrigger, setDailyRefetchTrigger] = useState(0);
    const { xs, md } = useScreenSize();

    const getButtonSize = (): 'small' | 'large' | 'middle' => {
        if (xs) return 'small';
        if (md) return 'large';
        return 'middle';
    };
    const btnSize = getButtonSize();

    return (
        <>
            <Row justify="space-between" align="middle" className="mb-4">
                <Typography.Text className="text-xl font-medium">Attendance</Typography.Text>
                {(activeTab === '1' || activeTab === '2') && (
                    <Button danger size={btnSize} onClick={() => setMarkAttendanceOpen(true)}>
                        Mark Attendance
                    </Button>
                )}
                {activeTab === '4' && (
                    <Button danger size={btnSize} onClick={() => setAddHolidayOpen(true)}>
                        Add Holiday
                    </Button>
                )}
            </Row>

            <MarkAttendanceModal
                open={markAttendanceOpen}
                onCancel={() => setMarkAttendanceOpen(false)}
                onSuccess={() => setDailyRefetchTrigger(t => t + 1)}
            />

            <AddHolidaysModal
                open={addHolidayOpen}
                holidayType="ADD"
                holiDayData={null}
                handleCancel={() => setAddHolidayOpen(false)}
                setRefresh={() => setDailyRefetchTrigger(t => t + 1)}
                setHolidayData={() => {}}
            />

            <Tabs activeKey={activeTab} items={tabItems} onChange={setActiveTab} />

            {activeTab === '1' && <DailyLogTab refetchTrigger={dailyRefetchTrigger} />}
            {activeTab === '2' && <MonthlySummaryTab />}
            {/* PROTOTYPE-SETUP: ESS Service 1 — level-2 overtime queue (Finance by default). */}
            {activeTab === '3' && <PayrollRequestsTab type="overtime" />}
            {activeTab === '4' && <HolidaysTab refetchTrigger={dailyRefetchTrigger} />}
            {activeTab === '5' && <ShiftScheduleTab />}
            {/* PROTOTYPE-SETUP: ESS Service 1 — level-2 attendance-correction queue (HR by default). */}
            {activeTab === '6' && <PayrollRequestsTab type="attendance" />}
        </>
    );
};

export default Timesheet;
