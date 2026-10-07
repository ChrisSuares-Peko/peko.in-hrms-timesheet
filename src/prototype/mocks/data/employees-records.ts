// PROTOTYPE-SETUP: area A (employees) — maps the MASTER employee list onto the record shapes the Payroll
// employee screens and the ESS profile read: list rows, full profiles, documents, assets, bank accounts,
// requests and calendar activities. Everything here is derived from ./employees, nothing new is invented.
import type { assetTable } from '@domains/dashboard/Payroll/types/docAndAssetsTypes';
import type { EmployeeProfile } from '@domains/dashboard/Payroll/types/employeeprofile/type';
import type { Employee } from '@domains/dashboard/Payroll/types/types';

import { COMPANY } from './company';
import { isoDateTime, monthsAgo, toIsoDate, today } from './dates';
import { DEPARTMENTS, EMPLOYEES, MockEmployee, managerOf } from './employees';

/** Public, CORS-friendly sample PDF used for every document link in the prototype. */
export const SAMPLE_PDF_URL = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

export const TIME_SCHEDULE = '9:30 AM - 6:30 PM';
export const PROBATION_MONTHS = 6;

const WORK_DAYS = COMPANY.workWeek.days;

export const recordId = (e: MockEmployee) => String(e.id);
export const departmentId = (e: MockEmployee) => String(e.departmentId);

const officeOf = (e: MockEmployee) => COMPANY.offices[e.location];

export const employeeStatusOf = (e: MockEmployee) => (e.probationEnded ? 'ACTIVE' : 'INPROBATION');

/** ESS login exists for everyone except the new joiner (invite pending) and the leaver. */
export const hasEssLogin = (e: MockEmployee) => e.status === 'active';

export const createdAtOf = (e: MockEmployee) => isoDateTime(e.dateOfJoin, '10:15:00');

/** Resignation details for the employee serving notice; undefined for everyone else. */
export const offBoardingOf = (e: MockEmployee) =>
    e.status === 'notice' && e.lastWorkingDay
        ? {
              lastWorkingDay: e.lastWorkingDay,
              resignationLetter: SAMPLE_PDF_URL,
              noticePeriod: e.noticePeriodDays,
              offBoardingType: 'RESIGNATION',
              reasonForOffBoarding: 'Relocating to Pune for family reasons.',
              offBoardingDate: monthsAgo(1, 9),
          }
        : undefined;

// ---- documents & assets ----------------------------------------------------------------------------------

export interface MockEmployeeDocument {
    _id: string;
    key: string;
    name: string;
    url: string;
    expiryDate: string;
    holderName: string;
    createdAt: string;
    updatedAt: string;
}

const DOCUMENT_TYPES = [
    { key: 'panCard', name: 'PAN Card' },
    { key: 'aadhaarCard', name: 'Aadhaar Card' },
    { key: 'offerLetter', name: 'Offer Letter' },
    { key: 'appointmentLetter', name: 'Appointment Letter' },
    { key: 'degreeCertificate', name: 'Degree Certificate' },
];

export const documentsOf = (e: MockEmployee): MockEmployeeDocument[] =>
    // The new joiner has only submitted the KYC basics so far.
    DOCUMENT_TYPES.slice(0, e.status === 'new-joiner' ? 3 : DOCUMENT_TYPES.length).map((d, i) => ({
        _id: `doc-${e.id}-${i + 1}`,
        key: d.key,
        name: d.name,
        url: SAMPLE_PDF_URL,
        expiryDate: '',
        holderName: e.fullName,
        createdAt: createdAtOf(e),
        updatedAt: createdAtOf(e),
    }));

export type MockEmployeeAsset = assetTable & {
    id: string;
    createdAt: string;
    employeeId: string;
    employee: string;
};

const laptopFor = (e: MockEmployee) =>
    e.department === 'Engineering' ? 'MacBook Pro 14" (M3)' : 'Dell Latitude 5440';

export const assetsOf = (e: MockEmployee): MockEmployeeAsset[] => {
    const n = String(e.id - 1000).padStart(3, '0');
    const base = {
        dateAdded: e.dateOfJoin,
        purchasedDate: monthsAgo(Math.min(48, Math.max(1, e.experienceYears * 2)), 10),
        user: e.fullName,
        action: '',
        employeeId: recordId(e),
        employee: recordId(e),
        createdAt: createdAtOf(e),
    };
    const assets: MockEmployeeAsset[] = [
        {
            ...base,
            id: `asset-${e.id}-1`,
            aId: `asset-${e.id}-1`,
            assetType: 'Laptop',
            assetName: laptopFor(e),
            assetId: `ACME-LT-${n}`,
            batchNo: 'LT-2024-B2',
            status: 'IN USE',
        },
        {
            ...base,
            id: `asset-${e.id}-2`,
            aId: `asset-${e.id}-2`,
            assetType: 'ID Card',
            assetName: 'Employee Access Card',
            assetId: `ACME-ID-${n}`,
            batchNo: 'ID-2024-B1',
            status: 'ACTIVE',
        },
    ];
    if (e.isDepartmentManager || e.department === 'Sales') {
        assets.push({
            ...base,
            id: `asset-${e.id}-3`,
            aId: `asset-${e.id}-3`,
            assetType: 'Mobile Phone',
            assetName: 'iPhone 15',
            assetId: `ACME-MB-${n}`,
            batchNo: 'MB-2025-B1',
            status: 'IN USE',
        });
    }
    return assets;
};

