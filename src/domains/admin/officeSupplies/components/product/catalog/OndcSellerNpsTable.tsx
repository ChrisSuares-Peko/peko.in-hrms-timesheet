import { Flex, Switch, Typography } from 'antd';
import { TableProps } from 'antd/lib';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import GenericTable from '@components/atomic/GenericTable';

import { AdminOndcSellerNp } from '../../../types/ondcSellerNp';

dayjs.extend(relativeTime);

type Props = {
    tableData: AdminOndcSellerNp[];
    isLoading: boolean;
    onTableChange?: TableProps<AdminOndcSellerNp>['onChange'];
    onToggleEnabled: (id: number, enabled: boolean) => void;
};

const OndcSellerNpsTable = ({ tableData, isLoading, onTableChange, onToggleEnabled }: Props) => {
    const columns = [
        {
            title: 'Seller NP',
            key: 'npName',
            width: 220,
            render: (_: unknown, r: AdminOndcSellerNp) => (
                <Flex vertical gap={2}>
                    <Typography.Text className="text-[#101828] font-medium">
                        {r.npName || '—'}
                    </Typography.Text>
                    <Typography.Text className="font-mono text-[12px] text-[#667085]">
                        {r.bppId}
                    </Typography.Text>
                </Flex>
            ),
        },
        {
            title: 'BPP URI',
            dataIndex: 'bppUri',
            key: 'bppUri',
            width: 280,
            render: (v: string | null) => (
                <Typography.Text className="font-mono text-[12px] text-[#475156]">
                    {v || '—'}
                </Typography.Text>
            ),
        },
        {
            title: 'Last seen',
            dataIndex: 'lastSeenAt',
            key: 'lastSeenAt',
            width: 160,
            render: (iso: string | null) => (iso ? dayjs(iso).fromNow() : '—'),
        },
        {
            title: 'Enabled',
            key: 'enabled',
            width: 110,
            render: (_: unknown, r: AdminOndcSellerNp) => (
                <Switch
                    checked={r.enabled}
                    onChange={checked => onToggleEnabled(r.id, checked)}
                    style={{ backgroundColor: r.enabled ? '#22c55e' : undefined }}
                />
            ),
        },
    ];

    return (
        <GenericTable
            rowKey="id"
            columns={columns}
            dataSource={tableData}
            loading={isLoading}
            pagination={false}
            onChange={onTableChange}
            scroll={{ x: 900 }}
        />
    );
};

export default OndcSellerNpsTable;
