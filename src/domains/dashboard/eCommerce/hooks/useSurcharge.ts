import { useCallback, useState } from 'react';

import { SurchargeResponse } from '@customtypes/general';
import { useAppSelector } from '@src/hooks/store';
import { getSurcharge } from '@src/services/surcharge';
import { accessKeys } from '@utils/accessKeys';

export default function GetSurcharge() {
    const { role, id } = useAppSelector(state => state.reducer.auth);
    const [, setSurchargeDetails] = useState<SurchargeResponse | null>(null);
    const [, setIsLoading] = useState(true);

    const getSurchargeData = useCallback(
        async (amount: string) => {
            const data: SurchargeResponse | false = await getSurcharge({
                userId: id,
                userType: role,
                amount: Number(amount),
                accessKey: accessKeys.ecommerceStore,
            });
            if (data) {
                setSurchargeDetails(data);
                return data;
            }
            setIsLoading(false);
            return null;
        },
        [id, role]
    );

    return { getSurchargeData };
}
