import { useState } from 'react';

import { useAppDispatch, useAppSelector } from '@src/hooks/store';
import { showToast } from '@src/slices/apiSlice';
import { store } from '@store/store';

import { cancelOrderApi, downloadInvoiceApi, productReturnApi } from '../api/orderHistory';
import { setOrderDetails } from '../slices/orderDetailsSlice';
import {
    DownloadInvoiceRequestResponse,
    ProductReturnRequestResponse,
} from '../types/orderHistory';

export function useManageOrderApi() {
    const dispatch = useAppDispatch();

    const refresh = useAppSelector(state => state.reducer.orderDetails.refresh);
    const { role, id } = useAppSelector(state => state.reducer.auth);
    const [isLoading, setIsLoading] = useState(false);

    const cancelOrder = async (
        orderId: number,
        description: string,
        reason: string,
        otp: string,
        scope: string
    ) => {
        setIsLoading(true);
        const data: any | false = await cancelOrderApi({
            userId: id,
            userType: role,
            description,
            reason,
            orderId,
            otp,
            scope,
        });

        let success = false;
        if (data && data.status) {
            dispatch(setOrderDetails({ refresh: !refresh }));
            store.dispatch(
                showToast({
                    description: 'Order cancellation request raised successfully',
                    variant: 'success',
                })
            );
            success = true;
        }

        setIsLoading(false);
        return success;
    };

    const productReturn = async (
        orderId: number,
        description: string,
        reason: string,
        productId: number
    ) => {
        setIsLoading(true);
        const data: ProductReturnRequestResponse | false = await productReturnApi({
            userId: id,
            userType: role,
            description,
            reason,
            orderId,
            productId,
        });

        if (data) {
            dispatch(setOrderDetails({ refresh: !refresh }));
            store.dispatch(
                showToast({
                    description: 'Product return requested successfully',
                    variant: 'success',
                })
            );
            setIsLoading(false);
        } else {
            setIsLoading(false);
        }
    };

    const downloadInvoice = async (orderId: number) => {
        setIsLoading(true);
        const data: DownloadInvoiceRequestResponse | false = await downloadInvoiceApi({
            userId: id,
            userType: role,
            orderId,
        });

        if (data) {
            setIsLoading(false);
            return data;
        }
        setIsLoading(false);
        return false;
    };

    return { isLoading, cancelOrder, downloadInvoice, productReturn };
}
