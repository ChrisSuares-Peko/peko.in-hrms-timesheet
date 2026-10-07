// PROTOTYPE-SETUP: the two ESS sidebar tabs and the employee each one runs as.
// ESS - Employee = the employee marked as the ESS persona in employees.ts; ESS - Manager = that employee's
// reporting manager (resolved from `managerEmployeeId`, see ESS_MANAGER). Both tabs mount the same pages.
import { ESS_EMPLOYEE, ESS_MANAGER, MockEmployee } from '@src/prototype/mocks/data/employees';
import { paths } from '@src/routes/paths';

export interface EssTab {
    /** Route prefix, e.g. /ess-employee */
    base: string;
    /** Path set with the same keys as paths.employee (home, attendance, leaves, ...). */
    paths: Record<string, string>;
    label: string;
    /** Short role label for the header, e.g. "Employee". */
    roleLabel: string;
    persona: MockEmployee;
}

export const ESS_TABS: EssTab[] = [
    {
        base: paths.essEmployee.index,
        paths: paths.essEmployee,
        label: 'ESS - Employee',
        roleLabel: 'Employee',
        persona: ESS_EMPLOYEE,
    },
    {
        base: paths.essManager.index,
        paths: paths.essManager,
        label: 'ESS - Manager',
        roleLabel: 'Manager',
        persona: ESS_MANAGER,
    },
];

export const essTabFor = (pathname: string): EssTab | undefined =>
    ESS_TABS.find(tab => pathname === tab.base || pathname.startsWith(`${tab.base}/`));
