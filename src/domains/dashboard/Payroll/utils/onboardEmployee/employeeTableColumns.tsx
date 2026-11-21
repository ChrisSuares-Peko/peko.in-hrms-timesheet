// EmployeeTableColumns.tsx
import { InfoCircleFilled } from '@ant-design/icons';
import { Avatar, Flex, Tooltip, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import moment from 'moment';
import { NavigateFunction } from 'react-router-dom';

import StatusTag, { type StatusTone } from '@src/components/peko/StatusTag';
import { paths } from '@src/routes/paths';

import ViewMore from '../../components/ViewMore';
import { Employee } from '../../types/types';

type ColumnProps = {
    employeeStatus: 'active' | 'past';
    onDelete: (id: string) => void;
    navigate: NavigateFunction;
    onOffboard: (record: Employee) => void;
};

const OFFBOARDING_STATUS_MAP: Record<string, string> = {
    RESIGNATION: 'resigned',
    SUSPENSION: 'suspended',
};

// PROTOTYPE-SETUP (Design update, rule 9): employee statuses use the shared Peko status tag.
const STATUS_TAG_CONFIG: Record<string, { tone: StatusTone; label: string }> = {
    active: { tone: 'success', label: 'Active' },
    inprobation: { tone: 'warning', label: 'In Probation' },
    confirmed: { tone: 'success', label: 'Confirmed' },
    suspended: { tone: 'warning', label: 'Suspended' },
    resigned: { tone: 'error', label: 'Resigned' },
};

const getInitials = (name: string): string =>
    name
        .split(' ')
        .map(word => word[0])
        .join('')
        .substring(0, 3)
        .toUpperCase();

export const getEmployeeTableColumns = ({
    employeeStatus,
    onDelete,
    navigate,
    onOffboard,
}: ColumnProps): TableColumnsType<Employee> => [
    {
        title: 'Name',
        dataIndex: ['personalInformation', 'fullName'],
        sorter: true,
        render: (text: string, record) => (
            <Flex gap={10}>
                <Flex
                    align="center"
                    onClick={() =>
                        navigate(paths.payroll.employeeProfile, {
                            state: { employeeId: record.id },
                        })
                    }
                    // style={{ cursor: record.isCompleted ? 'pointer' : 'default' }}
                    style={{ cursor: 'pointer' }} // right now letting the user visit the profile without checking the condition
                >
                    {record.profileImage ? (
                        <Avatar
                            src={record.profileImage}
                            style={{ backgroundColor: '#fde3cf', color: '#f56a00' }}
                        />
                    ) : (
                        <Avatar style={{ backgroundColor: '#fde3cf', color: 'red' }}>
                            {getInitials(text)}
                        </Avatar>
                    )}
                </Flex>

                <Flex
                    vertical
                    justify="center"
                    onClick={() =>
                        navigate(paths.payroll.employeeProfile, {
                            state: { employeeId: record.id },
                        })
                    }
                    style={{ cursor: 'pointer' }}
                >
                    <Typography.Text>
                        {text}{' '}
                        {record.offBoardingInformation?.lastWorkingDay &&
                            employeeStatus === 'active' &&
                            moment(record.offBoardingInformation.lastWorkingDay).isSameOrAfter(
                                moment(),
                                'day'
                            ) && (
                                <Tooltip
                                    title={`This employee is under notice period. Last working day: ${moment(
                                        record.offBoardingInformation?.lastWorkingDay
                                    ).format('YYYY-MM-DD')}`}
                                >
                                    <InfoCircleFilled
                                        style={{
                                            marginLeft: '8px',
                                            color: '#1890ff',
                                            cursor: 'pointer',
                                        }}
                                    />
                                </Tooltip>
                            )}
                    </Typography.Text>
                    {record.personalInformation?.email && (
                        <Typography.Text>{record.personalInformation.email}</Typography.Text>
                    )}
                </Flex>
            </Flex>
        ),
    },
    {
        title: 'Employee ID',
        dataIndex: ['employeeInformation', 'employeeId'],
        sorter: true,
    },
    {
        title: 'Designation & Department',
        dataIndex: 'role',
        render: (_, record) => (
            <Flex vertical>
                <Typography.Text>{record.employeeInformation?.designation || '-'}</Typography.Text>
                <Typography.Text type="secondary" className="text-xs">
                    {record?.employeeInformation?.department?.departmentName || '-'}
                </Typography.Text>
            </Flex>
        ),
    },
    {
        title: 'Join Date',
        dataIndex: ['employeeInformation', 'dateOfJoin'],
        sorter: true,
        render: text => (text ? moment(text).format('YYYY-MM-DD') : '-'),
    },
    {
        title: 'Status',
        dataIndex: ['employeeInformation', 'employeeStatus'],
        key: 'employeeStatus',
        sorter: true,
        render: (_, record) => {
            const offBoardingType = record?.offBoardingInformation?.offBoardingType;

            let statusKey: string | undefined;

            if (offBoardingType) {
                // Use offboarding status
                statusKey =
                    OFFBOARDING_STATUS_MAP[offBoardingType] || offBoardingType.toLowerCase();
            } else {
                // Fallback to employee status
                statusKey = record?.employeeInformation?.employeeStatus?.toLowerCase();
            }

            if (!statusKey) return '-';

            const status = STATUS_TAG_CONFIG[statusKey];

            if (!status) return statusKey;

            return <StatusTag tone={status.tone}>{status.label}</StatusTag>;
        },
    },
    {
        title: 'ESS Status',
        dataIndex: 'isEss',
        render: (isEss?: boolean) => isEss ? <StatusTag tone="success">Live</StatusTag> : <StatusTag tone="error">Not Live</StatusTag>,
    },
    {
        title: employeeStatus === 'past' ? 'Last Working Day' : null,
        dataIndex: ['offBoardingInformation', 'lastWorkingDay'],
        render: text =>
            employeeStatus === 'past' && text ? moment(text).format('YYYY-MM-DD') : null,
    },
    {
        title: 'Mobile Number',
        dataIndex: ['personalInformation', 'mobileNo'],
    },
    {
        title: 'Action',
        dataIndex: 'id',
        render: (_, record) => {
            const list = [
                {
                    label: 'Update Profile',
                    path: paths.payroll.employeeProfile,
                    id: record.id,
                },
                {
                    label: 'Remove Profile',
                    action: () => onDelete(record.id),
                },
            ];
            if (!record.offBoardingInformation?.lastWorkingDay) {
                list.push({
                    label: 'Offboard Employee',
                    action: () => onOffboard(record),
                });
            }

            return <ViewMore list={list} />;
        },
    },
];
