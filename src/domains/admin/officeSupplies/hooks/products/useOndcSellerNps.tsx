import { useCallback, useEffect, useState } from 'react';

import { useAppSelector } from '@src/hooks/store';

import { getOndcSellerNps, setOndcSellerNpEnabledApi } from '../../api/ondcSellerNps';
import { AdminOndcSellerNp, OndcSellerNpsQuery } from '../../types/ondcSellerNp';

/** Admin seller NP list + enable toggle (Products → Seller NPs tab). */
const useOndcSellerNps = (filters: OndcSellerNpsQuery) => {
    const { role, id } = useAppSelector(state => state.reducer.auth);
    const [isLoading, setIsLoading] = useState(false);
    const [count, setCount] = useState(0);
    const [tableData, setTableData] = useState<AdminOndcSellerNp[]>([]);

    const fetchList = useCallback(async () => {
        setIsLoading(true);
        const data = await getOndcSellerNps({ userId: id, userType: role, ...filters });
        if (data) {
            setTableData(data.data || []);
            setCount(data.recordsTotal || 0);
        } else {
            setTableData([]);
            setCount(0);
        }
        setIsLoading(false);
    }, [id, role, filters]);

    const toggleEnabled = async (npId: number, enabled: boolean) => {
        setTableData(prev => prev.map(row => (row.id === npId ? { ...row, enabled } : row)));
        const ok = await setOndcSellerNpEnabledApi({
            userId: id,
            userType: role,
            id: npId,
            enabled,
        });
        if (!ok) {
            setTableData(prev =>
                prev.map(row => (row.id === npId ? { ...row, enabled: !enabled } : row))
            );
        }
        return !!ok;
    };

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    return { isLoading, tableData, count, toggleEnabled, refetch: fetchList };
};

export default useOndcSellerNps;
