// challan_online / challan_court are not sellable products — their price is the
// additional fee added on top of the Traffic Challan surcharge per challan of that kind.
export type CarReportPlanType =
    | 'valuation'
    | 'history'
    | 'inspection'
    | 'challan_online'
    | 'challan_court';

export interface CarReportPlan {
    id?: number;
    reportType: CarReportPlanType;
    // Only inspection plans carry a packageId; the flat products store null.
    packageId?: string | null;
    displayName: string;
    price: number | string;
    // Droom's SKU for the eco-order booking — an inspection plan without one cannot be
    // booked and auto-refunds on purchase.
    vendorProductCode?: string | null;
    status?: boolean;
    sortOrder?: number;
    createdAt?: string;
    updatedAt?: string;
}

export interface GetCarReportPlansParams {
    searchText?: string;
    page?: number;
    itemsPerPage?: number;
    sort?: string;
    sortField?: string;
    reportType?: string;
}

export const REPORT_TYPE_OPTIONS = [
    { label: 'Valuation', value: 'valuation' },
    { label: 'History', value: 'history' },
    { label: 'Inspection', value: 'inspection' },
    { label: 'Challan — Online fee', value: 'challan_online' },
    { label: 'Challan — Court fee', value: 'challan_court' },
];

export const REPORT_TYPE_COLORS: Record<string, string> = {
    valuation: 'gold',
    history: 'green',
    inspection: 'purple',
    challan_online: 'blue',
    challan_court: 'volcano',
};
