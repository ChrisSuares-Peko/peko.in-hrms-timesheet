// PROTOTYPE-SETUP: "ESS - Manager" tab of the prototype — placeholder until its screens are specced.
import { Flex, Result, Typography } from 'antd';

const { Title } = Typography;

const EssManagerPage = () => (
    <Flex vertical gap={8} className="w-full">
        <Title level={4} className="!mb-0">
            ESS - Manager
        </Title>
        <Result
            status="info"
            title="Manager screens coming soon"
            subTitle="This tab is a placeholder in the prototype. Team approvals, attendance and leave views for managers will live here."
        />
    </Flex>
);

export default EssManagerPage;
