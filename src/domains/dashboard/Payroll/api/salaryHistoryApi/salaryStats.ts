import { SuccessGenericResponse } from '@customtypes/general';
import { ApiClient } from '@src/services/config';

import { SalaryStatsPayload, SalaryStatsResponse } from '../../types/salaryStats';

export const getSalaryStats = async (payload: SalaryStatsPayload): Promise<SalaryStatsResponse | false> => {
    try {
        const res: SuccessGenericResponse<SalaryStatsResponse> = await ApiClient.get(
            `${payload.userType}/${payload.userId}/payroll/salary-history/stats`,
            {
                params: {
                    year: payload.year,
                    status: payload.status,
                    page: payload.page,
                    limit: payload.limit,
                    ...(payload.searchText ? { searchText: payload.searchText } : {}),
                },
            }
        );
        return res.data;
    } catch (error) {
        return false;
    }
};
