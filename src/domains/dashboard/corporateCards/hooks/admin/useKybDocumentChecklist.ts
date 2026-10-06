import { useCallback, useEffect, useState } from 'react';

import { useAppSelector } from '@src/hooks/store';

import {
    getKybDocumentChecklist,
    KybBusinessTypeChecklist,
    KybChecklistDocument,
} from '../../api/admin/kybStatusApi';

/**
 * Which documents each constitution has to produce is a compliance rule, so it is served by the backend
 * rather than duplicated here. The whole catalogue arrives in one call, so switching the business type
 * changes the checklist without another round trip.
 */
export const useKybDocumentChecklist = () => {
    const { role, id } = useAppSelector(state => state.reducer.auth);
    const [businessTypes, setBusinessTypes] = useState<KybBusinessTypeChecklist[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    const fetchChecklist = useCallback(async () => {
        setIsLoading(true);
        const res = await getKybDocumentChecklist(role, id);
        const types = res && res.data?.businessTypes ? res.data.businessTypes : [];
        setBusinessTypes(types);
        setFailed(types.length === 0);
        setIsLoading(false);
    }, [role, id]);

    useEffect(() => {
        fetchChecklist();
    }, [fetchChecklist]);

    const options = businessTypes.map(type => ({ label: type.label, value: type.value }));

    const documentsFor = (businessType?: string): KybChecklistDocument[] =>
        businessTypes.find(type => type.value === businessType)?.documents ?? [];

    return { businessTypes, options, documentsFor, isLoading, failed, refetch: fetchChecklist };
};
