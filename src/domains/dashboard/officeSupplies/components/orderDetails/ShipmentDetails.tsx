import React from 'react';

import { Steps, Typography, Flex, Image } from 'antd';

import { useAppSelector } from '@src/hooks/store';

import Tracking from './Tracking';
import {
    NoteBookSVG,
    HandshakeSVG,
    PackageSVG,
    TruckSVG,
    NoteBookSuccessSVG,
    PackageSuccessSVG,
    TruckSuccessSVG,
    HandshakeSuccessSVG,
    TickSuccessSVG,
    TickSVG,
} from '../../assets/icons/order-status';

const { Title } = Typography;
const { Step } = Steps;

const stepIcons = [NoteBookSVG, PackageSVG, TickSVG, TruckSVG, HandshakeSVG];
const stepIconSuccess = [
    NoteBookSuccessSVG,
    PackageSuccessSVG,
    TickSuccessSVG,
    TruckSuccessSVG,
    HandshakeSuccessSVG,
];
const stepTitles = ['Order Pending', 'Order Placed', 'In Progress', 'Shipped', 'Delivered'];
const status = {
    PENDING: 0,
    CONFIRMED: 1,
    INPROGRESS: 2,
    SHIPPED: 3,
    DELIVERED: 4,
    COMPLETED: 4,
};

const ShipmentDetails: React.FC = () => {
    const orderDetails = useAppSelector(state => state.reducer.orderDetails.orderDetails);
    const orderStatus = orderDetails?.ecomOrderStatus ?? 'PENDING';
    const currentStep = status[orderStatus as keyof typeof status];
    const isCancelled = orderStatus === 'CANCELLED';
    return (
        <>
            {!isCancelled && (
                <Flex vertical>
                    <Title level={4} className="my-4">
                        Shipment Details
                    </Title>
                    <Steps
                        className="mt-6 sm:mt-14 mb-32"
                        current={currentStep}
                        progressDot
                        size="default"
                        labelPlacement="vertical"
                    >
                        {stepTitles.map((title, index) => (
                            <Step
                                status={currentStep < index ? 'wait' : 'finish'}
                                key={index}
                                title={
                                    <Flex>
                                        {currentStep < index ? (
                                            <Image
                                                preview={false}
                                                src={stepIcons[index]}
                                                alt="icon"
                                            />
                                        ) : (
                                            <Image
                                                preview={false}
                                                src={stepIconSuccess[index]}
                                                alt="icon"
                                            />
                                        )}
                                    </Flex>
                                }
                                description={
                                    <Typography.Text className="mt-4 text-xs font-medium">
                                        {title}
                                    </Typography.Text>
                                }
                            />
                        ))}
                    </Steps>
                    <Tracking />
                </Flex>
            )}
        </>
    );
};
export default ShipmentDetails;
