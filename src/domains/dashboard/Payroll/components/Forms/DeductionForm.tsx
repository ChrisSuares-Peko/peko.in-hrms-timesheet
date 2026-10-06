import React from 'react';

import { Form } from 'antd';
import dayjs from 'dayjs';

import DatePickerInput from '@components/atomic/inputs/DatePickerInput';
import SelectInputWithSearch from '@components/atomic/inputs/SelectInputWithSearch';
import TextInput from '@components/atomic/inputs/TextInput';

import { useGetEmployee } from '../../hooks/dashboardHooks/useGetEmployeeApi';
import { deductionTableType } from '../../types/salaryProfileTypes/deductionTypes';

interface deductionFormProps {
    selectedRecordData?: deductionTableType | null;
    employeeIdFromProfile?: string;
    month: number;
    year: number;
}

const DeductionForm = ({
    selectedRecordData,
    employeeIdFromProfile,
    month,
    year,
}: deductionFormProps) => {
    const { data, generateEmployeesDropdown } = useGetEmployee(month, year);

    if (selectedRecordData) {
        const endOfMonth = dayjs(`${year}-${month}-01`).endOf('month');
        const startOfMonth = dayjs(`${year}-${month}-01`).startOf('month');
        const minDate =
            dayjs().month() + 1 === month && dayjs().year() === year ? dayjs(new Date()) : startOfMonth;

        return (
            <Form layout="vertical">
                <DatePickerInput
                    label="Deduction Date"
                    placeholder="Select deduction date"
                    isRequired
                    name="deductionDate"
                    classes="w-full"
                    needConfirm={false}
                    minDate={minDate}
                    maxDate={endOfMonth}
                />
                <TextInput
                    name="deductionType"
                    label="Deduction Type"
                    type="text"
                    placeholder="Enter deduction type"
                    classes="rounded-sm"
                    allowAlphabetsAndSpaceOnly
                    maxLength={50}
                    isRequired
                />
                <TextInput
                    name="deductionAmount"
                    label="Deduction Amount"
                    type="text"
                    placeholder="Enter deduction amount"
                    classes="rounded-sm"
                    allowNumbersOnly
                    maxLength={6}
                    isRequired
                />
            </Form>
        );
    }

    return (
        <Form layout="vertical">
            {!employeeIdFromProfile ? (
                <SelectInputWithSearch
                    name="employeeId"
                    options={generateEmployeesDropdown(data) || []}
                    placeholder="Select employee"
                    label="Employee name"
                    isRequired
                    handleChange={() => {}}
                />
            ) : (
                ''
            )}

            <TextInput
                name="deductionName"
                label="Deduction Name"
                type="text"
                placeholder="Enter deduction name"
                classes="rounded-sm"
                isRequired
            />

            <TextInput
                name="amountPercentage"
                label="Amount"
                type="text"
                placeholder="Enter amount"
                classes="rounded-sm"
                allowNumbersOnly
                maxLength={6}
                isRequired
            />
        </Form>
    );
};

export default DeductionForm;
