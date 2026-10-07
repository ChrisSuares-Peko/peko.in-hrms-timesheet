// PROTOTYPE-SETUP: routes for the two ESS prototype tabs, mounted inside the corporate dashboard layout
// (see dashboard.tsx). Both tabs mount the SAME existing ESS portal pages; who they run as comes from
// useEssIdentity (ESS - Employee = the ESS employee persona, ESS - Manager = her reporting manager).
// The /employee ESS portal routes, EmployeePortalLayout and EmployeeAuthGuard are untouched.
import { lazy } from 'react';

import { Navigate } from 'react-router-dom';

import { ESS_TABS } from '@src/prototype/persona/essPersonas';

const EssLayout = lazy(() => import('@src/domains/dashboard/Ess/pages/EssLayout'));

// Home mounts the employee Dashboard directly: EmployeeHome's onboarding gate would send an empty-mode
// persona to the onboarding wizard, which is not one of the tab's pages.
const EmployeeDashboard = lazy(() => import('@src/domains/employee/pages/Dashboard'));
const Leaves = lazy(() => import('@src/domains/employee/pages/Leaves'));
const Payslips = lazy(() => import('@src/domains/employee/pages/Payslips'));
const Reimbursements = lazy(() => import('@src/domains/employee/pages/Reimbursements'));
const Documents = lazy(() => import('@src/domains/employee/pages/Documents'));
const Profile = lazy(() => import('@src/domains/employee/pages/Profile'));
// ESS Service 1: the Attendance & Timesheet section (Attendance / Timesheet / Overtime tabs per mode) and the
// ESS - Manager "My team" section. The old ESS Attendance page is hidden: its route redirects to the section.
const AtsSectionPage = lazy(() => import('@src/domains/attendanceTimesheet/ess/AtsSectionPage'));
const MyTeamPage = lazy(() => import('@src/domains/attendanceTimesheet/team/MyTeamPage'));
const MemberTimesheetPage = lazy(() => import('@src/domains/attendanceTimesheet/team/MemberTimesheetPage'));

/** One route tree per tab; `key` remounts the pages on a tab switch so each persona's data loads fresh. */
const essTabRoutes = (base: string) => [
    {
        element: <EssLayout key={base} />,
        children: [
            { element: <EmployeeDashboard />, index: true },
            { element: <AtsSectionPage />, path: 'attendance-timesheet' },
            { element: <AtsSectionPage />, path: 'attendance-timesheet/:tab' },
            { element: <MyTeamPage />, path: 'my-team' },
            { element: <MemberTimesheetPage />, path: 'my-team/members/:employeeId' },
            { element: <MyTeamPage />, path: 'my-team/:tab' },
            { element: <Leaves />, path: 'leaves' },
            { element: <Payslips />, path: 'payslips' },
            { element: <Reimbursements />, path: 'reimbursements' },
            { element: <Documents />, path: 'documents' },
            { element: <Profile />, path: 'profile' },
            // Old pages, isolated: hidden from the tab bar and redirected to their replacements.
            { element: <Navigate to={`${base}/attendance-timesheet/attendance`} replace />, path: 'attendance' },
            { element: <Navigate to={`${base}/attendance-timesheet/timesheet`} replace />, path: 'timesheet' },
            { element: <Navigate to={`${base}/my-team/timesheet-approvals`} replace />, path: 'approvals' },
        ],
    },
];

/** Mounted in dashboard.tsx as { path: tab.base, children } for each tab. */
export const essRoutes = ESS_TABS.map(tab => ({ path: tab.base, children: essTabRoutes(tab.base) }));
