// PROTOTYPE-SETUP: salary, payroll processing, payslips, reports and payroll/bank-account endpoints (Payroll
// admin + ESS payslips). Every figure comes from the payroll ledger in data/salary-payroll.ts, which is
// derived from the MASTER employee salary breakup, so totals always add up from the per-employee values.
import type {
    ReviseSalaryResult,
    SalaryRevisionHistoryEntry,
} from '@domains/dashboard/Payroll/api/organizationSettings';
import type {
    SalaryHistoryApiResponse,
    SalaryHistoryItem,
} from '@domains/dashboard/Payroll/api/salaryHistoryApi/salaryHistory';
import type { SalaryHistoryDetailApiResponse } from '@domains/dashboard/Payroll/api/salaryHistoryApi/salaryHistoryDetail';
import type {
    BankAccountRecord,
    BankTransaction,
    SalaryRolloutBankAccount,
} from '@domains/dashboard/Payroll/types/bankAccount';
import type {
    AllSalaryComponentListResponse,
    DeductionComponent,
    DeductionComponentListResponse,
    SalaryComponentListResponse,
} from '@domains/dashboard/Payroll/types/organizationSettings';
import type { PayrollAccountStatus } from '@domains/dashboard/Payroll/types/payrollAccount';
import type {
    ProcessSalaryEmployeeRow,
    ProcessSalaryEmployeesResponse,
    ProcessSalaryResponse,
} from '@domains/dashboard/Payroll/types/processSalary';
import type { IncomeDeclarationFormGetResponse } from '@domains/dashboard/Payroll/types/reports';
import type { bonusListingResponse } from '@domains/dashboard/Payroll/types/salaryProfileTypes/bonustypes';
import type { getDeductionResponse } from '@domains/dashboard/Payroll/types/salaryProfileTypes/deductionTypes';
import type {
    employeeSalaryListingResponse,
    PayrollHistoryResponse,
    PayslipApiRow,
    PayslipResponse,
    SalaryDetailsResponse,
    SalaryProfileTdsDetails,
} from '@domains/dashboard/Payroll/types/salaryProfileTypes/employeeSalaryTable';
import type { incentiveListingResponse } from '@domains/dashboard/Payroll/types/salaryProfileTypes/incentiveTypes';
import type { incrementListingResponse } from '@domains/dashboard/Payroll/types/salaryProfileTypes/incrementTypes';
import type { SalaryProfileResponse } from '@domains/dashboard/Payroll/types/salaryProfileTypes/ProfileTypes';
import type {
    EligibleEmployeeResponse,
    PendingBeneficiaryEmployee,
    SalaryBreakupData,
    SalaryRolloutEmployeeRow,
    SalaryRolloutListResponse,
    SalaryRolloutPastListResponse,
} from '@domains/dashboard/Payroll/types/salaryProfileTypes/salaryRolloutTypes';
import type { SalaryStatsResponse } from '@domains/dashboard/Payroll/types/salaryStats';
import type { TDSReportbyEmployee, TDSReportItem } from '@domains/dashboard/Payroll/types/types';
import type {
    RemoveFundsListResponse,
    RemoveFundsResponse,
    VirtualAccountBalance,
    VirtualAccountRecord,
} from '@domains/dashboard/Payroll/types/virtualAccount';
import type { CtcBreakdown } from '@domains/dashboard/Payroll/utils/ctcCalculator/types';
import type { DeductionLogRecord, PayslipRow } from '@domains/employee/types';

import { COMPANY } from '../data/company';
import { daysFromToday, isoDateTime, monthsAgo, toIsoDate, today } from '../data/dates';
import { EMPLOYEES, ESS_EMPLOYEE, MockEmployee, findEmployee } from '../data/employees';
import { XLSX_MIME, buildPdf, buildXlsx, payslipPdf, toBase64 } from '../data/salary-documents';
import {
    DIWALI_BONUS,
    DIWALI_OFFSET,
    INCENTIVES,
    INCREMENTS,
    INCREMENT_OFFSET,
    MONTH_NAMES,
    PayrollLine,
    ctcAt,
    financialYearOf,
    findLineBySalaryId,
    inr,
    isOnRollsIn,
    linesFor,
    linesForEmployee,
    linesForOffset,
    monthLabel,
    monthTotals,
    offsetOf,
    offsetsInYear,
    payrollMonth,
} from '../data/salary-payroll';
import { ModeData, byMode, raw } from '../envelope';
import { essRequester } from '../requester';
import { MockContext, MockRoute, route } from '../router';

// ---- shared helpers --------------------------------------------------------------------------------------

const BASE = ':type/:uid/payroll';
const CREATED_AT = isoDateTime(monthsAgo(47, 1));
const CORPORATE_USER = String(COMPANY.corporateUserId);
const SAMPLE_PDF_URL = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

/** Mutations: full envelope with a human message (several callers toast `res.message`). */
const done = (data: unknown, message: string) => raw({ status: true, responseCode: '000', message, data });

const paginate = <T>(items: T[], page: unknown, limit: unknown) => {
    const size = Number(limit) || items.length || 1;
    const p = Math.max(1, Number(page) || 1);
    return items.slice((p - 1) * size, p * size);
};

const matchesSearch = (e: MockEmployee, text: unknown) => {
    const q = String(text ?? '').trim().toLowerCase();
    if (!q) return true;
    return [e.fullName, e.employeeId, e.email, String(e.id)].some(v => v.toLowerCase().includes(q));
};

const employeeFrom = (ctx: MockContext, key: string) => findEmployee(ctx.params[key]) ?? ESS_EMPLOYEE;

const validMonth = (m: unknown) => {
    const n = Number(m);
    return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
};

const isEmptyMode = (ctx: MockContext) => ctx.mode === 'empty';

const maskedAccount = (e: MockEmployee) => `${e.bank.bankName} – XXXX${e.bank.accountNumber.slice(-4)}`;
const transactionTypeOf = (e: MockEmployee): 'NEFT' | 'IMPS' => (e.id % 3 === 0 ? 'IMPS' : 'NEFT');

/** The new joiner's bank account is still awaiting verification, so she is not payout-ready yet. */
const beneficiaryPending = (e: MockEmployee) => e.status === 'new-joiner';

const employeeStatusOf = (e: MockEmployee) => (e.status === 'notice' ? 'RESIGNED' : 'ACTIVE');

const weekdaysIn = (year: number, month: number) => {
    const days = new Date(year, month, 0).getDate();
    return Array.from({ length: days }, (_, i) => new Date(year, month - 1, i + 1).getDay()).filter(
        d => d !== 0 && d !== 6
    ).length;
};

// ---- salary components (global + per employee) -----------------------------------------------------------

type GlobalComponent = AllSalaryComponentListResponse['componentData'][number];

const component = (
    id: string,
    componentName: string,
    category: GlobalComponent['category'],
    calculationType: GlobalComponent['calculationType'],
    amountPercentage: number,
    calculationBasis: GlobalComponent['calculationBasis'],
    calculationBasedOn: string
): GlobalComponent => ({
    corporateUser: CORPORATE_USER,
    componentName,
    category,
    calculationType,
    calculationBasis,
    amountPercentage,
    calculationBasedOn,
    status: 'ACTIVE',
    isGlobal: true,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    id,
    _id: id,
});

const GLOBAL_COMPONENTS: GlobalComponent[] = [
    component('sc-basic', 'Basic Salary', 'SALARY', 'PERCENTAGE', 50, 'GROSS_SALARY', 'GROSS_SALARY'),
    component('sc-hra', 'House Rent Allowance (HRA)', 'ALLOWANCE', 'PERCENTAGE', 40, 'BASIC_SALARY', 'Basic Salary'),
    component('sc-conveyance', 'Conveyance Allowance', 'ALLOWANCE', 'FIXED', 1600, 'COMPONENT', ''),
    component('sc-medical', 'Medical Allowance', 'ALLOWANCE', 'FIXED', 1250, 'COMPONENT', ''),
    component('sc-special', 'Special Allowance', 'ALLOWANCE', 'BALANCING', 0, 'COMPONENT', ''),
];

/** Each employee's components carry their own rupee amounts (frozen at hire/revision, like the backend). */
const employeeComponents = (e: MockEmployee): GlobalComponent[] => {
    const s = e.salary;
    const amounts: Record<string, number> = {
        'sc-basic': s.basic,
        'sc-hra': s.hra,
        'sc-conveyance': s.conveyance,
        'sc-medical': s.medical,
        'sc-special': s.specialAllowance,
    };
    return GLOBAL_COMPONENTS.map(c => ({ ...c, calculatedAmount: amounts[c.id] }));
};

const salaryComponentList: ModeData<SalaryComponentListResponse> = {
    dummy: {
        totalCount: GLOBAL_COMPONENTS.length,
        componentData: GLOBAL_COMPONENTS.map(c => ({
            corporateUser: c.corporateUser,
            employee: null,
            componentName: c.componentName,
            category: c.category,
            calculationType: c.calculationType,
            calculationBasis: c.calculationBasis,
            amountPercentage: c.amountPercentage,
            calculationFrequency: 'MONTHLY',
            calculationBasedOn: c.calculationBasedOn,
            status: c.status,
            isGlobal: true,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
            id: c.id,
        })),
    },
    empty: { totalCount: 0, componentData: [] },
};

const deductionComponent = (
    id: string,
    deductionName: string,
    calculationType: 'FIXED' | 'PERCENTAGE',
    amountPercentage: string,
    salaryDeductionType: 'BASIC_SALARY' | 'GROSS_SALARY'
): DeductionComponent => ({
    corporateUser: CORPORATE_USER,
    employee: null,
    deductionName,
    deductionType: 'STATUTORY',
    calculationType,
    amountPercentage,
    calculationBasis: salaryDeductionType,
    status: 'ACTIVE',
    applicabilityCriteria: null,
    isGlobal: true,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    id,
    salaryDeductionType,
});

// TDS is not a configurable component — it is computed per employee from the tax regime (see tdsDetails).
const PF_COMPONENT = deductionComponent('dc-pf', 'Provident Fund (PF)', 'PERCENTAGE', '12', 'BASIC_SALARY');
const PT_COMPONENT = deductionComponent('dc-pt', 'Professional Tax', 'FIXED', '200', 'GROSS_SALARY');

// ---- payroll rows in the shapes each screen expects ------------------------------------------------------

type CalcRow = employeeSalaryListingResponse['rows'][number];

const workSchedule = {
    startTime: COMPANY.workWeek.startTime,
    endTime: COMPANY.workWeek.endTime,
    breakTimeHrs: COMPANY.workWeek.breakTimeHrs,
    days: COMPANY.workWeek.days,
};

/** salaryInformation as the backend sends it (incl. the hraAmount/other/tdsAmount fields the UI sums). */
const salaryInformationOf = (l: PayrollLine) => {
    const b = l.breakup;
    return {
        basicPay: b.basic,
        hraAmount: b.hra,
        daAmount: 0,
        bonus: 0,
        incentiveAmount: 0,
        increamentAmount: 0,
        overtimeAmount: 0,
        // Conveyance + Medical + Special Allowance (the UI's "Other Allowance").
        other: b.conveyance + b.medical + b.specialAllowance,
        travelAllowances: b.conveyance,
        homeAllowances: b.hra,
        medicalAllowances: b.medical,
        otherAllowances: b.specialAllowance,
        epfAmount: b.employeePf,
        esiAmount: 0,
        lwfAmount: 0,
        professionalTax: b.professionalTax,
        deductionAmount: b.employeePf + b.professionalTax,
        leavesAmount: 0,
        tdsAmount: b.tds,
    };
};

