import React from 'react';

import { Modal, Form, Select, Input, Button, Typography, Row, Col } from 'antd';

import { useManageOrderApi } from '../../hooks/useManageOrderApi';
import { productReturnReasons } from '../../utils/data';

interface ProductReturnFormValues {
    reason: string;
    description: string;
}

interface ProductReturnModalProps {
    visible: boolean;
    productId: number;
    orderId: number;
    onCancel: () => void;
}

const { Title, Paragraph } = Typography;
const { Option } = Select;

const ProductReturnModal: React.FC<ProductReturnModalProps> = ({
    visible,
    onCancel,
    productId,
    orderId,
}) => {
    const { isLoading, productReturn } = useManageOrderApi();

    const onFinish = (values: ProductReturnFormValues) => {
        productReturn(orderId!, values.description, values.reason, productId);
        onCancel();
    };

    return (
        <Modal
            open={visible}
            title="Order Return"
            onCancel={onCancel}
            footer={null}
            className="no-border-radius"
        >
            <Title level={5} style={{ color: '#EA3639', marginTop: '10px' }}>
                Are you sure you want to return your order?
            </Title>
            <Paragraph className="font-roboto text-base mt-4">
                Please Note: If your payment method is a bank account, please ensure that you have
                updated your bank account information in your profile.
            </Paragraph>

            <Form<ProductReturnFormValues>
                onFinish={onFinish}
                initialValues={{ reason: '', description: '' }}
            >
                <Row gutter={16} className="mt-6">
                    <Col span={24}>
                        <Typography.Text className="font-roboto text-base">
                            Select a reason of your return
                        </Typography.Text>
                        <Form.Item
                            name="reason"
                            rules={[{ required: true, message: 'Please select a reason' }]}
                        >
                            <Select placeholder="Select a reason" className="rounded-non">
                                {productReturnReasons.map((v, i) => (
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
                        <Typography.Text className="font-roboto text-base">
                            Description
                        </Typography.Text>
                        <Form.Item
                            name="description"
                            rules={[{ required: true, message: 'Please provide a description' }]}
                        >
                            <Input.TextArea rows={3} />
                        </Form.Item>
                    </Col>
                </Row>

                <Row justify="end">
                    <Col>
                        <Form.Item>
                            <Button
                                loading={isLoading}
                                type="primary"
                                htmlType="submit"
                                className="bg-bgOrange2 rounded-sm font-extralight"
                            >
                                Submit
                            </Button>
                            <Button
                                onClick={onCancel}
                                style={{ marginLeft: 8 }}
                                className="rounded-sm"
                            >
                                Cancel
                            </Button>
                        </Form.Item>
                    </Col>
                </Row>
            </Form>
        </Modal>
    );
};

export default ProductReturnModal;
