// PROTOTYPE-SETUP: MASTER employee file for the demo company (Acme Technologies Pvt Ltd).
// Every employee-related mock endpoint (listings, profiles, salary, departments, dashboard counts, ESS)
// derives from this list, so the same 20 people appear everywhere. Edit people here, nowhere else.
//
// Shape: one neutral record per person; each handler maps it to its endpoint's real response type.
//   Departments: Engineering 7, Sales 4, Operations 4, Finance 2, HR 3.
//   Reporting: one manager per department; everyone else reports to their department's manager.
//   Status: 18 active, 1 on notice (ACME-010), 1 newly joined this month (ACME-015).
//
// PERSONAS
//   ESS - Employee persona: ACME-004 Sneha Iyer — marked with `persona: 'ESS_EMPLOYEE'` below.
//   ESS - Manager  persona: NOT marked — always the ESS employee's reporting manager, resolved from her
//                  `managerEmployeeId` (today ACME-001 Arjun Mehta, Engineering Manager, 6 direct reports).
import { COMPANY, OfficeLocation } from './company';
import { daysFromToday, monthsAgo, startOfThisMonth } from './dates';

export type DepartmentName = 'Engineering' | 'Sales' | 'Operations' | 'Finance' | 'HR';
export type EmploymentStatus = 'active' | 'notice' | 'new-joiner';
export type Seniority = 'Manager' | 'Senior' | 'Mid' | 'Junior';
export type Persona = 'ESS_EMPLOYEE';

export interface MockDepartment {
    id: number;
    name: DepartmentName;
    code: string;
    /** employeeId (ACME-xxx) of the department manager. */
    managerEmployeeId: string;
}

export const DEPARTMENTS: MockDepartment[] = [
    { id: 101, name: 'Engineering', code: 'ENG', managerEmployeeId: 'ACME-001' },
    { id: 102, name: 'Sales', code: 'SAL', managerEmployeeId: 'ACME-008' },
    { id: 103, name: 'Operations', code: 'OPS', managerEmployeeId: 'ACME-012' },
    { id: 104, name: 'Finance', code: 'FIN', managerEmployeeId: 'ACME-016' },
    { id: 105, name: 'HR', code: 'HR', managerEmployeeId: 'ACME-018' },
];

/** Monthly salary split (INR) — standard Indian structure derived from monthly CTC. */
export interface SalaryBreakup {
    monthlyCtc: number;
    annualCtc: number;
    basic: number;
    hra: number;
    conveyance: number;
    medical: number;
    specialAllowance: number;
    employerPf: number;
    grossEarnings: number;
    employeePf: number;
    professionalTax: number;
    tds: number;
    totalDeductions: number;
    netPay: number;
}

export interface MockEmployee {
    /** Numeric record id used in URLs (payroll/employee/:id). */
    id: number;
    /** Human-facing employee code. */
    employeeId: string;
    firstName: string;
    lastName: string;
    fullName: string;
    gender: 'Male' | 'Female';
    dateOfBirth: string;
    maritalStatus: 'Single' | 'Married';
    /** Work email @acmetech.in */
    email: string;
    personalEmail: string;
    mobileNo: string;
    department: DepartmentName;
    departmentId: number;
    designation: string;
    seniority: Seniority;
    isDepartmentManager: boolean;
    /** employeeId of the manager; null for department managers (they report to leadership). */
    managerEmployeeId: string | null;
    location: OfficeLocation;
    address: string;
    dateOfJoin: string;
    status: EmploymentStatus;
    /** Set only for the employee serving notice. */
    lastWorkingDay: string | null;
    noticePeriodDays: number;
    employmentType: 'Full-time';
    probationEnded: boolean;
    qualification: string;
    experienceYears: number;
    salary: SalaryBreakup;
    bank: { bankName: string; accountNumber: string; ifsc: string; branch: string };
    pan: string;
    uan: string;
    aadhaarLast4: string;
    emergencyContact: { name: string; relation: string; mobileNo: string };
    persona?: Persona;
}

