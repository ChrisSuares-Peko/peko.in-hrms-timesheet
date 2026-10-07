import { lazy } from 'react';

import { Outlet } from 'react-router-dom';

// PROTOTYPE-SETUP: ESS Service 1 — the gate reads the new Attendance & Timesheet settings (was V1 ModeGate).
import AtsModeGate from '@src/domains/attendanceTimesheet/payroll/AtsModeGate';

import { paths } from '../paths';

const ActivityCalendarPage = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/ActivityCalendar')
);
const OrganizationSettingsPage = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/OrganizationSettings')
);
const ComplianceSettingsPage = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/complianceSettings')
);

const HomePage = lazy(() => import('@src/domains/dashboard/Payroll/pages/HomePage'));
const EmployeeOnboardPage = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/EmployeeOnboardPage')
);
const EmployeesPage = lazy(() => import('@src/domains/dashboard/Payroll/pages/Employees'));
const AddNewHirePage = lazy(() => import('@src/domains/dashboard/Payroll/pages/AddNewHire'));
const NewHireProfilePage = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/NewHireProfile')
);
const EmployeeSalaryPage = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/EmployeeSalary')
);

const AnnouncementsPage = lazy(() => import('@src/domains/dashboard/Payroll/pages/Announcements'));
const EmployeeLeavePage = lazy(() => import('@src/domains/dashboard/Payroll/pages/EmployeeLeave'));
const TimesheetPage = lazy(() => import('@src/domains/dashboard/Payroll/pages/Timesheet'));
const EmployeeBulkUpload = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/EmployeeBulkUpload')
);
const EmployeeSuccessPage = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/EmployeeSuccess')
);
const EmployeeOnboardSuccessPage = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/EmployeeOnboardSuccessPage')
);

const WpsRegistration = lazy(() => import('@src/domains/dashboard/Payroll/pages/WpsRegistration'));
const EmployeeDetails = lazy(() => import('@src/domains/dashboard/Payroll/pages/EmployeeDetails'));
const EmployeeReimbursementPage = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/EmployeeReimbursement')
);
const ReportsPage = lazy(() => import('@src/domains/dashboard/Payroll/pages/Reports'));
const CompanyDocumentsPage = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/CompanyDocuments')
);
const LeaveSummaryPage = lazy(() => import('@src/domains/dashboard/Payroll/pages/LeaveSummary'));
const EmployeeSalaryDetails = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/SalaryProfileNew')
);
const PayrollRecordSuccessPage = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/PayrollRecordSuccess')
);
const DocumentsCategoryPage = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/DocumentsCategory')
);
const EmployeeSalaryProfilePage = lazy(
    () => import('@src/domains/dashboard/Payroll/components/EmployeeSalary/EmployeeSalaryProfile')
);
const PayrollAccountSetupPage = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/PayrollAccountSetup')
);
const PayrollAccountProgressPage = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/PayrollAccountProgress')
);

const SalaryDashboardPage = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/SalaryDashboard')
);
const SalaryEmployeesPage = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/SalaryEmployees')
);
const SalaryPastEmployeesPage = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/SalaryPastEmployees')
);
const SalaryProcessPage = lazy(() => import('@src/domains/dashboard/Payroll/pages/SalaryProcess'));
const SalaryHistoryPage = lazy(() => import('@src/domains/dashboard/Payroll/pages/SalaryHistory'));
const SalaryHistoryDetailsPage = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/SalaryHistoryDetails')
);
const PayrollHistoryViewPage = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/PayrollHistoryView')
);
const SalaryStatsPage = lazy(() => import('@src/domains/dashboard/Payroll/pages/SalaryStats'));
const ManageBanksPage = lazy(() => import('@src/domains/dashboard/Payroll/pages/ManageBanks'));
const ManageBankTransactionsPage = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/ManageBankTransactions')
);
// PROTOTYPE-SETUP: ESS Service 1 — HR / Finance level-2 queues and Timesheet status. These replace the
// Timesheet V1 pages (Payroll/pages/Level2Approvals, Payroll/pages/TimesheetSummary), which are no longer routed.
const Level2ApprovalsPage = lazy(
    () => import('@src/domains/attendanceTimesheet/payroll/Level2ApprovalsPage')
);
const TimesheetStatusPage = lazy(
    () => import('@src/domains/attendanceTimesheet/payroll/TimesheetStatusPage')
);
const CtcCalculatorPage = lazy(
    () => import('@src/domains/dashboard/Payroll/pages/CtcCalculatorPage')
);
// -----------------------------------------------------------------------

