// PROTOTYPE-SETUP: slim "viewing as" strip at the top of an ESS tab, so a demo makes clear which
// employee each tab represents.
import { Avatar, Flex, Typography } from 'antd';

import {
    MockEmployee,
    directReportsOf,
    managerOf,
} from '@src/prototype/mocks/data/employees';

const { Text } = Typography;

type PersonaBannerProps = {
    employee: MockEmployee;
    label: string;
};

const initials = (e: MockEmployee) => `${e.firstName[0]}${e.lastName[0]}`;

export default function PersonaBanner({ employee, label }: PersonaBannerProps) {
    const manager = managerOf(employee);
    const reports = directReportsOf(employee.employeeId);
    let relation = manager ? `Reports to ${manager.fullName}` : '';
    if (reports.length) {
        relation = `Manages ${reports.length} direct report${reports.length === 1 ? '' : 's'}`;
    }

    return (
        <Flex
            align="center"
            gap={10}
            wrap="wrap"
            className="w-full px-3 py-2 mb-3 rounded-lg border border-solid border-gray-200 bg-gray-50"
        >
            <Avatar size="small" style={{ backgroundColor: 'var(--ant-color-primary, #1677ff)' }}>
                {initials(employee)}
            </Avatar>
            <Text className="text-sm">
                {label}: viewing as <Text strong>{employee.fullName}</Text>
            </Text>
            <Text type="secondary" className="text-sm">
                {employee.designation}, {employee.department} · {employee.employeeId}
                {relation ? ` · ${relation}` : ''}
            </Text>
        </Flex>
    );
}
