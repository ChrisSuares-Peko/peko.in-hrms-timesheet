import type { FC } from 'react';

import { Flex, Row, Typography, Space, Image } from 'antd';

import { useAppSelector } from '@src/hooks/store';

import ReturnSection from './ReturnSection';

const { Text } = Typography;

interface ProductsListingSmProps {}

const ProductsListingSm: FC<ProductsListingSmProps> = () => {
    const orderedProducts = useAppSelector(state => state.reducer.orderDetails.orderedProducts);

    return (
        <Flex vertical>
            {orderedProducts.map((product, i) => (
                <Flex
                    key={i}
                    align="center"
                    justify="space-between"
                    className="bg-bgF7F9Fb p-2 mt-6"
                >
                    <Space direction="vertical">
                        <Row>
                            {/* <Text className="font-medium text-xs">Delivered on: Dec 23, 2023</Text> */}
                            <Text className="text-xs">{product.productName}</Text>
                        </Row>
                        <Flex vertical gap={10}>
                            <Text className="text-xs">Total Price : </Text>
                            <Text className="text-xs">
                                {' '}
                                ₹ {product.totalPrice} ( {product.productQuantity} *{' '}
                                {product.totalPrice / product.productQuantity} ){' '}
                            </Text>
                            <ReturnSection product={product} />
                        </Flex>
                    </Space>
                    <Image
                        src={product.image}
                        alt="Product"
                        style={{ minWidth: 100, minHeight: 100 }}
                        width={100}
                        height={100}
                        className="object-cover "
                    />
                </Flex>
            ))}
        </Flex>
    );
};

export default ProductsListingSm;
