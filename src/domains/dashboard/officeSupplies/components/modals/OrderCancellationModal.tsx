import React, { useState } from 'react';

import { Modal, Form, Select, Input, Button, Typography, Row, Col } from 'antd';

import { Scope } from '@src/enums/enums';
import { useAppSelector } from '@src/hooks/store';

import CancelOtpModal from './CancelOtpModal';
import { getOtpOrderCancel } from '../../api/orderHistory';
import { orderCancellationReasons } from '../../utils/data';

interface OrderCancellationFormValues {
    reason: string;
    description: string;
    otp: string;
    scope: string;
}

interface OrderCancellationModalProps {
    visible: boolean;
    isLoading: boolean;
    onCancel: () => void;
    onSubmit: any;
}

const { Title, Paragraph } = Typography;
const { Option } = Select;

const OrderCancellationModal: React.FC<OrderCancellationModalProps> = ({
    visible,
    onCancel,
    onSubmit,
    isLoading,
}) => {
    const { id, role } = useAppSelector(state => state.reducer.auth);
    const [isOpen, setIsOpen] = useState(false);
    const [isOtpSending, setIsOtpSending] = useState(false);
    const [formValues, setFormValues] = useState<OrderCancellationFormValues | null>(null);

    const onFinish = async (values: OrderCancellationFormValues) => {
        setIsOtpSending(true);
        setFormValues(values);

        const resp = await getOtpOrderCancel({
            userId: id,
            userType: role,
            scope: Scope.EMAIL,
        });
        if (resp) {
            setIsOtpSending(false);
            setIsOpen(true);
        } else {
            setIsOtpSending(false);
            // Handle error if OTP request fails
        }
    };

    const handleOtpSubmit = async (otp: string) => {
        if (formValues) {
            const finalValues = { ...formValues, otp, scope: Scope.EMAIL };
            const response = await onSubmit(finalValues);
            if (response) {
                setIsOpen(false);
            }
        }
    };

    return (
        <>
            <Modal
                open={visible}
                title="Order Cancellation"
                onCancel={onCancel}
                footer={null}
                className="no-border-radius"
                destroyOnClose
            >
                <Title level={5} style={{ color: '#EA3639', marginTop: '10px' }}>
                    Are you sure you want to cancel your order?
                </Title>
                <Paragraph className="mt-4 text-base font-roboto">
                    Please Note: If your payment method is a bank account, please ensure that you
                    have updated your bank account information in your profile.
                </Paragraph>

                <Form<OrderCancellationFormValues>
                    onFinish={onFinish}
                    initialValues={{ reason: '', description: '' }}
                >
                    <Row gutter={16} className="mt-6">
                        <Col span={24}>
                            <Typography.Text className="text-base font-roboto">
                                Select a reason for your order cancellation
                            </Typography.Text>
                            <Form.Item
                                name="reason"
                                rules={[{ required: true, message: 'Please select a reason' }]}
                            >
                                <Select placeholder="Select a reason" className="rounded-non">
                                    {orderCancellationReasons.map((v, i) => (
                                        <Option key={i} value={v}>
                                            {v}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={24}>
                            <Typography.Text className="text-base font-roboto">
                                Description
                            </Typography.Text>
                            <Form.Item
                                name="description"
                                rules={[
                                    { required: true, message: 'Please provide a description' },
                                    {
                                        validator: (rule, value) => {
                                            if (value === '') {
                                                return Promise.resolve();
                                            }
                                            if (/^\s/.test(value)) {
                                                return Promise.reject(
                                                    new Error(
                                                        'Description cannot start with whitespace'
                                                    )
                                                );
                                            }
                                            if (value.length < 3) {
                                                return Promise.reject(
                                                    new Error(
                                                        'Description must be at least 3 characters'
                                                    )
                                                );
                                            }
                                            if (value.length > 200) {
                                                return Promise.reject(
                                                    new Error(
                                                        'Description must not accept more than 200 characters'
                                                    )
                                                );
                                            }
                                            if (/\s{2,}/.test(value)) {
                                                return Promise.reject(
                                                    new Error(
                                                        'Description cannot contain consecutive whitespaces'
                                                    )
                                                );
                                            }
                                            return Promise.resolve();
                                        },
                                    },
                                ]}
                            >
                                <Input.TextArea maxLength={200} rows={3} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row justify="end">
                        <Col>
                            <Form.Item>
                                <Button
                                    loading={isOtpSending}
                                    type="primary"
                                    htmlType="submit"
                                    className="rounded-sm bg-bgOrange2 font-extralight"
                                    style={{ borderRadius: '4px' }}
                                >
                                    Submit
                                </Button>
                                <Button
                                    onClick={onCancel}
                                    style={{ marginLeft: 8, borderRadius: '4px' }}
                                    className="rounded-sm"
                                >
                                    Cancel
                                </Button>
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>
            <CancelOtpModal
                zIndex={2000}
                isOpen={isOpen}
                isLoading={isLoading!}
                handleCancel={() => setIsOpen(false)}
                isOtpSending={isOtpSending}
                onResend={async () => {
                    setIsOtpSending(true);
                    await getOtpOrderCancel({
                        userId: id,
                        userType: role,
                        scope: Scope.EMAIL,
                    });
                    setIsOtpSending(false);
                }}
                handleSubmit={handleOtpSubmit}
                title="Confirmation"
            />
        </>
    );
};

export default OrderCancellationModal;
