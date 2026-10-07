import { useCallback, useEffect, useState } from 'react';


import { useEssIdentity } from '@src/domains/employee/hooks/useEssIdentity';

import { EmployeeProfile, getEmployeeProfile } from '../api/onboarding';

// Local-state fetch (matches useOnboardingStatus.ts's pattern) rather than a
// Redux slice — this domain doesn't use Redux for employee data anywhere else.
export const useEmployeeProfile = () => {
    const { role, id } = useEssIdentity(); // PROTOTYPE-SETUP: ESS tab persona (else the session)
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<EmployeeProfile | null>(null);

    const load = useCallback(async () => {
        // Avoid firing employee-only requests during a role switch.
        if (role !== 'user') return;
        setLoading(true);
        try {
            const data = await getEmployeeProfile({ userType: role, userId: id });
            setProfile(data);
        } catch {
            setProfile(null);
        } finally {
            setLoading(false);
        }
    }, [role, id]);

    useEffect(() => {
        load();
    }, [load]);

    return { loading, profile, reload: load };
};
