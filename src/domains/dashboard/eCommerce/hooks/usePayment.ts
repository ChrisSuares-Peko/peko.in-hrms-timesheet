import { useCallback, useState } from 'react';

import { capitalize } from 'lodash';
import { useNavigate } from 'react-router-dom';

import { useAppDispatch } from '@src/hooks/store';
import { paths } from '@src/routes/paths';
import { accessKeys } from '@utils/accessKeys';

import GetSurcharge from './useSurcharge';
import { setPaymentData } from '../../payments/slices/payment';
import { PlanType } from '../types';

const formatNumber = (value: number) => new Intl.NumberFormat('en-IN').format(value);

export default function usePayment() {
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const { getSurchargeData } = GetSurcharge();
    const path =
        window.location.href.toLocaleLowerCase()?.split('/plan-details')[0] || window.location.href;
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmission = useCallback(
        async (
            plan: string,
            duration: PlanType,
            planId: number,
            planPrice: string | number,
            creditAmount = 0,
            discount: string | number = 0
        ) => {
            try {
                setIsLoading(true);

                const planPriceNumber = parseFloat(`${planPrice}`) || 0;
                const discountNumber = parseFloat(`${discount}`) || 0;
                const originalNumber = planPriceNumber + discountNumber;
                const credit = Math.max(0, Math.min(creditAmount, planPriceNumber));
                const chargeable = Math.max(0, planPriceNumber - credit);
                const amount = `${chargeable}`;
                const isUpgrade = credit > 0;

                const surchargeData = await getSurchargeData(amount);
                const surcharge = surchargeData?.surcharge
                    ? parseFloat(surchargeData.surcharge)
                    : 0;
                const total = chargeable + surcharge;

                const billSummary = [
                    { key: 'Service name', value: 'Peko Commerce' },
                    { key: 'Plan name', value: plan },
                    { key: 'Billing cycle', value: capitalize(duration) },
                    {
                        key: 'Plan price',
                        value: `₹ ${formatNumber(discountNumber > 0 ? originalNumber : planPriceNumber)}`,
                    },
                    ...(discountNumber > 0
                        ? [{ key: 'Discount', value: `- ₹ ${formatNumber(discountNumber)}` }]
                        : []),
                    ...(isUpgrade
                        ? [{ key: 'Current plan credit', value: `- ₹ ${formatNumber(credit)}` }]
                        : []),
                    { key: 'Amount', value: formatNumber(chargeable) },
                ];

                const paymentSummary = [
                    {
                        key: 'Platform fee (inclusive of GST)',
                        value: formatNumber(surcharge),
                    },
                ];

                const requestBody = {
                    amount,
                    pgAmount: amount,
                    subscriptionPlan: plan,
                    isSubscription: true,
                    subscriptionDuration: duration,
                    packageId: planId,
                    accessKey: accessKeys.ecommerceStore,
                    currentUrl: path,
                    successUrl: paths.dashboard.ecommerce,
                    isEcommerceSubscription: true,
                    isUpgrade,
                    upgradeCredit: credit,
                    planPrice: planPriceNumber,
                    discount: discountNumber,
                };

                dispatch(
                    setPaymentData({
                        billSummary,
                        paymentSummary,
                        totalAmount: total,
                        title: 'Bill Summary',
                        payload: requestBody,
                        url: '',
                        successPath: `${paths.dashboard.ecommerce}/${paths.ecommerce.paymentsuccess}`,
                        earningCashbackAmount: Number(surchargeData?.corporateCashback) || 0,
                    })
                );

                navigate(paths.dashboard.payments);
            } catch (error) {
                console.error('Error in handleSubmission:', error);
            } finally {
                setIsLoading(false);
            }
        },
        [getSurchargeData, path, dispatch, navigate]
    );

    return { handleSubmission, isLoading };
}
