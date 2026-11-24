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

import { Segmented, Typography } from 'antd';
import dayjs from 'dayjs';
import { useSearchParams } from 'react-router-dom';

import { PekoBackLink, PekoPageHeader, PekoSectionTabs } from '@src/components/peko/PageHeader';
import { PEKO_CARD, PEKO_STAT_LABEL, PEKO_STAT_VALUE } from '@src/components/peko/pekoTokens';
import StatusTag from '@src/components/peko/StatusTag';
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
        <PekoBackLink
            to={PAYROLL_DASHBOARD}
            label="Back to dashboard"
            data-payroll-service-bar={active}
            extra={
                waiting > 0 && (
                    <StatusTag tone="error" data-service-waiting>
                        {waiting} waiting for you
                    </StatusTag>
                )
            }
        />
    );
};

/** Title (20px medium #404040) and one grey line; `actions` sit on the right of the title (prefer AdminSubTabs' actions). */
export const ServiceHeader = ({ title, line, actions }: { title: string; line: string; actions?: ReactNode }) => (
    <PekoPageHeader title={title} description={line} actions={actions} />
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

/** The sub-tabs (antd line Tabs — Peko One section switchers), with the page's actions on the tab bar. */
export const AdminSubTabs = ({
    value,
    options,
    onChange,
    actions,
}: {
    value: AdminView;
    options: { value: AdminView; label: string }[];
    onChange: (v: AdminView) => void;
    actions?: ReactNode;
}) => (
    <PekoSectionTabs<AdminView>
        value={value}
        onChange={onChange}
        actions={actions}
        items={options.map(o => {
            const m = /^(.*) \((\d+)\)$/.exec(o.label);
            return m ? { value: o.value, label: m[1], count: Number(m[2]) } : { value: o.value, label: o.label };
        })}
        data-admin-subtabs
    />
);

/** The current month and the two before it ("YYYY-MM"). */
export const recentMonths = (today = dayjs()) => [0, 1, 2].map(n => today.subtract(n, 'month').format('YYYY-MM'));

export const MonthSwitcher = ({ value, onChange }: { value: string; onChange: (m: string) => void }) => (
    <div className="mb-4 max-w-full overflow-x-auto">
        <Segmented<string>
            value={value}
            onChange={onChange}
            options={recentMonths().map(m => ({ value: m, label: dayjs(`${m}-01`).format('MMMM YYYY') }))}
            data-month-switcher
        />
    </div>
);

/** A stat card: label 13px grey, value 24px medium #121212, and a small line under it. */
export const CountTile = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
    <div className={`flex min-w-0 flex-col gap-1 ${PEKO_CARD} !p-5`} data-count-tile={label}>
        <span className={PEKO_STAT_LABEL}>{label}</span>
        <span className={`truncate leading-8 tabular-nums ${PEKO_STAT_VALUE}`} data-count-value>
            {value}
        </span>
        {sub && (
            <Typography.Text type="secondary" className="text-xs">
                {sub}
            </Typography.Text>
        )}
    </div>
);
