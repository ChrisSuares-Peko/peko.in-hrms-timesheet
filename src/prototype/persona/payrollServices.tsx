// PROTOTYPE-SETUP (Leave module, update — Payroll navigation): the Payroll side has no service tabs. Admins open each
// service from Quick actions on the Payroll dashboard; a service page shows the breadcrumb
// "Payroll › Services › {service}" (rendered by the layout's CustomBreadcrumb) and a way back to the dashboard.
// Spec: docs/dev-notes/dev-notes.json (pay:dashboard, and guide.shared).
import { Typography } from 'antd';
import { Link } from 'react-router-dom';

import { paths } from '@src/routes/paths';

export type PayrollService = 'timesheet' | 'attendance' | 'leave' | 'overtime' | 'reimbursement' | 'employees' | 'settings';

const P = (slug: string) => `/${paths.payroll.index}/${slug}`;

/** The Payroll dashboard, and its Quick actions section. */
export const PAYROLL_DASHBOARD = `/${paths.payroll.index}`;
export const QUICK_ACTIONS_ID = 'quick-actions';

/** Where each service lives (Attendance, Employees and Payroll settings are the existing pages). */
export const serviceLinks: Record<PayrollService, string> = {
    timesheet: P(paths.payroll.serviceTimesheet),
    attendance: P(paths.payroll.timesheet),
    leave: P(paths.payroll.serviceLeave),
    overtime: P(paths.payroll.serviceOvertime),
    reimbursement: P(paths.payroll.serviceReimbursements),
    employees: P(paths.payroll.employees),
    settings: P(paths.payroll.payrollSettings),
};

export const SERVICE_LABEL: Record<PayrollService, string> = {
    timesheet: 'Timesheet',
    attendance: 'Attendance',
    leave: 'Leave',
    overtime: 'Overtime',
    reimbursement: 'Reimbursements',
    employees: 'Employees',
    settings: 'Payroll settings',
};

/** The service a pathname is (the service page itself, not its sub-pages), or null. */
export const serviceOfPath = (pathname: string): PayrollService | null => {
    const clean = pathname.replace(/\/+$/, '');
    const hit = (Object.keys(serviceLinks) as PayrollService[]).find(s => serviceLinks[s].toLowerCase() === clean.toLowerCase());
    return hit ?? null;
};

/** "Payroll › Services › {service}" for a service page (null elsewhere). */
export const payrollServiceCrumbs = (pathname: string) => {
    const s = serviceOfPath(pathname);
    if (!s) return null;
    const link = (key: string, to: string, label: string) => ({
        key,
        title: (
            <Link to={to}>
                <Typography.Text className="font-normal text-sm text-[var(--peko-muted)]">{label}</Typography.Text>
            </Link>
        ),
    });
    return [
        link('payroll', PAYROLL_DASHBOARD, 'Payroll'),
        link('payroll-services', `${PAYROLL_DASHBOARD}#${QUICK_ACTIONS_ID}`, 'Services'),
        { key: `service-${s}`, title: <Typography.Text className="font-normal text-sm text-[var(--peko-primary)]">{SERVICE_LABEL[s]}</Typography.Text> },
    ];
};
