import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PaymentMode } from '../../../payments/types/index';
import PaymentSummary from '../../components/PaymentSummary';

const paymentState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock('@src/hooks/store', () => ({
    useAppDispatch: () => vi.fn(),
    useAppSelector: (selector: (state: any) => unknown) =>
        selector({
            reducer: {
                payment: paymentState.current,
                user: { user: { roleName: 'corporate' } },
                auth: { role: 'corporate', id: 1 },
            },
        }),
}));

vi.mock('@src/hooks/useScreenSize', () => ({
    default: () => ({ xs: false }),
}));

vi.mock('@src/services/surcharge', () => ({
    getSurcharge: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('../../../payments/hooks/usePaymentApi', () => ({
    default: () => ({
        handleCardPaymentRequest: vi.fn(),
        handlePaytmPaymentRequest: vi.fn(),
        handleWalletPaymentRequest: vi.fn(),
        handleCCavenuePaymentRequest: vi.fn(),
        ccavenueUrl: null,
        setCCavenueUrl: vi.fn(),
        isLoading: false,
        isSpinnerLoading: false,
        loadCheckoutScript: vi.fn(),
        couponFormikRef: { current: null },
        couponCode: '',
        setCouponCode: vi.fn(),
        applyCoupon: vi.fn(),
        removeCoupon: vi.fn(),
        isCouponApplied: false,
        selectedPayment: PaymentMode.empty,
        setselectedPayment: vi.fn(),
        isCashbackChecked: false,
        setIsCashbackChecked: vi.fn(),
    }),
}));

vi.mock('../../../payments/hooks/useWalletApi', () => ({
    default: () => ({ walletData: { balance: 0 }, isLoading: false }),
}));

vi.mock('../../../payments/hooks/useGetAllPaymentMode', () => ({
    default: () => ({
        isPgOptionsLoading: false,
        isPgDown: false,
        getPaymentMethods: vi.fn(),
        availablePgOptions: {
            wallet: { available: false, limits: {}, usage: { today: 0, month: 0 } },
            gateway: { available: true, limits: {}, usage: { today: 0, month: 0 } },
        },
    }),
}));

vi.mock('../../../Airline/hooks/useTraceIdTimer', () => ({
    default: () => ({
        searchInitiatedAt: null,
        bookingCompletedAt: null,
        isExpired: false,
        isPaymentExpired: false,
        timeRemaining: 0,
        formatTime: () => '',
        showExpiredModal: false,
        handleGoBack: vi.fn(),
    }),
}));

vi.mock('../../../Hotels/hooks/useHotelBookingTimer', () => ({
    default: () => ({
        searchInitiatedAt: null,
        showTimer: false,
        isExpired: false,
        timeRemaining: 0,
        formatTime: () => '',
    }),
}));

vi.mock('../../components/PaymentHeader', () => ({ default: () => null }));
vi.mock('../../components/PaymentMethodCard', () => ({
    default: () => <div data-testid="payment-methods" />,
}));
vi.mock('../../components/CouponCodeCard', () => ({ default: () => null }));
vi.mock('../../components/PaymentRedirectLoader', () => ({ default: () => null }));
vi.mock('../../../payments/components/CCavenueIframeModal', () => ({ default: () => null }));
vi.mock('../../../Airline/components/SessionExpiredModal', () => ({ default: () => null }));

const baseState = {
    billSummary: [
        { key: 'Service name', value: 'Mobile Postpaid' },
        { key: 'Amount', value: '124.00', isInput: false },
    ],
    paymentSummary: [{ key: 'Platform fee (inclusive of GST)', value: '₹ 0.00' }],
    title: 'Recharge Summary',
    payload: { accessKey: 'bbps_telecom_postpaid', amount: -124, billerId: 'B1' },
    url: 'payment/postpaid/payment',
    minimumAmount: 1,
    maximumAmount: 1000000,
    earningCashbackAmount: 0,
    navigatePath: '/mobile-recharge-&-bills/postpaid',
    isEsimPaymentLoading: false,
};

describe('PaymentSummary when the fetched bill is a credit', () => {
    beforeEach(() => {
        paymentState.current = { ...baseState, totalAmount: 0, creditBalance: 124 };
        render(<PaymentSummary />);
    });

    it('disables the pay button preemptively and labels it No Payment Due', () => {
        const button = screen.getByRole('button', { name: 'No Payment Due' });
        expect(button).toBeDisabled();
        expect(screen.queryByRole('button', { name: /^Pay ₹/ })).not.toBeInTheDocument();
    });

    it('shows an amount payable of zero', () => {
        expect(screen.getByText('Amount Payable').nextElementSibling?.textContent).toBe('₹ 0.00');
    });

    it('shows the credit as a positive tagged amount with the info banner', () => {
        expect(screen.getByText('Credit').parentElement?.textContent).toBe('Credit₹ 124.00');
        expect(screen.getByRole('status').textContent).toBe(
            'Your account has a credit balance of ₹124.00. No payment is due at this time.'
        );
    });

    it('keeps Cancel and go back active', () => {
        expect(screen.getByRole('button', { name: 'Cancel and go back' })).toBeEnabled();
    });
});

describe('PaymentSummary when a payment is due', () => {
    it('renders the normal pay label with no credit banner', () => {
        paymentState.current = {
            ...baseState,
            billSummary: [
                { key: 'Service name', value: 'Mobile Postpaid' },
                { key: 'Amount', value: '248.00', isInput: false },
            ],
            payload: { accessKey: 'bbps_telecom_postpaid', amount: 248, billerId: 'B1' },
            totalAmount: 248,
            creditBalance: null,
        };
        render(<PaymentSummary />);
        expect(screen.getByRole('button', { name: 'Pay ₹ 248.00' })).toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(screen.queryByText('Credit')).not.toBeInTheDocument();
        expect(screen.getByText('Amount Payable').nextElementSibling?.textContent).toBe('₹ 248.00');
    });
});
