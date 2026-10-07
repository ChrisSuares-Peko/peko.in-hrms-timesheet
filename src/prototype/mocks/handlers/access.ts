// PROTOTYPE-SETUP: Step 2 — unlock access. Every gate in Payroll/ESS is fed a valid "fully entitled" response
// here instead of editing the gate. Same in both data modes: access is not data.
import type { SubscriptionAddOnResponse, subscriptionHistoryResponse } from '@customtypes/general';
import type { SubscriptionDetailsResponse } from '@domains/dashboard/IndividualPlan/types';
import type { progressResponse } from '@domains/dashboard/Payroll/types/dashboardTypes';
import type { LifecycleSettingsResponse } from '@domains/dashboard/settings/api/subscription';

import { daysFromToday, monthsAgo } from '../data/dates';
import { EMPLOYEE_COUNTS } from '../data/employees';
import { byMode, raw } from '../envelope';
import { MockRoute, route } from '../router';

/** Seats well above the 20 demo employees, so no limit/upgrade banner or progress bar ever trips. */
const PLAN_EMPLOYEE_LIMIT = 100;

const PLAN_PACKAGE = {
    id: 3,
    packageName: 'Peko+',
    packagePrices: { monthly: '4999', annually: '49990' },
    description: 'Payroll, HRMS and employee self-service for growing teams.',
    discount: { monthly: 0, annually: 17 },
};

// SubscriptionPage (IndividualPlan) — wraps Payroll's HomePage.
//   isPurchased true + showSubscriptionLanding false → renders its children (LandingPage) directly.
//   previousSubscription is required by the type; willAutoRenew: false makes RenewalOverlay treat it as
//   non-renewing, so neither the "expired, renew" banner nor the frozen overlay is shown.
const subscriptionDetails: SubscriptionDetailsResponse = {
    packageDetails: [PLAN_PACKAGE],
    isPurchased: true,
    isPaidGroupUser: true,
    ownsIndividualPackage: true,
    previousSubscription: {
        billingType: 'ANNUALLY',
        status: 'EXPIRED',
        packageId: PLAN_PACKAGE.id,
        packageName: PLAN_PACKAGE.packageName,
        packageType: 'GROUP',
        subscriptionId: 9001,
        paymentMode: 'PAYMENT GATEWAY',
        willAutoRenew: false,
    },
    paidPlanExpiredRecently: null,
    lifecycle: {
        state: 'ACTIVE',
        gracePeriodDays: 7,
        frozenPeriodDays: 30,
        payrollDataClearDays: 90,
    },
    showSubscriptionLanding: false,
    subscriptionLandingKey: null,
};

// PayrollAccessBanner + Dash's "X left of N employees" bar read these limits.
const addOnDetails: SubscriptionAddOnResponse = {
    unitPrice: 99,
    maxLimit: PLAN_EMPLOYEE_LIMIT,
    freeBaseLimit: PLAN_EMPLOYEE_LIMIT,
    addonLimit: 0,
    packageId: PLAN_PACKAGE.id,
    isDynamicUnitPricing: false,
    isAddonPurchaseAllowed: true,
};

const subscriptionHistory: subscriptionHistoryResponse = {
    currentSubscription: {
        id: 9002,
        subscriptionStartDate: monthsAgo(4, 1),
        subscriptionEndDate: daysFromToday(240),
        subscriptionAmountPaid: 49990,
        status: 'ACTIVE',
        billingType: 'ANNUALLY',
        maxLimit: PLAN_EMPLOYEE_LIMIT,
        isCancelled: false,
        isGracePeriod: false,
        package: { id: PLAN_PACKAGE.id, packageName: PLAN_PACKAGE.packageName },
    },
    addOns: null,
    cancelledAddOns: null,
    isGroupSubscription: true,
};

const lifecycleSettings: LifecycleSettingsResponse = {
    gracePeriodDays: 7,
    frozenPeriodDays: 30,
    payrollDataClearDays: 90,
    payrollFreeEmployeeLimit: PLAN_EMPLOYEE_LIMIT,
};

// LandingPage shows Dash only when progress === '100%'; every onboarding step marked complete.
const payrollProgress: progressResponse = {
    departmentAndEmployees: true,
    progress: '100%',
    holidays: true,
    hrSettings: true,
    setUpWps: true,
    hasBasicSalaryComponent: true,
    basicSalaryAmount: 50,
};

export const accessRoutes: MockRoute[] = [
    route('GET', 'user/subscription/individual-details', () => subscriptionDetails),
    route('GET', 'user/subscription/add-ons', () => addOnDetails),
    route('GET', 'user/subscription/history', () => subscriptionHistory),
    route('GET', 'user/subscription/lifecycle-settings', () => lifecycleSettings),
    route('GET', ':type/:uid/payroll/dashBoard/progress', () => payrollProgress),
    // Head count is data, not access: 20 in dummy mode, 0 in empty mode (plan limits above stay at 100).
    route('GET', ':type/:uid/payroll/employee/count', ({ mode }) =>
        byMode(mode, {
            dummy: { count: EMPLOYEE_COUNTS.total, lastEmployeeAddedDate: monthsAgo(0, 1) },
            empty: { count: 0, lastEmployeeAddedDate: '' },
        })
    ),
    // useValidateEmployeeSubscriptionLimit reads the envelope itself (response.status) — always allowed.
    route('GET', ':type/:uid/payroll/employee/validateSubscriptionLimit', () =>
        raw({ status: true, responseCode: '000', message: 'Within plan limit', data: { allowed: true } })
    ),
    // Payroll → Organization settings → ESS: the self-service portal is switched on.
    route('GET', 'user/ess/access', () => ({ essAccess: true })),
    route('PATCH', 'user/ess/access', ({ body }) => ({ essAccess: body?.essAccess ?? true })),
];
