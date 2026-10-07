// PROTOTYPE-SETUP: Step 3 area A — employees, departments, profiles, documents, assets, bank accounts,
// profile/document requests, the Payroll HR dashboard and the ESS employee profile. Every person comes from
// data/employees.ts (MASTER); record shapes are built in data/employees-records.ts.
import type { OnboardingRecord } from '@domains/dashboard/paymentLinks/types/paymentLinkTypes';
import type { DocumentRequestsListResponse } from '@domains/dashboard/Payroll/api/documentRequestApi';
import type { AttendanceMetrics } from '@domains/dashboard/Payroll/api/employeeApi';
import type {
    ProfileUpdateRequestItem,
    ProfileUpdateRequestsListResponse,
} from '@domains/dashboard/Payroll/api/profileUpdateRequestApi';
import type { SalarySummaryData } from '@domains/dashboard/Payroll/api/salarySummary';
import type {
    calendarActivitiesResponse,
    chartResponse,
    dashboardResponse,
    employeeResponse as DashboardEmployeeResponse,
    upcomingActivitiesResponse,
} from '@domains/dashboard/Payroll/types/dashboardTypes';
import type { departmentListing } from '@domains/dashboard/Payroll/types/departmentTypes/departmentTypes';
import type {
    AssetTypesResponse,
    DocumentsListingResponse,
    assetsListingResponse,
    employeeResponse as DocsEmployeeResponse,
} from '@domains/dashboard/Payroll/types/docAndAssetsTypes';
import type {
    EmployeeListResponse,
    EmployeesResponse,
    exportEmployeeDataResponse,
} from '@domains/dashboard/Payroll/types/types';
import type {
    EmployeeProfile as EssEmployeeProfile,
    RequiredOnboardingDocument,
} from '@domains/employee/api/onboarding';
import type { DocumentRequest } from '@domains/employee/types';

import { COMPANY } from '../data/company';
import { daysFromToday, isoDateTime, monthsAgo, toIsoDate, today } from '../data/dates';
import {
    DEPARTMENTS,
    EMPLOYEES,
    ESS_EMPLOYEE,
    ESS_MANAGER,
    MockEmployee,
    PAYROLL_TOTALS,
    findEmployee,
    managerOf,
} from '../data/employees';
import {
    ALL_ASSETS,
    DEPARTMENT_DESCRIPTIONS,
    MockActivity,
    SAMPLE_PDF_URL,
    TIME_SCHEDULE,
    activitiesForYear,
    assetsOf,
    departmentHeadOf,
    documentsOf,
    listRowOf,
    profileOf,
    recordId,
    upcomingActivityList,
} from '../data/employees-records';
import { ModeData, byMode, raw } from '../envelope';
import { essRequester } from '../requester';
import { MockContext, MockRoute, route } from '../router';

// ---- helpers ----------------------------------------------------------------------------------------------

const P = ':type/:uid/payroll';

