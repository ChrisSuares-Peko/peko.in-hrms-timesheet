export interface IsoftwareCategory {
    weburl: string;
    name: string;
    title: string;
    icon: string;
}
export interface ISoftwareCategoryListResponse {
    categoryList: IsoftwareCategory[];
}

export interface ICategoryProductRequestPayload {
    userId: number;
    userType: string;
    parentCategory: string;
    page: number;
    limit: number;
    filter?: string;
    sortBy?: string;
    search?: string;
}
