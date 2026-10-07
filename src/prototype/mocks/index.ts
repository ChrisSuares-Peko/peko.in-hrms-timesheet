// PROTOTYPE-SETUP: registry of every mock endpoint. Handlers live in ./handlers and read data from ./data.
// Order matters only when two patterns match the same URL: the first one wins, so list specific
// patterns (payroll/employee/count) before generic ones (payroll/employee/:employeeId).
import { accessRoutes } from './handlers/access';
import { employeesRoutes } from './handlers/employees';
import { lookupRoutes } from './handlers/lookups';
import { salaryRoutes } from './handlers/salary';
import { shellRoutes } from './handlers/shell';
import { timeAndSettingsRoutes } from './handlers/timeAndSettings';
import type { MockRoute } from './router';

export const mockRoutes: MockRoute[] = [
    ...accessRoutes, // Step 2: unlock access — first: holds specific payroll/employee/* sub-paths
    ...shellRoutes, // header / notifications / search, called on every page
    ...lookupRoutes, // static dropdown reference data (states, company sizes, ...)
    ...employeesRoutes, // Step 3: employees, departments, profiles, documents, Payroll dashboard
    ...salaryRoutes, // Step 3: salary, payroll runs, payslips, reports, payroll accounts
    ...timeAndSettingsRoutes, // Step 3: leave, attendance, holidays, overtime, reimbursements, settings
];
