// PROTOTYPE-SETUP: ESS Service 1 — who Attendance & Timesheet requests are made as. On the ESS tabs that is the
// tab's persona (useEssIdentity); in Payroll, the logged-in corporate user.
import { useMemo } from 'react';

import { useEssIdentity } from '@src/domains/employee/hooks/useEssIdentity';

import type { AtsScope } from '../api';

export const useAtsScope = (): AtsScope => {
    const { role, id } = useEssIdentity();
    return useMemo(() => ({ userType: role, userId: id }), [role, id]);
};

export default useAtsScope;
