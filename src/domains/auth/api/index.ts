import axios from 'axios';

import { SERVER_URL, FRONTEND_BASE_URL, PARTNER_ID } from '@src/config-global';
import { ApiClient } from '@src/services/config';
import { showToast } from '@src/slices/apiSlice';
import { store } from '@store/store';

import {
    EmailOtpVerifyPayload,
    EmailVerifyStatusPayload,
    ForgotPasswordRequest,
    LoginRequest,
    OtpRequest,
    PanGstPayload,
    PasswordExpryReset,
    RegistrationRequest,
    ResetPasswordRequest,
    TokenvalidityRequest,
    ValidateUserRequest,
} from '../types/index';

const partnerId = PARTNER_ID ? parseEnvVariable(PARTNER_ID) : undefined;
export const signIn = async (payload: LoginRequest) => {
    try {
        const resp = await axios.post(`${SERVER_URL}/user/login`, { ...payload, partnerId });

        const { data } = resp;
        return data.data;
    } catch (err) {
        const { data } = err.response;
        store.dispatch(showToast({ description: data.message, variant: 'error' }));
        if (typeof Moengage?.track_event === 'function') {
            Moengage.track_event('user_login', {
                status: 'failed',
                failure_reason: data.message,
            });
        }
        return false;
    }
};

export const oidcLogin = (service = '') => {
    const params = new URLSearchParams({ service, partnerId: partnerId ?? '' });
    window.location.href = `${SERVER_URL}/user/login?${params.toString()}`;
};

export const fetchConsent = async (payload: {
    client_id: string;
    user_id: string;
    scope: string;
}) => {
    try {
        const resp = await axios.get(`${SERVER_URL}/user/consent`, {
            params: {
                ...payload,
            },
        });
        const { data } = resp;
        return data.data;
    } catch (err) {
        const { data } = err.response;
        store.dispatch(showToast({ description: data.message, variant: 'error' }));
        return false;
    }
};

export const consentRequest = async (payload: { user: any; token: string }) => {
    try {
        const resp = await axios.post(`${SERVER_URL}/user/consent`, {
            ...payload,
            user: { id: payload.user?.id },
        });
        const { data } = resp;
        return data.data;
    } catch (err) {
        const { data } = err.response;
        store.dispatch(showToast({ description: data.message, variant: 'error' }));
        return false;
    }
};

export const ChangePassword = async (payload: PasswordExpryReset) => {
    try {
        const resp = await axios.post(`${SERVER_URL}/user/passwordExpiryReset`, payload);
        const { data } = resp;
        return data;
    } catch (err) {
        const { data } = err.response;
        store.dispatch(showToast({ description: data.message, variant: 'error' }));
        return false;
    }
};

export const signUp = async (payload: RegistrationRequest) => {
    try {
        const resp = await axios.post(`${SERVER_URL}/user/signUp`, {
            ...payload,
            registeredBy: partnerId,
        });
        const { data } = resp;
        return data.data;
    } catch (err) {
        const { data } = err.response;
        store.dispatch(showToast({ description: data.message, variant: 'error' }));
        return false;
    }
};

export const getOtp = async (payload: OtpRequest) => {
    try {
        const resp = await axios.post(`${SERVER_URL}/user/otp`, { ...payload, partnerId });
        const { data } = resp;
        return data;
    } catch (err) {
        const { data } = err.response;
        store.dispatch(showToast({ description: data.message, variant: 'error' }));
        return false;
    }
};
export const verifyEmailOtp = async (payload: EmailOtpVerifyPayload) => {
    try {
        const resp = await axios.post(`${SERVER_URL}/user/verify-emailOtp`, payload);
        const { data } = resp;
        return data;
    } catch (err) {
        const { data } = err.response;
        store.dispatch(showToast({ description: data.message, variant: 'error' }));
        return false;
    }
};
export const forgotPassword = async (payload: ForgotPasswordRequest) => {
    try {
        const payloadWithURL = {
            ...payload,
            baseUrl: FRONTEND_BASE_URL,
            partnerId,
        };
        const resp = await axios.post(`${SERVER_URL}/user/forgotPassword`, payloadWithURL);
        const { data } = resp;
        return data;
    } catch (err) {
        const { data } = err.response;
        store.dispatch(showToast({ description: data.message, variant: 'error' }));
        return false;
    }
};
export const ResetPassword = async (payload: ResetPasswordRequest) => {
    try {
        const resp = await axios.post(`${SERVER_URL}/user/resetPassword`, payload);
        const { data } = resp;
        return data;
    } catch (err) {
        const { data } = err.response;
        store.dispatch(showToast({ description: data.message, variant: 'error' }));
        return false;
    }
};