const calcRow = (l: PayrollLine): CalcRow => {
    const e = l.employee;
    const salaryInformation = salaryInformationOf(l);
    const employee = {
        corporateUser: CORPORATE_USER,
        profileImage: '',
        personalInformation: {
            fullName: e.fullName,
            dateOfBirth: e.dateOfBirth,
            gender: e.gender,
            mobileNo: e.mobileNo,
            email: e.email,
            personalAddress: e.address,
        },
        employeeInformation: {
            dateOfJoin: e.dateOfJoin,
            employeeId: e.employeeId,
            designation: e.designation,
            workLocation: e.location,
            status: 'active',
            employeeStatus: employeeStatusOf(e),
        },
        ...(e.lastWorkingDay
            ? {
                  offBoardingInformation: {
                      lastWorkingDay: e.lastWorkingDay,
                      resignationLetter: '',
                      noticePeriod: e.noticePeriodDays,
                      offBoardingType: 'RESIGNED',
                      reasonForOffBoarding: 'Pursuing higher studies',
                  },
              }
            : {}),
        emergencyNo: e.emergencyContact.mobileNo,
        id: String(e.id),
    };
    return {
        totalDeduction: l.deductions,
        corporateUser: CORPORATE_USER,
        employee,
        year: l.pm.year,
        month: l.pm.month,
        salaryCycleStart: isoDateTime(l.pm.start, '00:00:00'),
        salaryCycleEnd: isoDateTime(l.pm.end, '00:00:00'),
        salaryCycleDays: l.pm.daysInMonth,
        leaveCount: 0,
        leaveDeduction: 0,
        attendancePercentage: Math.round((l.paidDays / l.pm.daysInMonth) * 100),
        salaryInformation,
        workSchedule,
        gratuityContribution: Math.round(l.breakup.basic * 0.0481),
        reimbursements: [],
        totalReimbursement: 0,
        totalPayable: l.netPayable,
        others: 0,
        department: { _id: String(e.departmentId), departmentName: e.department },
        status: true,
        paySlipEmailSent: l.status === 'PAID',
        message: '',
        paymentStatus: l.status,
        paidViaRollout: l.status === 'PAID',
        createdAt: isoDateTime(l.pm.start),
        updatedAt: l.payingDate ?? isoDateTime(l.pm.start),
        id: l.salaryId,
        totalOtherDeduction: 0,
        totalBonus: l.bonus,
        totalOvertime: 0,
        totalIncentive: l.incentive,
        totalArrears: 0,
        monthlySalary: l.breakup.grossEarnings,
        bankDetails: [
            {
                accountName: e.fullName,
                accountNumber: e.bank.accountNumber,
                bankName: e.bank.bankName,
                ifscCode: e.bank.ifsc,
                transactionType: transactionTypeOf(e),
            },
        ],
    };
};

const filterByStatus = (lines: PayrollLine[], filter: unknown) => {
    const wanted = String(filter ?? '')
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);
    return wanted.length ? lines.filter(l => wanted.includes(l.status)) : lines;
};

const calculateSalary = ({ mode, query }: MockContext): employeeSalaryListingResponse => {
    const pm = payrollMonth(Math.max(0, offsetOf(query.year, query.month)));
    const salaryCycle = {
        SalaryCycleStart: isoDateTime(pm.start, '00:00:00'),
        SalaryCycleEnd: isoDateTime(pm.end, '00:00:00'),
        SalaryCycleDays: pm.daysInMonth,
        salaryCycleStart: isoDateTime(pm.start, '00:00:00'),
        salaryCycleEnd: isoDateTime(pm.end, '00:00:00'),
        salaryCycleDays: pm.daysInMonth,
        workingDays: weekdaysIn(pm.year, pm.month),
    };
    if (mode === 'empty') return { count: 0, salaryCycle, totalPayableSum: 0, rows: [] };
    const lines = filterByStatus(linesFor(query.year, query.month), query.filter)
        .filter(l => matchesSearch(l.employee, query.searchText))
        .sort((a, b) =>
            String(query.sort).toUpperCase() === 'DESC'
                ? b.employee.fullName.localeCompare(a.employee.fullName)
                : a.employee.fullName.localeCompare(b.employee.fullName)
        );
    return {
        count: lines.length,
        salaryCycle,
        totalPayableSum: monthTotals(lines).netPayable,
        rows: paginate(lines, query.page, query.limit).map(calcRow),
    };
};

// ---- salary details for one employee/month -----------------------------------------------------------------

const annualTaxOf = (monthlyGross: number) => {
    const taxable = Math.max(0, monthlyGross * 12 - 75000);
    const slab2 = Math.min(Math.max(taxable - 400000, 0), 300000) * 0.1;
    const slab3 = Math.max(taxable - 700000, 0) * 0.15;
    const before = slab2 + slab3;
    const rebate = taxable <= 700000 ? before : 0;
    return { taxable, slab2, slab3, before, rebate, total: Math.round(before - rebate) };
};

const tdsDetailsOf = (l: PayrollLine): SalaryProfileTdsDetails => {
    const e = l.employee;
    const full = e.salary;
    const t = annualTaxOf(full.grossEarnings);
    return {
        employeeName: e.fullName,
        employeeEmail: e.email,
        taxRegime: 'NEW',
        tdsFrequency: 'MONTHLY',
        dateOfJoin: e.dateOfJoin,
        fy: financialYearOf(l.pm.year, l.pm.month),
        monthlySalary: full.grossEarnings,
        grossThisMonth: l.gross,
        standardDeduction: 75000,
        exemptions: 0,
        grossAnnual: full.grossEarnings * 12,
        taxableIncome: t.taxable,
        slabBreakdown: [
            { from: 0, to: 400000, rate: 0, taxableAmount: Math.min(t.taxable, 400000), tax: 0 },
            {
                from: 400000,
                to: 700000,
                rate: 10,
                taxableAmount: Math.min(Math.max(t.taxable - 400000, 0), 300000),
                tax: t.slab2,
            },
            { from: 700000, to: null, rate: 15, taxableAmount: Math.max(t.taxable - 700000, 0), tax: t.slab3 },
        ],
        taxBeforeRebate: t.before,
        rebate: t.rebate,
        marginalRelief: 0,
        rebateLimit: 700000,
        totalRebate: t.rebate,
        surcharge: 0,
        surchargeRate: 0,
        surchargeThreshold: 5000000,
        surchargeBeforeRelief: 0,
        cess: 0,
        totalTax: t.total,
        tdsMonthly: l.breakup.tds,
    };
};

const salaryDetailsOf = (l: PayrollLine): SalaryDetailsResponse => {
    const b = l.breakup;
    const earnings = [
        { componentName: 'Basic Salary', badge: '50% of CTC', amount: b.basic },
        { componentName: 'House Rent Allowance (HRA)', badge: '40% of Basic', amount: b.hra },
        { componentName: 'Conveyance Allowance', badge: 'Fixed', amount: b.conveyance },
        { componentName: 'Medical Allowance', badge: 'Fixed', amount: b.medical },
        { componentName: 'Special Allowance', badge: 'Balancing', amount: b.specialAllowance },
        ...(l.bonus ? [{ componentName: 'Diwali Bonus', badge: 'One-time', amount: l.bonus }] : []),
        ...(l.incentive ? [{ componentName: 'Sales Incentive', badge: 'One-time', amount: l.incentive }] : []),
    ];
    const deductions = [
        { componentName: 'Employee PF', badge: '12% of PF wage', amount: b.employeePf },
        {
            componentName: 'Professional Tax',
            badge: l.employee.location === 'Mumbai' ? 'Maharashtra' : 'Karnataka',
            amount: b.professionalTax,
        },
        { componentName: 'TDS', badge: 'New regime', amount: b.tds },
    ];
    return {
        status: true,
        salaryRows: [
            ...earnings.map(x => ({ componentName: x.componentName, category: 'EARNING', amount: x.amount })),
            ...deductions.map(x => ({ componentName: x.componentName, category: 'DEDUCTION', amount: x.amount })),
        ],
        totals: { totalEarnings: l.gross, totalDeductions: l.deductions, netSalary: l.netPayable },
        salaryStatus: l.status,
        monthlyGrossSalary: b.grossEarnings,
        monthlyCTC: b.monthlyCtc,
        annualCTC: b.annualCtc,
        earnings,
        deductions,
        employerContributions: [{ label: 'Employer PF', badge: '12% of PF wage (capped)', amount: b.employerPf }],
        lwf: null,
        netSalary: l.netPayable,
        tdsDetails: tdsDetailsOf(l),
    };
};

/** No salary record for that month (before joining / future) — the API resolves to "not recorded". */
const notRecorded = () => raw({ status: false, responseCode: '404', message: 'Salary not recorded for this month', data: null });

const lineFor = (e: MockEmployee, year: unknown, month: unknown) =>
    linesFor(year as string, month as string).find(l => l.employee.id === e.id);

const payslipApiRow = (l: PayrollLine) => {
    const row: PayslipApiRow = {
        id: l.salaryId,
        year: l.pm.year,
        month: l.pm.month,
        totalPayable: l.netPayable,
        paymentStatus: l.status,
        salaryCycleStart: isoDateTime(l.pm.start, '00:00:00'),
        payingDate: l.payingDate,
        grossEarnings: l.gross,
        totalDeductions: l.deductions,
        netPaid: l.status === 'PAID' ? l.netPayable : 0,
        arrearsAmount: 0,
    };
    // The older Salary Profile tab reads the full Salary doc from the same endpoint.
    return { ...calcRow(l), ...row };
};

const payslipsOfEmployee = ({ mode, params, query }: MockContext): PayslipResponse => {
    const e = findEmployee(params.id);
    if (mode === 'empty' || !e) return { count: 0, rows: [], totalEmailed: 0 };
    const year = Number(query.year) || today().getFullYear();
    const lines = linesForEmployee(e)
        .filter(l => l.pm.year === year)
        .sort((a, b) => b.pm.month - a.pm.month);
    return {
        count: lines.length,
        rows: paginate(lines, query.page, query.limit).map(payslipApiRow),
        totalEmailed: lines.filter(l => l.status === 'PAID').length,
    };
};

const payslipDownload = (l: PayrollLine | undefined) => {
    const line = l ?? linesForOffset(1).find(x => x.employee.id === ESS_EMPLOYEE.id)!;
    return {
        pdfData: { type: 'Buffer', data: payslipPdf(line) },
        filename: `Payslip-${line.employee.employeeId}-${MONTH_NAMES[line.pm.month - 1]}-${line.pm.year}.pdf`,
    };
};

const payslipByEmployee = ({ params, query }: Pick<MockContext, 'params' | 'query'>) => {
    const e = findEmployee(params.employeeId) ?? ESS_EMPLOYEE;
    return payslipDownload(lineFor(e, query.year, query.month) ?? linesForEmployee(e)[1]);
};

// ---- salary history / stats ------------------------------------------------------------------------------