export const ALL_ASSETS = EMPLOYEES.flatMap(assetsOf);

// ---- list row (payroll/employee) -------------------------------------------------------------------------

export const listRowOf = (e: MockEmployee): Employee => {
    const manager = managerOf(e);
    return {
        profileImage: '',
        personalInformation: {
            corporateUser: String(COMPANY.corporateUserId),
            fullName: e.fullName,
            dateOfBirth: e.dateOfBirth,
            gender: e.gender.toUpperCase(),
            mobileNo: e.mobileNo,
            email: e.email,
            personalAddress: e.address,
            nationality: 'India',
            isGccNationality: false,
            emergencyContactName: e.emergencyContact.name,
            emergencyContactRelation: e.emergencyContact.relation,
            emergencyContactNo: e.emergencyContact.mobileNo,
            qualification: e.qualification,
            experienceInYear: String(e.experienceYears),
            experienceInMonth: '0',
            maritialStatus: e.maritalStatus,
        },
        employeeInformation: {
            probation: String(PROBATION_MONTHS),
            designation: e.designation,
            dateOfJoin: e.dateOfJoin,
            employeeId: e.employeeId,
            workingHours: COMPANY.workWeek.workingHours,
            department: { departmentName: e.department, id: departmentId(e) },
            workingDays: COMPANY.workWeek.workingDays,
            employeeStatus: employeeStatusOf(e),
            reportingStaff: manager ? recordId(manager) : '',
            schedule: TIME_SCHEDULE,
            jobType: 'FULL_TIME',
            employeeType: 'FULL_TIME',
        },
        salaryInformation: {
            basicPay: e.salary.basic,
            travelAllowances: e.salary.conveyance,
            homeAllowances: e.salary.hra,
            medicalAllowances: e.salary.medical,
            otherAllowances: e.salary.specialAllowance,
            other: 0,
        },
        employeeDocuments: documentsOf(e).map(d => ({
            name: d.name,
            url: d.url,
            expiryDate: d.expiryDate,
        })),
        bankDetails: {
            beneficiaryName: e.fullName,
            accountNumber: e.bank.accountNumber,
            bankName: e.bank.bankName,
            ibanNumber: '',
            swiftCode: e.bank.ifsc,
            bankBranch: e.bank.branch,
            accountType: 'Savings',
        },
        isCompleted: true,
        createdAt: createdAtOf(e),
        updatedAt: createdAtOf(e),
        workSchedule: {
            days: WORK_DAYS,
            startTime: COMPANY.workWeek.startTime,
            endTime: COMPANY.workWeek.endTime,
            breakTimeHrs: COMPANY.workWeek.breakTimeHrs,
        },
        offBoardingInformation: offBoardingOf(e),
        emergencyNo: e.emergencyContact.mobileNo,
        id: recordId(e),
        isEss: hasEssLogin(e),
    };
};

// ---- full profile (payroll/employee/:id) -----------------------------------------------------------------

/**
 * EmployeeProfile with `offBoardingInformation` optional: the profile header shows "Resigned" whenever the
 * object is present, so it is only sent for the employee actually serving notice.
 */
export type EmployeeProfileRecord = Omit<EmployeeProfile, 'offBoardingInformation'> & {
    offBoardingInformation?: EmployeeProfile['offBoardingInformation'] & { offBoardingDate?: string };
    salaryInformation: Employee['salaryInformation'];
    workSchedule: Employee['workSchedule'];
    isEmployeeDeleted: boolean;
};

