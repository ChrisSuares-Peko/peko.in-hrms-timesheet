import { useEffect, useState } from 'react';


import { useEssIdentity } from '@src/domains/employee/hooks/useEssIdentity';

import { getMyPayslips } from '../api/payslips';
import { PayslipRow } from '../types';

export const useMyPayslips = (year: string) => {
    const { role, id } = useEssIdentity(); // PROTOTYPE-SETUP: ESS tab persona (else the session)
    const [rows, setRows] = useState<PayslipRow[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        getMyPayslips({ userType: role, userId: id }, { year }).then(data => {
            setRows(data ? data.rows : []);
            setLoading(false);
        });
    }, [role, id, year]);

    return { rows, loading };
};
