// PROTOTYPE-SETUP: Acme's organisation, compliance and HR settings, built from COMPANY so the settings pages
// match the company shown everywhere else (PAN/TAN/GSTIN, Bengaluru HQ, Mon–Fri 09:30–18:30 week).
import type { DefaultWorkSchedule, OnboardingDocument } from '@domains/dashboard/Payroll/api/essSettings';
import type {
    ComplianceSettingsResponse,
    TdsSettingsPayload,
} from '@domains/dashboard/Payroll/types/complianceSettings/complianceSettingsType';
import type {
    BankListResponse,
    CompanyUserData,
    existingOrganizationSettings,
} from '@domains/dashboard/Payroll/types/organizationSettings';

import { COMPANY } from './company';
import { monthsAgo } from './dates';
import { findEmployee } from './employees';
import { GRACE_PERIOD_MINUTES } from './time-attendance';

const hq = COMPANY.offices.Bengaluru;
const hrManager = findEmployee('ACME-018')!;
const financeManager = findEmployee('ACME-016')!;

const WEEKDAY_CODES: Record<keyof typeof COMPANY.workWeek.days, string> = {
    sunday: 'SUN',
    monday: 'MON',
    tuesday: 'TUE',
    wednesday: 'WED',
    thursday: 'THU',
    friday: 'FRI',
    saturday: 'SAT',
};

export const WORKING_DAY_CODES = (Object.keys(WEEKDAY_CODES) as (keyof typeof WEEKDAY_CODES)[])
    .filter(day => COMPANY.workWeek.days[day])
    .map(day => WEEKDAY_CODES[day]);

/** Payroll has run since the company set up Peko, roughly four years ago. */
export const PAYROLL_START_DATE = monthsAgo(47, 1);

export const ORGANIZATION_SETTINGS: existingOrganizationSettings = {
    companyProfile: {
        companyName: COMPANY.name,
        companyAddressLine1: hq.line1,
        companyAddressLine2: 'Marathahalli',
        city: hq.city,
        pinCode: hq.pincode,
        state: hq.state,
        contactNumber: COMPANY.phone,
        emailAddress: `hr@${COMPANY.emailDomain}`,
        industry: 'Information Technology / Software / IT-ITES',
        companyLogo: '',
    },
    organizationTaxDetails: {
        PAN: COMPANY.pan,
        TAN: COMPANY.tan,
        TDSCode: '192B',
        taxPaymentFrequency: 'MONTHLY',
    },
    payrollSettings: {
        selectWorkingDays: WORKING_DAY_CODES,
        calculateSalaryBasedOn: 'ACTUALDAYS',
        payrollFrom: PAYROLL_START_DATE,
        payEmployeeOn: '1',
    },
    bankDetails: {
        bankName: COMPANY.bank.bankName,
        accountNumber: COMPANY.bank.accountNumber,
        accountHolderName: COMPANY.name,
        ifscCode: COMPANY.bank.ifsc,
        branchAddress: COMPANY.bank.branch,
    },
};

export const CORPORATE_DETAILS: CompanyUserData = {
    companyName: COMPANY.name,
    userEmail: `hr@${COMPANY.emailDomain}`,
    userState: hq.state,
    mobileNo: COMPANY.phone,
};

export const CORPORATE_BANKS: BankListResponse = {
    bankDetails: [
        {
            id: 1,
            accountHolderName: COMPANY.name,
            accountNumber: COMPANY.bank.accountNumber,
            bankName: COMPANY.bank.bankName,
            ifscCode: COMPANY.bank.ifsc,
            status: 1,
            default: 1,
            createdAt: `${PAYROLL_START_DATE}T06:00:00.000Z`,
            updatedAt: `${PAYROLL_START_DATE}T06:00:00.000Z`,
            credentialId: 1,
            bankBranch: COMPANY.bank.branch,
        },
    ],
};

/** Years with payroll data (for the year pickers), oldest first. */
export const activeYears = () => {
    const first = Number(PAYROLL_START_DATE.slice(0, 4));
    const last = new Date().getFullYear();
    return {
        years: Array.from({ length: last - first + 1 }, (_, i) => ({
            label: String(first + i),
            value: first + i,
        })),
    };
};

export const ACTIVE_YEARS_EMPTY: ReturnType<typeof activeYears> = { years: [] };

// ---- compliance --------------------------------------------------------------------------------------------

/**
 * The page reads the settings document flat (complianceData.epf, .esi, .tds …) even though the declared
 * ComplianceSettingsResponse nests them under `data`, so this is the inner shape plus `_id` and `tds`.
 */
export type ComplianceSettingsDocument = ComplianceSettingsResponse['data'] & {
    _id: string;
    tds: TdsSettingsPayload;
};

export const COMPLIANCE_SETTINGS: ComplianceSettingsDocument = {
    _id: 'cmp-acme-001',
    epf: {
        epfNumber: COMPANY.pfEstablishmentCode,
        // Employer PF capped at ₹1,800 (12% of ₹15,000) — the master salary breakup uses the same cap.
        pfWagesPolicy: 'CAPPED_15000',
        enableProRatedPfWage: true,
        considerSalaryComponents: false,
    },
    esi: {
        esiNumber: COMPANY.esicCode,
        deductionCycle: 'Monthly',
        employeeContribution: 0.75,
        employerContribution: 3.25,
    },
    professionalTax: {
        // Karnataka PTRC (HQ); Mumbai staff are covered by the Maharashtra slab set on their deduction component.
        ptNumber: '290514873216',
        deductionCycle: 'Monthly',
        incomeSlabs: [
            { incomeStartRange: 0, incomeEndRange: 24999, taxAmount: 0, _id: 'pt-ka-1' },
            { incomeStartRange: 25000, incomeEndRange: 99999999, taxAmount: 200, _id: 'pt-ka-2' },
        ],
    },
    laborWelfareFund: {
        workState: hq.state,
        registrationNumber: 'KA/LWF/BLR/2021/04512',
    },
    tds: {
        tan: COMPANY.tan,
        taxRegime: 'New Tax Regime',
        assignedCommissioner: 'CIT (TDS), Bengaluru',
        address: `${hq.line1}, ${hq.city}, ${hq.state} ${hq.pincode}`,
        bsr: { bankName: COMPANY.bank.bankName, bsrCode: '0510308' },
        authorizedSignatoryDetails: { name: financeManager.fullName, placeOfSigning: hq.city },
    },
};

// ---- HR settings (ESS) -----------------------------------------------------------------------------------

export const ONBOARDING_DOCUMENTS: OnboardingDocument[] = [
    { key: 'aadhaar', label: 'Aadhaar Card', required: true },
    { key: 'pan', label: 'PAN Card', required: true },
    { key: 'photo', label: 'Passport-size Photograph', required: true },
    { key: 'education', label: 'Highest Education Certificate', required: true },
    { key: 'relievingLetter', label: 'Relieving Letter (previous employer)', required: false },
    { key: 'payslips', label: 'Last 3 Months Payslips', required: false },
    { key: 'cancelledCheque', label: 'Cancelled Cheque / Bank Proof', required: true },
];

export const WORK_SCHEDULE: DefaultWorkSchedule = {
    checkInTime: COMPANY.workWeek.startTime,
    checkOutTime: COMPANY.workWeek.endTime,
};

export const HR_SETTINGS = {
    gracePeriodMinutes: GRACE_PERIOD_MINUTES,
    checkInOutEnabled: true,
    hrContactName: hrManager.fullName,
};
