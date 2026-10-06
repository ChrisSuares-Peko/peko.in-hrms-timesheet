import { CtcEmployerPf, PfWagePolicy } from './types';

// Statutory EPF wage ceiling. ₹15,000/month through August 2026; ₹25,000/month from the
// September 2026 payroll month onward (EPFO revision effective 17 Sep 2026 — treated as a
// whole-month change, so September 2026 itself already uses the new ceiling). Which
// ceiling applies is always driven by the PAYROLL MONTH/YEAR being calculated, never by
// "today's date" — mirrors the backend's services/calculateEmployerPf.js exactly, keep
// both in sync.
export const OLD_PF_WAGE_CEILING = 15000;
export const NEW_PF_WAGE_CEILING = 25000;
export const NEW_CEILING_EFFECTIVE_YEAR = 2026;
export const NEW_CEILING_EFFECTIVE_MONTH = 9; // September

export const EPF_EMPLOYEE_RATE = 0.12;
export const EPF_EMPLOYER_TOTAL_RATE = 0.12;
export const EPS_RATE = 0.0833;
export const EDLI_RATE = 0.005;
export const ADMIN_CHARGE_RATE = 0.005;

// Resolves the PF wage ceiling for a given payroll month/year (1-12, calendar year).
// Falls back to the CURRENT calendar month/year when no period is given — correct for
// "live preview" contexts (CTC Calculator, Add Employee, Revise Salary preview), which
// represent "if set up right now", as distinct from viewing a specific historical month.
export const resolvePfWageCeiling = (month?: number | null, year?: number | null): number => {
    let numMonth = Number(month);
    let numYear = Number(year);
    if (!numMonth || !numYear) {
        const now = new Date();
        numMonth = now.getMonth() + 1;
        numYear = now.getFullYear();
    }
    const newCeilingApplies =
        numYear > NEW_CEILING_EFFECTIVE_YEAR ||
        (numYear === NEW_CEILING_EFFECTIVE_YEAR && numMonth >= NEW_CEILING_EFFECTIVE_MONTH);
    return newCeilingApplies ? NEW_PF_WAGE_CEILING : OLD_PF_WAGE_CEILING;
};

export const resolvePfWage = (
    basicSalary: number,
    policy: PfWagePolicy,
    month?: number | null,
    year?: number | null
) => (policy === 'FULL_BASIC' ? basicSalary : Math.min(basicSalary, resolvePfWageCeiling(month, year)));

// The employee-side cap expressed in rupees (12% of the period-correct wage ceiling) —
// ₹1,800/month through August 2026, ₹3,000/month from September 2026 onward.
export const resolvePfMonthlyCap = (month?: number | null, year?: number | null) =>
    Math.round(resolvePfWageCeiling(month, year) * EPF_EMPLOYEE_RATE);

// Full EPF contribution breakup, account-wise — not a single employer lump sum. The
// employer's 12% share splits into EPS (pension, A/c 10) and Employer EPF (A/c 1): EPS is
// rounded FIRST, and Employer EPF is the REMAINDER of the rounded 12% total minus that
// rounded EPS — never an independently-rounded 3.67% — because rounding EPS and 3.67%
// separately can leave them not summing back to the rounded 12% total.
export const calculateEmployerPfContribution = (
    basicSalary: number,
    policy: PfWagePolicy,
    month?: number | null,
    year?: number | null
): CtcEmployerPf => {
    const ceiling = resolvePfWageCeiling(month, year);
    const pfWage = policy === 'FULL_BASIC' ? basicSalary : Math.min(basicSalary, ceiling);

    const employeeEpf = Math.round(pfWage * EPF_EMPLOYEE_RATE);

    const employerTotalShare = Math.round(pfWage * EPF_EMPLOYER_TOTAL_RATE);
    const employerEps = Math.round(pfWage * EPS_RATE);
    const employerEpf = employerTotalShare - employerEps;

    const edli = Math.round(pfWage * EDLI_RATE);
    const adminCharges = Math.round(pfWage * ADMIN_CHARGE_RATE);

    const employerTotal = employerEps + employerEpf + edli + adminCharges;
    const totalDeposit = employeeEpf + employerTotal;

    return {
        pfWage,
        ceiling,
        employeeEpf,
        employerEps,
        employerEpf,
        edli,
        adminCharges,
        employerTotal,
        totalDeposit,
        adminEdli: edli + adminCharges,
        total: employerTotal,
    };
};

// Mirrors the backend's resolveEpfPolicyFromComplianceSettings (services/calculateEmployerPf.js).
// pfWagesPolicy is the canonical signal; orgs saved before that field existed only have the
// free-text employerContributionRate string (e.g. '12% of Basic Salary' or 'Restrict
// Contribution to ₹15000 of PF Wage') — fall back to parsing that instead of a migration.
export const resolveEpfPolicyFromComplianceSettings = (complianceData: any): PfWagePolicy => {
    const policy = complianceData?.epf?.pfWagesPolicy;
    if (policy === 'CAPPED_15000' || policy === 'FULL_BASIC') return policy;

    const rate: string = complianceData?.epf?.employerContributionRate || '';
    return rate.includes('Basic Salary') ? 'FULL_BASIC' : 'CAPPED_15000';
};