const salaryHistory = ({ mode, query }: MockContext): SalaryHistoryApiResponse => {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 12;
    if (mode === 'empty') return { count: 0, page, limit, rows: [] };
    const rows: SalaryHistoryItem[] = offsetsInYear(query.year)
        .sort((a, b) => a - b)
        .map(offset => {
            const lines = linesForOffset(offset);
            const pm = payrollMonth(offset);
            const paid = lines.filter(l => l.status === 'PAID');
            return {
                month: pm.month,
                year: pm.year,
                totalEmployees: lines.length,
                salariesProcessed: paid.length,
                totalPayroll: monthTotals(lines).netPayable,
                salaryStatus: paid.length === lines.length ? 'COMPLETED' : 'PENDING',
                processedOn: { $date: lines[0].processedOn ?? isoDateTime(pm.start) },
            };
        });
    return { count: rows.length, page, limit, rows: paginate(rows, page, limit) };
};

const salaryHistoryDetail = ({ mode, query }: MockContext): SalaryHistoryDetailApiResponse => {
    const lines = mode === 'empty' ? [] : linesFor(query.year, query.month);
    const paid = lines.filter(l => l.status === 'PAID');
    return {
        rows: paginate(lines, query.page, query.limit).map(l => ({
            empId: l.employee.employeeId,
            name: l.employee.fullName,
            email: l.employee.email,
            accountDetail: maskedAccount(l.employee),
            transType: transactionTypeOf(l.employee),
            grossSalary: l.gross,
            deduction: l.deductions,
            netPayable: l.netPayable,
            paymentStatus: l.status,
            remark: l.status === 'PAID' ? 'Salary credited' : 'Awaiting processing',
            oneTimePayments: [],
        })),
        count: lines.length,
        summary: {
            totalProcessed: paid.length,
            totalEmployees: lines.length,
            totalPaid: monthTotals(paid).netPayable,
        },
    };
};

const salaryStats = ({ mode, query }: MockContext): SalaryStatsResponse => {
    const status = String(query.status ?? 'ACTIVE').toUpperCase();
    if (mode === 'empty' || status !== 'ACTIVE') return { count: 0, rows: [] };
    const offsets = offsetsInYear(query.year);
    const rows = EMPLOYEES.filter(e => matchesSearch(e, query.searchText)).map(e => ({
        employeeId: String(e.id),
        employeeCode: e.employeeId,
        employeeName: e.fullName,
        salaries: offsets
            .map(o => linesForOffset(o).find(l => l.employee.id === e.id))
            .filter((l): l is PayrollLine => Boolean(l))
            .map(l => ({ month: l.pm.month, amount: l.netPayable })),
    }));
    return { count: rows.length, rows };
};

const historyReport = async ({ query }: MockContext) => {
    const lines = linesFor(query.year, query.month);
    const pm = payrollMonth(Math.max(0, offsetOf(query.year, query.month)));
    const bytes = await buildXlsx(
        'Salary Register',
        ['Emp ID', 'Name', 'Department', 'Bank A/c', 'Gross (INR)', 'Deductions (INR)', 'Net Pay (INR)', 'Status'],
        lines.map(l => [
            l.employee.employeeId,
            l.employee.fullName,
            l.employee.department,
            maskedAccount(l.employee),
            l.gross,
            l.deductions,
            l.netPayable,
            l.status,
        ])
    );
    return {
        buffer: toBase64(bytes),
        filename: `Salary-Register-${MONTH_NAMES[pm.month - 1]}-${pm.year}.xlsx`,
        fileType: XLSX_MIME,
    };
};

const payrollHistoryByYear = ({ mode, query }: MockContext): PayrollHistoryResponse => ({
    status: true,
    salaryRows:
        mode === 'empty'
            ? []
            : offsetsInYear(query.year)
                  .sort((a, b) => a - b)
                  .map(offset => {
                      const lines = linesForOffset(offset);
                      const pm = payrollMonth(offset);
                      return {
                          createdDate: isoDateTime(pm.start),
                          month: pm.month,
                          year: pm.year,
                          processedOn: lines[0].processedOn,
                          totalEmployees: lines.length,
                          totalAmount: monthTotals(lines).netPayable,
                          salaryStatus: lines[0].status,
                      };
                  }),
});

const salaryExcel = async (lines: PayrollLine[]) =>
    buildXlsx(
        'Salary Details',
        ['Emp ID', 'Name', 'Designation', 'Basic', 'HRA', 'Other Allowances', 'Bonus/Incentive', 'PF', 'PT', 'TDS', 'Net Pay'],
        lines.map(l => [
            l.employee.employeeId,
            l.employee.fullName,
            l.employee.designation,
            l.breakup.basic,
            l.breakup.hra,
            l.breakup.conveyance + l.breakup.medical + l.breakup.specialAllowance,
            l.bonus + l.incentive,
            l.breakup.employeePf,
            l.breakup.professionalTax,
            l.breakup.tds,
            l.netPayable,
        ])
    );

// ---- process salary (payouts) ----------------------------------------------------------------------------

const processRow = (l: PayrollLine): ProcessSalaryEmployeeRow => {
    const e = l.employee;
    const paid = l.status === 'PAID';
    const pending = beneficiaryPending(e);
    return {
        salaryId: l.salaryId,
        employeeId: String(e.id),
        employeeCode: e.employeeId,
        employeeName: e.fullName,
        employeeEmail: e.email,
        designation: e.designation,
        department: e.department,
        monthlySalary: l.breakup.grossEarnings,
        totalBonus: l.bonus,
        totalIncentive: l.incentive,
        totalOvertime: 0,
        totalReimbursement: 0,
        totalDeduction: l.deductions,
        totalPayable: l.netPayable,
        bankDetails: {
            id: `bank-${e.id}`,
            accountName: e.fullName,
            accountNumber: e.bank.accountNumber,
            bankName: e.bank.bankName,
            ifscCode: e.bank.ifsc,
            isDefaultAccount: true,
            transactionType: transactionTypeOf(e),
        },
        isPayoutReady: !paid && !pending,
        payoutBlockReason: (() => {
            if (paid) return 'Salary already paid';
            if (pending) return 'Bank account pending verification — beneficiary not added yet';
            return null;
        })(),
        salaryPaymentStatus: l.status,
        latestPayoutStatus: paid ? 'SUCCESS' : null,
        latestBatchReferenceId: paid ? `PAYB-${l.pm.year}${String(l.pm.month).padStart(2, '0')}-ACME` : null,
    };
};

const processSalaryEmployees = ({ mode, query }: MockContext): ProcessSalaryEmployeesResponse => {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    if (mode === 'empty') return { count: 0, page, limit, totalPayableSum: 0, rows: [] };
    const lines = linesFor(query.year, query.month).filter(l => matchesSearch(l.employee, query.searchText));
    return {
        count: lines.length,
        page,
        limit,
        totalPayableSum: monthTotals(lines).netPayable,
        rows: paginate(lines, page, limit).map(processRow),
    };
};

const processSalary = ({ body }: MockContext): ProcessSalaryResponse => {
    const ids: string[] = Array.isArray(body?.salaryIds) ? body.salaryIds : [];
    const lines = ids.map(findLineBySalaryId).filter((l): l is PayrollLine => Boolean(l));
    const batch = `PAYB-${Date.now()}`;
    const total = monthTotals(lines).netPayable;
    return {
        batchReferenceId: batch,
        totalRequestedCount: lines.length,
        initiatedCount: lines.length,
        skippedCount: 0,
        failedCount: 0,
        successCount: 0,
        totalRequestedAmount: total,
        totalInitiatedAmount: total,
        status: 'INITIATED',
        results: lines.map((l, i) => ({
            salaryId: l.salaryId,
            employeeId: String(l.employee.id),
            status: 'INITIATED' as const,
            referenceId: `${batch}-${i + 1}`,
            message: 'Payout initiated',
        })),
    };
};

/** Month-wide status used by Review Salary Details (SalaryProfileNew). */
const salaryMonthDetails = ({ mode, query }: MockContext) => {
    const lines = mode === 'empty' ? [] : linesFor(query.year, query.month);
    const pending = lines.filter(l => l.status === 'PENDING');
    let paymentStatus = 'UPCOMING';
    if (lines.length) paymentStatus = pending.length ? 'PENDING' : 'PAID';
    return {
        paymentStatus,
        outstandingStatus: pending.length ? 'PENDING' : null,
        noOfEmployees: pending.length || lines.length,
        totalEmployeesInMonth: lines.length,
        totalPayable: monthTotals(pending.length ? pending : lines).netPayable,
    };
};

// ---- salary rollout (employees' bank accounts / beneficiaries) -------------------------------------------

const rolloutRow = (e: MockEmployee): SalaryRolloutEmployeeRow => ({
    id: String(e.id),
    fullName: e.fullName,
    email: e.email,
    employeeId: e.employeeId,
    employeeStatus: employeeStatusOf(e),
    salary: e.salary.grossEarnings,
    accountName: e.fullName,
    accountNumber: e.bank.accountNumber,
    bankName: e.bank.bankName,
    ifscCode: e.bank.ifsc,
    upiId: null,
    transactionType: transactionTypeOf(e),
    bankAccountStatus: beneficiaryPending(e) ? 'Pending Verification' : 'Approved',
    beneficiaryStatus: beneficiaryPending(e) ? 'Pending' : 'Added',
    remark: e.status === 'notice' ? `Serving notice — last working day ${e.lastWorkingDay}` : null,
    profileImage: null,
});

const rolloutList = ({ mode, query }: MockContext): SalaryRolloutListResponse | SalaryRolloutPastListResponse => {
    // Nobody has left Acme yet, so the "past employees" list is always empty.
    if (mode === 'empty' || String(query.status ?? 'active').toLowerCase() === 'past') return { rows: [], count: 0 };
    const list = EMPLOYEES.filter(e => matchesSearch(e, query.search));
    return { rows: paginate(list, query.page, query.limit).map(rolloutRow), count: list.length };
};

const pendingBeneficiaries = ({ mode }: MockContext): PendingBeneficiaryEmployee[] =>
    mode === 'empty'
        ? []
        : EMPLOYEES.filter(beneficiaryPending).map(e => ({
              id: String(e.id),
              fullName: e.fullName,
              email: e.email,
              employeeStatus: employeeStatusOf(e),
              bankAccountStatus: 'Pending Verification',
              beneficiaryStatus: 'Pending',
              profileImage: null,
          }));

const eligibleEmployees: ModeData<EligibleEmployeeResponse> = {
    dummy: {
        count: EMPLOYEES.filter(e => !beneficiaryPending(e)).length,
        rows: EMPLOYEES.filter(e => !beneficiaryPending(e)).map(e => ({
            id: String(e.id),
            fullName: e.fullName,
            email: e.email,
            employeeId: e.employeeId,
            employeeStatus: employeeStatusOf(e),
            salary: e.salary.grossEarnings,
            bankAccountStatus: 'Approved',
            beneficiaryStatus: 'Added',
            accountNumber: e.bank.accountNumber,
            accountName: e.fullName,
            bankName: e.bank.bankName,
            ifscCode: e.bank.ifsc,
            transactionType: transactionTypeOf(e),
            upiId: null,
        })),
    },
    empty: { count: 0, rows: [] },
};

