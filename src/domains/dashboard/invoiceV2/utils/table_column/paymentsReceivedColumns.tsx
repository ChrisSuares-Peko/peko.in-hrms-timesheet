import { Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import { TABLE_HEADER_STYLE } from './invoiceColumns';
import { PAYMENT_MODE_OPTIONS } from '../../constants/settings';
import { PaymentsReceivedRow } from '../../types/paymentsReceived';
import { formatCurrencyAmount, formatDate } from '../helperFunctions';

export { TABLE_HEADER_STYLE };

const modeLabel = (value: string) =>
    PAYMENT_MODE_OPTIONS.find(o => o.value === value)?.label ?? value;

const TYPE_STYLE: Record<PaymentsReceivedRow['type'], string> = {
    payment: 'bg-[#ECFDF5] text-[#43B75D]',
    refund: 'bg-[#FEF3C7] text-[#D97706]',
};

const getPaymentsReceivedColumns = (): ColumnsType<PaymentsReceivedRow> => [
    {
        title: 'Date',
        dataIndex: 'date',
        key: 'date',
        render: (date: string) => (
            <Typography.Text className="text-[#42526D] text-sm">{formatDate(date)}</Typography.Text>
        ),
    },
    {
        title: 'Invoice',
        dataIndex: 'invoiceNumber',
        key: 'invoiceNumber',
        render: (num, record) => (
            <Typography.Text className="text-[#42526D] text-sm font-medium">
                {record.prefix ? `${record.prefix}${num}` : num}
            </Typography.Text>
        ),
    },
    {
        title: 'Customer',
        dataIndex: 'customerName',
        key: 'customerName',
        render: (name: string) => (
            <Typography.Text className="text-[#42526D] text-sm">{name}</Typography.Text>
        ),
    },
    {
        title: 'Type',
        dataIndex: 'type',
        key: 'type',
        render: (type: PaymentsReceivedRow['type']) => (
            <Tag
                className={`rounded-full text-xs font-medium border-0 px-3 py-1 ${TYPE_STYLE[type]}`}
            >
                {type === 'payment' ? 'Payment' : 'Refund'}
            </Tag>
        ),
    },
    {
        title: 'Amount',
        dataIndex: 'amount',
        key: 'amount',
        align: 'right',
        render: (amount: string, record) => (
            <Typography.Text
                className="text-sm font-semibold"
                style={{ color: record.type === 'payment' ? '#43B75D' : '#D97706' }}
            >
                {record.type === 'refund' ? '− ' : '+ '}
                {formatCurrencyAmount(amount, record.currency)}
            </Typography.Text>
        ),
    },
    {
        title: 'Mode',
        dataIndex: 'mode',
        key: 'mode',
        render: (mode: string) => (
            <Typography.Text className="text-[#42526D] text-sm">{modeLabel(mode)}</Typography.Text>
        ),
    },
    {
        title: 'Reference',
        dataIndex: 'referenceId',
        key: 'referenceId',
        render: (val?: string | null) => (
            <Typography.Text className="text-[#94A3B8] text-sm">{val || '—'}</Typography.Text>
        ),
    },
    {
        title: 'Receipt No.',
        dataIndex: 'receiptNo',
        key: 'receiptNo',
        render: (val?: string | null) => (
            <Typography.Text className="text-[#94A3B8] text-xs">{val || '—'}</Typography.Text>
        ),
    },
];

export default getPaymentsReceivedColumns;
