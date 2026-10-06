import React from 'react';

import { Flex, Typography } from 'antd';
import { ReactSVG } from 'react-svg';

interface IconCardProps {
    icon: any;
    title: string;
    onClick?: () => void;
}

const { Text } = Typography;

const BbpsIconCard: React.FC<IconCardProps> = ({ icon, title, onClick }) => (
    <Flex
        vertical
        gap={18}
        align="center"
        role="button"
        onClick={onClick}
        className="w-[90px] transition duration-300 transform cursor-pointer hover:scale-110"
    >
        <Flex
            className="w-[90px] h-[90px] shrink-0 bg-bgIconCard rounded-3xl"
            align="center"
            justify="center"
        >
            <ReactSVG src={icon} />
        </Flex>
        <Text className="text-sm text-center whitespace-nowrap">{title}</Text>
    </Flex>
);

export default React.memo(BbpsIconCard);