const salaryBreakup = ({ params }: MockContext): SalaryBreakupData => {
    const e = findEmployee(params.employeeId) ?? ESS_EMPLOYEE;
    const l = linesForOffset(0).find(x => x.employee.id === e.id)!;
    const b = l.breakup;
    return {
        month: l.pm.month,
        year: l.pm.year,
        grossSalary: l.gross,
        totalDeductions: l.deductions,
        totalPayable: l.netPayable,
        earnings: [
            { componentName: 'Basic Salary', calculatedAmount: b.basic },
            { componentName: 'House Rent Allowance (HRA)', calculatedAmount: b.hra },
            { componentName: 'Conveyance Allowance', calculatedAmount: b.conveyance },
            { componentName: 'Medical Allowance', calculatedAmount: b.medical },
            { componentName: 'Special Allowance', calculatedAmount: b.specialAllowance },
        ],
        deductions: [
            { componentName: 'Employee PF', calculatedAmount: b.employeePf },
            { componentName: 'Professional Tax', calculatedAmount: b.professionalTax },
            { componentName: 'TDS', calculatedAmount: b.tds },
        ],
    };
};

const bulkResults = (ids: unknown) =>
    (Array.isArray(ids) ? ids : []).map(id => ({
        employeeId: String(id),
        success: true,
        message: 'Bank account verified and beneficiary added',
        bankAccountStatus: 'Completed',
        beneficiaryStatus: 'Added',
    }));

// ---- bonus / incentives / increments / ad-hoc deductions -------------------------------------------------

const inPeriod = (date: string, query: MockContext['query']) => {
    const [y, m] = date.split('-').map(Number);
    if (query.year && Number(query.year) !== y) return false;
    const month = validMonth(query.month);
    return month === null || month === m;
};

const bonusesOf = (e: MockEmployee) =>
    isOnRollsIn(e, DIWALI_OFFSET)
        ? [
              {
                  corporateUser: CORPORATE_USER,
                  employee: String(e.id),
                  bonusDate: payrollMonth(DIWALI_OFFSET).start,
                  bonusPercentage: 0,
                  bonusAmount: DIWALI_BONUS,
                  type: 'FIXED',
                  paymentStatus: 'PAID',
                  createdAt: isoDateTime(monthsAgo(DIWALI_OFFSET, 10)),
                  updatedAt: isoDateTime(monthsAgo(DIWALI_OFFSET, 10)),
                  id: `bonus-diwali-${e.id}`,
              },
          ]
        : [];

const bonusList = ({ mode, params, query }: MockContext): bonusListingResponse => {
    const e = findEmployee(params.eId);
    const list = mode === 'empty' || !e ? [] : bonusesOf(e).filter(b => inPeriod(b.bonusDate, query));
    return { totalCount: list.length, bonusData: paginate(list, query.page, query.limit) };
};

const incentivesOf = (e: MockEmployee) =>
    INCENTIVES.filter(i => i.employeeCode === e.employeeId).map((i, n) => ({
        corporateUser: CORPORATE_USER,
        employee: String(e.id),
        incentiveDate: monthsAgo(i.offset, 25),
        amount: i.amount,
        effectiveMonth: monthLabel(payrollMonth(i.offset)),
        details: `Target ${inr(i.monthlyTarget)}, achieved ${inr(i.achievedTarget)} (${Math.round(
            (i.achievedTarget / i.monthlyTarget) * 100
        )}%)`,
        createdAt: isoDateTime(monthsAgo(i.offset, 25)),
        updatedAt: isoDateTime(monthsAgo(i.offset, 25)),
        id: `inc-${e.id}-${n + 1}`,
    }));

const incentiveList = ({ mode, params, query }: MockContext): incentiveListingResponse => {
    const e = findEmployee(params.eId);
    const list = mode === 'empty' || !e ? [] : incentivesOf(e).filter(i => inPeriod(i.incentiveDate, query));
    return { totalCount: list.length, incentivesData: paginate(list, query.page, query.limit) };
};

const incrementsOf = (e: MockEmployee) => {
    const pct = INCREMENTS[e.employeeId];
    if (!pct) return [];
    const oldBasic = Math.round(ctcAt(e, INCREMENT_OFFSET + 1) * 0.5);
    return [
        {
            corporateUser: CORPORATE_USER,
            employee: String(e.id),
            basicSalary: oldBasic,
            amount: String(Math.round(pct * 100)),
            newBasicSalary: e.salary.basic,
            effectiveDate: payrollMonth(INCREMENT_OFFSET).start,
            attachment: '',
            status: 'APPROVED',
            createdAt: isoDateTime(monthsAgo(INCREMENT_OFFSET + 1, 24)),
            updatedAt: isoDateTime(monthsAgo(INCREMENT_OFFSET + 1, 24)),
            id: `incr-${e.id}-1`,
            incrementType: 'PERCENTAGE',
        },
    ];
};

const incrementList = ({ mode, params, query }: MockContext): incrementListingResponse => {
    const e = findEmployee(params.eId);
    const list = mode === 'empty' || !e ? [] : incrementsOf(e).filter(i => inPeriod(i.effectiveDate, query));
    return { totalCount: list.length, incrementData: paginate(list, query.page, query.limit) };
};

// No ad-hoc (one-off) deductions this year — statutory PF/PT/TDS are applied through salary components.
const adHocDeductions = (): getDeductionResponse => ({ totalCount: 0, deductions: [] });

// ---- CTC breakdown + revision history ----------------------------------------------------------------------

const employeeCtc = ({ mode, params }: MockContext): Partial<CtcBreakdown> & { annualCtc: number } => {
    const e = findEmployee(params.employeeId) ?? ESS_EMPLOYEE;
    const s = e.salary;
    const comps = employeeComponents(e);
    const pfWage = Math.min(s.basic, 15000);
    const deductions = [
        { ...PF_COMPONENT, amountPercentage: 12, calculatedAmount: s.employeePf },
        { ...PT_COMPONENT, amountPercentage: 200, calculatedAmount: s.professionalTax },
    ].map(d => ({
        id: d.id,
        deductionName: d.deductionName,
        calculationType: d.calculationType as 'FIXED' | 'PERCENTAGE',
        salaryDeductionType: d.salaryDeductionType as 'BASIC_SALARY' | 'GROSS_SALARY',
        amountPercentage: d.amountPercentage,
        calculatedAmount: d.calculatedAmount,
        isGlobal: true,
    }));
    const breakdown = {
        annualCtc: s.annualCtc,
        annualCTC: s.annualCtc,
        monthlyCTC: s.monthlyCtc,
        costToCompany: s.monthlyCtc,
        basicSalary: s.basic,
        grossSalary: s.grossEarnings,
        earnings: comps.map(c => ({
            id: `${c.id}-${e.id}`,
            componentName: c.componentName,
            calculationType: c.calculationType,
            calculationBasis: c.calculationBasis,
            calculationBasedOn: c.calculationBasedOn,
            amountPercentage: c.calculationType === 'BALANCING' ? undefined : c.calculatedAmount,
            calculatedAmount: c.calculatedAmount ?? 0,
            isGlobal: false,
            isPartOfGross: true,
            globalRule: {
                calculationType: c.calculationType,
                calculationBasis: c.calculationBasis,
                calculationBasedOnName: c.calculationBasedOn === 'Basic Salary' ? 'Basic Salary' : null,
                amountPercentage: c.amountPercentage,
            },
        })),
        employerPf: {
            pfWage,
            ceiling: 15000,
            employeeEpf: s.employeePf,
            employerEps: Math.min(1250, Math.round(pfWage * 0.0833)),
            employerEpf: s.employerPf - Math.min(1250, Math.round(pfWage * 0.0833)),
            edli: 0,
            adminCharges: 0,
            employerTotal: s.employerPf,
            totalDeposit: s.employeePf + s.employerPf,
            adminEdli: 0,
            total: s.employerPf,
        },
        epfPolicy: 'CAPPED_15000' as const,
        esi: {
            eligible: false,
            employerContribution: 0,
            employeeContribution: 0,
            continuingAboveCeiling: false,
            coverageUntilMonth: null,
            coverageUntilYear: null,
        },
        lwf: {
            configured: false,
            fires: null,
            employeeAmount: 0,
            employerAmount: 0,
            schedule: null,
            scheduleLabel: null,
            workState: e.location === 'Mumbai' ? 'Maharashtra' : 'Karnataka',
            workStateIsOrgDefault: true,
            nextFireMonth: null,
            nextFireYear: null,
        },
        deductions,
        totalDeductions: s.employeePf + s.professionalTax,
        netTakeHome: s.grossEarnings - s.employeePf - s.professionalTax,
        warnings: [],
        isOverBudget: false,
    };
    return mode === 'empty' ? { annualCtc: 0 } : breakdown;
};

const revisionHistory = ({ mode, params }: MockContext): SalaryRevisionHistoryEntry[] => {
    const e = findEmployee(params.employeeId);
    if (mode === 'empty' || !e) return [];
    const hire: SalaryRevisionHistoryEntry = {
        id: `rev-${e.id}-1`,
        effectiveFrom: e.dateOfJoin,
        annualCTC: ctcAt(e, INCREMENT_OFFSET + 1) * 12,
        previousAnnualCTC: null,
        reason: 'Starting salary',
        createdBy: 'Ritu Sharma',
        createdAt: isoDateTime(e.dateOfJoin),
        arrears: null,
    };
    if (!INCREMENTS[e.employeeId]) return [{ ...hire, annualCTC: e.salary.annualCtc }];
    return [
        {
            id: `rev-${e.id}-2`,
            effectiveFrom: payrollMonth(INCREMENT_OFFSET).start,
            annualCTC: e.salary.annualCtc,
            previousAnnualCTC: hire.annualCTC,
            reason: 'Annual appraisal',
            createdBy: 'Ritu Sharma',
            createdAt: isoDateTime(monthsAgo(INCREMENT_OFFSET + 1, 24)),
            arrears: null,
        },
        hire,
    ];
};

// ---- reports (TDS / Form 16 / 24Q / income declaration) ------------------------------------------------------

const tdsItem = (e: MockEmployee): TDSReportItem => ({
    employeeId: String(e.id),
    name: e.fullName,
    email: e.email,
    taxRegime: 'NEW',
    tdsFrequency: 'MONTHLY',
    taxableIncome: annualTaxOf(e.salary.grossEarnings).taxable,
    exemptions: 75000,
    tdsDeduction: e.salary.tds,
});

const tdsList = ({ mode, query }: MockContext) => {
    const regime = String(query.regimeType ?? '').toUpperCase();
    const lines = linesFor(query.year, query.month);
    const list = mode === 'empty' || regime === 'OLD' ? [] : lines.map(l => tdsItem(l.employee));
    return raw({ status: true, responseCode: '000', message: 'OK', tdsDetails: list });
};

const tdsByEmployee = ({ query }: MockContext) => {
    const e = findEmployee(query.employee) ?? ESS_EMPLOYEE;
    const l = lineFor(e, query.year, query.month) ?? linesForOffset(0).find(x => x.employee.id === e.id)!;
    const t = tdsDetailsOf(l);
    const details: TDSReportbyEmployee = {
        employeeDetails: { name: e.fullName, email: e.email },
        taxRegime: 'NEW',
        fy: t.fy,
        grossAnnual: t.grossAnnual,
        taxableIncome: t.taxableIncome,
        exemptions: t.standardDeduction,
        slabBreakdown: t.slabBreakdown,
        taxBeforeRebate: t.taxBeforeRebate,
        rebate: t.rebate,
        totalTax: t.totalTax,
        monthlyTds: t.tdsMonthly,
        tdsFrequency: 'MONTHLY',
        cess: 0,
    };
    return raw({ status: true, responseCode: '000', message: 'OK', tdsDetails: details });
};

