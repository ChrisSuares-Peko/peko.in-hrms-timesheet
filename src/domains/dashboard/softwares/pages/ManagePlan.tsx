import React from 'react';

import { CloseCircleOutlined } from '@ant-design/icons';
import { Flex, Row, Typography } from 'antd';

import useManagePlan from '../hooks/order/useManagePlan';

type Props = {
    label?: string;
    value?: string;
};

const TextCard = ({ label, value }: Props) => (
    <Flex vertical gap={10}>
        {label && <Typography.Text className="text-gray-400 text-nowrap">{label}</Typography.Text>}
        <Typography.Text className="">{value}</Typography.Text>
    </Flex>
);

const ManagePlan = () => {
    const { order, handleCancelPlan, isLoading } = useManagePlan();

    return (
        <Flex
            className="flex-col w-full h-full p-8 border border-gray-200 border-solid md:flex-row rounded-2xl xs:bg-bgLightGray md:bg-white"
            justify="space-between"
            align="center"
        >
            <Flex className="flex flex-1">
                <Row gutter={[10, 20]} className="w-full">
                    <Row>
                        <Typography.Text className="text-xl font-medium">
                            {order?.productName}
                        </Typography.Text>
                    </Row>
                    <Row justify="start" className="w-full gap-16 xl:gap-32" gutter={[0, 30]}>
                        <TextCard label="Total Amount" value={`AED ${order?.totalAmount}`} />
                        <TextCard label="Status" value={order?.status} />
                        <TextCard label="Plan Started" value="25 Apr 2024" />
                        <TextCard label="Valid Until" value="25 Apr 2025" />
                        <TextCard label="Billed" value="Annually" />
                    </Row>
                </Row>
            </Flex>
            <Flex justify="end" vertical gap={20} align="center">
                <Typography.Text
                    onClick={!isLoading ? handleCancelPlan : undefined}
                    className={`text-red-700 mt-10 ${isLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}
                >
                    <CloseCircleOutlined className="pe-2" />
                    {isLoading ? 'Cancelling' : 'Cancel my plan'}
                </Typography.Text>
            </Flex>
        </Flex>
    );
};

export default ManagePlan;
