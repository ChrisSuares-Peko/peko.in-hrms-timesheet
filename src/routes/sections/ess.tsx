// PROTOTYPE-SETUP: routes for the two ESS prototype tabs, mounted inside the corporate dashboard layout
// (see dashboard.tsx). The /employee ESS portal routes and EmployeeAuthGuard are untouched.
import { lazy } from 'react';

import { ESS_EMPLOYEE, ESS_MANAGER } from '@src/prototype/mocks/data/employees';
import PersonaScope from '@src/prototype/persona/PersonaScope';

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

// Personas: ESS - Employee runs as ESS_EMPLOYEE (Sneha Iyer); ESS - Manager as ESS_MANAGER (Arjun Mehta,
// her reporting manager). Payroll and the rest of the app stay the corporate admin.
export const essEmployeeRoutes = [
    {
        element: (
            <PersonaScope employee={ESS_EMPLOYEE} label="ESS - Employee">
                <EssEmployeeLayout />
            </PersonaScope>
        ),
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

export const essManagerRoutes = [
    {
        element: (
            <PersonaScope employee={ESS_MANAGER} label="ESS - Manager">
                <EssManagerPage />
            </PersonaScope>
        ),
        index: true,
    },
];