// ---------------------------------------------------------------------------------------------------------

const round = (n: number) => Math.round(n);

/** Basic 50% of CTC, HRA 40% of basic, fixed conveyance/medical, PF capped at ₹1,800, PT ₹200, rough TDS. */
export const salaryFromMonthlyCtc = (monthlyCtc: number): SalaryBreakup => {
    const basic = round(monthlyCtc * 0.5);
    const hra = round(basic * 0.4);
    const conveyance = 1600;
    const medical = 1250;
    const employerPf = Math.min(round(basic * 0.12), 1800);
    const specialAllowance = Math.max(0, monthlyCtc - basic - hra - conveyance - medical - employerPf);
    const grossEarnings = basic + hra + conveyance + medical + specialAllowance;
    const employeePf = employerPf;
    const professionalTax = 200;
    const annualTaxable = Math.max(0, grossEarnings * 12 - 75000);
    // New-regime style approximation, monthly instalment — illustrative, not a tax computation.
    const annualTax =
        annualTaxable <= 700000 ? 0 : round((annualTaxable - 700000) * 0.15 + 30000);
    const tds = round(annualTax / 12);
    const totalDeductions = employeePf + professionalTax + tds;
    return {
        monthlyCtc,
        annualCtc: monthlyCtc * 12,
        basic,
        hra,
        conveyance,
        medical,
        specialAllowance,
        employerPf,
        grossEarnings,
        employeePf,
        professionalTax,
        tds,
        totalDeductions,
        netPay: grossEarnings - totalDeductions,
    };
};

interface Seed {
    n: number;
    firstName: string;
    lastName: string;
    gender: 'Male' | 'Female';
    department: DepartmentName;
    designation: string;
    seniority: Seniority;
    location: OfficeLocation;
    /** Joined `joinedMonthsAgo` months ago on `joinDay`; `null` = joined this month. */
    joinedMonthsAgo: number | null;
    joinDay: number;
    monthlyCtc: number;
    birthYear: number;
    birthMonthDay: string;
    maritalStatus: 'Single' | 'Married';
    qualification: string;
    experienceYears: number;
    bankName: string;
    ifsc: string;
    emergency: { name: string; relation: string };
    status?: EmploymentStatus;
    persona?: Persona;
}

