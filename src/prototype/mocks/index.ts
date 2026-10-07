// PROTOTYPE-SETUP: registry of every mock endpoint. Handlers live in ./handlers and read data from ./data.
// Order matters only when two patterns match the same URL: the first one wins, so list specific
// patterns (payroll/employee/count) before generic ones (payroll/employee/:employeeId).
import { accessRoutes } from './handlers/access';
import { teamApprovalRoutes } from './handlers/approvals';
import { atsRoutes } from './handlers/ats';
import { employeesRoutes } from './handlers/employees';
import { lookupRoutes } from './handlers/lookups';
import { payrollApprovalRoutes } from './handlers/payrollApprovals';
import { salaryRoutes } from './handlers/salary';
import { shellRoutes } from './handlers/shell';
import { timeAndSettingsRoutes } from './handlers/timeAndSettings';
import { essOvertimeRoutes, timesheetRoutes } from './handlers/timesheet';
import type { MockRoute } from './router';

export const mockRoutes: MockRoute[] = [
    ...atsRoutes, // ESS Service 1: Attendance & Timesheet (payroll/ats/*, stateful)
    ...accessRoutes, // Step 2: unlock access — first: holds specific payroll/employee/* sub-paths
    ...shellRoutes, // header / notifications / search, called on every page
    ...lookupRoutes, // static dropdown reference data (states, company sizes, ...)
    ...employeesRoutes, // Step 3: employees, departments, profiles, documents, Payroll dashboard
    ...salaryRoutes, // Step 3: salary, payroll runs, payslips, reports, payroll accounts
    ...essOvertimeRoutes, // Timesheet V1: stateful ESS overtime requests (replaces the static ones)
    ...timeAndSettingsRoutes, // Step 3: leave, attendance, holidays, overtime, reimbursements, settings
    ...timesheetRoutes, // Timesheet V1 (stateful, persisted per data mode)
    ...teamApprovalRoutes, // Timesheet V1 Slice 3: ESS - Manager Team Approvals
    ...payrollApprovalRoutes, // Timesheet V1 Slice 4: Payroll HR / Finance queues + timesheet summary
];
