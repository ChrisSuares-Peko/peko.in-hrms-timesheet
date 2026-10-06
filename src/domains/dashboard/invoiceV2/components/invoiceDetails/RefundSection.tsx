import { useState } from 'react';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Flex, Progress, Table, Typography } from 'antd';
import dayjs from 'dayjs';

import AddRefundModal, { AddRefundValues } from './AddRefundModal';
import { RefundRecord } from '../../api/invoices';
import { PAYMENT_MODE_OPTIONS } from '../../constants/settings';

interface Props {
    creditNoteAmount: number;
    totalRefunded: number;
    refundDue: number;
    refundHistory: RefundRecord[];
    onAddRefund: (values: AddRefundValues) => Promise<boolean>;
    onDeleteRefund: (refundId: number) => Promise<boolean>;
    isLoading: boolean;
}

const fmt = (amount: number) => `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const modeLabel = (value: string) =>
    PAYMENT_MODE_OPTIONS.find(o => o.value === value)?.label ?? value;

const RefundSection = ({
    creditNoteAmount,
    totalRefunded,
    refundDue,
    refundHistory,
    onAddRefund,
    onDeleteRefund,
    isLoading,
}: Props) => {
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    const refundedPercent =
        creditNoteAmount > 0 ? Math.min((totalRefunded / creditNoteAmount) * 100, 100) : 0;
    const hasRefundDue = refundDue > 0;

    const handleSave = async (values: AddRefundValues) => {
        setSaving(true);
        const ok = await onAddRefund(values);
        setSaving(false);
        if (ok) setModalOpen(false);
        return ok;
    };

    const columns = [
        {
            title: 'Date',
            dataIndex: 'refundDate',
            key: 'refundDate',
            render: (val: string) => (
                <Typography.Text className="text-sm text-gray-700">
                    {dayjs(val).format('MMM DD, YYYY')}
                </Typography.Text>
            ),
        },
        {
            title: 'Amount',
            dataIndex: 'amount',
            key: 'amount',
            render: (val: string) => (
                <Typography.Text className="text-sm font-medium text-gray-800">
                    {fmt(Number(val))}
                </Typography.Text>
            ),
        },
        {
            title: 'Mode',
            dataIndex: 'refundMode',
            key: 'refundMode',
            render: (val: string) => (
                <Typography.Text className="text-sm font-medium text-amber-600">
                    {modeLabel(val)}
                </Typography.Text>
            ),
        },
        {
            title: 'Reference',
            dataIndex: 'referenceId',
            key: 'referenceId',
            render: (val?: string | null) => (
                <Typography.Text className="text-sm text-gray-700">{val || '—'}</Typography.Text>
            ),
        },
        {
            title: 'Note',
            dataIndex: 'notes',
            key: 'notes',
            render: (val?: string | null) => (
                <Typography.Text className="text-sm text-gray-500">{val || '—'}</Typography.Text>
            ),
        },
        {
            title: 'Action',
            key: 'actions',
            width: 60,
            render: (_: any, record: RefundRecord) => (
                <Flex gap={4} align="center" justify="flex-end">
                    <Button
                        type="text"
                        size="small"
                        disabled={record.isDeleted}
                        icon={<DeleteOutlined className="text-red-400" />}
                        onClick={() => onDeleteRefund(record.id)}
                    />
                </Flex>
            ),
        },
    ];

    return (
        <Card
            className="w-full rounded-2xl"
            styles={{ body: { padding: 0, paddingBottom: 15, paddingLeft: 5, paddingRight: 5 } }}
        >
            <Flex vertical gap={12} className="px-5 pt-5">
                <Flex justify="space-between" align="center" gap={8} wrap>
                    <Flex vertical gap={2}>
                        <Typography.Text className="text-xl font-semibold">Refunds</Typography.Text>
                        <Typography.Text className="text-sm text-gray-500">
                            Track cash refunded back to the customer for this invoice
                        </Typography.Text>
                    </Flex>
                    <Button
                        type="primary"
                        danger
                        icon={<PlusOutlined />}
                        disabled={!hasRefundDue}
                        onClick={() => setModalOpen(true)}
                    >
                        Record Refund
                    </Button>
                </Flex>

                <Card className="rounded-lg" styles={{ body: { padding: '14px 14px' } }}>
                    <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2 min-[420px]:gap-1 sm:gap-4 mb-4">
                        <Flex vertical gap={4} className="min-w-0">
                            <Typography.Text className="text-[9px] sm:text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                                Credit Note Amount
                            </Typography.Text>
                            <Typography.Text className="text-xs sm:text-sm font-semibold text-gray-800 whitespace-nowrap">
                                {fmt(creditNoteAmount)}
                            </Typography.Text>
                        </Flex>
                        <Flex vertical gap={4} className="min-w-0">
                            <Typography.Text className="text-[9px] sm:text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                                Refunded
                            </Typography.Text>
                            <Typography.Text className="text-xs sm:text-sm font-semibold text-teal-600 whitespace-nowrap">
                                {fmt(totalRefunded)}
                            </Typography.Text>
                        </Flex>
                        <Flex vertical gap={4} className="min-w-0">
                            <Typography.Text className="text-[9px] sm:text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                                Refund Due
                            </Typography.Text>
                            <Typography.Text className="text-xs sm:text-sm font-semibold text-amber-600 whitespace-nowrap">
                                {fmt(refundDue)}
                            </Typography.Text>
                        </Flex>
                    </div>

                    <Progress
                        percent={refundedPercent}
                        showInfo={false}
                        strokeColor="#d97706"
                        trailColor="#e5e7eb"
                        strokeWidth={6}
                    />
                </Card>
            </Flex>

            {refundHistory.length === 0 && !isLoading ? (
                <Flex vertical align="center" gap={4} className="px-5 py-6">
                    <Typography.Text className="text-sm text-gray-500">
                        No refunds recorded yet
                    </Typography.Text>
                    {hasRefundDue && (
                        <button
                            type="button"
                            onClick={() => setModalOpen(true)}
                            className="text-sm text-red-500 font-medium bg-transparent border-0 p-0 cursor-pointer"
                        >
                            Record the first refund
                        </button>
                    )}
                </Flex>
            ) : (
                <div className="mt-3">
                    <Table
                        dataSource={refundHistory.map(r => ({ ...r, key: r.id }))}
                        columns={columns}
                        pagination={false}
                        size="small"
                        scroll={{ x: 600, ...(refundHistory.length > 3 ? { y: 220 } : {}) }}
                        rowClassName={(record: RefundRecord) =>
                            record.isDeleted ? 'opacity-40 pointer-events-none' : ''
                        }
                    />
                </div>
            )}

            <AddRefundModal
                open={modalOpen}
                maxAmount={refundDue}
                saving={saving}
                onClose={() => setModalOpen(false)}
                onSave={handleSave}
            />
        </Card>
    );
};

export default RefundSection;
