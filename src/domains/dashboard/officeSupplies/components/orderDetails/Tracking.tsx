import type { FC } from 'react';

import { RightOutlined } from '@ant-design/icons';
import { Button, Col, Flex, Row, Typography } from 'antd';

import { useAppSelector } from '@src/hooks/store';
import useScreenSize from '@src/hooks/useScreenSize';

interface TrackingProps {}

const Tracking: FC<TrackingProps> = () => {
    const screens = useScreenSize();
    const trackingDetails = useAppSelector(state => state.reducer.orderDetails.trackingDetails);

    const handleVisitSite = () => {
        if (trackingDetails && trackingDetails.trackingWebsite) {
            let url = trackingDetails.trackingWebsite;
            // Check if the URL starts with 'http://' or 'https://', if not, prepend 'https://'
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = `https://${url}`;
            }
            window.open(url, '_blank');
        }
    };

    return (
        trackingDetails && (
            <Flex vertical>
                <Typography.Title level={4}>Track your shipping</Typography.Title>
                <Row className="border rounded-lg flex justify-between items-center p-4 mt-10 mb-40">
                    <Col>
                        <Flex gap={6} vertical>
                            <Typography.Text className=" text-gray text-base md:text-lg">
                                Courier: {trackingDetails?.deliveryPartner}
                            </Typography.Text>
                            <Typography.Text className=" text-gray text-base md:text-lg">
                                Tracking Number: {trackingDetails?.trackingNumber}
                            </Typography.Text>
                        </Flex>
                    </Col>
                    <Col>
                        {screens.md ? (
                            <Button onClick={handleVisitSite} className="px-10" danger>
                                Visit Site
                            </Button>
                        ) : (
                            <Button
                                onClick={handleVisitSite}
                                className="px-10"
                                icon={<RightOutlined />}
                            />
                        )}
                    </Col>
                </Row>
            </Flex>
        )
    );
};

export default Tracking;
