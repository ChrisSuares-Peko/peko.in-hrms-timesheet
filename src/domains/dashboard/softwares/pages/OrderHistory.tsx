import { Flex } from 'antd';

import OrderHistorySkeleton from '../components/common/skeletons/orderHistory';
import { Header, OrderTable } from '../components/orderHistory';
import useOrderHistory from '../hooks/order/useOrderHistory';

export default function PurchaseTable() {
    const {
        isLoading,
        orderDetails,
        handleFilterChange,
        handleSearchChange,
        handlePagination,
        filter,
        total,
    } = useOrderHistory();
    if (isLoading) {
        return <OrderHistorySkeleton />;
    }
    return (
        <Flex vertical gap={20}>
            <Header
                handleFilterChange={handleFilterChange}
                handleSearchChange={handleSearchChange}
                filter={filter}
            />
            <OrderTable
                isLoading={isLoading}
                orderDetails={orderDetails}
                filter={filter}
                handlePagination={handlePagination}
                total={total}
            />
        </Flex>
    );
}