export const profileOf = (e: MockEmployee): EmployeeProfileRecord => {
    const manager = managerOf(e);
    const office = officeOf(e);
    const list = listRowOf(e);
    return {
        id: recordId(e),
        corporateUser: String(COMPANY.corporateUserId),
        profileImage: '',
        personalInformation: {
            fullName: e.fullName,
            dateOfBirth: e.dateOfBirth,
            gender: e.gender.toUpperCase(),
            mobileNo: e.mobileNo,
            email: e.personalEmail,
            country: 'India',
            state: office.state,
            pinCode: office.pincode,
            emergencyContactNo: e.emergencyContact.mobileNo,
            emergencyContactName: e.emergencyContact.name,
            emergencyContactRelation: e.emergencyContact.relation,
            addressLine1: office.line1,
            addressLine2: office.city,
        },
        isCompleted: true,
        isEmployeeDeleted: false,
        salaryComponents: [],
        employeeDocuments: documentsOf(e),
        createdAt: createdAtOf(e),
        updatedAt: createdAtOf(e),
        __v: 0,
        employeeInformation: {
            dateOfJoin: e.dateOfJoin,
            employeeId: e.employeeId,
            department: { _id: departmentId(e), departmentName: e.department },
            designation: e.designation,
            reportingStaff: manager ? recordId(manager) : '',
            reportingStaffName: manager ? manager.fullName : '',
            workingDays: COMPANY.workWeek.workingDays,
            timeSchedule: TIME_SCHEDULE,
            workingHours: COMPANY.workWeek.workingHours,
            contractType: 'FULL_TIME',
            taxRegime: 'New Tax Regime',
            employeeStatus: employeeStatusOf(e),
            probationPeriod: PROBATION_MONTHS,
            employeeGrade: e.seniority,
            workEmail: e.email,
            workEmailId: e.email,
        },
        otherConfigurations: {
            enableEPF: true,
            epfUAN: e.uan,
            enableESI: true,
            esiNumber: '',
            professionalTax: true,
            laborWelfareFund: false,
            tds: true,
        },
        offBoardingInformation: offBoardingOf(e),
        bankDetails: {
            accountName: e.fullName,
            accountNumber: e.bank.accountNumber,
            bankName: e.bank.bankName,
            ifscCode: e.bank.ifsc,
        },
        panNumber: e.pan,
        panVerified: true,
        aadhaarNumber: `XXXX XXXX ${e.aadhaarLast4}`,
        aadhaarVerified: e.status !== 'new-joiner',
        isEss: hasEssLogin(e),
        salaryInformation: list.salaryInformation,
        workSchedule: list.workSchedule,
    };
};

// ---- departments ---------------------------------------------------------------------------------------

export const DEPARTMENT_DESCRIPTIONS: Record<string, string> = {
    Engineering: 'Product engineering, QA and DevOps for the Acme platform.',
    Sales: 'New business, account management and inside sales.',
    Operations: 'Delivery operations, logistics and vendor coordination.',
    Finance: 'Accounting, payroll compliance, taxation and audits.',
    HR: 'People operations, talent acquisition and employee engagement.',
};

export const departmentHeadOf = (name: string) => {
    const dept = DEPARTMENTS.find(d => d.name === name);
    return EMPLOYEES.find(e => e.employeeId === dept?.managerEmployeeId);
};

// ---- calendar activities (birthdays, work anniversaries, holidays) --------------------------------------

export interface MockActivity {
    id: string;
    title: string;
    body: string;
    date: string;
    activityType: 'BIRTHDAY' | 'WORK_ANNIVERSARY' | 'HOLIDAY';
}

/** Fixed-date Indian holidays observed by Acme (Karnataka/Maharashtra offices). */
const FIXED_HOLIDAYS: { monthDay: string; title: string }[] = [
    { monthDay: '01-01', title: "New Year's Day" },
    { monthDay: '01-26', title: 'Republic Day' },
    { monthDay: '05-01', title: 'May Day / Maharashtra Day' },
    { monthDay: '08-15', title: 'Independence Day' },
    { monthDay: '10-02', title: 'Gandhi Jayanti' },
    { monthDay: '11-01', title: 'Karnataka Rajyotsava' },
    { monthDay: '12-25', title: 'Christmas' },
];

const onYear = (year: number, monthDay: string) => `${year}-${monthDay}`;

/** All activities falling in `year`. */
export const activitiesForYear = (year: number): MockActivity[] => {
    const birthdays: MockActivity[] = EMPLOYEES.map(e => ({
        id: `bday-${e.id}-${year}`,
        title: `${e.fullName}'s Birthday`,
        body: `Wish ${e.firstName} (${e.designation}, ${e.department}) a happy birthday!`,
        date: onYear(year, e.dateOfBirth.slice(5)),
        activityType: 'BIRTHDAY',
    }));
    const anniversaries: MockActivity[] = EMPLOYEES.flatMap(e => {
        const years = year - Number(e.dateOfJoin.slice(0, 4));
        if (years < 1) return [];
        return [
            {
                id: `anniv-${e.id}-${year}`,
                title: `${e.fullName} — ${years} year${years > 1 ? 's' : ''} at Acme`,
                body: `${e.firstName} completes ${years} year${years > 1 ? 's' : ''} with ${COMPANY.shortName}.`,
                date: onYear(year, e.dateOfJoin.slice(5)),
                activityType: 'WORK_ANNIVERSARY' as const,
            },
        ];
    });
    const holidays: MockActivity[] = FIXED_HOLIDAYS.map(h => ({
        id: `hol-${year}-${h.monthDay}`,
        title: h.title,
        body: 'Company holiday — offices closed.',
        date: onYear(year, h.monthDay),
        activityType: 'HOLIDAY',
    }));
    return [...birthdays, ...anniversaries, ...holidays].sort((a, b) => a.date.localeCompare(b.date));
};

/** Activities from today onwards (this year and next), soonest first. */
export const upcomingActivityList = () => {
    const now = today();
    const todayIso = toIsoDate(now);
    return [...activitiesForYear(now.getFullYear()), ...activitiesForYear(now.getFullYear() + 1)].filter(
        a => a.date >= todayIso
    );
};
