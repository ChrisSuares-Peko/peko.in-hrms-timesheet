// PROTOTYPE-SETUP: ESS Service 1 — Payroll → Approvals (paths.payroll.approvals), the level-2 queues. A request
// reaches level 2 only after the reporting manager approves it (or straight away for the CEO, who has no manager),
// and only if Settings → Approvals routes that request type there.
// PROTOTYPE-SETUP (Final batch, Slice 4): queues Payroll (default) | HR | Admin (Finance only while something is
// routed to it). Payroll: "Timesheets waiting for Payroll" (the same review screen as the manager's), then attendance
// corrections and overtime. HR: leave and profile updates (profile updates have no manager step). Admin:
// reimbursements. Each queue shows what Settings routes to it.
import { useCallback, useEffect, useState } from 'react';

import { Alert, Badge, Empty, Flex, Segmented, Skeleton, Tabs, Typography } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';

import { hasTimesheets, hasTracking } from '@src/prototype/rules/attendance';

import { type Level2RequestType, getLevel2Counts } from '../api';
import type { Level2Role } from '../types';
import Level2Queue, { ROLE_NAME, TYPE_LABEL } from './Level2Queue';
import PayrollTimesheetsPanel from './PayrollTimesheetsPanel';
import { payrollLinks, useAtsSettings, usePayrollScope } from './usePayrollAts';

const { Text } = Typography;

type Counts = Record<Level2RequestType | 'timesheets', number>;
const ALL_ROLES: Level2Role[] = ['PAYROLL', 'HR', 'ADMIN', 'FINANCE'];
/** The order types appear in a queue. */
const TYPE_ORDER: Level2RequestType[] = ['attendance', 'overtime', 'leave', 'profile', 'reimbursement'];

const Level2ApprovalsPage = () => {
    const scope = usePayrollScope();
    const { settings, loading: settingsLoading } = useAtsSettings();
    const [params, setParams] = useSearchParams();
    const [counts, setCounts] = useState<Partial<Record<Level2Role, Counts>>>({});

    // Finance only while something is routed to it.
    const roles = ALL_ROLES.filter(r => r !== 'FINANCE' || (settings && Object.values(settings.level2).includes('FINANCE')));
    const roleParam = params.get('role') as Level2Role | null;
    const role: Level2Role = roleParam && roles.includes(roleParam) ? roleParam : 'PAYROLL';

    // 'none' mode has no attendance corrections or overtime; Timesheet only mode has no corrections.
    const available = (t: Level2RequestType) => {
        if (!settings) return false;
        if (t === 'attendance') return settings.mode !== 'timesheet' && hasTracking(settings.mode);
        if (t === 'overtime') return hasTracking(settings.mode);
        return true;
    };
    const routedTo = (r: Level2Role, t: Level2RequestType) => (t === 'profile' ? r === 'HR' : settings?.level2[t] === r);
    const types = TYPE_ORDER.filter(t => available(t) && routedTo(role, t));
    const timesheetsHere = Boolean(settings && hasTimesheets(settings.mode) && settings.level2.timesheet === role);
    const requested = params.get('type') as Level2RequestType | null;
    const type: Level2RequestType | undefined = requested && types.includes(requested) ? requested : types[0];

    const loadCounts = useCallback(async () => {
        const all = await Promise.all(ALL_ROLES.map(r => getLevel2Counts(scope, r)));
        const next: Partial<Record<Level2Role, Counts>> = {};
        ALL_ROLES.forEach((r, i) => {
            const c = all[i];
            if (c) next[r] = c;
        });
        setCounts(next);
    }, [scope]);

    useEffect(() => {
        loadCounts();
    }, [loadCounts]);

    const setParam = (key: 'role' | 'type', value: string) => {
        const next = new URLSearchParams(params);
        next.set(key, value);
        if (key === 'role') next.delete('type');
        setParams(next, { replace: true });
    };

    const total = (r: Level2Role) =>
        TYPE_ORDER.filter(t => available(t) && routedTo(r, t)).reduce((sum, t) => sum + (counts[r]?.[t] ?? 0), 0) + (counts[r]?.timesheets ?? 0);
    const routedLabel = [...(timesheetsHere ? ['timesheets'] : []), ...types.map(t => TYPE_LABEL[t].toLowerCase())].join(', ');

    return (
        <Flex vertical gap={16} className="w-full min-w-0">
            <Flex vertical gap={4}>
                <Text className="font-normal text-lg sm:text-2xl">Approvals</Text>
                <Text type="secondary" className="text-xs sm:text-sm">
                    Payroll, HR and Admin see a request after the employee&apos;s reporting manager approves it, and their approval is final. By
                    default timesheets, attendance corrections and overtime go to Payroll; leave and profile updates to HR; reimbursements to Admin.
                    Profile updates go straight to HR, with no manager step. See also <Link to={payrollLinks.timesheetStatus()}>Timesheet status</Link>.
                </Text>
            </Flex>

            <Segmented<Level2Role>
                value={role}
                onChange={r => setParam('role', r)}
                className="max-w-full self-start overflow-x-auto"
                options={roles.map(r => ({
                    value: r,
                    label: (
                        <Flex gap={6} align="center" className="px-1">
                            {ROLE_NAME[r]}
                            {total(r) > 0 && <Badge count={total(r)} size="small" />}
                        </Flex>
                    ),
                }))}
            />

            {settingsLoading && !settings && <Skeleton active paragraph={{ rows: 6 }} />}
            {!settingsLoading && !settings && <Alert type="error" showIcon message="Couldn't load approval settings." />}

            {settings && (
                <>
                    {routedLabel ? (
                        <Text type="secondary" className="text-xs">
                            Routed to {ROLE_NAME[role]} at level 2: {routedLabel}.
                        </Text>
                    ) : (
                        <Alert
                            type="info"
                            showIcon
                            message={`No requests are routed to ${ROLE_NAME[role]} right now`}
                            description={
                                <>
                                    Change the routing in <Link to={payrollLinks.settings}>Settings → Attendance &amp; Timesheet</Link>.
                                </>
                            }
                        />
                    )}
                    {timesheetsHere && <PayrollTimesheetsPanel roleName={ROLE_NAME[role]} onChanged={loadCounts} />}
                    {!routedLabel && !timesheetsHere && types.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`Nothing reaches ${ROLE_NAME[role]} at the moment.`} />}
                    {type && (
                        <>
                            <Tabs
                                activeKey={type}
                                onChange={t => setParam('type', t)}
                                items={types.map(t => ({
                                    key: t,
                                    label: (
                                        <Flex gap={6} align="center">
                                            {TYPE_LABEL[t]}
                                            {!!counts[role]?.[t] && <Badge count={counts[role]?.[t]} size="small" />}
                                        </Flex>
                                    ),
                                }))}
                            />
                            <Level2Queue key={`${role}:${type}`} role={role} type={type} onChanged={loadCounts} />
                        </>
                    )}
                </>
            )}
        </Flex>
    );
};

export default Level2ApprovalsPage;
