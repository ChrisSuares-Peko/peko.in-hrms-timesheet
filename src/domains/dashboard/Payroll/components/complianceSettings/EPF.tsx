import React from 'react';

import { InfoCircleOutlined } from '@ant-design/icons';
import { Button, Col, Flex, Form, Row, Skeleton, Tooltip, Typography } from 'antd';
import { Formik } from 'formik';

import SelectInput from '@components/atomic/inputs/SelectInput';
import TextInput from '@components/atomic/inputs/TextInput';

import useAddEpfSettingsApi from '../../hooks/complianceSettings/useAddEpfSettingsApi';
import { payrollEPFSchema } from '../../schema/EmployeeSalary';
import InfoCard from '../organizationSettings/InfoCard';

const { Text } = Typography;

type EPFProps = {
    setActiveTabKey?: any;
    complianceData?: any;
};

const pfWagesPolicyOptions = [
    {
        label: '12% of Basic salary, capped at the statutory PF wage ceiling',
        value: 'CAPPED_15000',
    },
    {
        label: '12% of Basic salary, no cap (full Basic Salary)',
        value: 'FULL_BASIC',
    },
];

const EPF: React.FC<EPFProps> = ({ setActiveTabKey, complianceData }) => {
    const isLoading = false;

    const { handleSaveEpfData, nextStep } = useAddEpfSettingsApi();

    return isLoading ? (
        <Skeleton />
    ) : (
        <Flex vertical gap={20} className="pt-6">
            <Formik
                initialValues={{
                    epfNumber: complianceData?.epf?.epfNumber || '',
                    pfWagesPolicy: complianceData?.epf?.pfWagesPolicy || 'CAPPED_15000',
                    enableProRatedPfWage: complianceData?.epf?.enableProRatedPfWage || true,
                    considerSalaryComponents: complianceData?.epf?.considerSalaryComponents || true,
                }}
                enableReinitialize
                validationSchema={payrollEPFSchema}
                onSubmit={async values => {
                    await handleSaveEpfData(values);
                    if (nextStep) setActiveTabKey('2');
                }}
            >
                {({ handleSubmit }) => (
                    <Form layout="vertical" onFinish={handleSubmit}>
                        <Row gutter={[24, 24]}>
                            {/* Form Fields */}
                            <Col xs={24} md={16}>
                                <Row gutter={[20, 8]}>
                                    <Col xs={24} md={12}>
                                        <TextInput
                                            isRequired
                                            showToolTip
                                            tooltipText="EPF Establishment Code format: State/Region/Establishment Code/Extension/Employee Number (e.g., TN/MAS/0054321/000/0000456)"
                                            name="epfNumber"
                                            placeholder="e.g. MHBAN0045761000"
                                            label="EPF Establishment Code"
                                            type="text"
                                            allowAlphabetsNumberAndSpecialCharacters={['/']}
                                            convertToUppercase
                                            maxLength={30}
                                        />
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <SelectInput
                                            name="pfWagesPolicy"
                                            placeholder="Select PF wages policy"
                                            label="PF Wages Policy"
                                            showToolTip
                                            tooltipText="Decides whether EPF contributions are computed on the statutory PF wage ceiling (₹15,000/month through August 2026, ₹25,000/month from September 2026) or on the employee's full Basic Salary. Contribution rates themselves are fixed by statute."
                                            options={pfWagesPolicyOptions}
                                            isRequired
                                        />
                                    </Col>
                                    <Col xs={24}>
                                        <Text type="secondary">
                                            Contribution rates are fixed by statute
                                            <Tooltip title="Employee: 12% of PF wages (A/c 1). Employer: split across EPS/Pension (8.33%, A/c 10), Employer EPF (balance of the 12%, A/c 1), EDLI (0.5%, A/c 21) and Admin Charges (0.5%, A/c 2). These rates cannot be changed here.">
                                                <InfoCircleOutlined style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12, marginLeft: 5 }} />
                                            </Tooltip>
                                        </Text>
                                    </Col>
                                </Row>
                                <Flex className="mt-2" gap={10}>
                                    <Button className="px-4" type="primary" danger htmlType="submit">
                                        Save
                                    </Button>
                                </Flex>
                            </Col>
                            <Col xs={24} md={8}>
                                <InfoCard
                                    title="Why Is EPF Important?"
                                    description={`EPF ensures that employees save a portion of their salary every month for future financial security, such as retirement or emergencies.

As an employer, setting up EPF is legally required for companies with more than 20 employees and helps you stay compliant with Indian labor laws.

The PF wages policy decides whether contributions are computed on the statutory PF wage ceiling — ₹15,000/month through August 2026, ₹25,000/month from September 2026 (the most common setup, and what your offer letters use) — or on the employee's full Basic salary.`}
                                />
                            </Col>
                        </Row>
                    </Form>
                )}
            </Formik>
        </Flex>
    );
};

export default EPF;
