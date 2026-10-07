// PROTOTYPE-SETUP: reads the company's Attendance & Timesheet settings (mode, submission day, routing).
// `scope` defaults to the ESS identity so it works on the ESS tabs as well as in Payroll.
import { useEffect, useState } from 'react';

import { useEssIdentity } from '@src/domains/employee/hooks/useEssIdentity';

import { getTimesheetSettings } from '../api';
import type { TimesheetSettings } from '../types';

export const useTimesheetSettings = () => {
    const { role, id } = useEssIdentity();
    const [settings, setSettings] = useState<TimesheetSettings | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        getTimesheetSettings({ userType: role, userId: id }).then(res => {
            if (cancelled) return;
            if (res) setSettings(res);
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [role, id]);

    return { settings, loading };
};

export default useTimesheetSettings;
