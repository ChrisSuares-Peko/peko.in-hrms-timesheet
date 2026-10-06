import { useState, useCallback, useEffect } from 'react';

import { useAppSelector } from '@src/hooks/store';

import { getSalaryDetailsByEmployeeId } from '../../../api/employeeSalaryApi/employeeSalary';
import {
    SalaryDetailsResponse,
    SalaryProfileEmployerContribution,
    SalaryProfileLineItem,
    SalaryProfileLwf,
    SalaryProfileTdsDetails,
} from '../../../types/salaryProfileTypes/employeeSalaryTable';

export type SalaryDetailsRow = {
    key: string;
    componentName: string;
    category: string;
    amount: number;
};

export type SalaryDetailsTotals = {
    totalEarnings: number;
    totalDeductions: number;
    netSalary: number;
};

const EMPTY_TOTALS: SalaryDetailsTotals = { totalEarnings: 0, totalDeductions: 0, netSalary: 0 };

export const useGetSalaryDetailsByEmployee = (
    employeeId?: string,
    month: number = new Date().getMonth() + 1,
    year: number = new Date().getFullYear()
) => {
    const { role, id } = useAppSelector(state => state.reducer.auth);
    const [salaryRows, setSalaryRows] = useState<SalaryDetailsRow[]>([]);
    const [status, setStatus] = useState('');
    const [totals, setTotals] = useState<SalaryDetailsTotals>(EMPTY_TOTALS);
    const [monthlyGrossSalary, setMonthlyGrossSalary] = useState<number | null>(null);
    const [monthlyCTC, setMonthlyCTC] = useState<number | null>(null);
    const [annualCTC, setAnnualCTC] = useState<number | null>(null);
    const [earnings, setEarnings] = useState<SalaryProfileLineItem[]>([]);
    const [deductions, setDeductions] = useState<SalaryProfileLineItem[]>([]);
    const [employerContributions, setEmployerContributions] = useState<SalaryProfileEmployerContribution[]>([]);
    const [lwf, setLwf] = useState<SalaryProfileLwf | null>(null);
    const [netSalary, setNetSalary] = useState<number>(0);
    const [tdsDetails, setTdsDetails] = useState<SalaryProfileTdsDetails | null>(null);
    const [tableLoading, setTableLoading] = useState<boolean>(true);
    const [notRecorded, setNotRecorded] = useState<boolean>(false);

    const resetState = () => {
        setSalaryRows([]);
        setTotals(EMPTY_TOTALS);
        setMonthlyGrossSalary(null);
        setMonthlyCTC(null);
        setAnnualCTC(null);
        setEarnings([]);
        setDeductions([]);
        setEmployerContributions([]);
        setLwf(null);
        setNetSalary(0);
        setTdsDetails(null);
        setNotRecorded(false);
    };

    const getSalaryDetails = useCallback(async () => {
        if (!employeeId) {
            resetState();
            setTableLoading(false);
            return;
        }

        setTableLoading(true);
        const response = (await getSalaryDetailsByEmployeeId({
            id: employeeId,
            month,
            year,
            userId: id,
            userType: role,
        })) as SalaryDetailsResponse | false;

        if (response) {
            const rows = (response.salaryRows || []).map((item, index) => ({
                key: `${item.componentName}-${index}`,
                componentName: item.componentName || '-',
                category: item.category || '-',
                amount: Number(item.amount || 0),
            }));
            setStatus(response.salaryStatus || '');
            setSalaryRows(rows);
            setTotals(response.totals || EMPTY_TOTALS);
            setMonthlyGrossSalary(response.monthlyGrossSalary ?? null);
            setMonthlyCTC(response.monthlyCTC ?? null);
            setAnnualCTC(response.annualCTC ?? null);
            setEarnings(response.earnings || []);
            setDeductions(response.deductions || []);
            setEmployerContributions(response.employerContributions || []);
            setLwf(response.lwf || null);
            setNetSalary(response.netSalary ?? response.totals?.netSalary ?? 0);
            setTdsDetails(response.tdsDetails || null);
            setNotRecorded(false);
        } else {
            resetState();
            // A month that hasn't been generated/paid yet has no Salary record at all —
            // distinct from a genuine fetch error, so the page can say so plainly instead
            // of just showing an empty table.
            setNotRecorded(true);
        }
        setTableLoading(false);
    }, [employeeId, id, month, role, year]);

    useEffect(() => {
        getSalaryDetails();
    }, [getSalaryDetails]);

    return {
        salaryRows,
        totals,
        tableLoading,
        getSalaryDetails,
        status,
        monthlyGrossSalary,
        monthlyCTC,
        annualCTC,
        earnings,
        deductions,
        employerContributions,
        lwf,
        netSalary,
        tdsDetails,
        notRecorded,
    };
};
