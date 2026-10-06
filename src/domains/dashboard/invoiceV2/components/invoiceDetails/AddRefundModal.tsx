import { Button, Flex, Form, Modal, Typography } from 'antd';
import dayjs from 'dayjs';
import { FormikProvider, useFormik } from 'formik';
import * as Yup from 'yup';

import DatePickerInput from '@components/atomic/inputs/DatePickerInput';
import InputTextArea from '@components/atomic/inputs/InputTextArea';
import SelectInput from '@components/atomic/inputs/SelectInput';
import TextInput from '@components/atomic/inputs/TextInput';

import { PAYMENT_MODE_OPTIONS } from '../../constants/settings';

export interface AddRefundValues {
    amount: string;
    refundMode: string;
    refundDate: string;
    referenceId: string;
    notes: string;
}

interface Props {
    open: boolean;
    maxAmount: number;
    saving: boolean;
    onClose: () => void;
    onSave: (values: AddRefundValues) => Promise<boolean>;
}

const buildSchema = (maxAmount: number) =>
    Yup.object({
        refundDate: Yup.string().required('Date is required'),
        amount: Yup.number()
            .typeError('Enter a valid amount')
            .positive('Amount must be greater than 0')
            .max(maxAmount, `Amount cannot exceed ₹${maxAmount}`)
            .required('Amount is required'),
        refundMode: Yup.string().required('Refund mode is required'),
        referenceId: Yup.string(),
        notes: Yup.string(),
    });

const AddRefundModal = ({ open, maxAmount, saving, onClose, onSave }: Props) => {
    const formik = useFormik<AddRefundValues>({
        initialValues: {
            amount: String(maxAmount),
            refundMode: '',
            refundDate: dayjs().format('YYYY-MM-DD'),
            referenceId: '',
            notes: '',
        },
        validationSchema: buildSchema(maxAmount),
        enableReinitialize: true,
        onSubmit: async values => {
            const ok = await onSave(values);
            if (ok) handleClose();
        },
    });

    const handleClose = () => {
        formik.resetForm();
        onClose();
    };

    return (
        <FormikProvider value={formik}>
            <Modal
                open={open}
                onCancel={handleClose}
                title={
                    <Typography.Text className="text-base font-semibold">
                        Record Refund
                    </Typography.Text>
                }
                footer={null}
                width={480}
                destroyOnClose
            >
                <Form layout="vertical" colon={false} className="mt-4">
                    <DatePickerInput
                        name="refundDate"
                        label="DATE"
                        placeholder="Select date"
                        isRequired
                        classes="w-full"
                        maxDate={dayjs()}
                    />

                    <TextInput
                        name="amount"
                        label="AMOUNT"
                        placeholder="0.00"
                        type="text"
                        isRequired
                        prefix="₹"
                        allowTwoDecimalsOnly
                    />
                    <Typography.Text className="text-xs text-gray-400 -mt-4 block mb-4">
                        {`Max refundable: ₹${maxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                    </Typography.Text>

                    <SelectInput
                        name="refundMode"
                        label="REFUND MODE"
                        placeholder="Select mode"
                        options={PAYMENT_MODE_OPTIONS}
                        isRequired
                    />

                    <TextInput
                        name="referenceId"
                        label="REFERENCE"
                        placeholder="Transaction ID / Cheque no."
                        type="text"
                        maxLength={30}
                    />

                    <InputTextArea
                        name="notes"
                        label="NOTE"
                        placeholder="Optional note"
                        autoSize={{ minRows: 3 }}
                        maxLength={50}
                    />

                    <Flex justify="flex-end" gap={8} className="mt-2">
                        <Button onClick={handleClose} disabled={saving}>
                            Cancel
                        </Button>
                        <Button
                            type="primary"
                            danger
                            onClick={() => formik.handleSubmit()}
                            loading={saving}
                        >
                            Save Refund
                        </Button>
                    </Flex>
                </Form>
            </Modal>
        </FormikProvider>
    );
};

export default AddRefundModal;
