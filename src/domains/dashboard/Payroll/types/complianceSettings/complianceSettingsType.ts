export type EpfPayload = {
    epfNumber: string;
    pfWagesPolicy: 'CAPPED_15000' | 'FULL_BASIC';
    enableProRatedPfWage: boolean;
    considerSalaryComponents: boolean;
};

export type saveEpfResponse = {
    status: boolean;
    responseCode: string;
    message: string;
    data: EpfPayload;
};

export type EsiPayload = {
    esiNumber: string;
};

export type saveEsiResponse = {
    status: boolean;
    responseCode: string;
    message: string;
    data: EsiPayload;
};
export type TaxPayload = {
    ptNumber: string;
};

export type LabWelfarePayload = {
    workState: string;
    registrationNumber?: string;
};

export interface BsrDetails {
    bankName?: string;
    bsrCode: string;
}

export interface AuthorizedSignatoryDetails {
    name: string;
    // Father's Name/Signature are no longer collected by the redesigned TDS form, but stay
    // optional here (rather than removed) since a save still merges onto whatever an org
    // already has saved for them server-side.
    fathersName?: string;
    signature?: string; // This could be a URL or file path to the signature image
    placeOfSigning?: string;
}

export interface TdsSettingsPayload {
    tan: string;
    taxRegime?: string;
    assignedCommissioner?: string;
    address?: string;
    bsr: BsrDetails;
    authorizedSignatoryDetails: AuthorizedSignatoryDetails;
}

export type saveLabWelfareResponse = {
    status: boolean;
    responseCode: string;
    message: string;
    data: LabWelfarePayload;
};

export type ComplianceSettingsResponse = {
    status: boolean;
    responseCode: string;
    message: string;
    data: {
        epf: {
            epfNumber: string;
            pfWagesPolicy: 'CAPPED_15000' | 'FULL_BASIC';
            enableProRatedPfWage: boolean;
            considerSalaryComponents: boolean;
        };
        esi: {
            esiNumber: string;
            deductionCycle: 'Monthly' | 'Quarterly' | 'Half-Yearly' | 'Yearly';
            employeeContribution: number;
            employerContribution: number;
        };
        professionalTax: {
            ptNumber: string;
            deductionCycle: 'Monthly' | 'Quarterly' | 'Half-Yearly' | 'Yearly';
            incomeSlabs: {
                incomeStartRange: number;
                incomeEndRange: number;
                taxAmount: number;
                _id: string;
            }[];
        };
        laborWelfareFund: {
            workState: string;
            registrationNumber?: string;
        };
    };
    _id: string;
};

export type UpdateComplianceSettingsPayload = {
    epf?: {
        epfNumber?: string;
        pfWagesPolicy?: 'CAPPED_15000' | 'FULL_BASIC';
        enableProRatedPfWage?: boolean;
        considerSalaryComponents?: boolean;
    };
    esi?: {
        esiNumber?: string;
        deductionCycle?: 'Monthly' | 'Quarterly' | 'Half-Yearly' | 'Yearly';
        employeeContribution?: number;
        employerContribution?: number;
        enableEmployerContribution?: boolean;
    };
    professionalTax?: {
        ptNumber?: string;
        deductionCycle?: 'Monthly' | 'Quarterly' | 'Half-Yearly' | 'Yearly';
        incomeSlabs?: Array<{
            incomeStartRange: number;
            incomeEndRange: number;
            taxAmount: number;
        }>;
    };
    laborWelfareFund?: {
        workState?: string;
        registrationNumber?: string;
    };
};