export const ValidateUser = async (payload: ValidateUserRequest) => {
    try {
        const resp = await axios.post(`${SERVER_URL}/user/validate`, {
            ...payload,
            registeredBy: partnerId,
        });
        const { data } = resp;
        if (data) return data;
        return false;
    } catch (err) {
        const { data } = err.response;
        store.dispatch(showToast({ description: data.message, variant: 'error' }));
        return false;
    }
};

export const verifyEmailStatus = async (payload: EmailVerifyStatusPayload) => {
    try {
        const resp = await axios.post(`${SERVER_URL}/user/validate-email`, payload);
        const { data } = resp;
        return data;
    } catch (err) {
        const { data } = err.response;
        store.dispatch(showToast({ description: data.message, variant: 'error' }));
        return false;
    }
};

export const getPasswordPolicies = async (username: any) => {
    try {
        const resp = await axios.post(`${SERVER_URL}/user/password-policy/passwordPolicies`, {
            username,
        });

        const { data } = resp;
        return data;
    } catch (err) {
        return false;
    }
};

export const checkTokenApi = async (payload: TokenvalidityRequest) => {
    try {
        const resp = await axios.post(`${SERVER_URL}/user/checkTokenValidity`, payload);
        const { data } = resp;
        return data;
    } catch (err) {
        const { data } = err.response;
        store.dispatch(showToast({ description: data.message, variant: 'error' }));
        return false;
    }
};

export const verifyPanGST = async (payload: PanGstPayload) => {
    try {
        const resp = await axios.post(`${SERVER_URL}/user/verify-tax-id`, {
            ...payload,
        });
        const { data } = resp;
        return data;
    } catch (err) {
        const { data } = err.response;
        store.dispatch(showToast({ description: data.message, variant: 'error' }));
        return false;
    }
};

export const saveDoc = async (payload: PanGstPayload) => {
    try {
        const resp = await axios.post(`${SERVER_URL}/user/saveDocs`, {
            ...payload,
        });
        const { data } = resp;
        return data;
    } catch (err) {
        const { data } = err.response;
        store.dispatch(showToast({ description: data.message, variant: 'error' }));
        return false;
    }
};

export const verifyOtpForPanGst = async (payload: {
    mobileNo: string;
    otp: string;
    identifier: string;
}) => {
    try {
        const resp = await axios.post(`${SERVER_URL}/user/verify-otp-pan-gst`, {
            ...payload,
            partnerId,
        });
        const { data } = resp;
        return data;
    } catch (err) {
        const { data } = err.response;
        store.dispatch(showToast({ description: data.message, variant: 'error' }));
        return false;
    }
};

function parseEnvVariable(value: string) {
    if (value === 'null') {
        return null;
    }
    return value;
}
export const fetchStateOptions = async (): Promise<{ label: string; value: string }[] | false> => {
    try {
        const resp = await axios.get(`${SERVER_URL}/user/general/indian-states`);
        return resp.data?.data?.states ?? false;
    } catch {
        return false;
    }
};

export const getEnforcePrivacyPolicy = async () => {
    try {
        const resp = await axios.get(`${SERVER_URL}/user/privacy-policy-details/enforcement`, {
            params: { partnerId },
        });
        const { data } = resp;
        return data;
    } catch (err) {
        const { data } = err.response;
        store.dispatch(showToast({ description: data.message, variant: 'error' }));
        return false;
    }
};

export const getPrivacyPolicyDetails = async () => {
    try {
        const resp = await axios.get(`${SERVER_URL}/user/privacy-policy-details`);
        const { data } = resp;
        return data;
    } catch (err) {
        const { data } = err.response;
        store.dispatch(showToast({ description: data.message, variant: 'error' }));
        return false;
    }
};

export const getUserPrivacyPolicies = async () => {
    try {
        const resp: any = await ApiClient.get(`user/privacy-policy`);
        return resp?.data ?? false;
    } catch (err) {
        return false;
    }
};

export const acceptPrivacyPolicy = async (policyIds: Record<number, boolean>) => {
    try {
        const res: any = await ApiClient.post(`user/privacy-policy`, { policyIds });
        return res;
    } catch (error: any) {
        return false;
    }
};

export type AvailableRole = { role: 'corporate' | 'user'; roleName: string; id: number };

// Identities (corporate / self-linked employee) the current credential can switch between.
export const getAvailableRoles = async (): Promise<AvailableRole[]> => {
    try {
        const resp: any = await ApiClient.get('user/available-roles');
        return resp?.data?.roles ?? [];
    } catch {
        return [];
    }
};

// Switch the current session into another identity owned by the same credential
// (corporate <-> employee), without re-entering a password.
export const switchRole = async (role: 'corporate' | 'user') => {
    try {
        const resp: any = await ApiClient.post('user/switch-role', { role });
        return resp?.data ?? false;
    } catch (err: any) {
        store.dispatch(
            showToast({
                description: err?.response?.data?.message || 'Failed to switch role.',
                variant: 'error',
            })
        );
        return false;
    }
};
