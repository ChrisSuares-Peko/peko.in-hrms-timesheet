// components/OrderProductDetails.tsx
import React, { useState } from 'react';

import { Typography, Row, Col, Flex, Button, Space, Divider } from 'antd';
import { saveAs } from 'file-saver';

import { useAppDispatch, useAppSelector } from '@src/hooks/store';
import useScreenSize from '@src/hooks/useScreenSize';
import { showToast } from '@src/slices/apiSlice';
import { formatNumberWithLocalString } from '@utils/priceFormat';

import CancelledSection from './CancelledSection';
import ProductListingLG from './ProductListingLG';
import ProductsListingSm from './ProductsListingSm';
import { useManageOrderApi } from '../../hooks/useManageOrderApi';
import OrderCancellationModal from '../modals/OrderCancellationModal';

const { Title, Text } = Typography;

const OrderProductDetails: React.FC = () => {
    const screens = useScreenSize();
    const dispatch = useAppDispatch();
    const { isLoading, cancelOrder, downloadInvoice } = useManageOrderApi();
    const orderDetails = useAppSelector(state => state.reducer.orderDetails.orderDetails);
    const orderId = orderDetails?.id!;
    const orderStatus = orderDetails?.ecomOrderStatus || 'PENDING';
    const [IsCancelRequested, setIsCancelRequested] = useState<boolean>(
        orderDetails?.workspaceOrderStatus === 'Cancel Requested'
    );
    const isCancelled = orderStatus === 'CANCELLED';
    const isCancelRejected = orderDetails?.workspaceOrderStatus === 'Cancel rejected';
    const isDelivered = ['COMPLETED', 'DELIVERED'].includes(orderStatus);

    const shippingFee = formatNumberWithLocalString(orderDetails?.shippingFee || 0);
    const convenienceFee = formatNumberWithLocalString(orderDetails?.surcharge || 0);

    const [isCancellationModalVisible, setCancellationModalVisible] = React.useState(false);
    const handleCancellationSubmit = async (values: {
        reason: string;
        description: string;
        otp: string;
        scope: string;
    }) => {
        const result = await cancelOrder(
            orderId!,
            values.description,
            values.reason,
            values.otp,
            values.scope
        );
        if (result) {
            setCancellationModalVisible(false);
            setIsCancelRequested(!IsCancelRequested);
            return true;
        }
        // setIsCancelRequested(!IsCancelRequested);
        return false;
    };

    const handleDownloadInvoice = async (id: number) => {
        try {
            const res = await downloadInvoice(id);
            if (res) {
                const uint8Array = new Uint8Array(res.data.data);
                const blob = new Blob([uint8Array], { type: 'application/pdf' });
                saveAs(blob, 'invoice.pdf');
            }
        } catch (error) {
            dispatch(
                showToast({
                    description: 'Something went wrong while generating invoice',
                    variant: 'error',
                })
            );
        }
    };

    return (
        <Flex vertical>
            {isCancelled && <CancelledSection />}

            <Row>
                <Col span={24}>
                    <Title level={4}>Order Details</Title>

                    {screens.md ? <ProductListingLG /> : <ProductsListingSm />}

                    <Flex
                        className={`my-5 ${!screens.md && 'flex-col-reverse '}`}
                        gap={20}
                        align="baseline"
                    >
                        <Flex gap={11} flex={1} vertical className="w-full mb-5">
                            <Flex gap={11} justify="space-between">
                                <Space>
                                    <Typography.Text className="font-medium text-gray-900 ">
                                        Shipping:
                                    </Typography.Text>
                                </Space>
                                <Space>
                                    <Typography.Text className="font-medium text-gray-900 font-roboto">
                                        {shippingFee}
                                    </Typography.Text>
                                </Space>
                            </Flex>
                            <Flex gap={11} justify="space-between">
                                <Space>
                                    <Typography.Text className="font-medium text-gray-900 ">
                                        Platform fee:
                                    </Typography.Text>
                                </Space>
                                <Space>
                                    <Typography.Text className="font-medium text-gray-900 font-roboto">
                                        {convenienceFee}
                                    </Typography.Text>
                                </Space>
                            </Flex>
                            <Divider style={{ margin: '8px 0' }} />
                            <Flex justify="space-between">
                                <Space>
                                    <Typography.Text className="font-medium text-gray-900 ">
                                        Total
                                    </Typography.Text>
                                </Space>
                                <Space>
                                    <Typography.Text
                                        strong
                                        className="font-medium text-gray-900 font-roboto"
                                    >
                                        ₹ {formatNumberWithLocalString(orderDetails?.amountInINR)}
                                    </Typography.Text>
                                </Space>
                            </Flex>
                        </Flex>
                        <Flex flex={1} justify="end" className="w-full">
                            {!isDelivered && !isCancelled && (
                                <>
                                    {IsCancelRequested || isCancelRejected ? (
                                        <Text className="text-red-500 text-[1rem] font-normal">
                                            {isCancelRejected
                                                ? 'Your request for cancellation has been rejected'
                                                : 'You have requested for cancellation'}
                                        </Text>
                                    ) : (
                                        <Button onClick={() => setCancellationModalVisible(true)}>
                                            Request for Order Cancellation
                                        </Button>
                                    )}
                                </>
                            )}
                            {isDelivered && (
                                <Button
                                    loading={isLoading}
                                    onClick={() => handleDownloadInvoice(orderId)}
                                    className="rounded-lg"
                                >
                                    Download Invoice
                                </Button>
                            )}
                        </Flex>
                    </Flex>
                </Col>

                <OrderCancellationModal
                    isLoading={isLoading}
                    visible={isCancellationModalVisible}
                    onCancel={() => setCancellationModalVisible(false)}
                    onSubmit={handleCancellationSubmit}
                />
            </Row>
        </Flex>
    );
};

export default OrderProductDetails;
