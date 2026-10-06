import { useState } from 'react';

import { useNavigate } from 'react-router-dom';

import { setPaymentData } from '@domains/dashboard/payments/slices/payment';
import { useAppDispatch, useAppSelector } from '@src/hooks/store';
import { paths } from '@src/routes/paths';
import { getSurcharge } from '@src/services/surcharge';
import { showToast } from '@src/slices/apiSlice';
import { accessKeys } from '@utils/accessKeys';
import { formatNumberWithLocalString, roundMoney } from '@utils/priceFormat';

import {
    IssuePhysicalCardByAdminPayload,
    preflightPhysicalCardOrder,
} from '../../api/admin/issueCardApi';
import { CardQuota } from '../../api/user/cardQuotaApi';

interface StartPurchaseArgs {
    quota: CardQuota;
    cardIssuanceId: string;
    holderName: string;
    delivery?: IssuePhysicalCardByAdminPayload;
    cardRequestId?: number;
}

const CARDS_PATH = `/${paths.dashboard.corporateCard}`;

const GENERIC_ERROR =
    'Something went wrong. If the issue persists, please contact support at reach@peko.one';

/**
 * Hands an unpaid physical card off to the shared /payments screen.
 *
 * The delivery details ride inside the payload because paymentGateway persists the whole body and replays
 * it to its fulfilment handler — that is what carries the address across the Cashfree round trip.
 */
export const usePhysicalCardPurchase = () => {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const { role, id } = useAppSelector(state => state.reducer.auth);
    const [isPreparing, setIsPreparing] = useState(false);

    const startPurchase = async ({
        quota,
        cardIssuanceId,
        holderName,
        delivery,
        cardRequestId,
    }: StartPurchaseArgs) => {
        setIsPreparing(true);

        const preflight = await preflightPhysicalCardOrder(role, id, {
            cardIssuanceId,
            ...(cardRequestId ? { cardRequestId } : {}),
        });
        if (!preflight || !preflight.ok) {
            setIsPreparing(false);
            dispatch(
                showToast({
                    variant: 'error',
                    description: preflight?.message || GENERIC_ERROR,
                })
            );
            return false;
        }

        const amount = roundMoney(quota.unitPrice);

        const surcharge = await getSurcharge({
            userId: id,
            userType: role,
            amount,
            accessKey: accessKeys.corporateCards,
            quantity: 1,
        });
        setIsPreparing(false);

        // A missing surcharge is not zero — the server recomputes and would reject the mismatch, so stop
        // rather than send the admin to a payment that cannot succeed.
        if (!surcharge) return false;

        const platformFee = Number(surcharge.surcharge) || 0;
        const total = roundMoney(amount + platformFee);

        dispatch(
            setPaymentData({
                title: 'Bill Summary',
                billSummary: [
                    { key: 'Service name', value: 'Physical Card' },
                    { key: 'Cardholder', value: holderName },
                    {
                        key: 'Amount (inclusive of GST)',
                        value: `₹ ${formatNumberWithLocalString(amount)}`,
                    },
                ],
                paymentSummary: [
                    {
                        key: 'Platform fee (inclusive of GST)',
                        value: `₹ ${formatNumberWithLocalString(platformFee)}`,
                    },
                ],
                totalAmount: total,
                earningCashbackAmount: Number(surcharge.corporateCashback) || 0,
                payload: {
                    accessKey: accessKeys.corporateCards,
                    amount,
                    pgAmount: total,
                    quantity: 1,
                    cardIssuanceId,
                    ...(cardRequestId ? { cardRequestId } : {}),
                    ...(delivery ? { shipping: delivery } : {}),
                    transactionId: new Date().valueOf(),
                    currentUrl: window.location.href,
                },
                // Cashfree only — an extra physical card is not payable from the card wallet.
                url: null,
                navigatePath: CARDS_PATH,
            })
        );

        navigate(paths.dashboard.payments);
        return true;
    };

    return { startPurchase, isPreparing };
};
