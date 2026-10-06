import React from 'react';

import { Flex } from 'antd';
import dayjs from 'dayjs';

import CustomModalWithForm from '@components/molecular/modals/CustomModalWithForm';

import { useAddDeduction } from '../../hooks/employeeSalaryHooks/DeductionHooks/useAddDeductionApi';
import { useUpdateDeduction } from '../../hooks/employeeSalaryHooks/DeductionHooks/useUpdateDeductionApi';
import { payrollDeductionSchema, payrollEditDeductionSchema } from '../../schema/EmployeeSalary';
import {
    DeductionEditFormType,
    DeductionFormType,
    deductionTableType,
} from '../../types/salaryProfileTypes/deductionTypes';
import DeductionForm from '../Forms/DeductionForm';

type deductionModalProps = {
    open: boolean;
    handleCancel: () => void;
    selectedRecordData?: deductionTableType | null;
    reloadTable?: React.Dispatch<React.SetStateAction<boolean>>;
    employeeIdFromProfile?: string;
    month: number;
    year: number;
};

const DeductionModal = ({
    open,
    handleCancel,
    selectedRecordData,
    reloadTable,
    employeeIdFromProfile,
    month,
    year,
}: deductionModalProps) => {
    const { deductionAdd } = useAddDeduction(handleCancel);
    const { deductionUpdate } = useUpdateDeduction(handleCancel);

    return (
        <CustomModalWithForm
            modalTitle={selectedRecordData ? 'Edit Deduction' : 'Add Deduction'}
            open={open}
            handleCancel={handleCancel}
            handleFormSubmit={async (values: DeductionFormType | DeductionEditFormType) => {
                if (selectedRecordData) {
                    await deductionUpdate(
                        values as DeductionEditFormType,
                        selectedRecordData,
                        employeeIdFromProfile!
                    );
                } else {
                    // Anchors this new deduction to the month/year currently selected on the
                    // Employee Salary page — same convention the Edit form's own date picker
                    // already uses (today, if this is the current month; the 1st otherwise) —
                    // so it applies to that one salary month only, not every month going
                    // forward. Computed here rather than shown as a field: the Add form
                    // deliberately stays the simple 3-field form it's always been.
                    const startOfSelectedMonth = dayjs(`${year}-${month}-01`).startOf('month');
                    const isCurrentMonth = dayjs().month() + 1 === month && dayjs().year() === year;
                    const deductionDate = (isCurrentMonth ? dayjs() : startOfSelectedMonth).format('YYYY-MM-DD');
                    await deductionAdd({ ...(values as DeductionFormType), deductionDate });
                }
                if (reloadTable) reloadTable(p => !p);
            }}
            initialValues={{
                employeeId: selectedRecordData?.employeeId || employeeIdFromProfile || '',
                deductionName: '',
                amountPercentage: '',
                deductionDate: selectedRecordData?.deductionDate || '',
                deductionType: selectedRecordData?.deductionType || '',
                deductionAmount: selectedRecordData?.deductionAmount || '',
            }}
            reinitialise
            validationSchema={selectedRecordData ? payrollEditDeductionSchema : payrollDeductionSchema}
        >
            <Flex vertical className="w-full">
                <DeductionForm
                    year={year}
                    month={Number(month)}
                    selectedRecordData={selectedRecordData}
                    employeeIdFromProfile={employeeIdFromProfile}
                />
            </Flex>
        </CustomModalWithForm>
    );
};

export default DeductionModal;