const assessmentPeriod = (assessmentYear: unknown) => {
    // Assessment year "2026-27" covers FY 2025-26 (April 2025 – March 2026).
    const startYear = Number(String(assessmentYear ?? '').slice(0, 4)) || today().getFullYear();
    return { periodStart: `${startYear - 1}-04-01`, periodEnd: `${startYear}-03-31`, startYear };
};

const form16Base = (e: MockEmployee, assessmentYear: unknown) => {
    const { periodStart, periodEnd } = assessmentPeriod(assessmentYear);
    return {
        assessmentYear: String(assessmentYear ?? ''),
        employeeDetails: {
            name: e.fullName,
            address: e.address,
            pan: e.pan,
            tan: COMPANY.tan,
            employeeRefNo: e.employeeId,
        },
        employerDetails: {
            name: COMPANY.name,
            address: `${COMPANY.offices.Bengaluru.line1}, ${COMPANY.offices.Bengaluru.city}, ${COMPANY.offices.Bengaluru.state} ${COMPANY.offices.Bengaluru.pincode}`,
            pan: COMPANY.pan,
            employerRefNo: COMPANY.tan,
            periodStart,
            periodEnd,
            certificateNumber: `F16-${e.employeeId}`,
            updatedDate: daysFromToday(-30),
            citAddress: 'CIT (TDS), Bengaluru, Karnataka',
        },
    };
};

const form16A = ({ mode, query }: MockContext) => {
    const e = findEmployee(query.employee);
    if (mode === 'empty' || !e) return {};
    const quarterly = e.salary.tds * 3;
    const credited = e.salary.grossEarnings * 3;
    return {
        ...form16Base(e, query.assessmentYear),
        quarterSummary: ['Q1', 'Q2', 'Q3', 'Q4'].map((quarter, i) => ({
            quarter,
            receiptNumber: `QRBNA${String(4521 + i * 7).padStart(5, '0')}`,
            amountPaidCredited: credited,
            taxDeducted: quarterly,
            taxDeposited: quarterly,
        })),
        challans: ['Q1', 'Q2', 'Q3', 'Q4'].map((_, i) => ({
            serialNo: i + 1,
            taxDeposited: quarterly,
            bsrCode: '0510308',
            taxDepositedDate: `${assessmentPeriod(query.assessmentYear).startYear - (i < 3 ? 1 : 0)}-${['07', '10', '01', '04'][i]}-07`,
            challanSerialNo: String(20450 + i * 13),
            oltasMatchingStatus: 'F',
        })),
    };
};

const form16B = ({ mode, query }: MockContext) => {
    const e = findEmployee(query.employee);
    if (mode === 'empty' || !e) return {};
    const annualGross = e.salary.grossEarnings * 12;
    const t = annualTaxOf(e.salary.grossEarnings);
    return {
        ...form16Base(e, query.assessmentYear),
        salaryIncome: { grossSalary: annualGross, perquisitesValue: 0, profitsInLieu: 0, total: annualGross },
        incomeChargableAtSalary: {
            deductionUnder: 75000,
            incomeChargableUnderSal: annualGross - 75000,
            totalSalaryInc: annualGross - 75000,
        },
        otherIncome: { interestIncome: 0, otherSources: 0, total: 0 },
        grossTotalIncome: { salaries: annualGross - 75000, otherIncomes: 0, total: annualGross - 75000 },
        totalIncome: { grossIncome: annualGross - 75000, totalDeduction: 0, totalIncome: t.taxable },
    };
};

const form16Download = ({ query }: MockContext) => {
    const e = findEmployee(query.employee) ?? ESS_EMPLOYEE;
    const part = String(query.formType ?? 'form16a') === 'form16b' ? 'Part B' : 'Part A';
    const t = annualTaxOf(e.salary.grossEarnings);
    return {
        pdfData: {
            type: 'Buffer',
            data: buildPdf(`Form 16 ${part} - Assessment Year ${query.assessmentYear ?? ''}`, [
                `Employer: ${COMPANY.name} (TAN ${COMPANY.tan}, PAN ${COMPANY.pan})`,
                `Employee: ${e.fullName} (${e.employeeId}), PAN ${e.pan}`,
                '',
                `Gross salary: ${inr(e.salary.grossEarnings * 12)}`,
                'Standard deduction u/s 16(ia): INR 75,000',
                `Taxable income: ${inr(t.taxable)}`,
                `Tax payable (new regime): ${inr(t.total)}`,
                `TDS deducted and deposited: ${inr(e.salary.tds * 12)}`,
            ]),
        },
    };
};

const form24qList = ({ mode, query }: MockContext) => {
    if (mode === 'empty') return [];
    const fy = financialYearOf(today().getFullYear(), today().getMonth() + 1);
    const prevStart = Number(fy.slice(0, 4)) - 1;
    const prevFy = `${prevStart}-${String((prevStart + 1) % 100).padStart(2, '0')}`;
    const rows = [
        { quarter: 'Q4', financialYear: prevFy, at: monthsAgo(5, 28) },
        { quarter: 'Q1', financialYear: fy, at: monthsAgo(3, 26) },
    ].map((r, i) => ({
        _id: `f24q-${i + 1}`,
        quarter: r.quarter,
        data: { financialYear: r.financialYear },
        file: SAMPLE_PDF_URL,
        updatedAt: isoDateTime(r.at),
    }));
    const search = String(query.search ?? '').toLowerCase();
    return rows.filter(
        r =>
            (!query.year || r.data.financialYear.startsWith(String(query.year).slice(0, 4))) &&
            (!search || r.quarter.toLowerCase().includes(search))
    );
};

const incomeDeclaration = ({ mode, query }: MockContext): IncomeDeclarationFormGetResponse | Record<string, never> => {
    const e = findEmployee(query.employee);
    if (mode === 'empty' || !e) return {};
    const fy = String(query.financialYear ?? financialYearOf(today().getFullYear(), today().getMonth() + 1));
    const at = isoDateTime(monthsAgo(5, 12));
    return {
        id: `idf-${e.id}`,
        corporateUser: CORPORATE_USER,
        employee: String(e.id),
        financialYear: fy,
        createdAt: at,
        updatedAt: at,
        hraDetails: {
            totalRentPaid: 300000,
            landlordName: 'Ramesh Kulkarni',
            landlordPAN: 'AKLPK4521Q',
            rentedPropertyAddress: `${e.location === 'Mumbai' ? 'Flat 703, Sea Breeze, Powai, Mumbai 400076' : 'Flat 12B, Brigade Palmsprings, JP Nagar, Bengaluru 560078'}`,
            rentReceipts: SAMPLE_PDF_URL,
        },
        ltaDetails: {
            ltaAmountClaimed: 0,
            travelDate: '',
            travelDestination: '',
            travelProof: '',
        },
        homeLoanInterestDetails: {
            interestPaid: 0,
            lenderName: '',
            lenderPAN: '',
            lenderAddress: '',
            loanProof: '',
        },
        incomeDeclaration: { annualIncome: e.salary.grossEarnings * 12, incomeProof: '' },
        chapterVIA: [
            { _id: `via-${e.id}-1`, investmentType: '80C - ELSS Mutual Fund', amountInvested: 150000, proofDocument: SAMPLE_PDF_URL },
            { _id: `via-${e.id}-2`, investmentType: '80D - Health Insurance Premium', amountInvested: 25000, proofDocument: SAMPLE_PDF_URL },
        ],
        homeLoanDeductions: [],
    };
};

// ---- payroll / virtual / bank accounts -------------------------------------------------------------------------

const ACCOUNT_CREATED = isoDateTime(monthsAgo(46, 20));

const virtualAccount: VirtualAccountRecord = {
    _id: 'va-acme-1',
    corporateUser: CORPORATE_USER,
    decentroCustomerId: 'DCCUST-ACME-21458',
    decentroTxnId: 'DCTRX-7F21A9C4',
    virtualAccountNumber: '462515001001458',
    virtualAccountIfsc: 'YESB0CMSNOC',
    bankCode: 'YESB',
    name: COMPANY.name,
    pan: COMPANY.pan,
    mobile: '9845012345',
    status: 'SUCCESS',
    responseCode: 'S00000',
    message: 'Virtual account created successfully',
    providerResponse: {},
    createdAt: ACCOUNT_CREATED,
    updatedAt: ACCOUNT_CREATED,
};

const companyBankRecord: BankAccountRecord = {
    _id: 'bank-acme-1',
    corporateUser: CORPORATE_USER,
    accountHolderName: COMPANY.name,
    accountNumber: COMPANY.bank.accountNumber,
    ifscCode: COMPANY.bank.ifsc,
    branch: COMPANY.bank.branch,
    mobile: '9845012345',
    nameAtBank: COMPANY.name.toUpperCase(),
    nameMatchScore: 100,
    accountStatus: 'VALID',
    validationType: 'PENNY_DROP',
    validationMessage: 'Account verified successfully',
    bankReferenceNumber: '612345678901',
    decentroTxnId: 'DCTRX-5B90E1D2',
    referenceId: 'ACME-BANK-VERIFY-1',
    responseKey: 'success_account_valid',
    message: 'Bank account verified',
    verifiedAt: ACCOUNT_CREATED,
    providerResponse: {},
    createdAt: ACCOUNT_CREATED,
    updatedAt: ACCOUNT_CREATED,
};

/** Enough in the payroll account to pay this month's open run, plus a buffer. */
const VA_BALANCE = Math.ceil((monthTotals(linesForOffset(0)).netPayable + 250000) / 1000) * 1000;

const virtualBalance: ModeData<VirtualAccountBalance> = {
    dummy: {
        virtualAccountNumber: virtualAccount.virtualAccountNumber!,
        virtualAccountIfsc: virtualAccount.virtualAccountIfsc,
        accountName: COMPANY.name,
        availableBalance: VA_BALANCE,
        providerData: {},
    },
    empty: {
        virtualAccountNumber: virtualAccount.virtualAccountNumber!,
        virtualAccountIfsc: virtualAccount.virtualAccountIfsc,
        accountName: COMPANY.name,
        availableBalance: 0,
        providerData: {},
    },
};

const rolloutBank = (
    id: string,
    bankName: string,
    accountNumber: string,
    ifscCode: string,
    branch: string,
    isPrimary: boolean
): SalaryRolloutBankAccount => ({
    _id: id,
    corporateUser: CORPORATE_USER,
    accountHolderName: COMPANY.name,
    bankName,
    accountNumber,
    ifscCode,
    accountType: 'current',
    branch,
    currency: 'INR',
    isPrimary,
    createdAt: ACCOUNT_CREATED,
    updatedAt: ACCOUNT_CREATED,
});

