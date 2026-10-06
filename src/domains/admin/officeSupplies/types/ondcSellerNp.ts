export type AdminOndcSellerNp = {
    id: number;
    bppId: string;
    bppUri: string | null;
    npName: string | null;
    domain: string | null;
    enabled: boolean;
    lastSeenAt: string | null;
    lastTransactionId: string | null;
    createdAt?: string;
    updatedAt?: string;
};

export type OndcSellerNpsQuery = {
    searchText?: string;
    page: number;
    itemsPerPage: number;
    sort?: string;
    sortField?: string;
};

export type OndcSellerNpsResponse = {
    recordsTotal: number;
    recordsFiltered: number;
    data: AdminOndcSellerNp[];
};
