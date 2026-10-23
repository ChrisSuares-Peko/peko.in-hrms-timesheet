import { SuccessGenericResponse } from '@customtypes/general';
import { ApiClient } from '@src/services/config';

import { OnboardingScope } from './onboarding';
import { ReimbursementRecord } from '../types';

interface ReimbursementListQuery {
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
}

export interface RequestReimbursementBody {
    amount: number;
    expenseDate: string;
    expenseDetails?: string;
    // Uploaded by the backend's reimbursementFilesUpload middleware into a real
    // URL before the controller runs — never persisted as raw base64.
    supportingDocs?: { base64: string; format: string };
}

const base = ({ userType, userId }: OnboardingScope) => `${userType}/${userId}/payroll`;

export const getMyReimbursements = async (
    scope: OnboardingScope,
    query: ReimbursementListQuery = {}
): Promise<{ records: ReimbursementRecord[]; total: number } | false> => {
    try {
        const params = new URLSearchParams();
        Object.entries(query).forEach(([key, value]) => {
            if (value !== undefined && value !== '') params.append(key, String(value));
        });
        const qs = params.toString() ? `?${params.toString()}` : '';

        const resp: SuccessGenericResponse<{ records: ReimbursementRecord[]; total: number }> =
            await ApiClient.get(`${base(scope)}/reimbursement-requests${qs}`);
        return resp.data;
    } catch (err) {
        return false;
    }
};

export const requestReimbursementApi = async (
    scope: OnboardingScope,
    body: RequestReimbursementBody
): Promise<ReimbursementRecord> => {
    const resp: SuccessGenericResponse<ReimbursementRecord> = await ApiClient.post(
        `${base(scope)}/reimbursement-requests`,
        body
    );
    return resp.data;
};

/** PROTOTYPE-SETUP (My team, Slice 2): update a claim that was sent back and send it again (to the manager first). */
export const resubmitReimbursementApi = async (
    scope: OnboardingScope,
    reimbursementId: string,
    body: { amount: number; date: string; description: string }
): Promise<ReimbursementRecord> => {
    const resp: SuccessGenericResponse<ReimbursementRecord> = await ApiClient.post(
        `${base(scope)}/reimbursement-requests/${reimbursementId}/resubmit`,
        body
    );
    return resp.data;
};

export const cancelReimbursementApi = async (
    scope: OnboardingScope,
    reimbursementId: string
): Promise<ReimbursementRecord> => {
    const resp: SuccessGenericResponse<ReimbursementRecord> = await ApiClient.patch(
        `${base(scope)}/reimbursement-requests/${reimbursementId}/cancel`
    );
    return resp.data;
};
