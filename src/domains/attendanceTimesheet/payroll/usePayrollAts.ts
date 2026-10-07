// PROTOTYPE-SETUP: ESS Service 1 — Payroll (HR admin) side of Attendance & Timesheet. Requests are made as the
// logged-in corporate user, and the Payroll screens share one way of reading the ATS settings.
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppSelector } from '@src/hooks/store';
import { paths } from '@src/routes/paths';

import { getAtsSettings, type AtsScope } from '../api';
import type { AtsSettings } from '../types';

/** The corporate user, e.g. { userType: 'corporate', userId: 1001 }. */
export const usePayrollScope = (): AtsScope => {
    const { role, id } = useAppSelector(s => s.reducer.auth);
    return useMemo(() => ({ userType: role, userId: id }), [role, id]);
};

/** Current ATS settings for the company. `settings` is null until loaded (or if the request failed). */
export const useAtsSettings = () => {
    const scope = usePayrollScope();
    const [settings, setSettings] = useState<AtsSettings | null>(null);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(async () => {
        setLoading(true);
        const res = await getAtsSettings(scope);
        if (res) setSettings(res);
        setLoading(false);
    }, [scope]);

    useEffect(() => {
        reload();
    }, [reload]);

    return { settings, setSettings, loading, reload };
};

/** Absolute links to the Payroll screens used from the ATS pages. */
export const payrollLinks = {
    runPayroll: `/${paths.payroll.index}/${paths.payroll.salaryProcess}`,
    timesheetStatus: (month?: string) =>
        `/${paths.payroll.index}/${paths.payroll.timesheets}${month ? `?month=${month}` : ''}`,
    approvals: `/${paths.payroll.index}/${paths.payroll.approvals}`,
    settings: `/${paths.payroll.index}/${paths.payroll.payrollSettings}?activeTab=10`,
};