const SEEDS: Seed[] = [
    // ---- Engineering (7) — manager ACME-001 -------------------------------------------------------------
    { n: 1, firstName: 'Arjun', lastName: 'Mehta', gender: 'Male', department: 'Engineering', designation: 'Engineering Manager', seniority: 'Manager', location: 'Bengaluru', joinedMonthsAgo: 46, joinDay: 3, monthlyCtc: 240000, birthYear: 1986, birthMonthDay: '04-12', maritalStatus: 'Married', qualification: 'B.Tech, Computer Science', experienceYears: 14, bankName: 'HDFC Bank', ifsc: 'HDFC0000523', emergency: { name: 'Kavita Mehta', relation: 'Spouse' } },
    { n: 2, firstName: 'Priya', lastName: 'Nair', gender: 'Female', department: 'Engineering', designation: 'Senior Software Engineer', seniority: 'Senior', location: 'Bengaluru', joinedMonthsAgo: 40, joinDay: 15, monthlyCtc: 155000, birthYear: 1991, birthMonthDay: '09-23', maritalStatus: 'Married', qualification: 'M.Tech, Software Systems', experienceYears: 9, bankName: 'ICICI Bank', ifsc: 'ICIC0001845', emergency: { name: 'Anil Nair', relation: 'Spouse' } },
    { n: 3, firstName: 'Rahul', lastName: 'Verma', gender: 'Male', department: 'Engineering', designation: 'Senior Software Engineer', seniority: 'Senior', location: 'Bengaluru', joinedMonthsAgo: 34, joinDay: 8, monthlyCtc: 148000, birthYear: 1992, birthMonthDay: '01-30', maritalStatus: 'Single', qualification: 'B.E., Information Science', experienceYears: 8, bankName: 'Axis Bank', ifsc: 'UTIB0000413', emergency: { name: 'Sunita Verma', relation: 'Mother' } },
    { n: 4, firstName: 'Sneha', lastName: 'Iyer', gender: 'Female', department: 'Engineering', designation: 'Software Engineer', seniority: 'Mid', location: 'Bengaluru', joinedMonthsAgo: 22, joinDay: 1, monthlyCtc: 95000, birthYear: 1996, birthMonthDay: '06-18', maritalStatus: 'Single', qualification: 'B.Tech, Computer Science', experienceYears: 4, bankName: 'HDFC Bank', ifsc: 'HDFC0001272', emergency: { name: 'Ramesh Iyer', relation: 'Father' }, persona: 'ESS_EMPLOYEE' },
    { n: 5, firstName: 'Karthik', lastName: 'Reddy', gender: 'Male', department: 'Engineering', designation: 'Software Engineer', seniority: 'Mid', location: 'Bengaluru', joinedMonthsAgo: 15, joinDay: 10, monthlyCtc: 88000, birthYear: 1997, birthMonthDay: '11-05', maritalStatus: 'Single', qualification: 'B.Tech, Electronics', experienceYears: 3, bankName: 'State Bank of India', ifsc: 'SBIN0040311', emergency: { name: 'Lakshmi Reddy', relation: 'Mother' } },
    { n: 6, firstName: 'Ananya', lastName: 'Gupta', gender: 'Female', department: 'Engineering', designation: 'QA Engineer', seniority: 'Junior', location: 'Mumbai', joinedMonthsAgo: 11, joinDay: 20, monthlyCtc: 68000, birthYear: 1999, birthMonthDay: '03-09', maritalStatus: 'Single', qualification: 'B.Sc, Computer Science', experienceYears: 2, bankName: 'Kotak Mahindra Bank', ifsc: 'KKBK0000652', emergency: { name: 'Rakesh Gupta', relation: 'Father' } },
    { n: 7, firstName: 'Vikram', lastName: 'Singh', gender: 'Male', department: 'Engineering', designation: 'DevOps Engineer', seniority: 'Senior', location: 'Bengaluru', joinedMonthsAgo: 27, joinDay: 4, monthlyCtc: 110000, birthYear: 1993, birthMonthDay: '08-27', maritalStatus: 'Married', qualification: 'B.Tech, Computer Science', experienceYears: 7, bankName: 'ICICI Bank', ifsc: 'ICIC0000104', emergency: { name: 'Harleen Singh', relation: 'Spouse' } },

    // ---- Sales (4) — manager ACME-008 -------------------------------------------------------------------
    { n: 8, firstName: 'Neha', lastName: 'Kapoor', gender: 'Female', department: 'Sales', designation: 'Sales Manager', seniority: 'Manager', location: 'Mumbai', joinedMonthsAgo: 44, joinDay: 12, monthlyCtc: 190000, birthYear: 1988, birthMonthDay: '02-14', maritalStatus: 'Married', qualification: 'MBA, Marketing', experienceYears: 12, bankName: 'HDFC Bank', ifsc: 'HDFC0000060', emergency: { name: 'Rohit Kapoor', relation: 'Spouse' } },
    { n: 9, firstName: 'Aditya', lastName: 'Joshi', gender: 'Male', department: 'Sales', designation: 'Senior Account Executive', seniority: 'Senior', location: 'Mumbai', joinedMonthsAgo: 30, joinDay: 6, monthlyCtc: 85000, birthYear: 1994, birthMonthDay: '10-02', maritalStatus: 'Married', qualification: 'BBA', experienceYears: 6, bankName: 'Axis Bank', ifsc: 'UTIB0000004', emergency: { name: 'Shruti Joshi', relation: 'Spouse' } },
    { n: 10, firstName: 'Pooja', lastName: 'Desai', gender: 'Female', department: 'Sales', designation: 'Account Executive', seniority: 'Mid', location: 'Mumbai', joinedMonthsAgo: 18, joinDay: 17, monthlyCtc: 55000, birthYear: 1997, birthMonthDay: '12-21', maritalStatus: 'Single', qualification: 'B.Com', experienceYears: 3, bankName: 'Kotak Mahindra Bank', ifsc: 'KKBK0001363', emergency: { name: 'Hemant Desai', relation: 'Father' }, status: 'notice' },
    { n: 11, firstName: 'Siddharth', lastName: 'Rao', gender: 'Male', department: 'Sales', designation: 'Sales Development Representative', seniority: 'Junior', location: 'Bengaluru', joinedMonthsAgo: 8, joinDay: 2, monthlyCtc: 42000, birthYear: 2000, birthMonthDay: '05-16', maritalStatus: 'Single', qualification: 'BBA', experienceYears: 1, bankName: 'State Bank of India', ifsc: 'SBIN0001537', emergency: { name: 'Gayathri Rao', relation: 'Mother' } },

    // ---- Operations (4) — manager ACME-012 --------------------------------------------------------------
    { n: 12, firstName: 'Manish', lastName: 'Patel', gender: 'Male', department: 'Operations', designation: 'Operations Manager', seniority: 'Manager', location: 'Mumbai', joinedMonthsAgo: 42, joinDay: 9, monthlyCtc: 165000, birthYear: 1987, birthMonthDay: '07-07', maritalStatus: 'Married', qualification: 'MBA, Operations', experienceYears: 13, bankName: 'ICICI Bank', ifsc: 'ICIC0000013', emergency: { name: 'Hetal Patel', relation: 'Spouse' } },
    { n: 13, firstName: 'Divya', lastName: 'Menon', gender: 'Female', department: 'Operations', designation: 'Operations Executive', seniority: 'Mid', location: 'Bengaluru', joinedMonthsAgo: 20, joinDay: 14, monthlyCtc: 48000, birthYear: 1996, birthMonthDay: '04-29', maritalStatus: 'Married', qualification: 'B.Com', experienceYears: 4, bankName: 'HDFC Bank', ifsc: 'HDFC0002051', emergency: { name: 'Arun Menon', relation: 'Spouse' } },
    { n: 14, firstName: 'Imran', lastName: 'Shaikh', gender: 'Male', department: 'Operations', designation: 'Logistics Coordinator', seniority: 'Junior', location: 'Mumbai', joinedMonthsAgo: 13, joinDay: 22, monthlyCtc: 45000, birthYear: 1998, birthMonthDay: '09-11', maritalStatus: 'Single', qualification: 'Diploma, Supply Chain', experienceYears: 2, bankName: 'Axis Bank', ifsc: 'UTIB0000246', emergency: { name: 'Salma Shaikh', relation: 'Mother' } },
    { n: 15, firstName: 'Kavya', lastName: 'Krishnan', gender: 'Female', department: 'Operations', designation: 'Operations Associate', seniority: 'Junior', location: 'Bengaluru', joinedMonthsAgo: null, joinDay: 1, monthlyCtc: 35000, birthYear: 2002, birthMonthDay: '01-08', maritalStatus: 'Single', qualification: 'B.B.M.', experienceYears: 0, bankName: 'State Bank of India', ifsc: 'SBIN0011690', emergency: { name: 'Krishnan S', relation: 'Father' }, status: 'new-joiner' },

    // ---- Finance (2) — manager ACME-016 -----------------------------------------------------------------
    { n: 16, firstName: 'Suresh', lastName: 'Agarwal', gender: 'Male', department: 'Finance', designation: 'Finance Manager', seniority: 'Manager', location: 'Mumbai', joinedMonthsAgo: 47, joinDay: 1, monthlyCtc: 180000, birthYear: 1985, birthMonthDay: '11-19', maritalStatus: 'Married', qualification: 'Chartered Accountant', experienceYears: 15, bankName: 'HDFC Bank', ifsc: 'HDFC0000001', emergency: { name: 'Rekha Agarwal', relation: 'Spouse' } },
    { n: 17, firstName: 'Meera', lastName: 'Pillai', gender: 'Female', department: 'Finance', designation: 'Accountant', seniority: 'Mid', location: 'Mumbai', joinedMonthsAgo: 24, joinDay: 11, monthlyCtc: 62000, birthYear: 1995, birthMonthDay: '03-25', maritalStatus: 'Single', qualification: 'M.Com', experienceYears: 5, bankName: 'ICICI Bank', ifsc: 'ICIC0000393', emergency: { name: 'Gopal Pillai', relation: 'Father' } },

    // ---- HR (3) — manager ACME-018 ----------------------------------------------------------------------
    { n: 18, firstName: 'Ritu', lastName: 'Sharma', gender: 'Female', department: 'HR', designation: 'HR Manager', seniority: 'Manager', location: 'Bengaluru', joinedMonthsAgo: 45, joinDay: 5, monthlyCtc: 150000, birthYear: 1989, birthMonthDay: '08-03', maritalStatus: 'Married', qualification: 'MBA, Human Resources', experienceYears: 11, bankName: 'Axis Bank', ifsc: 'UTIB0000009', emergency: { name: 'Amit Sharma', relation: 'Spouse' } },
    { n: 19, firstName: 'Nikhil', lastName: 'Bansal', gender: 'Male', department: 'HR', designation: 'HR Executive', seniority: 'Mid', location: 'Bengaluru', joinedMonthsAgo: 16, joinDay: 18, monthlyCtc: 52000, birthYear: 1996, birthMonthDay: '02-26', maritalStatus: 'Single', qualification: 'BBA, Human Resources', experienceYears: 3, bankName: 'Kotak Mahindra Bank', ifsc: 'KKBK0008068', emergency: { name: 'Rajiv Bansal', relation: 'Father' } },
    { n: 20, firstName: 'Farah', lastName: 'Khan', gender: 'Female', department: 'HR', designation: 'Talent Acquisition Specialist', seniority: 'Mid', location: 'Mumbai', joinedMonthsAgo: 6, joinDay: 7, monthlyCtc: 58000, birthYear: 1995, birthMonthDay: '10-30', maritalStatus: 'Married', qualification: 'MA, Psychology', experienceYears: 5, bankName: 'HDFC Bank', ifsc: 'HDFC0000240', emergency: { name: 'Zaid Khan', relation: 'Spouse' } },
];

