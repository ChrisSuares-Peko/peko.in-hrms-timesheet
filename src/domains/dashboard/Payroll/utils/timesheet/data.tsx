import { Avatar, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import StatusTag, { type StatusTone } from '@src/components/peko/StatusTag';

export type AttendanceStatus = 'Present' | 'Late' | 'Absent' | 'On Leave' | 'Half Day';

export interface TimesheetRecord {
    key: string;
    name: string;
    email: string;
    initials: string;
    profileImage?: string | null;
    color: string;
    date: string;
    shift: string;
    checkIn: string;
    checkOut: string;
    workHrs: string;
    otHours?: string;
    status: AttendanceStatus;
    lateMinutes?: number;
    employeeId: string;
    rawDate: string;
    rawCheckIn: string;
    rawCheckOut: string;
    rawStatus: string;
    rawNotes: string;
}

// PROTOTYPE-SETUP (Design update, rule 9): attendance statuses use the shared Peko status tag.
const STATUS_TONE: Record<AttendanceStatus, StatusTone> = {
    Present: 'success',
    Late: 'warning',
    Absent: 'error',
    'On Leave': 'leave',
    'Half Day': 'warning',
};

const renderStatusTag = (status: TimesheetRecord['status']) => <StatusTag tone={STATUS_TONE[status]}>{status}</StatusTag>;

export const timesheetPrimaryColumns: ColumnsType<TimesheetRecord> = [
    {
        title: 'Name',
        dataIndex: 'name',
        width: '50%',
        render: (_, record) => (
            <div className="flex items-center gap-2">
                <Avatar src={record.profileImage || undefined} style={{ backgroundColor: '#FFF5F5', color: '#FF9F9F', flexShrink: 0 }}>
                    {!record.profileImage && record.initials}
                </Avatar>
                <div className="flex flex-col min-w-0">
                    <Typography.Text className="font-medium text-sm" ellipsis>{record.name}</Typography.Text>
                    <Typography.Text className="text-xs text-gray-400" ellipsis>{record.email}</Typography.Text>
                </div>
            </div>
        ),
    },
    { title: 'Date', dataIndex: 'date', width: '25%' },
    { title: 'Status', dataIndex: 'status', width: '25%', render: renderStatusTag },
];

export const timesheetExpandedRow = (record: TimesheetRecord) => (
    <div className="flex flex-wrap gap-x-8 gap-y-2 bg-gray-50 px-4 py-3 rounded">
        <div>
            <Typography.Text className="text-xs text-gray-400 block">Shift</Typography.Text>
            <Typography.Text className="text-sm">{record.shift}</Typography.Text>
        </div>
        <div>
            <Typography.Text className="text-xs text-gray-400 block">Check-In</Typography.Text>
            <Typography.Text className="text-sm">{record.checkIn}</Typography.Text>
        </div>
        <div>
            <Typography.Text className="text-xs text-gray-400 block">Check-Out</Typography.Text>
            <Typography.Text className="text-sm">{record.checkOut}</Typography.Text>
        </div>
        <div>
            <Typography.Text className="text-xs text-gray-400 block">Work Hrs</Typography.Text>
            <Typography.Text className="text-sm">{record.workHrs}</Typography.Text>
        </div>
    </div>
);

export const timesheetColumns: ColumnsType<TimesheetRecord> = [
    {
        title: 'Name',
        dataIndex: 'name',
        render: (_, record) => (
            <div className="flex items-center gap-3">
                <Avatar src={record.profileImage || undefined} style={{ backgroundColor: '#FFF5F5', color: '#FF9F9F', flexShrink: 0 }}>
                    {!record.profileImage && record.initials}
                </Avatar>
                <div className="flex flex-col">
                    <Typography.Text className="font-medium text-sm">{record.name}</Typography.Text>
                    <Typography.Text className="text-xs text-gray-400">{record.email}</Typography.Text>
                </div>
            </div>
        ),
    },
    { title: 'Date', dataIndex: 'date' },
    { title: 'Shift', dataIndex: 'shift' },
    { title: 'Check-In', dataIndex: 'checkIn' },
    { title: 'Check-Out', dataIndex: 'checkOut' },
    { title: 'Work Hrs', dataIndex: 'workHrs' },
    { title: 'Status', dataIndex: 'status', render: renderStatusTag },
];