const rolloutBanks: ModeData<SalaryRolloutBankAccount[]> = {
    dummy: [
        rolloutBank('srb-1', COMPANY.bank.bankName, COMPANY.bank.accountNumber, COMPANY.bank.ifsc, COMPANY.bank.branch, true),
        rolloutBank('srb-2', 'ICICI Bank', '012405009871', 'ICIC0000124', 'Bandra Kurla Complex, Mumbai', false),
    ],
    empty: [],
};

/** Payroll account statement: the monthly top-up from HDFC and the salary payout of each paid month. */
const bankTransactions = ({ mode, query }: MockContext): BankTransaction[] => {
    if (mode === 'empty') return [];
    const rows = [1, 2, 3, 4, 5, 6].flatMap(offset => {
        const pm = payrollMonth(offset);
        const net = monthTotals(linesForOffset(offset)).netPayable;
        const payout = linesForOffset(offset)[0]?.payingDate ?? isoDateTime(pm.end);
        const topUp = isoDateTime(`${pm.year}-${String(pm.month).padStart(2, '0')}-25`, '06:15:00');
        const tag = `${pm.year}${String(pm.month).padStart(2, '0')}`;
        const credit: BankTransaction = {
            _id: `txn-cr-${tag}`,
            description: `Funds added from ${COMPANY.bank.bankName} A/c XXXX${COMPANY.bank.accountNumber.slice(-4)}`,
            dateTime: topUp,
            transactionId: `NEFTN${tag}0458821`,
            paymentMethod: 'NEFT',
            amount: Math.ceil(net / 10000) * 10000,
            type: 'credit',
            status: 'Success',
        };
        const debit: BankTransaction = {
            _id: `txn-dr-${tag}`,
            description: `Salary payout – ${monthLabel(pm)} (${linesForOffset(offset).length} employees)`,
            dateTime: payout,
            transactionId: `PAYB-${tag}-ACME`,
            paymentMethod: 'IMPS',
            amount: net,
            type: 'debit',
            status: 'Success',
        };
        return [debit, credit];
    });
    const from = query.startDate ? String(query.startDate) : '';
    const to = query.endDate ? String(query.endDate) : '';
    const search = String(query.search ?? '').toLowerCase();
    return rows.filter(
        r =>
            (!from || r.dateTime.slice(0, 10) >= from.slice(0, 10)) &&
            (!to || r.dateTime.slice(0, 10) <= to.slice(0, 10)) &&
            (!search || `${r.description} ${r.transactionId}`.toLowerCase().includes(search))
    );
};

const removeFundsRow: RemoveFundsResponse = {
    referenceId: 'WDR-ACME-0001',
    amount: 150000,
    transferType: 'NEFT',
    status: 'SUCCESS',
    decentroTxnId: 'DCTRX-9C1D44AB',
    availableBalance: VA_BALANCE,
    beneficiaryAccountNumber: COMPANY.bank.accountNumber,
    beneficiaryIfsc: COMPANY.bank.ifsc,
    createdAt: isoDateTime(monthsAgo(2, 12)),
};

const removeFundsList: ModeData<RemoveFundsListResponse> = {
    dummy: { rows: [{ ...removeFundsRow, id: 'wdr-1' }], count: 1, page: 1, limit: 10, totalPages: 1 },
    empty: { rows: [], count: 0, page: 1, limit: 10, totalPages: 0 },
};

// ---- old-style salary profile (employees-salary/employee-salary-profile) --------------------------------------

const salaryProfile = ({ params }: MockContext): SalaryProfileResponse => {
    const e = findEmployee(params.employeeId) ?? ESS_EMPLOYEE;
    const l = linesForOffset(0).find(x => x.employee.id === e.id)!;
    const info = salaryInformationOf(l);
    const salaryInformation = {
        basicPay: info.basicPay,
        travelAllowances: info.travelAllowances,
        homeAllowances: info.homeAllowances,
        medicalAllowances: info.medicalAllowances,
        otherAllowances: info.otherAllowances,
        other: 0,
    };
    const schedule = { ...workSchedule, overTime: '0' };
    return {
        salaryInfo: {
            corporateUser: CORPORATE_USER,
            employee: String(e.id),
            year: l.pm.year,
            month: l.pm.month,
            salaryCycleStart: isoDateTime(l.pm.start, '00:00:00'),
            salaryCycleEnd: isoDateTime(l.pm.end, '00:00:00'),
            salaryCycleDays: l.pm.daysInMonth,
            leaveCount: 0,
            leaveDeduction: 0,
            attendancePercentage: 100,
            totalIncentive: l.incentive,
            totalBonus: l.bonus,
            totalOvertime: 0,
            totalPayable: l.netPayable,
            totalOtherDeduction: 0,
            salaryInformation,
            workSchedule: schedule,
            gratuityContribution: Math.round(l.breakup.basic * 0.0481),
            reimbursements: [],
            totalReimbursement: 0,
            status: true,
            paySlipEmailSent: false,
            message: '',
            paymentStatus: l.status,
            createdAt: isoDateTime(l.pm.start),
            updatedAt: isoDateTime(l.pm.start),
            id: l.salaryId,
            totalAllowance: l.breakup.grossEarnings - l.breakup.basic,
        },
        employee: {
            _id: String(e.id),
            corporateUser: CORPORATE_USER,
            fullName: e.fullName,
            profileImage: '',
            dateOfBirth: e.dateOfBirth,
            gender: e.gender,
            mobileNo: e.mobileNo,
            personalEmail: e.personalEmail,
            personalAddress: e.address,
            employeeInformation: {
                dateOfJoin: e.dateOfJoin,
                employeeId: e.employeeId,
                designation: e.designation,
                department: { departmentName: e.department, id: String(e.departmentId) },
                workLocation: e.location,
                status: 'active',
                schedule: 'Day shift',
            },
            salaryInformation,
            employeeDocuments: [],
            bankDetails: {
                accountName: e.fullName,
                accountNumber: e.bank.accountNumber,
                bankName: e.bank.bankName,
                bankBranch: e.bank.branch,
                ibanNumber: '',
                accountType: 'savings',
            },
            createdAt: isoDateTime(e.dateOfJoin),
            updatedAt: isoDateTime(e.dateOfJoin),
            __v: 0,
            workSchedule: { ...schedule, workHrs: COMPANY.workWeek.workingHours },
            emergencyNo: e.emergencyContact.mobileNo,
            isEmployeeDeleted: false,
        },
        leaveSummary: [
            { leaveType: 'Casual Leave', leaveCount: 2 },
            { leaveType: 'Sick Leave', leaveCount: 1 },
        ],
    };
};

// ---- ESS (employee self-service) ------------------------------------------------------------------------------

const essPayslips = (ctx: MockContext): { rows: PayslipRow[] } => {
    if (isEmptyMode(ctx)) return { rows: [] };
    const year = Number(ctx.query.year) || today().getFullYear();
    const rows = linesForEmployee(essRequester())
        .filter(l => l.status === 'PAID' && l.pm.year === year)
        .sort((a, b) => b.pm.month - a.pm.month)
        .map(l => {
            const info = salaryInformationOf(l);
            return {
                id: l.salaryId,
                year: l.pm.year,
                month: l.pm.month,
                payingDate: l.payingDate ?? undefined,
                paymentStatus: l.status,
                totalPayable: l.netPayable,
                salaryInformation: {
                    basicPay: info.basicPay,
                    hraAmount: info.hraAmount,
                    other: info.other,
                    epfAmount: info.epfAmount,
                    esiAmount: 0,
                    lwfAmount: 0,
                    deductionAmount: info.deductionAmount,
                    tdsAmount: info.tdsAmount,
                },
                totalIncentive: l.incentive,
                totalBonus: l.bonus,
                totalOvertime: 0,
                totalReimbursement: 0,
                leaveDeduction: 0,
                totalOtherDeduction: 0,
                nonWorkingDaysDeduction: 0,
            };
        });
    return { rows };
};

/** ESS download is requested with responseType 'blob' — the response body itself must be the PDF Blob. */
const essPayslipDownload = ({ params }: MockContext) => {
    const line = findLineBySalaryId(params.salaryId) ?? linesForOffset(1).find(l => l.employee.id === essRequester().id)!;
    return raw(new Blob([new Uint8Array(payslipPdf(line))], { type: 'application/pdf' }));
};

/** Most recent weekdays before today — attendance-based deductions logged in the open (current) run. */
const recentWeekday = (skip: number) => {
    const d = today();
    let found = -1;
    while (found < skip) {
        d.setDate(d.getDate() - 1);
        if (d.getDay() !== 0 && d.getDay() !== 6) found += 1;
    }
    return toIsoDate(d);
};

const essDeductionLog = (ctx: MockContext) => {
    if (isEmptyMode(ctx)) return { records: [], total: 0 };
    const perDay = Math.round(essRequester().salary.grossEarnings / 30);
    const records: DeductionLogRecord[] = [
        {
            id: `att-${essRequester().id}-${recentWeekday(1)}`,
            date: recentWeekday(1),
            type: 'Late arrival (beyond 30-min grace)',
            status: 'late',
            lateMinutes: 52,
            deduction: Math.round(perDay / 4),
            disputeRaised: true,
            disputeStatus: 'requestedByEmployee',
        },
        {
            id: `att-${essRequester().id}-${recentWeekday(3)}`,
            date: recentWeekday(3),
            type: 'Late arrival (beyond 30-min grace)',
            status: 'late',
            lateMinutes: 38,
            deduction: Math.round(perDay / 4),
            disputeRaised: false,
        },
    ];
    const from = ctx.query.from ? String(ctx.query.from) : '';
    const to = ctx.query.to ? String(ctx.query.to) : '';
    const filtered = records.filter(r => (!from || r.date >= from) && (!to || r.date <= to));
    return { records: paginate(filtered, ctx.query.page, ctx.query.limit), total: filtered.length };
};

// ---- routes -----------------------------------------------------------------------------------------------------
// Literal sub-paths are registered before their `:param` siblings.

