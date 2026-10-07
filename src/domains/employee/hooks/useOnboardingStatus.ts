import { useCallback, useEffect, useState } from 'react';


import { useEssIdentity } from '@src/domains/employee/hooks/useEssIdentity';

import { EmployeeProfile, getEmployeeProfile } from '../api/onboarding';

// Completion is a real backend flag (Employee.isCompleted), set once the Emergency
// Contact step succeeds — unlike AE, which infers it client-side from field presence.
export const useOnboardingStatus = () => {
    const { role, id } = useEssIdentity(); // PROTOTYPE-SETUP: ESS tab persona (else the session)
    const [loading, setLoading] = useState(true);
    const [isComplete, setIsComplete] = useState(false);
    const [profile, setProfile] = useState<EmployeeProfile | null>(null);

    const load = useCallback(async () => {
        // Avoid firing employee-only requests during a role switch.
        if (role !== 'user') return;
        setLoading(true);
        try {
            const data = await getEmployeeProfile({ userType: role, userId: id });
            setProfile(data);
            setIsComplete(Boolean(data?.isCompleted));
        } catch {
            setIsComplete(false);
        } finally {
            setLoading(false);
        }
    }, [role, id]);

    useEffect(() => {
        load();
    }, [load]);

    return { loading, isComplete, profile, reload: load };
};
