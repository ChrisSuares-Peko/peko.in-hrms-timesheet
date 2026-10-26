import { useState } from 'react';

import { Button, Row, Tabs, TabsProps, Typography } from 'antd';
import { useSearchParams } from 'react-router-dom';

// PROTOTYPE-SETUP (Payroll admin, Slices 1 and 5): the service tabs on top, and Requests — the admin requests list for
// attendance corrections (was "Attendance corrections"). Overtime moved to its own service tab (Payroll → Overtime).
import AdminRequestsList from '@src/domains/attendanceTimesheet/payroll/admin/AdminRequestsList';
import { PayrollServiceTabs, useAdminCounts } from '@src/domains/attendanceTimesheet/payroll/admin/adminShared';
import useScreenSize from '@src/hooks/useScreenSize';

import AddHolidaysModal from '../components/modals/AddHolidaysModal';
import MarkAttendanceModal from '../components/modals/MarkAttendanceModal';
import DailyLogTab from '../components/timesheet/DailyLogTab';
import HolidaysTab from '../components/timesheet/HolidaysTab';
import MonthlySummaryTab from '../components/timesheet/MonthlySummaryTab';
import ShiftScheduleTab from '../components/timesheet/ShiftScheduleTab';
// PROTOTYPE-SETUP: ESS Service 1 — the old OvertimeTab (approve) and DisputeTab (review) are isolated: no longer
// rendered here, left in place under ../components/timesheet/ until the cleanup.

const tabItems = (waiting: number): TabsProps['items'] => [
    { key: '1', label: 'Daily Log' },
    { key: '2', label: 'Monthly Summary' },
    { key: '4', label: 'Holidays' },
    { key: '5', label: 'Shift Schedule' },
    // PROTOTYPE-SETUP: ESS Service 1 — renamed from "Dispute". (Payroll admin, Slice 5): "Requests".
    { key: '6', label: `Requests (${waiting})` },
];

const Timesheet = () => {
    const [params] = useSearchParams();
    const [activeTab, setActiveTab] = useState(params.get('view') === 'requests' ? '6' : '1');
    const counts = useAdminCounts();
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
            <PayrollServiceTabs active="attendance" />
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

            <Tabs activeKey={activeTab} items={tabItems(counts?.attendance ?? 0)} onChange={setActiveTab} />

            {activeTab === '1' && <DailyLogTab refetchTrigger={dailyRefetchTrigger} />}
            {activeTab === '2' && <MonthlySummaryTab />}
            {activeTab === '4' && <HolidaysTab refetchTrigger={dailyRefetchTrigger} />}
            {activeTab === '5' && <ShiftScheduleTab />}
            {activeTab === '6' && <AdminRequestsList type="attendance" />}
        </>
    );
};

export default Timesheet;
