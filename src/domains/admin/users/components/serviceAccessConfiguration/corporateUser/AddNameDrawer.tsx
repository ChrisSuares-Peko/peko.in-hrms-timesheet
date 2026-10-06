import { ClusterOutlined } from '@ant-design/icons';
import { Button, Drawer, Flex, Form, Typography } from 'antd';
import { Formik } from 'formik';
import * as Yup from 'yup';

import SelectInput from '@components/atomic/inputs/SelectInput';
import TextInput from '@components/atomic/inputs/TextInput';

import { ServiceOperatorOption } from '../../../types/systemUserTypes';

interface AddNameForm {
    label: string;
    serviceOperator?: string;
}

export interface SelectedOperator {
    serviceProviderId: number;
    accessKey: string;
}

interface AddNameDrawerProps {
    open: boolean;
    /** e.g. "Service" or "Sub-service" — drives titles, labels and validation copy. */
    entity: string;
    parentLabel?: string;
    placeholder?: string;
    operators: ServiceOperatorOption[];
    operatorLoading?: boolean;
    /** When set, the drawer is in edit mode and prefills these values. */
    isEdit?: boolean;
    initialLabel?: string;
    initialOperatorValue?: string;
    onClose: () => void;
    // operator is undefined when none selected (or cleared).
    onSubmitValue: (label: string, operator?: SelectedOperator) => void;
}

// Indigo-themed drawer for the Corporate User Configuration page. Adds/edits a name and
// an optional service operator; when an operator is chosen its id + accessKey are stored
// on the node (serviceProviderId / accessKey).
const AddNameDrawer = ({
    open,
    entity,
    parentLabel,
    placeholder,
    operators,
    operatorLoading,
    isEdit = false,
    initialLabel = '',
    initialOperatorValue,
    onClose,
    onSubmitValue,
}: AddNameDrawerProps) => {
    const schema = Yup.object().shape({
        label: Yup.string()
            .trim()
            .required(`${entity} name is required`),
    });
    const actionText = isEdit ? 'Save' : `Add ${entity}`;

    return (
        <Formik<AddNameForm>
            initialValues={{ label: initialLabel, serviceOperator: initialOperatorValue }}
            validationSchema={schema}
            enableReinitialize
            onSubmit={(values, { resetForm }) => {
                const operator = operators.find(op => op.value === values.serviceOperator);
                onSubmitValue(
                    values.label.trim(),
                    operator
                        ? { serviceProviderId: Number(operator.value), accessKey: operator.accessKey }
                        : undefined
                );
                resetForm();
                onClose();
            }}
        >
            {({ handleSubmit, resetForm }) => {
                const handleClose = () => {
                    resetForm();
                    onClose();
                };
                return (
                    <Drawer
                        open={open}
                        onClose={handleClose}
                        width={440}
                        destroyOnClose
                        title={
                            <Flex align="center" gap={10}>
                                <Flex
                                    align="center"
                                    justify="center"
                                    className="h-9 w-9 rounded-xl bg-red-50 text-lg text-brandColor"
                                >
                                    <ClusterOutlined />
                                </Flex>
                                <Flex vertical>
                                    <Typography.Text strong className="text-base">
                                        {isEdit ? `Edit ${entity}` : `Add ${entity}`}
                                    </Typography.Text>
                                    {parentLabel && (
                                        <Typography.Text type="secondary" className="text-xs">
                                            under “{parentLabel}”
                                        </Typography.Text>
                                    )}
                                </Flex>
                            </Flex>
                        }
                        footer={
                            <Flex justify="flex-end" gap={10}>
                                <Button onClick={handleClose} className="px-5">
                                    Cancel
                                </Button>
                                <Button
                                    type="primary"
                                    danger
                                    className="px-6"
                                    onClick={() => handleSubmit()}
                                >
                                    {actionText}
                                </Button>
                            </Flex>
                        }
                    >
                        <Form layout="vertical" onFinish={() => handleSubmit()}>
                            <TextInput
                                isRequired
                                name="label"
                                label={`${entity} Name`}
                                type="text"
                                placeholder={placeholder || `Enter ${entity.toLowerCase()} name`}
                                maxLength={60}
                                classes="rounded-sm"
                            />
                            <SelectInput
                                name="serviceOperator"
                                label="Service Operator"
                                placeholder="Select a service operator (optional)"
                                options={operators}
                                // loading={operatorLoading}
                                showSearch
                                allowClear
                                filterOption
                                // SelectInput renders children-based <Select.Option>, which rc-select
                                // converts to { value, children } with no `label` key — without this,
                                // the default filter matches against `value` (the operator id), not
                                // the visible name, so typing a name never matches anything.
                                optionFilterProp="children"
                                // notFoundContent="No operators found"
                            />
                        </Form>
                    </Drawer>
                );
            }}
        </Formik>
    );
};

export default AddNameDrawer;
