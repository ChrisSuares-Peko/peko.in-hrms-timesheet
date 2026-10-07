// PROTOTYPE-SETUP: ESS Service 1 — Payroll → Approvals (paths.payroll.approvals). The HR and Finance level-2
// queues. A request reaches them only after the reporting manager approves it (or straight away for the CEO,
// who has no manager), and only if Settings → Approval matrix routes that request type to them. Timesheets
// are approved by managers only, so they aren't here. Replaces the Timesheet V1 Level2Approvals page.
import { useCallback, useEffect, useState } from 'react';

import { Alert, Badge, Flex, Segmented, Skeleton, Tabs, Typography } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';

import { type AtsRequestType, getLevel2Counts } from '../api';
import type { Level2Role } from '../types';
import Level2Queue, { ROLE_NAME, TYPE_LABEL } from './Level2Queue';
import { payrollLinks, useAtsSettings, usePayrollScope } from './usePayrollAts';

const { Text } = Typography;

type Counts = Record<AtsRequestType, number>;
const ROLES: Level2Role[] = ['HR', 'FINANCE'];

const Level2ApprovalsPage = () => {
    const scope = usePayrollScope();
    const { settings, loading: settingsLoading } = useAtsSettings();
    const [params, setParams] = useSearchParams();
    const [counts, setCounts] = useState<Partial<Record<Level2Role, Counts>>>({});

    const role: Level2Role = params.get('role') === 'FINANCE' ? 'FINANCE' : 'HR';
    const types: AtsRequestType[] =
        settings?.mode === 'timesheet' ? ['overtime'] : ['attendance', 'overtime'];
    const routed = types.filter(t => settings?.level2[t] === role);
    const requested = params.get('type') as AtsRequestType | null;
    const type: AtsRequestType =
        requested && types.includes(requested) ? requested : (routed[0] ?? types[0]);

    const loadCounts = useCallback(async () => {
        const [hr, finance] = await Promise.all([
            getLevel2Counts(scope, 'HR'),
            getLevel2Counts(scope, 'FINANCE'),
        ]);
        setCounts({ ...(hr ? { HR: hr } : {}), ...(finance ? { FINANCE: finance } : {}) });
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

    const total = (r: Level2Role) => types.reduce((sum, t) => sum + (counts[r]?.[t] ?? 0), 0);
    const routedLabel = routed.map(t => TYPE_LABEL[t].toLowerCase()).join(' and ');

    return (
        <Flex vertical gap={16} className="w-full min-w-0">
            <Flex vertical gap={4}>
                <Text className="font-normal text-lg sm:text-2xl">Approvals</Text>
                <Text type="secondary" className="text-xs sm:text-sm">
                    HR and Finance see a request after the employee&apos;s reporting manager approves
                    it. Their approval is final. Timesheets are approved by managers only — see{' '}
                    <Link to={payrollLinks.timesheetStatus()}>Timesheet status</Link>.
                </Text>
            </Flex>

            <Segmented<Level2Role>
                value={role}
                onChange={r => setParam('role', r)}
                className="self-start"
                options={ROLES.map(r => ({
                    value: r,
                    label: (
                        <Flex gap={6} align="center" className="px-1">
                            Act as {ROLE_NAME[r]}
                            {total(r) > 0 && <Badge count={total(r)} size="small" />}
                        </Flex>
                    ),
                }))}
            />

            {settingsLoading && !settings && <Skeleton active paragraph={{ rows: 6 }} />}
            {!settingsLoading && !settings && (
                <Alert type="error" showIcon message="Couldn't load approval settings." />
            )}

            {settings && (
                <>
                    {routed.length > 0 ? (
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
                                    Older requests that went through {ROLE_NAME[role]} still show
                                    under All requests. Change the routing in{' '}
                                    <Link to={payrollLinks.settings}>
                                        Settings → Attendance &amp; Timesheet
                                    </Link>
                                    .
                                </>
                            }
                        />
                    )}
                    <Tabs
                        activeKey={type}
                        onChange={t => setParam('type', t)}
                        items={types.map(t => ({
                            key: t,
                            label: (
                                <Flex gap={6} align="center">
                                    {TYPE_LABEL[t]}
                                    {!!counts[role]?.[t] && (
                                        <Badge count={counts[role]?.[t]} size="small" />
                                    )}
                                </Flex>
                            ),
                        }))}
                    />
                    <Level2Queue
                        key={`${role}:${type}`}
                        role={role}
                        type={type}
                        onChanged={loadCounts}
                    />
                </>
            )}
        </Flex>
    );
};

export default Level2ApprovalsPage;
