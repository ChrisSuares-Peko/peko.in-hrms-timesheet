import { useState } from 'react';

import { Button, Tabs, TabsProps } from 'antd';
import { useSearchParams } from 'react-router-dom';

// PROTOTYPE-SETUP (Payroll admin, Slices 1 and 5): the service tabs on top, and Requests — the admin requests list for
// attendance corrections (was "Attendance corrections"). Overtime moved to its own service tab (Payroll → Overtime).
import { PekoPageHeader, PekoTabLabel } from '@src/components/peko/PageHeader';
import AdminRequestsList from '@src/domains/attendanceTimesheet/payroll/admin/AdminRequestsList';
import { PayrollServiceBar, useAdminCounts } from '@src/domains/attendanceTimesheet/payroll/admin/adminShared';
import { useDevPage } from '@src/prototype/devNotes/devPage';

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
    // PROTOTYPE-SETUP (Design update): the count is a small red pill on the tab.
    { key: '6', label: <PekoTabLabel label="Requests" count={waiting} /> },
];

const Timesheet = () => {
    const [params] = useSearchParams();
    const [activeTab, setActiveTab] = useState(params.get('view') === 'requests' ? '6' : '1');
    const counts = useAdminCounts();
    // PROTOTYPE-SETUP (Developer notes): Payroll → Attendance (its tabs fall back to pay:attendance).
    useDevPage(`pay:attendance:${activeTab}`);
    const [markAttendanceOpen, setMarkAttendanceOpen] = useState(false);
    const [addHolidayOpen, setAddHolidayOpen] = useState(false);
    const [dailyRefetchTrigger, setDailyRefetchTrigger] = useState(0);
    // PROTOTYPE-SETUP (Design update): the page action sits right-aligned on the tab row.
    let action = null;
    if (activeTab === '1' || activeTab === '2') {
        action = (
            <Button type="primary" onClick={() => setMarkAttendanceOpen(true)}>
                Mark Attendance
            </Button>
        );
    } else if (activeTab === '4') {
        action = (
            <Button type="primary" onClick={() => setAddHolidayOpen(true)}>
                Add Holiday
            </Button>
        );
    }

    return (
        <>
            <PayrollServiceBar active="attendance" />
            <PekoPageHeader title="Attendance" description="Everyone’s daily attendance, monthly summary, holidays, shifts and correction requests." />

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

            <Tabs activeKey={activeTab} items={tabItems(counts?.attendance ?? 0)} onChange={setActiveTab} tabBarExtraContent={action} />

            {activeTab === '1' && <DailyLogTab refetchTrigger={dailyRefetchTrigger} />}
            {activeTab === '2' && <MonthlySummaryTab />}
            {activeTab === '4' && <HolidaysTab refetchTrigger={dailyRefetchTrigger} />}
            {activeTab === '5' && <ShiftScheduleTab />}
            {activeTab === '6' && <AdminRequestsList type="attendance" />}
        </>
    );
};

export default Timesheet;
