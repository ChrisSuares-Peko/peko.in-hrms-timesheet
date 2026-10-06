import { PayloadAction, createSlice } from '@reduxjs/toolkit';

import { RoleName, UserRole } from '@customtypes/general';

export interface LoginState {
    token: string;
    refreshToken: string;
    sessionId: string;
    isAuthenticated?: boolean;
    role: string;
    id: number;
    username: string;
    roleName: string;
    redirectUrl: string;
    packageName: string;
    acs_user_id: string;
    corporateId?: any;
    subCorporateId?: number | null;
    subCorporateRole?: string | null;
    activeSubRole?: string | null;
    subCorporateUsername?: string;
    showPrivacyPolicyModal: boolean;
    // Populated only for a switched-to (or logged-in) employee identity.
    employeeId?: string;
    userAccessService?: any;
    email?: string;
    redirectURI?: string;
    name?: string;
    contactPersonName?: string;
    mobileNo?: string;
    service?: string;
    oauth_refreshToken?: string;
    sessionUUID?: string;
    autoLogin?: boolean;
    // The employee identity: one row, one id, whichever service invited them. Each service reads its own
    // entry out of `serviceMemberships` by its own label, so adding a service adds no field here.
    employeeProfileId?: number | string | null;
    employeeName?: string | null;
    employeeEmail?: string | null;
    employeeMobile?: string | null;
    serviceMemberships?: ServiceMembership[] | null;
}

export interface ServiceMembership {
    label: string;
    hasAccess: boolean;
    role?: string | null;
    status?: string | null;
    ref?: string | null;
}

// PROTOTYPE-SETUP: the one and only mock identity — boots the app as a logged-in corporate user with no
// real token. userSlice derives from it and store.ts forces it back on every rehydration.
export const MOCK_AUTHENTICATED_USER: LoginState = {
    token: '',
    refreshToken: '',
    sessionId: '',
    isAuthenticated: true,
    role: UserRole.CORPORATE, // not ADMIN — that is the internal staff portal (empty sidebar)
    id: 1001,
    username: 'demo.corporate',
    roleName: RoleName.CORPORATE, // must not be 'corporate sub user' (hides mobile nav, wallet, etc.)
    redirectUrl: '',
    packageName: '',
    acs_user_id: '',
    corporateId: 1001,
    subCorporateId: 0,
    subCorporateRole: null,
    activeSubRole: null,
    name: 'Acme Technologies Pvt Ltd',
    contactPersonName: 'Priya Sharma',
    email: 'admin@acme-demo.in',
    mobileNo: '9876543210',
    employeeProfileId: null,
    employeeName: null,
    employeeEmail: null,
    employeeMobile: null,
    serviceMemberships: null,
    showPrivacyPolicyModal: false,
};

// PROTOTYPE-SETUP: original logged-out state, kept unused so reverting is a one-line swap below.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const LOGGED_OUT_STATE: LoginState = {
    token: '',
    refreshToken: '',
    sessionId: '',
    isAuthenticated: false,
    role: '',
    id: 0,
    username: '',
    roleName: '',
    redirectUrl: '',
    packageName: '',
    acs_user_id: '',
    corporateId: 0,
    subCorporateId: 0,
    subCorporateRole: null,
    activeSubRole: null,
    employeeProfileId: null,
    employeeName: null,
    employeeEmail: null,
    employeeMobile: null,
    serviceMemberships: null,
    showPrivacyPolicyModal: false,
};

// PROTOTYPE-SETUP: boot (and "logout") into the mock user instead of the logged-out state.
const initialState: LoginState = MOCK_AUTHENTICATED_USER;

export const loginSlice = createSlice({
    name: 'login',
    initialState,
    reducers: {
        loginSuccess: (state, action: PayloadAction<Partial<LoginState>>) => {
            state = { ...state, ...action.payload };
            return state;
        },
        setRedirectUrl: (state, action: PayloadAction<string>) => {
            state.redirectUrl = action.payload;
            return state;
        },
        setPrivacyModalVisible: (state, action: PayloadAction<boolean>) => {
            state.showPrivacyPolicyModal = action.payload;
        },
        setLogout: state => {
            state = initialState;
            return state;
        },
    },
});

export const { loginSuccess, setLogout, setRedirectUrl, setPrivacyModalVisible } =
    loginSlice.actions;

export default loginSlice.reducer;
