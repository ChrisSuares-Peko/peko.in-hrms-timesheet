import { FC, useState } from 'react';

import { SearchOutlined } from '@ant-design/icons';
import { Card, Col, Flex, Input, Pagination, Row, Typography, Empty, Skeleton } from 'antd';

import OrderHistorycardMobile from './OrderHistorycardMobile';
import useFilter from '../hooks/useFilter';
import { useOrderHistoryTable } from '../hooks/useOrderHistoryTable';
import { filterState } from '../types/types';

interface HistoryTableMobileProps {
    searchText?: string | null;
}

const OrderHistoryTableMobile: FC<HistoryTableMobileProps> = ({ searchText }) => {
    const [filter, setFilter] = useState<filterState>({
        search: '',
        start: 1,
        length: 10,
        draw: 1,
        from: '',
        to: '',
    });
    const { handleSearch, handlePageChange } = useFilter({ setFilter });
    const { data, isLoading, count } = useOrderHistoryTable(
        filter.draw,
        filter.start,
        filter.length,
        filter.search
    );

    const renderSkeleton = () => <Skeleton active paragraph={{ rows: 3 }} />;

    let tableContent;
    if (isLoading) {
        tableContent = Array.from({ length: 10 }).map((_, index) => (
            <Card size="small" className="h-40 p-2 mt-4 border-none bg-slate-50" key={index}>
                <Flex className="w-full" gap={5} vertical>
                    {renderSkeleton()}
                </Flex>
            </Card>
        ));
    } else if (data.length === 0) {
        tableContent = <Empty description="No data available" />;
    } else {
        tableContent = data.map((item, index) => (
            <OrderHistorycardMobile key={index} item={item} /> // Use SubscriptionCard component
        ));
    }

    return (
        <Flex vertical gap={20} className="">
            <Row justify="space-between" align="middle" gutter={[20, 20]}>
                <Col xs={24} sm={12} md={6}>
                    <Typography.Text className="text-lg font-medium xl:text-xl lg:text-lg sm:text-lg">
                        Purchase History
                    </Typography.Text>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Input
                        placeholder="Search"
                        suffix={<SearchOutlined />}
                        allowClear
                        type="text"
                        maxLength={100}
                        value={filter.search}
                        onChange={handleSearch}
                    />
                </Col>
            </Row>
            {tableContent}
            <Pagination
                current={filter.start}
                onChange={handlePageChange}
                size="small"
                className="mt-10 text-center"
                total={count}
            />
        </Flex>
    );
};

export default OrderHistoryTableMobile;