const code = (n: number) => `ACME-${String(n).padStart(3, '0')}`;
const departmentOf = (name: DepartmentName) => DEPARTMENTS.find(d => d.name === name)!;

const toEmployee = (s: Seed): MockEmployee => {
    const employeeId = code(s.n);
    const dept = departmentOf(s.department);
    const isDepartmentManager = dept.managerEmployeeId === employeeId;
    const status = s.status ?? 'active';
    const handle = `${s.firstName}.${s.lastName}`.toLowerCase();
    const office = COMPANY.offices[s.location];
    return {
        id: 1000 + s.n,
        employeeId,
        firstName: s.firstName,
        lastName: s.lastName,
        fullName: `${s.firstName} ${s.lastName}`,
        gender: s.gender,
        dateOfBirth: `${s.birthYear}-${s.birthMonthDay}`,
        maritalStatus: s.maritalStatus,
        email: `${handle}@${COMPANY.emailDomain}`,
        personalEmail: `${handle}${s.birthYear % 100}@gmail.com`,
        mobileNo: `98${String(45000000 + s.n * 731_919).slice(0, 8)}`,
        department: s.department,
        departmentId: dept.id,
        designation: s.designation,
        seniority: s.seniority,
        isDepartmentManager,
        managerEmployeeId: isDepartmentManager ? null : dept.managerEmployeeId,
        location: s.location,
        address: `${office.line1}, ${office.city}, ${office.state} ${office.pincode}`,
        dateOfJoin: s.joinedMonthsAgo === null ? startOfThisMonth() : monthsAgo(s.joinedMonthsAgo, s.joinDay),
        status,
        lastWorkingDay: status === 'notice' ? daysFromToday(21) : null,
        noticePeriodDays: s.seniority === 'Manager' ? 90 : 60,
        employmentType: 'Full-time',
        probationEnded: s.joinedMonthsAgo !== null && s.joinedMonthsAgo >= 6,
        qualification: s.qualification,
        experienceYears: s.experienceYears,
        salary: salaryFromMonthlyCtc(s.monthlyCtc),
        bank: {
            bankName: s.bankName,
            accountNumber: `5010${String(30000000 + s.n * 4_877_311).slice(0, 8)}`,
            ifsc: s.ifsc,
            branch: s.location,
        },
        pan: `${['ABCPM', 'BQRPN', 'CVTPV', 'DKIPI', 'EHRPR'][s.n % 5]}${String(1000 + s.n * 37).slice(-4)}${'KLMNP'[s.n % 5]}`,
        uan: `1009${String(51234567 + s.n * 1_093).slice(0, 8)}`,
        aadhaarLast4: String(4000 + s.n * 271).slice(-4),
        emergencyContact: {
            name: s.emergency.name,
            relation: s.emergency.relation,
            mobileNo: `97${String(41000000 + s.n * 615_427).slice(0, 8)}`,
        },
        persona: s.persona,
    };
};

