import React from 'react';

import { Alert, Form } from 'antd';
import { useFormikContext } from 'formik';

import SelectInput from '@components/atomic/inputs/SelectInput';
import TextInput from '@components/atomic/inputs/TextInput';

import { useGetSalaryComponent } from '../../../hooks/OrganizationSettings/useGetCurrentSalaryCompApi';
import {
    basicSalaryCalculationBasis,
    salaryAmountCategories,
    salaryCalculationBasis,
    salaryCompStatus,
} from '../../../utils/orgSettings/data';

interface SalaryComponent {
    id: string;
    componentName: string;
    calculationType: 'FIXED' | 'PERCENTAGE' | 'BALANCING';
    calculationBasis?: 'COMPONENT' | 'BASIC_SALARY' | 'GROSS_SALARY';
    calculationBasedOn?: string;
    amountPercentage?: string | number;
    status: string;
    isGlobal?: boolean;
}

interface SalaryCompFormProps {
    selectedRecordData?: SalaryComponent | null;
}

const SalaryCompForm = ({ selectedRecordData }: SalaryCompFormProps) => {
    const { values, setFieldValue, setFieldTouched, validateField } = useFormikContext<any>();
    const prevCalcType = React.useRef(values.calculationType);

    React.useEffect(() => {
        // Only reset if calculationType actually changed
        if (prevCalcType.current && prevCalcType.current !== values.calculationType) {
            setFieldValue('amountPercentage', '');
            setFieldTouched('amountPercentage', true, false);
            validateField('amountPercentage');

            if (values.calculationType !== 'PERCENTAGE') {
                setFieldValue('calculationBasedOn', '');
                setFieldValue('calculationBasis', '');
            } else {
                const isBasic = values.componentName?.trim().toLowerCase() === 'basic salary';
                setFieldValue('calculationBasis', isBasic ? 'GROSS_SALARY' : 'COMPONENT');
            }
        }

        prevCalcType.current = values.calculationType;
    }, [values.calculationType, setFieldValue, setFieldTouched, validateField, values.componentName]);

    const prevCalcBasis = React.useRef(values.calculationBasis);
    React.useEffect(() => {
        if (prevCalcBasis.current && prevCalcBasis.current !== values.calculationBasis) {
            if (values.calculationBasis !== 'COMPONENT') {
                setFieldValue('calculationBasedOn', '');
            }
        }
        prevCalcBasis.current = values.calculationBasis;
    }, [values.calculationBasis, setFieldValue]);

    const { data, generateSalaryCompDropdown } = useGetSalaryComponent();
    const filteredCalculationBasisOptions = React.useMemo(() => {
        const options = generateSalaryCompDropdown(data) || [];

        if (!selectedRecordData?.componentName) {
            return options;
        }

        const selectedName = selectedRecordData.componentName.toLowerCase();

        return options.filter(option => {
            const optionValue = option.label?.toLowerCase();

            const isMatch = optionValue === selectedName;

            return !isMatch;
        });
    }, [data, selectedRecordData, generateSalaryCompDropdown]);

    const isBasicSalary = values.componentName?.trim().toLowerCase() === 'basic salary';
    // A Balancing component absorbs whatever remains of Gross — every org needs exactly
    // one, but only one. Once it exists, it's never something a user adds again, and never
    // something an existing FIXED/PERCENTAGE component converts into — so 'Balancing' drops
    // out of the options once the org already has one, unless this very row IS that
    // component (kept, but locked below — the only thing editable there is its name). An
    // org with no Balancing component yet (e.g. still being set up) still needs to be able
    // to add its first one.
    const hasBalancingComponent = (data || []).some(component => component.calculationType === 'BALANCING');
    const isEditingBalancing = selectedRecordData?.calculationType === 'BALANCING';
    const calculationTypeOptions =
        isEditingBalancing || !hasBalancingComponent
            ? salaryAmountCategories
            : (salaryAmountCategories || []).filter(option => option.value !== 'BALANCING');
    // Below 50% of Gross is a compliance concern, not something to block saving over —
    // this org-level default always resolves to a plain % of Gross (calculationBasis is
    // forced to GROSS_SALARY for Basic Salary above), so the check is direct. Matches the
    // identical non-blocking warning shown for the CTC Calculator/Revise Salary preview
    // and the per-employee Edit Basic Salary modal (calculateCtcBreakdown.ts).
    const belowFloorWarning =
        isBasicSalary &&
        values.calculationType === 'PERCENTAGE' &&
        Number(values.amountPercentage) > 0 &&
        Number(values.amountPercentage) < 50
            ? 'The Basic Salary is below 50% of Gross. You may not be compliant as per the labor codes. Please double check before proceeding.'
            : null;
    return (
        <Form layout="vertical">
            <TextInput
                name="componentName"
                type="text"
                placeholder="Enter component name"
                label="Component Name"
                allowAlphabetsAndSpecialCharacters={['/', '-', '_', '&']}
                maxLength={50}
                isRequired
                isDisabled={isBasicSalary}
            />

            <SelectInput
                name="calculationType"
                options={calculationTypeOptions}
                placeholder="Select calculation type"
                label="Calculation Type"
                isRequired
                isDisabled={isEditingBalancing}
            />
            {values.calculationType === 'FIXED' && (
                <TextInput
                    name="amountPercentage"
                    type="text"
                    placeholder="Enter amount "
                    label="Amount"
                    allowTwoDecimalsOnly
                    isRequired
                    maxLength={7}
                />
            )}
            {values.calculationType === 'PERCENTAGE' && (
                <TextInput
                    name="amountPercentage"
                    type="text"
                    placeholder="Enter percentage "
                    label="Percentage"
                    allowTwoDecimalsOnly
                    isRequired
                    maxLength={7}
                />
            )}
            {values.calculationType === 'PERCENTAGE' && (
                <SelectInput
                    name="calculationBasis"
                    options={(isBasicSalary ? basicSalaryCalculationBasis : salaryCalculationBasis) || []}
                    placeholder="Select calculation basis"
                    label="Calculation Basis"
                    isDisabled={isBasicSalary}
                    isRequired
                />
            )}
            {values.calculationType === 'PERCENTAGE' &&
                (values.calculationBasis === 'COMPONENT' || !values.calculationBasis) && (
                    <SelectInput
                        name="calculationBasedOn"
                        options={filteredCalculationBasisOptions}
                        placeholder="Select specific component"
                        label="Specific Component"
                        isRequired
                    />
                )}

            <SelectInput
                name="status"
                options={salaryCompStatus || []}
                placeholder="Select status"
                label="Status"
                isRequired
                isDisabled={values.componentName === 'Basic Salary'}
            />

            {belowFloorWarning && <Alert type="warning" showIcon message={belowFloorWarning} className="mb-4" />}
        </Form>
    );
};

export default SalaryCompForm;
