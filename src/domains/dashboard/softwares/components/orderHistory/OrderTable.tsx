import { Table, Tag, Button, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';

import { paths } from '@src/routes/paths';

import { IOrderDetailsFilter } from '../../hooks/order/useOrderHistory';
import { IPurchaseItem } from '../../types/product';

const columns: ColumnsType<IPurchaseItem> = [
    {
        title: 'Purchased On',
        dataIndex: 'purchasedOn',
        key: 'purchasedOn',
    },
    {
        title: 'Product Name',
        dataIndex: 'productName',
        key: 'productName',
    },
    {
        title: 'Plan Name',
        dataIndex: 'planName',
        key: 'planName',
    },
    {
        title: 'Order ID',
        dataIndex: 'orderId',
        key: 'orderId',
    },
    {
        title: 'Payment Mode',
        dataIndex: 'paymentMode',
        key: 'paymentMode',
    },
    {
        title: 'Total Amount',
        dataIndex: 'totalAmount',
        key: 'totalAmount',
    },
    {
        title: 'Status',
        key: 'status',
        dataIndex: 'status',
        render: (status: string) => (
            <Tag color="green" style={{ borderRadius: 20, padding: '4px 12px' }}>
                {status}
            </Tag>
        ),
    },
    {
        title: 'Action',
        key: 'action',
        render: (_, record: IPurchaseItem) => (
            <Link to={paths.softwares.managePlan} state={{ order: record }}>
                <Button disabled danger type="default">
                    View
                </Button>
            </Link>
        ),
    },
];

type Props = {
    isLoading: boolean;
    orderDetails: IPurchaseItem[];
    handlePagination: (page: number, pageSize: number) => void;
    filter: IOrderDetailsFilter;
    total: number;
};

const OrderTable = ({ isLoading, orderDetails, handlePagination, filter, total }: Props) => (
    <>
        {' '}
        {!orderDetails.length ? (
            <Empty description="No Data" />
        ) : (
            <Table
                columns={columns}
                dataSource={orderDetails}
                loading={isLoading}
                pagination={{
                    current: filter.page,
                    pageSize: filter.limit,
                    total,
                    showSizeChanger: true,
                    onChange: handlePagination,
                }}
            />
        )}
    </>
);

export default OrderTable;
