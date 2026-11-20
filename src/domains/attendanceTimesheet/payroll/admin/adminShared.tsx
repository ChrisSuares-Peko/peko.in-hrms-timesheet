// PROTOTYPE-SETUP (Payroll admin, Slice 1): shared building blocks for the Payroll module's service pages.
// PROTOTYPE-SETUP (Leave module, update — Payroll navigation): there are no service tabs any more. Admins open each
// service from Quick actions on the Payroll dashboard (each tile with what's waiting); a service page shows the
// breadcrumb "Payroll › Services › {service}" (src/prototype/persona/payrollServices.tsx) and PayrollServiceBar.
//   PayrollServiceBar ..... "‹ Back to dashboard" and what's waiting in this service
//   AdminSubTabs .......... Overview / Details / Requests (the sub-tab is in the URL: ?view=)
//   MonthSwitcher ......... the current month and the two before it
//   ServiceHeader ......... the page title and one line under it
// No settings controls anywhere here: Settings live in Payroll settings.
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { LeftOutlined } from '@ant-design/icons';
import { Flex, Segmented, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { Link, useSearchParams } from 'react-router-dom';

import { PAYROLL_DASHBOARD, type PayrollService } from '@src/prototype/persona/payrollServices';

import { getAdminCounts } from '../../api';
import type { AdminCounts, AtsMode } from '../../types';
import { usePayrollScope } from '../usePayrollAts';

export type { PayrollService } from '@src/prototype/persona/payrollServices';

/** The services offered for the company's mode (Timesheet off in Attendance only, Attendance off in Timesheet only). */
export const visibleServices = (mode: AtsMode | undefined): PayrollService[] =>
    (['timesheet', 'attendance', 'leave', 'overtime', 'reimbursement', 'employees', 'settings'] as PayrollService[]).filter(s => {
        if (s === 'timesheet') return mode !== 'attendance' && mode !== 'none';
        if (s === 'attendance') return mode !== 'timesheet' && mode !== 'none';
        if (s === 'overtime') return mode !== 'none';
        return true;
    });

/** What's waiting for the admin in a service. */
export const badgeOf = (counts: AdminCounts | null, s: PayrollService) => {
    if (!counts || s === 'settings') return 0;
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

/** On every service page, under the breadcrumb: the way back to the dashboard and what's waiting here. */
export const PayrollServiceBar = ({ active }: { active: PayrollService }) => {
    const counts = useAdminCounts();
    const waiting = badgeOf(counts, active);
    return (
        <Flex align="center" gap={8} wrap="wrap" className="mb-3" data-payroll-service-bar={active}>
            <Link to={PAYROLL_DASHBOARD} className="inline-flex items-center gap-1 text-sm font-medium !text-[#FF4F4F]" data-back-to-dashboard>
                <LeftOutlined className="text-xs" />
                Back to dashboard
            </Link>
            {waiting > 0 && (
                <Tag color="red" className="!m-0" data-service-waiting>
                    {waiting} waiting for you
                </Tag>
            )}
        </Flex>
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

/** A total: label, value, and a small line under it. */
export const CountTile = ({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) => (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[20px] border border-solid border-[#e6e6e6] bg-white px-4 py-3" data-count-tile={label}>
        <Typography.Text type="secondary" className="text-xs">
            {label}
        </Typography.Text>
        <Typography.Text className="truncate text-xl font-semibold tabular-nums" style={{ color: color ?? '#171717' }} data-count-value>
            {value}
        </Typography.Text>
        {sub && (
            <Typography.Text type="secondary" className="text-xs">
                {sub}
            </Typography.Text>
        )}
    </div>
);
