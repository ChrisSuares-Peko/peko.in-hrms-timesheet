// PROTOTYPE-SETUP (Payroll admin, Slice 1): Payroll → Timesheet — Overview (the former Timesheet status page) and
// Requests (timesheets approved by managers, waiting for the admin's final approval).
import { PayrollServiceTabs, ServiceHeader, AdminSubTabs, useAdminView, useAdminCounts, notifyAdminChanged } from './adminShared';
import PayrollTimesheetsPanel from '../PayrollTimesheetsPanel';
import TimesheetStatusPage from '../TimesheetStatusPage';

const AdminTimesheetPage = () => {
    const [view, setView] = useAdminView(['overview', 'requests']);
    const counts = useAdminCounts();
    return (
        <div className="w-full min-w-0" data-admin-page="timesheet">
            <PayrollServiceTabs active="timesheet" />
            <ServiceHeader title="Timesheet" line="Every employee’s timesheets. You give the final approval once their manager has approved." />
            <AdminSubTabs
                value={view}
                onChange={setView}
                options={[
                    { value: 'overview', label: 'Overview' },
                    { value: 'requests', label: `Requests (${counts?.timesheet ?? 0})` },
                ]}
            />
            {view === 'overview' && <TimesheetStatusPage />}
            {view === 'requests' && <PayrollTimesheetsPanel roleName="you" onChanged={notifyAdminChanged} />}
        </div>
    );
};

export default AdminTimesheetPage;
