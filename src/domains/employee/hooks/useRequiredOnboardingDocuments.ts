import { useEffect, useState } from 'react';


import { useEssIdentity } from '@src/domains/employee/hooks/useEssIdentity';

import { RequiredOnboardingDocument, getRequiredOnboardingDocuments } from '../api/onboarding';

// Fetches the HR-configured documents this employee must upload during onboarding.
export const useRequiredOnboardingDocuments = () => {
    const { role, id } = useEssIdentity(); // PROTOTYPE-SETUP: ESS tab persona (else the session)
    const [documents, setDocuments] = useState<RequiredOnboardingDocument[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Avoid firing employee-only requests during a role switch.
        if (role !== 'user') return undefined;
        let active = true;
        setLoading(true);
        getRequiredOnboardingDocuments({ userType: role, userId: id })
            .then(docs => active && setDocuments(docs ?? []))
            .catch(() => active && setDocuments([]))
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [role, id]);

    return { documents, loading };
};
