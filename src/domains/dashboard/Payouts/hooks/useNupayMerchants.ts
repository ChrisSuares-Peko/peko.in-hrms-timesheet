import { useEffect, useState } from 'react';

import { useAppSelector } from '@src/hooks/store';

import { getNupayOnboardingStatus } from '../api';
import { NupayOnboardingStatusData } from '../types';

export default function useNupayMerchants() {
    const { role, id } = useAppSelector(state => state.reducer.auth);
    const [isLoading, setLoading] = useState(true);
    const [statusData, setStatusData] = useState<NupayOnboardingStatusData | null>(null);

    useEffect(() => {
        getNupayOnboardingStatus(role, id).then(res => {
            setStatusData(res);
            setLoading(false);
        });
    }, [role, id]);

    return { statusData, isLoading };
}
