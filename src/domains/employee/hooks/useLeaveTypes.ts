import { useEffect, useState } from 'react';


import { useEssIdentity } from '@src/domains/employee/hooks/useEssIdentity';

import { getLeaveBalance } from '../api/leaves';

export const useLeaveTypes = () => {
    const { role, id } = useEssIdentity(); // PROTOTYPE-SETUP: ESS tab persona (else the session)
    const [leaveTypes, setLeaveTypes] = useState<{ label: string; value: string }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getLeaveBalance({ userType: role, userId: id })
            .then(balance => setLeaveTypes(balance.map(b => ({ label: b.label, value: b.value }))))
            .finally(() => setLoading(false));
    }, [role, id]);

    return { leaveTypes, loading };
};
