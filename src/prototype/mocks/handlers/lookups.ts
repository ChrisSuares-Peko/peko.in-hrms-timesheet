// PROTOTYPE-SETUP: static dropdown lookups (user/general/*) used by Payroll's HR Settings company form.
// Reference data, not company data — identical in both data modes.
import type { DropDown } from '@customtypes/general';
import type { CountriesResponse } from '@domains/dashboard/Payroll/types/types';
import type {
    AccountTypeResponse,
    ActivityResponse,
    AddressTypesResponse,
    CompanySizesResponse,
    StatesResponse,
} from '@domains/dashboard/profile/types';

import { MockRoute, route } from '../router';

const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
    'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
    'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
    'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep',
    'Puducherry',
].map(name => ({ label: name, value: name }));

const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'].map((name, i) => ({
    id: i + 1,
    name,
}));

const COMPANY_ACTIVITIES = [
    'Information Technology & Services',
    'Software Products',
    'Consulting',
    'Manufacturing',
    'Retail & E-commerce',
    'Financial Services',
    'Healthcare',
    'Education',
    'Logistics',
    'Other',
].map((name, i) => ({ id: i + 1, name }));

const ADDRESS_TYPES: DropDown = ['Registered Office', 'Branch Office', 'Warehouse', 'Billing'].map(name => ({
    label: name,
    value: name,
}));

const ACCOUNT_TYPES: DropDown = ['Current', 'Savings'].map(name => ({ label: name, value: name }));

const COUNTRIES: DropDown = [
    'India', 'United Arab Emirates', 'United States', 'United Kingdom', 'Singapore', 'Australia', 'Canada',
    'Germany', 'France', 'Japan', 'Nepal', 'Bangladesh', 'Sri Lanka', 'Saudi Arabia', 'Qatar',
].map(name => ({ label: name, value: name }));

// The app declares these lists as one-element tuples (`[{ id; name }]`); real lists have many entries,
// so the arrays are cast once here at the response boundary.
export const lookupRoutes: MockRoute[] = [
    route('GET', 'user/general/indian-states', () => ({
        states: INDIAN_STATES as unknown as StatesResponse['states'],
    })),
    route('GET', 'user/general/companySize', () => ({
        companySize: COMPANY_SIZES as unknown as CompanySizesResponse['companySize'],
    })),
    route('GET', 'user/general/companyActivity', () => ({
        companyActivity: COMPANY_ACTIVITIES as unknown as ActivityResponse['companyActivity'],
    })),
    route('GET', 'user/general/addressType', (): AddressTypesResponse => ({ addressType: ADDRESS_TYPES })),
    route('GET', 'user/general/bank/accountType', (): AccountTypeResponse => ({ accountType: ACCOUNT_TYPES })),
    route('GET', 'user/general/countries', ({ query }): CountriesResponse => {
        const search = String(query.searchQuery ?? '').toLowerCase();
        return { countries: COUNTRIES.filter(c => c.label.toLowerCase().includes(search)) };
    }),
];