const toInt = (value: unknown, fallback: number) => {
    const n = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

const paginate = <T>(items: T[], query: MockContext['query'], defaultLimit = 10) => {
    const page = toInt(query.page, 1);
    const limit = toInt(query.limit ?? query.pageSize ?? query.itemsPerPage, defaultLimit);
    return items.slice((page - 1) * limit, page * limit);
};

const searchOf = (query: MockContext['query']) =>
    String(query.searchText ?? query.search ?? query.searchKey ?? '')
        .trim()
        .toLowerCase();

const matchesEmployee = (e: MockEmployee, text: string) =>
    !text ||
    [e.fullName, e.employeeId, e.email, e.designation, e.department].some(v =>
        v.toLowerCase().includes(text)
    );

/** Employee from a URL param; falls back to the ESS persona so an unknown id never blanks a page. */
const employeeFrom = (idOrCode: string | undefined) => findEmployee(idOrCode) ?? ESS_EMPLOYEE;

const nowIso = () => new Date().toISOString();

const endOfMonth = (year: number, monthIndex: number) => toIsoDate(new Date(year, monthIndex + 1, 0));

/** Net payroll for a month: everyone who had joined by the month's end. */
const netPayForMonth = (year: number, monthIndex: number) => {
    const end = endOfMonth(year, monthIndex);
    return EMPLOYEES.filter(e => e.dateOfJoin <= end).reduce((sum, e) => sum + e.salary.netPay, 0);
};

const lastMonth = () => {
    const now = today();
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { year: d.getFullYear(), monthIndex: d.getMonth() };
};

// ---- dashboard --------------------------------------------------------------------------------------------

const sum = (pick: (e: MockEmployee) => number) => EMPLOYEES.reduce((acc, e) => acc + pick(e), 0);

const dashboard: ModeData<dashboardResponse> = {
    dummy: {
        totalSalary: netPayForMonth(lastMonth().year, lastMonth().monthIndex),
        lastMonthSalary: netPayForMonth(lastMonth().year, lastMonth().monthIndex),
        activeEmployees: EMPLOYEES.length,
        nextMonthSalary: PAYROLL_TOTALS.netPay,
        upcomingActivities: upcomingActivityList()
            .slice(0, 10)
            .map(a => ({
                title: a.title,
                body: a.body,
                start: isoDateTime(a.date, '00:00:00'),
                type: a.activityType,
            })),
        deductionSummary: [
            {
                epf: sum(e => e.salary.employeePf + e.salary.employerPf),
                // Every gross salary is above the ₹21,000 ESI ceiling.
                esi: 0,
                tds: sum(e => e.salary.tds),
                lwf: 0,
                totalDeduction: sum(e => e.salary.employeePf + e.salary.employerPf + e.salary.tds),
            },
        ],
    },
    empty: {
        totalSalary: 0,
        lastMonthSalary: 0,
        activeEmployees: 0,
        nextMonthSalary: 0,
        upcomingActivities: [],
        deductionSummary: [{ epf: 0, esi: 0, tds: 0, lwf: 0, totalDeduction: 0 }],
    },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Processed salary per month — months up to last month are paid, the current/future ones are 0. */
const chartFor = (year: number): chartResponse => {
    const now = today();
    return {
        chartData: MONTHS.map((month, monthIndex) => {
            const processed =
                year < now.getFullYear() ||
                (year === now.getFullYear() && monthIndex < now.getMonth());
            return {
                id: monthIndex + 1,
                month,
                totalSalary: processed ? netPayForMonth(year, monthIndex) : 0,
            };
        }),
    };
};

const toUpcoming = (a: MockActivity) => ({
    title: a.title,
    start: isoDateTime(a.date, '00:00:00'),
    end: isoDateTime(a.date, '23:59:59'),
    id: a.id,
    sendPriorEmail: false,
    isEmailSent: a.activityType === 'HOLIDAY' && a.date < toIsoDate(today()),
    activityType: a.activityType,
});

const calendar = (): calendarActivitiesResponse => {
    const year = today().getFullYear();
    return {
        calendarActivities: [year - 1, year, year + 1].flatMap(activitiesForYear).map(a => ({
            title: a.title,
            isAllDay: true,
            start: isoDateTime(a.date, '00:00:00'),
            end: isoDateTime(a.date, '23:59:59'),
            category: 'allday',
            id: a.id,
            activityType: a.activityType,
        })),
    };
};

const salarySummary: ModeData<SalarySummaryData> = {
    dummy: {
        currentMonthDue: PAYROLL_TOTALS.netPay,
        lastMonthRolledOut: netPayForMonth(lastMonth().year, lastMonth().monthIndex),
    },
    empty: { currentMonthDue: 0, lastMonthRolledOut: 0 },
};

// Payment-links (salary rollout account) onboarding — finished and active.
const paymentOnboarding: OnboardingRecord = {
    id: 501,
    credentialId: 1,
    status: 'active',
    vendor: 'nupay',
    entityType: 'PRIVATE_LIMITED',
    remarks: null,
    providerResponse: null,
    businessName: COMPANY.name,
    bankName: COMPANY.bank.bankName,
    accountNumber: COMPANY.bank.accountNumber,
    ifsc: COMPANY.bank.ifsc,
    pan: COMPANY.pan,
    panVerifiedAt: isoDateTime(monthsAgo(5, 3)),
    accountHolderName: COMPANY.name,
    bankVerifiedAt: isoDateTime(monthsAgo(5, 3)),
    bankVerificationResponse: null,
    virtualAccountId: 'va_acme_001',
    virtualAccountNumber: '2223330012345678',
    virtualIfsc: 'YESB0CMSNOC',
    virtualAccountIdV3: null,
    virtualAccountNumberV3: null,
    virtualIfscV3: null,
    settlementAccountUrn: null,
    settlementSetupAt: isoDateTime(monthsAgo(5, 4)),
    consentAcceptedAt: isoDateTime(monthsAgo(5, 4)),
    activatedAt: isoDateTime(monthsAgo(5, 5)),
    createdAt: isoDateTime(monthsAgo(5, 3)),
    updatedAt: isoDateTime(monthsAgo(5, 5)),
    phone: COMPANY.phone,
    email: `hr@${COMPANY.emailDomain}`,
    savedBankPhone: COMPANY.phone,
    profileCompanyName: COMPANY.name,
    profilePan: COMPANY.pan,
    profilePanVerified: true,
    profileBankName: COMPANY.bank.bankName,
    profileAccountNumber: COMPANY.bank.accountNumber,
    profileIfsc: COMPANY.bank.ifsc,
};

// ---- employee listings ------------------------------------------------------------------------------------

const sortValue = (e: MockEmployee, field: string) => {
    switch (field) {
        case 'employeeId':
            return e.employeeId;
        case 'dateOfJoin':
            return e.dateOfJoin;
        case 'employeeStatus':
            return e.probationEnded ? 'ACTIVE' : 'INPROBATION';
        default:
            return e.fullName.toLowerCase();
    }
};

/** Status 'active' = everyone on payroll (incl. notice + new joiner); 'past' = ex-employees (none). */
const employeeList = ({ mode, query }: MockContext): EmployeeListResponse => {
    if (mode === 'empty' || query.status === 'past') return { count: 0, rows: [] };
    const text = searchOf(query);
    // The table sends antd's dataIndex path ("personalInformation,fullName"); keep the last key.
    const field = String(query.sortField ?? 'fullName').split(/[.,]/).pop() ?? 'fullName';
    const direction = String(query.sortOrder ?? 'asc').toLowerCase().startsWith('desc') ? -1 : 1;
    const matched = EMPLOYEES.filter(e => matchesEmployee(e, text)).sort(
        (a, b) => sortValue(a, field).localeCompare(sortValue(b, field)) * direction
    );
    return { count: matched.length, rows: paginate(matched, query).map(listRowOf) };
};

type CurrentEmployee = DashboardEmployeeResponse['employees'][number] &
    DocsEmployeeResponse['employees'][number];

/** One record that satisfies both callers of current-employees (dashboard pickers and docs/assets). */
const currentEmployeeOf = (e: MockEmployee): CurrentEmployee => {
    const profile = profileOf(e);
    const offBoarding = profile.offBoardingInformation;
    return {
        id: recordId(e),
        value: recordId(e),
        label: e.fullName,
        fullName: e.fullName,
        dateOfBirth: e.dateOfBirth,
        gender: e.gender.toUpperCase(),
        mobileNo: e.mobileNo,
        personalEmail: e.personalEmail,
        nationality: 'India',
        personalInformation: {
            fullName: e.fullName,
            dateOfBirth: e.dateOfBirth,
            gender: e.gender.toUpperCase(),
            mobileNo: e.mobileNo,
            email: e.personalEmail,
            country: 'India',
            state: profile.personalInformation.state,
            emergencyContactNo: e.emergencyContact.mobileNo,
            emergencyContactName: e.emergencyContact.name,
            emergencyContactRelation: e.emergencyContact.relation,
        },
        employeeInformation: {
            dateOfJoin: e.dateOfJoin,
            employeeId: e.employeeId,
            department: e.department,
            designation: e.designation,
            reportingStaff: managerOf(e) ? recordId(managerOf(e)!) : null,
            workingDays: COMPANY.workWeek.workingDays,
            timeSchedule: TIME_SCHEDULE,
            workingHours: COMPANY.workWeek.workingHours,
            contractType: 'FULL_TIME',
            status: profile.employeeInformation.employeeStatus,
            employeeStatus: profile.employeeInformation.employeeStatus,
            probationPeriod: String(profile.employeeInformation.probationPeriod),
            employeeGrade: e.seniority,
            workLocation: e.location,
            schedule: TIME_SCHEDULE,
        },
        employeeDocuments: documentsOf(e).map(d => ({
            name: d.name,
            url: d.url,
            expiryDate: d.expiryDate,
            holderName: d.holderName,
            _id: d._id,
        })),
        workSchedule: {
            startTime: COMPANY.workWeek.startTime,
            endTime: COMPANY.workWeek.endTime,
            breakTimeHrs: COMPANY.workWeek.breakTimeHrs,
            days: COMPANY.workWeek.days,
            workHrs: COMPANY.workWeek.workingHours,
        },
        // Empty strings (falsy) for everyone not serving notice — the dashboard filters on lastWorkingDay.
        offBoardingInformation: {
            lastWorkingDay: offBoarding?.lastWorkingDay ?? '',
            offBoardingType: offBoarding?.offBoardingType ?? '',
        },
    };
};

const currentEmployees = ({ mode, query }: MockContext) => {
    if (mode === 'empty') return { employees: [] as CurrentEmployee[] };
    const text = searchOf(query);
    return { employees: EMPLOYEES.filter(e => matchesEmployee(e, text)).map(currentEmployeeOf) };
};

const allEmployees = ({ mode, query }: MockContext): EmployeesResponse => {
    if (mode === 'empty') return { employees: [] };
    const text = searchOf(query);
    return {
        employees: EMPLOYEES.filter(e => matchesEmployee(e, text)).map(e => ({
            fullName: e.fullName,
            _id: recordId(e),
        })),
    };
};

// ---- new hires (offer letters) ----------------------------------------------------------------------------

const NEW_HIRES = EMPLOYEES.filter(e => e.status === 'new-joiner');

const newHireOf = (e: MockEmployee) => {
    const offerSent = monthsAgo(1, 12);
    const signed = monthsAgo(1, 14);
    return {
        ...profileOf(e),
        offerLetter: {
            status: 'SIGNED',
            eSignId: `esign-offer-${e.id}`,
            documentUrl: SAMPLE_PDF_URL,
            sentAt: isoDateTime(offerSent),
            signedAt: isoDateTime(signed),
        },
        signingTimeline: [
            { step: 'Offer letter created', completed: true, date: isoDateTime(offerSent, '10:00:00') },
            { step: 'Sent for e-signature', completed: true, date: isoDateTime(offerSent, '10:05:00') },
            { step: 'Signed by candidate', completed: true, date: isoDateTime(signed, '18:42:00') },
            { step: 'Joined', completed: true, date: isoDateTime(e.dateOfJoin) },
        ],
    };
};

// ---- excel export / template ------------------------------------------------------------------------------

const xlsxBuffer = async (
    columns: string[],
    rows: (string | number)[][],
    sheetName: string
): Promise<exportEmployeeDataResponse> => {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName);
    sheet.addRow(columns).font = { bold: true };
    rows.forEach(r => sheet.addRow(r));
    sheet.columns.forEach(c => {
        c.width = 22;
    });
    const buffer = await workbook.xlsx.writeBuffer();
    return {
        buffer: { type: 'Buffer', data: Array.from(new Uint8Array(buffer as ArrayBuffer)) },
        fileType: 'xlsx',
    };
};

const exportEmployees = ({ mode, query }: MockContext) => {
    const past = String(query.employeeStatus ?? '').toLowerCase() === 'past';
    const list = mode === 'empty' || past ? [] : EMPLOYEES;
    return xlsxBuffer(
        [
            'Employee ID',
            'Full Name',
            'Work Email',
            'Mobile',
            'Department',
            'Designation',
            'Reporting Manager',
            'Date of Join',
            'Location',
            'Annual CTC (INR)',
        ],
        list.map(e => [
            e.employeeId,
            e.fullName,
            e.email,
            e.mobileNo,
            e.department,
            e.designation,
            managerOf(e)?.fullName ?? '-',
            e.dateOfJoin,
            e.location,
            e.salary.annualCtc,
        ]),
        'Employees'
    );
};

const bulkTemplate = () =>
    xlsxBuffer(
        [
            'fullName',
            'dateOfBirth',
            'gender',
            'mobileNo',
            'email',
            'country',
            'state',
            'addressLine1',
            'pinCode',
            'employeeId',
            'department',
            'designation',
            'dateOfJoin',
            'workEmailId',
            'contractType',
            'pan',
            'uan',
            'annualCTC',
            'bankName',
            'accountNumber',
            'ifscCode',
        ],
        [],
        'Employees'
    );

// ---- statutory + attendance metrics -----------------------------------------------------------------------

const statutoryOf = (e: MockEmployee) => ({
    enableEPF: true,
    epfUAN: e.uan,
    enableESI: true,
    esiNumber: null,
    professionalTax: true,
    laborWelfareFund: false,
    tds: true,
    panNumber: e.pan,
    taxRegime: 'New Tax Regime',
    standardDeduction: 75000,
    lwf: {
        workState: null,
        scheduleOverride: null,
        employeeShareType: null,
        employeeShareValue: null,
        employerShareType: null,
        employerShareValue: null,
    },
});

const weekdaysBetween = (fromIso: string, toIso: string) => {
    const from = new Date(`${fromIso}T00:00:00`);
    const to = new Date(`${toIso}T00:00:00`);
    const days = Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
    return Array.from({ length: days }, (_, i) => new Date(from.getTime() + i * 86400000)).filter(
        d => d.getDay() !== 0 && d.getDay() !== 6
    ).length;
};

const attendanceMetrics = ({ mode, params, query }: MockContext): AttendanceMetrics => {
    const now = today();
    const [y, m] = String(query.month ?? `${now.getFullYear()}-${now.getMonth() + 1}`)
        .split('-')
        .map(Number);
    const monthStart = toIsoDate(new Date(y, m - 1, 1));
    const monthEnd = endOfMonth(y, m - 1);
    const e = employeeFrom(params.employeeId);
    const from = e.dateOfJoin > monthStart ? e.dateOfJoin : monthStart;
    const yesterday = daysFromToday(-1);
    const to = monthEnd < yesterday ? monthEnd : yesterday;
    if (mode === 'empty' || from > to) {
        return { present: 0, late: 0, absent: 0, onLeave: 0, otHours: 0, month: { from: monthStart, to: monthEnd } };
    }
    const working = weekdaysBetween(from, to);
    const onLeave = Math.min(working, e.id % 3);
    const absent = working > 10 && e.id % 7 === 0 ? 1 : 0;
    return {
        present: Math.max(0, working - onLeave - absent),
        late: Math.min(working, e.id % 4),
        absent,
        onLeave,
        otHours: e.department === 'Engineering' || e.department === 'Operations' ? (e.id % 5) * 1.5 : 0,
        month: { from: monthStart, to: monthEnd },
    };
};

// ---- departments ------------------------------------------------------------------------------------------

const departmentRecord = (d: (typeof DEPARTMENTS)[number]) => {
    const head = departmentHeadOf(d.name);
    const members = EMPLOYEES.filter(e => e.departmentId === d.id);
    const createdAt = new Date(isoDateTime(monthsAgo(47, 1)));
    return {
        corporateUser: COMPANY.corporateUserId,
        departmentName: d.name,
        departmentCode: d.code,
        description: `${DEPARTMENT_DESCRIPTIONS[d.name]} Head: ${head?.fullName ?? '-'} · ${members.length} employees.`,
        createdAt,
        updatedAt: createdAt,
        id: String(d.id),
    };
};

const departmentList = ({ mode, query }: MockContext): departmentListing => {
    if (mode === 'empty') return { totalCount: 0, departmentData: [] };
    const text = searchOf(query);
    const matched = DEPARTMENTS.filter(
        d => !text || d.name.toLowerCase().includes(text) || d.code.toLowerCase().includes(text)
    ).map(departmentRecord);
    // listAllDepartmentAPI sends empty page/limit → the whole list.
    const all = !query.page || !query.limit;
    return { totalCount: matched.length, departmentData: all ? matched : paginate(matched, query) };
};

// ---- documents & assets -----------------------------------------------------------------------------------

const allDocuments = ({ mode, query }: MockContext): DocumentsListingResponse => {
    if (mode === 'empty') return { documents: [], total: 0 };
    const text = searchOf(query);
    const employeeFilter = String(query.fullName ?? '').toLowerCase();
    const docs = EMPLOYEES.filter(
        e =>
            !employeeFilter ||
            e.fullName.toLowerCase() === employeeFilter ||
            recordId(e) === employeeFilter
    ).flatMap(e =>
        documentsOf(e).map(d => ({
            name: d.name,
            url: d.url,
            expiryDate: d.expiryDate,
            holderName: d.holderName,
            _id: d._id,
            createdAt: d.createdAt,
            fullName: e.fullName,
            employeeId: recordId(e),
        }))
    );
    const matched = docs.filter(
        d => !text || d.name.toLowerCase().includes(text) || d.fullName.toLowerCase().includes(text)
    );
    return { documents: paginate(matched, query), total: matched.length };
};

const employeeDocuments = ({ mode, params, query }: MockContext) => {
    if (mode === 'empty') return { documents: [], total: 0 };
    const text = searchOf(query);
    const docs = documentsOf(employeeFrom(params.employeeId)).filter(
        d => !text || d.name.toLowerCase().includes(text)
    );
    return { documents: paginate(docs, query), total: docs.length };
};

const assetFilter = (query: MockContext['query']) => {
    const text = searchOf(query);
    const type = String(query.assetType ?? '').toLowerCase();
    const status = String(query.status ?? '').toLowerCase();
    return (a: (typeof ALL_ASSETS)[number]) =>
        (!text ||
            [a.assetName, a.assetId, a.user].some(v => v.toLowerCase().includes(text))) &&
        (!type || a.assetType.toLowerCase() === type) &&
        (!status || a.status.toLowerCase() === status);
};

const assetListing = ({ mode, query }: MockContext): assetsListingResponse => {
    if (mode === 'empty') return { totalCount: 0, assetData: [] };
    const matched = ALL_ASSETS.filter(assetFilter(query));
    return {
        totalCount: matched.length,
        assetData: paginate(matched, query).map(a => ({
            corporateUser: String(COMPANY.corporateUserId),
            assetName: a.assetName,
            assetId: a.assetId,
            purchasedDate: a.purchasedDate,
            assetType: a.assetType,
            status: a.status,
            employee: { fullName: a.user, id: a.employeeId },
            batchNo: a.batchNo,
            createdAt: a.createdAt,
            updatedAt: a.createdAt,
            id: a.id,
        })),
    };
};

const employeeAssets = ({ mode, params, query }: MockContext) => {
    if (mode === 'empty') return { assets: [], total: 0 };
    const matched = assetsOf(employeeFrom(params.employeeId)).filter(assetFilter(query));
    return { assets: paginate(matched, query), total: matched.length };
};

const assetTypes: AssetTypesResponse = {
    assetTypes: ['Laptop', 'Mobile Phone', 'ID Card', 'Monitor', 'Headset'].map(t => ({
        label: t,
        value: t,
    })),
};

const TEMPLATE_DOCS = [
    'Offer Letter',
    'Appointment Letter',
    'Increment Letter',
    'Experience Letter',
    'Relieving Letter',
    'Salary Certificate',
    'Leave Policy',
    'Code of Conduct',
];

const companyDocs = ({ mode, query }: MockContext) => {
    if (mode === 'empty') return { documents: [], totalCount: 0 };
    const category = String(query.categoryName ?? '').trim();
    const text = searchOf(query);
    const docs = TEMPLATE_DOCS.map(name => ({
        documentName: category ? `${name} — ${category}` : name,
        documentUrl: SAMPLE_PDF_URL,
    })).filter(d => !text || d.documentName.toLowerCase().includes(text));
    return { documents: paginate(docs, query), totalCount: docs.length };
};

// ---- bank accounts ----------------------------------------------------------------------------------------

const bankAccounts = ({ mode, params }: MockContext) => {
    if (mode === 'empty') return [];
    const e = employeeFrom(params.eId);
    return [
        {
            _id: `bank-${e.id}`,
            accountName: e.fullName,
            accountNumber: e.bank.accountNumber,
            bankName: e.bank.bankName,
            ifscCode: e.bank.ifsc,
            isDefaultAccount: true,
        },
    ];
};

// ---- profile update + document requests (HR side) --------------------------------------------------------

const KARTHIK = findEmployee('ACME-005')!;
const ANANYA = findEmployee('ACME-006')!;
const DIVYA = findEmployee('ACME-013')!;

const requestEmployee = (e: MockEmployee) => ({
    id: recordId(e),
    fullName: e.fullName,
    employeeId: e.employeeId,
    designation: e.designation,
});

const PROFILE_UPDATE_REQUESTS: ProfileUpdateRequestItem[] = [
    {
        id: 'pur-3001',
        type: 'profileDetails',
        typeLabel: 'Profile Details',
        status: 'requestedByEmployee',
        currentData: {
            mobileNumber: KARTHIK.mobileNo,
            addressLine1: COMPANY.offices[KARTHIK.location].line1,
            pinCode: COMPANY.offices[KARTHIK.location].pincode,
        },
        requestedData: {
            mobileNumber: KARTHIK.mobileNo,
            addressLine1: 'Flat 304, Sobha Dream Acres, Panathur Road',
            pinCode: '560087',
        },
        employee: requestEmployee(KARTHIK),
        createdAt: isoDateTime(daysFromToday(-2), '11:20:00'),
        updatedAt: isoDateTime(daysFromToday(-2), '11:20:00'),
    },
    {
        id: 'pur-3002',
        type: 'bankDetails',
        typeLabel: 'Bank Details',
        status: 'requestedByEmployee',
        currentData: {
            bankName: ANANYA.bank.bankName,
            ifscCode: ANANYA.bank.ifsc,
            accountNumber: ANANYA.bank.accountNumber,
        },
        requestedData: {
            bankName: 'HDFC Bank',
            ifscCode: 'HDFC0000060',
            accountNumber: '50100482913374',
        },
        employee: requestEmployee(ANANYA),
        createdAt: isoDateTime(daysFromToday(-1), '16:05:00'),
        updatedAt: isoDateTime(daysFromToday(-1), '16:05:00'),
    },
    {
        id: 'pur-2987',
        type: 'profileDetails',
        typeLabel: 'Profile Details',
        status: 'approved',
        remarks: 'Verified with employee.',
        currentData: { emergencyContactName: 'Ravi Menon', emergencyContactPhone: '9741233210' },
        requestedData: {
            emergencyContactName: DIVYA.emergencyContact.name,
            emergencyContactPhone: DIVYA.emergencyContact.mobileNo,
        },
        employee: requestEmployee(DIVYA),
        createdAt: isoDateTime(daysFromToday(-18), '10:00:00'),
        updatedAt: isoDateTime(daysFromToday(-17), '12:30:00'),
    },
];

const profileUpdateRequests = ({ mode, query }: MockContext): ProfileUpdateRequestsListResponse => {
    const page = toInt(query.page, 1);
    const limit = toInt(query.limit, 10);
    if (mode === 'empty') return { records: [], total: 0, pendingCount: 0, page, limit };
    const text = searchOf(query);
    const matched = PROFILE_UPDATE_REQUESTS.filter(
        r =>
            (!text ||
                [r.employee?.fullName, r.employee?.employeeId].some(v =>
                    (v ?? '').toLowerCase().includes(text)
                )) &&
            (!query.status || r.status === query.status) &&
            (!query.type || r.type === query.type)
    );
    return {
        records: paginate(matched, query),
        total: matched.length,
        pendingCount: PROFILE_UPDATE_REQUESTS.filter(r => r.status === 'requestedByEmployee').length,
        page,
        limit,
    };
};

const resolveProfileRequest = (status: 'approved' | 'rejected') => ({ params, body }: MockContext) => {
    const request = PROFILE_UPDATE_REQUESTS.find(r => r.id === params.requestId) ?? PROFILE_UPDATE_REQUESTS[0];
    return { ...request, status, remarks: body?.remarks ?? request.remarks, updatedAt: nowIso() };
};

const RAHUL = findEmployee('ACME-003')!;
const ADITYA = findEmployee('ACME-009')!;

const DOCUMENT_REQUESTS: DocumentRequestsListResponse['records'] = [
    {
        id: 'dr-4101',
        documentType: 'Salary Certificate',
        purpose: 'Home loan application with SBI.',
        status: 'pending',
        employee: { id: recordId(ESS_EMPLOYEE), fullName: ESS_EMPLOYEE.fullName, employeeId: ESS_EMPLOYEE.employeeId },
        createdAt: isoDateTime(daysFromToday(-3), '09:45:00'),
        updatedAt: isoDateTime(daysFromToday(-3), '09:45:00'),
    },
    {
        // PROTOTYPE-SETUP: a pending request for the ESS - Manager persona (the ESS employee's manager).
        id: 'dr-4103',
        documentType: 'Experience Letter',
        purpose: 'Board-member nomination paperwork.',
        status: 'pending',
        employee: { id: recordId(ESS_MANAGER), fullName: ESS_MANAGER.fullName, employeeId: ESS_MANAGER.employeeId },
        createdAt: isoDateTime(daysFromToday(-2), '11:20:00'),
        updatedAt: isoDateTime(daysFromToday(-2), '11:20:00'),
    },
    {
        id: 'dr-4098',
        documentType: 'Address Proof Letter',
        purpose: 'Passport renewal.',
        status: 'in-progress',
        employee: { id: recordId(RAHUL), fullName: RAHUL.fullName, employeeId: RAHUL.employeeId },
        createdAt: isoDateTime(daysFromToday(-6), '14:10:00'),
        updatedAt: isoDateTime(daysFromToday(-5), '10:00:00'),
    },
    {
        id: 'dr-4072',
        documentType: 'Employment Verification Letter',
        purpose: 'Schengen visa application.',
        status: 'completed',
        remarks: 'Letter shared on email.',
        employee: { id: recordId(ADITYA), fullName: ADITYA.fullName, employeeId: ADITYA.employeeId },
        createdAt: isoDateTime(daysFromToday(-20), '12:00:00'),
        updatedAt: isoDateTime(daysFromToday(-19), '17:30:00'),
    },
];

const documentRequests = ({ mode, query }: MockContext): DocumentRequestsListResponse => {
    const page = toInt(query.page, 1);
    const limit = toInt(query.limit, 10);
    if (mode === 'empty') return { records: [], total: 0, pendingCount: 0, page, limit };
    const text = searchOf(query);
    const matched = DOCUMENT_REQUESTS.filter(
        r =>
            (!text ||
                [r.employee?.fullName, r.employee?.employeeId, r.documentType].some(v =>
                    (v ?? '').toLowerCase().includes(text)
                )) &&
            (!query.status || r.status === query.status)
    );
    return {
        records: paginate(matched, query),
        total: matched.length,
        pendingCount: DOCUMENT_REQUESTS.filter(r => r.status === 'pending').length,
        page,
        limit,
    };
};

// ---- ESS (employee self-service) — answered as the requesting persona (see ../requester.ts) --------------

const essProfile = (): { employee: EssEmployeeProfile } => {
    const me = essRequester();
    const p = profileOf(me);
    return {
        employee: {
            id: p.id,
            isCompleted: true,
            profileImage: '',
            personalInformation: p.personalInformation,
            employeeInformation: {
                employeeId: me.employeeId,
                designation: me.designation,
                department: {
                    id: String(me.departmentId),
                    departmentName: me.department,
                    departmentCode: DEPARTMENTS.find(d => d.id === me.departmentId)?.code,
                },
                reportingStaff: p.employeeInformation.reportingStaff,
                reportingStaffName: p.employeeInformation.reportingStaffName,
                dateOfJoin: me.dateOfJoin,
                employeeStatus: p.employeeInformation.employeeStatus,
                workEmailId: me.email,
                timeSchedule: TIME_SCHEDULE,
            },
            corporateUser: { companyName: COMPANY.name },
            bankDetails: {
                bankName: me.bank.bankName,
                accountNumber: me.bank.accountNumber,
                ifscCode: me.bank.ifsc,
                upiId: `${me.mobileNo}@hdfcbank`,
            },
            profileUpdateRequestPending: false,
            bankUpdateRequestPending: false,
            employeeDocuments: documentsOf(me),
        },
    };
};

const REQUIRED_DOCUMENTS: RequiredOnboardingDocument[] = [
    { key: 'panCard', label: 'PAN Card' },
    { key: 'aadhaarCard', label: 'Aadhaar Card' },
    { key: 'degreeCertificate', label: 'Highest Degree Certificate' },
    { key: 'cancelledCheque', label: 'Cancelled Cheque' },
];

const essActiveRequests = (): { requests: DocumentRequest[] } => ({
    requests: DOCUMENT_REQUESTS.filter(
        r => r.employee?.employeeId === essRequester().employeeId && r.status !== 'completed'
    ).map(r => ({ id: r.id, documentType: r.documentType, status: r.status })),
});

/** Minimal one-page PDF used when the public sample PDF cannot be fetched. */
const FALLBACK_PDF =
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
    '4 0 obj<</Length 58>>stream\nBT /F1 18 Tf 72 760 Td (Acme Technologies - sample document) Tj ET\nendstream endobj\n' +
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';

/** ESS download returns the file itself (responseType blob), so the whole body is a Blob. */
const essDownload = async () => {
    try {
        const res = await fetch(SAMPLE_PDF_URL);
        if (res.ok) return raw(await res.blob());
    } catch {
        // offline / CORS — fall through to the inline PDF
    }
    return raw(new Blob([FALLBACK_PDF], { type: 'application/pdf' }));
};

// ---- generic mutation echoes ------------------------------------------------------------------------------

const echo = ({ body, params }: MockContext) => ({
    ...(body && typeof body === 'object' && !(body instanceof FormData) ? body : {}),
    id: params.employeeId ?? params.id ?? params.departmentId ?? params.bankId ?? 'mock-1',
    updatedAt: nowIso(),
});

const NEW_EMPLOYEE_ID = String(1000 + EMPLOYEES.length + 1);

const created = ({ body }: MockContext) => ({
    ...(body && typeof body === 'object' && !(body instanceof FormData) ? body : {}),
    id: NEW_EMPLOYEE_ID,
    createdAt: nowIso(),
    updatedAt: nowIso(),
});

const updatedProfile = (ctx: MockContext) => ({
    ...profileOf(employeeFrom(ctx.params.employeeId ?? ctx.params.id)),
    updatedAt: nowIso(),
});

// ---- routes -----------------------------------------------------------------------------------------------

export const employeesRoutes: MockRoute[] = [
    // Dashboard
    route('GET', `${P}/dashBoard`, ({ mode }) => byMode(mode, dashboard)),
    route('GET', `${P}/dashBoard/chart`, ({ mode, query }) =>
        mode === 'empty'
            ? { chartData: [] }
            : chartFor(toInt(query.year, today().getFullYear()))
    ),
    route('GET', 'corporate/:corporateId/payroll/dashBoard/salary-summary', ({ mode }) =>
        byMode(mode, salarySummary)
    ),
    route('POST', `${P}/dashBoard/dashboardStatus`, ({ body }) => ({ ...body, isSkipDasboard: body?.isSkipDasboard ?? false })),
    route('GET', `${P}/calendarActivities/upcoming`, ({ mode, query }): upcomingActivitiesResponse => ({
        upcomingActivities:
            mode === 'empty' ? [] : upcomingActivityList().slice(0, toInt(query.limit, 7)).map(toUpcoming),
    })),
    route('GET', `${P}/calendarActivities`, ({ mode }) =>
        mode === 'empty' ? { calendarActivities: [] } : calendar()
    ),
    route('GET', ':type/:uid/payment/payment-links/onboarding/status', () => paymentOnboarding),

    // Employees — literal sub-paths first, generic :employeeId last.
    route('GET', `${P}/employee`, employeeList),
    route('GET', `${P}/employee/new-hire`, ({ mode, query }) => {
        if (mode === 'empty') return { rows: [], count: 0 };
        const text = searchOf(query);
        const rows = NEW_HIRES.filter(e => matchesEmployee(e, text)).map(newHireOf);
        return { rows: paginate(rows, query), count: rows.length };
    }),
    route('GET', `${P}/employee/new-hire/:employeeId`, ({ params }) =>
        newHireOf(employeeFrom(params.employeeId))
    ),
    route('GET', `${P}/employee/all-employees`, allEmployees),
    route('GET', `${P}/employee/current-employees`, currentEmployees),
    route('GET', `${P}/employee/excel`, exportEmployees),
    route('GET', `${P}/employee/bulk-excel-template`, bulkTemplate),
    route('GET', `${P}/employee/reporting-staff/:employeeId`, ({ params }) => {
        const e = employeeFrom(params.employeeId);
        return listRowOf(managerOf(e) ?? e);
    }),
    route('GET', `${P}/employee/statutory/:employeeId`, ({ params }) =>
        statutoryOf(employeeFrom(params.employeeId))
    ),
    route('GET', `${P}/employee/:employeeId/attendance/metrics`, attendanceMetrics),
    route('GET', `${P}/employee/:employeeId`, ({ params }) => profileOf(employeeFrom(params.employeeId))),

    route('POST', `${P}/employee/alldata`, created),
    route('POST', `${P}/employee/new-hire`, created),
    route('POST', `${P}/employee/validate`, () => ({ valid: true, errors: [] })),
    route('POST', `${P}/employee/bulk-excel-upload`, () => ({
        status: true,
        CountOfDocs: '0',
        responseCode: '000',
        message: 'File parsed',
        jsonData: [],
    })),
    route('POST', `${P}/employee/bulk-validate`, ({ body }) => ({ jsonData: body?.jsonData ?? [], errors: [] })),
    route('POST', `${P}/employee/bulk-create`, ({ body }) => ({ created: (body?.jsonData ?? []).length })),
    route('POST', `${P}/employee/off-boarding/:employeeId`, echo),
    route('POST', `${P}/employee/personal-info`, ctx => ({
        ...profileOf(employeeFrom(ctx.query.employeeId)),
        updatedAt: nowIso(),
    })),
    route('POST', `${P}/employee/statutory/:employeeId`, ({ params, body }) => ({
        ...statutoryOf(employeeFrom(params.employeeId)),
        ...(body?.otherConfigurationsSchema ?? {}),
    })),
    route('POST', `${P}/employee/:employeeId/pan`, ({ params, body }) => {
        const e = employeeFrom(params.employeeId);
        return { valid: true, pan: body?.pan ?? e.pan, registered_name: e.fullName.toUpperCase(), name_match: 'Y' };
    }),
    route('POST', `${P}/employee/:employeeId/aadhaar-otp`, () => ({
        ref_id: 'aadhaar-ref-58213',
        message: 'OTP sent to registered mobile number',
    })),
    route('POST', `${P}/employee/:employeeId/aadhaar-verify`, ({ params }) => ({
        status: 'VALID',
        name: employeeFrom(params.employeeId).fullName,
    })),

    route('PUT', `${P}/employee/alldata/:employeeId`, updatedProfile),
    route('PUT', `${P}/employee/exit-information/:employeeId`, updatedProfile),
    route('PUT', `${P}/employee/bank-info/:employeeId`, updatedProfile),
    route('PUT', `${P}/employee/document-info/:employeeId`, updatedProfile),
    route('PUT', `${P}/employee/employee-info/:employeeId`, updatedProfile),
    route('PUT', `${P}/employee/salary-info/:employeeId`, updatedProfile),
    route('PUT', `${P}/employee/new-hire/:id/offer-letter-esign-id`, ({ params, body }) => ({
        id: params.id,
        eSignId: body?.eSignId ?? '',
    })),
    route('PUT', `${P}/employee/:employeeId/confirm-joining`, updatedProfile),
    route('PUT', `${P}/employee/:employeeId/bankDetails`, updatedProfile),
    route('PUT', `${P}/employee/:employeeId/employeeInformation`, updatedProfile),
    route('PUT', `${P}/employee/:employeeId/salaryInformation`, updatedProfile),
    route('PUT', `${P}/employee/:employeeId/work-email`, updatedProfile),
    route('PUT', `${P}/employee/:employeeId`, updatedProfile),
    route('DELETE', `${P}/employee/:employeeId`, ({ params }) => ({
        message: 'Employee deleted',
        data: listRowOf(employeeFrom(params.employeeId)),
    })),

    // Departments
    route('GET', `${P}/department`, departmentList),
    route('POST', `${P}/department`, ({ body }) => ({
        ...body,
        corporateUser: COMPANY.corporateUserId,
        id: String(100 + DEPARTMENTS.length + 1),
        createdAt: nowIso(),
        updatedAt: nowIso(),
    })),
    route('PUT', `${P}/department/:departmentId`, echo),
    route('DELETE', `${P}/department/:departmentId`, ({ params }) => ({ id: params.departmentId })),

    // Documents (HR side + ESS upload share POST payroll/documents)
    route('GET', `${P}/documents`, allDocuments),
    route('POST', `${P}/documents`, ({ body }) => {
        const holder = findEmployee(body?.employee) ?? ESS_EMPLOYEE;
        return {
            _id: `doc-${holder.id}-new`,
            name: body?.name ?? 'Document',
            url: SAMPLE_PDF_URL,
            expiryDate: body?.expiryDate ?? '',
            holderName: body?.holderName ?? holder.fullName,
            employee: recordId(holder),
            createdAt: nowIso(),
        };
    }),
    route('GET', `${P}/documents/:documentId/download`, essDownload),
    route('GET', `${P}/documents/:employeeId`, employeeDocuments),
    route('PUT', `${P}/documents/:documentId/:employeeId`, ({ params, body }) => ({
        ...profileOf(employeeFrom(params.employeeId)),
        updatedDocument: { _id: params.documentId, name: body?.name, url: SAMPLE_PDF_URL },
    })),
    route('DELETE', `${P}/documents/:documentId/:employeeId`, ({ params }) => ({
        _id: params.documentId,
        employeeId: params.employeeId,
    })),

    // Assets
    route('GET', `${P}/assets`, assetListing),
    route('GET', `${P}/assets/asset-types`, ({ mode }) => (mode === 'empty' ? { assetTypes: [] } : assetTypes)),
    route('GET', `${P}/assets/:employeeId`, employeeAssets),
    route('POST', `${P}/assets`, ({ body }) => ({
        ...body,
        corporateUser: String(COMPANY.corporateUserId),
        id: 'asset-new',
        createdAt: nowIso(),
        updatedAt: nowIso(),
    })),
    route('PUT', `${P}/assets/:aId/:employeeId`, ({ params, body }) => ({ ...body, id: params.aId })),
    route('DELETE', `${P}/assets/:assetId`, ({ params }) => {
        const asset = ALL_ASSETS.find(a => a.id === params.assetId) ?? ALL_ASSETS[0];
        return {
            corporateUser: String(COMPANY.corporateUserId),
            assetName: asset.assetName,
            assetId: asset.assetId,
            purchasedDate: asset.purchasedDate,
            assetType: asset.assetType,
            status: asset.status,
            employee: asset.employeeId,
            batchNo: asset.batchNo,
            createdAt: asset.createdAt,
            updatedAt: nowIso(),
            id: asset.id,
        };
    }),

    // Company document templates (Payroll → Company documents → category)
    route('GET', ':type/:uid/officeAndBusiness/payrollDocs/documents', companyDocs),

    // Offer-letter e-sign
    route('POST', ':type/:uid/officeAndBusiness/e-sign/sign-request', () => ({
        id: `esign-${Date.now()}`,
    })),
    route('POST', ':type/:uid/officeAndBusiness/e-sign/resend-invitation', () => ({ resent: true })),

    // Employee bank accounts
    route('GET', `${P}/bank-details/:eId`, bankAccounts),
    route('POST', `${P}/bank-details/:employeeId`, ({ body, params }) => ({
        ...body,
        _id: `bank-${params.employeeId}-new`,
        createdAt: nowIso(),
    })),
    route('PUT', `${P}/bank-details/:bankId`, echo),
    route('DELETE', `${P}/bank-details/:id`, ({ params }) => ({ _id: params.id })),

    // Profile update requests + document requests — HR side
    route('GET', `${P}/profile-update-requests`, profileUpdateRequests),
    route('PATCH', `${P}/profile-update-requests/:requestId/approve`, resolveProfileRequest('approved')),
    route('PATCH', `${P}/profile-update-requests/:requestId/reject`, resolveProfileRequest('rejected')),
    route('GET', `${P}/document-requests`, documentRequests),
    route('POST', `${P}/document-requests/:requestId/upload`, ({ params }) => {
        const request = DOCUMENT_REQUESTS.find(r => r.id === params.requestId) ?? DOCUMENT_REQUESTS[0];
        return { ...request, status: 'completed', updatedAt: nowIso() };
    }),

    // ESS — the employee persona (Sneha Iyer)
    route('GET', `${P}/user-profile/profile`, essProfile),
    route('GET', `${P}/document-requests/active`, ({ mode }) =>
        mode === 'empty' ? { requests: [] } : essActiveRequests()
    ),
    route('POST', `${P}/document-requests`, ({ body }): DocumentRequest => ({
        id: `dr-${Date.now()}`,
        documentType: body?.documentType ?? 'Others',
        status: 'pending',
    })),
    route('POST', `${P}/profile-update-requests/profile`, ({ body }) => ({
        id: `pur-${Date.now()}`,
        type: 'profileDetails',
        status: 'requestedByEmployee',
        requestedData: body,
    })),
    route('POST', `${P}/profile-update-requests/bank`, ({ body }) => ({
        id: `pur-${Date.now()}`,
        type: 'bankDetails',
        status: 'requestedByEmployee',
        requestedData: body,
    })),
    route('GET', `${P}/onboarding/required-documents`, ({ mode }) => ({
        requiredDocuments: mode === 'empty' ? [] : REQUIRED_DOCUMENTS,
    })),
    route('POST', `${P}/onboarding/bank`, ({ body }) => ({ bankDetails: body })),
    route('POST', `${P}/onboarding/documents`, ({ body }) => ({
        employeeDocuments: body?.employeeDocuments ?? [],
    })),
    route('POST', `${P}/onboarding/emergency`, ({ body }) => ({ ...body, isCompleted: true })),

    // ESS login for an employee (Share ESS Invite / offboarding / email change)
    route('POST', 'user/ess/user', () => ({ resent: false })),
    route('PUT', 'user/ess/user/:employeeId/email', ({ body }) => ({ email: body?.email })),
    route('DELETE', 'user/ess/user/:employeeId', () => ({})),
];

