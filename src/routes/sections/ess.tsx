// PROTOTYPE-SETUP: routes for the two ESS prototype tabs, mounted inside the corporate dashboard layout
// (see dashboard.tsx). The /employee ESS portal routes and EmployeeAuthGuard are untouched.
import { lazy } from 'react';

const EssEmployeeLayout = lazy(() => import('@src/domains/dashboard/Ess/pages/EssEmployeeLayout'));
const EssManagerPage = lazy(() => import('@src/domains/dashboard/Ess/pages/EssManagerPage'));

// Reused ESS portal pages. Home mounts the employee Dashboard directly: EmployeeHome's onboarding gate
// is API-driven and would always bounce to /employee/onboarding without a real backend.
const EmployeeDashboard = lazy(() => import('@src/domains/employee/pages/Dashboard'));
const Attendance = lazy(() => import('@src/domains/employee/pages/Attendance'));
const Leaves = lazy(() => import('@src/domains/employee/pages/Leaves'));
const Payslips = lazy(() => import('@src/domains/employee/pages/Payslips'));
const Reimbursements = lazy(() => import('@src/domains/employee/pages/Reimbursements'));
const Documents = lazy(() => import('@src/domains/employee/pages/Documents'));
const Profile = lazy(() => import('@src/domains/employee/pages/Profile'));

export const essEmployeeRoutes = [
    {
        element: <EssEmployeeLayout />,
        children: [
            { element: <EmployeeDashboard />, index: true },
            { element: <Attendance />, path: 'attendance' },
            { element: <Leaves />, path: 'leaves' },
            { element: <Payslips />, path: 'payslips' },
            { element: <Reimbursements />, path: 'reimbursements' },
            { element: <Documents />, path: 'documents' },
            { element: <Profile />, path: 'profile' },
        ],
    },
];

export const essManagerRoutes = [{ element: <EssManagerPage />, index: true }];
