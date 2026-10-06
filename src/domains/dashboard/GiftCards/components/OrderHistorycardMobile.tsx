import React from 'react';

import { Card, Flex, Divider, Typography } from 'antd';

import { formattedDateTime } from '@utils/dateFormat';
import formatString from '@utils/wordFormat';

interface HistoryCardProps {
    item: {
        txnId: string;
        date: string;

        paymentMode: string;
        status: string;
        giftCardName: string;
        amount: string;
    };
}
const formatDate = (date: string) => formattedDateTime(new Date(date));
const formatStrings = (text: string) => formatString(text);

const OrderHistorycardMobile: React.FC<HistoryCardProps> = ({ item }) => (
    <Card size="small" className="mt-4 h-50 bg-slate-50 border-none p-2">
        <Flex className="w-full" gap={5} vertical>
            <Flex className="w-full" justify="space-between" align="center">
                <Typography.Text className="text-base font-medium text-gray-500 line-clamp-1">
                    {item.giftCardName}
                </Typography.Text>
                <Flex
                    className={`text-sm p-1 px-4 rounded-md font-medium border ${item.status.toLowerCase() === 'failure' ? 'text-red-400 border-red-400' : 'text-green-400 border-green-400'}`}
                >
                    {formatStrings(item.status)}
                </Flex>
            </Flex>
            <Divider />
            <Flex className="w-full" justify="space-between" align="center">
                <Typography.Text className="text-base font-medium text-gray-500 line-clamp-1">
                    Order ID:
                </Typography.Text>
                <Typography.Text className="font-normal text-center text-textDarkGray line-clamp-1">
                    {item.txnId}
                </Typography.Text>
            </Flex>
            <Flex className="w-full" justify="space-between" align="center">
                <Typography.Text className="text-base font-medium text-gray-500 line-clamp-1">
                    Date
                </Typography.Text>
                <Typography.Text className="font-normal text-center text-textDarkGray line-clamp-1">
                    {formatDate(item.date)}
                </Typography.Text>
            </Flex>
            <Flex className="w-full" justify="space-between" align="center">
                <Typography.Text className="text-base font-medium text-gray-500 line-clamp-1">
                    PaymentMode
                </Typography.Text>
                <Typography.Text className="font-normal text-center text-textDarkGray line-clamp-1">
                    {formatStrings(item.paymentMode)}
                </Typography.Text>
            </Flex>
            <Flex className="w-full" justify="space-between" align="center">
                <Typography.Text className="text-base font-medium text-gray-500 line-clamp-1">
                    Amount:
                </Typography.Text>
                <Typography.Text className="font-normal text-center text-textDarkGray line-clamp-1">
                    ₹ {Number(item.amount).toFixed(2)}
                </Typography.Text>
            </Flex>
        </Flex>
    </Card>
);

export default OrderHistorycardMobile;