/** The 20 employees of Acme Technologies, ordered by employee code. */
export const EMPLOYEES: MockEmployee[] = SEEDS.map(toEmployee);

// ---- lookups used by every handler ----------------------------------------------------------------------

export const findEmployee = (idOrCode: string | number | undefined): MockEmployee | undefined => {
    if (idOrCode === undefined || idOrCode === null) return undefined;
    const key = String(idOrCode);
    return EMPLOYEES.find(e => String(e.id) === key || e.employeeId === key);
};

export const directReportsOf = (managerEmployeeId: string) =>
    EMPLOYEES.filter(e => e.managerEmployeeId === managerEmployeeId);

export const managerOf = (employee: MockEmployee) =>
    employee.managerEmployeeId ? findEmployee(employee.managerEmployeeId) : undefined;

export const employeesInDepartment = (departmentId: number) =>
    EMPLOYEES.filter(e => e.departmentId === departmentId);

/** "Current" employees (active + notice + new joiner) — everyone in this dataset is still on payroll. */
export const currentEmployees = () => EMPLOYEES;

export const ESS_EMPLOYEE = EMPLOYEES.find(e => e.persona === 'ESS_EMPLOYEE')!;
/** The ESS employee's reporting manager, via `managerEmployeeId` — never a hard-coded id. */
export const ESS_MANAGER = managerOf(ESS_EMPLOYEE)!;

export const EMPLOYEE_COUNTS = {
    total: EMPLOYEES.length,
    active: EMPLOYEES.filter(e => e.status === 'active').length,
    onNotice: EMPLOYEES.filter(e => e.status === 'notice').length,
    newJoiners: EMPLOYEES.filter(e => e.status === 'new-joiner').length,
    male: EMPLOYEES.filter(e => e.gender === 'Male').length,
    female: EMPLOYEES.filter(e => e.gender === 'Female').length,
};

/** Monthly payroll totals across all employees (used by dashboards and salary summaries). */
export const PAYROLL_TOTALS = EMPLOYEES.reduce(
    (acc, e) => ({
        monthlyCtc: acc.monthlyCtc + e.salary.monthlyCtc,
        grossEarnings: acc.grossEarnings + e.salary.grossEarnings,
        totalDeductions: acc.totalDeductions + e.salary.totalDeductions,
        netPay: acc.netPay + e.salary.netPay,
        employerPf: acc.employerPf + e.salary.employerPf,
    }),
    { monthlyCtc: 0, grossEarnings: 0, totalDeductions: 0, netPay: 0, employerPf: 0 }
);