export const payrollRoutes = [
    {
        path: '',
        element: (
            //  currently disabled payroll guard
            // <PayrollAuthGuard>
            <Outlet />
            // </PayrollAuthGuard>
        ),
        children: [
            {
                element: <EmployeeSalaryDetails />,
                path: `${paths.payroll.employeesSalary}/${paths.payroll.salaryProfile}`,
            },
            {
                element: <PayrollRecordSuccessPage />,
                path: `${paths.payroll.employeesSalary}/${paths.payroll.payrollRecordSuccess}`,
            },
            { element: <EmployeeSalaryPage />, path: paths.payroll.employeesSalary },
            {
                element: <EmployeeSalaryProfilePage />,
                path: `${paths.payroll.employeesSalary}/${paths.payroll.employeeSalaryProfile}`,
            },
            {
                element: <AnnouncementsPage />,
                path: `${paths.payroll.announcements}`,
            },
        ],
    },
    { element: <HomePage />, index: true },
    { element: <PayrollAccountSetupPage />, path: paths.payroll.payrollAccountSetup },
    { element: <PayrollAccountProgressPage />, path: paths.payroll.payrollAccountProgress },
    { element: <SalaryDashboardPage />, path: paths.payroll.salaryDashboard },
    { element: <SalaryEmployeesPage />, path: paths.payroll.salaryEmployees },
    { element: <SalaryPastEmployeesPage />, path: paths.payroll.salaryPastEmployees },
    { element: <SalaryProcessPage />, path: paths.payroll.salaryProcess },
    { element: <SalaryHistoryPage />, path: paths.payroll.salaryHistory },
    { element: <SalaryHistoryDetailsPage />, path: paths.payroll.salaryHistoryDetails },
    { element: <PayrollHistoryViewPage />, path: paths.payroll.payrollHistoryView },
    { element: <SalaryStatsPage />, path: paths.payroll.salaryStats },
    {
        path: paths.payroll.manageBanks,
        children: [
            { element: <ManageBanksPage />, index: true },
            { element: <ManageBankTransactionsPage />, path: paths.payroll.manageBankTransactions },
        ],
    },

    { element: <ActivityCalendarPage />, path: paths.payroll.activityCalendar },
    { element: <OrganizationSettingsPage />, path: paths.payroll.payrollSettings },
    { element: <ComplianceSettingsPage />, path: paths.payroll.complianceSettings },
    { element: <EmployeeLeavePage />, path: paths.payroll.employeeLeave },
    {
        // PROTOTYPE-SETUP: ESS Service 1 — check-in based Attendance screens are off in Timesheet only mode.
        element: (
            <AtsModeGate
                hiddenIn="timesheet"
                title="Attendance tracking is off"
                subTitle="Your company is in Timesheet only mode, so employees don't check in or out. See Timesheet status for timesheets."
            >
                <TimesheetPage />
            </AtsModeGate>
        ),
        path: paths.payroll.timesheet,
    },
    { element: <ReportsPage />, path: paths.payroll.reports },
    { element: <CtcCalculatorPage />, path: paths.payroll.ctcCalculator },
    // PROTOTYPE-SETUP: ESS Service 1 — HR / Finance level-2 queues.
    { element: <Level2ApprovalsPage />, path: paths.payroll.approvals },
    // PROTOTYPE-SETUP: ESS Service 1 — status only, never entries.
    { element: <TimesheetStatusPage />, path: paths.payroll.timesheets },

    {
        element: <EmployeeOnboardPage />,
        path: `${paths.payroll.employees}/${paths.payroll.addEmployee}`,
    },
    {
        element: <AddNewHirePage />,
        path: `${paths.payroll.employees}/${paths.payroll.addNewHire}`,
    },
    {
        element: <NewHireProfilePage />,
        path: `${paths.payroll.employees}/${paths.payroll.newHireProfile}`,
    },
    { element: <EmployeesPage />, path: paths.payroll.employees },
    {
        element: <EmployeeBulkUpload />,
        path: `${paths.payroll.employees}/${paths.payroll.bulkUpload}`,
    },
    {
        element: <EmployeeSuccessPage />,
        path: `${paths.payroll.employees}/${paths.payroll.employeeSuccess}`,
    },
    {
        element: <EmployeeOnboardSuccessPage />,
        path: `${paths.payroll.employees}/${paths.payroll.employeeAdded}`,
    },
    { element: <WpsRegistration />, path: paths.payroll.wpsRegistration },

    {
        element: <EmployeeDetails />,
        path: `${paths.payroll.employees}/${paths.payroll.employeeProfile}`,
    },
    { element: <EmployeeReimbursementPage />, path: paths.payroll.employeeReimbursement },
    {
        path: paths.payroll.allDocuments,
        children: [
            { element: <CompanyDocumentsPage />, index: true },
            { element: <DocumentsCategoryPage />, path: paths.payroll.documentsDetails }, // for admin
        ],
    },

    {
        element: <EmployeeDetails />,
        path: `${paths.payroll.employeesSalary}/${paths.payroll.employeeProfile}`,
    },
    {
        element: <LeaveSummaryPage />,
        path: `${paths.payroll.employeeLeave}/${paths.payroll.leaveSummary}`,
    },
];
