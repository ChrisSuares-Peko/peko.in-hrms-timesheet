// PROTOTYPE-SETUP: the demo company. Kept in step with MOCK_AUTHENTICATED_USER (loginSlice), which carries
// the same company name for the logged-in corporate admin.
import { MOCK_AUTHENTICATED_USER } from '@domains/auth/slices/loginSlice';

export const COMPANY = {
    name: MOCK_AUTHENTICATED_USER.name ?? 'Acme Technologies Pvt Ltd',
    shortName: 'Acme Technologies',
    emailDomain: 'acmetech.in',
    corporateUserId: MOCK_AUTHENTICATED_USER.id,
    pan: 'AAKCA4821M',
    tan: 'BLRA12345E',
    gstin: '29AAKCA4821M1Z6',
    cin: 'U72900KA2021PTC145872',
    pfEstablishmentCode: 'KNBNG2145870000',
    esicCode: '53000123450001001',
    phone: '08041234567',
    website: 'https://www.acmetech.in',
    offices: {
        Bengaluru: {
            line1: '4th Floor, Prestige Tech Park, Marathahalli Outer Ring Road',
            city: 'Bengaluru',
            state: 'Karnataka',
            pincode: '560103',
        },
        Mumbai: {
            line1: '12th Floor, One BKC, Bandra Kurla Complex',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400051',
        },
    },
    workWeek: {
        days: {
            monday: true,
            tuesday: true,
            wednesday: true,
            thursday: true,
            friday: true,
            saturday: false,
            sunday: false,
        },
        startTime: '09:30',
        endTime: '18:30',
        breakTimeHrs: 1,
        workingHours: 8,
        workingDays: 5,
    },
    bank: {
        bankName: 'HDFC Bank',
        accountNumber: '50200061234567',
        ifsc: 'HDFC0000523',
        branch: 'Marathahalli, Bengaluru',
    },
};

export type OfficeLocation = keyof typeof COMPANY.offices;
