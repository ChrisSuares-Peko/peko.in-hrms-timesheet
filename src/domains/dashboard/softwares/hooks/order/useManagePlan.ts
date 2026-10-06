import { useCallback, useState } from 'react';

import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';

import { useAppSelector } from '@src/hooks/store';
import { showToast } from '@src/slices/apiSlice';

import { cancelPlan } from '../../api';
import { IPurchaseItem } from '../../types/product';

const useManagePlan = () => {
    const { state } = useLocation();
    const [isLoading, setIsLoading] = useState(false);
    const dispatch = useDispatch();
    const order: IPurchaseItem = state?.order;

    const { role, id } = useAppSelector(s => s.reducer.auth);

    const handleCancelPlan = useCallback(async () => {
        setIsLoading(true);
        const resp = await cancelPlan({
            userId: id,
            userType: role,
            orderId: order.orderId,
        });
        if (resp) {
            // update here
            dispatch(showToast({ variant: 'success', description: `plan cancelled successfully` }));
        }
        setIsLoading(false);
    }, [id, role, order, dispatch]);

    return { order, handleCancelPlan, isLoading };
};

export default useManagePlan;
