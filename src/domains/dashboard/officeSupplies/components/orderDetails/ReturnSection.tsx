import { useState, type FC } from 'react';

import { Flex, Typography } from 'antd';

import { useAppSelector } from '@src/hooks/store';

import { OrderedProduct } from '../../types/orderHistory';
import ProductReturnModal from '../modals/ProductReturnModal';
import ToolTip from '../ToolTip';

interface ReturnSectionProps {
    product: OrderedProduct;
}

const ReturnSection: FC<ReturnSectionProps> = ({ product }) => {
    const orderDetails = useAppSelector(state => state.reducer.orderDetails.orderDetails);
    const orderId = orderDetails?.id!;
    const orderStatus = orderDetails?.ecomOrderStatus || 'PENDING';
    const isDelivered = ['COMPLETED', 'DELIVERED'].includes(orderStatus);

    const [productId, setProductId] = useState<number>();
    const [isProductReturnModalVisible, setProductReturnModalVisible] = useState(false);

    const handleProductReturn = (id: number) => {
        setProductId(id);
        setProductReturnModalVisible(true);
    };
    return (
        <>
            {isDelivered && !product?.status ? (
                <Typography.Text
                    onClick={() => handleProductReturn(product.productId)}
                    className="text-green-600 cursor-pointer"
                >
                    Request for return
                </Typography.Text>
            ) : (
                <>
                    {isDelivered && product?.status === 'Return Requested' && (
                        <Typography.Text className="text-orange-500">
                            {product?.status} <ToolTip message={product?.reason} />{' '}
                        </Typography.Text>
                    )}
                    {isDelivered && product?.status === 'Return Initiated' && (
                        <Flex gap={10}>
                            <Typography.Text className="text-yellow-500">
                                {product?.status} <ToolTip message={product?.reason} />
                            </Typography.Text>
                            <Typography.Text className="">
                                Your item pickup date: {product?.returnPickUpDate}
                            </Typography.Text>
                        </Flex>
                    )}
                    {isDelivered && product?.status === 'Return Completed' && (
                        <Typography.Text className="text-green-600">
                            {product?.status} <ToolTip message={product?.reason} />
                        </Typography.Text>
                    )}
                    {isDelivered && product?.status === 'Return Rejected' && (
                        <Typography.Text className="text-red-600">
                            {product?.status} <ToolTip message={product?.reason} />
                        </Typography.Text>
                    )}
                </>
            )}
            <ProductReturnModal
                orderId={orderId}
                productId={productId!}
                visible={isProductReturnModalVisible}
                onCancel={() => setProductReturnModalVisible(false)}
            />
        </>
    );
};

export default ReturnSection;
