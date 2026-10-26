// PROTOTYPE-SETUP (Settings, Slice 1): approval wording with real names — the approve toast ("Approved, sent to Priya
// Nair" / "… sent to Payroll team") and the "Approval: …" line on the employee's forms.
import { useEffect, useState } from 'react';

import { pendingStep, stepName } from '@src/prototype/rules/attendance';

import { getApprovalLines } from '../api';
import { useAtsScope } from '../hooks/useAtsScope';
import type { RequestItem } from '../types';

/** After an approval: where it went next, or that it's done. */
export const approvedToast = (res: Pick<RequestItem, 'trail'> | null | undefined, fallback = 'Request approved') => {
    const next = res ? pendingStep(res.trail) : null;
    return next ? `Approved, sent to ${stepName(next)}` : fallback;
};

type LineType = 'attendance' | 'overtime' | 'leave' | 'reimbursement' | 'timesheet';

/** "Approval: Arjun Mehta (manager), then Payroll team." for a request type ('' until loaded). */
export const useApprovalLine = (type: LineType, enabled = true) => {
    const scope = useAtsScope();
    const [line, setLine] = useState('');
    useEffect(() => {
        if (!enabled) return undefined;
        let alive = true;
        getApprovalLines(scope).then(res => {
            if (alive && res) setLine(res[type]);
        });
        return () => {
            alive = false;
        };
    }, [scope, type, enabled]);
    return line;
};
