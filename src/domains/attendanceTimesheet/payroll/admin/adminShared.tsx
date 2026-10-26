// PROTOTYPE-SETUP (Payroll admin, Slice 1): shared building blocks for the Payroll module's service tabs.
//   PayrollServiceTabs .... Timesheet · Attendance · Leave · Overtime · Reimbursements · Employees, each with a badge of
//                           what's waiting for the admin (Timesheet hidden in Attendance only mode, Attendance in
//                           Timesheet only mode; both in 'none' mode). Every service page shows it at the top.
//   AdminSubTabs .......... Overview / Details / Requests (the sub-tab is in the URL: ?view=)
//   MonthSwitcher ......... the current month and the two before it
//   ServiceHeader ......... the page title and one line under it
// No settings controls anywhere here: Settings live in Payroll settings.
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { Badge, Flex, Segmented, Tabs, Typography } from 'antd';
import dayjs from 'dayjs';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { paths } from '@src/routes/paths';

import { getAdminCounts } from '../../api';
import type { AdminCounts, AtsMode } from '../../types';
import { useAtsSettings, usePayrollScope } from '../usePayrollAts';

export type PayrollService = 'timesheet' | 'attendance' | 'leave' | 'overtime' | 'reimbursement' | 'employees';

const P = (slug: string) => `/${paths.payroll.index}/${slug}`;

/** Where each service lives (Attendance and Employees are the existing pages). */
export const serviceLinks: Record<PayrollService, string> = {
    timesheet: P(paths.payroll.serviceTimesheet),
    attendance: P(paths.payroll.timesheet),
    leave: P(paths.payroll.serviceLeave),
    overtime: P(paths.payroll.serviceOvertime),
    reimbursement: P(paths.payroll.serviceReimbursements),
    employees: P(paths.payroll.employees),
};

const LABEL: Record<PayrollService, string> = {
    timesheet: 'Timesheet',
    attendance: 'Attendance',
    leave: 'Leave',
    overtime: 'Overtime',
    reimbursement: 'Reimbursements',
    employees: 'Employees',
};

/** The service tabs for the company's mode. */
export const visibleServices = (mode: AtsMode | undefined): PayrollService[] =>
    (['timesheet', 'attendance', 'leave', 'overtime', 'reimbursement', 'employees'] as PayrollService[]).filter(s => {
        if (s === 'timesheet') return mode !== 'attendance' && mode !== 'none';
        if (s === 'attendance') return mode !== 'timesheet' && mode !== 'none';
        return true;
    });

/** The badge for a service: what's waiting for the admin. */
export const badgeOf = (counts: AdminCounts | null, s: PayrollService) => {
    if (!counts) return 0;
    if (s === 'employees') return counts.profile;
    return counts[s];
};

const CHANGED = 'payroll-admin-changed';

/** Tell the service tabs (and anyone listening) that something was decided, so badges refresh. */
export const notifyAdminChanged = () => window.dispatchEvent(new Event(CHANGED));

/** The admin's waiting counts, refreshed whenever a decision is made. */
export const useAdminCounts = () => {
    const scope = usePayrollScope();
    const [counts, setCounts] = useState<AdminCounts | null>(null);
    const load = useCallback(async () => {
        const res = await getAdminCounts(scope);
        if (res) setCounts(res);
    }, [scope]);
    useEffect(() => {
        load();
        window.addEventListener(CHANGED, load);
        return () => window.removeEventListener(CHANGED, load);
    }, [load]);
    return counts;
};

export const PayrollServiceTabs = ({ active }: { active: PayrollService }) => {
    const navigate = useNavigate();
    const { settings } = useAtsSettings();
    const counts = useAdminCounts();
    const services = visibleServices(settings?.mode);
    return (
        <Tabs
            activeKey={active}
            onChange={key => navigate(serviceLinks[key as PayrollService])}
            className="mb-2"
            data-payroll-services
            items={services.map(s => ({
                key: s,
                label: (
                    <Flex gap={6} align="center" data-service-tab={s}>
                        <span>{LABEL[s]}</span>
                        {badgeOf(counts, s) > 0 && <Badge count={badgeOf(counts, s)} size="small" color="#FF4F4F" data-service-badge={s} />}
                    </Flex>
                ),
            }))}
        />
    );
};

export const ServiceHeader = ({ title, line, actions }: { title: string; line: string; actions?: ReactNode }) => (
    <Flex justify="space-between" align="flex-start" wrap="wrap" gap={8} className="mb-3">
        <div className="min-w-0">
            <Typography.Title level={4} className="!mb-0.5">
                {title}
            </Typography.Title>
            <Typography.Text type="secondary" className="text-sm">
                {line}
            </Typography.Text>
        </div>
        {actions}
    </Flex>
);

export type AdminView = 'overview' | 'details' | 'requests';

/** The sub-tab, kept in ?view= (default: the first one offered). */
export const useAdminView = (views: AdminView[]): [AdminView, (v: AdminView) => void] => {
    const [params, setParams] = useSearchParams();
    const asked = params.get('view') as AdminView | null;
    const view = asked && views.includes(asked) ? asked : views[0];
    const set = (v: AdminView) => {
        const next = new URLSearchParams(params);
        next.set('view', v);
        setParams(next, { replace: true });
    };
    return [view, set];
};

export const AdminSubTabs = ({ value, options, onChange }: { value: AdminView; options: { value: AdminView; label: string }[]; onChange: (v: AdminView) => void }) => (
    <div className="mb-4 max-w-full overflow-x-auto">
        <Segmented<AdminView> value={value} onChange={onChange} options={options} data-admin-subtabs />
    </div>
);

/** The current month and the two before it ("YYYY-MM"). */
export const recentMonths = (today = dayjs()) => [0, 1, 2].map(n => today.subtract(n, 'month').format('YYYY-MM'));

export const MonthSwitcher = ({ value, onChange }: { value: string; onChange: (m: string) => void }) => (
    <div className="mb-3 max-w-full overflow-x-auto">
        <Segmented<string>
            value={value}
            onChange={onChange}
            options={recentMonths().map(m => ({ value: m, label: dayjs(`${m}-01`).format('MMMM YYYY') }))}
            data-month-switcher
        />
    </div>
);