export const salaryRoutes: MockRoute[] = [
    // ESS — Sneha Iyer's own payslips and attendance deductions.
    route('GET', `${BASE}/payslips`, essPayslips),
    route('GET', `${BASE}/payslips/:salaryId/download`, essPayslipDownload),
    route('GET', `${BASE}/deduction-log`, essDeductionLog),

    // Salary run (Salary Details / Review Salary Details / Payroll History tab).
    route('GET', `${BASE}/salary/calculateSalary`, calculateSalary),
    route('GET', `${BASE}/salary/statement`, calculateSalary),
    route('GET', `${BASE}/salary/statement/excel`, async ({ query }) => ({
        buffer: { type: 'Buffer', data: await salaryExcel(filterByStatus(linesFor(query.year, query.month), query.filter)) },
        fileType: XLSX_MIME,
    })),
    route('GET', `${BASE}/salary/salary-details`, salaryMonthDetails),
    route('GET', `${BASE}/salary/payrollHistory`, payrollHistoryByYear),
    route('GET', `${BASE}/salary/payrollHistory/excel`, async ({ query }) => {
        const rows = offsetsInYear(query.year).map(o => {
            const lines = linesForOffset(o);
            return [monthLabel(payrollMonth(o)), lines.length, monthTotals(lines).netPayable, lines[0].status];
        });
        return {
            buffer: { type: 'Buffer', data: await buildXlsx('Payroll History', ['Month', 'Employees', 'Total Net Pay (INR)', 'Status'], rows) },
            fileType: XLSX_MIME,
        };
    }),
    route('PUT', `${BASE}/salary/approve-salary`, () => ({ message: 'Salary approved and recorded successfully.' })),
    route('PUT', `${BASE}/salary/mark-as-paid`, () => ({ message: 'Salary marked as paid.' })),
    route('PUT', `${BASE}/salary/mark-as-approved`, () => ({ message: 'Salary status reverted to approved.' })),
    route('GET', `${BASE}/salary/all-payroll-slips/:id`, payslipsOfEmployee),
    route('GET', `${BASE}/salary/empSalaryProfile/:id`, ({ mode, params, query }) => {
        const e = findEmployee(params.id);
        const l = e && mode !== 'empty' ? lineFor(e, query.year, query.month) : undefined;
        return l ? salaryDetailsOf(l) : notRecorded();
    }),
    route('GET', `${BASE}/salary/profile/:employeeId`, salaryProfile),
    // `:id` is a salaryId (payslip row) or an employee id with ?year&month (TDS report).
    route('GET', `${BASE}/salary/payroll-slips/download/:id`, ({ params, query }) =>
        query.year && query.month
            ? payslipByEmployee({ params: { employeeId: params.id }, query })
            : payslipDownload(findLineBySalaryId(params.id))
    ),
    route('GET', `${BASE}/salary/payroll-slips/email/:salaryId`, () => true),
    route('GET', `${BASE}/payroll-slips/download/:employeeId`, payslipByEmployee),

    // Salary history / stats (new Salary module).
    route('GET', `${BASE}/salary-history`, salaryHistory),
    route('GET', `${BASE}/salary-history/detail`, salaryHistoryDetail),
    route('GET', `${BASE}/salary-history/stats`, salaryStats),
    route('GET', 'corporate/:corporateId/payroll/salary-history/report', historyReport),
    route('GET', 'corporate/:corporateId/payroll/salary-history/report/simple', historyReport),

    // Process salary (payouts from the payroll virtual account).
    route('GET', `${BASE}/process-salary/employees`, processSalaryEmployees),
    route('POST', `${BASE}/process-salary`, processSalary),

    // Salary rollout — employees' bank accounts and beneficiaries.
    route('GET', `${BASE}/salary-rollout/employees`, rolloutList),
    route('GET', `${BASE}/salary-rollout/employees/export`, async ({ query }) => {
        const past = String(query.type) === 'past';
        const list = past ? [] : EMPLOYEES;
        return {
            buffer: {
                type: 'Buffer',
                data: await buildXlsx(
                    past ? 'Past Employees' : 'Employees',
                    ['Emp ID', 'Name', 'Email', 'Bank', 'Account No.', 'IFSC', 'Mode', 'Bank A/c Status', 'Beneficiary'],
                    list.map(e => {
                        const r = rolloutRow(e);
                        return [e.employeeId, e.fullName, e.email, e.bank.bankName, e.bank.accountNumber, e.bank.ifsc, r.transactionType ?? '', r.bankAccountStatus, r.beneficiaryStatus];
                    })
                ),
            },
            fileType: XLSX_MIME,
        };
    }),
    route('GET', `${BASE}/salary-rollout/employees/pending-beneficiary`, pendingBeneficiaries),
    route('GET', `${BASE}/salary-rollout/employees/pending-verification`, pendingBeneficiaries),
    route('GET', `${BASE}/salary-rollout/employees/:employeeId/salary-breakup`, salaryBreakup),
    route('POST', `${BASE}/salary-rollout/employees/add-beneficiaries`, ({ body }) => {
        const results = bulkResults(body?.employeeIds);
        return done({ results, summary: { succeeded: results.length, failed: 0 } }, 'Beneficiaries added successfully');
    }),
    route('PUT', `${BASE}/salary-rollout/employees/:employeeId`, ({ params, body }) =>
        done({ id: params.employeeId, ...(body ?? {}) }, 'Employee details updated')
    ),
    route('POST', `${BASE}/beneficiary/bulk-verify-accounts`, ({ body }) => {
        const results = bulkResults(body?.employeeIds);
        return done({ results, summary: { succeeded: results.length, failed: 0 } }, 'Bank accounts verified successfully');
    }),
    route('GET', 'corporate/:corporateId/payroll/salary-rollout/employees/eligible', ({ mode }) =>
        byMode(mode, eligibleEmployees)
    ),

    // Bonus.
    route('GET', `${BASE}/bonus/bonus-details/:bonusId`, ({ params }) => {
        const all = EMPLOYEES.flatMap(bonusesOf);
        return all.find(b => b.id === params.bonusId) ?? all[0];
    }),
    route('POST', `${BASE}/bonus/calculation/:eId`, ({ params, body }) => {
        const e = employeeFrom({ params } as MockContext, 'eId');
        const pct = Number(body?.bonusPercentage) || 0;
        const amount = body?.type === 'PERCENTAGE' ? Math.round((e.salary.basic * pct) / 100) : Number(body?.bonusAmount) || 0;
        return {
            bonusAmount: String(amount),
            bonusPercentage: String(pct || Math.round((amount / e.salary.basic) * 10000) / 100),
        };
    }),
    route('GET', `${BASE}/bonus/:eId`, bonusList),
    route('POST', `${BASE}/bonus/:employeeId`, ({ params, body }) =>
        done(
            {
                corporateUser: CORPORATE_USER,
                employee: params.employeeId,
                bonusDate: body?.bonusDate ?? toIsoDate(today()),
                bonusPercentage: Number(body?.bonusPercentage) || 0,
                bonusAmount: Number(body?.bonusAmount) || 0,
                type: body?.type ?? 'FIXED',
                paymentStatus: 'PENDING',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                id: `bonus-${Date.now()}`,
            },
            'Bonus added successfully'
        )
    ),
    route('PUT', `${BASE}/bonus/:bId`, ({ params, body }) => done({ id: params.bId, ...(body ?? {}) }, 'Bonus updated successfully')),
    route('DELETE', `${BASE}/bonus/:rId`, ({ params }) => done({ id: params.rId }, 'Bonus deleted successfully')),

    // Incentives.
    route('GET', `${BASE}/incentives/:eId`, incentiveList),
    route('POST', `${BASE}/incentives/:employeeId`, ({ params, body }) => ({
        corporateUser: CORPORATE_USER,
        employee: params.employeeId,
        incentiveDate: body?.incentiveDate ?? toIsoDate(today()),
        monthlyTarget: String(body?.monthlyTarget ?? ''),
        achievedTarget: String(body?.achievedTarget ?? ''),
        achievedSaleInPercent: String(body?.achievedSaleInPercent ?? ''),
        amount: Number(body?.amount) || 0,
        paymentStatus: 'PENDING',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        id: `inc-${Date.now()}`,
    })),
    route('PUT', `${BASE}/incentives/:id`, ({ params, body }) => ({ id: params.id, ...(body ?? {}) })),
    route('DELETE', `${BASE}/incentives/:rId`, () => ({})),

    // Increments.
    route('GET', `${BASE}/increment/calculate-basic-salary/:employeeId`, ({ params, query }) => {
        const e = employeeFrom({ params } as MockContext, 'employeeId');
        const offset = Math.max(0, offsetOf(query.year, query.month));
        return { basicSalary: Math.round(ctcAt(e, offset) * 0.5) };
    }),
    route('POST', `${BASE}/increment/calculate-increment/:eId`, ({ body }) => {
        const basic = Number(body?.basicSalary) || 0;
        const isPct = String(body?.type ?? '').toUpperCase() === 'PERCENTAGE';
        const pct = Number(body?.bonusPercentage) || 0;
        const amount = isPct ? Math.round((basic * pct) / 100) : Number(body?.bonusAmount) || 0;
        return {
            incrementAmount: String(amount),
            incrementPercentage: String(isPct ? pct : Math.round((amount / (basic || 1)) * 10000) / 100),
            newBasicSalary: basic + amount,
        };
    }),
    route('GET', `${BASE}/increment/:eId`, incrementList),
    route('POST', `${BASE}/increment/:employeeId`, ({ params, body }) =>
        done(
            {
                corporateUser: CORPORATE_USER,
                employee: params.employeeId,
                basicSalary: Number(body?.basicSalary) || 0,
                incrementPercentage: 0,
                incrementAmount: Number(body?.amount) || 0,
                newBasicSalary: Number(body?.newBasicSalary) || 0,
                effectiveDate: body?.effectiveDate ?? toIsoDate(today()),
                attachment: '',
                status: 'APPROVED',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                id: `incr-${Date.now()}`,
            },
            'Increment added successfully'
        )
    ),
    route('PUT', `${BASE}/increment/:incrementId`, ({ params, body }) =>
        done({ id: params.incrementId, ...(body ?? {}) }, 'Increment updated successfully')
    ),
    route('DELETE', `${BASE}/increment/:rId`, ({ params }) => done({ id: params.rId }, 'Increment deleted successfully')),

    // Ad-hoc deductions (per employee, per month).
    route('GET', `${BASE}/deductions/:eId`, adHocDeductions),
    route('POST', `${BASE}/deductions/:employeeId/direct`, ({ params, body }) =>
        done(
            {
                corporateUser: CORPORATE_USER,
                employee: params.employeeId,
                deductionDate: body?.deductionDate ?? toIsoDate(today()),
                deductionType: body?.deductionName ?? 'Other',
                deductionAmount: Number(body?.amountPercentage) || 0,
                deductionStatus: 'PENDING',
                id: `ded-${Date.now()}`,
            },
            'Deduction added successfully'
        )
    ),
    route('PUT', `${BASE}/deductions/:employeeId/:id`, ({ params, body }) => ({ id: params.id, ...(body ?? {}) })),
    route('DELETE', `${BASE}/deductions/:eId/:deductionId`, () => ({})),

    // Salary components (HR settings + employee salary structure).
    route('GET', `${BASE}/salary-component`, ({ mode, query }) => {
        const data = byMode(mode, salaryComponentList);
        const q = String(query.searchText ?? '').toLowerCase();
        const list = data.componentData.filter(c => !q || c.componentName.toLowerCase().includes(q));
        return { totalCount: list.length, componentData: paginate(list, query.page, query.limit) };
    }),
    route('GET', `${BASE}/salary-component/currentGlobalComponent`, ({ mode }): AllSalaryComponentListResponse => ({
        componentData: mode === 'empty' ? [] : GLOBAL_COMPONENTS,
        totalDeduction: '0',
    })),
    route('GET', `${BASE}/salary-component/currentEmployeeComponent/:eId`, ({ mode, params }): AllSalaryComponentListResponse => {
        const e = employeeFrom({ params } as MockContext, 'eId');
        return {
            componentData: mode === 'empty' ? [] : employeeComponents(e),
            totalDeduction: String(e.salary.employeePf + e.salary.professionalTax),
        };
    }),
    route('GET', `${BASE}/salary-component/salary-component-listByEmail/:eId`, ({ mode, params }): AllSalaryComponentListResponse => {
        const e = employeeFrom({ params } as MockContext, 'eId');
        return {
            componentData: mode === 'empty' ? [] : employeeComponents(e),
            totalDeduction: String(e.salary.employeePf + e.salary.professionalTax),
        };
    }),
    route('GET', `${BASE}/salary-component/employeeComponents/:employeeId`, ({ mode, params }) => {
        const e = employeeFrom({ params } as MockContext, 'employeeId');
        const list = mode === 'empty' ? [] : employeeComponents(e);
        return {
            componentData: list.map(c => ({ ...c, amountPercentage: c.calculatedAmount, calculationType: 'FIXED' })),
            totalCount: list.length,
            totalEarnings: mode === 'empty' ? 0 : e.salary.grossEarnings,
        };
    }),
    route('GET', `${BASE}/salary-component/employee/:employeeId/revision-history`, revisionHistory),
    route('POST', `${BASE}/salary-component/employee`, ({ body }) => ({
        ...(body ?? {}),
        corporateUser: CORPORATE_USER,
        isGlobal: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        id: body?.id ?? `sc-emp-${Date.now()}`,
    })),
    route('POST', `${BASE}/salary-component/employee/:employeeId/redistribute-basic`, ({ params, body }) => {
        const e = employeeFrom({ params } as MockContext, 'employeeId');
        const s = e.salary;
        const basicSalary =
            body?.calculationType === 'PERCENTAGE'
                ? Math.round((s.grossEarnings * (Number(body?.amountPercentage) || 0)) / 100)
                : Number(body?.amountPercentage) || s.basic;
        return { basicSalary, specialAllowance: s.grossEarnings - basicSalary - s.hra - s.conveyance - s.medical, grossSalary: s.grossEarnings };
    }),
    route('POST', `${BASE}/salary-component/employee/:employeeId/redistribute-component`, ({ params, body }) => {
        const e = employeeFrom({ params } as MockContext, 'employeeId');
        const amount = Number(body?.amountPercentage) || 0;
        return {
            componentName: GLOBAL_COMPONENTS.find(c => body?.componentId?.startsWith?.(c.id))?.componentName ?? 'Allowance',
            componentAmount: amount,
            specialAllowance: Math.max(0, e.salary.specialAllowance - amount),
            grossSalary: e.salary.grossEarnings,
        };
    }),
    route('POST', `${BASE}/salary-component/employee/:employeeId/revise-salary`, ({ params, body }): ReviseSalaryResult => {
        const e = employeeFrom({ params } as MockContext, 'employeeId');
        const annual = Number(body?.newAnnualCTC) || e.salary.annualCtc;
        const monthly = Math.round(annual / 12);
        const basicSalary = Math.round(monthly * 0.5);
        const grossSalary = monthly - Math.min(Math.round(basicSalary * 0.12), 1800);
        return {
            basicSalary,
            grossSalary,
            specialAllowance: Math.max(0, grossSalary - basicSalary - Math.round(basicSalary * 0.4) - 1600 - 1250),
            version: {
                annualCTC: annual,
                previousAnnualCTC: body?.isInitialHire ? null : e.salary.annualCtc,
                effectiveFrom: `${body?.effectiveYear ?? today().getFullYear()}-${String(body?.effectiveMonth ?? today().getMonth() + 1).padStart(2, '0')}-01`,
            },
            arrears: null,
            esiNote: null,
        };
    }),
    route('POST', `${BASE}/salary-component/employee/:employeeId/undo-revision`, ({ params }) => {
        const e = employeeFrom({ params } as MockContext, 'employeeId');
        return { undone: true, restoredBasicSalary: e.salary.basic, restoredSpecialAllowance: e.salary.specialAllowance, reconstructed: false };
    }),
    route('POST', `${BASE}/salary-component`, ({ body }) => ({
        corporateUser: CORPORATE_USER,
        employee: null,
        componentName: body?.componentName ?? '',
        category: 'ALLOWANCE',
        calculationType: body?.calculationType ?? 'FIXED',
        amount: Number(body?.amount ?? body?.percentage) || 0,
        calculationBasis: body?.calculationBasis ?? 'COMPONENT',
        status: body?.status ?? 'ACTIVE',
        isGlobal: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        id: `sc-${Date.now()}`,
    })),
    route('PUT', `${BASE}/salary-component/:id`, ({ params, body }) => ({ ...(body ?? {}), id: params.id })),
    route('DELETE', `${BASE}/salary-component/:id`, () => ({})),

    // Deduction components (HR settings + per employee).
    route('GET', `${BASE}/deduction-component`, ({ mode, query }): DeductionComponentListResponse => {
        if (mode === 'empty') return { totalCount: 0, componentData: [] };
        const includePf = String(query.includePf) === 'true';
        const q = String(query.searchText ?? '').toLowerCase();
        const list = [...(includePf ? [PF_COMPONENT] : []), PT_COMPONENT].filter(
            c => !q || c.deductionName.toLowerCase().includes(q)
        );
        return { totalCount: list.length, componentData: paginate(list, query.page, query.limit) };
    }),
    route('GET', `${BASE}/deduction-component/allDeductions/:eId`, ({ mode, params }) => {
        const e = employeeFrom({ params } as MockContext, 'eId');
        const list = mode === 'empty' ? [] : [{ ...PF_COMPONENT, employee: String(e.id) }, { ...PT_COMPONENT, employee: String(e.id) }];
        return raw({
            status: true,
            responseCode: '000',
            message: 'OK',
            data: list,
            totalCount: list.length,
            totalDeductions: mode === 'empty' ? 0 : e.salary.employeePf + e.salary.professionalTax,
        });
    }),
    route('POST', `${BASE}/deduction-component`, ({ body }) => ({
        ...(body ?? {}),
        corporateUser: CORPORATE_USER,
        employee: null,
        applicabilityCriteria: null,
        isGlobal: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        id: `dc-${Date.now()}`,
    })),
    route('POST', `${BASE}/deduction-component/:eId`, ({ params, body }) => ({
        ...(body ?? {}),
        corporateUser: CORPORATE_USER,
        employee: params.eId,
        applicabilityCriteria: null,
        isGlobal: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        id: `dc-emp-${Date.now()}`,
    })),
    route('PUT', `${BASE}/deduction-component/:id`, ({ params, body }) => ({ ...(body ?? {}), id: params.id })),
    route('DELETE', `${BASE}/deduction-component/:id`, () => ({})),

    // CTC calculator (View CTC on the employee profile).
    route('GET', `${BASE}/ctc-calculator/employee/:employeeId`, employeeCtc),

    // Reports.
    route('GET', `${BASE}/reports/tdsReportsList`, tdsList),
    route('GET', `${BASE}/reports/tdsReportsList/excel`, async ({ query }) => {
        const lines = linesFor(query.year, query.month);
        return {
            buffer: {
                type: 'Buffer',
                data: await buildXlsx(
                    'TDS',
                    ['Emp ID', 'Name', 'Regime', 'Taxable Income (INR)', 'Standard Deduction (INR)', 'Monthly TDS (INR)'],
                    lines.map(l => [l.employee.employeeId, l.employee.fullName, 'New', annualTaxOf(l.employee.salary.grossEarnings).taxable, 75000, l.breakup.tds])
                ),
            },
            fileType: XLSX_MIME,
        };
    }),
    route('GET', `${BASE}/reports/tdsReortsDetails`, tdsByEmployee),
    route('GET', `${BASE}/reports/form16/download`, form16Download),
    route('GET', `${BASE}/reports/form16a`, form16A),
    route('GET', `${BASE}/reports/form16b`, form16B),
    route('POST', `${BASE}/reports/form16a`, ({ body }) => ({ ...(body ?? {}), id: `f16a-${Date.now()}` })),
    route('POST', `${BASE}/reports/form16b`, ({ body }) => ({ ...(body ?? {}), id: `f16b-${Date.now()}` })),
    route('GET', `${BASE}/reports/form24q-template`, async () => ({
        buffer: toBase64(
            await buildXlsx(
                'Form 24Q',
                ['Employee PAN', 'Employee Name', 'Section', 'Amount Paid (INR)', 'TDS Deducted (INR)', 'Date of Payment'],
                []
            )
        ),
    })),
    route('GET', `${BASE}/reports/form24q/all`, form24qList),
    route('POST', `${BASE}/reports/form24q`, () => ({ uploaded: true, file: SAMPLE_PDF_URL })),
    route('GET', `${BASE}/reports/incomeDeclaration-form`, incomeDeclaration),
    route('POST', `${BASE}/reports/incomeDeclaration-form`, ({ body }) => ({
        ...(body ?? {}),
        id: `idf-${Date.now()}`,
        corporateUser: CORPORATE_USER,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    })),

    // Payroll account (virtual account) + company bank accounts.
    route('GET', `${BASE}/account/status`, (): PayrollAccountStatus => ({ type: 'virtual', record: virtualAccount })),
    route('GET', `${BASE}/account/bank/status`, () => companyBankRecord),
    route('POST', `${BASE}/account/bank/verify`, ({ body }) => ({
        ...companyBankRecord,
        accountHolderName: body?.accountHolderName ?? companyBankRecord.accountHolderName,
        accountNumber: body?.accountNumber ?? companyBankRecord.accountNumber,
        ifscCode: body?.ifscCode ?? companyBankRecord.ifscCode,
        nameAtBank: String(body?.accountHolderName ?? COMPANY.name).toUpperCase(),
        verifiedAt: new Date().toISOString(),
    })),
    route('GET', `${BASE}/account/transactions`, bankTransactions),
    route('GET', `${BASE}/account/virtual/status`, () => virtualAccount),
    route('POST', `${BASE}/account/virtual/onboard`, () => virtualAccount),
    route('GET', `${BASE}/account/virtual/balance`, ({ mode }) => byMode(mode, virtualBalance)),
    route('GET', `${BASE}/account/virtual/remove-funds`, ({ mode }) => byMode(mode, removeFundsList)),
    route('POST', `${BASE}/account/virtual/remove-funds`, ({ body }): RemoveFundsResponse => ({
        ...removeFundsRow,
        referenceId: `WDR-ACME-${Date.now()}`,
        amount: Number(body?.amount) || 0,
        transferType: body?.transferType ?? 'NEFT',
        status: 'INITIATED',
        availableBalance: VA_BALANCE - (Number(body?.amount) || 0),
        createdAt: new Date().toISOString(),
    })),
    route('GET', `${BASE}/account/virtual/remove-funds/:referenceId/status`, ({ params }): RemoveFundsResponse => ({
        ...removeFundsRow,
        referenceId: params.referenceId ?? removeFundsRow.referenceId,
    })),
    route('GET', `${BASE}/salary-rollout-banks`, ({ mode }) => byMode(mode, rolloutBanks)),
    route('POST', `${BASE}/salary-rollout-banks`, ({ body }) => ({
        ...rolloutBanks.dummy[1],
        ...(body ?? {}),
        _id: `srb-${Date.now()}`,
        isPrimary: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    })),
    route('PATCH', `${BASE}/salary-rollout-banks/:id/set-primary`, ({ params }) => ({
        ...(rolloutBanks.dummy.find(b => b._id === params.id) ?? rolloutBanks.dummy[0]),
        isPrimary: true,
    })),
    route('PUT', `${BASE}/salary-rollout-banks/:id`, ({ params, body }) => ({
        ...(rolloutBanks.dummy.find(b => b._id === params.id) ?? rolloutBanks.dummy[0]),
        ...(body ?? {}),
        updatedAt: new Date().toISOString(),
    })),
    route('DELETE', `${BASE}/salary-rollout-banks/:id`, () => ({})),
];
