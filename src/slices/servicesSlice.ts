import { PayloadAction, createSlice } from '@reduxjs/toolkit';

import { ServicesListResponse } from '@customtypes/general';
import { staticCorporateServiceAccess } from '@utils/staticCorporateServiceAccess';

interface ApiState {
    services: ServicesListResponse | null;
    /**
     * True when the services fetch FAILED, as opposed to succeeding with nothing.
     *
     * The two are not the same and must never be collapsed: an empty list is an authoritative "this account
     * has no services", which the access guard is entitled to refuse on. A failed fetch says nothing about
     * entitlement, and refusing on it renders a transient error — or an unaccepted privacy policy — as
     * "Sorry, you do not have permission to access this page".
     */
    servicesLoadFailed: boolean;
}

const initialState: ApiState = {
    // PROTOTYPE-SETUP: seed with the static catalogue (every service hasAccess: true) so useUserInfo
    // never calls getUserServices and the access guards have data on first render.
    services: { data: staticCorporateServiceAccess },
    servicesLoadFailed: false,
};

export const userSlice = createSlice({
    name: 'services',
    initialState,
    reducers: {
        setServices: (state, action: PayloadAction<Partial<ApiState>>) => {
            state = { ...state, ...action.payload };
            return state;
        },
    },
});

export const { setServices } = userSlice.actions;

export default userSlice.reducer;
